import { describe, it, expect, vi, beforeAll } from "vitest";

import type { Config } from "../src/config.js";
import { DataApiService } from "../src/data-api.service.js";
import { DecryptionError, SdkError } from "../src/errors.js";
import type { EncryptedEnvelopeDTO } from "../src/models.js";

vi.mock("@microsoft/fetch-event-source", () => ({
    fetchEventSource: vi.fn(),
}));

import { fetchEventSource } from "@microsoft/fetch-event-source";

const mockedFetchEventSource = vi.mocked(fetchEventSource);

// ---- Crypto helpers ----

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function bytesToBase64(bytes: Uint8Array): string {
    const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i] ?? 0;
        const b = bytes[i + 1] ?? 0;
        const c = bytes[i + 2] ?? 0;
        const triple = (a << 16) | (b << 8) | c;
        out += alphabet[(triple >> 18) & 0x3f];
        out += alphabet[(triple >> 12) & 0x3f];
        out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 0x3f] : "=";
        out += i + 2 < bytes.length ? alphabet[triple & 0x3f] : "=";
    }
    return out;
}

interface KeyFixture {
    cryptoKey: CryptoKey;
    materialBase64: string;
}

async function generateKeyFixture(): Promise<KeyFixture> {
    const cryptoKey = await globalThis.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const exported = await globalThis.crypto.subtle.exportKey("raw", cryptoKey);
    return {
        cryptoKey,
        materialBase64: bytesToBase64(new Uint8Array(exported)),
    };
}

async function encryptWith(
    key: CryptoKey,
    payload: unknown
): Promise<{ encryptedHex: string; ivHex: string; authTagHex: string }> {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await globalThis.crypto.subtle.encrypt(
        { name: "AES-GCM", iv, tagLength: 128 },
        key,
        encoded
    );
    const bytes = new Uint8Array(encrypted);
    return {
        encryptedHex: bytesToHex(bytes.slice(0, -16)),
        ivHex: bytesToHex(iv),
        authTagHex: bytesToHex(bytes.slice(-16)),
    };
}

async function makeEnvelope(
    key: CryptoKey,
    overrides?: Partial<EncryptedEnvelopeDTO>
): Promise<EncryptedEnvelopeDTO> {
    const { encryptedHex, ivHex, authTagHex } = await encryptWith(key, {
        value: 23.5,
        unit: "°C",
    });
    return {
        gatewayId: "gw-1",
        sensorId: "sensor-1",
        sensorType: "temperature",
        timestamp: "2026-03-23T09:58:00.000Z",
        encryptedData: encryptedHex,
        iv: ivHex,
        authTag: authTagHex,
        keyVersion: 1,
        ...overrides,
    };
}

// ---- HTTP routing helpers ----

type Fetcher = NonNullable<Config["fetcher"]>;
type FetchResponse = Awaited<ReturnType<Fetcher>>;

function makeJsonResponse(body: unknown, status: number): FetchResponse {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
    } as FetchResponse;
}

function createRoutingFetcher(routes: Record<string, () => unknown>): Fetcher {
    return ((input: unknown): Promise<FetchResponse> => {
        let url = "";
        if (typeof input === "string") {
            url = input;
        } else if (input && typeof input === "object") {
            const maybe = input as { href?: unknown; url?: unknown };
            if (typeof maybe.href === "string") url = maybe.href;
            else if (typeof maybe.url === "string") url = maybe.url;
        }
        for (const [pattern, handler] of Object.entries(routes)) {
            if (url.includes(pattern)) {
                return Promise.resolve(makeJsonResponse(handler(), 200));
            }
        }
        return Promise.resolve(makeJsonResponse({ message: "Not found" }, 404));
    }) as Fetcher;
}

function createConfig(
    routes: Record<string, () => unknown>,
    overrides?: Partial<Config>
): Config {
    return {
        baseUrl: "https://api.example.com",
        tokenProvider: () => "test-token",
        fetcher: createRoutingFetcher(routes),
        ...overrides,
    };
}

// ---- Tests ----

describe("DataApiService integration", () => {
    let gw1v1: KeyFixture;
    let gw1v2: KeyFixture;
    let gw2v1: KeyFixture;

    beforeAll(async () => {
        [gw1v1, gw1v2, gw2v1] = await Promise.all([
            generateKeyFixture(),
            generateKeyFixture(),
            generateKeyFixture(),
        ]);
    });

    describe("key caching", () => {
        it("fetches a key exactly once for multiple envelopes with the same gateway and version", async () => {
            const envelopes = await Promise.all([
                makeEnvelope(gw1v1.cryptoKey),
                makeEnvelope(gw1v1.cryptoKey),
                makeEnvelope(gw1v1.cryptoKey),
            ]);

            let keyFetchCount = 0;
            const config = createConfig({
                "keys?id=gw-1": () => {
                    keyFetchCount++;
                    return [
                        {
                            gateway_id: "gw-1",
                            key_material: gw1v1.materialBase64,
                            key_version: 1,
                        },
                    ];
                },
                "/measures/query": () => ({ data: envelopes, hasMore: false }),
            });

            const service = new DataApiService(config);
            const results = await service.queryMeasures({
                from: "2026-01-01T00:00:00Z",
                to: "2026-01-02T00:00:00Z",
            });

            expect(results.data).toHaveLength(3);
            expect(keyFetchCount).toBe(1);
        });

        it("fetches separate keys for different key versions of the same gateway", async () => {
            const envelopeV1 = await makeEnvelope(gw1v1.cryptoKey, {
                keyVersion: 1,
            });
            const envelopeV2 = await makeEnvelope(gw1v2.cryptoKey, {
                keyVersion: 2,
            });

            let keyFetchCount = 0;
            const config = createConfig({
                "keys?id=gw-1": () => {
                    keyFetchCount++;
                    return [
                        {
                            gateway_id: "gw-1",
                            key_material: gw1v1.materialBase64,
                            key_version: 1,
                        },
                        {
                            gateway_id: "gw-1",
                            key_material: gw1v2.materialBase64,
                            key_version: 2,
                        },
                    ];
                },
                "/measures/query": () => ({
                    data: [envelopeV1, envelopeV2],
                    hasMore: false,
                }),
            });

            const service = new DataApiService(config);
            const results = await service.queryMeasures({
                from: "2026-01-01T00:00:00Z",
                to: "2026-01-02T00:00:00Z",
            });

            expect(results.data).toHaveLength(2);
            expect(results.data[0]?.value).toBe(23.5);
            expect(results.data[1]?.value).toBe(23.5);
            // Each version miss triggers a separate key fetch
            expect(keyFetchCount).toBe(2);
        });

        it("caches keys independently per gateway", async () => {
            const envelopeGw1 = await makeEnvelope(gw1v1.cryptoKey, {
                gatewayId: "gw-1",
            });
            const envelopeGw2 = await makeEnvelope(gw2v1.cryptoKey, {
                gatewayId: "gw-2",
            });

            let gw1FetchCount = 0;
            let gw2FetchCount = 0;
            const config = createConfig({
                "keys?id=gw-1": () => {
                    gw1FetchCount++;
                    return [
                        {
                            gateway_id: "gw-1",
                            key_material: gw1v1.materialBase64,
                            key_version: 1,
                        },
                    ];
                },
                "keys?id=gw-2": () => {
                    gw2FetchCount++;
                    return [
                        {
                            gateway_id: "gw-2",
                            key_material: gw2v1.materialBase64,
                            key_version: 1,
                        },
                    ];
                },
                "/measures/query": () => ({
                    data: [envelopeGw1, envelopeGw2],
                    hasMore: false,
                }),
            });

            const service = new DataApiService(config);
            const results = await service.queryMeasures({
                from: "2026-01-01T00:00:00Z",
                to: "2026-01-02T00:00:00Z",
            });

            expect(results.data).toHaveLength(2);
            expect(gw1FetchCount).toBe(1);
            expect(gw2FetchCount).toBe(1);
        });
    });

    describe("async tokenProvider", () => {
        it("works with a tokenProvider that returns a Promise", async () => {
            const envelope = await makeEnvelope(gw1v1.cryptoKey);
            let capturedAuthHeader: string | undefined;

            const fetcher: Fetcher = ((
                input: unknown,
                init?: RequestInit
            ): Promise<FetchResponse> => {
                capturedAuthHeader = (
                    init?.headers as Record<string, string> | undefined
                )?.["Authorization"];
                const url = typeof input === "string" ? input : "";
                if (url.includes("keys?id=gw-1")) {
                    return Promise.resolve(
                        makeJsonResponse(
                            [
                                {
                                    gateway_id: "gw-1",
                                    key_material: gw1v1.materialBase64,
                                    key_version: 1,
                                },
                            ],
                            200
                        )
                    );
                }
                return Promise.resolve(
                    makeJsonResponse({ data: [envelope], hasMore: false }, 200)
                );
            }) as Fetcher;

            const service = new DataApiService({
                baseUrl: "https://api.example.com",
                tokenProvider: () => Promise.resolve("async-token"),
                fetcher,
            });

            await service.queryMeasures({
                from: "2026-01-01T00:00:00Z",
                to: "2026-01-02T00:00:00Z",
            });

            expect(capturedAuthHeader).toBe("Bearer async-token");
        });
    });

    describe("queryMeasures", () => {
        it("returns data with hasMore false and no nextCursor on a single page", async () => {
            const envelope = await makeEnvelope(gw1v1.cryptoKey);
            const config = createConfig({
                "keys?id=gw-1": () => [
                    {
                        gateway_id: "gw-1",
                        key_material: gw1v1.materialBase64,
                        key_version: 1,
                    },
                ],
                "/measures/query": () => ({
                    data: [envelope],
                    hasMore: false,
                }),
            });

            const service = new DataApiService(config);
            const result = await service.queryMeasures({
                from: "2026-01-01T00:00:00Z",
                to: "2026-01-02T00:00:00Z",
            });

            expect(result.data).toHaveLength(1);
            expect(result.data[0]?.value).toBe(23.5);
            expect(result.hasMore).toBe(false);
            expect(result.nextCursor).toBeUndefined();
        });

        it("returns nextCursor and hasMore true when more pages are available", async () => {
            const envelope = await makeEnvelope(gw1v1.cryptoKey);
            const config = createConfig({
                "keys?id=gw-1": () => [
                    {
                        gateway_id: "gw-1",
                        key_material: gw1v1.materialBase64,
                        key_version: 1,
                    },
                ],
                "/measures/query": () => ({
                    data: [envelope],
                    hasMore: true,
                    nextCursor: "page-token-xyz",
                }),
            });

            const service = new DataApiService(config);
            const result = await service.queryMeasures({
                from: "2026-01-01T00:00:00Z",
                to: "2026-01-02T00:00:00Z",
                limit: 1,
            });

            expect(result.hasMore).toBe(true);
            expect(result.nextCursor).toBe("page-token-xyz");
        });
    });

    describe("exportMeasures", () => {
        it("yields all measures in order", async () => {
            const envelopes = await Promise.all([
                makeEnvelope(gw1v1.cryptoKey, {
                    sensorId: "s-1",
                    timestamp: "2026-01-01T00:00:00.000Z",
                }),
                makeEnvelope(gw1v1.cryptoKey, {
                    sensorId: "s-2",
                    timestamp: "2026-01-01T01:00:00.000Z",
                }),
                makeEnvelope(gw1v1.cryptoKey, {
                    sensorId: "s-3",
                    timestamp: "2026-01-01T02:00:00.000Z",
                }),
            ]);

            const config = createConfig({
                "keys?id=gw-1": () => [
                    {
                        gateway_id: "gw-1",
                        key_material: gw1v1.materialBase64,
                        key_version: 1,
                    },
                ],
                "/measures/export": () => envelopes,
            });

            const service = new DataApiService(config);
            const results: string[] = [];

            for await (const measure of service.exportMeasures({
                from: "2026-01-01T00:00:00Z",
                to: "2026-01-02T00:00:00Z",
            })) {
                results.push(measure.sensorId);
            }

            expect(results).toEqual(["s-1", "s-2", "s-3"]);
        });
    });

    describe("streamMeasures", () => {
        it("yields decrypted measures and fetches the key only once", async () => {
            const envelopes = await Promise.all([
                makeEnvelope(gw1v1.cryptoKey, { sensorId: "s-1" }),
                makeEnvelope(gw1v1.cryptoKey, { sensorId: "s-2" }),
            ]);

            let keyFetchCount = 0;
            mockedFetchEventSource.mockImplementation((_url, opts) => {
                for (const envelope of envelopes) {
                    opts?.onmessage?.({
                        data: JSON.stringify(envelope),
                        id: "",
                        event: "",
                    });
                }
                opts?.onclose?.();
                return Promise.resolve();
            });

            const config = createConfig({
                "keys?id=gw-1": () => {
                    keyFetchCount++;
                    return [
                        {
                            gateway_id: "gw-1",
                            key_material: gw1v1.materialBase64,
                            key_version: 1,
                        },
                    ];
                },
            });

            const service = new DataApiService(config);
            const sensorIds: string[] = [];

            for await (const measure of service.streamMeasures({})) {
                sensorIds.push(measure.sensorId);
            }

            expect(sensorIds).toEqual(["s-1", "s-2"]);
            expect(keyFetchCount).toBe(1);
        });
    });

    describe("error handling", () => {
        it("throws SdkError when the requested key version is not found", async () => {
            const envelope = await makeEnvelope(gw1v1.cryptoKey, {
                keyVersion: 99,
            });
            const config = createConfig({
                "keys?id=gw-1": () => [
                    {
                        gateway_id: "gw-1",
                        key_material: gw1v1.materialBase64,
                        key_version: 1,
                    },
                ],
                "/measures/query": () => ({
                    data: [envelope],
                    hasMore: false,
                }),
            });

            const service = new DataApiService(config);

            await expect(
                service.queryMeasures({
                    from: "2026-01-01T00:00:00Z",
                    to: "2026-01-02T00:00:00Z",
                })
            ).rejects.toThrow(SdkError);
        });

        it("throws DecryptionError when the envelope was encrypted with a different key", async () => {
            // Envelope is encrypted with gw1v2's key material but tagged as version 1.
            // The service will fetch version 1 (gw1v1) and fail to decrypt.
            const envelope = await makeEnvelope(gw1v2.cryptoKey, {
                keyVersion: 1,
            });
            const config = createConfig({
                "keys?id=gw-1": () => [
                    {
                        gateway_id: "gw-1",
                        key_material: gw1v1.materialBase64,
                        key_version: 1,
                    },
                ],
                "/measures/query": () => ({
                    data: [envelope],
                    hasMore: false,
                }),
            });

            const service = new DataApiService(config);

            await expect(
                service.queryMeasures({
                    from: "2026-01-01T00:00:00Z",
                    to: "2026-01-02T00:00:00Z",
                })
            ).rejects.toThrow(DecryptionError);
        });
    });
});

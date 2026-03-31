import { describe, it, expect, vi, beforeAll } from "vitest";

import type { Config } from "./config.js";
import { DataApiService } from "./data-api.service.js";
import { ValidationError } from "./errors.js";
import type { EncryptedEnvelopeDTO } from "./models.js";

vi.mock("@microsoft/fetch-event-source", () => ({
    fetchEventSource: vi.fn(),
}));

import { fetchEventSource } from "@microsoft/fetch-event-source";

const mockedFetchEventSource = vi.mocked(fetchEventSource);

// ---- Crypto test helpers ----

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

let testKey: CryptoKey;
let testKeyMaterialBase64: string;

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

beforeAll(async () => {
    testKey = await globalThis.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const exported = await globalThis.crypto.subtle.exportKey("raw", testKey);
    testKeyMaterialBase64 = bytesToBase64(new Uint8Array(exported));
});

async function encryptPayload(
    payload: unknown
): Promise<{ encryptedHex: string; ivHex: string; authTagHex: string }> {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await globalThis.crypto.subtle.encrypt(
        { name: "AES-GCM", iv, tagLength: 128 },
        testKey,
        encoded
    );
    const encryptedBytes = new Uint8Array(encrypted);
    const ciphertext = encryptedBytes.slice(0, -16);
    const authTag = encryptedBytes.slice(-16);

    return {
        encryptedHex: bytesToHex(ciphertext),
        ivHex: bytesToHex(iv),
        authTagHex: bytesToHex(authTag),
    };
}

async function makeEnvelope(
    overrides?: Partial<EncryptedEnvelopeDTO>
): Promise<EncryptedEnvelopeDTO> {
    const { encryptedHex, ivHex, authTagHex } = await encryptPayload({
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

// ---- Mock fetcher that routes requests ----

function createRoutingFetcher(
    routes: Record<string, () => unknown>
): NonNullable<Config["fetcher"]> {
    type Fetcher = NonNullable<Config["fetcher"]>;
    type FetchResponse = Awaited<ReturnType<Fetcher>>;

    const makeJsonResponse = (body: unknown, status: number): FetchResponse =>
        ({
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(body),
        }) as FetchResponse;

    const fetcher = (input: unknown): Promise<FetchResponse> => {
        let url = "";
        if (typeof input === "string") {
            url = input;
        } else if (input && typeof input === "object") {
            const maybe = input as { href?: unknown; url?: unknown };
            if (typeof maybe.href === "string") {
                url = maybe.href;
            } else if (typeof maybe.url === "string") {
                url = maybe.url;
            }
        }

        for (const [pattern, handler] of Object.entries(routes)) {
            if (url.includes(pattern)) {
                return Promise.resolve(makeJsonResponse(handler(), 200));
            }
        }

        return Promise.resolve(makeJsonResponse({ message: "Not found" }, 404));
    };

    return fetcher as Fetcher;
}

function createConfig(routes: Record<string, () => unknown>): Config {
    return {
        baseUrl: "https://api.example.com",
        tokenProvider: () => "test-token",
        fetcher: createRoutingFetcher(routes),
    };
}

describe("DataApiService", () => {
    describe("queryMeasures", () => {
        it("should decrypt and return plaintext measures", async () => {
            const envelope = await makeEnvelope();
            const queryResponse = {
                data: [envelope],
                hasMore: false,
            };

            const config = createConfig({
                "/measures/query": () => queryResponse,
                "/keys": () => [
                    {
                        gateway_id: "gw-1",
                        key_material: testKeyMaterialBase64,
                        key_version: 1,
                    },
                ],
            });

            const service = new DataApiService(config);
            const result = await service.queryMeasures({
                from: "2026-01-01T00:00:00Z",
                to: "2026-01-02T00:00:00Z",
            });

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                gatewayId: "gw-1",
                sensorId: "sensor-1",
                sensorType: "temperature",
                timestamp: "2026-03-23T09:58:00.000Z",
                value: 23.5,
                unit: "°C",
            });
        });

        it("should throw ValidationError on invalid query response", async () => {
            const config = createConfig({
                "/measures/query": () => ({ bad: "shape" }),
                "/keys": () => [],
            });

            const service = new DataApiService(config);

            await expect(
                service.queryMeasures({
                    from: "2026-01-01T00:00:00Z",
                    to: "2026-01-02T00:00:00Z",
                })
            ).rejects.toThrow(ValidationError);
        });

        it("should throw ValidationError on invalid decrypted payload", async () => {
            const { encryptedHex, ivHex, authTagHex } = await encryptPayload({
                wrong: "shape",
            });

            const envelope: EncryptedEnvelopeDTO = {
                gatewayId: "gw-1",
                sensorId: "sensor-1",
                sensorType: "temperature",
                timestamp: "2026-03-23T09:58:00.000Z",
                encryptedData: encryptedHex,
                iv: ivHex,
                authTag: authTagHex,
                keyVersion: 1,
            };

            const config = createConfig({
                "/measures/query": () => ({
                    data: [envelope],
                    hasMore: false,
                }),
                "/keys": () => [
                    {
                        gateway_id: "gw-1",
                        key_material: testKeyMaterialBase64,
                        key_version: 1,
                    },
                ],
            });

            const service = new DataApiService(config);

            await expect(
                service.queryMeasures({
                    from: "2026-01-01T00:00:00Z",
                    to: "2026-01-02T00:00:00Z",
                })
            ).rejects.toThrow(ValidationError);
        });
    });

    describe("exportMeasures", () => {
        it("should yield decrypted measures from export", async () => {
            const envelope = await makeEnvelope();

            const config = createConfig({
                "/measures/export": () => [envelope],
                "/keys": () => [
                    {
                        gateway_id: "gw-1",
                        key_material: testKeyMaterialBase64,
                        key_version: 1,
                    },
                ],
            });

            const service = new DataApiService(config);
            const results = [];

            for await (const measure of service.exportMeasures({
                from: "2026-01-01T00:00:00Z",
                to: "2026-01-02T00:00:00Z",
            })) {
                results.push(measure);
            }

            expect(results).toHaveLength(1);
            const first = results[0];
            if (!first) {
                throw new Error("Expected a decrypted measure");
            }
            expect(first.value).toBe(23.5);
            expect(first.unit).toBe("°C");
        });
    });

    describe("streamMeasures", () => {
        it("should yield decrypted measures from SSE stream", async () => {
            const envelope = await makeEnvelope();

            mockedFetchEventSource.mockImplementation((_url, opts) => {
                opts?.onmessage?.({
                    data: JSON.stringify(envelope),
                    id: "1",
                    event: "",
                });
                opts?.onclose?.();
                return Promise.resolve();
            });

            const config = createConfig({
                "/keys": () => [
                    {
                        gateway_id: "gw-1",
                        key_material: testKeyMaterialBase64,
                        key_version: 1,
                    },
                ],
            });

            const service = new DataApiService(config);
            const results = [];

            for await (const measure of service.streamMeasures({})) {
                results.push(measure);
            }

            expect(results).toHaveLength(1);
            const first = results[0];
            if (!first) {
                throw new Error("Expected a streamed measure");
            }
            expect(first.value).toBe(23.5);
        });
    });

    describe("getSensors", () => {
        it("should validate and map sensor DTOs to SensorModel", async () => {
            const config = createConfig({
                "/sensor": () => [
                    {
                        sensorId: "sensor-1",
                        sensorType: "temperature",
                        gatewayId: "gw-1",
                        lastSeen: "2026-03-23T09:58:00.000Z",
                    },
                ],
            });

            const service = new DataApiService(config);
            const result = await service.getSensors();

            expect(result).toEqual([
                {
                    sensorId: "sensor-1",
                    sensorType: "temperature",
                    gatewayId: "gw-1",
                    lastSeen: "2026-03-23T09:58:00.000Z",
                },
            ]);
        });
    });

    describe("getGatewaySensors", () => {
        it("should fetch sensors for a specific gateway", async () => {
            const fetcher = vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify([
                        {
                            sensorId: "sensor-1",
                            sensorType: "temperature",
                            gatewayId: "gw-1",
                            lastSeen: "2026-03-23T09:58:00.000Z",
                        },
                    ]),
                    { status: 200 }
                )
            );

            const config: Config = {
                baseUrl: "https://api.example.com",
                tokenProvider: () => "test-token",
                fetcher,
            };

            const service = new DataApiService(config);
            const result = await service.getGatewaySensors("gw-1");

            expect(result).toHaveLength(1);
            const first = result[0];
            if (!first) {
                throw new Error("Expected a gateway sensor");
            }
            expect(first.gatewayId).toBe("gw-1");
        });
    });
});

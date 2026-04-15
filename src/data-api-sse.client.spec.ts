import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Config } from "./config.js";
import { DataApiSseClient } from "./data-api-sse.client.js";
import { ValidationError } from "./errors.js";
import type { EncryptedEnvelopeDTO } from "./dto.js";

vi.mock("@microsoft/fetch-event-source", () => ({
    fetchEventSource: vi.fn(),
}));

import { fetchEventSource } from "@microsoft/fetch-event-source";

const mockedFetchEventSource = vi.mocked(fetchEventSource);

function createConfig(): Config {
    return {
        baseUrl: "https://api.example.com",
        tokenProvider: () => "test-token",
        fetcher: vi.fn(),
    };
}

const stubEnvelope: EncryptedEnvelopeDTO = {
    gatewayId: "gw-1",
    sensorId: "sensor-1",
    sensorType: "temperature",
    timestamp: "2026-03-23T09:58:00.000Z",
    encryptedData: "abcd",
    iv: "1234",
    authTag: "5678",
    keyVersion: 1,
};

describe("DataApiSseClient", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should yield envelopes from SSE stream", async () => {
        mockedFetchEventSource.mockImplementation((_url, opts) => {
            opts?.onmessage?.({
                data: JSON.stringify(stubEnvelope),
                id: "1",
                event: "",
            });
            opts?.onmessage?.({
                data: JSON.stringify({ ...stubEnvelope, sensorId: "sensor-2" }),
                id: "2",
                event: "",
            });
            opts?.onclose?.();
            return Promise.resolve();
        });

        const client = new DataApiSseClient(createConfig());
        const results: EncryptedEnvelopeDTO[] = [];

        for await (const item of client.stream("gatewayId=gw-1")) {
            results.push(item);
        }

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual(stubEnvelope);
        expect(results[1]?.sensorId).toBe("sensor-2");
    });

    it("should pass correct URL and headers", async () => {
        mockedFetchEventSource.mockImplementation((_url, opts) => {
            opts?.onclose?.();
            return Promise.resolve();
        });

        const config = createConfig();
        const client = new DataApiSseClient(config);

        for await (const envelope of client.stream("sensorType=temperature")) {
            expect(envelope).toBeDefined();
        }

        expect(mockedFetchEventSource).toHaveBeenCalledOnce();
        const [url, opts] = mockedFetchEventSource.mock.calls[0] as [
            string,
            Record<string, unknown>,
        ];
        expect(url).toBe(
            "https://api.example.com/data/measures/stream?sensorType=temperature"
        );
        expect((opts.headers as Record<string, string>).Authorization).toBe(
            "Bearer test-token"
        );
        expect(opts.fetch).toBe(config.fetcher);
    });

    it("should throw on SSE error", async () => {
        mockedFetchEventSource.mockImplementation((_url, opts) => {
            opts?.onerror?.(new Error("connection lost"));
            return Promise.resolve();
        });

        const client = new DataApiSseClient(createConfig());

        await expect(async () => {
            for await (const envelope of client.stream("")) {
                expect(envelope).toBeDefined();
            }
        }).rejects.toThrow("SSE stream error");
    });

    it("should skip empty data lines", async () => {
        mockedFetchEventSource.mockImplementation((_url, opts) => {
            opts?.onmessage?.({ data: "", id: "", event: "" });
            opts?.onmessage?.({
                data: JSON.stringify(stubEnvelope),
                id: "1",
                event: "",
            });
            opts?.onclose?.();
            return Promise.resolve();
        });

        const client = new DataApiSseClient(createConfig());
        const results: EncryptedEnvelopeDTO[] = [];

        for await (const item of client.stream("")) {
            results.push(item);
        }

        expect(results).toHaveLength(1);
    });

    it("should throw ValidationError for invalid envelope DTO", async () => {
        mockedFetchEventSource.mockImplementation((_url, opts) => {
            opts?.onmessage?.({
                data: JSON.stringify({ bad: "shape" }),
                id: "1",
                event: "",
            });
            return Promise.resolve();
        });

        const client = new DataApiSseClient(createConfig());

        await expect(async () => {
            for await (const envelope of client.stream("")) {
                expect(envelope).toBeDefined();
            }
        }).rejects.toThrow(ValidationError);
    });

    it("should abort the internal fetch signal when the external signal fires", async () => {
        let capturedSignal: AbortSignal | undefined;

        mockedFetchEventSource.mockImplementation((_url, opts) => {
            capturedSignal = (opts as { signal?: AbortSignal }).signal;
            opts?.onmessage?.({
                data: JSON.stringify(stubEnvelope),
                id: "1",
                event: "",
            });
            // Resolve when aborted to unblock the finally block
            return new Promise<void>((resolve) => {
                capturedSignal?.addEventListener("abort", () => resolve(), {
                    once: true,
                });
            });
        });

        const client = new DataApiSseClient(createConfig());
        const controller = new AbortController();
        const gen = client.stream("gatewayId=gw-1", controller.signal);

        await gen.next(); // advance past first message

        expect(capturedSignal?.aborted).toBe(false);
        controller.abort("test-reason");
        expect(capturedSignal?.aborted).toBe(true);
        expect(capturedSignal?.reason).toBe("test-reason");

        await gen.return(undefined);
    });
});

import { describe, it, expect, vi } from "vitest";

import type { Config } from "./config";
import { DataApiRestClient } from "./data-api-rest.client";
import { ApiError, ValidationError } from "./errors";
import type { EncryptedEnvelopeDTO, QueryResponseDTO } from "./dto";

function createConfig(fetcher: Config["fetcher"]): Config {
    return {
        baseUrl: "https://api.example.com",
        tokenProvider: () => "test-token",
        fetcher,
    };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
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

const stubQueryResponse: QueryResponseDTO = {
    data: [stubEnvelope],
    hasMore: false,
};

describe("DataApiRestClient", () => {
    describe("query", () => {
        it("should fetch measures with query params", async () => {
            const fetcher = vi
                .fn()
                .mockResolvedValue(jsonResponse(stubQueryResponse));
            const client = new DataApiRestClient(createConfig(fetcher));

            const result = await client.query("from=2026-01-01&to=2026-01-02");

            expect(result).toEqual(stubQueryResponse);
            expect(fetcher).toHaveBeenCalledOnce();

            const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(
                "https://api.example.com/data/measures/query?from=2026-01-01&to=2026-01-02"
            );
            expect((init.headers as Record<string, string>).Authorization).toBe(
                "Bearer test-token"
            );
        });

        it("should throw ApiError on failure", async () => {
            const fetcher = vi
                .fn()
                .mockResolvedValue(jsonResponse({ message: "Bad" }, 400));
            const client = new DataApiRestClient(createConfig(fetcher));

            await expect(client.query("bad")).rejects.toThrow(ApiError);
        });

        it("should throw ValidationError for invalid query DTO", async () => {
            const fetcher = vi
                .fn()
                .mockResolvedValue(jsonResponse({ bad: "shape" }));
            const client = new DataApiRestClient(createConfig(fetcher));

            await expect(client.query("from=a&to=b")).rejects.toThrow(
                ValidationError
            );
        });
    });

    describe("export", () => {
        it("should fetch all envelopes", async () => {
            const fetcher = vi
                .fn()
                .mockResolvedValue(jsonResponse([stubEnvelope]));
            const client = new DataApiRestClient(createConfig(fetcher));

            const result = await client.export("from=2026-01-01&to=2026-01-02");

            expect(result).toEqual([stubEnvelope]);

            const [url] = fetcher.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(
                "https://api.example.com/data/measures/export?from=2026-01-01&to=2026-01-02"
            );
        });

        it("should throw ValidationError for invalid export DTO", async () => {
            const fetcher = vi
                .fn()
                .mockResolvedValue(jsonResponse([{ bad: "shape" }]));
            const client = new DataApiRestClient(createConfig(fetcher));

            await expect(client.export("from=a&to=b")).rejects.toThrow(
                ValidationError
            );
        });
    });
});

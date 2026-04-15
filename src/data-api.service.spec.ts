import { describe, it, expect, vi } from "vitest";

import { DataApiService } from "./data-api.service.js";
import type { EncryptedEnvelope, EncryptedQueryResponse } from "./models.js";

const stubEnvelope: EncryptedEnvelope = {
    gatewayId: "gw-1",
    sensorId: "sensor-1",
    sensorType: "temperature",
    timestamp: "2026-03-23T09:58:00.000Z",
    encryptedData: "abcd",
    iv: "1234",
    authTag: "5678",
    keyVersion: 1,
};

const stubQueryResponse: EncryptedQueryResponse = {
    data: [stubEnvelope],
    hasMore: false,
};

function createMocks() {
    const restClient = {
        query: vi.fn(),
        export: vi.fn(),
    };
    const sseClient = {
        stream: vi.fn(),
    };

    const service = new DataApiService(
        restClient as unknown as ConstructorParameters<
            typeof DataApiService
        >[0],
        sseClient as unknown as ConstructorParameters<typeof DataApiService>[1]
    );

    return { service, restClient, sseClient };
}

describe("DataApiService", () => {
    describe("query", () => {
        it("should delegate to rest client and return the response", async () => {
            const { service, restClient } = createMocks();
            restClient.query.mockResolvedValue(stubQueryResponse);

            const result = await service.query("from=2026-01-01&to=2026-01-02");

            expect(result).toBe(stubQueryResponse);
            expect(restClient.query).toHaveBeenCalledWith(
                "from=2026-01-01&to=2026-01-02"
            );
        });
    });

    describe("stream", () => {
        it("should yield envelopes from sse client", async () => {
            const { service, sseClient } = createMocks();
            // eslint-disable-next-line @typescript-eslint/require-await
            sseClient.stream.mockImplementation(async function* () {
                yield stubEnvelope;
            });

            const results: EncryptedEnvelope[] = [];
            for await (const e of service.stream("gatewayId=gw-1")) {
                results.push(e);
            }

            expect(results).toEqual([stubEnvelope]);
            expect(sseClient.stream).toHaveBeenCalledWith(
                "gatewayId=gw-1",
                undefined
            );
        });

        it("should forward signal to sse client", async () => {
            const { service, sseClient } = createMocks();
            sseClient.stream.mockImplementation(async function* () {});

            const signal = new AbortController().signal;
            await service.stream("p=1", signal).next();

            expect(sseClient.stream).toHaveBeenCalledWith("p=1", signal);
        });
    });

    describe("export", () => {
        it("should delegate to rest client and return envelopes", async () => {
            const { service, restClient } = createMocks();
            restClient.export.mockResolvedValue([stubEnvelope]);

            const result = await service.export(
                "from=2026-01-01&to=2026-01-02"
            );

            expect(result).toEqual([stubEnvelope]);
            expect(restClient.export).toHaveBeenCalledWith(
                "from=2026-01-01&to=2026-01-02"
            );
        });
    });
});

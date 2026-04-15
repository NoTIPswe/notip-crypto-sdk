import { describe, it, expect, vi } from "vitest";

import { SdkError } from "./errors.js";
import type { GatewayKeyFetcher } from "./management-api.client.js";
import { ManagementApiService } from "./management-api.service.js";
import type { KeyDTO } from "./dto.js";

const stubKeys: KeyDTO[] = [
    { gateway_id: "gw-1", key_material: "dGVzdC1rZXk=", key_version: 1 },
    { gateway_id: "gw-2", key_material: "dGVzdC1rZXky", key_version: 2 },
];

function createMockClient() {
    const getGatewayKey = vi.fn();

    const client = { getGatewayKey } as GatewayKeyFetcher;

    return { client, getGatewayKey };
}

describe("ManagementApiService", () => {
    describe("getKey", () => {
        it("should fetch a single key and map to KeyModel", async () => {
            const { client, getGatewayKey } = createMockClient();
            getGatewayKey.mockResolvedValue(stubKeys[0]);
            const service = new ManagementApiService(client);

            const result = await service.getKey("gw-1", 1);

            expect(result).toEqual({
                gatewayId: "gw-1",
                keyVersion: 1,
                keyMaterial: "dGVzdC1rZXk=",
            });
            expect(getGatewayKey).toHaveBeenCalledWith("gw-1", 1);
        });

        it("should propagate errors from the client", async () => {
            const { client, getGatewayKey } = createMockClient();
            getGatewayKey.mockRejectedValue(
                new SdkError('Key not found for gateway "gw-1" version 99')
            );
            const service = new ManagementApiService(client);

            await expect(service.getKey("gw-1", 99)).rejects.toThrow(SdkError);
        });
    });
});

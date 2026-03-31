import { describe, it, expect, vi, beforeEach } from "vitest";

import { KeyManager } from "./key-manager.js";
import type { ManagementApiClient } from "./management-api.client.js";
import type { KeyDTO } from "./models.js";

function makeKeyMaterial(): string {
    return btoa(
        String.fromCodePoint(
            ...globalThis.crypto.getRandomValues(new Uint8Array(32))
        )
    );
}

function createMockClient(): {
    client: ManagementApiClient;
    getGatewayKey: ReturnType<typeof vi.fn>;
} {
    const dto: KeyDTO = {
        gateway_id: "gw-1",
        key_material: makeKeyMaterial(),
        key_version: 1,
    };

    const getGatewayKey = vi.fn().mockResolvedValue(dto);

    const client = {
        getAllKeys: vi.fn(),
        getGatewayKey,
    } as unknown as ManagementApiClient;

    return { client, getGatewayKey };
}

describe("KeyManager", () => {
    let client: ManagementApiClient;
    let getGatewayKey: ReturnType<typeof vi.fn>;
    let manager: KeyManager;

    beforeEach(() => {
        const mock = createMockClient();
        client = mock.client;
        getGatewayKey = mock.getGatewayKey;
        manager = new KeyManager(client);
    });

    it("should fetch and import a key on cache miss", async () => {
        const key = await manager.getKey("gw-1", 1);

        expect(key).toBeInstanceOf(CryptoKey);
        expect(key.algorithm).toMatchObject({ name: "AES-GCM" });
        expect(key.usages).toContain("decrypt");
        expect(getGatewayKey).toHaveBeenCalledWith("gw-1", 1);
    });

    it("should return cached key on second call", async () => {
        const key1 = await manager.getKey("gw-1", 1);
        const key2 = await manager.getKey("gw-1", 1);

        expect(key1).toBe(key2);
        expect(getGatewayKey).toHaveBeenCalledTimes(1);
    });

    it("should fetch different keys for different versions", async () => {
        getGatewayKey.mockReset();
        getGatewayKey
            .mockResolvedValueOnce({
                gateway_id: "gw-1",
                key_material: makeKeyMaterial(),
                key_version: 1,
            })
            .mockResolvedValueOnce({
                gateway_id: "gw-1",
                key_material: makeKeyMaterial(),
                key_version: 2,
            });

        const key1 = await manager.getKey("gw-1", 1);
        const key2 = await manager.getKey("gw-1", 2);

        expect(key1).not.toBe(key2);
        expect(getGatewayKey).toHaveBeenCalledTimes(2);
    });

    it("should clear cache", async () => {
        await manager.getKey("gw-1", 1);
        manager.clearCache();
        await manager.getKey("gw-1", 1);

        expect(getGatewayKey).toHaveBeenCalledTimes(2);
    });
});

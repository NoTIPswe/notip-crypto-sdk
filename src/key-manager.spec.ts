import { describe, it, expect, vi, beforeEach } from "vitest";

import { KeyManager } from "./key-manager.js";
import type { KeyModel, KeyProvider } from "./models.js";

function makeKeyMaterial(): string {
    return btoa(
        String.fromCodePoint(
            ...globalThis.crypto.getRandomValues(new Uint8Array(32))
        )
    );
}

function createMockProvider(): {
    provider: KeyProvider;
    getKey: ReturnType<typeof vi.fn>;
} {
    const model: KeyModel = {
        gatewayId: "gw-1",
        keyVersion: 1,
        keyMaterial: makeKeyMaterial(),
    };

    const getKey = vi.fn().mockResolvedValue(model);
    const provider: KeyProvider = { getKey };

    return { provider, getKey };
}

describe("KeyManager", () => {
    let provider: KeyProvider;
    let getKey: ReturnType<typeof vi.fn>;
    let manager: KeyManager;

    beforeEach(() => {
        const mock = createMockProvider();
        provider = mock.provider;
        getKey = mock.getKey;
        manager = new KeyManager(provider);
    });

    it("should fetch and import a key on cache miss", async () => {
        const key = await manager.getKey("gw-1", 1);

        expect(key).toBeInstanceOf(CryptoKey);
        expect(key.algorithm).toMatchObject({ name: "AES-GCM" });
        expect(key.usages).toContain("decrypt");
        expect(getKey).toHaveBeenCalledWith("gw-1", 1);
    });

    it("should return cached key on second call", async () => {
        const key1 = await manager.getKey("gw-1", 1);
        const key2 = await manager.getKey("gw-1", 1);

        expect(key1).toBe(key2);
        expect(getKey).toHaveBeenCalledTimes(1);
    });

    it("should fetch different keys for different versions", async () => {
        getKey.mockReset();
        getKey
            .mockResolvedValueOnce({
                gatewayId: "gw-1",
                keyVersion: 1,
                keyMaterial: makeKeyMaterial(),
            } satisfies KeyModel)
            .mockResolvedValueOnce({
                gatewayId: "gw-1",
                keyVersion: 2,
                keyMaterial: makeKeyMaterial(),
            } satisfies KeyModel);

        const key1 = await manager.getKey("gw-1", 1);
        const key2 = await manager.getKey("gw-1", 2);

        expect(key1).not.toBe(key2);
        expect(getKey).toHaveBeenCalledTimes(2);
    });

    it("should clear cache", async () => {
        await manager.getKey("gw-1", 1);
        manager.clearCache();
        await manager.getKey("gw-1", 1);

        expect(getKey).toHaveBeenCalledTimes(2);
    });
});

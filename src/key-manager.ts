import type { ManagementApiClient } from "./management-api.client.js";

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.codePointAt(i)!;
    }
    return bytes;
}

export class KeyManager {
    private readonly cache = new Map<string, CryptoKey>();

    constructor(private readonly mgmtClient: ManagementApiClient) {}

    async getKey(gatewayId: string, version: number): Promise<CryptoKey> {
        const cacheKey = `${gatewayId}-${version}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        const dto = await this.mgmtClient.getGatewayKey(gatewayId, version);
        const keyBytes = base64ToBytes(dto.key_material);

        const cryptoKey = await globalThis.crypto.subtle.importKey(
            "raw",
            keyBytes,
            "AES-GCM",
            false,
            ["decrypt"]
        );

        this.cache.set(cacheKey, cryptoKey);
        return cryptoKey;
    }

    clearCache(): void {
        this.cache.clear();
    }
}

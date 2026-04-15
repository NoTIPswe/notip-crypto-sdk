import type { KeyProvider } from "./key-provider";
import type { GatewayKeyFetcher } from "./management-api.client";
import type { KeyModel } from "./models";

export class ManagementApiService implements KeyProvider {
    constructor(private readonly apiClient: GatewayKeyFetcher) {}

    async getKey(gatewayId: string, version: number): Promise<KeyModel> {
        const dto = await this.apiClient.getGatewayKey(gatewayId, version);
        return {
            gatewayId: dto.gateway_id,
            keyVersion: dto.key_version,
            keyMaterial: dto.key_material,
        };
    }
}

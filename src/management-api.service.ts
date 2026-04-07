import type {
    AllKeysFetcher,
    GatewayKeyFetcher,
} from "./management-api.client.js";
import type { KeyModel, KeyProvider } from "./models.js";

export class ManagementApiService implements KeyProvider {
    constructor(
        private readonly apiClient: AllKeysFetcher & GatewayKeyFetcher
    ) {}

    async getKey(gatewayId: string, version: number): Promise<KeyModel> {
        const dto = await this.apiClient.getGatewayKey(gatewayId, version);
        return {
            gatewayId: dto.gateway_id,
            keyVersion: dto.key_version,
            keyMaterial: dto.key_material,
        };
    }

    async getKeysModel(): Promise<KeyModel[]> {
        const keys = await this.apiClient.getAllKeys();
        return keys.map((dto) => ({
            gatewayId: dto.gateway_id,
            keyVersion: dto.key_version,
            keyMaterial: dto.key_material,
        }));
    }
}

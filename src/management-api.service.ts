import type { Config } from "./config.js";
import { ManagementApiClient } from "./management-api.client.js";
import type { KeyModel } from "./models.js";

export class ManagementApiService {
    private readonly apiClient: ManagementApiClient;

    constructor(config: Config) {
        this.apiClient = new ManagementApiClient(config);
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

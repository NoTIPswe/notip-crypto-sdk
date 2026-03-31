import type { Config } from "./config.js";
import { ValidationError } from "./errors.js";
import { zKeysControllerGetKeysResponse } from "./generated/notip-management-api-openapi.js";
import { ManagementApiClient } from "./management-api.client.js";
import type { KeyModel } from "./models.js";

export class ManagementApiService {
    private readonly apiClient: ManagementApiClient;

    constructor(config: Config) {
        this.apiClient = new ManagementApiClient(config);
    }

    async getKeysModel(): Promise<KeyModel[]> {
        const raw = await this.apiClient.getAllKeys();

        const result = zKeysControllerGetKeysResponse.safeParse(raw);
        if (!result.success) {
            throw new ValidationError("Invalid keys response", {
                cause: result.error,
            });
        }

        return result.data.map((dto) => ({
            gatewayId: dto.gateway_id,
            keyVersion: dto.key_version,
            keyMaterial: dto.key_material,
        }));
    }
}

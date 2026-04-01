import type { Config } from "./config.js";
import { SdkError, ValidationError } from "./errors.js";
import { zKeysControllerGetKeysResponse } from "./generated/notip-management-api-openapi.js";
import { authorizedFetch } from "./http.js";
import type { KeyDTO } from "./models.js";

export class ManagementApiClient {
    constructor(private readonly config: Config) {}

    async getAllKeys(): Promise<KeyDTO[]> {
        const response = await authorizedFetch(this.config, "/mgmt/keys");
        const raw: unknown = await response.json();
        const validated = zKeysControllerGetKeysResponse.safeParse(raw);
        if (!validated.success) {
            throw new ValidationError("Invalid keys response", {
                cause: validated.error,
            });
        }
        return validated.data;
    }

    async getGatewayKey(gatewayId: string, version: number): Promise<KeyDTO> {
        const response = await authorizedFetch(
            this.config,
            `/mgmt/keys?id=${encodeURIComponent(gatewayId)}`
        );
        const raw: unknown = await response.json();
        const validated = zKeysControllerGetKeysResponse.safeParse(raw);
        if (!validated.success) {
            throw new ValidationError("Invalid keys response", {
                cause: validated.error,
            });
        }
        const keys = validated.data;
        const match = keys.find((k) => k.key_version === version);

        if (!match) {
            throw new SdkError(
                `Key not found for gateway "${gatewayId}" version ${version}`
            );
        }

        return match;
    }
}

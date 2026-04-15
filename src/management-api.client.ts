import type { Config } from "./config";
import { SdkError, ValidationError } from "./errors";
import { zKeysControllerGetKeysResponse } from "./generated/notip-management-api-openapi";
import { authorizedFetch } from "./http";
import type { KeyDTO } from "./dto";

export interface GatewayKeyFetcher {
    getGatewayKey(gatewayId: string, version: number): Promise<KeyDTO>;
}

export class ManagementApiClient implements GatewayKeyFetcher {
    constructor(private readonly config: Config) {}

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

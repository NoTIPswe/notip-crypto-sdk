import type { Config } from "./config.js";
import { SdkError } from "./errors.js";
import { authorizedFetch } from "./http.js";
import type { KeyDTO } from "./models.js";

export class ManagementApiClient {
    constructor(private readonly config: Config) {}

    async getAllKeys(): Promise<KeyDTO[]> {
        const response = await authorizedFetch(this.config, "/keys");
        return (await response.json()) as KeyDTO[];
    }

    async getGatewayKey(gatewayId: string, version: number): Promise<KeyDTO> {
        const response = await authorizedFetch(
            this.config,
            `/keys?id=${encodeURIComponent(gatewayId)}`
        );
        const keys = (await response.json()) as KeyDTO[];
        const match = keys.find((k) => k.key_version === version);

        if (!match) {
            throw new SdkError(
                `Key not found for gateway "${gatewayId}" version ${version}`
            );
        }

        return match;
    }
}

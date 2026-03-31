import type { Config } from "./config.js";
import { authorizedFetch } from "./http.js";
import type {
    EncryptedEnvelopeDTO,
    QueryResponseDTO,
    SensorDTO,
} from "./models.js";

export class DataApiRestClient {
    constructor(private readonly config: Config) {}

    async query(params: string): Promise<QueryResponseDTO> {
        const response = await authorizedFetch(
            this.config,
            `/measures/query?${params}`
        );
        return (await response.json()) as QueryResponseDTO;
    }

    async export(params: string): Promise<EncryptedEnvelopeDTO[]> {
        const response = await authorizedFetch(
            this.config,
            `/measures/export?${params}`
        );
        return (await response.json()) as EncryptedEnvelopeDTO[];
    }

    async getAllSensors(): Promise<SensorDTO[]> {
        const response = await authorizedFetch(this.config, "/sensor");
        return (await response.json()) as SensorDTO[];
    }

    async getGatewaySensors(gatewayId: string): Promise<SensorDTO[]> {
        const response = await authorizedFetch(
            this.config,
            `/sensor?gatewayId=${encodeURIComponent(gatewayId)}`
        );
        return (await response.json()) as SensorDTO[];
    }
}

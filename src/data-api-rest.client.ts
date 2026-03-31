import type { Config } from "./config.js";
import { ValidationError } from "./errors.js";
import {
    zMeasureControllerExportResponse,
    zQueryResponseDto,
    zSensorControllerGetSensorsResponse,
} from "./generated/notip-data-api-openapi.js";
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
        const raw: unknown = await response.json();
        const validated = zQueryResponseDto.safeParse(raw);
        if (!validated.success) {
            throw new ValidationError("Invalid query response", {
                cause: validated.error,
            });
        }
        return validated.data;
    }

    async export(params: string): Promise<EncryptedEnvelopeDTO[]> {
        const response = await authorizedFetch(
            this.config,
            `/measures/export?${params}`
        );
        const raw: unknown = await response.json();
        const validated = zMeasureControllerExportResponse.safeParse(raw);
        if (!validated.success) {
            throw new ValidationError("Invalid export response", {
                cause: validated.error,
            });
        }
        return validated.data;
    }

    async getAllSensors(): Promise<SensorDTO[]> {
        const response = await authorizedFetch(this.config, "/sensor");
        const raw: unknown = await response.json();
        const validated = zSensorControllerGetSensorsResponse.safeParse(raw);
        if (!validated.success) {
            throw new ValidationError("Invalid sensors response", {
                cause: validated.error,
            });
        }
        return validated.data;
    }

    async getGatewaySensors(gatewayId: string): Promise<SensorDTO[]> {
        const response = await authorizedFetch(
            this.config,
            `/sensor?gatewayId=${encodeURIComponent(gatewayId)}`
        );
        const raw: unknown = await response.json();
        const validated = zSensorControllerGetSensorsResponse.safeParse(raw);
        if (!validated.success) {
            throw new ValidationError("Invalid sensors response", {
                cause: validated.error,
            });
        }
        return validated.data;
    }
}

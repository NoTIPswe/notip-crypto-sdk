import type { Config } from "./config";
import { ValidationError } from "./errors";
import {
    zMeasureControllerExportResponse,
    zQueryResponseDto,
} from "./generated/notip-data-api-openapi";
import { authorizedFetch } from "./http";
import type { EncryptedEnvelopeDTO, QueryResponseDTO } from "./dto";

export class DataApiRestClient {
    constructor(private readonly config: Config) {}

    async query(params: string): Promise<QueryResponseDTO> {
        const response = await authorizedFetch(
            this.config,
            `/data/measures/query?${params}`
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
            `/data/measures/export?${params}`
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
}

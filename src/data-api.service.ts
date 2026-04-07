import type { DataApiRestClient } from "./data-api-rest.client.js";
import type { DataApiSseClient } from "./data-api-sse.client.js";
import type { EncryptedEnvelopeDTO, QueryResponseDTO } from "./models.js";

export class DataApiService {
    constructor(
        private readonly restClient: DataApiRestClient,
        private readonly sseClient: DataApiSseClient
    ) {}

    async query(params: string): Promise<QueryResponseDTO> {
        return this.restClient.query(params);
    }

    async *stream(
        params: string,
        signal?: AbortSignal
    ): AsyncGenerator<EncryptedEnvelopeDTO> {
        yield* this.sseClient.stream(params, signal);
    }

    async export(params: string): Promise<EncryptedEnvelopeDTO[]> {
        return this.restClient.export(params);
    }
}

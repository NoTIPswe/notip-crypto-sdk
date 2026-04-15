import type { DataApiRestClient } from "./data-api-rest.client.js";
import type { DataApiSseClient } from "./data-api-sse.client.js";
import type { EncryptedEnvelope, EncryptedQueryResponse } from "./models.js";

export class DataApiService {
    constructor(
        private readonly restClient: DataApiRestClient,
        private readonly sseClient: DataApiSseClient
    ) {}

    async query(params: string): Promise<EncryptedQueryResponse> {
        return this.restClient.query(params);
    }

    async *stream(
        params: string,
        signal?: AbortSignal
    ): AsyncGenerator<EncryptedEnvelope> {
        yield* this.sseClient.stream(params, signal);
    }

    async export(params: string): Promise<EncryptedEnvelope[]> {
        return this.restClient.export(params);
    }
}

import type { Config } from "./config.js";
import { CryptoEngine } from "./crypto-engine.js";
import { ValidationError } from "./errors.js";
import { KeyManager } from "./key-manager.js";
import { ManagementApiClient } from "./management-api.client.js";
import { DataApiRestClient } from "./data-api-rest.client.js";
import { DataApiSseClient } from "./data-api-sse.client.js";
import type {
    EncryptedEnvelopeDTO,
    ExportModel,
    PlaintextMeasure,
    QueryModel,
    QueryResponsePage,
    StreamModel,
} from "./models.js";
import { zSensorData } from "./models.js";

function toSearchParams(obj: QueryModel | StreamModel | ExportModel): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            for (const item of value) params.append(key, String(item));
        } else if (typeof value === "string" || typeof value === "number") {
            params.set(key, String(value));
        }
    }
    return params.toString();
}

export class DataApiService {
    private readonly restClient: DataApiRestClient;
    private readonly sseClient: DataApiSseClient;
    private readonly keyManager: KeyManager;
    private readonly cryptoEngine: CryptoEngine;

    constructor(config: Config) {
        const mgmtClient = new ManagementApiClient(config);

        this.restClient = new DataApiRestClient(config);
        this.sseClient = new DataApiSseClient(config);
        this.keyManager = new KeyManager(mgmtClient);
        this.cryptoEngine = new CryptoEngine();
    }

    async queryMeasures(query: QueryModel): Promise<QueryResponsePage> {
        const params = toSearchParams(query);
        const response = await this.restClient.query(params);

        const data: PlaintextMeasure[] = [];
        for (const envelope of response.data) {
            data.push(await this.decryptEnvelope(envelope));
        }
        return {
            data,
            nextCursor: response.nextCursor,
            hasMore: response.hasMore,
        };
    }

    /**
     * Streams decrypted measures from the SSE endpoint.
     *
     * **Lifecycle responsibility:** The SSE connection is held open for the
     * lifetime of the generator. To release it you must either:
     * - Break out of (or fully exhaust) the `for await...of` loop, or
     * - Pass an `AbortSignal` and call `controller.abort()` from outside the loop.
     *
     * Abandoning the generator without doing either will leak the connection.
     *
     * @example
     * // Idiomatic usage — break closes the connection automatically
     * for await (const measure of service.streamMeasures(query)) {
     *   process(measure);
     *   if (done) break;
     * }
     *
     * @example
     * // External cancellation via AbortController
     * const controller = new AbortController();
     * setTimeout(() => controller.abort(), 30_000);
     * for await (const measure of service.streamMeasures(query, controller.signal)) {
     *   process(measure);
     * }
     */
    async *streamMeasures(
        query: StreamModel,
        signal?: AbortSignal
    ): AsyncGenerator<PlaintextMeasure> {
        const params = toSearchParams(query);

        for await (const envelope of this.sseClient.stream(params, signal)) {
            yield this.decryptEnvelope(envelope);
        }
    }

    async *exportMeasures(
        query: ExportModel
    ): AsyncGenerator<PlaintextMeasure> {
        const params = toSearchParams(query);
        const envelopes = await this.restClient.export(params);

        for (const envelope of envelopes) {
            yield this.decryptEnvelope(envelope);
        }
    }

    private async decryptEnvelope(
        envelope: EncryptedEnvelopeDTO
    ): Promise<PlaintextMeasure> {
        const key = await this.keyManager.getKey(
            envelope.gatewayId,
            envelope.keyVersion
        );

        const decrypted = await this.cryptoEngine.decrypt(
            envelope.encryptedData,
            key,
            envelope.iv,
            envelope.authTag
        );

        const sensorData = zSensorData.safeParse(decrypted);
        if (!sensorData.success) {
            throw new ValidationError("Invalid decrypted sensor data", {
                cause: sensorData.error,
            });
        }

        return {
            gatewayId: envelope.gatewayId,
            sensorId: envelope.sensorId,
            sensorType: envelope.sensorType,
            timestamp: envelope.timestamp,
            value: sensorData.data.value,
            unit: sensorData.data.unit,
        };
    }
}

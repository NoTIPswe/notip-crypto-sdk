import type { Config } from "./config.js";
import { CryptoEngine } from "./crypto-engine.js";
import { DataApiRestClient } from "./data-api-rest.client.js";
import { DataApiSseClient } from "./data-api-sse.client.js";
import { DataApiService } from "./data-api.service.js";
import { ValidationError } from "./errors.js";
import { KeyManager } from "./key-manager.js";
import { ManagementApiClient } from "./management-api.client.js";
import { ManagementApiService } from "./management-api.service.js";
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

export interface MeasureQuerier {
    queryMeasures(query: QueryModel): Promise<QueryResponsePage>;
}

export interface MeasureStreamer {
    streamMeasures(
        query: StreamModel,
        signal?: AbortSignal
    ): AsyncGenerator<PlaintextMeasure>;
}

export interface MeasureExporter {
    exportMeasures(query: ExportModel): AsyncGenerator<PlaintextMeasure>;
}

/**
 * Main entry point for the NoTIP Crypto SDK.
 *
 * Orchestrates the data-fetching, key-resolution, and decryption
 * pipeline. Consumers should depend on the narrow capability
 * interfaces ({@link MeasureQuerier}, {@link MeasureStreamer},
 * {@link MeasureExporter}) rather than on this concrete class.
 *
 * **Lifecycle responsibility for streams:** The SSE connection is held
 * open for the lifetime of the generator returned by
 * {@link streamMeasures}. To release it, either break out of the
 * `for await...of` loop or pass an `AbortSignal` and call
 * `controller.abort()`.
 */
export class CryptoSdk
    implements MeasureQuerier, MeasureStreamer, MeasureExporter
{
    private readonly dataService: DataApiService;
    private readonly keyManager: KeyManager;
    private readonly cryptoEngine: CryptoEngine;

    constructor(config: Config) {
        const mgmtClient = new ManagementApiClient(config);
        const mgmtService = new ManagementApiService(mgmtClient);
        this.keyManager = new KeyManager(mgmtService);
        this.cryptoEngine = new CryptoEngine();
        this.dataService = new DataApiService(
            new DataApiRestClient(config),
            new DataApiSseClient(config)
        );
    }

    async queryMeasures(query: QueryModel): Promise<QueryResponsePage> {
        const response = await this.dataService.query(toSearchParams(query));

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

    async *streamMeasures(
        query: StreamModel,
        signal?: AbortSignal
    ): AsyncGenerator<PlaintextMeasure> {
        const params = toSearchParams(query);
        for await (const envelope of this.dataService.stream(params, signal)) {
            yield this.decryptEnvelope(envelope);
        }
    }

    async *exportMeasures(
        query: ExportModel
    ): AsyncGenerator<PlaintextMeasure> {
        const envelopes = await this.dataService.export(toSearchParams(query));
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

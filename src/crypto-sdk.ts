import type { Config } from "./config";
import { CryptoEngine } from "./crypto-engine";
import { DataApiRestClient } from "./data-api-rest.client";
import { DataApiSseClient } from "./data-api-sse.client";
import { DataApiService } from "./data-api.service";
import { KeyManager } from "./key-manager";
import { ManagementApiClient } from "./management-api.client";
import { ManagementApiService } from "./management-api.service";
import type {
    EncryptedEnvelope,
    ExportModel,
    PlaintextMeasure,
    QueryModel,
    QueryResponsePage,
    StreamModel,
} from "./models";
import { parseSensorData } from "./validation";

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
        envelope: EncryptedEnvelope
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

        const sensorData = parseSensorData(decrypted);

        return {
            gatewayId: envelope.gatewayId,
            sensorId: envelope.sensorId,
            sensorType: envelope.sensorType,
            timestamp: envelope.timestamp,
            value: sensorData.value,
            unit: sensorData.unit,
        };
    }
}

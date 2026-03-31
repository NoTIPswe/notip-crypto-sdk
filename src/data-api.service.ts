import type { Config } from "./config.js";
import { CryptoEngine } from "./crypto-engine.js";
import { ValidationError } from "./errors.js";
import {
    zEncryptedEnvelopeDto,
    zMeasureControllerExportResponse,
    zQueryResponseDto,
    zSensorControllerGetSensorsResponse,
} from "./generated/notip-data-api-openapi.js";
import { KeyManager } from "./key-manager.js";
import { ManagementApiClient } from "./management-api.client.js";
import { DataApiRestClient } from "./data-api-rest.client.js";
import { DataApiSseClient } from "./data-api-sse.client.js";
import type {
    EncryptedEnvelopeDTO,
    ExportModel,
    PlaintextMeasure,
    QueryModel,
    SensorModel,
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

    async queryMeasures(query: QueryModel): Promise<PlaintextMeasure[]> {
        const params = toSearchParams(query);
        const raw = await this.restClient.query(params);

        const validated = zQueryResponseDto.safeParse(raw);
        if (!validated.success) {
            throw new ValidationError("Invalid query response", {
                cause: validated.error,
            });
        }

        const results: PlaintextMeasure[] = [];
        for (const envelope of validated.data.data) {
            results.push(await this.decryptEnvelope(envelope));
        }
        return results;
    }

    async *streamMeasures(
        query: StreamModel
    ): AsyncGenerator<PlaintextMeasure> {
        const params = toSearchParams(query);

        for await (const raw of this.sseClient.stream(params)) {
            const validated = zEncryptedEnvelopeDto.safeParse(raw);
            if (!validated.success) {
                throw new ValidationError("Invalid stream envelope", {
                    cause: validated.error,
                });
            }
            yield this.decryptEnvelope(validated.data);
        }
    }

    async *exportMeasures(
        query: ExportModel
    ): AsyncGenerator<PlaintextMeasure> {
        const params = toSearchParams(query);
        const raw = await this.restClient.export(params);

        const validated = zMeasureControllerExportResponse.safeParse(raw);
        if (!validated.success) {
            throw new ValidationError("Invalid export response", {
                cause: validated.error,
            });
        }

        for (const envelope of validated.data) {
            yield this.decryptEnvelope(envelope);
        }
    }

    async getSensors(): Promise<SensorModel[]> {
        const raw = await this.restClient.getAllSensors();

        const validated = zSensorControllerGetSensorsResponse.safeParse(raw);
        if (!validated.success) {
            throw new ValidationError("Invalid sensors response", {
                cause: validated.error,
            });
        }

        return validated.data.map((dto) => ({
            sensorId: dto.sensorId,
            sensorType: dto.sensorType,
            gatewayId: dto.gatewayId,
            lastSeen: dto.lastSeen,
        }));
    }

    async getGatewaySensors(gatewayId: string): Promise<SensorModel[]> {
        const raw = await this.restClient.getGatewaySensors(gatewayId);

        const validated = zSensorControllerGetSensorsResponse.safeParse(raw);
        if (!validated.success) {
            throw new ValidationError("Invalid sensors response", {
                cause: validated.error,
            });
        }

        return validated.data.map((dto) => ({
            sensorId: dto.sensorId,
            sensorType: dto.sensorType,
            gatewayId: dto.gatewayId,
            lastSeen: dto.lastSeen,
        }));
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

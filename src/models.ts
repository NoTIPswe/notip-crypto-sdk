import { z } from "zod";

import type {
    zEncryptedEnvelopeDto,
    zQueryResponseDto,
} from "./generated/notip-data-api-openapi.js";
import type { zKeysResponseDto } from "./generated/notip-management-api-openapi.js";

// ---------------------------------------------------------------------------
// DTO type aliases (inferred from generated Zod schemas)
// ---------------------------------------------------------------------------

export type EncryptedEnvelopeDTO = z.infer<typeof zEncryptedEnvelopeDto>;
export type QueryResponseDTO = z.infer<typeof zQueryResponseDto>;
export type KeyDTO = z.infer<typeof zKeysResponseDto>;

// ---------------------------------------------------------------------------
// Domain input models
// ---------------------------------------------------------------------------

export interface QueryModel {
    from: string;
    to: string;
    limit?: number;
    cursor?: string;
    gatewayId?: string[];
    sensorId?: string[];
    sensorType?: string[];
}

export interface StreamModel {
    gatewayId?: string[];
    sensorId?: string[];
    sensorType?: string[];
}

export interface ExportModel {
    from: string;
    to: string;
    gatewayId?: string[];
    sensorId?: string[];
    sensorType?: string[];
}

// ---------------------------------------------------------------------------
// Domain output models + Zod schemas
// ---------------------------------------------------------------------------

export const zSensorData = z.object({
    value: z.number(),
    unit: z.string(),
});

export type SensorData = z.infer<typeof zSensorData>;

export const zPlaintextMeasure = z.object({
    gatewayId: z.string(),
    sensorId: z.string(),
    sensorType: z.string(),
    timestamp: z.string(),
    value: z.number(),
    unit: z.string(),
});

export type PlaintextMeasure = z.infer<typeof zPlaintextMeasure>;

export interface KeyModel {
    gatewayId: string;
    keyVersion: number;
    keyMaterial: string;
}

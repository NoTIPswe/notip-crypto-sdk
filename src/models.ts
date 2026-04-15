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
// Domain output models
// ---------------------------------------------------------------------------

export interface SensorData {
    value: number;
    unit: string;
}

export interface PlaintextMeasure {
    gatewayId: string;
    sensorId: string;
    sensorType: string;
    timestamp: string;
    value: number;
    unit: string;
}

export interface QueryResponsePage {
    data: PlaintextMeasure[];
    nextCursor?: string;
    hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Encrypted envelope models
// ---------------------------------------------------------------------------

export interface EncryptedEnvelope {
    gatewayId: string;
    sensorId: string;
    sensorType: string;
    timestamp: string;
    encryptedData: string;
    iv: string;
    authTag: string;
    keyVersion: number;
}

export interface EncryptedQueryResponse {
    data: EncryptedEnvelope[];
    nextCursor?: string;
    hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Key models
// ---------------------------------------------------------------------------

export interface KeyModel {
    gatewayId: string;
    keyVersion: number;
    keyMaterial: string;
}

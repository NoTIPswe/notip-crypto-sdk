# @notip/crypto-sdk

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=NoTIPswe_notip-crypto-sdk&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=NoTIPswe_notip-crypto-sdk)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=NoTIPswe_notip-crypto-sdk&metric=coverage)](https://sonarcloud.io/summary/new_code?id=NoTIPswe_notip-crypto-sdk)

Client-side decryption library for NoTIP telemetry payloads.

Fetches encrypted sensor measurements from the NoTIP Data API, resolves the encryption keys from the Management API, and decrypts the data on the client using AES-GCM.

## Installation

```sh
npm install @notip/crypto-sdk
```

## Quick start

```ts
import { CryptoSdk } from "@notip/crypto-sdk";

const sdk = new CryptoSdk({
    baseUrl: "https://your-notip-instance.example.com",
    tokenProvider: () => "your-bearer-token",
});

// Query a page of decrypted measures
const page = await sdk.queryMeasures({
    from: "2026-01-01T00:00:00Z",
    to: "2026-01-02T00:00:00Z",
    limit: 100,
});

console.log(page.data); // PlaintextMeasure[]
```

## Configuration

| Option          | Type                              | Required | Description                                              |
| --------------- | --------------------------------- | -------- | -------------------------------------------------------- |
| `baseUrl`       | `string`                          | yes      | Base URL of the NoTIP backend (no trailing slash)        |
| `tokenProvider` | `() => string \| Promise<string>` | yes      | Callback that returns a valid Bearer token               |
| `fetcher`       | `typeof fetch`                    | no       | Custom fetch implementation (defaults to global `fetch`) |

## API

### `CryptoSdk`

Main entry point. Implements `MeasureQuerier`, `MeasureStreamer`, and `MeasureExporter`. Prefer depending on the narrow interfaces rather than the concrete class.

#### `queryMeasures(query: QueryModel): Promise<QueryResponsePage>`

Fetches and decrypts a paginated page of measures.

```ts
const page = await sdk.queryMeasures({
    from: "2026-01-01T00:00:00Z",
    to: "2026-01-02T00:00:00Z",
    limit: 50,
    cursor: page.nextCursor, // pagination
    gatewayId: ["gw-1"], // optional filters
    sensorId: ["sensor-42"],
    sensorType: ["temperature"],
});
```

#### `streamMeasures(query: StreamModel, signal?: AbortSignal): AsyncGenerator<PlaintextMeasure>`

Streams live measures over SSE and decrypts each one as it arrives.

```ts
const controller = new AbortController();

for await (const measure of sdk.streamMeasures(
    { gatewayId: ["gw-1"] },
    controller.signal
)) {
    console.log(measure);
}

// Stop the stream early
controller.abort();
```

The SSE connection stays open for the lifetime of the generator. Always either exhaust the generator or abort via signal to release the connection.

#### `exportMeasures(query: ExportModel): AsyncGenerator<PlaintextMeasure>`

Exports and decrypts a full range of measures in bulk (no pagination).

```ts
for await (const measure of sdk.exportMeasures({
    from: "2026-01-01T00:00:00Z",
    to: "2026-01-31T23:59:59Z",
    sensorType: ["humidity"],
})) {
    console.log(measure);
}
```

### Models

#### `PlaintextMeasure`

```ts
interface PlaintextMeasure {
    gatewayId: string;
    sensorId: string;
    sensorType: string;
    timestamp: string;
    value: number;
    unit: string;
}
```

#### `QueryResponsePage`

```ts
interface QueryResponsePage {
    data: PlaintextMeasure[];
    nextCursor?: string;
    hasMore: boolean;
}
```

#### `QueryModel`

```ts
interface QueryModel {
    from: string; // ISO 8601 datetime
    to: string; // ISO 8601 datetime
    limit?: number;
    cursor?: string; // opaque pagination cursor
    gatewayId?: string[];
    sensorId?: string[];
    sensorType?: string[];
}
```

#### `StreamModel`

```ts
interface StreamModel {
    gatewayId?: string[];
    sensorId?: string[];
    sensorType?: string[];
}
```

#### `ExportModel`

```ts
interface ExportModel {
    from: string; // ISO 8601 datetime
    to: string; // ISO 8601 datetime
    gatewayId?: string[];
    sensorId?: string[];
    sensorType?: string[];
}
```

### Errors

All errors extend `SdkError`.

| Class             | When thrown                                                 |
| ----------------- | ----------------------------------------------------------- |
| `ApiError`        | The backend returns a non-2xx HTTP response                 |
| `ValidationError` | A response payload fails schema validation after decryption |
| `DecryptionError` | AES-GCM decryption fails (wrong key, corrupted ciphertext)  |

```ts
import { ApiError, DecryptionError, ValidationError } from "@notip/crypto-sdk";

try {
    const page = await sdk.queryMeasures({ from, to });
} catch (err) {
    if (err instanceof ApiError) {
        console.error(`HTTP ${err.status}: ${err.message}`);
    }
}
```

## Development

```sh
npm install
npm run build          # compile to dist/
npm test               # run tests once
npm run test:watch     # watch mode
npm run check          # format + typecheck + lint
```

### Update generated API types

```sh
npm run fetch-dtos
```

This fetches the OpenAPI contracts from the running backend and regenerates the Zod DTOs under `src/generated/`.

## License

[AGPL-3.0-only](https://www.gnu.org/licenses/agpl-3.0.html)

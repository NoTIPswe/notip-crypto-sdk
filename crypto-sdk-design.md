# `@notip/crypto-sdk` — Architectural Spec

*Repository: `notip-crypto-sdk` — Marzo 2026*

---

## 1. Scopo

Libreria npm autonoma che implementa la decifratura client-side dei payload telemetrici NoTIP. Vanilla TypeScript, nessuna dipendenza da framework.

**Rule Zero:** la decifratura avviene solo lato client; nessun componente cloud decifra mai i payload telemetrici. Nel runtime client, il `keyMaterial` puo transitare nel main thread solo per il tempo strettamente necessario a costruire `GatewayKeyMap` e inviarla a `initializeKeys(...)`; dopo l'import nel Worker (`extractable: false`) la chiave resta nel contesto Worker e non viene persa su persistenza locale.

**Consumer:**
- `notip-frontend` — importa la SDK e la adatta tramite `WorkerOrchestratorService`
- Sviluppatori esterni con API key — decriptano `TelemetryEnvelope` ricevuti da SSE o export

Il frontend e la SDK devono rimanere allineati sul contratto di decifratura.

---

## 2. Repository Structure

```
notip-crypto-sdk/
├── src/
│   ├── orchestrator.ts       # CryptoOrchestrator — public API
│   ├── worker.ts             # CryptoWorker — Web Worker AES-256-GCM in thread isolato
│   ├── mappers.ts            # Normalizzazione payload telemetry (snake_case/camelCase) -> business model
│   └── types.ts              # Tipi esportati (business model)
├── @generated/
│   └── api/                  # Generato da openapi-generator-cli — NON modificare
│       └── models/           # DTO da Data API e Management API
├── dist/                     # Build output (non committato)
├── package.json
└── tsconfig.json
```

La SDK genera **solo i DTO** dalle spec OpenAPI, non i client HTTP: la SDK non fa chiamate di rete.

- **Data API spec** -> `TelemetryEnvelopeDto` (snake_case)
- **Management API spec** -> `KeyDeliveryResponseDto` (snake_case)

---

## 3. Tipi

### 3.1 DTO e wire payload (interni)

I DTO generati da OpenAPI sono interni e in snake_case.

```typescript
// Da Data API spec (query/export)
interface TelemetryEnvelopeDto {
  gateway_id: string;
  sensor_id: string;
  sensor_type: string;
  timestamp: string;
  key_version: number;
  encrypted_data: string;
  iv: string;
  auth_tag: string;
}

// Da Management API spec (/keys)
interface KeyDeliveryResponseDto {
  gateway_id: string;
  key_material: string;
  key_version: number;
}
```

**Nota SSE:** alcuni stream possono arrivare in camelCase (`gatewayId`, `keyVersion`, ...). Questo formato non arriva da OpenAPI DTO; viene normalizzato in `mappers.ts` allo stesso business model `TelemetryEnvelope`.

### 3.2 Tipi di business esportati

```typescript
interface TelemetryEnvelope {
  gatewayId: string;
  sensorId: string;
  sensorType: string;
  timestamp: string;   // ISO 8601
  keyVersion: number;
  encryptedData: string;
  iv: string;
  authTag: string;
}

interface DecryptedTelemetry {
  gatewayId: string;
  sensorId: string;
  sensorType: string;
  timestamp: string;
  value: number;
}

// Pratica comune TypeScript per mappe dinamiche
type GatewayKeyMap = Record<string, string>; // gatewayId -> base64 keyMaterial

interface DecryptedBatchProgress {
  total: number;
  completed: number;
  failed: number;
  lastDecrypted?: DecryptedTelemetry;
}

interface KeyVersionMismatchEvent {
  gatewayId: string;
  cachedVersion: number;
  payloadVersion: number;
}

interface WorkerError {
  code: 'KEY_NOT_FOUND' | 'DECRYPT_FAILED' | 'KEY_VERSION_MISMATCH' | 'TIMEOUT' | 'WORKER_NOT_READY';
  gatewayId?: string;
  detail?: string;
}
```

### 3.3 Specifica input chiavi (responsabilita del client)

```typescript
// Contratto richiesto dalla SDK.
// La responsabilita di fetch + mapping resta al consumer.
type GatewayKeyMap = Record<string, string>; // gatewayId -> base64 keyMaterial
```

`KeyDeliveryResponseDto` **non** viene re-esportato: resta dettaglio interno del codice generato.
La SDK non espone `KeyDeliveryWire` e non espone helper di mapping per le chiavi.

**Cosa deve fornire il client a `initializeKeys(keys)`**

- Chiave della mappa: `gatewayId` (stringa, tipicamente UUID del gateway).
- Valore della mappa: `keyMaterial` in Base64 della chiave AES-256 raw (32 byte decodificati).
- Origine dati: tipicamente `GET /api/mgmt/keys` del backend NoTIP.
- Mapping wire -> `GatewayKeyMap`: implementato dal client consumer (frontend ufficiale o integrazione esterna).

**Nota sicurezza:** questo modello non contraddice i vincoli di sicurezza definiti per l'opaque pipeline: la cloud side resta opaca (nessuna decifratura server-side) e il materiale chiave non e persistito nel browser storage. Il requisito operativo e minimizzare la permanenza del `keyMaterial` nel main thread e importarlo subito nel Worker.

**Autenticazione e refresh token:** la SDK non gestisce autenticazione/OIDC. I dettagli su acquisition token, refresh e policy JWT sono documentati nei documenti di sicurezza e frontend (`notip_progettazione_sicurezza.md`, `notip-frontend-detailed-design.md`).

---

## 4. `CryptoOrchestrator`

Classe principale esportata. Gestisce lifecycle del Worker, correlazione request/response via UUID, timeout, e gestione errori.

### Interfaccia pubblica

| Metodo | Firma | Note |
|---|---|---|
| `create` | `static () => Promise<CryptoOrchestrator>` | Factory method consigliato: istanzia + spawn + waitReady in un solo step. |
| `spawn` | `() => void` | API avanzata/lower-level; idempotente (seconda chiamata non crea un secondo worker). |
| `waitReady` | `() => Promise<void>` | API avanzata/lower-level. |
| `initializeKeys` | `(keys: GatewayKeyMap) => Promise<void>` | Invia le chiavi al Worker. |
| `decryptEnvelope` | `(envelope: TelemetryEnvelope) => Promise<DecryptedTelemetry>` | Decifratura singola; su errore rigetta con `WorkerError`. |
| `decryptBatch` | `(envelopes: TelemetryEnvelope[]) => AsyncIterable<DecryptedBatchProgress>` | Progress incrementale framework-agnostic. |
| `ping` | `() => Promise<boolean>` | Verifica responsivita del Worker (default 2s). |
| `onKeyVersionMismatch` | `(handler: (event: KeyVersionMismatchEvent) => void) => () => void` | Registra callback e ritorna funzione di unsubscribe. |
| `onError` | `(handler: (error: WorkerError) => void) => () => void` | Notifica errori generici (`KEY_NOT_FOUND`, `DECRYPT_FAILED`, `TIMEOUT`, ...). |
| `destroy` | `() => void` | Termina il Worker e cancella richieste pendenti. |

### Attributi di `CryptoOrchestrator`

| Attributo | Tipo | Visibilità | Scopo |
|---|---|---|---|
| `worker` | `Worker \| null` | `private` | Referenza al Web Worker runtime; `null` prima di `spawn` e dopo `destroy`. |
| `pendingRequests` | `Map<string, PendingRequest>` | `private` | Correlazione request/response via UUID per decrypt/ping. |
| `mismatchHandlers` | `Set<KeyVersionMismatchHandler>` | `private` | Handler registrati via `onKeyVersionMismatch`. |
| `errorHandlers` | `Set<WorkerErrorHandler>` | `private` | Handler registrati via `onError`. |
| `isReady` | `boolean` | `private` | Stato di readiness del worker. |

`PendingRequest` è un tipo interno (resolver/rejector e metadati timeout).

`mismatchHandlers` e `errorHandlers` sono **collection TypeScript** (`Set<...>`):
- una collection e una struttura dati che contiene piu elementi omogenei;
- `Set` evita duplicati e rende semplice registrazione/rimozione callback (`add`/`delete`);
- il ritorno di `onError`/`onKeyVersionMismatch` e una funzione `unsubscribe` che rimuove l'handler dal `Set`.

### Timeout hardcoded

La SDK usa timeout **hardcoded** (non configurabili da API pubblica):

- `PING_TIMEOUT_MS = 2000`
- `DECRYPT_TIMEOUT_MS = 5000`
- `BATCH_TIMEOUT_MS = 15000`

### Regole di comportamento

- Nel flusso applicativo standard, il consumer **deve** usare `CryptoOrchestrator.create()`.
- `spawn()` + `waitReady()` sono mantenuti per uso avanzato (test/infrastruttura custom), non come percorso raccomandato.
- Se `decryptEnvelope` viene invocato prima di readiness, rigetta con `WorkerError { code: 'WORKER_NOT_READY' }`.
- Se il Worker non risponde entro timeout, rigetta con `WorkerError { code: 'TIMEOUT' }`.
- `spawn()` e `destroy()` sono idempotenti.

### KeyVersionMismatchHandler

Il tipo del callback registrato da `onKeyVersionMismatch`:

```typescript
type KeyVersionMismatchHandler = (event: KeyVersionMismatchEvent) => void;
```

Internamente `CryptoOrchestrator` mantiene una collezione di handler registrati.

---

## 5. Worker interno (`CryptoWorker`)

Il Worker (`worker.ts`) e nominato `CryptoWorker` nel modello architetturale. E bundlato nella SDK: i consumer non lo importano direttamente.

**Stato interno:**

| Campo | Tipo | Note |
|---|---|---|
| `keyCache` | `Map<string, CryptoKey>` | `extractable: false` |
| `keyVersions` | `Map<string, number>` | Tracking versione chiavi |

`CryptoKey` e il tipo nativo della Web Crypto API (lib DOM TypeScript), restituito da `crypto.subtle.importKey(...)`.
E un tipo interno al worker/runtime: non fa parte dell'API pubblica della SDK.

### Attributi di `CryptoWorker`

| Attributo | Tipo | Visibilità | Scopo |
|---|---|---|---|
| `keyCache` | `Map<string, CryptoKey>` | `private` | Chiavi AES importate e indicizzate per `gatewayId`. |
| `keyVersions` | `Map<string, number>` | `private` | Versione chiave associata a ogni `gatewayId` per rilevare mismatch. |

**Protocollo interno (concettuale):**

| Tipo messaggio | Payload | Risposta |
|---|---|---|
| `init-multi` | `{ keys: GatewayKeyMap }` | `{ type: 'ready' }` |
| `decrypt-stream` | `{ id, envelope }` | `{ type: 'decrypted', id, data }` oppure `{ type: 'error', id, error }` |
| `decrypt-batch` | `{ id, envelopes }` | `{ type: 'progress', data }` x N, poi `{ type: 'batch-complete', id }` |
| `ping` | `-` | `{ type: 'pong' }` |

**Codici di errore gestiti:**

| Codice | Causa | Superficie API |
|---|---|---|
| `KEY_NOT_FOUND` | `gatewayId` non presente in cache | `decryptEnvelope` rigetta + `onError`; in batch incrementa `failed` + `onError` |
| `DECRYPT_FAILED` | `crypto.subtle.decrypt` fallisce | `decryptEnvelope` rigetta + `onError`; in batch incrementa `failed` + `onError` |
| `KEY_VERSION_MISMATCH` | Versione payload diversa da cache | evento `onKeyVersionMismatch` + `onError` |
| `TIMEOUT` | Nessuna risposta dal Worker entro timeout hardcoded | Generato da `CryptoOrchestrator`: `decryptEnvelope` rigetta + `onError`; in batch errore operazione |
| `WORKER_NOT_READY` | Operazione invocata prima della readiness del Worker | Generato da `CryptoOrchestrator`: rigetto immediato + `onError` |

---

## 6. Esempio d'uso

```typescript
import { CryptoOrchestrator, WorkerError } from '@notip/crypto-sdk';

const orchestrator = await CryptoOrchestrator.create();

// Fetch chiavi dal tuo backend
const response = await fetch('/api/mgmt/keys', {
  headers: { Authorization: `Bearer ${myApiKey}` }
});

type KeyResponseItem = { gateway_id: string; key_material: string };

function toGatewayKeyMap(items: KeyResponseItem[]): Record<string, string> {
  return Object.fromEntries(items.map((k) => [k.gateway_id, k.key_material]));
}

const keyItems = (await response.json()) as KeyResponseItem[];
await orchestrator.initializeKeys(toGatewayKeyMap(keyItems));

orchestrator.onError((err: WorkerError) => {
  console.warn('Decrypt error', err.code, err.gatewayId, err.detail);
});

// Recovery esplicito su key rotation
orchestrator.onKeyVersionMismatch(async ({ gatewayId }) => {
  console.warn(`Key rotated for ${gatewayId} - reloading keys`);
  const refreshed = await fetch('/api/mgmt/keys', {
    headers: { Authorization: `Bearer ${myApiKey}` }
  });
  await orchestrator.initializeKeys(toGatewayKeyMap((await refreshed.json()) as KeyResponseItem[]));
});

// Singolo envelope (Promise che rigetta su errore)
const decrypted = await orchestrator.decryptEnvelope(envelope);
console.log(decrypted.value);

// Batch con progress incrementale
for await (const progress of orchestrator.decryptBatch(envelopes)) {
  console.log(`${progress.completed}/${progress.total} failed=${progress.failed}`);
}

orchestrator.destroy();
```

---

## 7. Decisioni architetturali

| Decisione | Alternativa | Motivazione |
|---|---|---|
| Factory method `CryptoOrchestrator.create()` | Solo `spawn()` + `waitReady()` | Riduce errori d'uso e rende lifecycle esplicito nel tipo. |
| `create()` come percorso obbligatorio nel flusso standard | Mantenere equivalenza tra `create()` e `spawn()+waitReady()` nella doc | Riduce ambiguita di integrazione: un solo entrypoint ufficiale, behavior prevedibile e meno errori di sequencing. |
| Timeout hardcoded su `ping`, `decryptEnvelope`, `decryptBatch` | Timeout configurabili via options | API pubblica più semplice e prevedibile; evita configurazioni incoerenti tra consumer. |
| `onError` + errori tipizzati in `decryptEnvelope` | Solo callback mismatch | Espone in modo uniforme `KEY_NOT_FOUND` e `DECRYPT_FAILED` senza silenzi operativi. |
| `DecryptedTelemetry.value: number` | `number | string | object` | Allineato al simulatore attuale: payload sensore numerico. Se il dominio cambia, si estende il tipo in major/minor versioning. |
| Rimozione campo `unit` da `DecryptedTelemetry` | Campo opzionale sempre presente | Nessuna fonte backend/simulatore garantisce `unit`; evitare contratto inventato. |
| `GatewayKeyMap` come `Record<string, string>` | Interfaccia indicizzata | Pratica TypeScript comune per mappe dinamiche; in UML puo essere rappresentata anche come interfaccia indicizzata. |
| DTO OpenAPI interni in snake_case | DTO pubblici/re-esportati | Riduce accoppiamento tra API pubblica SDK e codice generato. |
| Nessun helper pubblico per mapping chiavi | Esporre `KeyDeliveryWire` o re-export DTO keys | SDK piu focalizzata (solo crypto/orchestrazione); fetch e mapping restano responsabilita del consumer. |
| Normalizzazione SSE camelCase in mapper interno | Esporre due DTO pubblici distinti | Mantiene API pubblica stabile (`TelemetryEnvelope` unico) nonostante differenze di wire format. |
| `CryptoWorker` come nome architetturale interno | Worker anonimo/script | Migliora leggibilita dei diagrammi UML e del boundary di composizione con `CryptoOrchestrator`. |

Nota integrazione frontend: la conversione `AsyncIterable -> Observable` resta un dettaglio implementativo dell'adapter Angular (`WorkerOrchestratorService`).
import type { z } from "zod";

import type {
    zEncryptedEnvelopeDto,
    zQueryResponseDto,
} from "./generated/notip-data-api-openapi.js";
import type { zKeysResponseDto } from "./generated/notip-management-api-openapi.js";

export type EncryptedEnvelopeDTO = z.infer<typeof zEncryptedEnvelopeDto>;
export type QueryResponseDTO = z.infer<typeof zQueryResponseDto>;
export type KeyDTO = z.infer<typeof zKeysResponseDto>;

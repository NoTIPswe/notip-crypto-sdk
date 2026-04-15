import type { KeyModel } from "./models.js";

export interface KeyProvider {
    getKey(gatewayId: string, version: number): Promise<KeyModel>;
}

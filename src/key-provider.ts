import type { KeyModel } from "./models";

export interface KeyProvider {
    getKey(gatewayId: string, version: number): Promise<KeyModel>;
}

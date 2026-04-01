import { describe, it, expect, vi } from "vitest";

import type { Config } from "./config.js";
import { ValidationError } from "./errors.js";
import { ManagementApiService } from "./management-api.service.js";
import type { KeyDTO } from "./models.js";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const stubKeys: KeyDTO[] = [
    { gateway_id: "gw-1", key_material: "dGVzdC1rZXk=", key_version: 1 },
    { gateway_id: "gw-2", key_material: "dGVzdC1rZXky", key_version: 2 },
];

function createConfig(fetcher: Config["fetcher"]): Config {
    return {
        baseUrl: "https://api.example.com",
        tokenProvider: () => "test-token",
        fetcher,
    };
}

describe("ManagementApiService", () => {
    it("should validate and map keys to KeyModel", async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse(stubKeys));
        const service = new ManagementApiService(createConfig(fetcher));

        const result = await service.getKeysModel();

        expect(result).toEqual([
            { gatewayId: "gw-1", keyVersion: 1, keyMaterial: "dGVzdC1rZXk=" },
            {
                gatewayId: "gw-2",
                keyVersion: 2,
                keyMaterial: "dGVzdC1rZXky",
            },
        ]);
    });

    it("should propagate ValidationError on invalid response shape", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValue(jsonResponse([{ bad: "data" }]));
        const service = new ManagementApiService(createConfig(fetcher));

        await expect(service.getKeysModel()).rejects.toThrow(ValidationError);
    });
});

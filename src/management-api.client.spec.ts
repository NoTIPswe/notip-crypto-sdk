import { describe, it, expect, vi } from "vitest";

import type { Config } from "./config.js";
import { ApiError, SdkError, ValidationError } from "./errors.js";
import { ManagementApiClient } from "./management-api.client.js";
import type { KeyDTO } from "./models.js";

function createConfig(fetcher: Config["fetcher"]): Config {
    return {
        baseUrl: "https://api.example.com",
        tokenProvider: () => "test-token",
        fetcher,
    };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const stubKeys: KeyDTO[] = [
    { gateway_id: "gw-1", key_material: "dGVzdC1rZXk=", key_version: 1 },
    { gateway_id: "gw-1", key_material: "dGVzdC1rZXky", key_version: 2 },
];

describe("ManagementApiClient", () => {
    describe("getAllKeys", () => {
        it("should fetch all keys with authorization header", async () => {
            const fetcher = vi.fn().mockResolvedValue(jsonResponse(stubKeys));
            const client = new ManagementApiClient(createConfig(fetcher));

            const result = await client.getAllKeys();

            expect(result).toEqual(stubKeys);
            expect(fetcher).toHaveBeenCalledOnce();

            const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("https://api.example.com/mgmt/keys");
            expect((init.headers as Record<string, string>).Authorization).toBe(
                "Bearer test-token"
            );
        });

        it("should throw ApiError on non-ok response", async () => {
            const fetcher = vi
                .fn()
                .mockResolvedValue(
                    jsonResponse(
                        { code: "UNAUTHORIZED", message: "Invalid token" },
                        401
                    )
                );
            const client = new ManagementApiClient(createConfig(fetcher));

            await expect(client.getAllKeys()).rejects.toThrow(ApiError);
        });

        it("should throw ValidationError on invalid DTO shape", async () => {
            const fetcher = vi
                .fn()
                .mockResolvedValue(jsonResponse([{ bad: "shape" }]));
            const client = new ManagementApiClient(createConfig(fetcher));

            await expect(client.getAllKeys()).rejects.toThrow(ValidationError);
        });
    });

    describe("getGatewayKey", () => {
        it("should return the matching key by version", async () => {
            const fetcher = vi.fn().mockResolvedValue(jsonResponse(stubKeys));
            const client = new ManagementApiClient(createConfig(fetcher));

            const result = await client.getGatewayKey("gw-1", 2);

            expect(result).toEqual(stubKeys[1]);

            const [url] = fetcher.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("https://api.example.com/mgmt/keys?id=gw-1");
        });

        it("should throw SdkError when version not found", async () => {
            const fetcher = vi.fn().mockResolvedValue(jsonResponse(stubKeys));
            const client = new ManagementApiClient(createConfig(fetcher));

            await expect(client.getGatewayKey("gw-1", 99)).rejects.toThrow(
                SdkError
            );
        });

        it("should resolve async tokenProvider", async () => {
            const fetcher = vi.fn().mockResolvedValue(jsonResponse(stubKeys));
            const config: Config = {
                baseUrl: "https://api.example.com",
                tokenProvider: () => Promise.resolve("async-token"),
                fetcher,
            };
            const client = new ManagementApiClient(config);

            await client.getGatewayKey("gw-1", 1);

            const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
            expect((init.headers as Record<string, string>).Authorization).toBe(
                "Bearer async-token"
            );
        });
    });
});

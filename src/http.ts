import type { Config } from "./config.js";
import { ApiError } from "./errors.js";

export async function authorizedFetch(
    config: Config,
    path: string,
    init?: RequestInit
): Promise<Response> {
    const token = await config.tokenProvider();
    const fetcher = config.fetcher ?? fetch;

    const response = await fetcher(`${config.baseUrl}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            ...init?.headers,
        },
    });

    if (!response.ok) {
        const body: unknown = await response.json().catch(() => ({}));
        const parsed =
            typeof body === "object" && body !== null
                ? (body as Record<string, unknown>)
                : {};
        throw new ApiError(
            response.status,
            typeof parsed.code === "string" ? parsed.code : undefined,
            typeof parsed.message === "string"
                ? parsed.message
                : `HTTP ${response.status}`
        );
    }

    return response;
}

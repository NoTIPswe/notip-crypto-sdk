import { fetchEventSource } from "@microsoft/fetch-event-source";

import type { Config } from "./config";
import { SdkError, ValidationError } from "./errors";
import { zEncryptedEnvelopeDto } from "./generated/notip-data-api-openapi";
import type { EncryptedEnvelopeDTO } from "./dto";

type ChannelItem<T> =
    | { type: "value"; value: T }
    | { type: "error"; error: unknown }
    | { type: "done" };

interface AsyncQueueChannel<T> {
    push: (value: T) => void;
    error: (err: unknown) => void;
    close: () => void;
    [Symbol.asyncIterator]: () => AsyncGenerator<T>;
}

function createAsyncQueueChannel<T>(): AsyncQueueChannel<T> {
    const queue: ChannelItem<T>[] = [];
    let pendingPull: ((item: ChannelItem<T>) => void) | null = null;

    function enqueue(item: ChannelItem<T>): void {
        if (pendingPull) {
            const resolvePull = pendingPull;
            pendingPull = null;
            resolvePull(item);
        } else {
            queue.push(item);
        }
    }

    function pull(): Promise<ChannelItem<T>> {
        const next = queue.shift();
        if (next) return Promise.resolve(next);
        return new Promise<ChannelItem<T>>((resolvePull) => {
            pendingPull = resolvePull;
        });
    }

    return {
        push: (value: T) => enqueue({ type: "value", value }),
        error: (err: unknown) => enqueue({ type: "error", error: err }),
        close: () => enqueue({ type: "done" }),
        async *[Symbol.asyncIterator]() {
            for (;;) {
                const item = await pull();
                if (item.type === "error") {
                    throw item.error instanceof Error
                        ? item.error
                        : new SdkError("SSE channel error", {
                              cause: item.error,
                          });
                }
                if (item.type === "done") return;
                yield item.value;
            }
        },
    };
}

export class DataApiSseClient {
    constructor(private readonly config: Config) {}

    async *stream(
        params: string,
        signal?: AbortSignal
    ): AsyncGenerator<EncryptedEnvelopeDTO> {
        const token = await this.config.tokenProvider();
        const channel = createAsyncQueueChannel<EncryptedEnvelopeDTO>();
        const abortController = new AbortController();

        signal?.addEventListener(
            "abort",
            () => abortController.abort(signal.reason),
            { once: true }
        );

        const fetchPromise = this.startSseStream(
            params,
            token,
            abortController.signal,
            channel
        );

        try {
            yield* channel[Symbol.asyncIterator]();
        } finally {
            abortController.abort();
            await fetchPromise.catch(() => {});
        }
    }

    private parseStreamEnvelope(data: string): EncryptedEnvelopeDTO {
        let parsed: unknown;
        try {
            parsed = JSON.parse(data);
        } catch (err) {
            throw new ValidationError("Invalid stream envelope", {
                cause: err,
            });
        }

        const validated = zEncryptedEnvelopeDto.safeParse(parsed);
        if (!validated.success) {
            throw new ValidationError("Invalid stream envelope", {
                cause: validated.error,
            });
        }

        return validated.data;
    }

    private startSseStream(
        params: string,
        token: string,
        signal: AbortSignal,
        channel: AsyncQueueChannel<EncryptedEnvelopeDTO>
    ): Promise<void> {
        return fetchEventSource(
            `${this.config.baseUrl}/data/measures/stream?${params}`,
            {
                headers: { Authorization: `Bearer ${token}` },
                signal,
                fetch: this.config.fetcher,
                openWhenHidden: true,
                onmessage: (ev) => {
                    if (!ev.data) return;

                    try {
                        channel.push(this.parseStreamEnvelope(ev.data));
                    } catch (err) {
                        channel.error(err);
                    }
                },
                onclose() {
                    channel.close();
                },
                onerror(err) {
                    channel.error(
                        new SdkError("SSE stream error", { cause: err })
                    );
                    return undefined;
                },
            }
        );
    }
}

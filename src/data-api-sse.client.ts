import { fetchEventSource } from "@microsoft/fetch-event-source";

import type { Config } from "./config.js";
import { SdkError } from "./errors.js";
import type { EncryptedEnvelopeDTO } from "./models.js";

interface QueueItem<T> {
    value?: T;
    done: boolean;
    error?: unknown;
}

function createChannel<T>(): {
    push: (value: T) => void;
    error: (err: unknown) => void;
    close: () => void;
    [Symbol.asyncIterator]: () => AsyncGenerator<T>;
} {
    const queue: QueueItem<T>[] = [];
    let resolve: ((item: QueueItem<T>) => void) | null = null;

    function enqueue(item: QueueItem<T>): void {
        if (resolve) {
            const r = resolve;
            resolve = null;
            r(item);
        } else {
            queue.push(item);
        }
    }

    function pull(): Promise<QueueItem<T>> {
        const next = queue.shift();
        if (next) return Promise.resolve(next);
        return new Promise<QueueItem<T>>((r) => {
            resolve = r;
        });
    }

    return {
        push: (value: T) => enqueue({ value, done: false }),
        error: (err: unknown) => enqueue({ done: true, error: err }),
        close: () => enqueue({ done: true }),
        async *[Symbol.asyncIterator]() {
            for (;;) {
                const item = await pull();
                if (item.error) {
                    throw item.error instanceof Error
                        ? item.error
                        : new SdkError("SSE channel error", {
                              cause: item.error,
                          });
                }
                if (item.done) return;
                yield item.value as T;
            }
        },
    };
}

export class DataApiSseClient {
    constructor(private readonly config: Config) {}

    async *stream(params: string): AsyncGenerator<EncryptedEnvelopeDTO> {
        const token = await this.config.tokenProvider();
        const channel = createChannel<EncryptedEnvelopeDTO>();
        const abortController = new AbortController();

        const fetchPromise = fetchEventSource(
            `${this.config.baseUrl}/measures/stream?${params}`,
            {
                headers: { Authorization: `Bearer ${token}` },
                signal: abortController.signal,
                fetch: this.config.fetcher,
                openWhenHidden: true,
                onmessage(ev) {
                    if (ev.data) {
                        channel.push(
                            JSON.parse(ev.data) as EncryptedEnvelopeDTO
                        );
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

        try {
            yield* channel[Symbol.asyncIterator]();
        } finally {
            abortController.abort();
            await fetchPromise.catch(() => {});
        }
    }
}

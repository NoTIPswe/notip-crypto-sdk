import { fetchEventSource } from "@microsoft/fetch-event-source";

import type { Config } from "./config";
import { SdkError, ValidationError } from "./errors";
import { zEncryptedEnvelopeDto } from "./generated/notip-data-api-openapi";
import type { EncryptedEnvelopeDTO } from "./dto";

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

    async *stream(
        params: string,
        signal?: AbortSignal
    ): AsyncGenerator<EncryptedEnvelopeDTO> {
        const token = await this.config.tokenProvider();
        const channel = createChannel<EncryptedEnvelopeDTO>();
        const abortController = new AbortController();

        signal?.addEventListener(
            "abort",
            () => abortController.abort(signal.reason),
            { once: true }
        );

        const fetchPromise = fetchEventSource(
            `${this.config.baseUrl}/data/measures/stream?${params}`,
            {
                headers: { Authorization: `Bearer ${token}` },
                signal: abortController.signal,
                fetch: this.config.fetcher,
                openWhenHidden: true,
                onmessage(ev) {
                    if (ev.data) {
                        try {
                            const raw: unknown = JSON.parse(ev.data);
                            const validated =
                                zEncryptedEnvelopeDto.safeParse(raw);
                            if (!validated.success) {
                                channel.error(
                                    new ValidationError(
                                        "Invalid stream envelope",
                                        {
                                            cause: validated.error,
                                        }
                                    )
                                );
                                return;
                            }
                            channel.push(validated.data);
                        } catch (err) {
                            channel.error(
                                new ValidationError("Invalid stream envelope", {
                                    cause: err,
                                })
                            );
                        }
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

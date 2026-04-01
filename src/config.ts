export interface Config {
    baseUrl: string;
    tokenProvider: () => string | Promise<string>;
    fetcher?: typeof fetch;
}

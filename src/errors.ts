export class SdkError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "SdkError";
    }
}

export class ApiError extends SdkError {
    constructor(
        public readonly status: number,
        public readonly code: string | undefined,
        message: string
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export class ValidationError extends SdkError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ValidationError";
    }
}

export class DecryptionError extends SdkError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "DecryptionError";
    }
}

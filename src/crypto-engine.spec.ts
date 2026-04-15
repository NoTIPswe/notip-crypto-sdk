import { describe, it, expect } from "vitest";

import { CryptoEngine } from "./crypto-engine";
import { DecryptionError } from "./errors";

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

async function generateKey(): Promise<CryptoKey> {
    return globalThis.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

async function encrypt(
    plaintext: string,
    key: CryptoKey,
    iv: Uint8Array
): Promise<{ ciphertextHex: string; authTagHex: string }> {
    const encoded = new TextEncoder().encode(plaintext);
    const ivArr = new Uint8Array(new ArrayBuffer(iv.length));
    ivArr.set(iv);
    const encrypted = await globalThis.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: ivArr, tagLength: 128 },
        key,
        encoded
    );

    const encryptedBytes = new Uint8Array(encrypted);
    // AES-GCM output: ciphertext || authTag (last 16 bytes)
    const ciphertext = encryptedBytes.slice(0, -16);
    const authTag = encryptedBytes.slice(-16);

    return {
        ciphertextHex: bytesToHex(ciphertext),
        authTagHex: bytesToHex(authTag),
    };
}

describe("CryptoEngine", () => {
    const engine = new CryptoEngine();

    it("should decrypt AES-GCM encrypted JSON", async () => {
        const key = await generateKey();
        const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
        const payload = { value: 23.5, unit: "°C" };

        const { ciphertextHex, authTagHex } = await encrypt(
            JSON.stringify(payload),
            key,
            iv
        );

        const result = await engine.decrypt(
            ciphertextHex,
            key,
            bytesToHex(iv),
            authTagHex
        );

        expect(result).toEqual(payload);
    });

    it("should throw DecryptionError on wrong key", async () => {
        const key = await generateKey();
        const wrongKey = await generateKey();
        const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

        const { ciphertextHex, authTagHex } = await encrypt(
            JSON.stringify({ value: 1 }),
            key,
            iv
        );

        await expect(
            engine.decrypt(ciphertextHex, wrongKey, bytesToHex(iv), authTagHex)
        ).rejects.toThrow(DecryptionError);
    });

    it("should throw DecryptionError on tampered authTag", async () => {
        const key = await generateKey();
        const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

        const { ciphertextHex } = await encrypt(
            JSON.stringify({ value: 1 }),
            key,
            iv
        );

        const tamperedTag = "00".repeat(16);

        await expect(
            engine.decrypt(ciphertextHex, key, bytesToHex(iv), tamperedTag)
        ).rejects.toThrow(DecryptionError);
    });

    it("should handle empty JSON object", async () => {
        const key = await generateKey();
        const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

        const { ciphertextHex, authTagHex } = await encrypt(
            JSON.stringify({}),
            key,
            iv
        );

        const result = await engine.decrypt(
            ciphertextHex,
            key,
            bytesToHex(iv),
            authTagHex
        );

        expect(result).toEqual({});
    });
});

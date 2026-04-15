import { DecryptionError } from "./errors";

export class CryptoEngine {
    async decrypt(
        encryptedHex: string,
        key: CryptoKey,
        ivHex: string,
        authTagHex: string
    ): Promise<unknown> {
        try {
            const ciphertext = this.hexToBytes(encryptedHex);
            const iv = this.hexToBytes(ivHex);
            const authTag = this.hexToBytes(authTagHex);

            // AES-GCM expects ciphertext || authTag as input
            const combined = new Uint8Array(ciphertext.length + authTag.length);
            combined.set(ciphertext);
            combined.set(authTag, ciphertext.length);

            const plainBuffer = await globalThis.crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                key,
                combined
            );

            const plaintext = new TextDecoder().decode(plainBuffer);
            return JSON.parse(plaintext) as unknown;
        } catch (error) {
            throw new DecryptionError("Decryption failed", { cause: error });
        }
    }

    private hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
        const buffer = new ArrayBuffer(hex.length / 2);
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
        }
        return bytes;
    }
}

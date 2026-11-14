/**
 * crypto.js — Client-Side End-to-End Encryption (AES-GCM 256-bit + PBKDF2)
 *             with Native Stream Compression (Gzip / Deflate)
 *
 * Uses native Web APIs:
 * - Compression: CompressionStream('gzip') / DecompressionStream('gzip')
 *   Shrinks financial JSON by ~85% before encryption and removes repetitive plaintext patterns.
 * - Key Derivation: PBKDF2 (SHA-256, 100,000 iterations, unique random salt per payload)
 * - Cipher: AES-GCM (256-bit key, 12-byte initialization vector IV)
 *
 * All compression, encryption, and decryption happen strictly in the user's browser.
 * The server (Supabase) only ever sees compressed, encrypted ciphertext.
 */

// Convert ArrayBuffer / Uint8Array to Base64
const bufferToBase64 = (buf) => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

// Convert Base64 to ArrayBuffer
const base64ToBuffer = (b64) => {
    const binary = window.atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

// Compress a byte array using native CompressionStream('gzip')
const compressBytes = async (inputBytes) => {
    if (typeof CompressionStream === 'function') {
        const stream = new Response(inputBytes).body.pipeThrough(new CompressionStream('gzip'));
        const compressedBuffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(compressedBuffer);
    }
    // Fallback if CompressionStream unavailable
    return inputBytes;
};

// Decompress a byte array using native DecompressionStream('gzip')
const decompressBytes = async (compressedBytes) => {
    if (typeof DecompressionStream === 'function') {
        const stream = new Response(compressedBytes).body.pipeThrough(new DecompressionStream('gzip'));
        const decompressedBuffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(decompressedBuffer);
    }
    // Fallback
    return compressedBytes;
};

// Derive an AES-GCM CryptoKey from a user password and salt
const deriveKey = async (password, saltBuffer) => {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltBuffer,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
};

/**
 * Encrypt any JSON-serializable object with a passphrase.
 * Pipeline: JSON String -> Gzip Compression -> AES-GCM 256-bit Encryption -> Base64 Envelope
 */
export const encryptPayload = async (dataObj, passphrase) => {
    if (!passphrase) {
        throw new Error("Encryption passphrase is required.");
    }

    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await deriveKey(passphrase, salt);

    const jsonStr = JSON.stringify(dataObj);
    const rawBytes = new TextEncoder().encode(jsonStr);

    // 1. Compress with gzip (shrinks JSON by ~80-85%)
    const compressedBytes = await compressBytes(rawBytes);

    // 2. Encrypt the compressed bytes with AES-GCM
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        aesKey,
        compressedBytes
    );

    return {
        isEncrypted: true,
        isCompressed: typeof CompressionStream === 'function',
        version: 2,
        salt: bufferToBase64(salt),
        iv: bufferToBase64(iv),
        ciphertext: bufferToBase64(ciphertextBuffer),
        timestamp: new Date().toISOString()
    };
};

/**
 * Decrypt an encrypted envelope object using the user's passphrase.
 * Pipeline: Base64 Envelope -> AES-GCM Decryption -> Gzip Decompression (if compressed) -> JSON Parse
 */
export const decryptPayload = async (envelope, passphrase) => {
    if (!envelope || !envelope.isEncrypted || !envelope.ciphertext) {
        // If not encrypted (e.g. legacy plain payload), return as-is
        return envelope;
    }

    if (!passphrase) {
        throw new Error("Passphrase required to decrypt financial data.");
    }

    const saltBuffer = base64ToBuffer(envelope.salt);
    const ivBuffer = base64ToBuffer(envelope.iv);
    const ciphertextBuffer = base64ToBuffer(envelope.ciphertext);

    const aesKey = await deriveKey(passphrase, saltBuffer);

    try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: new Uint8Array(ivBuffer)
            },
            aesKey,
            ciphertextBuffer
        );

        // Decompress if envelope was compressed (v2+)
        let plainBytes;
        if (envelope.isCompressed) {
            plainBytes = await decompressBytes(new Uint8Array(decryptedBuffer));
        } else {
            plainBytes = new Uint8Array(decryptedBuffer);
        }

        const decodedStr = new TextDecoder().decode(plainBytes);
        return JSON.parse(decodedStr);
    } catch (err) {
        throw new Error("Invalid password or corrupted data. Decryption failed.");
    }
};

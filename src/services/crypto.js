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
export const encryptPayload = async (dataObj, passphrase, { recoveryPublicKey = null } = {}) => {
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

    const envelope = {
        isEncrypted: true,
        isCompressed: typeof CompressionStream === 'function',
        version: 2,
        salt: bufferToBase64(salt),
        iv: bufferToBase64(iv),
        ciphertext: bufferToBase64(ciphertextBuffer),
        timestamp: new Date().toISOString()
    };
    // Optional recovery blob (see "recovery kit" below). It sits beside the ciphertext and is ignored by decryptPayload.
    if (recoveryPublicKey) {
        envelope.recovery = await wrapForRecovery(passphrase, recoveryPublicKey);
    }
    return envelope;
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

// ───────────────────────── Recovery kit ─────────────────────────
// The cloud copy is encrypted with the account password. If that password is forgotten (or changed through the
// e-mail reset, which cannot know the old one), the data is unreadable. A recovery kit is an RSA key pair made once:
//   • the PUBLIC key is kept in your settings and used on every save to seal the current password into
//     `envelope.recovery` (only the private key can open it);
//   • the PRIVATE key is downloaded as a file you keep offline.
// With the kit, the old password can be recovered and the data decrypted; the next save re-seals the new password.

const RSA_PARAMS = { name: 'RSA-OAEP', hash: 'SHA-256' };

const keyId = async (publicJwk) => {
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(publicJwk.n || '')));
    return Array.from(new Uint8Array(digest)).slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const generateRecoveryKit = async () => {
    const pair = await window.crypto.subtle.generateKey(
        { ...RSA_PARAMS, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']
    );
    const publicKey = await window.crypto.subtle.exportKey('jwk', pair.publicKey);
    const privateKey = await window.crypto.subtle.exportKey('jwk', pair.privateKey);
    return { publicKey, privateKey, kid: await keyId(publicKey) };
};

export const wrapForRecovery = async (secret, publicJwk) => {
    const key = await window.crypto.subtle.importKey('jwk', publicJwk, RSA_PARAMS, false, ['encrypt']);
    const ct = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, new TextEncoder().encode(String(secret)));
    return { v: 1, alg: 'RSA-OAEP-256', kid: await keyId(publicJwk), ct: bufferToBase64(ct) };
};

/** Open an envelope's recovery blob with the private key from the kit file; returns the sealed password. */
export const recoverSecret = async (recoveryBlob, privateJwk) => {
    if (!recoveryBlob || !recoveryBlob.ct) throw new Error('This cloud copy has no recovery data. It was saved before a recovery kit was created.');
    let key;
    try {
        key = await window.crypto.subtle.importKey('jwk', privateJwk, RSA_PARAMS, false, ['decrypt']);
    } catch (e) {
        throw new Error('The recovery kit file is not valid.');
    }
    if (recoveryBlob.kid && privateJwk && privateJwk.n && (await keyId(privateJwk)) !== recoveryBlob.kid) {
        throw new Error('This recovery kit does not match the cloud copy (a newer kit was created, or it belongs to another account).');
    }
    try {
        const plain = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, base64ToBuffer(recoveryBlob.ct));
        return new TextDecoder().decode(plain);
    } catch (e) {
        throw new Error('The recovery kit could not open the cloud copy.');
    }
};

/** Parse the text of a kit file (as downloaded) into its private key. */
export const parseRecoveryKit = (text) => {
    let kit;
    try { kit = JSON.parse(text); } catch (e) { throw new Error('That is not a recovery kit file.'); }
    if (!kit || kit.type !== 'financials-recovery-kit' || !kit.privateKey) throw new Error('That is not a recovery kit file.');
    return kit;
};

export const buildRecoveryKitFile = ({ privateKey, kid, email = '' }) => JSON.stringify({
    type: 'financials-recovery-kit',
    version: 1,
    kid,
    email,
    createdAt: new Date().toISOString(),
    warning: 'Keep this file offline and private. With it, anyone who can also read your cloud copy can unlock your financial data. It cannot be re-downloaded; create a new kit if you lose it.',
    privateKey
}, null, 2);

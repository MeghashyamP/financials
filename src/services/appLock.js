/**
 * appLock.js — an on-screen lock for the app (not encryption).
 *
 * A passphrase is stored only as a salted PBKDF2-SHA256 verifier in this browser's localStorage, so the app can ask
 * for it on open and after idle time. It keeps a shared or unattended screen private. It does NOT encrypt the data
 * in IndexedDB — someone with developer tools on this browser profile can still read it; cloud sync is the
 * encrypted copy.
 */

export const LOCK_KEY = 'app_lock_v1';
export const PRIVACY_KEY = 'privacy_mode_v1';
export const MIN_PASSPHRASE = 6;
const ITERATIONS = 150000;

const defaultStore = () => (typeof localStorage !== 'undefined' ? localStorage : null);

const toB64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const derive = async (passphrase, salt, iterations) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
};

const safeRead = (store) => {
    try {
        const raw = store && store.getItem(LOCK_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
};

export const isLockEnabled = (store = defaultStore()) => {
    const rec = safeRead(store);
    return !!(rec && rec.hash && rec.salt);
};

export const getIdleMinutes = (store = defaultStore()) => {
    const rec = safeRead(store);
    return rec && Number.isFinite(rec.idleMinutes) ? rec.idleMinutes : 15;
};

export const setIdleMinutes = (minutes, store = defaultStore()) => {
    const rec = safeRead(store);
    if (!rec) return false;
    rec.idleMinutes = Math.max(0, Number(minutes) || 0);
    store.setItem(LOCK_KEY, JSON.stringify(rec));
    return true;
};

export const createLock = async (passphrase, { idleMinutes = 15, store = defaultStore() } = {}) => {
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE) {
        throw new Error(`Use at least ${MIN_PASSPHRASE} characters.`);
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(passphrase, salt, ITERATIONS);
    store.setItem(LOCK_KEY, JSON.stringify({ v: 1, salt: toB64(salt), hash: toB64(hash), iterations: ITERATIONS, idleMinutes, createdAt: new Date().toISOString() }));
};

export const verifyPassphrase = async (passphrase, store = defaultStore()) => {
    const rec = safeRead(store);
    if (!rec || typeof passphrase !== 'string') return false;
    try {
        const expected = fromB64(rec.hash);
        const actual = await derive(passphrase, fromB64(rec.salt), rec.iterations || ITERATIONS);
        if (expected.length !== actual.length) return false;
        let diff = 0;
        for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
        return diff === 0;
    } catch (e) { return false; }
};

/** Removing the lock requires the current passphrase. */
export const removeLock = async (passphrase, store = defaultStore()) => {
    if (!(await verifyPassphrase(passphrase, store))) return false;
    store.removeItem(LOCK_KEY);
    return true;
};

/** Forgotten passphrase: the only way back in is to drop the lock, which the UI pairs with erasing local data. */
export const forceRemoveLock = (store = defaultStore()) => { try { store.removeItem(LOCK_KEY); } catch (e) { /* ignore */ } };

export const readPrivacyDefault = (store = defaultStore()) => {
    try { return store.getItem(PRIVACY_KEY) === '1'; } catch (e) { return false; }
};
export const writePrivacyDefault = (on, store = defaultStore()) => {
    try { store.setItem(PRIVACY_KEY, on ? '1' : '0'); } catch (e) { /* storage unavailable */ }
};

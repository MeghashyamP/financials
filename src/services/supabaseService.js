import { createClient } from '@supabase/supabase-js';
import { fetchStateFromDB, initDB, saveSettingInDB, saveTagInDB, saveRuleInDB, saveDocumentInDB, wipeDatabase } from '../store.js';
import { restoreBackup } from './backup.js';
import { encryptPayload, decryptPayload, recoverSecret } from './crypto.js';
import { DEFAULT_CATEGORIES, stripLocalOnlySettings, normalizeCategoryName } from './categories.js';

const SUPABASE_URL = "https://gsdddichdmfpmdbufmad.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_23pX17k4nzfpmiiubWbSUA_0OCA_UCW";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// Helper: Prune empty/null fields from a transaction object to save bytes
const compactTransaction = (tx) => {
    if (!tx || typeof tx !== 'object') return tx;
    const clean = {};
    for (const [key, val] of Object.entries(tx)) {
        if (val === null || val === undefined || val === "") continue;
        if (Array.isArray(val) && val.length === 0) continue;
        clean[key] = val;
    }
    return clean;
};

// Helper: Prune redundant default categories from settings before syncing
const optimizeSettingsForSync = (settingsObj = {}) => {
    const cleanSettings = stripLocalOnlySettings(settingsObj);
    if (Array.isArray(cleanSettings.categories)) {
        // Compare with DEFAULT_CATEGORIES; if it contains only defaults, omit it
        const isDefaultList = cleanSettings.categories.length === DEFAULT_CATEGORIES.length &&
            cleanSettings.categories.every((c, i) => c === DEFAULT_CATEGORIES[i]);

        if (isDefaultList) {
            delete cleanSettings.categories;
        } else {
            // Keep only custom added categories (names not matching any default category)
            const defaultNormSet = new Set(DEFAULT_CATEGORIES.map(normalizeCategoryName));
            const customOnly = cleanSettings.categories.filter(c => !defaultNormSet.has(normalizeCategoryName(c)));
            if (customOnly.length === 0) {
                delete cleanSettings.categories;
            } else {
                cleanSettings.customCategories = customOnly;
                delete cleanSettings.categories;
            }
        }
    }
    return cleanSettings;
};

// Helper: Rehydrate pruned settings on restore
const rehydrateSettingsFromSync = (settingsObj = {}) => {
    const hydrated = { ...settingsObj };
    if (hydrated.customCategories && Array.isArray(hydrated.customCategories)) {
        hydrated.categories = [...DEFAULT_CATEGORIES, ...hydrated.customCategories];
        delete hydrated.customCategories;
    } else if (!hydrated.categories) {
        hydrated.categories = DEFAULT_CATEGORIES;
    }
    return hydrated;
};

// While a sign-in is deciding between the cloud copy and the local copy, automatic
// pushes must wait, or they could upload local data over the cloud copy mid-restore.
let cloudSyncPaused = false;
export const setCloudSyncPaused = (paused) => { cloudSyncPaused = Boolean(paused); };
export const isCloudSyncPaused = () => cloudSyncPaused;

// Content fingerprint of the synced state, used to skip pushes when nothing changed.
// Covers every field, so edits that keep array lengths the same are still detected.
export const hashSyncState = ({ transactions = [], tags = [], rules = [], settings = {}, documents = [] } = {}) => {
    const str = JSON.stringify([transactions, tags, rules, stripLocalOnlySettings(settings), documents]);
    let h = 0x811c9dc5; // FNV-1a 32-bit
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return `${str.length}:${(h >>> 0).toString(16)}`;
};

// The encryption key (your password) is remembered on this device so you stay signed in and syncing after a restart,
// a new tab or the installed app being reopened. It sits next to the data it protects (the local database is not
// encrypted either), and signing out removes it. It never leaves the device.
let sessionEncryptionKey = null;
const KEY_STORE = 'fin_enc_key';

const safeStorage = (kind) => { try { return typeof window !== 'undefined' ? window[kind] : null; } catch (e) { return null; } };

export const setSessionEncryptionKey = (passphrase) => {
    sessionEncryptionKey = passphrase || null;
    const local = safeStorage('localStorage');
    const session = safeStorage('sessionStorage');
    try {
        if (passphrase) local && local.setItem(KEY_STORE, passphrase);
        else local && local.removeItem(KEY_STORE);
        session && session.removeItem(KEY_STORE); // older versions kept it here
    } catch (e) { /* storage unavailable: the key then only lives in memory */ }
};

export const getSessionEncryptionKey = () => {
    if (!sessionEncryptionKey) {
        try {
            const local = safeStorage('localStorage');
            const session = safeStorage('sessionStorage');
            sessionEncryptionKey = (local && local.getItem(KEY_STORE)) || (session && session.getItem(KEY_STORE)) || null;
            if (sessionEncryptionKey && local && !local.getItem(KEY_STORE)) local.setItem(KEY_STORE, sessionEncryptionKey); // migrate
        } catch (e) { sessionEncryptionKey = null; }
    }
    return sessionEncryptionKey;
};

// Which cloud copy this device last downloaded or uploaded: the cloud row's own updated_at text, exactly as the server
// returned it. If the cloud row differs from this, another device has saved since.
const VERSION_STORE = 'fin_cloud_version';
export const getCloudVersion = () => {
    try { return safeStorage('localStorage')?.getItem(VERSION_STORE) || null; } catch (e) { return null; }
};
export const setCloudVersion = (v) => {
    try {
        const ls = safeStorage('localStorage');
        if (ls && v) ls.setItem(VERSION_STORE, String(v)); else if (ls) ls.removeItem(VERSION_STORE);
    } catch (e) { /* ignore */ }
};
export class CloudConflictError extends Error {
    constructor() { super('Another device saved to the cloud first.'); this.name = 'CloudConflictError'; }
}

/** Cheap check (no download of the data): when was the cloud copy last saved, by anyone? null = nothing there yet. */
export const fetchCloudVersion = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.from('user_financials').select('updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data ? data.updated_at : null;
};

// Authentication helpers
export const signUpUser = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
        }
    });
    if (error) throw error;
    setSessionEncryptionKey(password);
    return data;
};

export const resendVerificationEmail = async (email) => {
    const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
            emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
        }
    });
    if (error) throw error;
};

export const verifyOtpCode = async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup'
    });
    if (error) throw error;
    return data;
};

export const sendPasswordResetEmail = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
    });
    if (error) throw error;
    return data;
};

export const verifyRecoveryOtp = async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'recovery'
    });
    if (error) throw error;
    return data;
};

export const updateUserPassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
        password: newPassword
    });
    if (error) throw error;
    setSessionEncryptionKey(newPassword);
    return data;
};

export const signInUser = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setSessionEncryptionKey(password);
    return data;
};

export const signOutUser = async () => {
    setSessionEncryptionKey(null);
    setCloudVersion(null);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
};

export const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};

// Sync state up to Supabase (Encrypted with client AES-GCM 256-bit)
// `expectVersion` (the cloud version this device last saw, or null if none existed) makes the save conditional: if another
// device saved in the meantime nothing is overwritten and a CloudConflictError is thrown so the caller can merge first.
export const saveUserDataToCloud = async (state, customKey = null, { expectVersion } = {}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const encKey = customKey || getSessionEncryptionKey();
    if (!encKey) {
        throw new Error("Encryption key not found in session. Please sign in again.");
    }

    // 1. Filter out bulky binary or unnecessary fields from documents (never store fileData blobs in cloud)
    const cleanDocuments = (state.documents || []).map(d => {
        const { fileData, ...clean } = d;
        return clean;
    });

    // 2. Compact transactions (omit empty strings, nulls, and empty arrays)
    const compactTxs = (state.transactions || []).map(compactTransaction);

    // 3. Prune redundant default categories from settings
    const cleanSettings = optimizeSettingsForSync(state.settings || {});

    const plainPayload = {
        version: "2.0",
        syncedAt: new Date().toISOString(),
        transactions: compactTxs,
        tags: state.tags || [],
        rules: state.rules || [],
        settings: cleanSettings,
        documents: cleanDocuments
    };

    // Encrypt the payload (runs CompressionStream gzip + AES-GCM 256)
    // If a recovery kit exists, its public key (kept in settings) seals the current password into the envelope.
    const encryptedPayload = await encryptPayload(plainPayload, encKey, { recoveryPublicKey: (state.settings || {}).recoveryPublicKey || null });

    const savedAt = new Date().toISOString();
    let saved = null;
    if (expectVersion === undefined) {
        const { data: row, error } = await supabase.from('user_financials')
            .upsert({ user_id: user.id, data: encryptedPayload, updated_at: savedAt }, { onConflict: 'user_id' })
            .select('updated_at').maybeSingle();
        if (error) { console.error("Failed to save data to Supabase:", error); throw error; }
        saved = row;
    } else if (expectVersion === null) {
        const { data: row, error } = await supabase.from('user_financials')
            .insert({ user_id: user.id, data: encryptedPayload, updated_at: savedAt })
            .select('updated_at').maybeSingle();
        if (error) {
            if (error.code === '23505') throw new CloudConflictError();
            console.error("Failed to save data to Supabase:", error); throw error;
        }
        saved = row;
    } else {
        const { data: rows, error } = await supabase.from('user_financials')
            .update({ data: encryptedPayload, updated_at: savedAt })
            .eq('user_id', user.id).eq('updated_at', expectVersion)
            .select('updated_at');
        if (error) { console.error("Failed to save data to Supabase:", error); throw error; }
        if (!rows || rows.length === 0) throw new CloudConflictError();
        saved = rows[0];
    }
    setCloudVersion((saved && saved.updated_at) || savedAt);
    return plainPayload;
};

// Fetch state down from Supabase and decrypt on the client
export const fetchUserDataFromCloud = async (customKey = null, { recoveryKit = null } = {}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const encKey = customKey || getSessionEncryptionKey();

    const { data, error } = await supabase
        .from('user_financials')
        .select('data, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        console.error("Failed to fetch data from Supabase:", error);
        throw error;
    }

    if (!data || !data.data) return null;

    // Check if payload is encrypted
    let payload = data.data;
    let recoveredViaKit = false;
    if (data.data.isEncrypted) {
        if (!encKey) {
            return { needsPassword: true, raw: data.data };
        }
        try {
            payload = await decryptPayload(data.data, encKey);
        } catch (decryptErr) {
            // Wrong / changed password. A recovery kit can open the envelope's sealed copy of the password it was saved with.
            if (!recoveryKit || !recoveryKit.privateKey) throw decryptErr;
            const oldPassword = await recoverSecret(data.data.recovery, recoveryKit.privateKey);
            payload = await decryptPayload(data.data, oldPassword);
            recoveredViaKit = true;
        }
    }

    // Rehydrate settings (re-attach default categories if pruned)
    if (payload && payload.settings) {
        payload.settings = rehydrateSettingsFromSync(payload.settings);
    }

    if (recoveredViaKit && payload && typeof payload === 'object') payload.recoveredViaKit = true;
    if (payload && typeof payload === 'object') payload.cloudVersion = data.updated_at;
    return payload;
};

/**
 * Check a kit file against the cloud copy WITHOUT changing anything: does it open the sealed password, and does that
 * password really decrypt the cloud data?
 */
export const testRecoveryKit = async (recoveryKit) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sign in first.');
    const { data, error } = await supabase.from('user_financials').select('data').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!data || !data.data || !data.data.isEncrypted) throw new Error('There is no encrypted cloud copy to test against yet.');
    const password = await recoverSecret(data.data.recovery, recoveryKit.privateKey);
    await decryptPayload(data.data, password);
    return true;
};

// Restore cloud state into local IndexedDB
export const syncCloudToLocal = async (cloudData) => {
    if (!cloudData) return;
    const version = cloudData.cloudVersion;
    const result = await restoreBackup(cloudData, {
        initDB,
        saveSettingInDB,
        saveTagInDB,
        saveRuleInDB,
        saveDocumentInDB,
        wipeDatabase
    });
    if (version) setCloudVersion(version);
    return result;
};

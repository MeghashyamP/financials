import { createClient } from '@supabase/supabase-js';
import { fetchStateFromDB, initDB, saveSettingInDB, saveTagInDB, saveRuleInDB, saveDocumentInDB, wipeDatabase } from '../store.js';
import { restoreBackup } from './backup.js';
import { encryptPayload, decryptPayload } from './crypto.js';
import { DEFAULT_CATEGORIES, stripLocalOnlySettings } from '../utils.jsx';

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
            // Keep only custom added categories
            const customOnly = cleanSettings.categories.filter(c => !DEFAULT_CATEGORIES.includes(c));
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

// In-memory key caching for active session encryption
let sessionEncryptionKey = null;

export const setSessionEncryptionKey = (passphrase) => {
    sessionEncryptionKey = passphrase;
    if (passphrase) {
        sessionStorage.setItem('fin_enc_key', passphrase);
    } else {
        sessionStorage.removeItem('fin_enc_key');
    }
};

export const getSessionEncryptionKey = () => {
    if (!sessionEncryptionKey) {
        sessionEncryptionKey = sessionStorage.getItem('fin_enc_key') || null;
    }
    return sessionEncryptionKey;
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
};

export const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};

// Sync state up to Supabase (Encrypted with client AES-GCM 256-bit)
export const saveUserDataToCloud = async (state, customKey = null) => {
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
    const encryptedPayload = await encryptPayload(plainPayload, encKey);

    const { error } = await supabase
        .from('user_financials')
        .upsert({
            user_id: user.id,
            data: encryptedPayload,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

    if (error) {
        console.error("Failed to save data to Supabase:", error);
        throw error;
    }
    return plainPayload;
};

// Fetch state down from Supabase and decrypt on the client
export const fetchUserDataFromCloud = async (customKey = null) => {
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
    if (data.data.isEncrypted) {
        if (!encKey) {
            return { needsPassword: true, raw: data.data };
        }
        payload = await decryptPayload(data.data, encKey);
    }

    // Rehydrate settings (re-attach default categories if pruned)
    if (payload && payload.settings) {
        payload.settings = rehydrateSettingsFromSync(payload.settings);
    }

    return payload;
};

// Restore cloud state into local IndexedDB
export const syncCloudToLocal = async (cloudData) => {
    if (!cloudData) return;
    return await restoreBackup(cloudData, {
        initDB,
        saveSettingInDB,
        saveTagInDB,
        saveRuleInDB,
        saveDocumentInDB,
        wipeDatabase
    });
};

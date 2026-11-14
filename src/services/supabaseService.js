import { createClient } from '@supabase/supabase-js';
import { fetchStateFromDB, initDB, saveSettingInDB, saveTagInDB, saveRuleInDB, saveDocumentInDB, wipeDatabase } from '../store.js';
import { restoreBackup } from './backup.js';

const SUPABASE_URL = "https://gsdddichdmfpmdbufmad.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_23pX17k4nzfpmiiubWbSUA_0OCA_UCW";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// Authentication helpers
export const signUpUser = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
};

export const signInUser = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
};

export const signOutUser = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
};

export const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};

// Sync state up to Supabase
export const saveUserDataToCloud = async (state) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Filter out bulky binary or unnecessary fields from documents if any
    const cleanDocuments = (state.documents || []).map(d => {
        const { fileData, ...clean } = d;
        return clean;
    });

    const payload = {
        version: "1.0",
        syncedAt: new Date().toISOString(),
        transactions: state.transactions || [],
        tags: state.tags || [],
        rules: state.rules || [],
        settings: state.settings || {},
        documents: cleanDocuments
    };

    const { error } = await supabase
        .from('user_financials')
        .upsert({
            user_id: user.id,
            data: payload,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

    if (error) {
        console.error("Failed to save data to Supabase:", error);
        throw error;
    }
    return payload;
};

// Fetch state down from Supabase
export const fetchUserDataFromCloud = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('user_financials')
        .select('data, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        console.error("Failed to fetch data from Supabase:", error);
        throw error;
    }

    return data ? data.data : null;
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

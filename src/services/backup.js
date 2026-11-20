/**
 * backup.js — Local JSON Export / Import Service
 *
 * exportBackup(): Reads all IndexedDB data and downloads as a .json file.
 * importBackup(): Parses an uploaded .json file and restores all data into IndexedDB.
 */

import { getISOStringInTimezone, stripLocalOnlySettings, LOCAL_ONLY_SETTING_KEYS } from '../utils.jsx';
import { markBackup } from './backupStatus.js';

export const BACKUP_VERSION = 1;

// ---------------------------------------------------------------------------
// EXPORT — serialize all app data → download as JSON file
// ---------------------------------------------------------------------------
export const exportBackup = async (state) => {
    const { transactions = [], tags = [], rules = [], settings = {}, documents = [] } = state;

    // Strip binary blobs — never export fileData
    const cleanDocuments = documents.map(({ fileData, ...rest }) => rest);

    const tz = settings?.timezone || "Asia/Calcutta";
    const exportedAt = getISOStringInTimezone(new Date(), tz);

    const backup = {
        version: BACKUP_VERSION,
        exportedAt,
        appVersion: "1.0.0",
        settings: stripLocalOnlySettings(settings),
        tags,
        rules,
        transactions,
        documents: cleanDocuments,
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const today = exportedAt.slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financials-backup-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    markBackup('file');

    return {
        transactions: transactions.length,
        tags: tags.length,
        rules: rules.length,
        documents: cleanDocuments.length,
    };
};

// ---------------------------------------------------------------------------
// IMPORT — parse uploaded .json file, return parsed data for confirmation
// ---------------------------------------------------------------------------
export const importBackup = (file) => {
    return new Promise((resolve, reject) => {
        if (!file || !file.name.toLowerCase().endsWith(".json")) {
            return reject(new Error("Please select a valid .json backup file."));
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const backup = JSON.parse(e.target.result);
                if (!backup.version && !backup.transactions && !backup.settings) {
                    return reject(new Error("Invalid backup file format. Missing required fields."));
                }
                resolve(backup);
            } catch {
                reject(new Error("Failed to parse backup file. Please ensure it is a valid JSON file."));
            }
        };
        reader.onerror = () => reject(new Error("Failed to read the file."));
        reader.readAsText(file);
    });
};

// ---------------------------------------------------------------------------
// RESTORE — write parsed backup data into IndexedDB
// ---------------------------------------------------------------------------
export const restoreBackup = async (backup, {
    initDB,
    saveSettingInDB,
    saveTagInDB,
    saveRuleInDB,
    saveDocumentInDB,
    wipeDatabase,
}) => {
    // 1. Wipe existing data first
    await wipeDatabase();

    const db = await initDB();

    // 2. Restore settings
    if (backup.settings && typeof backup.settings === "object") {
        for (const [key, value] of Object.entries(backup.settings)) {
            // Older backups may still carry browser-local secrets; don't bring them back.
            if (LOCAL_ONLY_SETTING_KEYS.includes(key)) continue;
            await saveSettingInDB(key, value);
        }
    }

    // 3. Restore tags
    if (Array.isArray(backup.tags)) {
        for (const tag of backup.tags) {
            await saveTagInDB(tag);
        }
    }

    // 4. Restore rules
    if (Array.isArray(backup.rules)) {
        for (const rule of backup.rules) {
            await saveRuleInDB(rule);
        }
    }

    // 5. Restore transactions via put (maintains fingerprint uniqueness)
    if (Array.isArray(backup.transactions) && backup.transactions.length > 0) {
        await new Promise((resolve, reject) => {
            const tx = db.transaction("transactions", "readwrite");
            const store = tx.objectStore("transactions");
            backup.transactions.forEach(t => {
                if (!t.fingerprint) t.fingerprint = `${t.date}-${t.narration}-${t.amount}`;
                store.put(t);
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // 6. Restore document metadata — never restore fileData blobs
    if (Array.isArray(backup.documents)) {
        for (const doc of backup.documents) {
            const { fileData, ...cleanDoc } = doc;
            await saveDocumentInDB(cleanDoc);
        }
    }

    return {
        transactions: (backup.transactions || []).length,
        tags: (backup.tags || []).length,
        rules: (backup.rules || []).length,
        documents: (backup.documents || []).length,
    };
};

/**
 * syncState.js — what this device remembers about the cloud:
 *   base  : the data exactly as it was at the last sync (for the three-way merge), kept in its own small IndexedDB
 *   log   : the last events ("Uploaded 14:02", "Merged from another device …") shown in Settings
 */
const DB = 'FinancialsSyncBase';

const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

export const loadSyncBase = async () => {
    try {
        const db = await open();
        return await new Promise((resolve) => {
            const r = db.transaction('kv').objectStore('kv').get('base');
            r.onsuccess = () => resolve(r.result || null);
            r.onerror = () => resolve(null);
        });
    } catch (e) { return null; }
};

export const saveSyncBase = async (shape) => {
    try {
        const db = await open();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(shape, 'base');
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) { console.warn('Could not save the sync base:', e); }
};

const LOG_KEY = 'fin_sync_log';
const LOG_MAX = 30;
export const getSyncLog = () => {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) { return []; }
};
export const addSyncLog = (kind, message) => {
    const entry = { t: Date.now(), kind, message };
    try { localStorage.setItem(LOG_KEY, JSON.stringify([entry, ...getSyncLog()].slice(0, LOG_MAX))); } catch (e) { /* ignore */ }
    return entry;
};

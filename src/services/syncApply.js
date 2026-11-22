/**
 * syncApply.js — write a merged state into the local database WITHOUT wiping it:
 * only what differs is added / changed / removed, so PDF blobs kept on this device and device-only settings survive.
 */
import { initDB } from '../store.js';
import { LOCAL_ONLY_SETTING_KEYS } from './categories.js';
import { canon } from './syncMerge.js';

const getAll = (db, name) => new Promise((resolve) => {
    const req = db.transaction(name, 'readonly').objectStore(name).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
});

export const applySyncShape = async (merged) => {
    const db = await initDB();
    const [curTx, curTags, curRules, curDocs, curSettings] = await Promise.all(
        ['transactions', 'tags', 'rules', 'documents', 'settings'].map((n) => getAll(db, n))
    );
    await new Promise((resolve, reject) => {
        const tx = db.transaction(['transactions', 'tags', 'rules', 'documents', 'settings'], 'readwrite');
        const sync = (storeName, current, next, keyOf, build = (x) => x) => {
            const store = tx.objectStore(storeName);
            const wanted = new Map(next.map((x) => [keyOf(x), x]));
            const have = new Map(current.map((x) => [keyOf(x), x]));
            for (const key of have.keys()) if (!wanted.has(key)) store.delete(key);
            for (const [key, item] of wanted) {
                const existing = have.get(key);
                if (existing && JSON.stringify(canon(existing)) === JSON.stringify(canon(item))) continue; // unchanged
                const req = store.put(build(item, existing));
                req.onerror = (e) => { e.preventDefault(); e.stopPropagation(); }; // e.g. fingerprint clash: skip that one
            }
        };
        sync('transactions', curTx, merged.transactions, (x) => x.id);
        sync('tags', curTags, merged.tags, (x) => x.name);
        sync('rules', curRules, merged.rules, (x) => x.id);
        sync('documents', curDocs, merged.documents, (x) => x.id, (doc, existing) => (existing && existing.fileData ? { ...doc, fileData: existing.fileData } : doc));

        const settings = tx.objectStore('settings');
        const nextSettings = merged.settings || {};
        const now = new Date().toISOString();
        for (const row of curSettings) {
            if (LOCAL_ONLY_SETTING_KEYS.includes(row.key)) continue;
            if (!(row.key in nextSettings)) settings.delete(row.key);
        }
        for (const [key, value] of Object.entries(nextSettings)) {
            if (LOCAL_ONLY_SETTING_KEYS.includes(key)) continue;
            const json = JSON.stringify(value);
            const row = curSettings.find((r) => r.key === key);
            if (row && row.value === json) continue;
            settings.put({ key, value: json, updatedAt: now });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Applying the synced data was aborted'));
    });
};

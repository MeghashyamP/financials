import { DEFAULT_CATEGORIES, normalizeCategoryName } from "./utils.jsx";
import { seedDefaultAccounts } from "./services/accounts.js";

export const DB_NAME = "FinancialsDB";
export const DB_VERSION = 1;

export const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;

            if (!db.objectStoreNames.contains("transactions")) {
                const txStore = db.createObjectStore("transactions", { keyPath: "id" });
                txStore.createIndex("fingerprint", "fingerprint", { unique: true });
            }
            if (!db.objectStoreNames.contains("tags")) {
                db.createObjectStore("tags", { keyPath: "name" });
            }
            if (!db.objectStoreNames.contains("rules")) {
                db.createObjectStore("rules", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings", { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains("documents")) {
                db.createObjectStore("documents", { keyPath: "id" });
            }
        };

        request.onsuccess = (e) => {
            const db = e.target.result;
            resolve(db);
        };

        request.onerror = (e) => {
            reject(e.target.error);
        };
    });
};

// Get single store transaction helper
const getStore = (db, storeName, mode = "readonly") => {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
};

// Default Tags
export const DEFAULT_TAGS = [
    { name: "Tag1", color: "#FF0000", createdAt: new Date().toISOString() },
    { name: "Tag2", color: "#00FF00", createdAt: new Date().toISOString() },
    { name: "Tag3", color: "#0000FF", createdAt: new Date().toISOString() },
    { name: "Tag4", color: "#FFFF00", createdAt: new Date().toISOString() }
];

// Read unified state from IndexedDB
export const fetchStateFromDB = async () => {
    const db = await initDB();

    const readStore = (storeName) => {
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve([]);
        });
    };

    const transactions = await readStore("transactions");
    let tags = await readStore("tags");
    const rules = await readStore("rules");
    const settingsRows = await readStore("settings");
    const documents = await readStore("documents");

    // Seed default tags if empty
    if (!tags || tags.length === 0) {
        tags = DEFAULT_TAGS;
        for (const tag of DEFAULT_TAGS) {
            await saveTagInDB(tag);
        }
    }

    // Convert settings array of {key, value} to a hash map
    const settings = {};
    settingsRows.forEach(row => {
        try {
            settings[row.key] = JSON.parse(row.value);
        } catch (e) {
            settings[row.key] = row.value;
        }
    });

    // Set default settings if not exists
    const defaultSettings = {
        currency: "INR",
        dateFormat: "24/Jun/2002 Sun",
        timezone: "Asia/Calcutta",
        categories: DEFAULT_CATEGORIES,
        accounts: ["Bank 1", "Bank 2", "Credit Card 1"],
        selectedPeriod: "this_month",
        netWorthConfigured: false,
        assetsTotal: 0,
        liabilitiesTotal: 0,
        goals: [],
        budgets: [],
        recurring: [],
        billInstances: [],
        networthItems: [],
        forecast: { incomeOverride: null, expenseOverride: null, note: "" },
        dismissedPatterns: [],
        processedFileIds: [],
        driveResetAt: null,
        freshStart: true
    };

    // Merge default settings
    Object.keys(defaultSettings).forEach(key => {
        if (settings[key] === undefined) {
            settings[key] = defaultSettings[key];
        }
    });

    // Migrate the Gemini API key out of synced settings into this browser's localStorage.
    // It used to be stored here, which put it in exports, the linked file and the cloud copy.
    if (settings.geminiApiKey !== undefined) {
        try {
            if (settings.geminiApiKey && !localStorage.getItem("gemini_api_key")) {
                localStorage.setItem("gemini_api_key", settings.geminiApiKey);
            }
        } catch (e) { }
        delete settings.geminiApiKey;
        deleteSettingFromDB("geminiApiKey").catch(() => { });
    }

    // Default accounts: HDFC / SBI / ICICI credit cards and debit-card (savings) accounts, added once.
    // Existing accounts are never removed; old placeholder lists are replaced (keeping any a transaction uses).
    try {
        const usedAccounts = [...new Set(transactions.map(t => t.account).filter(Boolean))];
        const seeded = seedDefaultAccounts(settings, usedAccounts);
        if (seeded.changed) {
            settings.accounts = seeded.accounts;
            settings.accountProfiles = seeded.accountProfiles;
            settings.accountsSeededV1 = true;
            await saveSettingInDB("accounts", seeded.accounts);
            await saveSettingInDB("accountProfiles", seeded.accountProfiles);
            await saveSettingInDB("accountsSeededV1", true);
        }
    } catch (e) {
        console.warn("Default account seeding notice:", e);
    }

    // If selectedPeriod is the old default "all-time", update to "this_month"
    if (settings.selectedPeriod === "all-time") {
        settings.selectedPeriod = "this_month";
        saveSettingInDB("selectedPeriod", "this_month");
    }

    // Seed and reconcile categories: ensure default categories remain fixed, canonical,
    // and complete, while preserving any user-created categories.
    if (!settings.categories || settings.categories.length === 0) {
        settings.categories = DEFAULT_CATEGORIES;
        saveSettingInDB("categories", DEFAULT_CATEGORIES);
    } else {
        const defaultNormMap = new Map();
        DEFAULT_CATEGORIES.forEach(c => defaultNormMap.set(normalizeCategoryName(c), c));

        const userCreated = [];
        const seenNorms = new Set();
        settings.categories.forEach(c => {
            if (!c || typeof c !== 'string') return;
            const norm = normalizeCategoryName(c);
            if (!norm) return;
            if (!defaultNormMap.has(norm) && !seenNorms.has(norm)) {
                seenNorms.add(norm);
                userCreated.push(c.trim());
            }
        });

        const reconciled = [...DEFAULT_CATEGORIES, ...userCreated];
        const isSame = reconciled.length === settings.categories.length &&
            reconciled.every((c, idx) => c === settings.categories[idx]);

        if (!isSame) {
            settings.categories = reconciled;
            saveSettingInDB("categories", reconciled);
        }

        // Remap recurring item categories if they have obsolete emojis matching default categories
        if (Array.isArray(settings.recurring)) {
            let changed = false;
            settings.recurring.forEach(r => {
                if (r && r.category) {
                    const norm = normalizeCategoryName(r.category);
                    if (defaultNormMap.has(norm) && r.category !== defaultNormMap.get(norm)) {
                        r.category = defaultNormMap.get(norm);
                        changed = true;
                    }
                }
            });
            if (changed) saveSettingInDB("recurring", settings.recurring);
        }

        // Remap billInstances categories if needed
        if (Array.isArray(settings.billInstances)) {
            let changed = false;
            settings.billInstances.forEach(bi => {
                if (bi && bi.category) {
                    const norm = normalizeCategoryName(bi.category);
                    if (defaultNormMap.has(norm) && bi.category !== defaultNormMap.get(norm)) {
                        bi.category = defaultNormMap.get(norm);
                        changed = true;
                    }
                }
            });
            if (changed) saveSettingInDB("billInstances", settings.billInstances);
        }

        // Remap budgets categories if needed
        if (Array.isArray(settings.budgets)) {
            let changed = false;
            settings.budgets.forEach(b => {
                if (b && b.category) {
                    const norm = normalizeCategoryName(b.category);
                    if (defaultNormMap.has(norm) && b.category !== defaultNormMap.get(norm)) {
                        b.category = defaultNormMap.get(norm);
                        changed = true;
                    }
                }
            });
            if (changed) saveSettingInDB("budgets", settings.budgets);
        }
    }

    // Sort newest first. No cap: this state is what gets written to the linked file,
    // JSON backups and the cloud copy, so truncating it here would drop older records
    // from all of them.
    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const sortedDocuments = [...documents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
        transactions: sortedTransactions,
        tags,
        rules,
        settings,
        documents: sortedDocuments
    };
};

// Write settings/preferences directly to IndexedDB
export const saveSettingInDB = async (key, value) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("settings", "readwrite");
        const store = tx.objectStore("settings");
        const req = store.put({
            key,
            value: JSON.stringify(value),
            updatedAt: new Date().toISOString()
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// Remove a settings key from IndexedDB
export const deleteSettingFromDB = async (key) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("settings", "readwrite");
        const req = tx.objectStore("settings").delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// Write batch/single transactions to IndexedDB
export const saveTransactionsInDB = async (newTransactions) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("transactions", "readwrite");
        const store = tx.objectStore("transactions");
        let inserted = 0;
        let duplicates = 0;

        newTransactions.forEach(t => {
            const req = store.add(t); // add fails if fingerprint index is not unique
            req.onsuccess = () => {
                inserted++;
            };
            req.onerror = (e) => {
                // Duplicate fingerprint: count it and keep going. preventDefault stops the abort and
                // stopPropagation stops the error reaching tx.onerror (which used to reject with `null`
                // after the other rows were already saved → a false "Import failed").
                if (e.target.error && e.target.error.name === "ConstraintError") {
                    duplicates++;
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
        });

        tx.oncomplete = () => {
            resolve({ inserted, duplicates });
        };
        tx.onabort = () => {
            reject(tx.error || new Error("Saving transactions was aborted by the browser database"));
        };
        tx.onerror = () => {
            // Only unexpected (non-duplicate) request errors reach here
            reject(tx.error || new Error("Saving transactions failed"));
        };
    });
};

// Save a tag definition
export const saveTagInDB = async (tag) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tags", "readwrite");
        const store = tx.objectStore("tags");
        const req = store.put(tag);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// Delete a tag definition
export const deleteTagFromDB = async (tagName) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tags", "readwrite");
        const store = tx.objectStore("tags");
        const req = store.delete(tagName);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// Save a categorization rule
export const saveRuleInDB = async (rule) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("rules", "readwrite");
        const store = tx.objectStore("rules");
        const req = store.put(rule);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// Delete a rule
export const deleteRuleFromDB = async (ruleId) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("rules", "readwrite");
        const store = tx.objectStore("rules");
        const req = store.delete(ruleId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// Update single transaction category/tags
export const updateTransactionInDB = async (transaction) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("transactions", "readwrite");
        const store = tx.objectStore("transactions");
        const req = store.put(transaction);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// Delete single transaction
export const deleteTransactionFromDB = async (id) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("transactions", "readwrite");
        const store = tx.objectStore("transactions");
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// Save a document file blob and metadata
export const saveDocumentInDB = async (doc) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("documents", "readwrite");
        const store = tx.objectStore("documents");
        const req = store.put(doc);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// Delete single document
export const deleteDocumentFromDB = async (id) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("documents", "readwrite");
        const store = tx.objectStore("documents");
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// Delete document and all associated transactions in a single transaction block
export const deleteDocumentAndTransactionsFromDB = async (docId) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(["documents", "transactions"], "readwrite");
        const docStore = tx.objectStore("documents");
        const txStore = tx.objectStore("transactions");

        docStore.delete(docId);

        const req = txStore.openCursor();
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                if (cursor.value.documentId === docId) {
                    cursor.delete();
                }
                cursor.continue();
            }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

// Complete database wipe
export const wipeDatabase = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transactionStores = ["transactions", "tags", "rules", "settings", "documents"];
        const tx = db.transaction(transactionStores, "readwrite");

        transactionStores.forEach(storeName => {
            tx.objectStore(storeName).clear();
        });

        tx.oncomplete = async () => {
            // Recreate settings empty-state rows
            const now = new Date().toISOString();
            const db = await initDB();
            const setTx = db.transaction("settings", "readwrite");
            const store = setTx.objectStore("settings");

            const emptySettings = [
                { key: "currency", value: JSON.stringify("INR") },
                { key: "categories", value: JSON.stringify(DEFAULT_CATEGORIES) },
                { key: "accounts", value: JSON.stringify(["Bank 1", "Bank 2", "Credit Card 1"]) },
                { key: "selectedPeriod", value: JSON.stringify("this_month") },
                { key: "netWorthConfigured", value: JSON.stringify(false) },
                { key: "assetsTotal", value: JSON.stringify(0) },
                { key: "liabilitiesTotal", value: JSON.stringify(0) },
                { key: "goals", value: JSON.stringify([]) },
                { key: "budgets", value: JSON.stringify([]) },
                { key: "recurring", value: JSON.stringify([]) },
                { key: "billInstances", value: JSON.stringify([]) },
                { key: "networthItems", value: JSON.stringify([]) },
                { key: "forecast", value: JSON.stringify({ incomeOverride: null, expenseOverride: null, note: "" }) },
                { key: "dismissedPatterns", value: JSON.stringify([]) },
                { key: "processedFileIds", value: JSON.stringify([]) },
                { key: "driveResetAt", value: JSON.stringify(now) },
                { key: "freshStart", value: JSON.stringify(true) }
            ];

            emptySettings.forEach(s => {
                store.put({ key: s.key, value: s.value, updatedAt: now });
            });

            // Seed default tags
            const tagTx = db.transaction("tags", "readwrite");
            const tagStore = tagTx.objectStore("tags");
            DEFAULT_TAGS.forEach(t => tagStore.put(t));

            setTx.oncomplete = () => resolve();
            setTx.onerror = () => reject(setTx.error);
        };

        tx.onerror = () => {
            reject(tx.error);
        };
    });
};

// --- Storage Persistence Helpers ---

// Check if IndexedDB storage is marked as persistent in the browser or app storage lock is active
export const checkStoragePersistence = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
        try {
            const isPersisted = await navigator.storage.persisted();
            if (isPersisted) return true;
        } catch (e) { }
    }
    try {
        const db = await initDB();
        const tx = db.transaction("settings", "readonly");
        const store = tx.objectStore("settings");
        const req = store.get("storageLockRequested");
        return new Promise((resolve) => {
            req.onsuccess = () => {
                resolve(req.result ? JSON.parse(req.result.value) : false);
            };
            req.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
};

// Request browser to lock IndexedDB as persistent (prevents eviction under disk pressure)
export const requestStoragePersistence = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        try {
            const isAlreadyPersisted = await navigator.storage.persisted();
            if (!isAlreadyPersisted) {
                await navigator.storage.persist();
            }
        } catch (e) {
            console.warn("Browser storage persist error:", e);
        }
    }
    // Always set app-level storage lock in DB so user's intent is persisted
    try {
        await saveSettingInDB("storageLockRequested", true);
    } catch (e) { }
    return true;
};



/**
 * localFileSync.js — Local File System Auto-Sync Service
 *
 * Uses the browser File System Access API (showSaveFilePicker / showOpenFilePicker)
 * to link and auto-sync JSON data directly to a local project file on disk.
 */

import { getISOStringInTimezone } from '../utils.jsx';

// Check if File System Access API is supported in the browser
export const isFileSystemAccessSupported = () => {
    return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
};

// IndexedDB persistence for FileHandle across page reloads
const FILE_HANDLE_DB_NAME = "FinancialsFileSyncDB";
const FILE_HANDLE_STORE = "file_handles";
const FILE_HANDLE_KEY = "activeHandle";

const openFileHandleDB = () => {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            return reject(new Error("IndexedDB not available"));
        }
        const req = indexedDB.open(FILE_HANDLE_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(FILE_HANDLE_STORE)) {
                db.createObjectStore(FILE_HANDLE_STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

export const saveHandleToIndexedDB = async (handle) => {
    try {
        const db = await openFileHandleDB();
        const tx = db.transaction(FILE_HANDLE_STORE, "readwrite");
        tx.objectStore(FILE_HANDLE_STORE).put(handle, FILE_HANDLE_KEY);
        return new Promise((resolve) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch (e) {
        console.warn("Could not save file handle to IndexedDB:", e);
        return false;
    }
};

export const getHandleFromIndexedDB = async () => {
    try {
        const db = await openFileHandleDB();
        const tx = db.transaction(FILE_HANDLE_STORE, "readonly");
        const req = tx.objectStore(FILE_HANDLE_STORE).get(FILE_HANDLE_KEY);
        return new Promise((resolve) => {
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        console.warn("Could not read file handle from IndexedDB:", e);
        return null;
    }
};

export const clearHandleFromIndexedDB = async () => {
    try {
        const db = await openFileHandleDB();
        const tx = db.transaction(FILE_HANDLE_STORE, "readwrite");
        tx.objectStore(FILE_HANDLE_STORE).delete(FILE_HANDLE_KEY);
    } catch (e) {
        console.warn("Could not clear file handle from IndexedDB:", e);
    }
};

// Global in-memory handle holder for active session
let activeFileHandle = null;

export const setGlobalFileHandle = (handle) => {
    activeFileHandle = handle;
    if (handle) {
        saveHandleToIndexedDB(handle);
    } else {
        clearHandleFromIndexedDB();
    }
};

export const getGlobalFileHandle = () => {
    return activeFileHandle;
};

// Attempt to restore handle from IndexedDB on startup and verify its permissions
export const restoreGlobalFileHandle = async () => {
    try {
        const handle = await getHandleFromIndexedDB();
        if (!handle) {
            activeFileHandle = null;
            return { handle: null, permissionGranted: false };
        }
        activeFileHandle = handle;
        let permissionGranted = false;
        if (handle.queryPermission) {
            const status = await handle.queryPermission({ mode: "readwrite" });
            permissionGranted = (status === "granted");
        }
        return { handle, permissionGranted };
    } catch (e) {
        console.warn("Error restoring file handle:", e);
        return { handle: null, permissionGranted: false };
    }
};

// Prompt user to choose or create a local project JSON file
export const pickLocalProjectFile = async (suggestedName = "financials-data.json") => {
    if (!isFileSystemAccessSupported()) {
        throw new Error("File System Access API is not supported in this browser. Please use standard JSON Export/Import.");
    }

    try {
        const handle = await window.showSaveFilePicker({
            suggestedName,
            types: [
                {
                    description: "JSON Data File",
                    accept: { "application/json": [".json"] },
                },
            ],
        });
        activeFileHandle = handle;
        await saveHandleToIndexedDB(handle);
        return handle;
    } catch (err) {
        if (err.name === "AbortError") {
            return null; // User cancelled
        }
        throw err;
    }
};

// Prompt user to open an existing local JSON file in project folder
export const openLocalProjectFile = async () => {
    if (typeof window.showOpenFilePicker !== 'function') {
        throw new Error("Opening local files is not supported in this browser.");
    }

    try {
        const [handle] = await window.showOpenFilePicker({
            types: [
                {
                    description: "JSON Data File",
                    accept: { "application/json": [".json"] },
                },
            ],
            multiple: false,
        });
        if (!handle) return null;

        // Immediately request readwrite permission while user click gesture is active
        if (handle.requestPermission) {
            const currentPerm = await handle.queryPermission({ mode: "readwrite" });
            if (currentPerm !== "granted") {
                await handle.requestPermission({ mode: "readwrite" });
            }
        }

        activeFileHandle = handle;
        await saveHandleToIndexedDB(handle);
        return handle;
    } catch (err) {
        if (err.name === "AbortError") {
            return null;
        }
        throw err;
    }
};

// Read full state data from linked local file
export const readStateFromLocalFile = async (handle) => {
    const targetHandle = handle || activeFileHandle;
    if (!targetHandle) return null;

    try {
        const file = await targetHandle.getFile();
        const text = await file.text();
        if (!text || !text.trim()) return null;
        return JSON.parse(text);
    } catch (err) {
        console.error("Failed to read from local project file:", err);
        return null;
    }
};

// Verify or request readwrite permission for a stored file handle
export const verifyFileHandlePermission = async (handle, readWrite = true) => {
    if (!handle) return false;
    const options = {};
    if (readWrite) options.mode = "readwrite";

    try {
        if (handle.queryPermission) {
            const status = await handle.queryPermission(options);
            if (status === "granted") return true;
        }
        if (handle.requestPermission) {
            try {
                const reqStatus = await handle.requestPermission(options);
                return reqStatus === "granted";
            } catch (permErr) {
                // Throws DOMException if called without active user activation
                return false;
            }
        }
    } catch (err) {
        console.warn("File permission check notice:", err);
    }
    return false;
};

// Save full state data to linked local file
export const writeStateToLocalFile = async (handle, state) => {
    const targetHandle = handle || activeFileHandle;
    if (!targetHandle) return false;

    try {
        const hasPermission = await verifyFileHandlePermission(targetHandle, true);
        if (!hasPermission) {
            console.warn("Write permission not granted for linked local file.");
            return false;
        }

        const { transactions = [], tags = [], rules = [], settings = {}, documents = [] } = state;
        const cleanDocuments = (documents || []).map(({ fileData, ...rest }) => rest);
        const tz = settings?.timezone || "Asia/Calcutta";
        const exportedAt = getISOStringInTimezone(new Date(), tz);

        const backupData = {
            version: 1,
            exportedAt,
            appVersion: "1.0.0",
            settings,
            tags,
            rules,
            transactions,
            documents: cleanDocuments,
        };

        const jsonString = JSON.stringify(backupData, null, 2);
        const writable = await targetHandle.createWritable();
        await writable.write(jsonString);
        await writable.close();

        return true;
    } catch (err) {
        console.error("Failed to write to local project file:", err);
        return false;
    }
};

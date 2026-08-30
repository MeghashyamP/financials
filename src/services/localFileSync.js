/**
 * localFileSync.js — Local File System Auto-Sync Service
 *
 * Uses the browser File System Access API (showSaveFilePicker / showOpenFilePicker)
 * to link and auto-sync JSON data directly to a local project file on disk.
 */

// Check if File System Access API is supported in the browser
export const isFileSystemAccessSupported = () => {
    return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
};

// Global in-memory handle holder for active session
let activeFileHandle = null;

export const setGlobalFileHandle = (handle) => {
    activeFileHandle = handle;
};

export const getGlobalFileHandle = () => {
    return activeFileHandle;
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
        activeFileHandle = handle;
        return handle;
    } catch (err) {
        if (err.name === "AbortError") {
            return null;
        }
        throw err;
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
            if (handle.requestPermission) {
                const reqStatus = await handle.requestPermission(options);
                return reqStatus === "granted";
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

        const backupData = {
            version: 1,
            exportedAt: new Date().toISOString(),
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

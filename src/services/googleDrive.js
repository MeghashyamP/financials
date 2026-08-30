/**
 * googleDrive.js — Google OAuth + Drive App Data Sync Service
 *
 * Uses the Google Identity Services (GIS) SDK for a purely client-side,
 * no-server OAuth implicit token flow. Data is stored in Drive's hidden
 * "App Data" folder — private to the user, not visible in Drive UI.
 *
 * Required: A Google Cloud project with Drive API enabled and an
 * OAuth 2.0 Client ID (Web application type) configured with the
 * app's origin as an authorised JavaScript origin.
 */

const DRIVE_BACKUP_FILENAME = "financials-backup.json";
const DRIVE_APP_DATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const GIS_SDK_URL = "https://accounts.google.com/gsi/client";

// ---------------------------------------------------------------------------
// SDK Loader
// ---------------------------------------------------------------------------
export const loadGoogleIdentitySDK = () => {
    return new Promise((resolve, reject) => {
        if (window.google?.accounts) return resolve(window.google.accounts);

        const script = document.createElement("script");
        script.src = GIS_SDK_URL;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve(window.google?.accounts);
        script.onerror = () => reject(new Error("Failed to load Google Identity Services SDK"));
        document.head.appendChild(script);
    });
};

// ---------------------------------------------------------------------------
// Sign In — returns { accessToken, email, name, picture }
// ---------------------------------------------------------------------------
export const signInWithGoogle = (clientId) => {
    return new Promise(async (resolve, reject) => {
        try {
            await loadGoogleIdentitySDK();

            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: DRIVE_APP_DATA_SCOPE,
                callback: async (tokenResponse) => {
                    if (tokenResponse.error) {
                        return reject(new Error(tokenResponse.error_description || tokenResponse.error));
                    }

                    // Fetch basic profile info
                    try {
                        const profileRes = await fetch(
                            `https://www.googleapis.com/oauth2/v3/userinfo`,
                            { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
                        );
                        const profile = await profileRes.json();
                        resolve({
                            accessToken: tokenResponse.access_token,
                            expiresIn: tokenResponse.expires_in,
                            email: profile.email || "",
                            name: profile.name || "",
                            picture: profile.picture || "",
                        });
                    } catch {
                        // Profile fetch failed but token is valid — proceed without profile
                        resolve({
                            accessToken: tokenResponse.access_token,
                            expiresIn: tokenResponse.expires_in,
                            email: "",
                            name: "",
                            picture: "",
                        });
                    }
                },
            });

            tokenClient.requestAccessToken({ prompt: "consent" });
        } catch (err) {
            reject(err);
        }
    });
};

// ---------------------------------------------------------------------------
// Sign Out — revoke token
// ---------------------------------------------------------------------------
export const signOutGoogle = (accessToken) => {
    if (window.google?.accounts?.oauth2 && accessToken) {
        window.google.accounts.oauth2.revoke(accessToken, () => {});
    }
};

// ---------------------------------------------------------------------------
// Drive Helpers
// ---------------------------------------------------------------------------

// Find the Drive file ID for our backup file (in appDataFolder)
const findBackupFileId = async (accessToken) => {
    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${DRIVE_BACKUP_FILENAME}'&fields=files(id,name,modifiedTime)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
    const data = await res.json();
    return data.files?.[0]?.id || null;
};

// ---------------------------------------------------------------------------
// Save backup JSON to Drive App Data folder
// ---------------------------------------------------------------------------
export const saveToDrive = async (accessToken, backupObject) => {
    const json = JSON.stringify(backupObject, null, 2);
    const existingFileId = await findBackupFileId(accessToken);

    let url, method;
    if (existingFileId) {
        // Update existing file
        url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
        method = "PATCH";
    } else {
        // Create new file in appDataFolder
        url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
        method = "POST";
    }

    const metadata = existingFileId
        ? { name: DRIVE_BACKUP_FILENAME }
        : { name: DRIVE_BACKUP_FILENAME, parents: ["appDataFolder"] };

    const boundary = "-------financials_backup_boundary";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body =
        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        json +
        closeDelimiter;

    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary="${boundary}"`,
        },
        body,
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Drive save failed (${res.status}): ${errBody}`);
    }

    return await res.json();
};

// ---------------------------------------------------------------------------
// Load backup JSON from Drive App Data folder
// ---------------------------------------------------------------------------
export const loadFromDrive = async (accessToken) => {
    const fileId = await findBackupFileId(accessToken);
    if (!fileId) return null; // No backup on Drive yet

    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) throw new Error(`Drive load failed (${res.status})`);
    return await res.json();
};

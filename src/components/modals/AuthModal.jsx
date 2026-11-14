import React from 'react';
import { signUpUser, signInUser, signOutUser, saveUserDataToCloud, fetchUserDataFromCloud, syncCloudToLocal, setCloudSyncPaused } from '../../services/supabaseService.js';

const hasMeaningfulData = (state) => {
    if (!state) return false;
    const s = state.settings || {};
    return (state.transactions?.length || 0) > 0 ||
        (state.rules?.length || 0) > 0 ||
        ["recurring", "networthItems", "budgets", "goals", "billInstances"].some(k => Array.isArray(s[k]) && s[k].length > 0);
};

// Decide what happens on sign-in when the cloud and this device may both hold data.
// Returns "cloud" (restore cloud copy here), "local" (upload this device's copy),
// "none" (nothing to move) or "cancel" (user backed out; sign out again).
const chooseSyncDirection = (cloudData, localState) => {
    const cloudHas = hasMeaningfulData(cloudData);
    const localHas = hasMeaningfulData(localState);

    if (cloudHas && !localHas) return "cloud";
    if (!cloudHas && localHas) return "local";
    if (!cloudHas && !localHas) return "none";

    const cloudCount = cloudData.transactions?.length || 0;
    const localCount = localState.transactions?.length || 0;
    const syncedAt = cloudData.syncedAt ? new Date(cloudData.syncedAt).toLocaleString() : "an unknown time";

    if (window.confirm(
        `Both this device and your cloud account have data.\n\n` +
        `Cloud copy: ${cloudCount} transactions (last synced ${syncedAt})\n` +
        `This device: ${localCount} transactions\n\n` +
        `OK: replace this device's data with the cloud copy.\n` +
        `Cancel: see other options.`
    )) return "cloud";

    if (window.confirm(
        `Upload this device's data to the cloud instead?\n\n` +
        `This replaces the cloud copy (${cloudCount} transactions).\n\n` +
        `OK: upload this device's data.\n` +
        `Cancel: sign out and change nothing.`
    )) return "local";

    return "cancel";
};

export const AuthModal = ({ isOpen, onClose, onAuthSuccess, showToast, localState }) => {
    const [isSignUp, setIsSignUp] = React.useState(false);
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState("");

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg("");
        setLoading(true);

        // Hold automatic pushes until this flow has decided which copy wins.
        setCloudSyncPaused(true);
        try {
            if (isSignUp) {
                const data = await signUpUser(email, password);
                if (data?.user && !data.session) {
                    showToast("Account created! Check your email to verify (or sign in if confirmation is disabled).", "info");
                } else {
                    showToast("Account created and signed in successfully!", "success");
                    // Sync current local state up to the newly created account
                    if (localState) {
                        try {
                            await saveUserDataToCloud(localState);
                        } catch (saveErr) {
                            console.warn("Initial sync after signup:", saveErr);
                        }
                    }
                    if (onAuthSuccess) await onAuthSuccess(data.user);
                }
                onClose();
            } else {
                const data = await signInUser(email, password);

                let cloudData;
                try {
                    cloudData = await fetchUserDataFromCloud();
                    if (cloudData?.needsPassword) throw new Error("encryption key unavailable");
                } catch (fetchErr) {
                    // Most likely the cloud copy was encrypted with a different password.
                    // Stay signed out so auto-sync can't overwrite that copy with local data.
                    await signOutUser().catch(() => {});
                    throw new Error(`Signed in, but the cloud data could not be read (${fetchErr.message}). You have been signed out so nothing gets overwritten.`);
                }

                const choice = chooseSyncDirection(cloudData, localState);
                if (choice === "cancel") {
                    await signOutUser().catch(() => {});
                    showToast("Sign-in cancelled. Nothing was changed.", "info");
                    onClose();
                    return;
                }
                if (choice === "cloud") {
                    await syncCloudToLocal(cloudData);
                    showToast("Signed in and restored your data from the cloud.", "success");
                } else if (choice === "local") {
                    await saveUserDataToCloud(localState);
                    showToast("Signed in and uploaded this device's data to the cloud.", "success");
                } else {
                    showToast("Signed in successfully!", "success");
                }

                if (onAuthSuccess) await onAuthSuccess(data.user);
                onClose();
            }
        } catch (err) {
            console.error("Auth error:", err);
            setErrorMsg(err.message || "Authentication failed. Please check your credentials.");
        } finally {
            setCloudSyncPaused(false);
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay confirm-modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div
                className="modal-container"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '440px',
                    width: '92%',
                    padding: '28px',
                    borderRadius: '16px',
                    background: 'var(--card-bg, #ffffff)',
                    boxShadow: '0 20px 45px rgba(0,0,0,0.22)',
                    border: '1px solid var(--border-color, #E2E8F0)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #10B981, #059669)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '1.2rem',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                        }}>
                            ☁️
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                {isSignUp ? "Create Account" : "Cloud Sign In"}
                            </h3>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {isSignUp ? "Save & sync your finances across all devices" : "Access your encrypted financial cloud backup"}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: '1.3rem',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            padding: '4px'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {errorMsg && (
                    <div style={{
                        background: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                        color: '#B91C1C',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <span>⚠️</span>
                        <span>{errorMsg}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                            Email Address
                        </label>
                        <input
                            type="email"
                            required
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="form-control"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                fontSize: '0.9rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                            Password
                        </label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="form-control"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                fontSize: '0.9rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                boxSizing: 'border-box'
                            }}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                            Minimum 6 characters
                        </span>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary"
                        style={{
                            marginTop: '8px',
                            padding: '12px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.92rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {loading ? (
                            <span>Connecting...</span>
                        ) : (
                            <>
                                <span>{isSignUp ? "Sign Up & Sync" : "Sign In & Sync"}</span>
                                <span>→</span>
                            </>
                        )}
                    </button>
                </form>

                <div style={{ marginTop: '18px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {isSignUp ? (
                        <span>
                            Already have an account?{" "}
                            <button
                                type="button"
                                onClick={() => { setIsSignUp(false); setErrorMsg(""); }}
                                style={{ background: 'none', border: 'none', color: 'var(--primary, #059669)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                            >
                                Sign In
                            </button>
                        </span>
                    ) : (
                        <span>
                            Don't have an account yet?{" "}
                            <button
                                type="button"
                                onClick={() => { setIsSignUp(true); setErrorMsg(""); }}
                                style={{ background: 'none', border: 'none', color: 'var(--primary, #059669)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                            >
                                Create an Account
                            </button>
                        </span>
                    )}
                </div>

                <div style={{
                    marginTop: '20px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)'
                }}>
                    <span>🔐</span>
                    <span><strong>End-to-End Encrypted:</strong> Data is encrypted using AES-256 before leaving your browser. Nobody (not even Supabase or database admins) can read your finances.</span>
                </div>
            </div>
        </div>
    );
};

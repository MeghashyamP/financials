import React from 'react';
import { supabase, signUpUser, signInUser, signOutUser, saveUserDataToCloud, fetchUserDataFromCloud, syncCloudToLocal } from '../../services/supabaseService.js';

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
                    if (onAuthSuccess) onAuthSuccess(data.user);
                }
                onClose();
            } else {
                const data = await signInUser(email, password);
                showToast("Signed in successfully!", "success");

                // Check for cloud data
                const cloudData = await fetchUserDataFromCloud();
                if (cloudData && (cloudData.transactions?.length > 0 || Object.keys(cloudData.settings || {}).length > 0)) {
                    await syncCloudToLocal(cloudData);
                    showToast("Restored your financial data from cloud!", "success");
                } else if (localState && localState.transactions?.length > 0) {
                    // Back up existing local data to cloud
                    await saveUserDataToCloud(localState);
                    showToast("Backed up your local data to cloud!", "success");
                }

                if (onAuthSuccess) onAuthSuccess(data.user);
                onClose();
            }
        } catch (err) {
            console.error("Auth error:", err);
            setErrorMsg(err.message || "Authentication failed. Please check your credentials.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
            <div
                className="modal-card"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '420px',
                    width: '90%',
                    padding: '28px',
                    borderRadius: '16px',
                    background: 'var(--card-bg, #ffffff)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
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
                    <span>🔒</span>
                    <span>Protected by Row Level Security. Only you have access to your private database row.</span>
                </div>
            </div>
        </div>
    );
};

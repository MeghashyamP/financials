import React from 'react';
import {
    signUpUser,
    signInUser,
    signOutUser,
    saveUserDataToCloud,
    fetchUserDataFromCloud,
    syncCloudToLocal,
    setCloudSyncPaused,
    resendVerificationEmail,
    verifyOtpCode,
    sendPasswordResetEmail,
    verifyRecoveryOtp,
    updateUserPassword
} from '../../services/supabaseService.js';
import { parseRecoveryKit } from '../../services/crypto.js';

const hasMeaningfulData = (state) => {
    if (!state) return false;
    const s = state.settings || {};
    return (state.transactions?.length || 0) > 0 ||
        (state.rules?.length || 0) > 0 ||
        ["recurring", "networthItems", "budgets", "goals", "billInstances"].some(k => Array.isArray(s[k]) && s[k].length > 0);
};

// Decide what happens on sign-in: online (cloud) data is always preferred over local device data.
const chooseSyncDirection = (cloudData, localState) => {
    // If the user has a cloud copy, always prefer it and overwrite the local browser info
    if (cloudData) return "cloud";

    // If there is no cloud copy yet, but this device has local data, upload it to the cloud
    if (hasMeaningfulData(localState)) return "local";

    return "none";
};

export const AuthModal = ({
    isOpen,
    onClose,
    onAuthSuccess,
    showToast,
    localState,
    initialNotice = "",
    initialView = "signIn"
}) => {
    // Views: "signIn" | "signUp" | "verifySignupOtp" | "forgotPassword" | "verifyResetOtp" | "setNewPassword"
    const [authView, setAuthView] = React.useState(initialView);
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const [otpCode, setOtpCode] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState("");
    const [notice, setNotice] = React.useState(initialNotice);
    const [resending, setResending] = React.useState(false);
    const [resendSuccess, setResendSuccess] = React.useState("");
    // Optional recovery kit (file from Settings → Cloud recovery kit) for opening a cloud copy saved under an older password
    const [recoveryKit, setRecoveryKit] = React.useState(null);
    const [recoveryKitName, setRecoveryKitName] = React.useState("");

    React.useEffect(() => {
        if (initialNotice) {
            setNotice(initialNotice);
        }
    }, [initialNotice]);

    React.useEffect(() => {
        if (initialView) {
            setAuthView(initialView);
        }
    }, [initialView]);

    if (!isOpen) return null;

    const clearStatus = () => {
        setErrorMsg("");
        setResendSuccess("");
    };

    const handleResendSignupEmail = async () => {
        if (!email) {
            setErrorMsg("Please enter your email address first.");
            return;
        }
        setResending(true);
        clearStatus();
        try {
            await resendVerificationEmail(email);
            setResendSuccess(`Verification email/code resent to ${email}! Check your inbox and spam folder.`);
            showToast("Verification email resent!", "success");
        } catch (err) {
            console.error("Resend error:", err);
            setErrorMsg(err.message || "Failed to resend verification email.");
        } finally {
            setResending(false);
        }
    };

    // 1. Handle Sign In
    const handleSignIn = async (e) => {
        e.preventDefault();
        clearStatus();
        setLoading(true);
        setCloudSyncPaused(true);

        try {
            const data = await signInUser(email, password);

            let cloudData;
            try {
                cloudData = await fetchUserDataFromCloud(null, { recoveryKit });
                if (cloudData?.needsPassword) throw new Error("encryption key unavailable");
            } catch (fetchErr) {
                await signOutUser().catch(() => {});
                throw new Error(`Signed in, but the cloud data could not be decrypted (${fetchErr.message}). You have been signed out so nothing gets overwritten.${recoveryKit ? "" : " If you reset your password, attach your recovery kit below and sign in again."}`);
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
                if (cloudData?.recoveredViaKit) {
                    // The cloud copy was still sealed under the old password: save it again under the one just used.
                    try { await saveUserDataToCloud(cloudData, password); } catch (reErr) { console.warn("Re-saving recovered data:", reErr); }
                    showToast("Recovered your data with the recovery kit and re-secured it under your current password.", "success");
                } else {
                    showToast("Signed in and restored your data from the cloud.", "success");
                }
            } else if (choice === "local") {
                await saveUserDataToCloud(localState);
                showToast("Signed in and uploaded this device's data to the cloud.", "success");
            } else {
                showToast("Signed in successfully!", "success");
            }

            if (onAuthSuccess) await onAuthSuccess(data.user);
            onClose();
        } catch (err) {
            console.error("Sign in error:", err);
            const msg = err.message || "Authentication failed. Please check your credentials.";
            setErrorMsg(msg);
        } finally {
            setCloudSyncPaused(false);
            setLoading(false);
        }
    };

    // 2. Handle Sign Up
    const handleSignUp = async (e) => {
        e.preventDefault();
        clearStatus();
        setLoading(true);
        setCloudSyncPaused(true);

        try {
            const data = await signUpUser(email, password);
            if (data?.user && !data.session) {
                // Email confirmation is enabled in Supabase!
                showToast("Account created! Verification code sent to your email.", "info");
                setNotice(`A 6-digit confirmation code was sent to ${email}. Please enter it below to activate your account.`);
                setAuthView("verifySignupOtp");
            } else {
                showToast("Account created and signed in successfully!", "success");
                if (localState) {
                    try {
                        await saveUserDataToCloud(localState);
                    } catch (saveErr) {
                        console.warn("Initial sync after signup:", saveErr);
                    }
                }
                if (onAuthSuccess) await onAuthSuccess(data.user);
                onClose();
            }
        } catch (err) {
            console.error("Sign up error:", err);
            setErrorMsg(err.message || "Failed to create account.");
        } finally {
            setCloudSyncPaused(false);
            setLoading(false);
        }
    };

    // 3. Handle Verify Signup OTP Code
    const handleVerifySignupOtp = async (e) => {
        e.preventDefault();
        clearStatus();
        if (!email || !otpCode) {
            setErrorMsg("Please enter both your email and the 6-digit code.");
            return;
        }

        setLoading(true);
        try {
            const data = await verifyOtpCode(email, otpCode);
            showToast("Email verified successfully!", "success");

            if (data?.session && data?.user) {
                // If OTP signin gave a session, sync and finish!
                if (password) {
                    // Cache the encryption key
                    try {
                        if (localState) await saveUserDataToCloud(localState, password);
                    } catch (sErr) {
                        console.warn("Sync after OTP verification:", sErr);
                    }
                }
                if (onAuthSuccess) await onAuthSuccess(data.user);
                onClose();
            } else {
                setNotice("Email verified! Enter your password to sign in.");
                setAuthView("signIn");
            }
        } catch (err) {
            console.error("OTP error:", err);
            setErrorMsg(err.message || "Invalid or expired confirmation code. Please check and try again.");
        } finally {
            setLoading(false);
        }
    };

    // 4. Handle Forgot Password (Send Recovery Code/Email)
    const handleForgotPasswordRequest = async (e) => {
        e.preventDefault();
        clearStatus();
        if (!email) {
            setErrorMsg("Please enter your email address.");
            return;
        }

        setLoading(true);
        try {
            await sendPasswordResetEmail(email);
            setResendSuccess(`Password reset code sent to ${email}! Enter the 6-digit code and your new password below.`);
            showToast("Reset code sent! Check your email.", "success");
            setAuthView("verifyResetOtp");
        } catch (err) {
            console.error("Password reset error:", err);
            setErrorMsg(err.message || "Failed to send password reset email.");
        } finally {
            setLoading(false);
        }
    };

    // 5. Handle Verify Recovery OTP & Set New Password
    const handleVerifyResetOtp = async (e) => {
        e.preventDefault();
        clearStatus();

        if (!email || !otpCode) {
            setErrorMsg("Please enter your email and the 6-digit code.");
            return;
        }
        if (!password || password.length < 6) {
            setErrorMsg("New password must be at least 6 characters.");
            return;
        }
        if (password !== confirmPassword) {
            setErrorMsg("Passwords do not match.");
            return;
        }

        setLoading(true);
        setCloudSyncPaused(true);
        try {
            // 1. Verify OTP with recovery type -> establishes authenticated session
            await verifyRecoveryOtp(email, otpCode);

            // 2. Update user's password in Supabase Auth
            const updateRes = await updateUserPassword(password);

            // 3. Re-encrypt & upload local data — but only if this device actually has data. An empty/new device must not
            //    overwrite the cloud copy; that copy stays recoverable with the recovery kit (sign in → attach kit).
            if (localState && hasMeaningfulData(localState)) {
                try {
                    await saveUserDataToCloud(localState, password);
                } catch (saveErr) {
                    console.warn("Sync after password reset:", saveErr);
                }
            }

            showToast("Password reset successfully! You are now signed in.", "success");
            if (onAuthSuccess) await onAuthSuccess(updateRes?.user || { email });
            onClose();
        } catch (err) {
            console.error("Reset OTP error:", err);
            setErrorMsg(err.message || "Failed to reset password. Please check the code and try again.");
        } finally {
            setCloudSyncPaused(false);
            setLoading(false);
        }
    };

    // 6. Handle Set New Password (Direct redirect callback)
    const handleSetNewPasswordDirect = async (e) => {
        e.preventDefault();
        clearStatus();

        if (!password || password.length < 6) {
            setErrorMsg("Password must be at least 6 characters.");
            return;
        }
        if (password !== confirmPassword) {
            setErrorMsg("Passwords do not match.");
            return;
        }

        setLoading(true);
        setCloudSyncPaused(true);
        try {
            const res = await updateUserPassword(password);
            if (localState && hasMeaningfulData(localState)) {
                try {
                    await saveUserDataToCloud(localState, password);
                } catch (sErr) {
                    console.warn("Sync after direct reset:", sErr);
                }
            }
            showToast("Password updated successfully!", "success");
            if (onAuthSuccess) await onAuthSuccess(res?.user || null);
            onClose();
        } catch (err) {
            console.error("Update password error:", err);
            setErrorMsg(err.message || "Failed to update password.");
        } finally {
            setCloudSyncPaused(false);
            setLoading(false);
        }
    };

    const isEmailUnconfirmed = errorMsg.toLowerCase().includes("email not confirmed");

    return (
        <div className="modal-overlay confirm-modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div
                className="modal-container auth-modal-responsive"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '460px',
                    width: '92%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    padding: '24px',
                    borderRadius: '16px',
                    background: 'var(--card-bg, #ffffff)',
                    boxShadow: '0 20px 45px rgba(0,0,0,0.22)',
                    border: '1px solid var(--border-color, #E2E8F0)'
                }}
            >
                {/* Modal Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            background: authView.includes('Password') || authView.includes('Reset')
                                ? 'linear-gradient(135deg, #3B82F6, #1D4ED8)'
                                : 'linear-gradient(135deg, #10B981, #059669)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '1.2rem',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                            flexShrink: 0
                        }}>
                            {authView.includes('Password') || authView.includes('Reset') ? '🔑' : '☁️'}
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                {authView === "signIn" && "Cloud Sign In"}
                                {authView === "signUp" && "Create Account"}
                                {authView === "verifySignupOtp" && "Verify Email Code"}
                                {authView === "forgotPassword" && "Reset Password"}
                                {authView === "verifyResetOtp" && "Set New Password"}
                                {authView === "setNewPassword" && "Set New Password"}
                            </h3>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                {authView === "signIn" && "Access your encrypted financial cloud backup"}
                                {authView === "signUp" && "Save & sync your finances across all devices"}
                                {authView === "verifySignupOtp" && "Enter the 6-digit confirmation code from your email"}
                                {authView === "forgotPassword" && "We will send a 6-digit recovery code to your email"}
                                {authView === "verifyResetOtp" && "Enter your 6-digit recovery code and new password"}
                                {authView === "setNewPassword" && "Choose a strong new password for your account"}
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

                {/* Informational Notice */}
                {notice && (
                    <div style={{
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        color: '#1E40AF',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        fontSize: '0.79rem',
                        marginBottom: '14px',
                        lineHeight: 1.45
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>ℹ️</span>
                            <span>Notice</span>
                        </div>
                        <div>{notice}</div>
                    </div>
                )}

                {/* Success Banner */}
                {resendSuccess && (
                    <div style={{
                        background: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        color: '#065F46',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <span>✅</span>
                        <span>{resendSuccess}</span>
                    </div>
                )}

                {/* Error Banner */}
                {errorMsg && (
                    <div style={{
                        background: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                        color: '#B91C1C',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        marginBottom: '14px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>⚠️</span>
                            <span>{errorMsg}</span>
                        </div>
                        {isEmailUnconfirmed && (
                            <div style={{
                                marginTop: '8px',
                                paddingTop: '8px',
                                borderTop: '1px solid #FECACA',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '8px'
                            }}>
                                <span style={{ fontSize: '0.76rem', color: '#991B1B' }}>
                                    Need a new verification code?
                                </span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={() => { setAuthView("verifySignupOtp"); clearStatus(); }}
                                        style={{ background: '#B91C1C', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.74rem', cursor: 'pointer' }}
                                    >
                                        Enter Code
                                    </button>
                                    <button
                                        type="button"
                                        disabled={resending}
                                        onClick={handleResendSignupEmail}
                                        style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.74rem', cursor: resending ? 'not-allowed' : 'pointer' }}
                                    >
                                        {resending ? "Sending..." : "Resend"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* VIEW 1: SIGN IN */}
                {authView === "signIn" && (
                    <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                Email Address
                            </label>
                            <input
                                type="email"
                                required
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="form-control"
                                style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                    Password
                                </label>
                                <button
                                    type="button"
                                    onClick={() => { setAuthView("forgotPassword"); clearStatus(); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--primary, #6558D3)', fontSize: '0.76rem', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                                >
                                    Forgot password?
                                </button>
                            </div>
                            <input
                                type="password"
                                required
                                minLength={6}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="form-control"
                                style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                        </div>

                        <details style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <summary style={{ cursor: 'pointer' }}>Reset your password or forgot the old one? Use a recovery kit</summary>
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span>Your cloud data is encrypted with the password it was saved under. If you changed it, the recovery kit file you downloaded from Settings can still open it.</span>
                                <input
                                    type="file"
                                    accept=".json,application/json"
                                    onChange={async (e) => {
                                        const f = e.target.files && e.target.files[0];
                                        if (!f) { setRecoveryKit(null); setRecoveryKitName(""); return; }
                                        try {
                                            setRecoveryKit(parseRecoveryKit(await f.text()));
                                            setRecoveryKitName(f.name);
                                            setErrorMsg("");
                                        } catch (kitErr) {
                                            setRecoveryKit(null); setRecoveryKitName("");
                                            setErrorMsg(kitErr.message);
                                        }
                                    }}
                                />
                                {recoveryKitName && <span style={{ color: 'var(--success, #059669)', fontWeight: 600 }}>✓ {recoveryKitName} attached</span>}
                            </div>
                        </details>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary"
                            style={{
                                marginTop: '6px',
                                padding: '11px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? "Connecting..." : "Sign In & Sync →"}
                        </button>

                        <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <span>
                                Don't have an account yet?{" "}
                                <button
                                    type="button"
                                    onClick={() => { setAuthView("signUp"); clearStatus(); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--primary, #059669)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                >
                                    Create Account
                                </button>
                            </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', fontSize: '0.76rem', marginTop: '4px' }}>
                            <button
                                type="button"
                                onClick={() => { setAuthView("verifySignupOtp"); clearStatus(); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                                Enter 6-digit confirmation code
                            </button>
                            <span>•</span>
                            <button
                                type="button"
                                disabled={resending}
                                onClick={handleResendSignupEmail}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: resending ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}
                            >
                                {resending ? "Sending..." : "Resend code"}
                            </button>
                        </div>
                    </form>
                )}

                {/* VIEW 2: SIGN UP */}
                {authView === "signUp" && (
                    <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                Email Address
                            </label>
                            <input
                                type="email"
                                required
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="form-control"
                                style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
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
                                style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
                                Minimum 6 characters
                            </span>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary"
                            style={{
                                marginTop: '6px',
                                padding: '11px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? "Creating..." : "Sign Up & Send Code →"}
                        </button>

                        <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <span>
                                Already have an account?{" "}
                                <button
                                    type="button"
                                    onClick={() => { setAuthView("signIn"); clearStatus(); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--primary, #059669)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                >
                                    Sign In
                                </button>
                            </span>
                        </div>
                    </form>
                )}

                {/* VIEW 3: VERIFY SIGNUP OTP */}
                {authView === "verifySignupOtp" && (
                    <form onSubmit={handleVerifySignupOtp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                Email Address
                            </label>
                            <input
                                type="email"
                                required
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="form-control"
                                style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                6-Digit Confirmation Code
                            </label>
                            <input
                                type="text"
                                required
                                maxLength={8}
                                placeholder="123456"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.trim())}
                                className="form-control"
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    fontSize: '1.25rem',
                                    letterSpacing: '4px',
                                    textAlign: 'center',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary"
                            style={{
                                marginTop: '6px',
                                padding: '11px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? "Verifying..." : "Verify Code & Activate"}
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', marginTop: '6px' }}>
                            <button
                                type="button"
                                disabled={resending}
                                onClick={handleResendSignupEmail}
                                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: resending ? 'not-allowed' : 'pointer', padding: 0, textDecoration: 'underline' }}
                            >
                                {resending ? "Sending..." : "Didn't get code? Resend"}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setAuthView("signIn"); clearStatus(); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                            >
                                ← Back to Sign In
                            </button>
                        </div>
                    </form>
                )}

                {/* VIEW 4: FORGOT PASSWORD (REQUEST CODE) */}
                {authView === "forgotPassword" && (
                    <form onSubmit={handleForgotPasswordRequest} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                Account Email Address
                            </label>
                            <input
                                type="email"
                                required
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="form-control"
                                autoFocus
                                style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                We'll email you a 6-digit recovery code to reset your password.
                            </span>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary"
                            style={{
                                marginTop: '6px',
                                padding: '11px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? "Sending..." : "Send Reset Code →"}
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', marginTop: '6px' }}>
                            <button
                                type="button"
                                onClick={() => { setAuthView("verifyResetOtp"); clearStatus(); }}
                                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                            >
                                Already have code? Enter here
                            </button>
                            <button
                                type="button"
                                onClick={() => { setAuthView("signIn"); clearStatus(); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                            >
                                ← Back to Sign In
                            </button>
                        </div>
                    </form>
                )}

                {/* VIEW 5: VERIFY RESET OTP & ENTER NEW PASSWORD */}
                {authView === "verifyResetOtp" && (
                    <form onSubmit={handleVerifyResetOtp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                Email Address
                            </label>
                            <input
                                type="email"
                                required
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="form-control"
                                style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                6-Digit Recovery Code
                            </label>
                            <input
                                type="text"
                                required
                                maxLength={8}
                                placeholder="123456"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.trim())}
                                className="form-control"
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    fontSize: '1.2rem',
                                    letterSpacing: '4px',
                                    textAlign: 'center',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                New Password
                            </label>
                            <input
                                type="password"
                                required
                                minLength={6}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="form-control"
                                style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                Confirm New Password
                            </label>
                            <input
                                type="password"
                                required
                                minLength={6}
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="form-control"
                                style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary"
                            style={{
                                marginTop: '6px',
                                padding: '11px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? "Updating..." : "Reset Password & Sign In"}
                        </button>

                        <div style={{ textAlign: 'center', marginTop: '4px' }}>
                            <button
                                type="button"
                                onClick={() => { setAuthView("signIn"); clearStatus(); }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}
                            >
                                ← Back to Sign In
                            </button>
                        </div>
                    </form>
                )}

                {/* VIEW 6: DIRECT RECOVERY SET PASSWORD */}
                {authView === "setNewPassword" && (
                    <form onSubmit={handleSetNewPasswordDirect} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                New Password
                            </label>
                            <input
                                type="password"
                                required
                                minLength={6}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="form-control"
                                autoFocus
                                style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                Confirm New Password
                            </label>
                            <input
                                type="password"
                                required
                                minLength={6}
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="form-control"
                                style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary"
                            style={{
                                marginTop: '6px',
                                padding: '11px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? "Saving..." : "Save Password & Sign In"}
                        </button>
                    </form>
                )}

                {/* Footer Disclaimer */}
                <div style={{
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.73rem',
                    color: 'var(--text-muted)'
                }}>
                    <span>🔐</span>
                    <span><strong>End-to-End Encrypted:</strong> Financial records are encrypted using AES-256 before leaving your browser.</span>
                </div>
            </div>
        </div>
    );
};

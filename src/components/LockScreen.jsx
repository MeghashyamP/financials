import React from 'react';
import { verifyPassphrase, forceRemoveLock } from '../services/appLock.js';
import { wipeDatabase } from '../store.js';

/**
 * Full-screen lock shown on open and after idle time. Unlocking is a passphrase check against a salted PBKDF2
 * verifier; repeated wrong guesses are slowed down. "Forgot passphrase" offers the only way back in — erasing this
 * browser's local data (cloud copy and backups are untouched) — because a lock with a bypass would be pointless.
 */
export const LockScreen = ({ onUnlock }) => {
    const [pass, setPass] = React.useState('');
    const [error, setError] = React.useState('');
    const [fails, setFails] = React.useState(0);
    const [waitUntil, setWaitUntil] = React.useState(0);
    const [now, setNow] = React.useState(Date.now());
    const [busy, setBusy] = React.useState(false);
    const [forgot, setForgot] = React.useState(false);
    const [erase, setErase] = React.useState('');

    React.useEffect(() => {
        if (waitUntil <= Date.now()) return undefined;
        const t = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(t);
    }, [waitUntil]);
    const waiting = Math.max(0, Math.ceil((waitUntil - now) / 1000));

    const submit = async (e) => {
        e.preventDefault();
        if (busy || waiting > 0 || !pass) return;
        setBusy(true);
        try {
            if (await verifyPassphrase(pass)) {
                setPass(''); setError(''); setFails(0);
                onUnlock();
                return;
            }
            const n = fails + 1;
            setFails(n);
            setError('Wrong passphrase.');
            if (n >= 3) { const secs = Math.min(60, 2 ** (n - 2)); setWaitUntil(Date.now() + secs * 1000); setNow(Date.now()); }
            setPass('');
        } finally { setBusy(false); }
    };

    const eraseAndReset = async () => {
        if (erase !== 'ERASE') return;
        setBusy(true);
        try {
            await wipeDatabase();
        } catch (e) { /* continue: the lock must still be dropped */ }
        forceRemoveLock();
        window.location.reload();
    };

    return (
        <div role="dialog" aria-modal="true" aria-label="App locked" style={{
            position: 'fixed', inset: 0, zIndex: 100000, background: 'var(--bg-color, #F8FAFC)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
            <div style={{ width: '100%', maxWidth: '380px', background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color, #E2E8F0)', borderRadius: '16px', padding: '28px 24px', boxShadow: '0 10px 30px rgba(15,23,42,0.08)', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '6px' }}>🔒</div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.15rem' }}>Financials is locked</h2>
                {!forgot ? (
                    <form onSubmit={submit}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 14px' }}>Enter your passphrase to continue.</p>
                        <input
                            type="password" className="form-control" autoFocus autoComplete="current-password"
                            placeholder="Passphrase" value={pass} onChange={(e) => { setPass(e.target.value); setError(''); }}
                            disabled={busy || waiting > 0} style={{ textAlign: 'center' }}
                        />
                        {error && <div style={{ color: 'var(--danger, #DC2626)', fontSize: '0.82rem', fontWeight: 600, marginTop: '8px' }}>{error}</div>}
                        {waiting > 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '4px' }}>Too many attempts — try again in {waiting}s.</div>}
                        <button type="submit" className="btn btn-primary" disabled={busy || waiting > 0 || !pass} style={{ width: '100%', marginTop: '14px' }}>
                            {busy ? 'Checking…' : 'Unlock'}
                        </button>
                        <button type="button" onClick={() => setForgot(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
                            Forgot passphrase?
                        </button>
                    </form>
                ) : (
                    <div style={{ textAlign: 'left' }}>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-main)', margin: '10px 0' }}>
                            A forgotten passphrase can't be recovered or bypassed. The only way back in is to <strong>erase the data stored in this browser</strong> and remove the lock.
                        </p>
                        <ul style={{ fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: '18px', margin: '0 0 12px' }}>
                            <li>Your cloud copy (if you use Cloud Sync) and any JSON backups are not touched.</li>
                            <li>After erasing, sign in again or restore a backup to get your data back.</li>
                        </ul>
                        <label style={{ fontSize: '0.78rem' }}>Type <strong>ERASE</strong> to confirm
                            <input className="form-control" value={erase} onChange={(e) => setErase(e.target.value)} autoFocus />
                        </label>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button className="btn btn-danger" disabled={erase !== 'ERASE' || busy} onClick={eraseAndReset} style={{ flex: 1 }}>{busy ? 'Erasing…' : 'Erase & unlock'}</button>
                            <button className="btn btn-secondary" onClick={() => { setForgot(false); setErase(''); }} style={{ flex: 1 }}>Back</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

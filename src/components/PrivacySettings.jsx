import React from 'react';
import {
    isLockEnabled, createLock, removeLock, getIdleMinutes, setIdleMinutes, MIN_PASSPHRASE,
    readPrivacyDefault, writePrivacyDefault
} from '../services/appLock.js';

/**
 * Settings → Privacy: hide amounts, and an on-screen app lock. `privacy` comes from the App shell:
 *   { privacyMode, setPrivacyMode, lockEnabled, lockNow, onLockChanged }
 */
export const PrivacySettings = ({ privacy, showToast }) => {
    const [hideDefault, setHideDefault] = React.useState(() => readPrivacyDefault());
    const [pass, setPass] = React.useState('');
    const [confirm, setConfirm] = React.useState('');
    const [current, setCurrent] = React.useState('');
    const [idle, setIdle] = React.useState(() => getIdleMinutes());
    const [busy, setBusy] = React.useState(false);
    const enabled = privacy.lockEnabled;

    const setLock = async (e) => {
        e.preventDefault();
        if (pass !== confirm) { showToast('The two passphrases do not match', 'error'); return; }
        setBusy(true);
        try {
            await createLock(pass, { idleMinutes: idle });
            setPass(''); setConfirm('');
            privacy.onLockChanged();
            showToast('App lock is on. It will ask for the passphrase when the app opens and after idle time.');
        } catch (err) {
            showToast(err.message || 'Could not set the lock', 'error');
        } finally { setBusy(false); }
    };

    const turnOff = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const ok = await removeLock(current);
            if (!ok) { showToast('Wrong passphrase', 'error'); return; }
            setCurrent('');
            privacy.onLockChanged();
            showToast('App lock removed');
        } finally { setBusy(false); }
    };

    const changeIdle = (v) => {
        const minutes = Number(v);
        setIdle(minutes);
        if (enabled) setIdleMinutes(minutes);
    };

    return (
        <div className="section-card">
            <div className="section-card-title">Privacy & lock</div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => privacy.setPrivacyMode(!privacy.privacyMode)}>
                    {privacy.privacyMode ? '👁️ Show amounts' : '🙈 Hide amounts now'}
                </button>
                <label style={{ fontSize: '0.82rem', display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={hideDefault} onChange={(e) => { setHideDefault(e.target.checked); writePrivacyDefault(e.target.checked); }} />
                    Start with amounts hidden on this device
                </label>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 16px' }}>
                Replaces every amount with •••• so you can use the app on a shared screen. The sidebar has a quick toggle too.
            </p>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px' }}>App lock {enabled && <span style={{ color: 'var(--success)', fontSize: '0.78rem' }}>· on</span>}</div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 10px' }}>
                    Asks for a passphrase when the app opens and after idle time. This keeps an unattended screen private — it does <strong>not</strong> encrypt
                    the data stored in this browser (Cloud Sync is the encrypted copy). The passphrase never leaves this device and can't be recovered if forgotten.
                </p>

                <label style={{ fontSize: '0.78rem', display: 'inline-flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                    Lock after
                    <select className="form-control" style={{ width: 'auto' }} value={idle} onChange={(e) => changeIdle(e.target.value)}>
                        <option value={5}>5 minutes idle</option>
                        <option value={15}>15 minutes idle</option>
                        <option value={30}>30 minutes idle</option>
                        <option value={0}>only when the app opens</option>
                    </select>
                </label>

                {!enabled ? (
                    <form onSubmit={setLock} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <label style={{ fontSize: '0.76rem' }}>New passphrase
                            <input type="password" autoComplete="new-password" className="form-control" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={`${MIN_PASSPHRASE}+ characters`} />
                        </label>
                        <label style={{ fontSize: '0.76rem' }}>Repeat it
                            <input type="password" autoComplete="new-password" className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                        </label>
                        <button className="btn btn-primary" type="submit" disabled={busy || pass.length < MIN_PASSPHRASE || !confirm}>Turn on lock</button>
                    </form>
                ) : (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={privacy.lockNow}>🔒 Lock now</button>
                        <form onSubmit={turnOff} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '0.76rem' }}>Current passphrase
                                <input type="password" autoComplete="current-password" className="form-control" value={current} onChange={(e) => setCurrent(e.target.value)} />
                            </label>
                            <button className="btn btn-secondary" type="submit" disabled={busy || !current}>Turn off lock</button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
};

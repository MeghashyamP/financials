import React from 'react';
import { generateRecoveryKit, buildRecoveryKitFile, parseRecoveryKit } from '../services/crypto.js';
import { getSessionEncryptionKey, testRecoveryKit } from '../services/supabaseService.js';
import { formatDate } from '../utils.jsx';

/**
 * Settings → Cloud recovery kit. Cloud data is encrypted with your account password, so a forgotten or reset
 * password would lock you out of the cloud copy. The kit is a file (a private key) that can still open it.
 */
export const RecoveryKitCard = ({ settings = {}, updateSetting, currentUser, showToast }) => {
    const meta = settings.recoveryKitMeta || null;
    const hasKit = !!settings.recoveryPublicKey && !!meta;
    const [busy, setBusy] = React.useState(false);
    const [confirmNew, setConfirmNew] = React.useState(false);
    const [result, setResult] = React.useState(null);

    const create = async () => {
        if (!getSessionEncryptionKey()) {
            showToast('Sync is paused — sign in again first, then create the kit.', 'warning');
            return;
        }
        if (hasKit && !confirmNew) { setConfirmNew(true); return; }
        setBusy(true);
        try {
            const kit = await generateRecoveryKit();
            const text = buildRecoveryKitFile({ privateKey: kit.privateKey, kid: kit.kid, email: currentUser?.email || '' });
            // Settings sync to the cloud, so every device keeps sealing the current password with this public key.
            await updateSetting('recoveryPublicKey', kit.publicKey);
            await updateSetting('recoveryKitMeta', { kid: kit.kid, createdAt: new Date().toISOString() });
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `financials-recovery-kit-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            setConfirmNew(false);
            setResult({ ok: true, text: 'Kit downloaded. Keep it offline (USB stick, password manager attachment, printed). Your cloud copy updates in a few seconds — then use "Test a kit file" to confirm it works.' });
        } catch (e) {
            setResult({ ok: false, text: e.message || 'Could not create the kit.' });
        } finally { setBusy(false); }
    };

    const test = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        try {
            const kit = parseRecoveryKit(await file.text());
            await testRecoveryKit(kit);
            setResult({ ok: true, text: `✓ ${file.name} opens your current cloud copy. It will also work after a password reset.` });
        } catch (err) {
            setResult({ ok: false, text: err.message || 'The kit could not open the cloud copy.' });
        } finally { setBusy(false); }
    };

    return (
        <div className="section-card">
            <div className="section-card-title">Cloud recovery kit</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 10px' }}>
                Your cloud copy is encrypted with your account password — nobody, including the server, can read it without that password.
                That also means <strong>a forgotten password or an e-mail reset locks you out of the cloud copy</strong>. The recovery kit is a file that
                can still open it. Without a kit, only a device that already holds your data can re-save it under a new password.
            </p>
            <div style={{ fontSize: '0.82rem', marginBottom: '10px' }}>
                Status: {hasKit
                    ? <span style={{ color: 'var(--success, #059669)', fontWeight: 600 }}>kit created {formatDate(meta.createdAt, settings.dateFormat)} (id {meta.kid})</span>
                    : <span style={{ color: '#B45309', fontWeight: 600 }}>no kit yet</span>}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button className={`btn ${hasKit ? 'btn-secondary' : 'btn-primary'}`} disabled={busy} onClick={create}>
                    {confirmNew ? 'Replace it — the old file stops working' : hasKit ? 'Create a new kit' : 'Create & download recovery kit'}
                </button>
                {confirmNew && <button className="btn btn-secondary" onClick={() => setConfirmNew(false)}>Cancel</button>}
                <label className="btn btn-secondary" style={{ cursor: busy ? 'not-allowed' : 'pointer', margin: 0 }}>
                    Test a kit file
                    <input type="file" accept=".json,application/json" style={{ display: 'none' }} disabled={busy} onChange={test} />
                </label>
            </div>
            {result && (
                <div style={{ marginTop: '10px', fontSize: '0.8rem', fontWeight: 600, color: result.ok ? 'var(--success, #059669)' : 'var(--danger, #DC2626)' }}>{result.text}</div>
            )}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.74rem', margin: '12px 0 0' }}>
                Anyone holding the kit file <em>and</em> able to read your cloud copy can unlock your data and learn your account password — treat it like a spare key.
                It can't be downloaded again; make a new one if it's lost. To use it: Cloud Sign In → "Use a recovery kit".
            </p>
        </div>
    );
};

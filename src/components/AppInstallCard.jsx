import React from 'react';
import {
    getPwaState, subscribePwa, promptInstall, isStandalone,
    getStorageStatus, requestPersistentStorage, formatBytes
} from '../services/pwa.js';

// Settings card: install the site as an app, protect the data stored in this browser, see which version is running.
export const AppInstallCard = () => {
    const [pwa, setPwa] = React.useState(getPwaState());
    const [storage, setStorage] = React.useState({ supported: false, persisted: false, usage: 0, quota: 0 });
    const [offlineReady, setOfflineReady] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    const refreshStorage = React.useCallback(async () => { setStorage(await getStorageStatus()); }, []);

    React.useEffect(() => subscribePwa(setPwa), []);
    React.useEffect(() => { refreshStorage(); }, [refreshStorage]);
    React.useEffect(() => {
        const check = () => setOfflineReady(Boolean(navigator.serviceWorker && navigator.serviceWorker.controller));
        check();
        if (navigator.serviceWorker) {
            navigator.serviceWorker.addEventListener('controllerchange', check);
            return () => navigator.serviceWorker.removeEventListener('controllerchange', check);
        }
        return undefined;
    }, [pwa.offlineReady]);

    const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'development';
    const installed = pwa.installed || isStandalone();
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');

    const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border-color)' };
    const label = { fontWeight: 600, fontSize: '0.88rem' };
    const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' };
    const pill = (ok) => ({ fontSize: '0.74rem', fontWeight: 700, padding: '3px 10px', borderRadius: '10px', background: ok ? '#D1FAE5' : '#FEF3C7', color: ok ? '#065F46' : '#92400E' });

    return (
        <div className="section-card" style={{ borderLeft: '4px solid var(--primary)' }}>
            <div className="section-card-title">📱 Install on your phone</div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Open Financials like a normal app: its own icon, no browser bar, and it works offline. Your data stays on this device.
            </p>

            <div style={row}>
                <div>
                    <div style={label}>Install the app</div>
                    <div style={hint}>
                        {installed ? 'You are using the installed app.'
                            : pwa.canInstall ? 'One tap installs it on this device.'
                                : isIos ? 'On iPhone: tap Share, then "Add to Home Screen".'
                                    : 'In Chrome: open the ⋮ menu, then "Install app" (or "Add to Home screen").'}
                    </div>
                </div>
                {installed
                    ? <span style={pill(true)}>Installed ✓</span>
                    : pwa.canInstall
                        ? <button className="btn btn-primary btn-sm" onClick={() => promptInstall()}>Install app</button>
                        : <span style={pill(false)}>Not installed</span>}
            </div>

            <div style={row}>
                <div>
                    <div style={label}>Works offline</div>
                    <div style={hint}>{offlineReady ? 'The app files are saved on this device.' : 'Open the app once while online and it will save itself for offline use.'}</div>
                </div>
                <span style={pill(offlineReady)}>{offlineReady ? 'Ready' : 'Not yet'}</span>
            </div>

            <div style={row}>
                <div>
                    <div style={label}>Keep my data safe on this device</div>
                    <div style={hint}>
                        {storage.supported
                            ? `${formatBytes(storage.usage)} used${storage.quota ? ` of ${formatBytes(storage.quota)}` : ''}. ${storage.persisted ? 'The browser will not clear it when space runs low.' : 'The browser may clear it if the phone runs out of space.'}`
                            : 'This browser does not report storage.'}
                        {' '}Backups and cloud sync are still your real safety net.
                    </div>
                </div>
                {storage.persisted
                    ? <span style={pill(true)}>Protected ✓</span>
                    : <button className="btn btn-secondary btn-sm" disabled={busy || !storage.supported} onClick={async () => { setBusy(true); await requestPersistentStorage(); await refreshStorage(); setBusy(false); }}>Protect my data</button>}
            </div>

            <div style={row}>
                <div>
                    <div style={label}>Version</div>
                    <div style={hint}>Check this after an update to confirm your phone has the latest.</div>
                </div>
                <code style={{ fontSize: '0.8rem' }}>{version}</code>
            </div>
        </div>
    );
};

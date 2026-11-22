import React from 'react';
import { getPwaState, subscribePwa, applyUpdate, dismissUpdate } from '../services/pwa.js';

// Small card shown when a new version of the app has been downloaded in the background.
// Nothing changes until you tap Reload, so the app never swaps under you mid-task.
// Also confirms (briefly, once) that the app is now ready to work offline.
export const UpdatePrompt = () => {
    const [pwa, setPwa] = React.useState(getPwaState());
    const [showOffline, setShowOffline] = React.useState(false);

    React.useEffect(() => subscribePwa(setPwa), []);

    React.useEffect(() => {
        if (!pwa.offlineReady) return undefined;
        setShowOffline(true);
        const t = setTimeout(() => setShowOffline(false), 5000);
        return () => clearTimeout(t);
    }, [pwa.offlineReady]);

    if (!pwa.needRefresh && !showOffline) return null;

    return (
        <div className="update-banner" role="status" aria-live="polite">
            {pwa.needRefresh ? (
                <>
                    <span><strong>New version available.</strong> Reload to update.</span>
                    <span className="update-banner-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => applyUpdate()}>Reload</button>
                        <button className="btn btn-secondary btn-sm" onClick={dismissUpdate}>Later</button>
                    </span>
                </>
            ) : (
                <span>✅ Ready to work offline.</span>
            )}
        </div>
    );
};

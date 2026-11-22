import React from 'react';

/** Always-visible cloud status for the phone's top bar: signed out, or signed in with a coloured sync state. */
export const syncBadgeInfo = (user, status) => {
    if (!user) return { tone: 'off', label: 'Sign in', title: 'Sign in to sync your data across devices' };
    switch (status) {
        case 'syncing': return { tone: 'busy', label: 'Syncing', title: 'Syncing with the cloud…' };
        case 'offline': return { tone: 'warn', label: 'Offline', title: 'No connection: changes are kept on this device and will sync when you are back online' };
        case 'locked': return { tone: 'warn', label: 'Sign in', title: 'Sync is paused: tap to sign in again' };
        case 'error': return { tone: 'bad', label: 'Retry', title: 'The last sync did not work. Tap for details; it retries automatically.' };
        default: return { tone: 'ok', label: 'Synced', title: 'Signed in and up to date' };
    }
};

export const SyncBadge = ({ user, status, lastSyncedAt, onClick }) => {
    const info = syncBadgeInfo(user, status);
    const when = lastSyncedAt ? ` · checked ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
    return (
        <button
            type="button"
            className={`sync-badge sync-badge-${info.tone}`}
            onClick={onClick}
            title={`${user ? `${user.email} — ` : ''}${info.title}${user ? when : ''}`}
            aria-label={`Cloud: ${info.label}`}
        >
            <span className="sync-badge-dot" aria-hidden="true" />
            <span className="sync-badge-label">{info.label}</span>
        </button>
    );
};

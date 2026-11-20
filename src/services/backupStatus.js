/**
 * backupStatus.js — when was this device's data last copied somewhere safe?
 *
 * Browser storage can be cleared (by you, by a "clean up" tool, or by the browser under storage pressure), so the
 * app nags politely when nothing has left this browser for a while. A JSON download, a successful cloud sync and a
 * write to the linked local file each count. Timestamps live in this browser's localStorage (per device).
 */

export const BACKUP_KEYS = {
    file: 'last_backup_file_at',
    cloud: 'last_cloud_sync_at',
    linked: 'last_linked_file_at',
    snooze: 'backup_banner_snoozed_until'
};
export const STALE_DAYS = 14;

const defaultStore = () => (typeof localStorage !== 'undefined' ? localStorage : null);
const read = (store, key) => { try { return store ? store.getItem(key) : null; } catch (e) { return null; } };
const write = (store, key, value) => { try { if (store) store.setItem(key, value); } catch (e) { /* storage unavailable */ } };

export const markBackup = (kind, now = new Date(), store = defaultStore()) => {
    if (!BACKUP_KEYS[kind] || kind === 'snooze') return;
    write(store, BACKUP_KEYS[kind], now.toISOString());
};

export const snoozeBackupBanner = (days = 7, now = new Date(), store = defaultStore()) => {
    write(store, BACKUP_KEYS.snooze, new Date(now.getTime() + days * 86400000).toISOString());
};

/** { show, lastAt, daysSince, via, message } */
export const backupHealth = ({ transactionCount = 0, now = new Date(), store = defaultStore() } = {}) => {
    const stamps = ['file', 'cloud', 'linked']
        .map((k) => ({ kind: k, at: read(store, BACKUP_KEYS[k]) }))
        .filter((s) => s.at && !Number.isNaN(Date.parse(s.at)))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const last = stamps[0] || null;
    const daysSince = last ? Math.floor((now.getTime() - Date.parse(last.at)) / 86400000) : null;
    const snoozedUntil = read(store, BACKUP_KEYS.snooze);
    const snoozed = snoozedUntil && Date.parse(snoozedUntil) > now.getTime();

    const stale = !last || daysSince >= STALE_DAYS;
    const show = transactionCount > 0 && stale && !snoozed;
    const via = { file: 'a downloaded backup', cloud: 'cloud sync', linked: 'the linked file' };
    return {
        show,
        lastAt: last ? last.at : null,
        daysSince,
        via: last ? via[last.kind] : null,
        message: last
            ? `Your data lives in this browser. The last copy was ${daysSince === 0 ? 'today' : `${daysSince} day${daysSince === 1 ? '' : 's'} ago`} (${via[last.kind]}).`
            : 'Your data lives only in this browser and has never been backed up.'
    };
};

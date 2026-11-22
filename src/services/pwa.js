/**
 * pwa.js — everything the installable-app (PWA) side of Financials needs:
 *   - service-worker registration + "new version available" state
 *   - the Install button (beforeinstallprompt)
 *   - asking the browser to keep our data ("persistent storage")
 *   - home-screen shortcut actions (?action=add|import|review)
 * Pure helpers are unit-tested in node; browser-only parts guard on window / navigator.
 */

// ───────────── launch shortcuts ─────────────

export const LAUNCH_ACTIONS = ['add', 'import', 'review'];

/** "?action=import" → "import"; anything unknown → null. */
export const parseLaunchAction = (search = '') => {
    const value = new URLSearchParams(String(search)).get('action');
    return LAUNCH_ACTIONS.includes(value) ? value : null;
};

/** Same address without the ?action= part, so a refresh does not re-open the dialog. */
export const stripLaunchAction = (pathname = '/', search = '', hash = '') => {
    const params = new URLSearchParams(String(search));
    params.delete('action');
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ''}${hash || ''}`;
};

// ───────────── small formatting helper ─────────────

export const formatBytes = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return '0 KB';
    if (v < 1024 * 1024) return `${Math.max(1, Math.round(v / 1024))} KB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    return `${(v / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

// ───────────── is it running as an installed app? ─────────────

export const isStandalone = () => {
    if (typeof window === 'undefined') return false;
    try {
        return Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    } catch (e) { return false; }
};

// ───────────── persistent storage ─────────────
// Everything lives in this browser, so ask it not to clear our data when the phone runs low on space.

export const getStorageStatus = async () => {
    const out = { supported: false, persisted: false, usage: 0, quota: 0 };
    if (typeof navigator === 'undefined' || !navigator.storage) return out;
    out.supported = true;
    try { if (navigator.storage.persisted) out.persisted = await navigator.storage.persisted(); } catch (e) { /* ignore */ }
    try {
        if (navigator.storage.estimate) {
            const est = await navigator.storage.estimate();
            out.usage = est.usage || 0;
            out.quota = est.quota || 0;
        }
    } catch (e) { /* ignore */ }
    return out;
};

export const requestPersistentStorage = async () => {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) return false;
    try {
        if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
        return await navigator.storage.persist();
    } catch (e) { return false; }
};

// ───────────── shared state (update banner + install button) ─────────────

const state = { needRefresh: false, offlineReady: false, canInstall: false, installed: false };
const listeners = new Set();
let updateSW = null;
let deferredInstall = null;

const emit = () => listeners.forEach((fn) => { try { fn({ ...state }); } catch (e) { /* ignore */ } });

export const getPwaState = () => ({ ...state });
export const subscribePwa = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Tap "Reload" on the update banner: switch to the waiting version and refresh. */
export const applyUpdate = async () => {
    if (updateSW) { await updateSW(true); }
    else if (typeof window !== 'undefined') window.location.reload();
};
export const dismissUpdate = () => { state.needRefresh = false; emit(); };

// ───────────── install button ─────────────

export const initInstallPrompt = () => {
    if (typeof window === 'undefined') return;
    state.installed = isStandalone();
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();                 // keep it for our own Install button
        deferredInstall = e;
        state.canInstall = true;
        emit();
    });
    window.addEventListener('appinstalled', () => {
        deferredInstall = null;
        state.canInstall = false;
        state.installed = true;
        emit();
    });
};

export const promptInstall = async () => {
    if (!deferredInstall) return 'unavailable';
    const prompt = deferredInstall;
    deferredInstall = null;
    state.canInstall = false;
    emit();
    try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch (e) { return 'unavailable'; }
};

// ───────────── service worker ─────────────

/** Registers the worker (only in the real site build; the single-file build swaps this for a no-op). */
export const registerPwa = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
        const { registerSW } = await import('virtual:pwa-register');
        updateSW = registerSW({
            immediate: true,
            onNeedRefresh() { state.needRefresh = true; emit(); },
            onOfflineReady() { state.offlineReady = true; emit(); },
            onRegisterError(err) { console.warn('Service worker registration failed:', err); }
        });
    } catch (e) {
        console.warn('PWA support unavailable:', e);
    }
};

/** One call from main.jsx at start-up. */
export const startPwa = () => {
    initInstallPrompt();
    registerPwa();
    // Give the page a moment to settle, then ask the browser to protect our data (a no-op if already granted).
    setTimeout(() => { requestPersistentStorage(); }, 3000);
};

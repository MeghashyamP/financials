import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

// Default build (used for GitHub Pages): normal multi-file output. The PDF / OCR libraries are
// code-split and only downloaded when an import dialog needs them. It is also an installable PWA
// (manifest + service worker), so Chrome on Android can "Install app".
// `npm run build:single` (SINGLE_FILE=1) still produces one self-contained index.html for
// opening straight from disk. That build has NO service worker (it cannot be installed).
const singleFile = process.env.SINGLE_FILE === '1';
const here = path.dirname(fileURLToPath(import.meta.url));

// Shown in Settings so you can tell which version a phone is running: "22 Nov 2026 · a1b2c3d"
const buildVersion = (() => {
    let sha = 'dev';
    try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; } catch (e) { /* not a git checkout */ }
    const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${date} · ${sha}`;
})();

const pwa = VitePWA({
    // "prompt": a new version waits until you tap Reload, so the app never changes under you mid-task.
    registerType: 'prompt',
    injectRegister: false,            // registered by hand in src/main.jsx (see src/services/pwa.js)
    includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-64.png'],
    manifest: {
        name: 'Financials',
        short_name: 'Financials',
        description: 'Personal finance: statements, transactions, budgets and net worth. Your data stays on your device.',
        lang: 'en',
        categories: ['finance'],
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#6558D3',
        background_color: '#F8FAFC',
        icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        // Long-press the home-screen icon for these (handled by parseLaunchAction in src/services/pwa.js)
        shortcuts: [
            { name: 'Add transaction', short_name: 'Add', url: './?action=add', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Import statement', short_name: 'Import', url: './?action=import', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Needs Review', short_name: 'Review', url: './?action=review', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] }
        ]
    },
    workbox: {
        // The app shell and the lazy PDF chunks (so statements can be imported offline). Fonts are bundled.
        globPatterns: ['**/*.{js,css,html,woff2,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // Deliberately NO runtime caching: Supabase, Gemini and Google API calls always go to the network, so
        // the worker never stores sign-in tokens or financial responses.
        runtimeCaching: []
    },
    devOptions: { enabled: false }
});

export default defineConfig({
    plugins: [react(), ...(singleFile ? [viteSingleFile()] : [pwa])],
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(buildVersion)
    },
    resolve: {
        // The single-file build has no worker, so the registration module is replaced by a no-op.
        alias: singleFile ? { 'virtual:pwa-register': path.join(here, 'src/pwa-stub.js') } : {}
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
        chunkSizeWarningLimit: 1500
    }
});

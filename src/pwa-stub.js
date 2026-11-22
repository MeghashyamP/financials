// Stand-in for 'virtual:pwa-register' in the single-file build (and in tests), where there is no service worker.
export const registerSW = () => async () => {};

// virtual:pwa-register without the PWA plugin: the demo has no service worker.
export function registerSW() {
  return () => Promise.resolve();
}

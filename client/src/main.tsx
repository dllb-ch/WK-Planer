import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth';
import { I18nProvider } from './i18n';
import { ToastProvider } from './components/ui';
import { App } from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { BASE, DEMO } from './lib/base';
import { currentT } from './lib/lang';

// A new version is installed in the background and the page reloads into it; open tabs check every 10 minutes.
// (The browser demo has no service worker.)
if (!DEMO)
  registerSW({
    immediate: true,
    onRegisteredSW: (_url, reg) => reg && setInterval(() => navigator.onLine && reg.update(), 10 * 60_000),
  });

const qc = new QueryClient({
  defaultOptions: {
    // Queries also run offline so the service worker can answer them from its cache;
    // mutations fail right away instead of waiting for the connection.
    queries: { retry: 1, refetchOnWindowFocus: true, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'always' },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root')!);
const render = (extra?: React.ReactNode) =>
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <AuthProvider>
            <I18nProvider>
              <BrowserRouter basename={BASE || '/'}>
                <App />
              </BrowserRouter>
            </I18nProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
      {extra}
    </React.StrictMode>,
  );

if (DEMO) {
  // The server runs in this page; it has to be ready before the app asks it anything.
  root.render(<p className="p-8 text-slate-500">{currentT('demo.preparing')}</p>);
  import('./demo/entry')
    .then(async ({ startDemo, DemoBanner }) => {
      await startDemo();
      render(<DemoBanner />);
    })
    .catch((e) => {
      console.error(e);
      root.render(<p className="p-8 text-red-700">{currentT('demo.failed', { error: String(e?.message ?? e) })}</p>);
    });
} else render();

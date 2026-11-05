import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth';
import { ToastProvider } from './components/ui';
import { App } from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// A new version is installed in the background and the page reloads into it; open tabs check every 10 minutes.
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

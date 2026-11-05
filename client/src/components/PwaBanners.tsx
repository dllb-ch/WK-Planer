import { useEffect, useState } from 'react';
import { useT } from '../i18n';

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa-install-dismissed';
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
// iPadOS reports itself as a Mac with touch support.
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Offline notice and the hint to install the app on Android (prompt) and iOS (Home screen). */
export function PwaBanners() {
  const online = useOnline();
  const { t, tn } = useT();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const showIosHint = !dismissed && !prompt && isIos() && !isStandalone();
  return (
    <>
      {!online && (
        <div role="status" className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">
          {t('pwa.offline')}
        </div>
      )}
      {!dismissed && prompt && (
        <div className="no-print flex items-center gap-3 bg-blue-50 px-4 py-2 text-sm text-zs-blue">
          <span className="flex-1">{t('pwa.install')}</span>
          <button
            className="rounded-md bg-zs-blue px-3 py-1 text-white"
            onClick={async () => {
              await prompt.prompt();
              setPrompt(null);
            }}
          >
            {t('pwa.installButton')}
          </button>
          <button className="text-slate-500" onClick={dismiss} aria-label={t('pwa.dismiss')}>
            ✕
          </button>
        </div>
      )}
      {showIosHint && (
        <div className="no-print flex items-start gap-3 bg-blue-50 px-4 py-2 text-sm text-zs-blue">
          <span className="flex-1">
            {tn('pwa.ios', { share: <b>{t('pwa.iosShare')}</b>, home: <b>{t('pwa.iosHome')}</b> })}
          </span>
          <button className="text-slate-500" onClick={dismiss} aria-label={t('pwa.dismiss')}>
            ✕
          </button>
        </div>
      )}
    </>
  );
}

// Note in the corner of the browser demo: where the data lives, and how to start over.
import { useState } from 'react';
import { resetDemo } from './start';
import { useT } from '../i18n';

export function DemoBanner() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="no-print fixed bottom-3 left-3 z-[70] max-w-[calc(100vw-1.5rem)] text-[13px]">
      {open ? (
        <div className="material-menu anim-pop w-72 rounded-xl p-3 text-slate-700">
          <p className="font-semibold text-slate-900">{t('demo.title')}</p>
          <p className="mt-1">
            {t('demo.text')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="rounded-full bg-zs-blue px-3 py-1 font-semibold text-white" onClick={() => confirm(t('demo.confirmReset')) && resetDemo()}>
              {t('demo.reset')}
            </button>
            <a className="rounded-full px-3 py-1 text-zs-blue hover:bg-slate-500/10" href="https://github.com/dllb-ch/WK-Planer" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <button className="ml-auto rounded-full px-2 py-1 text-slate-500 hover:bg-slate-500/10" onClick={() => setOpen(false)} aria-label={t('common.close')}>
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button className="material-menu rounded-full px-3 py-1.5 font-medium text-slate-700" onClick={() => setOpen(true)}>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-orange-500 align-middle" aria-hidden />
          {t('demo.badge')}
        </button>
      )}
    </div>
  );
}

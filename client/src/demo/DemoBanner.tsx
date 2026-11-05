// Note in the corner of the browser demo: where the data lives, and how to start over.
import { useState } from 'react';
import { resetDemo } from './start';

export function DemoBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="no-print fixed bottom-3 left-3 z-[70] max-w-[calc(100vw-1.5rem)] text-[13px]">
      {open ? (
        <div className="material-menu anim-pop w-72 rounded-xl p-3 text-slate-700">
          <p className="font-semibold text-slate-900">Demo-Version</p>
          <p className="mt-1">
            Alles läuft in diesem Browser – ohne Server. Änderungen bleiben auf diesem Gerät und sind für niemanden sonst sichtbar.
            Oben rechts lässt sich die Rolle wechseln.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="rounded-full bg-zs-blue px-3 py-1 font-semibold text-white" onClick={() => confirm('Alle Änderungen verwerfen und mit den Demo-Daten neu beginnen?') && resetDemo()}>
              Demo zurücksetzen
            </button>
            <a className="rounded-full px-3 py-1 text-zs-blue hover:bg-slate-500/10" href="https://github.com/dllb-ch/WK-Planer" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <button className="ml-auto rounded-full px-2 py-1 text-slate-500 hover:bg-slate-500/10" onClick={() => setOpen(false)} aria-label="Schliessen">
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button className="material-menu rounded-full px-3 py-1.5 font-medium text-slate-700" onClick={() => setOpen(true)}>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-orange-500 align-middle" aria-hidden />
          Demo
        </button>
      )}
    </div>
  );
}

// First-time setup of an empty installation: Bataillon, Kompanien and Züge, accounts, resources and the map in one
// go – or the demo data. Shown instead of the login while there is no account (server: routes/setup.ts).
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MapView, ResourceKind } from '@shared/types';
import { RESOURCE_KIND_LABEL } from '@shared/types';
import { api, type SetupData, type SetupPerson } from '../api';
import { errMsg } from '../components/ui';
import { AddRow, CellInput, Group, IconButton, Row, StackRow } from '../components/grouped';
import { SwissMap } from '../components/SwissMap';

type Kp = SetupData['kompanien'][number];
type Zug = Kp['zuege'][number];
type Resource = SetupData['resources'][number];

const STEPS = ['Start', 'Bataillon', 'Kompanien & Züge', 'Personen', 'Ressourcen', 'Karte', 'Zusammenfassung'] as const;
const emptyBestand = () => ({ zfhr: 1, kader: 0, sdt: 0 });
const newZug = (n: number): Zug => ({ name: `Zug ${n}`, soll: emptyBestand(), zfhr: null });
const newKp = (): Kp => ({ name: '', kdt: null, zuege: [newZug(1), newZug(2)] });
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const personOk = (p: SetupPerson | null) => !p || (p.name.trim() && validEmail(p.email));

export function SetupWizard({ tokenRequired }: { tokenRequired: boolean }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bat, setBat] = useState<SetupData['bataillon']>({
    name: '',
    regionName: '',
    briefkopf: { amt: '', abteilung: 'Zivilschutz', adresse: '', telefon: '', web: '' },
    logo: null,
    kantonLogo: null,
    mapView: null,
  });
  const [admin, setAdmin] = useState({ name: '', email: '', funktion: 'Bat Kdt', password: '', repeat: '' });
  const [startPassword, setStartPassword] = useState('');
  const [kps, setKps] = useState<Kp[]>([newKp()]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [shownView, setShownView] = useState<MapView | null>(null);

  const others = kps.flatMap((k) => [k.kdt, ...k.zuege.map((z) => z.zfhr)]).filter(Boolean) as SetupPerson[];
  const emails = [admin.email, ...others.map((p) => p.email)].map((e) => e.trim().toLowerCase()).filter(Boolean);
  const duplicate = emails.find((e, i) => emails.indexOf(e) !== i);
  const valid: boolean[] = [
    !tokenRequired || !!token.trim(),
    !!bat.name.trim(),
    kps.length > 0 && kps.every((k) => k.name.trim() && k.zuege.every((z) => z.name.trim())),
    !!admin.name.trim() &&
      validEmail(admin.email) &&
      admin.password.length >= 8 &&
      admin.password === admin.repeat &&
      kps.every((k) => personOk(k.kdt) && k.zuege.every((z) => personOk(z.zfhr))) &&
      (others.length === 0 || startPassword.length >= 8) &&
      !duplicate,
    resources.every((r) => r.name.trim()),
    true,
    true,
  ];

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['setup'] });
    await qc.invalidateQueries({ queryKey: ['me'] });
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await done();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = () =>
    run(() =>
      api.setup({
        token: token.trim() || undefined,
        bataillon: bat,
        admin: { name: admin.name.trim(), email: admin.email.trim(), funktion: admin.funktion.trim(), password: admin.password },
        startPassword: others.length ? startPassword : undefined,
        kompanien: kps,
        resources,
      }),
    );

  const setKp = (i: number, patch: Partial<Kp>) => setKps(kps.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const setZug = (i: number, zi: number, patch: Partial<Zug>) => setKp(i, { zuege: kps[i].zuege.map((z, j) => (j === zi ? { ...z, ...patch } : z)) });
  const setRes = (i: number, patch: Partial<Resource>) => setResources(resources.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const pickLogo = (key: 'logo' | 'kantonLogo', file: File | undefined) => {
    if (!file) return;
    if (file.size > 500_000) return setError('Logo zu gross (max. 500 KB)');
    const r = new FileReader();
    r.onload = () => setBat((b) => ({ ...b, [key]: String(r.result) }));
    r.readAsDataURL(file);
  };

  return (
    <div className="min-h-full overflow-y-auto bg-slate-100">
      <div className="mx-auto max-w-[760px] px-4 pb-24 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header className="mb-5 flex items-center gap-3 px-1">
          <svg viewBox="0 0 32 32" className="h-10 w-10" aria-hidden>
            <circle cx="16" cy="16" r="15" fill="#f97316" />
            <path d="M16 6 L26 24 H6 Z" fill="#1e3a8a" />
          </svg>
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">WK-Planer einrichten</h1>
            <p className="text-[15px] text-slate-500">
              Schritt {step + 1} von {STEPS.length}: {STEPS[step]}
            </p>
          </div>
        </header>
        <div className="mb-6 flex gap-1 px-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-zs-blue' : 'bg-slate-300/70'}`} />
          ))}
        </div>

        {step === 0 && (
          <>
            <p className="mx-1 mb-5 text-[15px] text-slate-600">
              Diese Installation ist noch leer. Richten Sie Ihre Organisation ein – Bataillon, Kompanien, Züge, Konten und Ressourcen. Alles lässt sich
              später unter «Organisation» ändern und ergänzen.
            </p>
            {tokenRequired && (
              <Group title="Einrichtungs-Code" foot="Steht in der Server-Konfiguration (SETUP_TOKEN).">
                <Row label="Code">
                  <CellInput value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
                </Row>
              </Group>
            )}
            <div className="space-y-3">
              <BigButton disabled={!valid[0]} onClick={() => setStep(1)}>
                Eigene Organisation einrichten
              </BigButton>
              <BigButton secondary disabled={!valid[0] || busy} onClick={() => run(() => api.setupDemo(token.trim() || undefined))}>
                Mit Demo-Daten ausprobieren
              </BigButton>
              <p className="mx-1 text-[13px] text-slate-500">Die Demo legt ein Beispiel-Bataillon mit Demo-Konten an (Passwort «zivilschutz»).</p>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Group title="Bataillon">
              <Row label="Name">
                <CellInput value={bat.name} autoFocus placeholder="z. B. ZS Bat Musterregion" onChange={(e) => setBat({ ...bat, name: e.target.value })} />
              </Row>
              <Row label="Region">
                <CellInput value={bat.regionName} placeholder="z. B. Zivilschutzorganisation Region Musterland" onChange={(e) => setBat({ ...bat, regionName: e.target.value })} />
              </Row>
            </Group>
            <Group title="Briefkopf der Dokumente" foot="Erscheint auf Dossier, Arbeitsprogramm, Tagesbefehl und allen anderen Ausdrucken.">
              {(
                [
                  ['amt', 'Zeile 1 (fett)', 'Amt für Bevölkerungsschutz'],
                  ['abteilung', 'Zeile 2', 'Zivilschutz'],
                  ['adresse', 'Adresse', 'Musterstrasse 1, 1234 Musterhausen'],
                  ['telefon', 'Telefon', 'T +41 00 000 00 00'],
                  ['web', 'Web', 'zivilschutz.example.ch'],
                ] as const
              ).map(([k, label, ph]) => (
                <Row key={k} label={label}>
                  <CellInput value={bat.briefkopf[k]} placeholder={ph} onChange={(e) => setBat({ ...bat, briefkopf: { ...bat.briefkopf, [k]: e.target.value } })} />
                </Row>
              ))}
            </Group>
            <Group title="Logos" foot="PNG, JPEG, SVG oder WebP, höchstens 500 KB. Optional.">
              <LogoRow label="Kanton (Kopfzeile)" value={bat.kantonLogo} onPick={(f) => pickLogo('kantonLogo', f)} onClear={() => setBat({ ...bat, kantonLogo: null })} />
              <LogoRow label="Region (Deckblatt)" value={bat.logo} onPick={(f) => pickLogo('logo', f)} onClear={() => setBat({ ...bat, logo: null })} />
            </Group>
          </>
        )}

        {step === 2 && (
          <>
            {kps.map((k, i) => (
              <Group
                key={i}
                title={`Kompanie ${i + 1}`}
                aside={
                  kps.length > 1 && (
                    <button className="text-zs-blue" onClick={() => setKps(kps.filter((_, j) => j !== i))}>
                      Entfernen
                    </button>
                  )
                }
                foot="Sollbestand pro Zug: Zugführer · Kader · Soldaten (später auch pro Gruppe)."
              >
                <Row label="Name">
                  <CellInput value={k.name} placeholder="z. B. Pi Kp" onChange={(e) => setKp(i, { name: e.target.value })} />
                </Row>
                {k.zuege.map((z, zi) => (
                  <div key={zi} className="flex min-h-[44px] flex-wrap items-center gap-2 py-1.5 pl-4 pr-2.5">
                    <CellInput className="!w-auto min-w-[8rem] !py-1" value={z.name} placeholder="Zug" aria-label="Name des Zuges" onChange={(e) => setZug(i, zi, { name: e.target.value })} />
                    <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                      {(['zfhr', 'kader', 'sdt'] as const).map((r) => (
                        <label key={r} className="flex items-center gap-1">
                          {r === 'zfhr' ? 'Zfhr' : r === 'kader' ? 'Kader' : 'Sdt'}
                          <input
                            type="number"
                            min={0}
                            max={999}
                            className="input w-14 !px-1 text-center tabular-nums"
                            value={z.soll[r]}
                            onChange={(e) => setZug(i, zi, { soll: { ...z.soll, [r]: Math.max(0, Math.min(999, Math.round(Number(e.target.value) || 0))) } })}
                          />
                        </label>
                      ))}
                    </span>
                    <IconButton label="Zug entfernen" destructive disabled={k.zuege.length <= 1} onClick={() => setKp(i, { zuege: k.zuege.filter((_, j) => j !== zi) })}>
                      ✕
                    </IconButton>
                  </div>
                ))}
                <AddRow onClick={() => setKp(i, { zuege: [...k.zuege, newZug(k.zuege.length + 1)] })}>Zug hinzufügen</AddRow>
              </Group>
            ))}
            <BigButton secondary onClick={() => setKps((ks) => [...ks, newKp()])}>
              + Kompanie
            </BigButton>
          </>
        )}

        {step === 3 && (
          <>
            <Group title="Bat Kommando – Ihr Konto" foot="Mit diesem Konto sind Sie nach der Einrichtung angemeldet.">
              <Row label="Grad, Name">
                <CellInput value={admin.name} placeholder="z. B. Maj Muster" onChange={(e) => setAdmin({ ...admin, name: e.target.value })} />
              </Row>
              <Row label="Funktion">
                <CellInput value={admin.funktion} onChange={(e) => setAdmin({ ...admin, funktion: e.target.value })} />
              </Row>
              <Row label="E-Mail">
                <CellInput type="email" autoComplete="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
              </Row>
              <Row label="Passwort">
                <CellInput type="password" autoComplete="new-password" placeholder="mindestens 8 Zeichen" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} />
              </Row>
              <Row label="Wiederholen">
                <CellInput type="password" autoComplete="new-password" value={admin.repeat} onChange={(e) => setAdmin({ ...admin, repeat: e.target.value })} />
              </Row>
            </Group>
            {admin.repeat && admin.repeat !== admin.password && <Note>Die Passwörter stimmen nicht überein.</Note>}

            <p className="mx-1 mb-4 text-[15px] text-slate-600">
              Optional: Kp Kdt und Zugführer gleich mit Konto erfassen. Weitere Personen (Kader, Log Of …) folgen später unter
              «Organisation › Kompanien & Personal».
            </p>
            {kps.map((k, i) => (
              <Group key={i} title={k.name || `Kompanie ${i + 1}`}>
                <PersonRow label="Kp Kdt" value={k.kdt} onChange={(kdt) => setKp(i, { kdt })} />
                {k.zuege.map((z, zi) => (
                  <PersonRow key={zi} label={`Zfhr ${z.name}`} value={z.zfhr} onChange={(zfhr) => setZug(i, zi, { zfhr })} />
                ))}
              </Group>
            ))}
            {others.length > 0 && (
              <Group title="Startpasswort der weiteren Konten" foot="Teilen Sie es den Personen mit; sie ändern es unter «Mein Konto».">
                <Row label="Passwort">
                  <CellInput type="text" autoComplete="off" placeholder="mindestens 8 Zeichen" value={startPassword} onChange={(e) => setStartPassword(e.target.value)} />
                </Row>
              </Group>
            )}
            {duplicate && <Note>Die E-Mail-Adresse {duplicate} kommt mehrfach vor.</Note>}
          </>
        )}

        {step === 4 && (
          <>
            <p className="mx-1 mb-4 text-[15px] text-slate-600">
              Fahrzeuge, Anhänger, Räume und Gelände, die die Züge anfragen können – pro Kompanie oder für das ganze Bataillon. Geländeflächen auf der Karte
              und weitere Angaben folgen unter «Organisation › Vorlagen & Ressourcen».
            </p>
            {resources.length > 0 && (
              <Group title={`Ressourcen (${resources.length})`}>
                {resources.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 py-2 pl-4 pr-2.5">
                    <span className="w-24 shrink-0 text-[13px] text-slate-500">{RESOURCE_KIND_LABEL[r.kind]}</span>
                    <CellInput className="!w-auto min-w-[9rem] flex-1 !py-1" value={r.name} placeholder="Name" aria-label="Name" onChange={(e) => setRes(i, { name: e.target.value })} />
                    <CellInput
                      className="!w-32 !py-1"
                      value={r.category}
                      placeholder={r.kind === 'FAHRZEUG' ? 'Typ, z. B. Bus' : 'Kategorie'}
                      aria-label="Typ"
                      onChange={(e) => setRes(i, { category: e.target.value })}
                    />
                    {r.kind === 'FAHRZEUG' && (
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        Plätze
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="input w-14 !px-1 text-center"
                          value={r.seats}
                          onChange={(e) => setRes(i, { seats: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })}
                        />
                      </label>
                    )}
                    <select
                      className="input !w-auto !py-1 text-sm"
                      aria-label="Gehört zu"
                      value={r.kp ?? ''}
                      onChange={(e) => setRes(i, { kp: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      <option value="">Bataillon</option>
                      {kps.map((k, ki) => (
                        <option key={ki} value={ki}>
                          {k.name || `Kompanie ${ki + 1}`}
                        </option>
                      ))}
                    </select>
                    <IconButton label="Entfernen" destructive onClick={() => setResources(resources.filter((_, j) => j !== i))}>
                      ✕
                    </IconButton>
                  </div>
                ))}
              </Group>
            )}
            <div className="flex flex-wrap gap-2">
              {(['FAHRZEUG', 'ANHAENGER', 'RAUM', 'GELAENDE'] as ResourceKind[]).map((kind) => (
                <button
                  key={kind}
                  className="rounded-full bg-white px-4 py-2 text-[15px] text-zs-blue active:opacity-60"
                  onClick={() => setResources((rs) => [...rs, { kp: kps.length === 1 ? 0 : null, kind, name: '', category: '', seats: kind === 'FAHRZEUG' ? 9 : 0, capacity: '' }])}
                >
                  + {RESOURCE_KIND_LABEL[kind]}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 5 && (
          <Group title="Standard-Kartenausschnitt" foot="Hier öffnen sich alle Karten (Gelände, Ressourcen, Erkundungen, Übungen). Optional – ohne Auswahl die ganze Schweiz.">
            <div className="space-y-2 p-3">
              <SwissMap view={bat.mapView} onViewChange={setShownView} height={320} />
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <button className="rounded-full bg-zs-blue/10 px-3 py-1 font-medium text-zs-blue disabled:opacity-40" disabled={!shownView} onClick={() => setBat({ ...bat, mapView: shownView })}>
                  Aktuellen Ausschnitt übernehmen
                </button>
                {bat.mapView && (
                  <button className="rounded-full px-3 py-1 text-zs-blue" onClick={() => setBat({ ...bat, mapView: null })}>
                    Zurücksetzen
                  </button>
                )}
                <span className="text-slate-500">{bat.mapView ? `Gewählt: Zoom ${bat.mapView.zoom}` : 'Kein Ausschnitt gewählt'}</span>
              </div>
            </div>
          </Group>
        )}

        {step === 6 && (
          <Group title="Bereit zum Einrichten">
            <Summary label="Bataillon" value={bat.name} />
            <Summary label="Kompanien" value={kps.map((k) => `${k.name} (${k.zuege.length} Züge)`).join(', ')} />
            <Summary label="Konten" value={`${1 + others.length} (Bat Kommando${others.length ? ` + ${others.length} weitere` : ''})`} />
            <Summary label="Ressourcen" value={resources.length ? `${resources.length}` : 'keine'} />
            <Summary label="Briefkopf" value={[bat.briefkopf.amt, bat.briefkopf.adresse].filter(Boolean).join(' · ') || '–'} />
            <Summary label="Karte" value={bat.mapView ? 'eigener Ausschnitt' : 'ganze Schweiz'} />
          </Group>
        )}

        {error && <Note>{error}</Note>}

        {step > 0 && (
          <div className="mt-6 flex items-center gap-3">
            <button className="rounded-full px-4 py-2.5 text-[17px] text-zs-blue active:opacity-60" onClick={() => setStep(step - 1)}>
              Zurück
            </button>
            <span className="flex-1" />
            {step < STEPS.length - 1 ? (
              <button className="rounded-full bg-zs-blue px-6 py-2.5 text-[17px] font-semibold text-white active:opacity-60 disabled:opacity-40" disabled={!valid[step]} onClick={() => setStep(step + 1)}>
                Weiter
              </button>
            ) : (
              <button
                className="rounded-full bg-zs-blue px-6 py-2.5 text-[17px] font-semibold text-white active:opacity-60 disabled:opacity-40"
                disabled={busy || !valid.every(Boolean)}
                onClick={submit}
              >
                {busy ? 'Wird eingerichtet …' : 'Einrichten'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BigButton({ children, secondary, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={`w-full rounded-xl py-3.5 text-[17px] font-semibold transition active:opacity-60 disabled:opacity-40 ${secondary ? 'bg-white text-zs-blue' : 'bg-zs-blue text-white'}`}
    >
      {children}
    </button>
  );
}

const Note = ({ children }: { children: ReactNode }) => <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-[15px] text-red-800">{children}</p>;

const Summary = ({ label, value }: { label: string; value: string }) => (
  <Row label={label}>
    <span className="py-[11px] text-slate-700">{value}</span>
  </Row>
);

/** Name and e-mail of an optional account; empty = no account. */
function PersonRow({ label, value, onChange }: { label: string; value: SetupPerson | null; onChange: (p: SetupPerson | null) => void }) {
  const p = value ?? { name: '', email: '' };
  const set = (patch: Partial<SetupPerson>) => {
    const next = { ...p, ...patch };
    onChange(next.name.trim() || next.email.trim() ? next : null);
  };
  const incomplete = !!value && !personOk(value);
  return (
    <StackRow label={<span className={incomplete ? 'text-red-600' : ''}>{label}{incomplete ? ' – Name und gültige E-Mail' : ''}</span>}>
      <div className="flex flex-wrap gap-x-3">
        <CellInput className="!w-auto min-w-[9rem] flex-1 !py-1" placeholder="Grad, Name" value={p.name} onChange={(e) => set({ name: e.target.value })} />
        <CellInput className="!w-auto min-w-[12rem] flex-1 !py-1" type="email" placeholder="E-Mail" value={p.email} onChange={(e) => set({ email: e.target.value })} />
      </div>
    </StackRow>
  );
}

function LogoRow({ label, value, onPick, onClear }: { label: string; value: string | null; onPick: (f: File | undefined) => void; onClear: () => void }) {
  return (
    <Row label={label}>
      {value ? <img src={value} alt="" className="max-h-10 max-w-[140px] rounded bg-white" /> : <span className="py-[11px] text-slate-400">Kein Logo</span>}
      <span className="flex-1" />
      <label className="cursor-pointer rounded-full bg-zs-blue/10 px-3 py-1 text-[13px] font-medium text-zs-blue">
        Bild wählen
        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
      </label>
      {value && (
        <button className="text-[13px] text-zs-blue" onClick={onClear}>
          Entfernen
        </button>
      )}
    </Row>
  );
}

// First-time setup of an empty installation: Bataillon, Kompanien and Züge, accounts, resources and the map in one
// go – or the demo data. Shown instead of the login while there is no account (server: routes/setup.ts).
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MapView, ResourceKind } from '@shared/types';
import { currentT } from '../lib/lang';
import { api, type SetupData, type SetupPerson } from '../api';
import { errMsg } from '../components/ui';
import { AddRow, CellInput, Group, IconButton, Row, StackRow } from '../components/grouped';
import { SwissMap } from '../components/SwissMap';
import { useT } from '../i18n';

type Kp = SetupData['kompanien'][number];
type Zug = Kp['zuege'][number];
type Resource = SetupData['resources'][number];

const STEPS = [0, 1, 2, 3, 4, 5, 6] as const;
const emptyBestand = () => ({ zfhr: 1, kader: 0, sdt: 0 });
const newZug = (n: number): Zug => ({ name: currentT('setup.zugN', { n }), soll: emptyBestand(), zfhr: null });
const newKp = (): Kp => ({ name: '', kdt: null, zuege: [newZug(1), newZug(2)] });
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const personOk = (p: SetupPerson | null) => !p || (p.name.trim() && validEmail(p.email));

export function SetupWizard({ tokenRequired }: { tokenRequired: boolean }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bat, setBat] = useState<SetupData['bataillon']>({
    name: '',
    regionName: '',
    briefkopf: { amt: '', abteilung: t('bat.line2Ph'), adresse: '', telefon: '', web: '' },
    logo: null,
    kantonLogo: null,
    mapView: null,
  });
  const [admin, setAdmin] = useState({ name: '', email: '', funktion: t('setup.batKdt'), password: '', repeat: '' });
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
    if (file.size > 500_000) return setError(t('bat.logoTooLarge'));
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
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">{t('setup.title')}</h1>
            <p className="text-[15px] text-slate-500">
              {t('setup.stepOf', { n: step + 1, total: STEPS.length, name: t(`setup.step.${STEPS[step]}`) })}
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
              {t('setup.intro')}
            </p>
            {tokenRequired && (
              <Group title={t('setup.code')} foot={t('setup.codeFoot')}>
                <Row label={t('setup.codeLabel')}>
                  <CellInput value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
                </Row>
              </Group>
            )}
            <div className="space-y-3">
              <BigButton disabled={!valid[0]} onClick={() => setStep(1)}>
                {t('setup.own')}
              </BigButton>
              <BigButton secondary disabled={!valid[0] || busy} onClick={() => run(() => api.setupDemo(token.trim() || undefined))}>
                {t('setup.demo')}
              </BigButton>
              <p className="mx-1 text-[13px] text-slate-500">{t('setup.demoHint')}</p>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Group title={t('setup.step.1')}>
              <Row label={t('profile.name')}>
                <CellInput value={bat.name} autoFocus placeholder={t('setup.batPh')} onChange={(e) => setBat({ ...bat, name: e.target.value })} />
              </Row>
              <Row label={t('setup.region')}>
                <CellInput value={bat.regionName} placeholder={t('bat.regionPh')} onChange={(e) => setBat({ ...bat, regionName: e.target.value })} />
              </Row>
            </Group>
            <Group title={t('setup.letterhead')} foot={t('setup.letterheadFoot')}>
              {(
                [
                  ['amt', t('setup.line1'), t('setup.line1Ph')],
                  ['abteilung', t('setup.line2'), t('bat.line2Ph')],
                  ['adresse', t('setup.address'), t('bat.addressPh')],
                  ['telefon', t('bat.phone'), t('setup.phonePh')],
                  ['web', t('bat.web'), 'zivilschutz.example.ch'],
                ] as const
              ).map(([k, label, ph]) => (
                <Row key={k} label={label}>
                  <CellInput value={bat.briefkopf[k]} placeholder={ph} onChange={(e) => setBat({ ...bat, briefkopf: { ...bat.briefkopf, [k]: e.target.value } })} />
                </Row>
              ))}
            </Group>
            <Group title={t('setup.logos')} foot={t('setup.logosFoot')}>
              <LogoRow label={t('setup.kantonLogo')} value={bat.kantonLogo} onPick={(f) => pickLogo('kantonLogo', f)} onClear={() => setBat({ ...bat, kantonLogo: null })} />
              <LogoRow label={t('setup.regionLogo')} value={bat.logo} onPick={(f) => pickLogo('logo', f)} onClear={() => setBat({ ...bat, logo: null })} />
            </Group>
          </>
        )}

        {step === 2 && (
          <>
            {kps.map((k, i) => (
              <Group
                key={i}
                title={t('setup.kpN', { n: i + 1 })}
                aside={
                  kps.length > 1 && (
                    <button className="text-zs-blue" onClick={() => setKps(kps.filter((_, j) => j !== i))}>
                      {t('common.remove')}
                    </button>
                  )
                }
                foot={t('setup.sollFoot')}
              >
                <Row label={t('profile.name')}>
                  <CellInput value={k.name} placeholder={t('setup.kpPh')} onChange={(e) => setKp(i, { name: e.target.value })} />
                </Row>
                {k.zuege.map((z, zi) => (
                  <div key={zi} className="flex min-h-[44px] flex-wrap items-center gap-2 py-1.5 pl-4 pr-2.5">
                    <CellInput className="!w-auto min-w-[8rem] !py-1" value={z.name} placeholder={t('setup.zugPh')} aria-label={t('setup.zugName')} onChange={(e) => setZug(i, zi, { name: e.target.value })} />
                    <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                      {(['zfhr', 'kader', 'sdt'] as const).map((r) => (
                        <label key={r} className="flex items-center gap-1">
                          {r === 'zfhr' ? t('setup.zfhrShort') : r === 'kader' ? t('setup.kaderShort') : t('setup.sdtShort')}
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
                    <IconButton label={t('setup.removeZug')} destructive disabled={k.zuege.length <= 1} onClick={() => setKp(i, { zuege: k.zuege.filter((_, j) => j !== zi) })}>
                      ✕
                    </IconButton>
                  </div>
                ))}
                <AddRow onClick={() => setKp(i, { zuege: [...k.zuege, newZug(k.zuege.length + 1)] })}>{t('setup.addZug')}</AddRow>
              </Group>
            ))}
            <BigButton secondary onClick={() => setKps((ks) => [...ks, newKp()])}>
              {t('setup.addKp')}
            </BigButton>
          </>
        )}

        {step === 3 && (
          <>
            <Group title={t('setup.account')} foot={t('setup.accountFoot')}>
              <Row label={t('setup.rankName')}>
                <CellInput value={admin.name} placeholder={t('setup.rankNamePh')} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} />
              </Row>
              <Row label={t('admin.funktion')}>
                <CellInput value={admin.funktion} onChange={(e) => setAdmin({ ...admin, funktion: e.target.value })} />
              </Row>
              <Row label={t('login.email')}>
                <CellInput type="email" autoComplete="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
              </Row>
              <Row label={t('login.password')}>
                <CellInput type="password" autoComplete="new-password" placeholder={t('setup.min8')} value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} />
              </Row>
              <Row label={t('setup.repeat')}>
                <CellInput type="password" autoComplete="new-password" value={admin.repeat} onChange={(e) => setAdmin({ ...admin, repeat: e.target.value })} />
              </Row>
            </Group>
            {admin.repeat && admin.repeat !== admin.password && <Note>{t('setup.mismatch')}</Note>}

            <p className="mx-1 mb-4 text-[15px] text-slate-600">
              {t('setup.peopleIntro')}
            </p>
            {kps.map((k, i) => (
              <Group key={i} title={k.name || t('setup.kpN', { n: i + 1 })}>
                <PersonRow label={t('role.KPKDT')} value={k.kdt} onChange={(kdt) => setKp(i, { kdt })} />
                {k.zuege.map((z, zi) => (
                  <PersonRow key={zi} label={t('setup.zfhrOf', { zug: z.name })} value={z.zfhr} onChange={(zfhr) => setZug(i, zi, { zfhr })} />
                ))}
              </Group>
            ))}
            {others.length > 0 && (
              <Group title={t('setup.startPassword')} foot={t('setup.startPasswordFoot')}>
                <Row label={t('login.password')}>
                  <CellInput type="text" autoComplete="off" placeholder={t('setup.min8')} value={startPassword} onChange={(e) => setStartPassword(e.target.value)} />
                </Row>
              </Group>
            )}
            {duplicate && <Note>Die E-Mail-Adresse {duplicate} kommt mehrfach vor.</Note>}
          </>
        )}

        {step === 4 && (
          <>
            <p className="mx-1 mb-4 text-[15px] text-slate-600">
              {t('setup.resIntro')}
            </p>
            {resources.length > 0 && (
              <Group title={`Ressourcen (${resources.length})`}>
                {resources.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 py-2 pl-4 pr-2.5">
                    <span className="w-24 shrink-0 text-[13px] text-slate-500">{t(`resource.${r.kind}`)}</span>
                    <CellInput className="!w-auto min-w-[9rem] flex-1 !py-1" value={r.name} placeholder={t('profile.name')} aria-label={t('profile.name')} onChange={(e) => setRes(i, { name: e.target.value })} />
                    <CellInput
                      className="!w-32 !py-1"
                      value={r.category}
                      placeholder={r.kind === 'FAHRZEUG' ? t('setup.typePh') : t('setup.category')}
                      aria-label={t('setup.type')}
                      onChange={(e) => setRes(i, { category: e.target.value })}
                    />
                    {r.kind === 'FAHRZEUG' && (
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        {t('setup.seats')}
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
                      aria-label={t('setup.belongsTo')}
                      value={r.kp ?? ''}
                      onChange={(e) => setRes(i, { kp: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      <option value="">{t('setup.step.1')}</option>
                      {kps.map((k, ki) => (
                        <option key={ki} value={ki}>
                          {k.name || t('setup.kpN', { n: ki + 1 })}
                        </option>
                      ))}
                    </select>
                    <IconButton label={t('common.remove')} destructive onClick={() => setResources(resources.filter((_, j) => j !== i))}>
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
                  + {t(`resource.${kind}`)}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 5 && (
          <Group title={t('bat.mapView')} foot={t('setup.mapFoot')}>
            <div className="space-y-2 p-3">
              <SwissMap view={bat.mapView} onViewChange={setShownView} height={320} />
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <button className="rounded-full bg-zs-blue/10 px-3 py-1 font-medium text-zs-blue disabled:opacity-40" disabled={!shownView} onClick={() => setBat({ ...bat, mapView: shownView })}>
                  {t('bat.takeView')}
                </button>
                {bat.mapView && (
                  <button className="rounded-full px-3 py-1 text-zs-blue" onClick={() => setBat({ ...bat, mapView: null })}>
                    {t('setup.reset')}
                  </button>
                )}
                <span className="text-slate-500">{bat.mapView ? t('setup.chosenZoom', { zoom: bat.mapView.zoom }) : t('setup.noView')}</span>
              </div>
            </div>
          </Group>
        )}

        {step === 6 && (
          <Group title={t('setup.ready')}>
            <Summary label={t('setup.step.1')} value={bat.name} />
            <Summary label={t('setup.kompanien')} value={kps.map((k) => t('setup.kpSummary', { name: k.name, n: k.zuege.length })).join(', ')} />
            <Summary label={t('setup.accounts')} value={others.length ? t('setup.accountsSummaryMore', { n: 1 + others.length, more: others.length }) : t('setup.accountsSummary', { n: 1 })} />
            <Summary label={t('setup.step.4')} value={resources.length ? `${resources.length}` : t('common.none')} />
            <Summary label={t('setup.letterheadShort')} value={[bat.briefkopf.amt, bat.briefkopf.adresse].filter(Boolean).join(' · ') || '–'} />
            <Summary label={t('setup.step.5')} value={bat.mapView ? t('setup.ownView') : t('setup.wholeCh')} />
          </Group>
        )}

        {error && <Note>{error}</Note>}

        {step > 0 && (
          <div className="mt-6 flex items-center gap-3">
            <button className="rounded-full px-4 py-2.5 text-[17px] text-zs-blue active:opacity-60" onClick={() => setStep(step - 1)}>
              {t('common.back')}
            </button>
            <span className="flex-1" />
            {step < STEPS.length - 1 ? (
              <button className="rounded-full bg-zs-blue px-6 py-2.5 text-[17px] font-semibold text-white active:opacity-60 disabled:opacity-40" disabled={!valid[step]} onClick={() => setStep(step + 1)}>
                {t('common.next')}
              </button>
            ) : (
              <button
                className="rounded-full bg-zs-blue px-6 py-2.5 text-[17px] font-semibold text-white active:opacity-60 disabled:opacity-40"
                disabled={busy || !valid.every(Boolean)}
                onClick={submit}
              >
                {busy ? t('setup.busy') : t('setup.submit')}
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
  const { t } = useT();
  const p = value ?? { name: '', email: '' };
  const set = (patch: Partial<SetupPerson>) => {
    const next = { ...p, ...patch };
    onChange(next.name.trim() || next.email.trim() ? next : null);
  };
  const incomplete = !!value && !personOk(value);
  return (
    <StackRow label={<span className={incomplete ? 'text-red-600' : ''}>{label}{incomplete ? t('setup.incomplete') : ''}</span>}>
      <div className="flex flex-wrap gap-x-3">
        <CellInput className="!w-auto min-w-[9rem] flex-1 !py-1" placeholder={t('setup.rankName')} value={p.name} onChange={(e) => set({ name: e.target.value })} />
        <CellInput className="!w-auto min-w-[12rem] flex-1 !py-1" type="email" placeholder={t('login.email')} value={p.email} onChange={(e) => set({ email: e.target.value })} />
      </div>
    </StackRow>
  );
}

function LogoRow({ label, value, onPick, onClear }: { label: string; value: string | null; onPick: (f: File | undefined) => void; onClear: () => void }) {
  const { t } = useT();
  return (
    <Row label={label}>
      {value ? <img src={value} alt="" className="max-h-10 max-w-[140px] rounded bg-white" /> : <span className="py-[11px] text-slate-400">{t('bat.noLogo')}</span>}
      <span className="flex-1" />
      <label className="cursor-pointer rounded-full bg-zs-blue/10 px-3 py-1 text-[13px] font-medium text-zs-blue">
        {t('bat.pickImage')}
        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
      </label>
      {value && (
        <button className="text-[13px] text-zs-blue" onClick={onClear}>
          {t('common.remove')}
        </button>
      )}
    </Row>
  );
}

// Public check-in form behind the QR code of a day (no login).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CheckInInput, Diet, HealthPoint, HealthStatus, PublicCheckIn } from '@shared/types';
import { DIETS, HEALTH_POINT_KEYS } from '@shared/types';
import { LangSwitch } from '../components/LangSwitch';
import { fmtDate } from '@shared/util';
import { useT } from '../i18n';
import { api, ApiError } from '../api';
import { errMsg } from '../components/ui';

// The answers are kept on the phone, so the next days only need one tap.
const STORE = 'zs-checkin';
const load = (): Partial<CheckInInput> & { zugName?: string } => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}');
  } catch {
    return {};
  }
};

// Eintrittsbefragung answered on this phone (per WK and e-mail): not asked again. The server checks it as well.
const HEALTH_STORE = 'zs-checkin-health';
const healthKey = (wkId: number, f: Pick<CheckInInput, 'email' | 'vorname' | 'nachname'>) =>
  `${wkId}:${(f.email.trim() || `${f.vorname.trim()} ${f.nachname.trim()}`).toLowerCase()}`;
const healthDone = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(HEALTH_STORE) ?? '[]');
  } catch {
    return [];
  }
};
const rememberHealth = (key: string) => {
  try {
    localStorage.setItem(HEALTH_STORE, JSON.stringify([...healthDone().filter((k) => k !== key), key].slice(-20)));
  } catch {
    // Private mode: asked again next time, the server knows it anyway.
  }
};

/** The remembered answers without the extra Zug name. */
const remembered = (): Partial<CheckInInput> => {
  const { zugName: _zugName, ...x } = load();
  return x;
};

export function CheckInPage({ token }: { token: string }) {
  const { t, weekday } = useT();
  const [info, setInfo] = useState<PublicCheckIn | null>(null);
  const [error, setError] = useState('');
  const [f, setF] = useState<CheckInInput>({ vorname: '', nachname: '', email: '', zugId: null, diet: 'NORMAL', intolerances: '', ...remembered() });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ matched: boolean; health: HealthStatus | null; reported: boolean } | null>(null);
  // Eintrittsbefragung: «Etwas trifft zu» opens the points to tick.
  const [report, setReport] = useState<{ open: boolean; points: HealthPoint[]; note: string }>({ open: false, points: [], note: '' });
  // The server asked for the Eintrittsbefragung although this phone thought it was done.
  const [healthAsked, setHealthAsked] = useState(false);
  const [showIntol, setShowIntol] = useState(() => !!remembered().intolerances);
  // Known from an earlier check-in on this phone: one button instead of the whole form.
  const [quick, setQuick] = useState(() => {
    const x = load();
    return !!(x.vorname && x.nachname);
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState(false);
  const edit = () => {
    setDone(null);
    setQuick(false);
    setEditing(true);
  };

  useEffect(() => {
    api
      .publicCheckin(token)
      .then((i) => {
        setInfo(i);
        // The remembered Zug may belong to another WK: then pick it again.
        if (f.zugId !== null && !i.zuege.some((z) => z.id === f.zugId)) {
          setF((x) => ({ ...x, zugId: i.zuege.find((z) => z.name === load().zugName)?.id ?? null }));
        }
      }, (e) => setError(errMsg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const zug = info?.zuege.find((z) => z.id === f.zugId);
  const answered = !!info && healthDone().includes(healthKey(info.wkId, f));
  // «Angaben ändern» shows the questionnaire again, so an answer can be corrected or a report added later.
  const needHealth = !!info && (healthAsked || editing || !answered);

  const forget = () => {
    try {
      localStorage.removeItem(STORE);
    } catch {
      // ignore
    }
    setF({ vorname: '', nachname: '', email: '', zugId: null, diet: 'NORMAL', intolerances: '' });
    setQuick(false);
    setShowIntol(false);
  };

  /** Sends the check-in; with the Eintrittsbefragung `points` (empty = healthy) when it is due. */
  const send = async (points: HealthPoint[]) => {
    if (formRef.current && !formRef.current.reportValidity()) return;
    if (f.zugId === null) return setError(t('checkin.chooseZug'));
    setBusy(true);
    setError('');
    try {
      const res = await api.submitCheckin(token, needHealth ? { ...f, health: { points, note: points.length ? report.note : '' } } : f);
      rememberHealth(healthKey(info!.wkId, f));
      setHealthAsked(false);
      try {
        localStorage.setItem(STORE, JSON.stringify({ ...f, zugName: zug?.name }));
      } catch {
        // Private mode: nothing to remember.
      }
      setDone({ ...res, reported: needHealth && points.length > 0 });
      setEditing(false);
      setQuick(true);
      setReport({ open: false, points: [], note: '' });
    } catch (err) {
      if (err instanceof ApiError && err.body?.code === 'HEALTH_REQUIRED') setHealthAsked(true);
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const set = (patch: Partial<CheckInInput>) => setF({ ...f, ...patch });

  /** The buttons at the end: one tap for healthy people, the points to tick for the others. */
  const actions = (label: string) =>
    !needHealth ? (
      <BigButton disabled={busy} onClick={() => send([])}>
        {label}
      </BigButton>
    ) : (
      <HealthStep
        report={report}
        setReport={setReport}
        busy={busy}
        asked={healthAsked}
        again={answered && !healthAsked}
        onHealthy={() => send([])}
        onReport={() => send(report.points)}
      />
    );

  return (
    <div className="min-h-full bg-slate-100 px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-md">
        <header className="mb-5 flex items-center gap-3 px-1">
          {info?.logo ? (
            <img src={info.logo} alt="" className="h-11 w-11 object-contain" />
          ) : (
            <svg viewBox="0 0 32 32" className="h-10 w-10" aria-hidden>
              <circle cx="16" cy="16" r="15" fill="#f97316" />
              <path d="M16 6 L26 24 H6 Z" fill="#1e3a8a" />
            </svg>
          )}
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">{t('checkin.title')}</h1>
            {info && (
              <p className="truncate text-[15px] text-slate-500">
                {weekday(info.date)}, {fmtDate(info.date)} · {info.kpName}
              </p>
            )}
          </div>
          <LangSwitch className="ml-auto" />
        </header>

        {!info ? (
          <p className="rounded-lg bg-white p-4 text-[15px] text-slate-600">{error || t('common.loading')}</p>
        ) : done ? (
          <div className="space-y-3 rounded-lg bg-white p-6 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-4xl text-white">✓</div>
            <p className="text-xl font-semibold">
              {t('checkin.thanks', { name: f.vorname })}
              <br />
              {done.matched ? t('checkin.matched') : t('checkin.received')}
            </p>
            {!done.matched && <p className="text-[15px] text-slate-600">{t('checkin.notMatched')}</p>}
            {done.reported && (
              <p className="rounded-lg bg-orange-50 px-3 py-2 text-left text-[15px] text-orange-900">
                <b>{t('health.title')}:</b> {t('checkin.reported')}
              </p>
            )}
            <button className="text-[15px] text-zs-blue" onClick={edit}>
              {t('checkin.edit')}
            </button>
          </div>
        ) : !info.open ? (
          <p className="rounded-lg bg-white p-4 text-[15px] text-slate-700">
            {t('checkin.closed', { day: `${weekday(info.date)}, ${fmtDate(info.date)}` })}
          </p>
        ) : quick && zug ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-white px-4 py-3">
              <div className="text-lg font-semibold">
                {f.vorname} {f.nachname}
              </div>
              {f.email && <div className="text-[15px] text-slate-500">{f.email}</div>}
              <div className="text-[15px] text-slate-500">
                {zug.name} · {t(`diet.${f.diet}`)}
                {f.intolerances && ` · ${f.intolerances}`}
              </div>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            {actions(t('checkin.as', { name: f.vorname }))}
            <div className="flex justify-center gap-6 text-[15px]">
              <button type="button" className="text-zs-blue" onClick={edit}>
                {t('checkin.edit')}
              </button>
              <button type="button" className="text-zs-blue" onClick={forget}>
                {t('checkin.notYou', { name: f.vorname })}
              </button>
            </div>
          </div>
        ) : (
          <form ref={formRef} className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            <div className="group-list">
              <Line label={t('checkin.firstName')}>
                <input className="cell-input" required autoFocus={!f.vorname} autoComplete="given-name" enterKeyHint="next" value={f.vorname} onChange={(e) => set({ vorname: e.target.value })} />
              </Line>
              <Line label={t('checkin.lastName')}>
                <input className="cell-input" required autoComplete="family-name" enterKeyHint="next" value={f.nachname} onChange={(e) => set({ nachname: e.target.value })} />
              </Line>
              <Line label={t('checkin.email')}>
                <input
                  className="cell-input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  enterKeyHint="done"
                  placeholder={t('checkin.optional')}
                  value={f.email}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </Line>
            </div>

            <Chips label={t('checkin.zug')} value={f.zugId} options={info.zuege.map((z) => [z.id, z.name] as const)} onChange={(zugId) => set({ zugId })} />
            <div>
              <Chips label={t('checkin.food')} value={f.diet} options={DIETS.map((d: Diet) => [d, t(`diet.${d}`)] as const)} onChange={(diet) => set({ diet })} />
              {showIntol ? (
                <input
                  className="input mt-2 !bg-white !py-2.5"
                  value={f.intolerances}
                  placeholder={t('checkin.intolerances')}
                  autoFocus={!f.intolerances}
                  onChange={(e) => set({ intolerances: e.target.value })}
                />
              ) : (
                <button type="button" className="mx-1 mt-2 text-[15px] text-zs-blue" onClick={() => setShowIntol(true)}>
                  {t('checkin.addIntolerance')}
                </button>
              )}
            </div>

            {error && <ErrorText>{error}</ErrorText>}
            {actions(t('checkin.submit'))}
          </form>
        )}
      </div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-[48px] items-center gap-3 pl-4 pr-3">
      <span className="w-[84px] flex-none text-[15px]">{label}</span>
      {children}
    </label>
  );
}

/** One tap choice (segmented chips, wrapping on small screens). */
function Chips<T extends string | number>({ label, value, options, onChange }: { label: string; value: T | null; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="group-head !mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`min-h-[44px] rounded-full px-4 text-[15px] transition active:opacity-60 ${value === v ? 'bg-zs-blue font-semibold text-white' : 'bg-white text-slate-900'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
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

const ErrorText = ({ children }: { children: ReactNode }) => <p className="rounded-lg bg-red-50 px-3 py-2 text-[15px] text-red-800">{children}</p>;

/**
 * Sanitarische Eintrittsbefragung (Weisungen BABS über die Sicherheitsvorschriften im Zivilschutz, Art. 6 Abs. 2):
 * the points to read, then «Gesund – einchecken» in one tap, or tick what applies.
 */
function HealthStep({
  report,
  setReport,
  busy,
  asked,
  again,
  onHealthy,
  onReport,
}: {
  report: { open: boolean; points: HealthPoint[]; note: string };
  setReport: (r: { open: boolean; points: HealthPoint[]; note: string }) => void;
  busy: boolean;
  asked: boolean;
  /** Answered before (changing the data): an earlier report stays until the Kp Kdt has clarified it. */
  again: boolean;
  onHealthy: () => void;
  onReport: () => void;
}) {
  const { t } = useT();
  const toggle = (p: HealthPoint) => setReport({ ...report, points: report.points.includes(p) ? report.points.filter((x) => x !== p) : [...report.points, p].sort() });
  return (
    <section className="space-y-3">
      <div>
        <h2 className="group-head">{t('health.title')}</h2>
        <div className="rounded-lg bg-white px-4 py-3 text-[15px]">
          {asked && <p className="mb-1 font-semibold text-orange-700">{t('checkin.healthAsk')}</p>}
          {again && !report.open && (
            <p className="mb-1 text-slate-500">{t('checkin.healthAgain')}</p>
          )}
          <p className="text-slate-600">{report.open ? t('checkin.healthWhich') : t('checkin.healthAny')}</p>
          {report.open ? (
            <div className="-mx-4 mt-1">
              {HEALTH_POINT_KEYS.map((p) => (
                <label key={p} className="hairline-t flex cursor-pointer items-start gap-3 px-4 py-3 first:border-t-0">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 flex-none" checked={report.points.includes(p)} onChange={() => toggle(p)} />
                  <span>{t(`health.${p}`)}</span>
                </label>
              ))}
              <div className="px-4 pt-1">
                <textarea
                  className="input"
                  rows={2}
                  maxLength={1000}
                  placeholder={t('checkin.healthNote')}
                  value={report.note}
                  onChange={(e) => setReport({ ...report, note: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-slate-700">
              {HEALTH_POINT_KEYS.map((p) => (
                <li key={p}>{t(`health.${p}`)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {report.open ? (
        <>
          <BigButton disabled={busy || !report.points.length} onClick={onReport}>
            {t('checkin.healthReport')}
          </BigButton>
          <button type="button" className="w-full text-[15px] text-zs-blue" onClick={() => setReport({ ...report, open: false, points: [] })}>
            {t('checkin.healthCancel')}
          </button>
        </>
      ) : (
        <>
          <BigButton disabled={busy} onClick={onHealthy}>
            {t('checkin.healthy')}
          </BigButton>
          <BigButton secondary disabled={busy} onClick={() => setReport({ ...report, open: true })}>
            {t('checkin.healthSomething')}
          </BigButton>
        </>
      )}
    </section>
  );
}


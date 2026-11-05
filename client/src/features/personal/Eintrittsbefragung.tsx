// Sanitarische Eintrittsbefragung (Weisungen BABS über die Sicherheitsvorschriften im Zivilschutz, Art. 6): reports to take to the
// Kursarzt, the restrictions he orders (for the superiors) and who has not been asked yet.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { HealthCheck, HealthPoint, HealthStatus } from '@shared/types';
import { HEALTH_POINT_KEYS } from '@shared/types';
import { canHandleHealth } from '@shared/permissions';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, Card, Empty, errMsg, useToast } from '../../components/ui';
import { useT } from '../../i18n';

const STATUS_STYLE: Record<HealthStatus, string> = {
  GESUND: 'bg-emerald-100 text-emerald-800',
  MELDUNG: 'bg-orange-100 text-orange-800',
  KURSARZT: 'bg-sky-100 text-sky-800',
  ERLEDIGT: 'bg-slate-200 text-slate-700',
};

export function Eintrittsbefragung({ detail }: { detail: WkDetail }) {
  const { t } = useT();
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const handle = canHandleHealth(me, wk);
  const health = useQuery({ queryKey: ['health', wk.id], queryFn: () => api.health(wk.id), refetchInterval: 15_000 });
  const participants = useQuery({ queryKey: ['participants', wk.id], queryFn: () => api.participants(wk.id) });
  const checkins = useQuery({ queryKey: ['checkins', wk.id], queryFn: () => api.checkins(wk.id) });
  const zugName = (id: number | null) => zuege.find((z) => z.id === id)?.name ?? '';
  const list = health.data ?? [];

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['health', wk.id] });
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const reports = list.filter((h) => h.status !== 'GESUND').sort((a, b) => order(a.status) - order(b.status) || a.nachname.localeCompare(b.nachname));
  const healthy = list.filter((h) => h.status === 'GESUND');
  // Checked in (or marked present) but not asked yet.
  const asked = new Set(list.map((h) => h.participantId).filter((x): x is number => x !== null));
  const present = new Set((checkins.data ?? []).map((c) => c.participantId).filter((x): x is number => x !== null));
  const open = (participants.data ?? []).filter((p) => present.has(p.id) && !asked.has(p.id)).sort((a, b) => a.nachname.localeCompare(b.nachname));

  if (!handle) {
    // Zugführer: who reported and which restrictions the Kursarzt ordered (Art. 6 Abs. 3) – no health details.
    const restricted = list.filter((h) => h.restriction || h.status === 'MELDUNG');
    return (
      <Card title={t('hc.restrictionsTitle')}>
        <p className="mb-3 text-sm text-slate-600">
          {t('hc.restrictionsIntro')}
        </p>
        {restricted.length === 0 ? (
          <Empty>{t('hc.noRestrictions')}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {restricted.map((h) => (
              <li key={h.id} className="py-2">
                <b>
                  {h.nachname} {h.vorname}
                </b>{' '}
                <span className="text-slate-500">{zugName(h.zugId)}</span>
                <div>{h.restriction || <span className="text-slate-500">{t('hc.pending')}</span>}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <>
      <p className="text-sm text-slate-600">
        {t('hc.intro')}
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Stat n={healthy.length} label={t('hc.healthy')} cls="text-emerald-700" />
        <Stat n={reports.filter((h) => h.status === 'MELDUNG').length} label={t('hc.toDoctor')} cls="text-orange-700" />
        <Stat n={reports.filter((h) => h.status !== 'MELDUNG').length} label={t('hc.cleared')} cls="text-sky-700" />
        <Stat n={open.length} label={t('hc.notAsked')} cls="text-slate-700" />
      </div>

      <Card title={`Meldungen (${reports.length})`}>
        {health.isLoading ? (
          <Empty>{t('common.loading')}</Empty>
        ) : reports.length === 0 ? (
          <Empty>{t('hc.noReports')}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reports.map((h) => (
              <Report key={h.id} h={h} zug={zugName(h.zugId)} onUpdate={(b) => run(() => api.updateHealth(wk.id, h.id, b))} />
            ))}
          </ul>
        )}
      </Card>

      {open.length > 0 && (
        <Card title={t('hc.openTitle', { n: open.length })}>
          <p className="mb-2 text-sm text-slate-600">{t('hc.openIntro')}</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {open.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="flex-1">
                  <b>{[p.grad, p.nachname, p.vorname].filter(Boolean).join(' ')}</b> <span className="text-slate-500">{zugName(p.zugId)}</span>
                </span>
                <Button onClick={() => run(() => api.recordHealth(wk.id, { participantId: p.id, points: [], note: '' }))}>{t('hc.healthyButton')}</Button>
                <ManualReport onSave={(points, note) => run(() => api.recordHealth(wk.id, { participantId: p.id, points, note }))} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t('hc.healthyTitle', { n: healthy.length })}>
        {healthy.length === 0 ? (
          <Empty>{t('hc.nobody')}</Empty>
        ) : (
          <p className="text-sm leading-relaxed text-slate-700">
            {healthy
              .sort((a, b) => a.nachname.localeCompare(b.nachname))
              .map((h) => `${h.nachname} ${h.vorname}${h.source === 'MANUAL' ? t('hc.oral') : ''}`)
              .join(' · ')}
          </p>
        )}
      </Card>
    </>
  );
}

const order = (s: HealthStatus) => ({ MELDUNG: 0, KURSARZT: 1, ERLEDIGT: 2, GESUND: 3 })[s];

const Stat = ({ n, label, cls }: { n: number; label: string; cls: string }) => (
  <span className="rounded-lg bg-white px-3 py-1.5">
    <b className={`text-lg tabular-nums ${cls}`}>{n}</b> {label}
  </span>
);

function Report({ h, zug, onUpdate }: { h: HealthCheck; zug: string; onUpdate: (b: { status?: HealthStatus; restriction?: string }) => void }) {
  const { t } = useT();
  const [restriction, setRestriction] = useState(h.restriction);
  return (
    <li className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <b>
          {h.nachname} {h.vorname}
        </b>
        <span className="text-sm text-slate-500">{zug || 'ohne Zug'}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[h.status]}`}>{t(`healthStatus.${h.status}`)}</span>
        {h.source === 'MANUAL' && <span className="text-xs text-slate-500">{t('hc.oralRecorded')}</span>}
      </div>
      <ul className="list-inside list-disc text-sm text-slate-700">
        {h.points.map((p) => (
          <li key={p}>{t(`health.${p}`)}</li>
        ))}
      </ul>
      {h.note && <p className="rounded bg-slate-50 px-2 py-1 text-sm">«{h.note}»</p>}
      <label className="block text-sm">
        <span className="text-slate-500">{t('hc.restrictionLabel')}</span>
        <input
          className="input mt-1"
          value={restriction}
          placeholder={t('hc.restrictionPh')}
          onChange={(e) => setRestriction(e.target.value)}
          onBlur={() => restriction !== h.restriction && onUpdate({ restriction })}
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {h.status === 'MELDUNG' && <Button onClick={() => onUpdate({ status: 'KURSARZT', restriction })}>{t('hc.toDoctorDone')}</Button>}
        {h.status !== 'ERLEDIGT' && (
          <Button variant="ghost" onClick={() => onUpdate({ status: 'ERLEDIGT', restriction })}>
            {t('hc.done')}
          </Button>
        )}
        {h.status === 'ERLEDIGT' && (
          <Button variant="ghost" onClick={() => onUpdate({ status: 'KURSARZT' })}>
            {t('wk.reopen')}
          </Button>
        )}
      </div>
    </li>
  );
}

/** Asked in person and something applies: tick the points. */
function ManualReport({ onSave }: { onSave: (points: HealthPoint[], note: string) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<HealthPoint[]>([]);
  const [note, setNote] = useState('');
  if (!open) return <Button onClick={() => setOpen(true)}>{t('hc.reports')}</Button>;
  return (
    <div className="w-full space-y-1.5 rounded-lg bg-slate-50 p-2">
      {HEALTH_POINT_KEYS.map((p: HealthPoint) => (
        <label key={p} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={points.includes(p)} onChange={() => setPoints(points.includes(p) ? points.filter((x) => x !== p) : [...points, p])} />
          {t(`health.${p}`)}
        </label>
      ))}
      <input className="input" placeholder={t('hc.notePh')} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-1.5">
        <Button variant="primary" disabled={!points.length} onClick={() => onSave(points, note)}>
          {t('hc.record')}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

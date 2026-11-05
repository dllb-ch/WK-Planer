// Sanitarische Eintrittsbefragung (Weisungen BABS über die Sicherheitsvorschriften im Zivilschutz, Art. 6): reports to take to the
// Kursarzt, the restrictions he orders (for the superiors) and who has not been asked yet.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { HealthCheck, HealthPoint, HealthStatus } from '@shared/types';
import { HEALTH_POINTS, HEALTH_STATUS_LABEL } from '@shared/types';
import { canHandleHealth } from '@shared/permissions';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, Card, Empty, errMsg, useToast } from '../../components/ui';

const STATUS_STYLE: Record<HealthStatus, string> = {
  GESUND: 'bg-emerald-100 text-emerald-800',
  MELDUNG: 'bg-orange-100 text-orange-800',
  KURSARZT: 'bg-sky-100 text-sky-800',
  ERLEDIGT: 'bg-slate-200 text-slate-700',
};

export function Eintrittsbefragung({ detail }: { detail: WkDetail }) {
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
      <Card title="Eintrittsbefragung – Einschränkungen">
        <p className="mb-3 text-sm text-slate-600">
          Vom Kursarzt angeordnete Einschränkungen deiner Leute. Die Angaben der Befragung selbst sieht nur der Kp Kdt.
        </p>
        {restricted.length === 0 ? (
          <Empty>Keine Einschränkungen gemeldet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {restricted.map((h) => (
              <li key={h.id} className="py-2">
                <b>
                  {h.nachname} {h.vorname}
                </b>{' '}
                <span className="text-slate-500">{zugName(h.zugId)}</span>
                <div>{h.restriction || <span className="text-slate-500">Abklärung beim Kursarzt läuft.</span>}</div>
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
        Gemäss Art. 6 der Weisungen über die Sicherheitsvorschriften im Zivilschutz beantwortet jede Person beim ersten Check-in die sanitarische
        Eintrittsbefragung. Wer sich meldet, wird dem Kursarzt zugeführt; die angeordneten Einschränkungen sehen die Zugführer.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Stat n={healthy.length} label="gesund" cls="text-emerald-700" />
        <Stat n={reports.filter((h) => h.status === 'MELDUNG').length} label="zum Kursarzt" cls="text-orange-700" />
        <Stat n={reports.filter((h) => h.status !== 'MELDUNG').length} label="abgeklärt" cls="text-sky-700" />
        <Stat n={open.length} label="anwesend, nicht befragt" cls="text-slate-700" />
      </div>

      <Card title={`Meldungen (${reports.length})`}>
        {health.isLoading ? (
          <Empty>Laden …</Empty>
        ) : reports.length === 0 ? (
          <Empty>Niemand hat sich gemeldet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reports.map((h) => (
              <Report key={h.id} h={h} zug={zugName(h.zugId)} onUpdate={(b) => run(() => api.updateHealth(wk.id, h.id, b))} />
            ))}
          </ul>
        )}
      </Card>

      {open.length > 0 && (
        <Card title={`Anwesend, noch nicht befragt (${open.length})`}>
          <p className="mb-2 text-sm text-slate-600">Von Hand präsent gesetzt oder vor der Einführung eingecheckt. Mündlich befragen und hier erfassen.</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {open.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="flex-1">
                  <b>{[p.grad, p.nachname, p.vorname].filter(Boolean).join(' ')}</b> <span className="text-slate-500">{zugName(p.zugId)}</span>
                </span>
                <Button onClick={() => run(() => api.recordHealth(wk.id, { participantId: p.id, points: [], note: '' }))}>Gesund</Button>
                <ManualReport onSave={(points, note) => run(() => api.recordHealth(wk.id, { participantId: p.id, points, note }))} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`Gesund gemeldet (${healthy.length})`}>
        {healthy.length === 0 ? (
          <Empty>Noch niemand.</Empty>
        ) : (
          <p className="text-sm leading-relaxed text-slate-700">
            {healthy
              .sort((a, b) => a.nachname.localeCompare(b.nachname))
              .map((h) => `${h.nachname} ${h.vorname}${h.source === 'MANUAL' ? ' (mündlich)' : ''}`)
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
  const [restriction, setRestriction] = useState(h.restriction);
  return (
    <li className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <b>
          {h.nachname} {h.vorname}
        </b>
        <span className="text-sm text-slate-500">{zug || 'ohne Zug'}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[h.status]}`}>{HEALTH_STATUS_LABEL[h.status]}</span>
        {h.source === 'MANUAL' && <span className="text-xs text-slate-500">mündlich erfasst</span>}
      </div>
      <ul className="list-inside list-disc text-sm text-slate-700">
        {h.points.map((p) => (
          <li key={p}>{HEALTH_POINTS[p]}</li>
        ))}
      </ul>
      {h.note && <p className="rounded bg-slate-50 px-2 py-1 text-sm">«{h.note}»</p>}
      <label className="block text-sm">
        <span className="text-slate-500">Vom Kursarzt angeordnete Einschränkungen (für die Vorgesetzten sichtbar)</span>
        <input
          className="input mt-1"
          value={restriction}
          placeholder="z. B. keine Lasten über 10 kg, kein Einsatz am Wasser"
          onChange={(e) => setRestriction(e.target.value)}
          onBlur={() => restriction !== h.restriction && onUpdate({ restriction })}
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {h.status === 'MELDUNG' && <Button onClick={() => onUpdate({ status: 'KURSARZT', restriction })}>Dem Kursarzt zugeführt</Button>}
        {h.status !== 'ERLEDIGT' && (
          <Button variant="ghost" onClick={() => onUpdate({ status: 'ERLEDIGT', restriction })}>
            Erledigt
          </Button>
        )}
        {h.status === 'ERLEDIGT' && (
          <Button variant="ghost" onClick={() => onUpdate({ status: 'KURSARZT' })}>
            Wieder öffnen
          </Button>
        )}
      </div>
    </li>
  );
}

/** Asked in person and something applies: tick the points. */
function ManualReport({ onSave }: { onSave: (points: HealthPoint[], note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<HealthPoint[]>([]);
  const [note, setNote] = useState('');
  if (!open) return <Button onClick={() => setOpen(true)}>Meldet sich …</Button>;
  return (
    <div className="w-full space-y-1.5 rounded-lg bg-slate-50 p-2">
      {(Object.keys(HEALTH_POINTS) as HealthPoint[]).map((p) => (
        <label key={p} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={points.includes(p)} onChange={() => setPoints(points.includes(p) ? points.filter((x) => x !== p) : [...points, p])} />
          {HEALTH_POINTS[p]}
        </label>
      ))}
      <input className="input" placeholder="Notiz (freiwillig)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-1.5">
        <Button variant="primary" disabled={!points.length} onClick={() => onSave(points, note)}>
          Meldung erfassen
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

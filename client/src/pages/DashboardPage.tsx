import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { canArchiveWk, canCreateWk } from '@shared/permissions';
import { ROLE_LABEL } from '@shared/types';
import { fmtDate, fmtTime, parseTime, weekday } from '@shared/util';
import { api, type WkSummary } from '../api';
import { useUser } from '../auth';
import { Button, Card, Empty, errMsg, Field, Modal, StatusBadge, useToast } from '../components/ui';
import { KaderOverview, KpKdtOverview, ZfhrOverview } from './RoleOverview';

const today = () => new Date().toISOString().slice(0, 10);

export function DashboardPage() {
  const me = useUser();
  const wks = useQuery({ queryKey: ['wks'], queryFn: api.wks });
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const [creating, setCreating] = useState(false);
  const all = wks.data ?? [];
  const list = all.filter((w) => !w.archived);
  const archived = all.filter((w) => w.archived);
  const kpName = org.data?.kompanien.find((k) => k.id === me.kpId)?.name;
  const zugName = org.data?.zuege.find((z) => z.id === me.zugId)?.name;
  const upcoming = list.filter((w) => w.endDate >= today()).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = list.filter((w) => w.endDate < today());

  const intro: Record<typeof me.role, string> = {
    BAT: 'Übersicht über alle Kompanien des Bataillons. Erstellen Sie WKs, erteilen Sie den Ausbildungsbefehl und geben Sie eingereichte Arbeitsprogramme frei.',
    KPKDT: 'Planen Sie WK-Konzept und Arbeitsprogramm Ihrer Kompanie, steuern Sie die Vorbereitung und reichen Sie das Arbeitsprogramm beim Bat ein.',
    ADMIN: 'Konfigurieren Sie die Vorlagen der Vorbereitung pro Bataillon und Kompanie.',
    LOGOF: 'Verwalten Sie Fahrzeuge, Räume und Geländeabschnitte der Kompanie und bewilligen Sie die Anfragen der Züge.',
    ZFHR: 'Planen Sie Ihren Zug im Detail: Zugansicht mit Detailplanung, Ausbildungsvorbereitungen und Anfragen für Fahrzeuge, Räume und Gelände.',
    KADER: 'Ihr Programm in der Zugansicht und Ihre Ausbildungsvorbereitungen für die kommenden Dienste.',
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 overflow-y-auto p-3 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Guten Tag, {me.name}</h1>
          <p className="text-sm text-slate-500">
            {ROLE_LABEL[me.role]}
            {kpName && ` · ${kpName}`}
            {zugName && ` · ${zugName}`}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{intro[me.role]}</p>
        </div>
        {canCreateWk(me) && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            + Neuer WK
          </Button>
        )}
      </div>

      {me.role === 'BAT' && <BatOverview list={list} />}
      {me.role === 'BAT' && list.some((w) => w.status === 'EINGEREICHT') && (
        <Card title="Zur Freigabe">
          <ul className="divide-y">
            {list
              .filter((w) => w.status === 'EINGEREICHT')
              .map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <b>{w.kpName}</b> – {w.title}
                  </span>
                  <Link className="text-zs-blue hover:underline" to={`/wk/${w.id}`}>
                    Prüfen →
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {wks.isSuccess && me.role === 'KADER' && <KaderOverview wk={upcoming[0]} />}
      {wks.isSuccess && me.role === 'ZFHR' && <ZfhrOverview wk={upcoming[0]} />}
      {wks.isSuccess && (me.role === 'KPKDT' || me.role === 'LOGOF') && <KpKdtOverview wk={upcoming[0]} />}
      {(me.role === 'KADER' || me.role === 'ZFHR') && upcoming[0] && <MyNext wk={upcoming[0]} zugId={me.zugId} />}

      <Card title="Wiederholungskurse" actions={<ArchivePast past={past} />}>
        {wks.isLoading ? <Empty>Laden …</Empty> : list.length === 0 ? <Empty>Noch keine WKs geplant.</Empty> : <WkTable list={[...upcoming, ...past]} />}
      </Card>

      {archived.length > 0 && (
        <Card title={`Archiv (${archived.length})`}>
          <details>
            <summary className="cursor-pointer text-sm text-zs-blue">Archivierte WKs anzeigen</summary>
            <div className="mt-2">
              <WkTable list={archived} />
            </div>
          </details>
        </Card>
      )}

      {creating && <CreateWkDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function BatOverview({ list }: { list: WkSummary[] }) {
  const counts = (s: WkSummary['status']) => list.filter((w) => w.status === s).length;
  const tiles = [
    { label: 'WKs total', value: list.length },
    { label: 'Entwurf', value: counts('ENTWURF') + counts('ZURUECKGEWIESEN') },
    { label: 'Eingereicht', value: counts('EINGEREICHT') },
    { label: 'Freigegeben', value: counts('FREIGEGEBEN') },
    { label: 'Vorbereitung überfällig', value: list.reduce((n, w) => n + w.overdueMilestones, 0) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-2xl font-semibold tabular-nums">{t.value}</div>
          <div className="text-xs text-slate-500">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

function WkTable({ list }: { list: WkSummary[] }) {
  const me = useUser();
  const ops = useWkOps();
  const actions = list.some((w) => canArchiveWk(me, w));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3">WK</th>
            <th className="py-2 pr-3 max-sm:hidden">Kompanie</th>
            <th className="py-2 pr-3">Datum</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3 text-right max-sm:hidden">Blöcke</th>
            <th className="py-2 text-right">Vorbereitung offen</th>
            {actions && <th className="py-2 pl-3" />}
          </tr>
        </thead>
        <tbody>
          {list.map((w) => (
            <tr key={w.id} className={`border-t border-slate-100 ${w.endDate < today() ? 'text-slate-400' : ''}`}>
              <td className="py-2 pr-3">
                <Link to={`/wk/${w.id}${me.role === 'ZFHR' || me.role === 'KADER' ? '/zug' : ''}`} className="font-medium text-zs-blue hover:underline">
                  {w.title}
                </Link>
              </td>
              <td className="py-2 pr-3 max-sm:hidden">{w.kpName}</td>
              <td className="py-2 pr-3 sm:whitespace-nowrap">
                {fmtDate(w.startDate)} – {fmtDate(w.endDate)}
              </td>
              <td className="py-2 pr-3">
                <StatusBadge status={w.status} />
              </td>
              <td className="py-2 pr-3 text-right tabular-nums max-sm:hidden">{w.blockCount}</td>
              <td className="py-2 text-right tabular-nums">
                <Link to={`/wk/${w.id}/meilensteine`} className="hover:underline">
                  {w.openMilestones}
                  {w.overdueMilestones > 0 && <span className="ml-1 text-red-600">({w.overdueMilestones} überfällig)</span>}
                </Link>
              </td>
              {actions && (
                <td className="whitespace-nowrap py-2 pl-3 text-right">
                  {canArchiveWk(me, w) && (
                    <>
                      <Button variant="ghost" className="!px-2 !py-0.5 text-xs" onClick={() => ops.archive([w], !w.archived)}>
                        {w.archived ? 'Wiederherstellen' : 'Archivieren'}
                      </Button>
                      <Button variant="ghost" className="!px-2 !py-0.5 text-xs !text-red-600" onClick={() => ops.remove(w)}>
                        Löschen
                      </Button>
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Archive / restore and delete WKs (Bat Kdo). */
function useWkOps() {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: ['wks'] });
  return {
    archive: async (list: WkSummary[], archived: boolean) => {
      try {
        for (const w of list) await api.archiveWk(w.id, archived);
        toast(list.length === 1 ? `«${list[0].title}» ${archived ? 'archiviert' : 'wiederhergestellt'}` : `${list.length} WKs archiviert`);
      } catch (e) {
        toast(errMsg(e), 'error');
      }
      await refresh();
    },
    remove: async (w: WkSummary) => {
      if (!confirm(`«${w.title}» (${w.kpName}) mit Arbeitsprogramm, Personal, Rapporten und allen Unterlagen endgültig löschen?\n\nArchivieren behält alles und blendet den WK nur aus.`)) return;
      try {
        await api.deleteWk(w.id);
        toast(`«${w.title}» gelöscht`);
      } catch (e) {
        toast(errMsg(e), 'error');
      }
      await refresh();
    },
  };
}

/** «Vergangene archivieren»: all finished WKs at once. */
function ArchivePast({ past }: { past: WkSummary[] }) {
  const me = useUser();
  const ops = useWkOps();
  const mine = past.filter((w) => canArchiveWk(me, w));
  if (mine.length === 0) return null;
  return (
    <Button
      variant="ghost"
      className="!py-0.5 text-xs"
      onClick={() => confirm(`${mine.length} vergangene WKs archivieren? Sie bleiben im Archiv erhalten und können wiederhergestellt werden.`) && ops.archive(mine, true)}
    >
      Vergangene archivieren ({mine.length})
    </Button>
  );
}

/** Next WK programme of the own Zug (Zfhr and Kader). */
function MyNext({ wk, zugId }: { wk: WkSummary; zugId: number | null }) {
  const detail = useQuery({ queryKey: ['wk', wk.id], queryFn: () => api.wk(wk.id) });
  if (!detail.data || !zugId) return null;
  const blocks = detail.data.blocks.filter((b) => b.zugIds.includes(zugId)).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const firstDay = blocks[0]?.date;
  const locs = detail.data.locations;
  return (
    <Card
      title={`Mein nächster Dienst: ${wk.title}`}
      actions={
        <Link className="text-sm text-zs-blue hover:underline" to={`/wk/${wk.id}/zug`}>
          Zugansicht →
        </Link>
      }
    >
      {blocks.length === 0 ? (
        <Empty>Noch keine Einträge für Ihren Zug.</Empty>
      ) : (
        <>
          <p className="mb-2 text-sm font-medium">
            {weekday(firstDay)}, {fmtDate(firstDay)}
          </p>
          <ul className="space-y-1 text-sm">
            {blocks
              .filter((b) => b.date === firstDay)
              .map((b) => (
                <li key={b.id} className="flex gap-3">
                  <span className="w-24 shrink-0 tabular-nums text-slate-500">
                    {fmtTime(b.startMin)}–{fmtTime(b.endMin)}
                  </span>
                  <span>
                    {b.title}
                    {b.locationId && <span className="text-slate-500"> · {locs.find((l) => l.id === b.locationId)?.name}</span>}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function CreateWkDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const [f, setF] = useState({ kpId: 0, title: '', startDate: '', endDate: '', dayStart: '07:30', dayEnd: '17:00', snapMin: 15 });
  const create = useMutation({
    mutationFn: () => api.createWk({ ...f, dayStart: parseTime(f.dayStart), dayEnd: parseTime(f.dayEnd) }),
    onSuccess: (wk) => {
      qc.invalidateQueries({ queryKey: ['wks'] });
      nav(`/wk/${wk.id}`);
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const valid = f.kpId && f.title && f.startDate && f.endDate && f.endDate >= f.startDate;
  return (
    <Modal
      title="Neuen WK erstellen"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            Erstellen
          </Button>
        </>
      }
    >
      <Field label="Kompanie">
        <select className="input" value={f.kpId} onChange={(e) => setF({ ...f, kpId: Number(e.target.value) })}>
          <option value={0}>– wählen –</option>
          {org.data?.kompanien.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Bezeichnung">
        <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="z. B. WK I / 2027 Pi Kp" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Erster Tag (inkl. KVK)">
          <input type="date" className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate || e.target.value })} />
        </Field>
        <Field label="Letzter Tag">
          <input type="date" className="input" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </Field>
        <Field label="Tagesbeginn">
          <input type="time" className="input" value={f.dayStart} onChange={(e) => setF({ ...f, dayStart: e.target.value })} />
        </Field>
        <Field label="Tagesende">
          <input type="time" className="input" value={f.dayEnd} onChange={(e) => setF({ ...f, dayEnd: e.target.value })} />
        </Field>
      </div>
      <p className="text-xs text-slate-500">
        Der Vorbereitungs-Zeitplan (Konzept 12 Monate, Rapporte, Befehl 6 Wochen vorher …) wird automatisch angelegt.
      </p>
    </Modal>
  );
}

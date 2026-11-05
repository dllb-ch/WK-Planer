import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImportExportMenu } from '../../components/ImportExport';
import { exportTable, importTable, type Column } from '../../lib/tableFile';
import { useQueryClient } from '@tanstack/react-query';
import type { Area, Resource, ResourceKind } from '@shared/types';
import { RESOURCE_KIND_LABEL } from '@shared/types';
import { canAdministrate, canManageResources } from '@shared/permissions';
import { api } from '../../api';
import { useUser } from '../../auth';
import { Button, Card, errMsg, Field, Modal, useToast } from '../../components/ui';
import { SwissMap } from '../../components/SwissMap';

/** Refreshes every cached catalogue (per Kp and per Bat). */
export const invalidateResources = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'resources' || q.queryKey[0] === 'bat-resources' });

const RES_COLUMNS: Column[] = [
  { key: 'nr', header: 'Nr.', width: 6 },
  { key: 'art', header: 'Art', width: 12 },
  { key: 'typ', header: 'Typ', width: 18 },
  { key: 'bezeichnung', header: 'Bezeichnung', width: 28 },
  { key: 'kapazitaet', header: 'Kapazität', width: 12 },
  { key: 'sitzplaetze', header: 'Sitzplätze', width: 10 },
  { key: 'beschreibung', header: 'Beschreibung / Ausstattung', width: 40 },
  { key: 'gehoertZu', header: 'Gehört zu', width: 18 },
  { key: 'flaeche', header: 'Fläche (Koordinaten)', width: 30 },
];

const kindOf = (s = ''): ResourceKind | null => {
  const t = s.trim().toLowerCase();
  if (t.startsWith('fahr')) return 'FAHRZEUG';
  if (t.startsWith('anh')) return 'ANHAENGER';
  if (t.startsWith('raum') || t.startsWith('räum')) return 'RAUM';
  if (t.startsWith('gel')) return 'GELAENDE';
  return null;
};

export const OwnerBadge = ({ r }: { r: Resource }) =>
  r.kpId === null ? <span className="rounded bg-indigo-100 px-1.5 text-[10px] font-medium text-indigo-800">Bataillon</span> : null;

/**
 * Catalogue of vehicles, rooms and terrain. kpId is the Kp in context (its own material plus the shared material of
 * the Bataillon); null shows the Bataillon's shared material only.
 */
export function Catalogue({ batId, kpId, resources, title }: { batId: number; kpId: number | null; resources: Resource[]; title?: string }) {
  const me = useUser();
  const [edit, setEdit] = useState<Partial<Resource> | null>(null);
  const list = kpId === null ? resources.filter((r) => r.kpId === null) : resources;
  const canAddShared = canAdministrate(me, batId);
  const canAddKp = kpId !== null && canManageResources(me, { batId, kpId });
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const adminOrg = useQuery({ queryKey: ['admin-org'], queryFn: api.adminOrg, enabled: me.role === 'ADMIN' });
  const kompanien = (me.role === 'ADMIN' ? adminOrg.data?.find((b) => b.id === batId)?.kompanien : org.data?.kompanien) ?? [];
  const kpName = (id: number | null) => (id === null ? 'Bataillon' : (kompanien.find((k) => k.id === id)?.name ?? ''));

  const exportFile = (format: 'xlsx' | 'json') =>
    exportTable(
      kpId === null ? 'Material_Bataillon' : `Material_${kpName(kpId).replace(/\s+/g, '_')}`,
      'WK-Planer Ressourcen',
      RES_COLUMNS,
      list.map((r) => ({
        nr: r.nr === null ? '' : String(r.nr),
        art: RESOURCE_KIND_LABEL[r.kind],
        typ: r.category,
        bezeichnung: r.name,
        kapazitaet: r.capacity,
        sitzplaetze: r.kind === 'FAHRZEUG' ? String(r.seats) : '',
        beschreibung: r.description,
        gehoertZu: kpName(r.kpId),
        flaeche: r.area ? JSON.stringify(r.area) : '',
      })),
      format,
    );

  /** Updates resources with the same kind, name and owner; creates the others. */
  const importFile = async (file: File) => {
    const rows = await importTable(file, RES_COLUMNS);
    let created = 0;
    let updated = 0;
    const skipped: string[] = [];
    for (const row of rows) {
      const kind = kindOf(row.art);
      if (!kind || !row.bezeichnung) {
        skipped.push(`${row.bezeichnung || '(ohne Bezeichnung)'}: Art oder Bezeichnung fehlt`);
        continue;
      }
      const owner = !row.gehoertZu ? kpId : /^bataillon$/i.test(row.gehoertZu) ? null : (kompanien.find((k) => k.name === row.gehoertZu)?.id ?? -1);
      if (owner === -1) {
        skipped.push(`${row.bezeichnung}: Kompanie «${row.gehoertZu}» unbekannt`);
        continue;
      }
      if (!canManageResources(me, { batId, kpId: owner })) {
        skipped.push(`${row.bezeichnung}: keine Berechtigung für «${kpName(owner)}»`);
        continue;
      }
      let area: Area | null = null;
      try {
        const a = row.flaeche ? JSON.parse(row.flaeche) : null;
        area = Array.isArray(a) && a.length >= 3 ? (a as Area) : null;
      } catch {
        /* no area */
      }
      const body = { kind, category: row.typ || row.bezeichnung.replace(/\s*\d+$/, ''), name: row.bezeichnung, capacity: row.kapazitaet ?? '', seats: Number(row.sitzplaetze) || 0, nr: row.nr?.trim() && !isNaN(Number(row.nr)) ? Number(row.nr) : null, description: row.beschreibung ?? '', area, kpId: owner };
      const existing = resources.find((r) => r.kind === kind && r.name === row.bezeichnung && r.kpId === owner);
      if (existing) {
        await api.updateResource(existing.id, body);
        updated++;
      } else {
        await api.createResource(batId, body);
        created++;
      }
    }
    invalidateResources(qc);
    if (skipped.length) alert(`Nicht übernommen:\n${skipped.join('\n')}`);
    return `${created} neu, ${updated} aktualisiert${skipped.length ? `, ${skipped.length} übersprungen` : ''}`;
  };
  return (
    <Card
      title={title ?? (kpId === null ? 'Material des Bataillons' : 'Katalog der Kompanie')}
      actions={
        <>
          <ImportExportMenu onExport={exportFile} onImport={canAddShared || canAddKp ? importFile : undefined} />
        {(canAddShared || canAddKp) && (
          <Button onClick={() => setEdit({ kind: 'FAHRZEUG', category: '', name: '', description: '', capacity: '', seats: 0, nr: null, area: null, kpId: canAddKp ? kpId : null })}>
            + Ressource
          </Button>
        )}
        </>
      }
    >
      {kpId === null && <p className="mb-3 text-xs text-slate-500">Geteilt von allen Kompanien des Bataillons; alle Kompanien können es anfragen.</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(RESOURCE_KIND_LABEL) as ResourceKind[]).map((k) => (
          <div key={k}>
            <h3 className="label">{RESOURCE_KIND_LABEL[k]}</h3>
            <ul className="space-y-1 text-sm">
              {list
                .filter((r) => r.kind === k)
                .map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 rounded px-1 py-0.5 hover:bg-slate-50">
                    <span>
                      {r.name} {kpId !== null && <OwnerBadge r={r} />}
                      {r.category && r.category !== r.name && <span className="text-xs text-slate-500"> · {r.category}</span>}
                      {r.capacity && <span className="text-slate-500"> · {r.capacity}</span>}
                      {r.description && <div className="text-xs text-slate-500">{r.description}</div>}
                    </span>
                    {canManageResources(me, r) && (
                      <button className="text-xs text-slate-500 hover:text-zs-blue" onClick={() => setEdit(r)}>
                        Bearbeiten
                      </button>
                    )}
                  </li>
                ))}
              {!list.some((r) => r.kind === k) && <li className="text-xs text-slate-400">Keine Einträge</li>}
            </ul>
          </div>
        ))}
      </div>
      {edit && <ResourceDialog batId={batId} kpId={kpId} initial={edit} types={resources.map((x) => x.category).filter(Boolean)} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function ResourceDialog({ batId, kpId, initial, types, onClose }: { batId: number; kpId: number | null; initial: Partial<Resource>; types: string[]; onClose: () => void }) {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const [r, setR] = useState({
    kind: initial.kind ?? ('FAHRZEUG' as ResourceKind),
    category: initial.category ?? '',
    name: initial.name ?? '',
    description: initial.description ?? '',
    capacity: initial.capacity ?? '',
    seats: initial.seats ?? 0,
    nr: initial.nr ?? (null as number | null),
    area: initial.area ?? (null as Area | null),
    kpId: initial.kpId ?? null,
  });
  // The Kp a resource can be assigned to: its current one, or the Kp in context.
  const ownKp = initial.kpId ?? kpId;
  const scopes = [
    ...(canAdministrate(me, batId) ? [{ value: null, label: 'Bataillon (geteilt)' }] : []),
    ...(ownKp !== null && canManageResources(me, { batId, kpId: ownKp }) ? [{ value: ownKp, label: 'Nur diese Kompanie' }] : []),
  ];
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      invalidateResources(qc);
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const body = { ...r, area: r.kind === 'GELAENDE' && r.area && r.area.length >= 3 ? r.area : null };
  return (
    <Modal
      title={initial.id ? 'Ressource bearbeiten' : 'Neue Ressource'}
      onClose={onClose}
      wide
      footer={
        <>
          {initial.id && (
            <Button variant="danger" className="mr-auto" onClick={() => confirm('Ressource löschen?') && run(() => api.deleteResource(initial.id!))}>
              Löschen
            </Button>
          )}
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            disabled={!r.name.trim()}
            onClick={() => run(() => (initial.id ? api.updateResource(initial.id, body) : api.createResource(batId, body)))}
          >
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Art">
          <select className="input" value={r.kind} onChange={(e) => setR({ ...r, kind: e.target.value as ResourceKind })}>
            {(Object.keys(RESOURCE_KIND_LABEL) as ResourceKind[]).map((k) => (
              <option key={k} value={k}>
                {RESOURCE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <div className="col-span-2 grid grid-cols-[5rem,1fr] gap-3">
          <Field label="Nr.">
            <input
              type="number"
              min={0}
              className="input"
              value={r.nr ?? ''}
              title="Nummerierte werden zuerst und nach Nummer sortiert angezeigt"
              onChange={(e) => setR({ ...r, nr: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })}
            />
          </Field>
          <Field label="Bezeichnung">
            <input className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
          </Field>
        </div>
        <Field label="Typ (für Anfragen nach Anzahl)">
          <input className="input" list="res-types" value={r.category} onChange={(e) => setR({ ...r, category: e.target.value })} placeholder="z. B. Mannschaftsbus" />
          <datalist id="res-types">
            {[...new Set(types)].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        {r.kind === 'FAHRZEUG' ? (
          <Field label="Sitzplätze (inkl. Fahrer)">
            <input
              type="number"
              min={0}
              max={100}
              className="input"
              value={r.seats || ''}
              onChange={(e) => {
                const seats = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                setR({ ...r, seats, capacity: seats ? `${seats} Pl.` : '' });
              }}
            />
          </Field>
        ) : (
          <Field label="Kapazität">
            <input className="input" value={r.capacity} onChange={(e) => setR({ ...r, capacity: e.target.value })} placeholder="40 Pers." />
          </Field>
        )}
        <Field label="Beschreibung / Ausstattung" className="col-span-3">
          <input className="input" value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} />
        </Field>
        <Field label="Gehört zu" className="col-span-3">
          <select
            className="input"
            value={r.kpId ?? ''}
            disabled={scopes.length < 2}
            onChange={(e) => setR({ ...r, kpId: e.target.value ? Number(e.target.value) : null })}
          >
            {scopes.map((s) => (
              <option key={s.label} value={s.value ?? ''}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {r.kind === 'GELAENDE' && <SwissMap value={r.area} onChange={(area) => setR({ ...r, area })} height={320} />}
    </Modal>
  );
}

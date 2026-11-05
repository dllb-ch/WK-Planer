import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MapView, Role, TemplateItem, TemplateScope } from '@shared/types';
import { PLANNING_ROLES, ROLE_LABEL } from '@shared/types';
import { api, type AdminBat } from '../api';
import { Button, Card, Empty, errMsg, Field, useToast } from '../components/ui';
import { Catalogue } from '../features/ressourcen/Catalogue';
import { ImportExportMenu } from '../components/ImportExport';
import { exportTable, importTable } from '../lib/tableFile';
import { roleOf, TEMPLATE_COLUMNS } from '../lib/vorbereitungFile';
import { MaterialOverview } from '../features/ressourcen/MaterialOverview';
import { SwissMap } from '../components/SwissMap';
import { useT } from '../i18n';


interface Scope {
  batId: number;
  kpId: number | null;
  name: string;
}

/** Org Admin: configure the Vorbereitung per Bataillon, with optional overrides per Kompanie. */
export function VorlagenPage() {
  const { t } = useT();
  const org = useQuery({ queryKey: ['admin-org'], queryFn: api.adminOrg });
  const [scope, setScope] = useState<Scope | null>(null);

  useEffect(() => {
    const b = org.data?.[0];
    if (!scope && b) setScope({ batId: b.id, kpId: null, name: b.name });
  }, [org.data, scope]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold">{t('nav.templates')}</h1>
          <p className="text-sm text-slate-600">
            {t('tpl.intro')}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-[16rem,1fr]">
          <Card title={t('nav.organisation')}>
            {!org.data?.length ? (
              <Empty>{t('tpl.noBat')}</Empty>
            ) : (
              <ul className="space-y-3 text-sm">
                {org.data.map((b) => (
                  <li key={b.id}>
                    <ScopeButton active={scope?.batId === b.id && scope.kpId === null} label={b.name} source={b.source} own={b.source === 'BAT'} onClick={() => setScope({ batId: b.id, kpId: null, name: b.name })} />
                    <ul className="ml-3 mt-1 space-y-1 border-l border-slate-200 pl-2">
                      {b.kompanien.map((k) => (
                        <li key={k.id}>
                          <ScopeButton
                            active={scope?.kpId === k.id}
                            label={k.name}
                            source={k.source}
                            own={k.source === 'KP'}
                            onClick={() => setScope({ batId: b.id, kpId: k.id, name: `${k.name} (${b.name})` })}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {scope && (
            <div className="min-w-0 space-y-4">
              {scope.kpId === null && org.data?.find((b) => b.id === scope.batId) && (
                <BatSettings key={scope.batId} bat={org.data.find((b) => b.id === scope.batId)!} />
              )}
              <TemplateEditor key={`${scope.batId}:${scope.kpId}`} scope={scope} />
              {scope.kpId !== null ? <KpCatalogue batId={scope.batId} kpId={scope.kpId} /> : <MaterialOverview batId={scope.batId} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScopeButton({ active, label, source, own, onClick }: { active: boolean; label: string; source: TemplateScope; own: boolean; onClick: () => void }) {
  const { t } = useT();
  return (
    <button
      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left ${active ? 'bg-blue-50 font-semibold text-zs-blue' : 'hover:bg-slate-50'}`}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      <span className={`shrink-0 rounded px-1.5 text-[10px] ${own ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
        {t(`tpl.source.${source}`)}
      </span>
    </button>
  );
}

function TemplateEditor({ scope }: { scope: Scope }) {
  const { t } = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['template', scope.batId, scope.kpId], queryFn: () => api.template(scope.batId, scope.kpId) });
  const [items, setItems] = useState<TemplateItem[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const isKp = scope.kpId !== null;
  // The scope has its own template when the effective source matches it.
  const own = q.data ? (isKp ? q.data.source === 'KP' : q.data.source === 'BAT') : false;

  useEffect(() => {
    if (q.data && !dirty) setItems(q.data.items);
  }, [q.data, dirty]);

  if (!q.data || !items) return <div className="text-slate-500">{t('common.loading')}</div>;
  const editing = own || dirty;
  const update = (i: number, patch: Partial<TemplateItem>) => {
    setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setItems(next);
    setDirty(true);
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['template'] });
    qc.invalidateQueries({ queryKey: ['admin-org'] });
  };
  const save = async () => {
    try {
      await api.saveTemplate(scope.batId, scope.kpId, items.filter((x) => x.title.trim()));
      setDirty(false);
      refresh();
      toast(t('tpl.saved'));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const reset = async () => {
    if (!confirm(isKp ? t('tpl.confirmDeleteKp') : t('tpl.confirmDeleteBat'))) return;
    try {
      await api.deleteTemplate(scope.batId, scope.kpId);
      setDirty(false);
      refresh();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const inherited = isKp ? t('tpl.inheritedKp') : t('tpl.inheritedBat');
  const exportFile = (format: 'xlsx' | 'json') =>
    exportTable(
      `Vorbereitung_${scope.name.replace(/[^\wäöüÄÖÜ]+/g, '_')}`,
      'WK-Planer Vorbereitung',
      TEMPLATE_COLUMNS,
      items.map((it) => ({ titel: it.title, beschreibung: it.description, rolle: ROLE_LABEL[it.ownerRole], tageVorWk: String(it.daysBefore) })),
      format,
    );
  const importFile = async (file: File) => {
    const rows = await importTable(file, TEMPLATE_COLUMNS);
    const parsed: TemplateItem[] = [];
    const skipped: string[] = [];
    for (const r of rows) {
      const role = roleOf(r.rolle);
      const days = Number(r.tageVorWk);
      if (!r.titel || !role || !Number.isFinite(days)) skipped.push(r.titel || '(ohne Titel)');
      else parsed.push({ title: r.titel, description: r.beschreibung ?? '', ownerRole: role, daysBefore: Math.round(days) });
    }
    const replace = confirm(t('tpl.confirmReplace', { n: parsed.length }));
    setItems(replace ? parsed : [...items, ...parsed]);
    setDirty(true);
    return t('tpl.imported', { n: parsed.length }) + (skipped.length ? t('tpl.skipped', { n: skipped.length }) : '');
  };
  return (
    <Card
      title={scope.name}
      actions={
        <>
          <ImportExportMenu onExport={exportFile} onImport={importFile} />
          {own && !dirty && (
            <Button variant="ghost" className="text-xs" onClick={reset}>
              {isKp ? t('tpl.useBat') : t('tpl.useStandard')}
            </Button>
          )}
          {dirty && (
            <Button
              onClick={() => {
                setDirty(false);
                setItems(q.data!.items);
              }}
            >
              {t('tpl.discard')}
            </Button>
          )}
          {editing && (
            <Button variant="primary" disabled={!dirty} onClick={save}>
              {t('common.save')}
            </Button>
          )}
        </>
      }
    >
      {!editing && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <span className="flex-1">{inherited}</span>
          <Button onClick={() => setDirty(true)}>{isKp ? t('tpl.createKp') : t('tpl.adaptBat')}</Button>
        </div>
      )}
      <div className="mb-2 flex flex-wrap gap-1 text-xs">
        {PLANNING_ROLES.map((r) => (
          <span key={r} className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
            {ROLE_LABEL[r]}: {items.filter((x) => x.ownerRole === r).length}
          </span>
        ))}
      </div>
      <ol className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="rounded-md border border-slate-200 p-2">
            {editing ? (
              <div className="grid gap-2 sm:grid-cols-[1fr,10rem,7rem,auto]">
                <input className="input" value={it.title} onChange={(e) => update(i, { title: e.target.value })} placeholder={t('tpl.step')} aria-label={t('common.title')} />
                <select className="input" value={it.ownerRole} onChange={(e) => update(i, { ownerRole: e.target.value as Role })} aria-label={t('profile.role')}>
                  {PLANNING_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`role.${r}`)}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-slate-500" title={t('tpl.daysHint')}>
                  <input className="input !w-20" type="number" value={it.daysBefore} onChange={(e) => update(i, { daysBefore: Number(e.target.value) })} aria-label={t('tpl.daysBefore')} />
                  {t('tpl.days')}
                </label>
                <div className="flex items-center gap-1">
                  <button className="px-1 text-slate-400 hover:text-slate-800 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('tpl.up')}>
                    ↑
                  </button>
                  <button className="px-1 text-slate-400 hover:text-slate-800 disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={t('tpl.down')}>
                    ↓
                  </button>
                  <button
                    className="px-1 text-slate-400 hover:text-red-600"
                    onClick={() => {
                      setItems(items.filter((_, j) => j !== i));
                      setDirty(true);
                    }}
                    aria-label={t('common.remove')}
                  >
                    ✕
                  </button>
                </div>
                <input
                  className="input sm:col-span-4"
                  value={it.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder={t('tpl.descriptionPh')}
                  aria-label={t('tpl.description')}
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-medium">{it.title}</span>
                <span className="text-xs text-slate-500">
                  {ROLE_LABEL[it.ownerRole]} · {it.daysBefore >= 0 ? `${it.daysBefore} Tage vor WK` : `${-it.daysBefore} Tage nach WK-Beginn`}
                </span>
                {it.description && <span className="w-full text-xs text-slate-500">{it.description}</span>}
              </div>
            )}
          </li>
        ))}
      </ol>
      {editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setItems([...items, { title: '', description: '', daysBefore: 30, ownerRole: 'ZFHR' }]);
              setDirty(true);
            }}
          >
            {t('tpl.addStep')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setItems([...items].sort((a, b) => b.daysBefore - a.daysBefore));
              setDirty(true);
            }}
          >
            {t('tpl.sortByDate')}
          </Button>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {t('tpl.footer')}
      </p>
    </Card>
  );
}

function KpCatalogue({ batId, kpId }: { batId: number; kpId: number }) {
  const q = useQuery({ queryKey: ['resources', kpId], queryFn: () => api.resources(kpId) });
  return <Catalogue batId={batId} kpId={kpId} resources={q.data ?? []} />;
}

/** Name of the Bataillon, Region, letterhead and logos of printed documents (corporate design of the canton). */
function BatSettings({ bat }: { bat: AdminBat }) {
  const { t } = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const initial = { name: bat.name, regionName: bat.regionName, logo: bat.logo, kantonLogo: bat.kantonLogo, briefkopf: bat.briefkopf, mapView: bat.mapView };
  // Where the map currently stands (taken over with the button).
  const [shown, setShown] = useState<MapView | null>(bat.mapView);
  const [f, setF] = useState(initial);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const pick = (key: 'logo' | 'kantonLogo', file: File | undefined) => {
    if (!file) return;
    if (file.size > 500_000) return toast(t('bat.logoTooLarge'), 'error');
    const r = new FileReader();
    r.onload = () => setF((x) => ({ ...x, [key]: String(r.result) }));
    r.readAsDataURL(file);
  };
  const setB = (patch: Partial<typeof f.briefkopf>) => setF({ ...f, briefkopf: { ...f.briefkopf, ...patch } });
  const save = async () => {
    try {
      await api.saveBatSettings(bat.id, f);
      qc.invalidateQueries({ queryKey: ['admin-org'] });
      qc.invalidateQueries({ queryKey: ['org'] });
      toast(t('bat.saved'));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const logoField = (key: 'logo' | 'kantonLogo', label: string) => (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {f[key] ? (
          <img src={f[key]!} alt={label} className="max-h-14 max-w-[200px] rounded border border-slate-200 bg-white p-1" />
        ) : (
          <span className="text-sm text-slate-400">{t('bat.noLogo')}</span>
        )}
        <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {t('bat.pickImage')}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" onChange={(e) => pick(key, e.target.files?.[0])} />
        </label>
        {f[key] && (
          <Button variant="ghost" onClick={() => setF({ ...f, [key]: null })}>
            {t('common.remove')}
          </Button>
        )}
      </div>
    </div>
  );
  return (
    <Card
      title={t('bat.title')}
      actions={
        <Button variant="primary" disabled={!dirty || !f.name.trim()} onClick={save}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('bat.name')}>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t('bat.region')}>
          <input className="input" value={f.regionName} onChange={(e) => setF({ ...f, regionName: e.target.value })} placeholder={t('bat.regionPh')} />
        </Field>
        <Field label={t('bat.line1')}>
          <input className="input" value={f.briefkopf.amt} onChange={(e) => setB({ amt: e.target.value })} placeholder={t('bat.line1Ph')} />
        </Field>
        <Field label={t('bat.line2')}>
          <input className="input" value={f.briefkopf.abteilung} onChange={(e) => setB({ abteilung: e.target.value })} placeholder={t('bat.line2Ph')} />
        </Field>
        <Field label={t('bat.address')} className="sm:col-span-2">
          <input className="input" value={f.briefkopf.adresse} onChange={(e) => setB({ adresse: e.target.value })} placeholder={t('bat.addressPh')} />
        </Field>
        <Field label={t('bat.phone')}>
          <input className="input" value={f.briefkopf.telefon} onChange={(e) => setB({ telefon: e.target.value })} placeholder="T +41 00 000 00 00" />
        </Field>
        <Field label={t('bat.web')}>
          <input className="input" value={f.briefkopf.web} onChange={(e) => setB({ web: e.target.value })} placeholder="zivilschutz.example.ch" />
        </Field>
        {logoField('kantonLogo', t('bat.kantonLogo'))}
        {logoField('logo', t('bat.regionLogo'))}
      </div>
      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        <span className="label">{t('bat.mapView')}</span>
        <p className="text-xs text-slate-500">
          Hier öffnen sich alle Karten (Gelände, Ressourcen, Erkundungen, Übungen), solange noch keine Fläche eingezeichnet ist.
          {t('bat.mapHint')}
        </p>
        <SwissMap view={bat.mapView} onViewChange={setShown} height={260} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button disabled={!shown} onClick={() => shown && setF({ ...f, mapView: shown })}>
            {t('bat.takeView')}
          </Button>
          {f.mapView && (
            <Button variant="ghost" onClick={() => setF({ ...f, mapView: null })}>
              Zurücksetzen (ganze Schweiz)
            </Button>
          )}
          <span className="text-slate-500">
            {f.mapView ? t('bat.chosen', { lat: f.mapView.lat.toFixed(4), lon: f.mapView.lon.toFixed(4), zoom: f.mapView.zoom }) : t('bat.noView')}
          </span>
        </div>
      </div>
    </Card>
  );
}

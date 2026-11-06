import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Area, MapView, SitePoint } from '@shared/types';
import { Button } from './ui';
import { useBataillon } from './Briefkopf';
import { useT } from '../i18n';
import { currentT } from '../lib/lang';

// swisstopo WMTS in Web Mercator (free use with attribution, see geo.admin.ch terms).
const WMTS = (layer: string, ext: string) => `https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/{z}/{x}/{y}.${ext}`;
const ATTRIBUTION = '© <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noreferrer">swisstopo</a>';
const SWITZERLAND: L.LatLngBoundsExpression = [
  [45.8, 5.9],
  [47.85, 10.5],
];

export interface MapShape {
  area?: Area | null;
  /** Named points of the shape (e.g. of a site). */
  points?: SitePoint[];
  color: string;
  label: string;
  /** The map opens zoomed to the focused shapes (else to all of them). */
  focus?: boolean;
}

type Tool = 'select' | 'area' | 'point';
type Selection = { kind: 'vertex' | 'point'; i: number } | null;

interface Props {
  shapes?: MapShape[];
  /** Polygon being edited; drawing is enabled when onChange is given. */
  value?: Area | null;
  onChange?: (a: Area | null) => void;
  /** Named points being edited; setting them is enabled when onPointsChange is given. */
  points?: SitePoint[];
  onPointsChange?: (p: SitePoint[]) => void;
  height?: number;
  /** Start view without content; default: the map view of the Bataillon, else all of Switzerland. */
  view?: MapView | null;
  /** Reports centre and zoom after each move (e.g. to save it as default). */
  onViewChange?: (v: MapView) => void;
}

const EDIT = '#f97316';
const NO_SHAPES: MapShape[] = [];
const NO_POINTS: SitePoint[] = [];
const FIT = { padding: [30, 30] as L.PointExpression, maxZoom: 17 };

/** What the map opens on: the edited site, else the focused shapes, else all shapes. */
function contentOf(value: Area | null, points: SitePoint[], shapes: MapShape[]): L.LatLngExpression[] {
  const own: L.LatLngExpression[] = [...(value ?? []), ...points.map((p) => [p.lat, p.lng] as [number, number])];
  if (own.length) return own;
  const of = (list: MapShape[]) => list.flatMap((s) => [...(s.area ?? []), ...(s.points ?? []).map((p) => [p.lat, p.lng] as [number, number])]);
  const focused = of(shapes.filter((s) => s.focus));
  return focused.length ? focused : of(shapes);
}

const dot = (size: number, style: string, text = '') =>
  L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="box-sizing:border-box;width:${size}px;height:${size}px;border-radius:9999px;display:grid;place-items:center;font:600 10px/1 system-ui,sans-serif;${style}">${text}</div>`,
  });
const pinIcon = (n: number, selected: boolean) =>
  dot(selected ? 26 : 22, `background:${selected ? EDIT : '#1e3a8a'};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgb(0 0 0/.4)`, String(n));
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function SwissMap({ shapes = NO_SHAPES, value = null, onChange, points = NO_POINTS, onPointsChange, height = 360, view, onViewChange }: Props) {
  const { t } = useT();
  const batView = useBataillon()?.mapView ?? null;
  const start = view !== undefined ? view : batView;
  const onViewRef = useRef(onViewChange);
  onViewRef.current = onViewChange;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const shapeLayer = useRef<L.LayerGroup | null>(null);
  const editLayer = useRef<L.LayerGroup | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onPointsRef = useRef(onPointsChange);
  onPointsRef.current = onPointsChange;
  const editable = !!onChange || !!onPointsChange;
  // An existing site opens for moving its corners; a new one for drawing.
  const [tool, setTool] = useState<Tool>(onChange && (value?.length ?? 0) < 3 && !points.length ? 'area' : 'select');
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [sel, setSel] = useState<Selection>(null);
  // Zoom to the content once it is known (shapes often arrive after the map is created).
  const fitted = useRef<L.LatLngBounds | null>(null);
  // The default view was applied (it may arrive after the map is created, too).
  const placed = useRef(false);
  // The user moved or zoomed the map: keep their view when the container is resized.
  const touched = useRef(false);

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: true, attributionControl: true });
    const karte = L.tileLayer(WMTS('ch.swisstopo.pixelkarte-farbe', 'jpeg'), { attribution: ATTRIBUTION, maxNativeZoom: 18, maxZoom: 20 });
    const luftbild = L.tileLayer(WMTS('ch.swisstopo.swissimage', 'jpeg'), { attribution: ATTRIBUTION, maxNativeZoom: 20, maxZoom: 20 });
    karte.addTo(m);
    L.control.layers({ [currentT('map.topo')]: karte, [currentT('map.aerial')]: luftbild }, {}, { position: 'topright' }).addTo(m);
    shapeLayer.current = L.layerGroup().addTo(m);
    editLayer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      const at: [number, number] = [round(e.latlng.lat), round(e.latlng.lng)];
      if (toolRef.current === 'area' && onChangeRef.current) {
        const next = [...(valueRef.current ?? []), at];
        onChangeRef.current(next);
        setSel({ kind: 'vertex', i: next.length - 1 });
      } else if (toolRef.current === 'point' && onPointsRef.current) {
        const next = [...pointsRef.current, { lat: at[0], lng: at[1], label: '' }];
        onPointsRef.current(next);
        setSel({ kind: 'point', i: next.length - 1 });
      } else setSel(null);
    });
    m.on('moveend', () => {
      const c = m.getCenter();
      onViewRef.current?.({ lat: round(c.lat), lon: round(c.lng), zoom: m.getZoom() });
    });
    const all = contentOf(valueRef.current, pointsRef.current, shapes);
    if (all.length) {
      fitted.current = L.latLngBounds(all);
      m.fitBounds(fitted.current, FIT);
    } else if (start) {
      m.setView([start.lat, start.lon], start.zoom);
      placed.current = true;
    } else m.fitBounds(SWITZERLAND);
    map.current = m;
    // In a dialog the map may be laid out after it was created: fit again to the real size.
    const container = el.current!;
    const mark = () => (touched.current = true);
    container.addEventListener('pointerdown', mark);
    container.addEventListener('wheel', mark, { passive: true });
    const ro = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      m.invalidateSize();
      if (fitted.current && !touched.current) m.fitBounds(fitted.current, FIT);
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      container.removeEventListener('pointerdown', mark);
      container.removeEventListener('wheel', mark);
      m.remove();
      map.current = null;
    };
    // The map is created once; shapes and value are synced below.
  }, []);

  useEffect(() => {
    const g = shapeLayer.current;
    if (!g) return;
    g.clearLayers();
    for (const s of shapes) {
      if (s.area?.length) {
        L.polygon(s.area, { color: s.color, weight: s.focus ? 3 : 2, fillOpacity: s.focus ? 0.3 : 0.2 }).bindTooltip(escapeHtml(s.label), { sticky: true }).addTo(g);
      }
      (s.points ?? []).forEach((p, i) => {
        const tip = escapeHtml(p.label ? `${s.label}: ${p.label}` : s.label);
        // The points of a focused shape are numbered (as in a list next to the map).
        const marker = s.focus
          ? L.marker([p.lat, p.lng], { icon: dot(20, `background:${s.color};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgb(0 0 0/.4)`, String(i + 1)), keyboard: false })
          : L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 2, fillColor: s.color, fillOpacity: 1 });
        marker.bindTooltip(tip).addTo(g);
      });
    }
  }, [shapes]);

  // Content that arrives after the map was created (e.g. loaded resources).
  const hasContent = contentOf(value, points, shapes).length > 0;
  useEffect(() => {
    if (fitted.current || !map.current || !hasContent) return;
    fitted.current = L.latLngBounds(contentOf(valueRef.current, pointsRef.current, shapes));
    map.current.fitBounds(fitted.current, FIT);
  }, [hasContent, shapes]);

  // A newly focused shape (e.g. another site chosen in a request): zoom to it.
  const focused = shapes.filter((s) => s.focus);
  const focusKey = JSON.stringify(focused.map((s) => [s.area, s.points]));
  const lastFocus = useRef(focusKey);
  useEffect(() => {
    if (focusKey === lastFocus.current) return;
    lastFocus.current = focusKey;
    const content = contentOf(null, [], focused);
    if (!map.current || !content.length) return;
    fitted.current = L.latLngBounds(content);
    touched.current = false;
    map.current.fitBounds(fitted.current, FIT);
  }, [focusKey]);

  useEffect(() => {
    if (!map.current || fitted.current || placed.current || !start) return;
    map.current.setView([start.lat, start.lon], start.zoom);
    placed.current = true;
  }, [start]);

  useEffect(() => {
    const g = editLayer.current;
    if (!g) return;
    g.clearLayers();
    const area = value ?? [];
    const style = { color: EDIT, weight: 3 };
    const outline = area.length >= 3 ? L.polygon(area, { ...style, fillOpacity: 0.3, bubblingMouseEvents: true }) : L.polyline(area, style);
    if (area.length) outline.addTo(g);
    const ll = (p: L.LatLng): [number, number] => [round(p.lat), round(p.lng)];
    if (onChange) {
      area.forEach((p, i) => {
        const selected = sel?.kind === 'vertex' && sel.i === i;
        const m = L.marker(p, {
          draggable: true,
          keyboard: true,
          title: t('site.vertexN', { n: i + 1 }),
          icon: dot(selected ? 18 : 14, `background:${selected ? EDIT : '#fff'};border:2px solid ${EDIT}`),
        }).addTo(g);
        m.on('click', () => setSel({ kind: 'vertex', i }));
        m.on('drag', () => outline.setLatLngs(area.map((q, j) => (j === i ? m.getLatLng() : q))));
        m.on('dragend', () => {
          onChange(area.map((q, j) => (j === i ? ll(m.getLatLng()) : q)));
          setSel({ kind: 'vertex', i });
        });
      });
      // Handles between the corners insert a new corner (tap or drag).
      const n = area.length >= 3 ? area.length : area.length - 1;
      for (let i = 0; i < n; i++) {
        const a = area[i];
        const b = area[(i + 1) % area.length];
        const mid: [number, number] = [round((a[0] + b[0]) / 2), round((a[1] + b[1]) / 2)];
        const h = L.marker(mid, {
          draggable: true,
          title: t('site.insertVertex'),
          icon: dot(12, `background:rgb(255 255 255/.75);border:1.5px solid ${EDIT}`),
          zIndexOffset: -100,
        }).addTo(g);
        const insert = (at: [number, number]) => [...area.slice(0, i + 1), at, ...area.slice(i + 1)];
        h.on('click', () => {
          onChange(insert(mid));
          setSel({ kind: 'vertex', i: i + 1 });
        });
        h.on('drag', () => outline.setLatLngs(insert([h.getLatLng().lat, h.getLatLng().lng])));
        h.on('dragend', () => {
          onChange(insert(ll(h.getLatLng())));
          setSel({ kind: 'vertex', i: i + 1 });
        });
      }
    }
    points.forEach((p, i) => {
      const selected = sel?.kind === 'point' && sel.i === i;
      const m = L.marker([p.lat, p.lng], {
        draggable: !!onPointsChange,
        keyboard: true,
        title: p.label || t('site.pointN', { n: i + 1 }),
        icon: pinIcon(i + 1, selected),
        zIndexOffset: 200,
      }).addTo(g);
      if (p.label) m.bindTooltip(escapeHtml(p.label), { direction: 'top', offset: [0, -12] });
      if (!onPointsChange) return;
      m.on('click', () => setSel({ kind: 'point', i }));
      m.on('dragend', () => {
        const at = ll(m.getLatLng());
        onPointsChange(points.map((q, j) => (j === i ? { ...q, lat: at[0], lng: at[1] } : q)));
        setSel({ kind: 'point', i });
      });
    });
  }, [value, onChange, points, onPointsChange, sel, t]);

  const deleteVertex = () => {
    if (!onChange || sel?.kind !== 'vertex' || !value) return;
    const next = value.filter((_, j) => j !== sel.i);
    onChange(next.length ? next : null);
    setSel(null);
  };
  const deletePoint = (i: number) => {
    onPointsChange?.(points.filter((_, j) => j !== i));
    setSel(null);
  };
  const vertexSelected = sel?.kind === 'vertex' && !!value && sel.i < value.length;

  return (
    <div className="space-y-2">
      <PlaceSearch onPick={(lat, lon) => map.current?.setView([lat, lon], 16)} />
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-slate-300 p-0.5" role="radiogroup" aria-label={t('site.tools')}>
            {(['select', ...(onChange ? ['area'] : []), ...(onPointsChange ? ['point'] : [])] as Tool[]).map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={tool === x}
                className={`rounded px-2.5 py-1 text-xs font-medium ${tool === x ? 'bg-zs-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => setTool(x)}
              >
                {x === 'select' ? t('site.toolSelect') : x === 'area' ? t('site.toolArea') : t('site.toolPoint')}
              </button>
            ))}
          </div>
          {onChange && (
            <>
              <Button variant="ghost" className="text-xs" disabled={!vertexSelected} onClick={deleteVertex}>
                {t('site.deleteVertex')}
              </Button>
              <Button variant="ghost" className="text-xs" disabled={!value?.length} onClick={() => onChange(value && value.length > 1 ? value.slice(0, -1) : null)}>
                {t('site.removeLastVertex')}
              </Button>
              <Button
                variant="ghost"
                className="text-xs"
                disabled={!value?.length}
                onClick={() => {
                  onChange(null);
                  setSel(null);
                  setTool('area');
                }}
              >
                {t('map.deleteArea')}
              </Button>
            </>
          )}
        </div>
      )}
      {/* Leaflet owns the classes of the map element: the cursor of the tool is set on a wrapper. */}
      <div className={tool !== 'select' && editable ? '[&_.leaflet-container]:cursor-crosshair' : ''}>
        <div
          ref={el}
          tabIndex={editable ? 0 : undefined}
          onKeyDown={(e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && sel && (e.target as HTMLElement).tagName !== 'INPUT') {
              e.preventDefault();
              if (sel.kind === 'vertex') deleteVertex();
              else deletePoint(sel.i);
            }
          }}
          className="z-0 w-full overflow-hidden rounded-md border border-slate-300"
          style={{ height }}
        />
      </div>
      {editable && <p className="text-xs text-slate-600">{tool === 'area' ? t('site.hintArea') : tool === 'point' ? t('site.hintPoint') : t('site.hintSelect')}</p>}
      {onPointsChange && points.length > 0 && (
        <div className="space-y-1">
          <div className="label">{t('site.points')}</div>
          <ul className="space-y-1">
            {points.map((p, i) => (
              <li key={i} className={`flex items-center gap-2 rounded-md px-1 py-0.5 ${sel?.kind === 'point' && sel.i === i ? 'bg-orange-50' : ''}`}>
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#1e3a8a] text-[10px] font-semibold text-white">{i + 1}</span>
                <input
                  className="input min-w-0 flex-1 !py-1 text-sm"
                  value={p.label}
                  maxLength={80}
                  aria-label={t('site.pointN', { n: i + 1 })}
                  placeholder={t('site.pointLabelPh')}
                  onFocus={() => setSel({ kind: 'point', i })}
                  onChange={(e) => onPointsChange(points.map((q, j) => (j === i ? { ...q, label: e.target.value } : q)))}
                />
                <Button variant="ghost" className="shrink-0 text-xs" aria-label={t('site.deletePoint')} title={t('site.deletePoint')} onClick={() => deletePoint(i)}>
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Location search via the public geo.admin.ch SearchServer. */
function PlaceSearch({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ label: string; lat: number; lon: number }[]>([]);
  // The name of the place just picked: no new search for it.
  const picked = useRef('');

  useEffect(() => {
    if (q.trim().length < 3 || q === picked.current) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const url = `https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&sr=4326&limit=6&searchText=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: ctrl.signal });
        const data = await res.json();
        setResults(
          (data.results ?? []).map((r: any) => ({
            label: String(r.attrs.label).replace(/<[^>]+>/g, ''),
            lat: r.attrs.lat,
            lon: r.attrs.lon,
          })),
        );
      } catch {
        /* offline or aborted */
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="relative">
      <input className="input" placeholder={t('map.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left hover:bg-slate-50"
                onClick={() => {
                  onPick(r.lat, r.lon);
                  picked.current = r.label;
                  setResults([]);
                  setQ(r.label);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

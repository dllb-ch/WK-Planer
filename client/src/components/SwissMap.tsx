import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Area, MapView } from '@shared/types';
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
  area: Area;
  color: string;
  label: string;
}

interface Props {
  shapes?: MapShape[];
  /** Polygon being edited; drawing is enabled when onChange is given. */
  value?: Area | null;
  onChange?: (a: Area | null) => void;
  height?: number;
  /** Start view without content; default: the map view of the Bataillon, else all of Switzerland. */
  view?: MapView | null;
  /** Reports centre and zoom after each move (e.g. to save it as default). */
  onViewChange?: (v: MapView) => void;
}

export function SwissMap({ shapes = [], value = null, onChange, height = 360, view, onViewChange }: Props) {
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
  // Zoom to the content once it is known (shapes often arrive after the map is created).
  const fitted = useRef(false);
  // The default view was applied (it may arrive after the map is created, too).
  const placed = useRef(false);

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: true, attributionControl: true });
    const karte = L.tileLayer(WMTS('ch.swisstopo.pixelkarte-farbe', 'jpeg'), { attribution: ATTRIBUTION, maxNativeZoom: 18, maxZoom: 20 });
    const luftbild = L.tileLayer(WMTS('ch.swisstopo.swissimage', 'jpeg'), { attribution: ATTRIBUTION, maxNativeZoom: 20, maxZoom: 20 });
    karte.addTo(m);
    L.control.layers({ [currentT('map.topo')]: karte, [currentT('map.aerial')]: luftbild }, {}, { position: 'topright' }).addTo(m);
    shapeLayer.current = L.layerGroup().addTo(m);
    editLayer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (!onChangeRef.current) return;
      onChangeRef.current([...(valueRef.current ?? []), [round(e.latlng.lat), round(e.latlng.lng)]]);
    });
    m.on('moveend', () => {
      const c = m.getCenter();
      onViewRef.current?.({ lat: round(c.lat), lon: round(c.lng), zoom: m.getZoom() });
    });
    const all = [...(valueRef.current ?? []), ...shapes.flatMap((s) => s.area)];
    if (all.length) {
      m.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 17 });
      fitted.current = true;
    } else if (start) {
      m.setView([start.lat, start.lon], start.zoom);
      placed.current = true;
    } else m.fitBounds(SWITZERLAND);
    map.current = m;
    return () => {
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
      L.polygon(s.area, { color: s.color, weight: 2, fillOpacity: 0.2 }).bindTooltip(s.label, { sticky: true }).addTo(g);
    }
    if (!fitted.current && shapes.length && map.current) {
      map.current.fitBounds(L.latLngBounds(shapes.flatMap((s) => s.area)), { padding: [30, 30], maxZoom: 17 });
      fitted.current = true;
    }
  }, [shapes]);

  useEffect(() => {
    if (!map.current || fitted.current || placed.current || !start) return;
    map.current.setView([start.lat, start.lon], start.zoom);
    placed.current = true;
  }, [start]);

  useEffect(() => {
    const g = editLayer.current;
    if (!g) return;
    g.clearLayers();
    if (!value?.length) return;
    const style = { color: '#f97316', weight: 3 };
    if (value.length >= 3) L.polygon(value, { ...style, fillOpacity: 0.3 }).addTo(g);
    else L.polyline(value, style).addTo(g);
    if (onChange) for (const p of value) L.circleMarker(p, { radius: 4, color: '#f97316', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(g);
  }, [value, onChange]);

  return (
    <div className="space-y-2">
      <PlaceSearch onPick={(lat, lon) => map.current?.setView([lat, lon], 16)} />
      <div ref={el} className="z-0 w-full overflow-hidden rounded-md border border-slate-300" style={{ height }} />
      {onChange && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="flex-1">{t('map.drawHint')}</span>
          <Button variant="ghost" className="text-xs" disabled={!value?.length} onClick={() => onChange(value && value.length > 1 ? value.slice(0, -1) : null)}>
            {t('map.removeLast')}
          </Button>
          <Button variant="ghost" className="text-xs" disabled={!value?.length} onClick={() => onChange(null)}>
            {t('map.deleteArea')}
          </Button>
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

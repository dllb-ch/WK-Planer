import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CheckInDay } from '@shared/types';
import { fmtDate, weekday } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { Briefkopf, usePrintPage } from '../../components/Briefkopf';
import { Button, Card, Empty, errMsg, useToast } from '../../components/ui';

const MODE_LABEL: Record<CheckInDay['mode'], string> = {
  AUTO: 'Nur an diesem Tag offen',
  OPEN: 'Offen',
  CLOSED: 'Geschlossen',
};

export const checkinUrl = (token: string) => `${location.origin}/checkin/${token}`;

export function useQr(text: string) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode').then((QR) => QR.toDataURL(text, { width: 600, margin: 1, errorCorrectionLevel: 'M' }).then((url) => alive && setSrc(url)));
    return () => {
      alive = false;
    };
  }, [text]);
  return src;
}

/** One QR code per WK day; people scan it in the morning and check in. */
export function QrCodes({ detail }: { detail: WkDetail }) {
  const { wk } = detail;
  const q = useQuery({ queryKey: ['checkin-days', wk.id], queryFn: () => api.checkinDays(wk.id) });
  const [printing, setPrinting] = useState<string | null>(null);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

  useEffect(() => {
    if (!printing) return;
    // Wait for the QR image before printing.
    const t = setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 400);
    return () => clearTimeout(t);
  }, [printing]);

  return (
    <>
      <Card title="QR-Codes für den Check-in" className="no-print">
        <p className="mb-2 text-sm text-slate-600">
          Pro Tag ein Code: aushängen oder beim Appell zeigen. Die Personen geben Name, E-Mail, Zug und Essen an und werden mit der Teilnehmerliste
          abgeglichen. Wer nicht eindeutig gefunden wird, erscheint unter «Präsenz» zum Zuordnen.
        </p>
        {local && (
          <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Der Planer läuft unter <b>{location.host}</b>. Handys können diese Adresse nicht öffnen – für den Check-in muss er unter einer im Netzwerk
            oder Internet erreichbaren Adresse laufen.
          </p>
        )}
        {q.isLoading ? (
          <Empty>Laden …</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(q.data ?? []).map((d) => (
              <DayQr key={d.date} wkId={wk.id} day={d} avor={wk.avorDays.includes(d.date)} onPrint={() => setPrinting(d.date)} />
            ))}
          </div>
        )}
      </Card>
      {printing && q.data && <PrintSheet detail={detail} day={q.data.find((d) => d.date === printing)!} />}
    </>
  );
}

function DayQr({ wkId, day, avor, onPrint }: { wkId: number; day: CheckInDay; avor: boolean; onPrint: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const url = checkinUrl(day.token);
  const src = useQr(url);
  const update = async (b: { mode?: CheckInDay['mode']; renew?: boolean }) => {
    try {
      await api.updateCheckinDay(wkId, day.date, b);
      qc.invalidateQueries({ queryKey: ['checkin-days', wkId] });
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-baseline justify-between">
        <b>
          {weekday(day.date)}, {fmtDate(day.date)}
        </b>
        {avor && <span className="text-xs text-slate-500">AVOR</span>}
      </div>
      {src ? <img src={src} alt={`QR-Code ${fmtDate(day.date)}`} className="mx-auto w-40" /> : <div className="h-40" />}
      <select className="input" value={day.mode} onChange={(e) => update({ mode: e.target.value as CheckInDay['mode'] })} aria-label="Check-in offen">
        {(Object.keys(MODE_LABEL) as CheckInDay['mode'][]).map((m) => (
          <option key={m} value={m}>
            {MODE_LABEL[m]}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-1.5">
        <Button onClick={onPrint}>Drucken</Button>
        <Button
          onClick={() =>
            navigator.clipboard?.writeText(url).then(
              () => toast('Link kopiert'),
              () => toast(url),
            )
          }
        >
          Link kopieren
        </Button>
        <Button variant="ghost" onClick={() => confirm('Neuen Code erzeugen? Der bisherige Code wird ungültig.') && update({ renew: true })}>
          Neuer Code
        </Button>
      </div>
    </div>
  );
}

/** A4 sheet to put up at the entrance. */
function PrintSheet({ detail, day }: { detail: WkDetail; day: CheckInDay }) {
  return (
    <div className="print-only">
      <QrSheetContent wkTitle={detail.wk.title} day={day} />
    </div>
  );
}

/** Letterhead, title, day and the code; also used as a page of the Dossier. */
export function QrSheetContent({ wkTitle, day }: { wkTitle: string; day: CheckInDay }) {
  const src = useQr(checkinUrl(day.token));
  return (
    <div className="text-center">
      <div className="text-left">
        <Briefkopf />
      </div>
      <h1 className="mt-10 text-3xl font-bold">Check-in {wkTitle}</h1>
      <p className="mt-2 text-2xl">
        {weekday(day.date)}, {fmtDate(day.date)}
      </p>
      {src && <img src={src} alt="" className="mx-auto mt-10 w-[120mm]" />}
      <p className="mt-8 text-lg">Code mit der Handy-Kamera scannen und Angaben ausfüllen.</p>
      <p className="mt-2 text-xs text-slate-500">{checkinUrl(day.token)}</p>
    </div>
  );
}

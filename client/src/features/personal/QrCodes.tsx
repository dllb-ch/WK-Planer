import { useEffect, useState } from 'react';
import { BASE } from '../../lib/base';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CheckInDay } from '@shared/types';
import { fmtDate } from '@shared/util';

const weekday = (d: string) => weekdayIn(currentLang(), d);
import { api, type WkDetail } from '../../api';
import { Briefkopf, usePrintPage } from '../../components/Briefkopf';
import { Button, Card, Empty, errMsg, useToast } from '../../components/ui';
import { useT } from '../../i18n';
import { weekdayIn } from '@shared/i18n';
import { currentLang } from '../../lib/lang';
import type { Key } from '@shared/i18n';

const MODE_LABEL: Record<CheckInDay['mode'], Key> = {
  AUTO: 'qr.mode.AUTO',
  OPEN: 'qr.mode.OPEN',
  CLOSED: 'qr.mode.CLOSED',
};

export const checkinUrl = (token: string) => `${location.origin}${BASE}/checkin/${token}`;

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
  const { t, tn } = useT();
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
      <Card title={t('qr.title')} className="no-print">
        <p className="mb-2 text-sm text-slate-600">
          {t('qr.intro')}
        </p>
        {local && (
          <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {tn('qr.local', { host: <b>{location.host}</b> })}
          </p>
        )}
        {q.isLoading ? (
          <Empty>{t('common.loading')}</Empty>
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
  const { t } = useT();
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
      <select className="input" value={day.mode} onChange={(e) => update({ mode: e.target.value as CheckInDay['mode'] })} aria-label={t('qr.open')}>
        {(Object.keys(MODE_LABEL) as CheckInDay['mode'][]).map((m) => (
          <option key={m} value={m}>
            {t(MODE_LABEL[m])}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-1.5">
        <Button onClick={onPrint}>{t('common.print')}</Button>
        <Button
          onClick={() =>
            navigator.clipboard?.writeText(url).then(
              () => toast(t('qr.copied')),
              () => toast(url),
            )
          }
        >
          {t('qr.copy')}
        </Button>
        <Button variant="ghost" onClick={() => confirm(t('qr.confirmRenew')) && update({ renew: true })}>
          {t('qr.renew')}
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
  const { t } = useT();
  const src = useQr(checkinUrl(day.token));
  return (
    <div className="text-center">
      <div className="text-left">
        <Briefkopf />
      </div>
      <h1 className="mt-10 text-3xl font-bold">{t('qr.sheetTitle', { wk: wkTitle })}</h1>
      <p className="mt-2 text-2xl">
        {weekday(day.date)}, {fmtDate(day.date)}
      </p>
      {src && <img src={src} alt="" className="mx-auto mt-10 w-[120mm]" />}
      <p className="mt-8 text-lg">{t('qr.sheetHint')}</p>
      <p className="mt-2 text-xs text-slate-500">{checkinUrl(day.token)}</p>
    </div>
  );
}

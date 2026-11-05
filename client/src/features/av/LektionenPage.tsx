// Lektionen of a WK: all Ausbildungsvorbereitungen per Zug, and training slots still without one.
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { canCreateAv, canViewAv } from '@shared/permissions';
import { fmtDate, fmtTime, weekday } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Card, Empty } from '../../components/ui';
import { AusbildungCard } from '../../pages/AusbildungenPage';

const TRAINING = ['AUSBILDUNG', 'UEBUNG'];

export function LektionenPage({ detail }: { detail: WkDetail }) {
  const me = useUser();
  const { wk, zuege, blocks } = detail;
  const avs = useQuery({ queryKey: ['avs', wk.id], queryFn: () => api.avs(wk.id) });
  const list = avs.data ?? [];
  // Own Zug first.
  const shown = zuege.filter((z) => canViewAv(me, wk, { zugId: z.id })).sort((a, b) => Number(b.id === me.zugId) - Number(a.id === me.zugId));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
        <p className="text-sm text-slate-600">
          Ausbildungsvorbereitungen (Lektionen) aller Züge dieses WK. Neue Lektionen entstehen in der Zugansicht beim Zeitfenster oder hier bei den offenen
          Ausbildungsblöcken.
        </p>
        {avs.isLoading && <Empty>Laden …</Empty>}
        {shown.map((z) => {
          const own = list
            .filter((a) => a.zugId === z.id)
            .sort((a, b) => (a.datum || '9').localeCompare(b.datum || '9') || a.zeitVon.localeCompare(b.zeitVon));
          const open = blocks
            .filter((b) => b.zugIds.includes(z.id) && TRAINING.includes(b.type) && !list.some((a) => a.blockId === b.id && a.zugId === z.id))
            .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
          const create = canCreateAv(me, wk, z.id);
          return (
            <Card key={z.id} title={`${z.name} (${own.length} Lektionen)`}>
              {own.length === 0 ? (
                <Empty>Noch keine Ausbildungsvorbereitungen.</Empty>
              ) : (
                <div className="space-y-2">
                  {own.map((a) => (
                    <AusbildungCard key={a.id} x={{ av: a, wkTitle: wk.title, zugName: z.name, mine: a.leiterUserIds.includes(me.id) || a.createdBy === me.id }} />
                  ))}
                </div>
              )}
              {open.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <div className="label">Ausbildungsblöcke ohne Vorbereitung</div>
                  <ul className="space-y-0.5 text-sm">
                    {open.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center gap-x-3">
                        <span className="w-32 shrink-0 tabular-nums text-slate-500">
                          {weekday(b.date).slice(0, 2)} {fmtDate(b.date).slice(0, 6)} {fmtTime(b.startMin)}
                        </span>
                        <span className="flex-1">{b.title}</span>
                        {create && (
                          <Link to={`../av/neu?block=${b.id}&zug=${z.id}`} className="text-xs text-zs-blue hover:underline">
                            Vorbereitung erstellen →
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// File area per Zug: documents the Zug shares (Einteilungen, Merkblätter, Fotos …). Not tied to one WK.
import { useState } from 'react';
import { canUploadZugFiles, canViewZugFiles } from '@shared/permissions';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Card, Empty } from '../../components/ui';
import { FileArea } from '../../components/FileArea';
import { useT } from '../../i18n';

export function DateienPage({ detail }: { detail: WkDetail }) {
  const { t } = useT();
  const me = useUser();
  const { wk, zuege } = detail;
  const ref = (id: number) => ({ id, kpId: wk.kpId, batId: wk.batId });
  const visible = zuege.filter((z) => canViewZugFiles(me, ref(z.id)));
  // Own Zug first.
  const sorted = [...visible].sort((a, b) => Number(b.id === me.zugId) - Number(a.id === me.zugId));
  const [only, setOnly] = useState<number | ''>(me.zugId && visible.some((z) => z.id === me.zugId) && visible.length > 3 ? me.zugId : '');
  const shown = sorted.filter((z) => only === '' || z.id === only);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">{t('files.title')}</h2>
          {visible.length > 1 && (
            <select className="input !w-auto" value={only} onChange={(e) => setOnly(e.target.value ? Number(e.target.value) : '')} aria-label={t('common.zug')}>
              <option value="">{t('part.allZuege')}</option>
              {visible.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="text-sm text-slate-600">
          {t('files.intro')}
        </p>
        {shown.length === 0 && <Empty>{t('files.noStorage')}</Empty>}
        {shown.map((z) => (
          <Card key={z.id} title={z.name}>
            <FileArea
              queryKey={['zug-files', z.id]}
              load={() => api.zugFiles(z.id)}
              upload={(file, p) => api.uploadZugFile(z.id, file, p)}
              canUpload={canUploadZugFiles(me, ref(z.id))}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

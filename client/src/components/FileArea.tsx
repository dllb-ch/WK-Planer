// List of files with upload (button or drag & drop), download and delete.
import { useState } from 'react';
import { useFileUrl } from '../lib/base';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attachment } from '@shared/types';
import { MAX_UPLOAD_MB } from '@shared/types';
import { api } from '../api';
import { Empty, errMsg, useToast } from './ui';
import { useT } from '../i18n';

export const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const icon = (a: Pick<Attachment, 'mime' | 'name'>) =>
  a.mime === 'application/pdf'
    ? '📕'
    : a.mime.startsWith('image/')
      ? '🖼'
      : a.mime.startsWith('video/')
        ? '🎬'
        : /\.(xlsx?|csv|ods)$/i.test(a.name)
          ? '📊'
          : /\.(pptx?|key|odp)$/i.test(a.name)
            ? '📽'
            : /\.(docx?|odt|rtf|txt)$/i.test(a.name)
              ? '📝'
              : '📄';

const fmtWhen = (s: string) => {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function FileArea({
  queryKey,
  load,
  upload,
  canUpload,
  emptyText,
  compact,
  gallery,
}: {
  queryKey: unknown[];
  load: () => Promise<Attachment[]>;
  upload: (file: File, onProgress: (p: number) => void) => Promise<unknown>;
  canUpload: boolean;
  emptyText?: string;
  compact?: boolean;
  /** Show images as thumbnails (sketches, photos). */
  gallery?: boolean;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey, queryFn: load });
  const [busy, setBusy] = useState<{ name: string; p: number }[]>([]);
  const [over, setOver] = useState(false);

  const send = async (files: FileList | File[]) => {
    const list = [...files];
    const tooBig = list.filter((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    if (tooBig.length) toast(t('files.tooBig', { mb: MAX_UPLOAD_MB, names: tooBig.map((f) => f.name).join(', ') }), 'error');
    const ok = list.filter((f) => !tooBig.includes(f) && f.size > 0);
    for (const f of ok) {
      setBusy((b) => [...b, { name: f.name, p: 0 }]);
      try {
        await upload(f, (p) => setBusy((b) => b.map((x) => (x.name === f.name ? { ...x, p } : x))));
      } catch (e) {
        toast(`${f.name}: ${errMsg(e)}`, 'error');
      } finally {
        setBusy((b) => b.filter((x) => x.name !== f.name));
      }
    }
    if (ok.length) {
      qc.invalidateQueries({ queryKey });
      // Counts shown in lists of Ausbildungsvorbereitungen.
      qc.invalidateQueries({ predicate: (x) => ['avs', 'av', 'library', 'my-ausbildungen'].includes(String(x.queryKey[0])) });
    }
  };
  const remove = async (a: Attachment) => {
    if (!confirm(t('files.confirmDelete', { name: a.name }))) return;
    try {
      await api.deleteAttachment(a.id);
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ predicate: (x) => ['avs', 'av', 'library', 'my-ausbildungen'].includes(String(x.queryKey[0])) });
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const files = q.data ?? [];
  const images = gallery ? files.filter((a) => /^image\/(png|jpeg|gif|webp)$/.test(a.mime)) : [];
  return (
    <div
      className={`space-y-2 rounded-md ${over ? 'bg-blue-50 ring-2 ring-zs-blue' : ''}`}
      onDragOver={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setOver(false);
        send(e.dataTransfer.files);
      }}
    >
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <ImageLink key={a.id} url={api.attachmentUrl(a.id)} name={a.name} />
          ))}
        </div>
      )}
      {q.isLoading ? (
        <Empty>{t('common.loading')}</Empty>
      ) : files.length === 0 && !busy.length ? (
        <p className="text-sm text-slate-400">{emptyText ?? t('files.none')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {files.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
              <span aria-hidden>{icon(a)}</span>
              <FileLink url={api.attachmentUrl(a.id)} className="min-w-0 flex-1 truncate text-zs-blue hover:underline" title={a.name}>
                {a.name}
              </FileLink>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">{fmtSize(a.size)}</span>
              {!compact && (
                <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">
                  {a.uploadedByName} · {fmtWhen(a.uploadedAt)}
                </span>
              )}
              {a.canDelete && (
                <button className="no-print shrink-0 text-slate-400 hover:text-red-600" onClick={() => remove(a)} aria-label={t('files.delete', { name: a.name })}>
                  ✕
                </button>
              )}
            </li>
          ))}
          {busy.map((b) => (
            <li key={b.name} className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-500">
              <span aria-hidden>⏳</span>
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              <span className="h-1.5 w-24 overflow-hidden rounded bg-slate-200">
                <span className="block h-full bg-zs-blue" style={{ width: `${Math.round(b.p * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <label className="no-print flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-zs-blue hover:text-zs-blue">
          {t('files.upload')} <span className="text-xs text-slate-400">{t('files.uploadHint', { mb: MAX_UPLOAD_MB })}</span>
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) send(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}

/** Link to a file of the API (in the demo an object URL, see useFileUrl). */
export function FileLink({ url, className, title, children }: { url: string; className?: string; title?: string; children: React.ReactNode }) {
  const href = useFileUrl(url);
  return (
    <a href={href || undefined} target="_blank" rel="noopener" className={className} title={title}>
      {children}
    </a>
  );
}

function ImageLink({ url, name }: { url: string; name: string }) {
  const src = useFileUrl(url);
  return (
    <a href={src || undefined} target="_blank" rel="noopener" title={name} className="block overflow-hidden rounded border border-slate-200 print:break-inside-avoid">
      {src ? <img src={src} alt={name} className="h-32 w-auto max-w-[16rem] object-cover print:h-56 print:max-w-full" loading="lazy" /> : <div className="h-32 w-32 bg-slate-100" />}
    </a>
  );
}

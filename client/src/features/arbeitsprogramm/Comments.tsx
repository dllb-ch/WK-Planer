import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { useUser } from '../../auth';
import { Button, errMsg, useToast } from '../../components/ui';

/** Comment thread for a WK, optionally limited to one block. */
export function Comments({ wkId, blockId, compact }: { wkId: number; blockId: number | null; compact?: boolean }) {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['comments', wkId], queryFn: () => api.comments(wkId), refetchInterval: 15000 });
  const list = (q.data ?? []).filter((c) => c.blockId === blockId);

  const add = useMutation({
    mutationFn: () => api.addComment(wkId, text, blockId),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['comments', wkId] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteComment(wkId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', wkId] }),
  });

  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-xs text-slate-400">Noch keine Kommentare.</p>}
      <ul className={`space-y-2 ${compact ? 'max-h-56' : 'max-h-96'} overflow-y-auto`}>
        {list.map((c) => (
          <li key={c.id} className="rounded bg-slate-50 px-2.5 py-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-700">{c.userName}</span>
              <span>
                {new Date(c.createdAt.replace(' ', 'T') + 'Z').toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' })}
                {c.userId === me.id && (
                  <button className="ml-2 text-slate-400 hover:text-red-600" onClick={() => del.mutate(c.id)} aria-label="Kommentar löschen">
                    ✕
                  </button>
                )}
              </span>
            </div>
            <p className="whitespace-pre-wrap">{c.text}</p>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={blockId ? 'Kommentar zum Block …' : 'Kommentar zum WK …'} />
        <Button type="submit" variant="primary" disabled={!text.trim() || add.isPending}>
          Senden
        </Button>
      </form>
    </div>
  );
}

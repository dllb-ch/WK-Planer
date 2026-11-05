import { Button, TextArea } from './ui';
import { useT } from '../i18n';

/** Editable list of free-text items (Ziele, Zielsetzungen). */
export function ListEditor({ items, onChange, readOnly, placeholder }: { items: string[]; onChange: (v: string[]) => void; readOnly: boolean; placeholder?: string }) {
  const { t } = useT();
  if (readOnly) {
    return items.length ? (
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {items.map((z, i) => (
          <li key={i} className="whitespace-pre-wrap">
            {z}
          </li>
        ))}
      </ol>
    ) : (
      <p className="text-sm text-slate-400">–</p>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((z, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 w-5 text-right text-sm text-slate-500">{i + 1}.</span>
          <TextArea rows={2} value={z} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="mt-2 text-slate-400 hover:text-red-600" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t('common.remove')}>
            ✕
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => onChange([...items, ''])}>
        {t('list.add')}
      </Button>
    </div>
  );
}

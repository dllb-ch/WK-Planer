// Edits are saved shortly after typing stops; pending changes are saved when leaving the page.
import { useEffect, useRef, useState } from 'react';
import { errMsg, useToast } from './ui';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
export const SAVE_LABEL: Record<SaveState, string> = { saved: 'Gespeichert', dirty: 'Ungespeichert', saving: 'Speichern …', error: 'Nicht gespeichert' };

export function useAutosave<T>(loaded: T | undefined, save: (v: T) => Promise<unknown>, delay = 800) {
  const toast = useToast();
  const [value, setValue] = useState<T | null>(null);
  const [state, setState] = useState<SaveState>('saved');
  const latest = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const saveRef = useRef(save);
  saveRef.current = save;

  // First load, and newer server data while nothing is pending. Callers build `loaded` on every render, so compare content.
  const loadedJson = loaded === undefined ? '' : JSON.stringify(loaded);
  useEffect(() => {
    if (loaded !== undefined && (value === null || state === 'saved')) setValue(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedJson]);

  const run = async (v: T) => {
    setState('saving');
    try {
      await saveRef.current(v);
      if (latest.current === v) {
        latest.current = null;
        setState('saved');
      } else setState('dirty');
    } catch (e) {
      setState('error');
      toast(errMsg(e), 'error');
    }
  };
  const update = (next: T) => {
    setValue(next);
    latest.current = next;
    setState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(next), delay);
  };
  useEffect(() => {
    if (state !== 'dirty' && state !== 'saving') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (latest.current) saveRef.current(latest.current).catch(() => {});
    },
    [],
  );
  /** Throw away pending changes (e.g. before deleting). */
  const discard = () => {
    clearTimeout(timer.current);
    latest.current = null;
  };
  return { value, update, state, discard };
}

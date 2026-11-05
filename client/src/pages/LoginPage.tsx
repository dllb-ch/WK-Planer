import { useState } from 'react';
import { DEMO as IS_DEMO } from '../lib/base';
import { useAuth } from '../auth';
import { Button, errMsg, Field } from '../components/ui';

const DEMO = [
  { email: 'bat@demo.ch', label: 'Bat Kommando' },
  { email: 'kpkdt@demo.ch', label: 'Kp Kdt (Pi Kp)' },
  { email: 'zfhr1@demo.ch', label: 'Zugführer Pi Z 1' },
  { email: 'kader@demo.ch', label: 'Kader (Grfhr Pi Z 1)' },
];

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-zs-blue to-blue-950 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <svg viewBox="0 0 32 32" className="h-10 w-10" aria-hidden>
            <circle cx="16" cy="16" r="15" fill="#f97316" />
            <path d="M16 6 L26 24 H6 Z" fill="#1e3a8a" />
          </svg>
          <div>
            <h1 className="text-lg font-semibold">WK-Planer</h1>
            <p className="text-xs text-slate-500">Planung Wiederholungskurs Zivilschutz</p>
          </div>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <Field label="E-Mail">
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Passwort">
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            Anmelden
          </Button>
        </form>
        {(import.meta.env.DEV || IS_DEMO) && (
          <div className="mt-5 border-t pt-4">
            <p className="mb-2 text-xs text-slate-500">{IS_DEMO ? 'Demo – als Rolle anmelden:' : 'Demo-Konten (Passwort aus README):'}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  className="rounded border px-2 py-1 text-left text-xs hover:bg-slate-50"
                  onClick={() => (IS_DEMO ? login(d.email, 'zivilschutz').catch((e) => setError(errMsg(e))) : setEmail(d.email))}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

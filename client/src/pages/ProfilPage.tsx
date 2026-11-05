// Own account: change e-mail (login) and password.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABEL } from '@shared/types';
import { api } from '../api';
import { useUser } from '../auth';
import { Button, Card, errMsg, Field, useToast } from '../components/ui';

export function ProfilPage() {
  const me = useUser();
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const kp = org.data?.kompanien.find((k) => k.id === me.kpId)?.name;
  const zug = org.data?.zuege.find((z) => z.id === me.zugId)?.name;
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-3 sm:p-6">
      <h1 className="text-xl font-semibold">Mein Konto</h1>
      <Card>
        <dl className="grid grid-cols-[8rem,1fr] gap-y-1 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd>{me.name}</dd>
          <dt className="text-slate-500">Rolle</dt>
          <dd>{ROLE_LABEL[me.role]}</dd>
          {kp && (
            <>
              <dt className="text-slate-500">Kompanie</dt>
              <dd>
                {kp}
                {zug && ` · ${zug}`}
              </dd>
            </>
          )}
          <dt className="text-slate-500">E-Mail (Login)</dt>
          <dd>{me.email}</dd>
        </dl>
        <p className="mt-2 text-xs text-slate-500">Name, Rolle und Einteilung ändern Kp Kdt bzw. Bat Kommando unter «Organisation › Kompanien & Personal».</p>
      </Card>
      <EmailForm />
      <PasswordForm />
    </div>
  );
}

function EmailForm() {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && email.trim().toLowerCase() !== me.email.toLowerCase() && password;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await api.changeEmail(email.trim(), password);
      qc.setQueryData(['me'], u);
      setEmail('');
      setPassword('');
      toast(`E-Mail geändert – ab sofort mit ${u.email} anmelden`);
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="E-Mail-Adresse ändern">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <Field label="Neue E-Mail-Adresse">
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Aktuelles Passwort">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Button variant="primary" type="submit" disabled={!valid || busy}>
            E-Mail speichern
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [f, setF] = useState({ old: '', next: '', repeat: '' });
  const [busy, setBusy] = useState(false);
  const tooShort = f.next.length > 0 && f.next.length < 8;
  const mismatch = f.repeat.length > 0 && f.repeat !== f.next;
  const valid = f.old && f.next.length >= 8 && f.next === f.repeat;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.changePassword(f.old, f.next);
      setF({ old: '', next: '', repeat: '' });
      toast('Passwort geändert – auf anderen Geräten ist eine neue Anmeldung nötig');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Passwort ändern">
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={submit}>
        <Field label="Aktuelles Passwort">
          <input className="input" type="password" autoComplete="current-password" value={f.old} onChange={(e) => setF({ ...f, old: e.target.value })} />
        </Field>
        <Field label="Neues Passwort">
          <input className="input" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </Field>
        <Field label="Neues Passwort wiederholen">
          <input className="input" type="password" autoComplete="new-password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} />
        </Field>
        <div className="space-y-1 sm:col-span-3">
          {tooShort && <p className="text-xs text-red-700">Mindestens 8 Zeichen.</p>}
          {mismatch && <p className="text-xs text-red-700">Die beiden neuen Passwörter stimmen nicht überein.</p>}
          <Button variant="primary" type="submit" disabled={!valid || busy}>
            Passwort ändern
          </Button>
        </div>
      </form>
    </Card>
  );
}

// Own account: change e-mail (login) and password.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useUser } from '../auth';
import { Button, Card, errMsg, Field, useToast } from '../components/ui';
import { LANGS, LANG_NAME, translate, type Lang } from '@shared/i18n';
import { useT } from '../i18n';

export function ProfilPage() {
  const me = useUser();
  const { t } = useT();
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const kp = org.data?.kompanien.find((k) => k.id === me.kpId)?.name;
  const zug = org.data?.zuege.find((z) => z.id === me.zugId)?.name;
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-3 sm:p-6">
      <h1 className="text-xl font-semibold">{t('nav.account')}</h1>
      <Card>
        <dl className="grid grid-cols-[8rem,1fr] gap-y-1 text-sm">
          <dt className="text-slate-500">{t('profile.name')}</dt>
          <dd>{me.name}</dd>
          <dt className="text-slate-500">{t('profile.role')}</dt>
          <dd>{t(`role.${me.role}`)}</dd>
          {kp && (
            <>
              <dt className="text-slate-500">{t('profile.kompanie')}</dt>
              <dd>
                {kp}
                {zug && ` · ${zug}`}
              </dd>
            </>
          )}
          <dt className="text-slate-500">{t('profile.loginEmail')}</dt>
          <dd>{me.email}</dd>
        </dl>
        <p className="mt-2 text-xs text-slate-500">{t('profile.changedBy')}</p>
      </Card>
      <LanguageCard />
      <EmailForm />
      <PasswordForm />
    </div>
  );
}

function EmailForm() {
  const me = useUser();
  const { t } = useT();
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
      toast(t('profile.emailChanged', { email: u.email }));
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t('profile.emailTitle')}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <Field label={t('profile.newEmail')}>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('profile.currentPassword')}>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Button variant="primary" type="submit" disabled={!valid || busy}>
            {t('profile.saveEmail')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const toast = useToast();
  const { t } = useT();
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
      toast(t('profile.passwordChanged'));
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t('profile.passwordTitle')}>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={submit}>
        <Field label={t('profile.currentPassword')}>
          <input className="input" type="password" autoComplete="current-password" value={f.old} onChange={(e) => setF({ ...f, old: e.target.value })} />
        </Field>
        <Field label={t('profile.newPassword')}>
          <input className="input" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </Field>
        <Field label={t('profile.repeatPassword')}>
          <input className="input" type="password" autoComplete="new-password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} />
        </Field>
        <div className="space-y-1 sm:col-span-3">
          {tooShort && <p className="text-xs text-red-700">{t('profile.min8')}</p>}
          {mismatch && <p className="text-xs text-red-700">{t('profile.mismatch')}</p>}
          <Button variant="primary" type="submit" disabled={!valid || busy}>
            {t('profile.passwordTitle')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LanguageCard() {
  const { t, lang, setLang } = useT();
  const toast = useToast();
  const choose = async (l: Lang) => {
    try {
      await setLang(l);
      // The confirmation already in the new language.
      toast(translate(l, 'profile.languageSaved'));
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  return (
    <Card title={t('profile.language')}>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('profile.language')}>
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            onClick={() => choose(l)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${lang === l ? 'bg-zs-blue font-medium text-white' : 'bg-slate-500/10 text-slate-700 hover:bg-slate-500/15'}`}
          >
            {LANG_NAME[l]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">{t('profile.languageHint')}</p>
    </Card>
  );
}

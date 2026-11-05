import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ROLE_LABEL } from '@shared/types';
import { api } from './api';
import { errMsg, useToast } from './components/ui';
import { canViewBefehl, canViewYearPlan } from '@shared/permissions';
import { useAuth, useUser } from './auth';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { WkPage } from './pages/WkPage';
import { BefehlPage } from './pages/BefehlPage';
import { JahresplanungPage } from './pages/JahresplanungPage';
import { AdminPage } from './pages/AdminPage';
import { VorlagenPage } from './pages/VorlagenPage';
import { PwaBanners } from './components/PwaBanners';
import { AusbildungenPage } from './pages/AusbildungenPage';
import { BibliothekPage } from './pages/BibliothekPage';
import { CheckInPage } from './pages/CheckInPage';
import { ProfilPage } from './pages/ProfilPage';

export function App() {
  // The QR check-in works without login.
  if (location.pathname.startsWith('/checkin/')) return <CheckInPage token={decodeURIComponent(location.pathname.slice('/checkin/'.length))} />;
  return <AuthedApp />;
}

function AuthedApp() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Laden …</div>;
  if (!user) return <LoginPage />;
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <PwaBanners />
      <main className="flex min-h-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={user.role === 'ADMIN' ? <Navigate to="/vorlagen" replace /> : <DashboardPage />} />
          <Route path="/vorlagen" element={<VorlagenPage />} />
          <Route path="/ausbildungen" element={<AusbildungenPage />} />
          <Route path="/bibliothek" element={<BibliothekPage />} />
          <Route path="/wk/:id/*" element={<WkPage />} />
          <Route path="/befehl" element={<BefehlPage />} />
          <Route path="/jahresplanung" element={<JahresplanungPage />} />
          <Route path="/verwaltung" element={<AdminPage />} />
          <Route path="/profil" element={<ProfilPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

/** Main menu: single pages, or sections whose pages appear as a second row below the bar. */
type NavItem = { label: string; to: string; end?: boolean; subs?: { label: string; to: string }[] };

function useNav(): NavItem[] {
  const me = useUser();
  const organisation = [
    ...(me.role === 'BAT' || me.role === 'KPKDT' ? [{ label: 'Kompanien & Personal', to: '/verwaltung' }] : []),
    ...(me.role === 'ADMIN' || me.role === 'BAT' ? [{ label: 'Vorlagen & Ressourcen', to: '/vorlagen' }] : []),
  ];
  const planung = [
    ...(canViewYearPlan(me) ? [{ label: 'Jahresplanung', to: '/jahresplanung' }] : []),
    ...(canViewBefehl(me) ? [{ label: 'Ausbildungsbefehl', to: '/befehl' }] : []),
  ];
  const section = (label: string, subs: { label: string; to: string }[]): NavItem[] =>
    !subs.length ? [] : subs.length === 1 ? [{ label: subs[0].label, to: subs[0].to }] : [{ label, to: subs[0].to, subs }];
  return [
    ...(me.role !== 'ADMIN' ? [{ label: 'Übersicht', to: '/', end: true }] : []),
    ...section('Planung', planung),
    ...(me.role === 'KADER' || me.role === 'ZFHR' ? [{ label: 'Meine Ausbildungen', to: '/ausbildungen' }] : []),
    ...(me.role !== 'ADMIN' ? [{ label: 'Lektionsbibliothek', to: '/bibliothek' }] : []),
    ...section('Organisation', organisation),
  ];
}

const isIn = (item: NavItem, path: string) =>
  (item.subs ?? [item]).some((x) => (item.end ? path === x.to : path === x.to || path.startsWith(`${x.to}/`)));

function TopBar() {
  const { logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  const nav = useNav();
  const active = nav.find((n) => isIn(n, loc.pathname));
  const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-sm transition ${on ? 'bg-slate-200/80 font-semibold text-slate-900' : 'text-zs-blue hover:bg-slate-200/60'}`;
  const sub = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-1 text-sm transition ${isActive ? 'bg-zs-blue font-semibold text-white' : 'text-zs-blue hover:bg-slate-200/60'}`;

  return (
    <header className="material hairline-b no-print relative z-30 pt-[env(safe-area-inset-top)]">
      <div className="flex h-[52px] items-center gap-3 px-3 sm:px-4">
        <NavLink to="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
            <circle cx="16" cy="16" r="15" fill="#f97316" />
            <path d="M16 6 L26 24 H6 Z" fill="#1e3a8a" />
          </svg>
          WK-Planer
        </NavLink>
        <nav className="hidden gap-1 md:flex">
          {nav.map((n) => (
            <NavLink key={n.label} to={n.to} end={n.end} className={() => pill(n === active)} aria-haspopup={n.subs ? 'true' : undefined}>
              {n.label}
              {n.subs && <span className="ml-1 text-[10px] opacity-60" aria-hidden>▾</span>}
            </NavLink>
          ))}
        </nav>
        <span className="flex-1" />
        <AccountMenu />
        <button className="hidden rounded-full px-3 py-1.5 text-sm text-zs-blue hover:bg-slate-200/60 md:block" onClick={logout}>
          Abmelden
        </button>
        <button
          className="grid h-8 w-8 place-items-center rounded-full text-lg text-zs-blue hover:bg-slate-200/60 md:hidden"
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-label="Menü"
        >
          ☰
        </button>
      </div>
      {/* Pages of the open section. */}
      {active?.subs && (
        <nav className="hairline-t flex gap-1 overflow-x-auto whitespace-nowrap px-3 py-1.5 sm:px-4" aria-label={active.label}>
          {active.subs.map((x) => (
            <NavLink key={x.to} to={x.to} className={sub}>
              {x.label}
            </NavLink>
          ))}
        </nav>
      )}
      {menu && (
        <nav className="material-menu anim-pop absolute right-2 top-[calc(52px+env(safe-area-inset-top))] z-50 mt-1 flex min-w-[15rem] flex-col gap-0.5 rounded-xl p-[5px] md:hidden">
          {nav.map((n) =>
            n.subs ? (
              <div key={n.label} className="flex flex-col gap-0.5">
                <span className="px-3 pt-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">{n.label}</span>
                {n.subs.map((x) => (
                  <NavLink key={x.to} to={x.to} className={({ isActive }) => `${pill(isActive)} pl-5`}>
                    {x.label}
                  </NavLink>
                ))}
              </div>
            ) : (
              <NavLink key={n.label} to={n.to} end={n.end} className={({ isActive }) => pill(isActive)}>
                {n.label}
              </NavLink>
            ),
          )}
          <div className="hairline-t mx-2 my-1" />
          <NavLink to="/profil" className={({ isActive }) => pill(isActive)}>
            Mein Konto
          </NavLink>
          <button className="rounded-full px-3 py-1.5 text-left text-sm text-red-600" onClick={logout}>
            Abmelden
          </button>
        </nav>
      )}
    </header>
  );
}

/** Top right: the signed-in user; for demo accounts also a quick switch to the other demo roles. */
function AccountMenu() {
  const me = useUser();
  const { switchTo } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const demo = useQuery({ queryKey: ['demo-accounts', me.id], queryFn: api.demoAccounts, enabled: me.email.toLowerCase().endsWith('@demo.ch') });
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const accounts = demo.data ?? [];

  const choose = async (email: string) => {
    setOpen(false);
    if (email === me.email) return;
    try {
      await switchTo(email);
      // The page may not exist for the new role.
      navigate('/');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-slate-200/60"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={accounts.length ? 'Konto und Rolle wechseln' : 'Mein Konto'}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-slate-400 to-slate-500 text-xs font-semibold text-white" aria-hidden>
          {initials(me.name)}
        </span>
        <span className="hidden text-left text-xs leading-tight sm:block">
          <span className="block font-medium text-slate-900">{me.name}</span>
          <span className="block text-slate-500">{ROLE_LABEL[me.role]}</span>
        </span>
        <span className="hidden text-[10px] text-slate-400 sm:inline" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="material-menu anim-pop absolute right-0 top-full z-50 mt-1 w-72 rounded-xl p-[5px] text-sm">
            <NavLink to="/profil" role="menuitem" className="block rounded-lg px-3 py-1.5 text-zs-blue hover:bg-slate-200/60" onClick={() => setOpen(false)}>
              Mein Konto
            </NavLink>
            {accounts.length > 0 && (
              <>
                <div className="hairline-b mx-2 my-1" />
                <p className="px-3 pb-0.5 pt-1 text-xs font-medium text-slate-500">Rolle wechseln (Demo)</p>
                <div className="max-h-[60vh] overflow-y-auto">
                  {accounts.map((a) => {
                    const current = a.email.toLowerCase() === me.email.toLowerCase();
                    return (
                      <button
                        key={a.email}
                        role="menuitemradio"
                        aria-checked={current}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-slate-200/60 ${current ? 'font-semibold' : ''}`}
                        onClick={() => choose(a.email)}
                      >
                        <span className="w-3 shrink-0 text-zs-blue" aria-hidden>
                          {current ? '✓' : ''}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-slate-900">{ROLE_LABEL[a.role]}</span>
                          <span className="block truncate text-xs font-normal text-slate-500">
                            {a.name}
                            {a.funktion ? ` · ${a.funktion}` : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

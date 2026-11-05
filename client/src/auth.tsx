import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionUser } from '@shared/types';
import { api, ApiError } from './api';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Demo: sign in as another demo account. */
  switchTo: (email: string) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** Data cached for offline reading belongs to one user; drop it when the user changes (shared devices). */
async function clearOfflineData() {
  try {
    await caches.delete('api');
  } catch {
    /* Cache API not available */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    // Not on the QR check-in: the session check would run into the password gate and make the phone ask for it.
    enabled: !location.pathname.startsWith('/checkin/'),
  });

  const signedIn = async (u: SessionUser) => {
    await clearOfflineData();
    qc.setQueryData(['me'], u);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  };

  const value: AuthState = {
    user: me.data ?? null,
    loading: me.isLoading,
    login: async (email, password) => signedIn(await api.login(email, password)),
    switchTo: async (email) => signedIn(await api.demoSwitch(email)),
    logout: async () => {
      await api.logout();
      await clearOfflineData();
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}

/** The logged-in user; only use below the login guard. */
export function useUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('not logged in');
  return user;
}

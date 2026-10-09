import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, HttpError } from '../lib/api';
import type { User } from '../types';

type AuthContextValue = {
  user?: User;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>();
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try {
      setUser(await api<User>('/api/auth/me'));
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
      setUser(undefined);
    }
  };
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(undefined);
  };
  return (
    <AuthContext.Provider
      value={useMemo(() => ({ user, loading, refresh, logout }), [user, loading])}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider ausente');
  return context;
}

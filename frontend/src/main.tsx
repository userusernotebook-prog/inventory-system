import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { canUser } from './lib/permissions';
import { api } from './lib/api';
import {
  AssetsPage,
  AssetDetailPage,
  EmployeeDetailPage,
  EmployeesPage
} from './pages/InventoryPages';
import { LoginPage, OnboardingPage } from './pages/LoginPage';
import { Loading } from './components/Feedback';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error: any) => error?.status !== 403 && error?.status !== 404 && count < 2
    }
  }
});
function Dashboard() {
  const { user } = useAuth();
  const backup = useQuery({
    queryKey: ['backup-status'],
    enabled: canUser(user, 'audit:read'),
    queryFn: () =>
      api<{ latestSuccessful: { finishedAt: string; sizeBytes: number } | null }>(
        '/api/admin/backup-status'
      )
  });
  return (
    <section>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-slate-600">
        Acompanhe inventário, chamados e aprovações pelo menu lateral.
      </p>
      {canUser(user, 'audit:read') && (
        <section className="card mt-6 max-w-md" aria-live="polite">
          <h2 className="font-bold">Ultimo backup bem-sucedido</h2>
          {backup.isLoading && <p className="mt-2 text-sm">Carregando...</p>}
          {backup.data?.latestSuccessful ? (
            <p className="mt-2 text-sm text-slate-700">
              {new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'America/Sao_Paulo'
              }).format(new Date(backup.data.latestSuccessful.finishedAt))}
              {' · '}
              {backup.data.latestSuccessful.sizeBytes.toLocaleString('pt-BR')} bytes
            </p>
          ) : (
            !backup.isLoading && <p className="mt-2 text-sm text-slate-600">Nenhum backup concluido.</p>
          )}
        </section>
      )}
    </section>
  );
}
function Shell() {
  const { user, loading, logout } = useAuth();
  if (loading)
    return (
      <main className="p-6">
        <Loading />
      </main>
    );
  if (!user) return <LoginPage />;
  if (user.must_change_password || (user.profile_base === 'ADMIN' && !user.totp_enabled))
    return <OnboardingPage />;
  const menu = [
    { to: '/', label: 'Dashboard', permission: 'asset:read' },
    { to: '/employees', label: 'Funcionários', permission: 'employee:read' },
    { to: '/assets', label: 'Ativos', permission: 'asset:read' },
    { to: '/approvals', label: 'Solicitações', permission: 'request:create' },
    { to: '/users', label: 'Usuários', permission: 'user:manage' }
  ];
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="bg-brand-950 p-4 text-white">
        <p className="mb-8 text-lg font-bold">Gestão de Ativos</p>
        <nav className="grid gap-1">
          {menu
            .filter((item) => canUser(user, item.permission))
            .map((item) => (
              <Link
                className="rounded-lg px-3 py-2 text-sm hover:bg-white/10"
                key={item.to}
                to={item.to}
              >
                {item.label}
              </Link>
            ))}
        </nav>
        <div className="mt-10 border-t border-white/15 pt-4 text-sm">
          <p className="font-semibold">{user.name}</p>
          <p className="text-white/65">{user.profile_base}</p>
          <button className="mt-3 text-white/80 underline" onClick={() => logout()}>
            Sair
          </button>
        </div>
      </aside>
      <main className="p-5 md:p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/employees/:id" element={<EmployeeDetailPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/:id" element={<AssetDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>
);

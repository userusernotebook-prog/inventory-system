import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { canUser } from './lib/permissions';
import { api } from './lib/api';
import { AssetDetailPage, AssetsPage, EditAssetPage, EditEmployeePage, EmployeeDetailPage, EmployeesPage, NewAssetPage, NewEmployeePage } from './pages/InventoryPages';
import { LoginPage, OnboardingPage } from './pages/LoginPage';
import { NewUserPage, UserDetailPage, UsersPage } from './pages/UsersPages';
import { ApprovalDetailPage, ApprovalsPage, NewApprovalPage } from './pages/ApprovalsPages';
import { OffboardingChecklistPage, OffboardingPage } from './pages/OffboardingPages';
import { ErrorState, Loading } from './components/Feedback';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

function Dashboard() {
  const { user } = useAuth();
  const backup = useQuery({
    queryKey: ['backup-status'], enabled: canUser(user, 'audit:read'),
    queryFn: () => api<{ latestSuccessful: { finishedAt: string; sizeBytes: number } | null }>('/api/admin/backup-status')
  });
  return <section><h1 className="text-2xl font-bold">Dashboard</h1><p className="mt-2 text-slate-600">Resumo operacional do inventario.</p>
    {canUser(user, 'audit:read') && <section className="card mt-6 max-w-md" aria-live="polite"><h2 className="font-bold">Ultimo backup bem-sucedido</h2>{backup.isLoading ? <p className="mt-2 text-sm">Carregando...</p> : backup.error ? <ErrorState error={backup.error} /> : backup.data?.latestSuccessful ? <p className="mt-2 text-sm">{new Date(backup.data.latestSuccessful.finishedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p> : <p className="mt-2 text-sm">Nenhum backup concluido.</p>}</section>}
  </section>;
}

function ForbiddenPage() { return <section className="card max-w-lg"><h1 className="text-2xl font-bold">Acesso negado</h1><p className="mt-2 text-slate-600">Sua conta nao tem permissao para acessar esta pagina.</p><Link className="btn-primary mt-5" to="/">Voltar ao inicio</Link></section>; }
function NotFoundPage() { return <section className="card max-w-lg"><h1 className="text-2xl font-bold">Pagina nao encontrada</h1><Link className="btn-primary mt-5" to="/">Voltar ao inicio</Link></section>; }

function RequireAuth() {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading) return <main className="p-6"><Loading /></main>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.must_change_password || (user.profile_base === 'ADMIN' && !user.totp_enabled)) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
function RequirePermission({ permission }: { permission: string }) { const { user } = useAuth(); return canUser(user, permission) ? <Outlet /> : <Navigate to="/forbidden" replace />; }
function LoginRoute() { const { user, loading } = useAuth(); if (loading) return <Loading />; if (user) return <Navigate to={user.must_change_password || (user.profile_base === 'ADMIN' && !user.totp_enabled) ? '/onboarding' : '/'} replace />; return <LoginPage />; }
function OnboardingRoute() { const { user, loading } = useAuth(); if (loading) return <Loading />; if (!user) return <Navigate to="/login" replace />; if (!user.must_change_password && !(user.profile_base === 'ADMIN' && !user.totp_enabled)) return <Navigate to="/" replace />; return <OnboardingPage />; }

function Shell() {
  const { user, logout } = useAuth();
  const pending = useQuery({ queryKey: ['approval-pending-count'], enabled: canUser(user, 'request:approve'), queryFn: () => api<{ count: number }>('/api/approval-requests/pending-count') });
  const approvalLabel = canUser(user, 'request:approve') ? `Aprovacoes${pending.data?.count ? ` (${pending.data.count})` : ''}` : 'Minhas solicitacoes';
  const items = [{ to: '/', label: 'Dashboard', permission: 'asset:read' }, { to: '/employees', label: 'Funcionarios', permission: 'employee:read' }, { to: '/assets', label: 'Ativos', permission: 'asset:read' }, { to: '/approvals', label: approvalLabel, permission: 'request:create' }, { to: '/users', label: 'Usuarios', permission: 'user:manage' }];
  const canOffboard = canUser(user, 'employee:offboard') || canUser(user, 'asset:receive');
  return <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]"><aside className="bg-brand-950 p-4 text-white"><p className="mb-8 text-lg font-bold">Gestao de Ativos</p><nav className="grid gap-1" aria-label="Menu principal">{items.filter((item) => canUser(user, item.permission)).map((item) => <Link className="rounded-lg px-3 py-2 text-sm hover:bg-white/10" key={item.to} to={item.to}>{item.label}</Link>)}{canOffboard && <Link className="rounded-lg px-3 py-2 text-sm hover:bg-white/10" to="/offboarding">Desligamentos</Link>}</nav><div className="mt-10 border-t border-white/15 pt-4 text-sm"><p className="font-semibold">{user?.name}</p><p className="text-white/65">{user?.profile_base}</p><button className="mt-3 text-white/80 underline" onClick={() => logout()}>Sair</button></div></aside><main className="p-5 md:p-8"><Outlet /></main></div>;
}

function AppRoutes() { return <Routes><Route path="/login" element={<LoginRoute />} /><Route path="/onboarding" element={<OnboardingRoute />} /><Route path="/forbidden" element={<RequireAuth />}><Route index element={<ForbiddenPage />} /></Route><Route element={<RequireAuth />}><Route element={<Shell />}><Route element={<RequirePermission permission="asset:read" />}><Route index element={<Dashboard />} /><Route path="assets" element={<AssetsPage />} /><Route path="assets/:id" element={<AssetDetailPage />} /><Route element={<RequirePermission permission="asset:create" />}><Route path="assets/new" element={<NewAssetPage />} /></Route><Route element={<RequirePermission permission="asset:update" />}><Route path="assets/:id/edit" element={<EditAssetPage />} /></Route></Route><Route element={<RequirePermission permission="employee:read" />}><Route path="employees" element={<EmployeesPage />} /><Route path="employees/:id" element={<EmployeeDetailPage />} /><Route element={<RequirePermission permission="employee:create" />}><Route path="employees/new" element={<NewEmployeePage />} /></Route><Route element={<RequirePermission permission="employee:update" />}><Route path="employees/:id/edit" element={<EditEmployeePage />} /></Route></Route><Route path="offboarding" element={<OffboardingPage />} /><Route element={<RequirePermission permission="employee:offboard" />}><Route path="offboarding/:id" element={<OffboardingChecklistPage />} /></Route><Route element={<RequirePermission permission="request:create" />}><Route path="approvals" element={<ApprovalsPage />} /><Route path="approvals/new" element={<NewApprovalPage />} /><Route path="approvals/:id" element={<ApprovalDetailPage />} /></Route><Route element={<RequirePermission permission="user:manage" />}><Route path="users" element={<UsersPage />} /><Route path="users/new" element={<NewUserPage />} /><Route path="users/:id" element={<UserDetailPage />} /></Route><Route path="*" element={<NotFoundPage />} /></Route></Route></Routes>; }

createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><HashRouter><AuthProvider><AppRoutes /></AuthProvider></HashRouter></QueryClientProvider></StrictMode>);

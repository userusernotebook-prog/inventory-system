import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ErrorState, Empty, Loading, Status } from '../components/Feedback';
import { Pagination } from '../components/Pagination';
import { api, HttpError, queryString } from '../lib/api';
import type { Page } from '../types';

type Profile = 'ADMIN' | 'TECNICO' | 'RH' | 'FINANCEIRO' | 'CONSULTA';
type UserItem = {
  id: number;
  name: string;
  email: string;
  profile_base: Profile;
  active: number | boolean;
  last_login_at?: string | null;
  must_change_password: number | boolean;
  totp_enabled: number | boolean;
  updated_at?: string;
};
type Override = { permission: string; effect: 'allow' | 'deny' };
type Scope = { scope_type: 'city' | 'department' | 'equipment_type'; scope_value: string };
type Administration = {
  user: UserItem;
  profilePermissions: string[];
  overrides: Override[];
  scopes: Scope[];
  effectivePermissions: { granted: string[]; denied: string[] };
};
type ScopeOptions = { cities: string[]; departments: string[]; equipmentTypes: string[] };

const profiles: Profile[] = ['TECNICO', 'RH', 'FINANCEIRO', 'CONSULTA'];
const permissionsByModule: Record<string, string[]> = {
  Ativos: [
    'asset:read',
    'asset:create',
    'asset:update',
    'asset:receive',
    'asset:evaluate',
    'asset:view_value',
    'asset:send-backup',
    'asset:send-maintenance'
  ],
  Funcionarios: ['employee:read', 'employee:create', 'employee:update', 'employee:offboard'],
  Chamados: ['ticket:read', 'ticket:create'],
  Solicitacoes: ['request:create', 'request:approve'],
  Relatorios: ['report:financial'],
  Administracao: ['user:manage', 'audit:read']
};

const userSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.'),
  email: z.string().email('Informe um e-mail valido.'),
  profile_base: z.enum(['TECNICO', 'RH', 'FINANCEIRO', 'CONSULTA']),
  password: z.string().min(12, 'A senha provisoria deve ter ao menos 12 caracteres.')
});
const editSchema = userSchema.omit({ password: true });
const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Informe um motivo de ao menos 3 caracteres.') });
const resetSchema = z.object({ password: z.string().min(12, 'A senha provisoria deve ter ao menos 12 caracteres.') });

function message(error: unknown) {
  return error instanceof HttpError || error instanceof Error ? error.message : 'Nao foi possivel concluir a operacao.';
}
function utc(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
    : 'Nunca acessou';
}

function ConfirmModal({
  title,
  confirmLabel,
  onConfirm,
  onClose
}: {
  title: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const form = useForm<z.infer<typeof reasonSchema>>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: '' } });
  const submit = form.handleSubmit(async ({ reason }) => {
    try {
      await onConfirm(reason);
      onClose();
    } catch (error) {
      form.setError('root', { message: message(error) });
    }
  });
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={title}>
    <form className="card w-full max-w-md space-y-4" onSubmit={submit} noValidate>
      <h2 className="text-lg font-bold">{title}</h2>
      <label className="label">Motivo<textarea className="field min-h-24" {...form.register('reason')} /></label>
      {form.formState.errors.reason && <p className="field-error">{form.formState.errors.reason.message}</p>}
      {form.formState.errors.root && <p className="field-error" role="alert">{form.formState.errors.root.message}</p>}
      <div className="flex justify-end gap-3"><button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button><button className="btn-primary" type="submit" disabled={form.formState.isSubmitting}>{confirmLabel}</button></div>
    </form>
  </div>;
}

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [profile, setProfile] = useState('');
  const [active, setActive] = useState('');
  const users = useQuery({
    queryKey: ['users', page, q, profile, active],
    queryFn: () => api<Page<UserItem>>(`/api/users?${queryString({ page, pageSize: 25, q, profile_base: profile, active })}`)
  });
  if (users.isLoading) return <Loading />;
  if (users.error) return <ErrorState error={users.error} />;
  return <section>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Usuarios</h1><p className="text-slate-600">Acesso, perfil e seguranca das contas.</p></div><Link className="btn-primary" to="/users/new">Cadastrar usuario</Link></div>
    <div className="mb-4 grid gap-3 md:grid-cols-3"><input className="field" aria-label="Buscar usuarios" placeholder="Buscar nome ou e-mail" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} /><select className="field" aria-label="Filtrar perfil" value={profile} onChange={(event) => { setProfile(event.target.value); setPage(1); }}><option value="">Todos os perfis</option>{profiles.map((item) => <option key={item}>{item}</option>)}</select><select className="field" aria-label="Filtrar status" value={active} onChange={(event) => { setActive(event.target.value); setPage(1); }}><option value="">Todos os status</option><option value="true">Ativo</option><option value="false">Inativo</option></select></div>
    {users.data!.items.length === 0 ? <Empty>Nenhum usuario encontrado.</Empty> : <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Nome</th><th>Perfil</th><th>Status</th><th>Ultimo acesso</th><th aria-label="Acoes" /></tr></thead><tbody>{users.data!.items.map((item) => <tr key={item.id}><td><p className="font-semibold">{item.name}</p><p className="text-xs text-slate-500">{item.email}</p></td><td>{item.profile_base}</td><td><Status value={item.active ? 'ATIVO' : 'INATIVO'} /></td><td>{utc(item.last_login_at)}</td><td><Link className="btn-secondary" to={`/users/${item.id}`}>Gerenciar</Link></td></tr>)}</tbody></table><Pagination data={users.data!} onPage={setPage} /></div>}
  </section>;
}

export function NewUserPage() {
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof userSchema>>({ resolver: zodResolver(userSchema), defaultValues: { name: '', email: '', profile_base: 'TECNICO', password: '' } });
  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await api<{ id: number }>('/api/users', { method: 'POST', body: JSON.stringify(values) });
      navigate(`/users/${result.id}`);
    } catch (error) { form.setError('root', { message: message(error) }); }
  });
  return <section className="max-w-2xl"><Link className="text-sm text-blue-700" to="/users">Voltar para usuarios</Link><h1 className="mt-4 text-2xl font-bold">Cadastrar usuario</h1><p className="mt-1 text-slate-600">A senha definida aqui e provisoria e devera ser alterada no primeiro acesso.</p><UserForm form={form} onSubmit={submit} submitLabel="Criar usuario" /></section>;
}

function UserForm({ form, onSubmit, submitLabel }: { form: UseFormReturn<any>; onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>; submitLabel: string }) {
  return <form className="card mt-5 space-y-4" onSubmit={onSubmit} noValidate>
    <label className="label">Nome<input className="field" {...form.register('name')} /></label>{form.formState.errors.name && <p className="field-error">{form.formState.errors.name.message as string}</p>}
    <label className="label">E-mail<input className="field" type="email" {...form.register('email')} /></label>{form.formState.errors.email && <p className="field-error">{form.formState.errors.email.message as string}</p>}
    <label className="label">Perfil<select className="field" {...form.register('profile_base')}><option value="TECNICO">Tecnico</option><option value="RH">RH</option><option value="FINANCEIRO">Financeiro</option><option value="CONSULTA">Consulta</option></select></label>
    {'password' in form.getValues() && <><label className="label">Senha provisoria<input className="field" type="password" autoComplete="new-password" {...form.register('password' as never)} /></label>{form.formState.errors.password && <p className="field-error">{form.formState.errors.password.message as string}</p>}</>}
    {form.formState.errors.root && <p className="field-error" role="alert">{form.formState.errors.root.message}</p>}
    <button className="btn-primary" type="submit" disabled={form.formState.isSubmitting}>{submitLabel}</button>
  </form>;
}

export function UserDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<{ title: string; run: (reason: string) => Promise<void> }>();
  const administration = useQuery({ queryKey: ['user', id], queryFn: () => api<Administration>(`/api/users/${id}`) });
  const options = useQuery({ queryKey: ['user-scope-options'], queryFn: () => api<ScopeOptions>('/api/users/scope-options') });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['user', id] }); await queryClient.invalidateQueries({ queryKey: ['users'] }); };
  const edit = useForm<z.infer<typeof editSchema>>({ resolver: zodResolver(editSchema) });
  const reset = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });
  const [overrides, setOverrides] = useState<Record<string, '' | 'allow' | 'deny'>>({});
  const [scopes, setScopes] = useState<Scope[]>([]);
  const user = administration.data?.user;
  const defaults = useMemo(() => ({ name: user?.name || '', email: user?.email || '', profile_base: user?.profile_base === 'ADMIN' ? 'TECNICO' : user?.profile_base || 'TECNICO' }), [user]);
  const loadedKey = administration.data ? `${administration.data.user.id}:${administration.data.user.updated_at || administration.data.user.email}` : '';
  const [lastLoaded, setLastLoaded] = useState('');
  if (loadedKey && loadedKey !== lastLoaded) {
    setLastLoaded(loadedKey);
    edit.reset(defaults);
    setOverrides(Object.fromEntries(administration.data!.overrides.map((item) => [item.permission, item.effect])));
    setScopes(administration.data!.scopes);
  }
  if (administration.isLoading || options.isLoading) return <Loading />;
  if (administration.error || options.error) return <ErrorState error={administration.error || options.error} />;
  if (!user) return <Empty>Usuario nao encontrado.</Empty>;
  const currentOverrides = (permission: string) => overrides[permission] || '';
  const effective = (permission: string) => currentOverrides(permission) === 'deny' ? false : currentOverrides(permission) === 'allow' || administration.data!.profilePermissions.includes(permission);
  const open = (title: string, run: (reason: string) => Promise<void>) => setConfirmation({ title, run });
  const submitEdit = edit.handleSubmit((values) => open('Confirmar alteracoes do usuario', async (reason) => { await api(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify({ ...values, active: Boolean(user.active), reason }) }); await refresh(); }));
  const resetPassword = reset.handleSubmit((values) => open('Redefinir senha provisoria', async (reason) => { await api(`/api/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: values.password, reason }) }); reset.reset(); await refresh(); }));
  const saveOverrides = () => open('Salvar permissoes individuais', async (reason) => { const rows = Object.entries(overrides).filter(([, effect]) => effect).map(([permission, effect]) => ({ permission, effect: effect as 'allow' | 'deny' })); await api(`/api/users/${id}/overrides`, { method: 'PUT', body: JSON.stringify({ overrides: rows, reason }) }); await refresh(); });
  const saveScopes = () => open('Salvar alcance do usuario', async (reason) => { await api(`/api/users/${id}/scopes`, { method: 'PUT', body: JSON.stringify({ scopes: scopes.map((scope) => ({ type: scope.scope_type, value: scope.scope_value })), reason }) }); await refresh(); });
  const toggleScope = (type: Scope['scope_type'], value: string) => setScopes((old) => old.some((item) => item.scope_type === type && item.scope_value === value) ? old.filter((item) => !(item.scope_type === type && item.scope_value === value)) : [...old, { scope_type: type, scope_value: value }]);
  return <section>
    <Link className="text-sm text-blue-700" to="/users">Voltar para usuarios</Link>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{user.name}</h1><p className="text-slate-600">{user.email} · {user.profile_base}</p></div><Status value={user.active ? 'ATIVO' : 'INATIVO'} /></div>
    {user.profile_base === 'ADMIN' ? <div className="card mt-5">O administrador unico nao pode ter perfil, status, permissoes ou alcance alterados pela interface.</div> : <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <div><h2 className="text-lg font-bold">Dados da conta</h2><UserForm form={edit} onSubmit={submitEdit} submitLabel="Salvar dados" />
        <section className="card mt-5"><h2 className="font-bold">Sessao e senha</h2><p className="mt-1 text-sm text-slate-600">Ultimo acesso: {utc(user.last_login_at)}</p><form className="mt-4 space-y-3" onSubmit={resetPassword} noValidate><label className="label">Nova senha provisoria<input className="field" type="password" autoComplete="new-password" {...reset.register('password')} /></label>{reset.formState.errors.password && <p className="field-error">{reset.formState.errors.password.message}</p>}{reset.formState.errors.root && <p className="field-error">{reset.formState.errors.root.message}</p>}<button className="btn-secondary" type="submit">Redefinir senha</button></form><div className="mt-4 flex flex-wrap gap-3"><button className="btn-secondary" onClick={() => open(user.active ? 'Desativar usuario' : 'Ativar usuario', async (reason) => { await api(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify({ ...edit.getValues(), active: !user.active, reason }) }); await refresh(); })}>{user.active ? 'Desativar usuario' : 'Ativar usuario'}</button><button className="btn-secondary" onClick={() => open('Forcar logout', async (reason) => { await api(`/api/users/${id}/force-logout`, { method: 'POST', body: JSON.stringify({ reason }) }); })}>Forcar logout</button></div></section>
      </div>
      <div className="space-y-5"><section className="card"><h2 className="font-bold">Permissoes e alcance</h2><p className="mt-1 text-sm text-slate-600">Deny sempre vence o perfil-base. Escolha herdar, permitir ou negar para cada permissao.</p><div className="mt-4 space-y-5">{Object.entries(permissionsByModule).map(([module, permissions]) => <fieldset key={module}><legend className="font-semibold">{module}</legend><div className="mt-2 space-y-2">{permissions.map((permission) => <div key={permission} className="grid grid-cols-[1fr_9rem] items-center gap-3"><div><p className="text-sm font-medium">{permission}</p><p className="text-xs text-slate-500">{currentOverrides(permission) ? `Origem: ${currentOverrides(permission) === 'deny' ? 'negacao individual' : 'concessao individual'}` : effective(permission) ? 'Origem: perfil-base' : 'Origem: nao concedida pelo perfil'}</p></div><select className="field" aria-label={`Permissao ${permission}`} value={currentOverrides(permission)} onChange={(event) => setOverrides((old) => ({ ...old, [permission]: event.target.value as '' | 'allow' | 'deny' }))}><option value="">Herdar</option><option value="allow">Permitir</option><option value="deny">Negar</option></select></div>)}</div></fieldset>)}</div><button className="btn-primary mt-5" onClick={saveOverrides}>Salvar permissoes</button></section>
        <section className="card"><h2 className="font-bold">Alcance</h2><p className="mt-1 text-sm text-slate-600">Sem selecao, o usuario nao tem restricao naquele tipo.</p><ScopeChoices title="Cidades" type="city" values={options.data!.cities} scopes={scopes} onToggle={toggleScope} /><ScopeChoices title="Departamentos" type="department" values={options.data!.departments} scopes={scopes} onToggle={toggleScope} /><ScopeChoices title="Tipos de equipamento" type="equipment_type" values={options.data!.equipmentTypes} scopes={scopes} onToggle={toggleScope} /><button className="btn-primary mt-5" onClick={saveScopes}>Salvar alcance</button></section>
        <section className="card" aria-live="polite"><h2 className="font-bold">Pre-visualizacao</h2><p className="mt-2 text-sm">Este usuario podera: {Object.values(permissionsByModule).flat().filter(effective).join(', ') || 'nenhuma acao adicional'}.</p><p className="mt-2 text-sm text-slate-600">Alcance: {scopes.length ? scopes.map((item) => `${item.scope_type}: ${item.scope_value}`).join(' · ') : 'sem restricoes configuradas'}.</p></section>
      </div>
    </div>}
    {confirmation && <ConfirmModal title={confirmation.title} confirmLabel="Confirmar" onConfirm={confirmation.run} onClose={() => setConfirmation(undefined)} />}
  </section>;
}

function ScopeChoices({ title, type, values, scopes, onToggle }: { title: string; type: Scope['scope_type']; values: string[]; scopes: Scope[]; onToggle: (type: Scope['scope_type'], value: string) => void }) {
  return <fieldset className="mt-4"><legend className="text-sm font-semibold">{title}</legend>{values.length === 0 ? <p className="mt-1 text-sm text-slate-500">Nenhuma opcao cadastrada.</p> : <div className="mt-2 grid gap-2 sm:grid-cols-2">{values.map((value) => <label key={value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scopes.some((item) => item.scope_type === type && item.scope_value === value)} onChange={() => onToggle(type, value)} />{value}</label>)}</div>}</fieldset>;
}

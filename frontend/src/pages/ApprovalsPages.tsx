import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { Empty, ErrorState, Loading, Status } from '../components/Feedback';
import { Pagination } from '../components/Pagination';
import { api, HttpError, queryString } from '../lib/api';
import { canUser } from '../lib/permissions';
import type { Approval, Asset, Employee, Page } from '../types';

type ApprovalAsset = Asset & { asset_id: number; role: string; expected_status: string; current_status: string; history: Array<{ movement_type: string; from_status: string; to_status: string; reason?: string; occurred_at: string }> };
type ApprovalDetail = Approval & { employee_name?: string; approver_name?: string; decision_reason?: string; technical_report?: string; assets: ApprovalAsset[]; events: Array<{ id: number; event_type: string; actor_name?: string; details: string; created_at: string }> };
const types = ['TROCA_EQUIPAMENTO', 'USO_EQUIPAMENTO_BACKUP', 'DESATIVACAO_ATIVO'] as const;
const requestSchema = z.object({
  type: z.enum(types),
  employee_id: z.string().optional(),
  asset_id: z.string().optional(),
  old_asset_id: z.string().optional(),
  new_asset_id: z.string().optional(),
  justification: z.string().trim().min(3, 'Informe uma justificativa.'),
  technical_report: z.string().trim(),
  expires_in_hours: z.string().optional()
}).superRefine((value, context) => {
  if (value.type === 'TROCA_EQUIPAMENTO' && (!value.employee_id || !value.old_asset_id || !value.new_asset_id)) context.addIssue({ code: 'custom', path: ['old_asset_id'], message: 'Informe funcionario, ativo antigo e ativo novo.' });
  if (value.type === 'USO_EQUIPAMENTO_BACKUP' && (!value.employee_id || !value.asset_id)) context.addIssue({ code: 'custom', path: ['asset_id'], message: 'Informe funcionario e ativo em backup.' });
  if (value.type === 'DESATIVACAO_ATIVO' && (!value.asset_id || !value.technical_report)) context.addIssue({ code: 'custom', path: ['technical_report'], message: 'Desativacao exige ativo e laudo tecnico.' });
});
const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Informe o motivo.') });
const typeLabel: Record<string, string> = { TROCA_EQUIPAMENTO: 'Troca de equipamento', USO_EQUIPAMENTO_BACKUP: 'Uso de equipamento em backup', DESATIVACAO_ATIVO: 'Desativacao de ativo' };
function errorMessage(error: unknown) { return error instanceof HttpError || error instanceof Error ? error.message : 'Nao foi possivel concluir a operacao.'; }
function date(value?: string) { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '-'; }

function ReasonModal({ title, confirm, onClose }: { title: string; confirm: (reason: string) => Promise<void>; onClose: () => void }) {
  const form = useForm<z.infer<typeof reasonSchema>>({ resolver: zodResolver(reasonSchema) });
  const submit = form.handleSubmit(async ({ reason }) => { try { await confirm(reason); onClose(); } catch (error) { form.setError('root', { message: errorMessage(error) }); } });
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={title}><form className="card w-full max-w-md space-y-4" onSubmit={submit} noValidate><h2 className="text-lg font-bold">{title}</h2><label className="label">Motivo<textarea className="field min-h-24" {...form.register('reason')} /></label>{form.formState.errors.reason && <p className="field-error">{form.formState.errors.reason.message}</p>}{form.formState.errors.root && <p className="field-error" role="alert">{form.formState.errors.root.message}</p>}<div className="flex justify-end gap-3"><button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button><button className="btn-primary" type="submit">Confirmar</button></div></form></div>;
}

export function ApprovalsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const requests = useQuery({ queryKey: ['approval-requests', page, status, type], queryFn: () => api<Page<Approval>>(`/api/approval-requests?${queryString({ page, pageSize: 25, status, type })}`) });
  if (requests.isLoading) return <Loading />;
  if (requests.error) return <ErrorState error={requests.error} />;
  const isAdmin = canUser(user, 'request:approve');
  return <section><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{isAdmin ? 'Aprovacoes' : 'Minhas solicitacoes'}</h1><p className="text-slate-600">{isAdmin ? 'Solicitacoes pendentes de decisao.' : 'Solicite e acompanhe suas aprovacoes.'}</p></div><Link className="btn-primary" to="/approvals/new">Nova solicitacao</Link></div><div className="mb-4 grid gap-3 sm:grid-cols-2"><select className="field" aria-label="Filtrar status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{['PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA', 'EXPIRADA'].map((item) => <option key={item}>{item}</option>)}</select><select className="field" aria-label="Filtrar tipo" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">Todos os tipos</option>{types.map((item) => <option value={item} key={item}>{typeLabel[item]}</option>)}</select></div>{requests.data!.items.length === 0 ? <Empty>Nenhuma solicitacao encontrada.</Empty> : <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Tipo</th><th>Solicitante</th><th>Status</th><th>Data</th><th /></tr></thead><tbody>{requests.data!.items.map((item) => <tr key={item.id}><td>{typeLabel[item.type] || item.type}</td><td>{item.requester_name || '-'}</td><td><Status value={item.status} /></td><td>{date(item.created_at)}</td><td><Link className="btn-secondary" to={`/approvals/${item.id}`}>Ver</Link></td></tr>)}</tbody></table><Pagination data={requests.data!} onPage={setPage} /></div>}</section>;
}

export function NewApprovalPage() {
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema), defaultValues: { type: 'USO_EQUIPAMENTO_BACKUP', employee_id: '', asset_id: '', old_asset_id: '', new_asset_id: '', justification: '', technical_report: '', expires_in_hours: '72' } });
  const type = form.watch('type');
  const employees = useQuery({ queryKey: ['approval-employees'], queryFn: () => api<Page<Employee>>('/api/employees?page=1&pageSize=100') });
  const assets = useQuery({ queryKey: ['approval-assets'], queryFn: () => api<Page<Asset>>('/api/assets?page=1&pageSize=100') });
  const submit = form.handleSubmit(async (values) => { try { const body = { ...values, employee_id: values.employee_id ? Number(values.employee_id) : undefined, asset_id: values.asset_id ? Number(values.asset_id) : undefined, old_asset_id: values.old_asset_id ? Number(values.old_asset_id) : undefined, new_asset_id: values.new_asset_id ? Number(values.new_asset_id) : undefined, technical_report: values.technical_report || undefined, expires_in_hours: values.expires_in_hours ? Number(values.expires_in_hours) : undefined }; const result = await api<{ id: number }>('/api/approval-requests', { method: 'POST', body: JSON.stringify(body) }); navigate(`/approvals/${result.id}`); } catch (error) { form.setError('root', { message: errorMessage(error) }); } });
  if (employees.isLoading || assets.isLoading) return <Loading />;
  if (employees.error || assets.error) return <ErrorState error={employees.error || assets.error} />;
  const backup = assets.data!.items.filter((asset) => asset.status === 'BACKUP');
  const inUse = assets.data!.items.filter((asset) => asset.status === 'EM_USO');
  const selectable = assets.data!.items.filter((asset) => asset.status !== 'DESATIVADO');
  const options = (items: Asset[]) => <><option value="">Selecione</option>{items.map((asset) => <option value={asset.id} key={asset.id}>{asset.hostname || asset.serial || `Ativo #${asset.id}`} · {asset.equipment_type} · {asset.status}</option>)}</>;
  return <section className="max-w-2xl"><Link className="text-sm text-blue-700" to="/approvals">Voltar para solicitacoes</Link><h1 className="mt-4 text-2xl font-bold">Nova solicitacao</h1><form className="card mt-5 space-y-4" onSubmit={submit} noValidate><label className="label">Tipo<select className="field" {...form.register('type')}><option value="USO_EQUIPAMENTO_BACKUP">Uso de equipamento em backup</option><option value="TROCA_EQUIPAMENTO">Troca de equipamento</option><option value="DESATIVACAO_ATIVO">Desativacao de ativo</option></select></label>{type !== 'DESATIVACAO_ATIVO' && <label className="label">Funcionario<select className="field" {...form.register('employee_id')}><option value="">Selecione</option>{employees.data!.items.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label>}{type === 'TROCA_EQUIPAMENTO' && <><label className="label">Ativo antigo<select className="field" {...form.register('old_asset_id')}>{options(inUse)}</select></label><label className="label">Ativo novo em backup<select className="field" {...form.register('new_asset_id')}>{options(backup)}</select></label></>}{type === 'USO_EQUIPAMENTO_BACKUP' && <label className="label">Ativo em backup<select className="field" {...form.register('asset_id')}>{options(backup)}</select></label>}{type === 'DESATIVACAO_ATIVO' && <><label className="label">Ativo<select className="field" {...form.register('asset_id')}>{options(selectable)}</select></label><label className="label">Laudo tecnico<textarea className="field min-h-24" {...form.register('technical_report')} /></label></>}<label className="label">Justificativa<textarea className="field min-h-24" {...form.register('justification')} /></label><label className="label">Prazo em horas<input className="field" type="number" min="1" max="720" {...form.register('expires_in_hours')} /></label>{form.formState.errors.asset_id && <p className="field-error">{form.formState.errors.asset_id.message}</p>}{form.formState.errors.old_asset_id && <p className="field-error">{form.formState.errors.old_asset_id.message}</p>}{form.formState.errors.technical_report && <p className="field-error">{form.formState.errors.technical_report.message}</p>}{form.formState.errors.justification && <p className="field-error">{form.formState.errors.justification.message}</p>}{form.formState.errors.root && <p className="field-error" role="alert">{form.formState.errors.root.message}</p>}<button className="btn-primary" type="submit" disabled={form.formState.isSubmitting}>Criar solicitacao</button></form></section>;
}

export function ApprovalDetailPage() {
  const { id } = useParams(); const { user } = useAuth(); const queryClient = useQueryClient(); const [decision, setDecision] = useState<'approve' | 'reject' | 'cancel'>();
  const detail = useQuery({ queryKey: ['approval-request', id], queryFn: () => api<ApprovalDetail>(`/api/approval-requests/${id}`) });
  if (detail.isLoading) return <Loading />; if (detail.error) return <ErrorState error={detail.error} />; const request = detail.data!; const isAdmin = canUser(user, 'request:approve'); const isOwner = user?.id === request.requester_user_id;
  const execute = async (reason: string) => { const action = decision === 'approve' ? 'approve' : decision === 'reject' ? 'reject' : 'cancel'; await api(`/api/approval-requests/${id}/${action}`, { method: 'POST', body: JSON.stringify({ reason }) }); await queryClient.invalidateQueries({ queryKey: ['approval-request', id] }); await queryClient.invalidateQueries({ queryKey: ['approval-requests'] }); };
  const autoApproved = request.events.some((event) => { try { return event.event_type === 'APROVADA' && Boolean(JSON.parse(event.details).auto_approved); } catch { return false; } });
  return <section><Link className="text-sm text-blue-700" to="/approvals">Voltar para solicitacoes</Link><div className="mt-4 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{typeLabel[request.type]}</h1><p className="text-slate-600">Solicitada por {request.requester_name} em {date(request.created_at)}</p></div><Status value={request.status} /></div>{autoApproved && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">Auto-aprovada pelo proprio administrador solicitante.</p>}<div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="card"><h2 className="font-bold">Solicitacao</h2><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-slate-500">Funcionario</dt><dd>{request.employee_name || '-'}</dd></div><div><dt className="text-slate-500">Justificativa</dt><dd>{request.justification}</dd></div>{request.technical_report && <div><dt className="text-slate-500">Laudo tecnico</dt><dd>{request.technical_report}</dd></div>}{request.decision_reason && <div><dt className="text-slate-500">Decisao</dt><dd>{request.decision_reason}</dd></div>}</dl>{request.status === 'PENDENTE' && <div className="mt-5 flex flex-wrap gap-3">{isAdmin && <><button className="btn-primary" onClick={() => setDecision('approve')}>Aprovar</button><button className="btn-secondary" onClick={() => setDecision('reject')}>Rejeitar</button></>}{isOwner && <button className="btn-secondary" onClick={() => setDecision('cancel')}>Cancelar solicitacao</button>}</div>}</section><section className="card"><h2 className="font-bold">Historico da solicitacao</h2><ol className="mt-3 space-y-3">{request.events.map((event) => <li key={event.id} className="border-l border-slate-200 pl-3"><p className="font-semibold">{event.event_type}</p><p className="text-sm text-slate-600">{event.actor_name || 'Sistema'} · {date(event.created_at)}</p></li>)}</ol></section></div><section className="card mt-5"><h2 className="font-bold">Ativos e historico</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{request.assets.map((asset) => <article key={asset.asset_id} className="rounded border border-slate-200 p-4"><p className="font-semibold">{asset.hostname || asset.serial || `Ativo #${asset.asset_id}`}</p><p className="text-sm text-slate-600">{asset.equipment_type} · {asset.role} · {asset.current_status}</p><ol className="mt-3 space-y-2 text-sm">{asset.history.map((move, index) => <li key={`${move.occurred_at}-${index}`}>{move.from_status || 'Inicial'} → {move.to_status} · {date(move.occurred_at)}</li>)}</ol></article>)}</div></section>{decision && <ReasonModal title={decision === 'approve' ? 'Aprovar solicitacao' : decision === 'reject' ? 'Rejeitar solicitacao' : 'Cancelar solicitacao'} confirm={execute} onClose={() => setDecision(undefined)} />}</section>;
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { Empty, ErrorState, Loading, Status } from '../components/Feedback';
import { Pagination } from '../components/Pagination';
import { api, HttpError, queryString } from '../lib/api';
import { canUser } from '../lib/permissions';
import type { Asset, Employee, Page } from '../types';

type Ticket = {
  id: number;
  ticket_number?: string;
  employee_id: number;
  employee_name: string;
  hostname?: string;
  serial?: string;
  equipment_type?: string;
  type?: string;
  priority?: string;
  description: string;
  status: string;
  technical_opinion?: string;
  opened_at: string;
  closed_at?: string;
};

const ticketSchema = z.object({
  employee_id: z.string().min(1, 'Selecione o funcionário.'),
  asset_id: z.string().optional(),
  type: z.string().trim().max(100),
  priority: z.enum(['Normal', 'Alta', 'Urgente']),
  description: z.string().trim().min(3, 'Descreva o chamado.').max(4000)
});
const closeSchema = z.object({
  technical_opinion: z.string().trim().min(3, 'Informe o parecer técnico.').max(4000)
});
const errorMessage = (error: unknown) =>
  error instanceof HttpError || error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
    : '-';

function CloseDialog({ ticket, close }: { ticket: Ticket; close: () => void }) {
  const client = useQueryClient();
  const form = useForm<z.infer<typeof closeSchema>>({ resolver: zodResolver(closeSchema) });
  const submit = form.handleSubmit(async (values) => {
    try {
      await api(`/api/tickets/${ticket.id}/close`, { method: 'POST', body: JSON.stringify(values) });
      await client.invalidateQueries({ queryKey: ['tickets'] });
      close();
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  });
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Fechar chamado"><form className="card w-full max-w-lg space-y-4" noValidate onSubmit={submit}><h2 className="text-lg font-bold">Fechar chamado</h2><p className="text-sm text-slate-600">{ticket.ticket_number || `Chamado #${ticket.id}`}</p><label className="label">Parecer técnico<textarea className="field min-h-28" {...form.register('technical_opinion')} /></label>{form.formState.errors.technical_opinion && <p className="field-error">{form.formState.errors.technical_opinion.message}</p>}{form.formState.errors.root && <p className="field-error" role="alert">{form.formState.errors.root.message}</p>}<div className="flex justify-end gap-3"><button className="btn-secondary" type="button" onClick={close}>Cancelar</button><button className="btn-primary" type="submit">Confirmar fechamento</button></div></form></div>;
}

export function TicketsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Ticket>();
  const tickets = useQuery({ queryKey: ['tickets', page, q, status], queryFn: () => api<Page<Ticket>>(`/api/tickets?${queryString({ page, pageSize: 25, q, status, sortBy: 'opened_at', sortOrder: 'desc' })}`) });
  if (tickets.isLoading) return <Loading />;
  if (tickets.error) return <ErrorState error={tickets.error} />;
  return <section><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Chamados</h1><p className="mt-1 text-slate-600">Acompanhe solicitações e seus pareceres técnicos.</p></div>{canUser(user, 'ticket:create') && <Link className="btn-primary" to="/tickets/new">Abrir chamado</Link>}</div><div className="mb-4 grid gap-3 md:grid-cols-2"><input className="field" aria-label="Buscar chamados" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Número, funcionário ou descrição" /><select className="field" aria-label="Filtrar status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option><option value="open">Aberto</option><option value="in_progress">Em andamento</option><option value="closed">Fechado</option><option value="cancelled">Cancelado</option></select></div>{tickets.data!.items.length === 0 ? <Empty>Nenhum chamado encontrado.</Empty> : <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Número</th><th>Funcionário</th><th>Equipamento</th><th>Prioridade</th><th>Status</th><th>Abertura</th><th /></tr></thead><tbody>{tickets.data!.items.map((ticket) => <tr key={ticket.id}><td>{ticket.ticket_number || `#${ticket.id}`}</td><td>{ticket.employee_name}</td><td>{ticket.hostname || ticket.serial || '-'}</td><td>{ticket.priority || '-'}</td><td><Status value={ticket.status} /></td><td>{date(ticket.opened_at)}</td><td>{ticket.status !== 'closed' && canUser(user, 'ticket:close') ? <button className="btn-secondary" onClick={() => setSelected(ticket)}>Fechar</button> : ticket.technical_opinion ? <span className="text-xs text-slate-600">Parecer registrado</span> : null}</td></tr>)}</tbody></table><Pagination data={tickets.data!} onPage={setPage} /></div>}{selected && <CloseDialog ticket={selected} close={() => setSelected(undefined)} />}</section>;
}

export function NewTicketPage() {
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof ticketSchema>>({ resolver: zodResolver(ticketSchema), defaultValues: { employee_id: '', asset_id: '', type: 'Suporte', priority: 'Normal', description: '' } });
  const employeeId = form.watch('employee_id');
  const employees = useQuery({ queryKey: ['ticket-employees'], queryFn: () => api<Page<Employee>>('/api/employees?page=1&pageSize=100&status=ativo') });
  const assets = useQuery({ queryKey: ['ticket-employee-assets', employeeId], enabled: Boolean(employeeId), queryFn: () => api<Asset[]>(`/api/employees/${employeeId}/assets`) });
  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await api<{ id: number }>('/api/tickets', { method: 'POST', body: JSON.stringify({ ...values, employee_id: Number(values.employee_id), asset_id: values.asset_id ? Number(values.asset_id) : undefined }) });
      navigate('/tickets');
      return result;
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
      return null;
    }
  });
  if (employees.isLoading) return <Loading />;
  if (employees.error) return <ErrorState error={employees.error} />;
  return <section className="max-w-2xl"><Link className="text-sm text-blue-700" to="/tickets">Voltar para chamados</Link><h1 className="mt-4 text-2xl font-bold">Abrir chamado</h1><form className="card mt-5 space-y-4" noValidate onSubmit={submit}><label className="label">Funcionário<select className="field" aria-label="Funcionário do chamado" {...form.register('employee_id')} onChange={(event) => { form.setValue('employee_id', event.target.value); form.setValue('asset_id', ''); }}><option value="">Selecione</option>{employees.data!.items.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>{form.formState.errors.employee_id && <p className="field-error">{form.formState.errors.employee_id.message}</p>}<label className="label">Equipamento vinculado{!employeeId ? <span className="ml-1 text-slate-500">(selecione o funcionário primeiro)</span> : null}<select className="field" aria-label="Equipamento do chamado" disabled={!employeeId || assets.isLoading} {...form.register('asset_id')}><option value="">Nenhum equipamento específico</option>{assets.data?.map((asset) => <option key={asset.id} value={asset.id}>{asset.hostname || asset.serial || `Ativo #${asset.id}`} · {asset.equipment_type}</option>)}</select></label>{assets.error && <p className="field-error">Não foi possível carregar os equipamentos deste funcionário.</p>}<div className="grid gap-4 sm:grid-cols-2"><label className="label">Tipo<input className="field" {...form.register('type')} /></label><label className="label">Prioridade<select className="field" {...form.register('priority')}><option>Normal</option><option>Alta</option><option>Urgente</option></select></label></div><label className="label">Descrição<textarea className="field min-h-28" {...form.register('description')} /></label>{form.formState.errors.description && <p className="field-error">{form.formState.errors.description.message}</p>}{form.formState.errors.root && <p className="field-error" role="alert">{form.formState.errors.root.message}</p>}<button className="btn-primary" type="submit" disabled={form.formState.isSubmitting}>Abrir chamado</button></form></section>;
}

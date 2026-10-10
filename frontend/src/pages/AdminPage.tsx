import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Empty, ErrorState, Loading } from '../components/Feedback';
import { Pagination } from '../components/Pagination';
import { api, queryString } from '../lib/api';
import type { Page } from '../types';

type Audit = { id: number; actor: string; action: string; entity_type: string; entity_id?: number; created_at: string };
type Backup = { latestSuccessful: { finishedAt: string; sizeBytes: number } | null; lastAttempt: { success: boolean; finishedAt: string; error?: string } | null };
const date = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '-';

export function AdminPage() {
  const [page, setPage] = useState(1); const [actor, setActor] = useState(''); const [action, setAction] = useState(''); const [entity, setEntity] = useState('');
  const audit = useQuery({ queryKey: ['audit', page, actor, action, entity], queryFn: () => api<Page<Audit>>(`/api/admin/audit?${queryString({ page, pageSize: 25, actor, action, entity_type: entity, sortBy: 'created_at', sortOrder: 'desc' })}`) });
  const backup = useQuery({ queryKey: ['backup-status'], queryFn: () => api<Backup>('/api/admin/backup-status') });
  if (audit.isLoading || backup.isLoading) return <Loading />;
  if (audit.error || backup.error) return <ErrorState error={audit.error || backup.error} />;
  const latest = backup.data!.latestSuccessful;
  return <section><h1 className="text-2xl font-bold">Administração</h1><section className="card mt-5"><h2 className="font-bold">Último backup</h2>{latest ? <p className="mt-2 text-sm">Concluído em {date(latest.finishedAt)} · {(latest.sizeBytes / 1024).toFixed(1)} KB</p> : <p className="mt-2 text-sm">Nenhum backup bem-sucedido registrado.</p>}{backup.data!.lastAttempt && !backup.data!.lastAttempt.success && <p className="mt-2 text-sm text-red-700">A última tentativa falhou: {backup.data!.lastAttempt.error || 'erro não informado'}.</p>}</section><section className="card mt-5"><h2 className="font-bold">Auditoria</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><input className="field" aria-label="Filtrar autor" value={actor} onChange={(event) => { setActor(event.target.value); setPage(1); }} placeholder="Autor" /><input className="field" aria-label="Filtrar ação" value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} placeholder="Ação" /><input className="field" aria-label="Filtrar entidade" value={entity} onChange={(event) => { setEntity(event.target.value); setPage(1); }} placeholder="Entidade" /></div>{audit.data!.items.length === 0 ? <Empty>Nenhum evento de auditoria encontrado.</Empty> : <div className="mt-4 overflow-x-auto"><table className="table"><thead><tr><th>Data</th><th>Autor</th><th>Ação</th><th>Entidade</th><th>ID</th></tr></thead><tbody>{audit.data!.items.map((event) => <tr key={event.id}><td>{date(event.created_at)}</td><td>{event.actor}</td><td>{event.action}</td><td>{event.entity_type}</td><td>{event.entity_id || '-'}</td></tr>)}</tbody></table><Pagination data={audit.data!} onPage={setPage} /></div>}</section></section>;
}

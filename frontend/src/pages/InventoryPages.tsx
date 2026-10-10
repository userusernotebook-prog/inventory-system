import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, queryString } from '../lib/api';
import type { Asset, Employee, Page } from '../types';
import { Empty, ErrorState, Loading, Status } from '../components/Feedback';
import { Pagination } from '../components/Pagination';
import { canUser } from '../lib/permissions';
import { useAuth } from '../auth/AuthProvider';

function ListToolbar({
  search,
  setSearch,
  label
}: {
  search: string;
  setSearch: (value: string) => void;
  label: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <input
        className="field max-w-sm"
        aria-label={`Buscar ${label}`}
        value={search}
        placeholder={`Buscar ${label}`}
        onChange={(event) => setSearch(event.target.value)}
      />
    </div>
  );
}
export function EmployeesPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const query = useQuery({
    queryKey: ['employees', page, q],
    queryFn: () => api<Page<Employee>>(`/api/employees?${queryString({ page, pageSize: 25, q })}`)
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  const data = query.data!;
  return (
    <section>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Funcionários</h1>
          <p className="text-slate-600">Cadastros, ativos vinculados e desligamentos.</p>
        </div>
      </div>
      <ListToolbar
        label="funcionários"
        search={q}
        setSearch={(value) => {
          setQ(value);
          setPage(1);
        }}
      />
      {data.items.length === 0 ? (
        <Empty />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Departamento</th>
                <th>Cidade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <Link
                      className="font-semibold text-blue-700 hover:underline"
                      to={`/employees/${employee.id}`}
                    >
                      {employee.name}
                    </Link>
                  </td>
                  <td>{employee.email || '—'}</td>
                  <td>{employee.department || '—'}</td>
                  <td>{employee.city || '—'}</td>
                  <td>
                    <Status value={employee.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination data={data} onPage={setPage} />
        </div>
      )}
    </section>
  );
}
export function AssetsPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const query = useQuery({
    queryKey: ['assets', page, q],
    queryFn: () => api<Page<Asset>>(`/api/assets?${queryString({ page, pageSize: 25, q })}`)
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  const data = query.data!;
  return (
    <section>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ativos</h1>
          <p className="text-slate-600">Inventário e situação operacional.</p>
        </div>
      </div>
      <ListToolbar
        label="ativos"
        search={q}
        setSearch={(value) => {
          setQ(value);
          setPage(1);
        }}
      />
      {data.items.length === 0 ? (
        <Empty />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Hostname</th>
                <th>Equipamento</th>
                <th>Modelo</th>
                <th>Serial</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((asset) => (
                <tr key={asset.id}>
                  <td>{asset.employee_name || '—'}</td>
                  <td>
                    <Link
                      className="font-semibold text-blue-700 hover:underline"
                      to={`/assets/${asset.id}`}
                    >
                      {asset.hostname || '—'}
                    </Link>
                  </td>
                  <td>{asset.equipment_type}</td>
                  <td>{asset.model || '—'}</td>
                  <td>{asset.serial || '—'}</td>
                  <td>
                    <Status value={asset.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination data={data} onPage={setPage} />
        </div>
      )}
    </section>
  );
}
export function AssetDetailPage() {
  const { id } = useParams();
  const asset = useQuery({
    queryKey: ['asset', id],
    queryFn: () => api<Asset>(`/api/assets/${id}`)
  });
  const history = useQuery({
    queryKey: ['asset-history', id],
    queryFn: () =>
      api<
        Array<{
          id: number;
          from_status: string;
          to_status: string;
          movement_type: string;
          occurred_at: string;
          reason?: string;
        }>
      >(`/api/assets/${id}/history`)
  });
  if (asset.isLoading || history.isLoading) return <Loading />;
  if (asset.error || history.error) return <ErrorState error={asset.error || history.error} />;
  const current = asset.data!;
  return (
    <section>
      <Link className="text-sm text-blue-700" to="/assets">
        ← Voltar para ativos
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {current.hostname || current.serial || `Ativo #${current.id}`}
          </h1>
          <p className="text-slate-600">
            {current.equipment_type} · {current.model || 'Sem modelo'}
          </p>
        </div>
        <Status value={current.status} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="font-bold">Linha do tempo</h2>
          <ol className="mt-4 space-y-4 border-l border-slate-200 pl-5">
            {history.data?.map((item) => (
              <li key={item.id}>
                <p className="font-semibold">
                  {item.from_status || 'Inicial'} → {item.to_status}
                </p>
                <p className="text-sm text-slate-600">
                  {item.movement_type} ·{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'America/Sao_Paulo'
                  }).format(new Date(item.occurred_at))}
                </p>
                {item.reason && <p className="text-sm">{item.reason}</p>}
              </li>
            ))}
          </ol>
        </section>
        <aside className="card">
          <h2 className="font-bold">Status atual</h2>
          <p className="mt-2 text-sm text-slate-600">
            As movimentações serão disponibilizadas no módulo de ativos.
          </p>
        </aside>
      </div>
    </section>
  );
}
export function EmployeeDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const employee = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api<Employee>(`/api/employees/${id}`)
  });
  const assets = useQuery({
    queryKey: ['employee-assets', id],
    queryFn: () => api<Asset[]>(`/api/employees/${id}/assets`)
  });
  const checklist = useQuery({
    queryKey: ['offboard-checklist', id],
    enabled: canUser(user, 'employee:offboard'),
    queryFn: () =>
      api<{ status: string; assets: Record<string, number>; events: unknown[] }>(
        `/api/employees/${id}/offboarding/checklist`
      )
  });
  if (employee.isLoading || assets.isLoading) return <Loading />;
  if (employee.error || assets.error) return <ErrorState error={employee.error || assets.error} />;
  const person = employee.data!;
  return (
    <section>
      <Link className="text-sm text-blue-700" to="/employees">
        ← Voltar para funcionários
      </Link>
      <div className="mt-4 flex justify-between">
        <div>
          <h1 className="text-2xl font-bold">{person.name}</h1>
          <p className="text-slate-600">
            {person.department || 'Sem departamento'} · {person.city || 'Sem cidade'}
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-bold">Ativos vinculados</h2>
          {assets.data?.length ? (
            <ul className="mt-3 space-y-2">
              {assets.data.map((asset) => (
                <li key={asset.id}>
                  <Link className="text-blue-700 hover:underline" to={`/assets/${asset.id}`}>
                    {asset.equipment_type} · {asset.hostname || asset.serial}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Sem ativos vinculados.</p>
          )}
        </section>
        {canUser(user, 'employee:offboard') && (
          <section className="card">
            <h2 className="font-bold">Checklist de desligamento</h2>
            {checklist.isLoading ? (
              <p className="mt-3 text-sm">Carregando checklist…</p>
            ) : (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {Object.entries(checklist.data?.assets || {}).map(([status, count]) => (
                  <div key={status} className="rounded bg-slate-50 p-3">
                    <dt>{status.replaceAll('_', ' ')}</dt>
                    <dd className="mt-1 text-lg font-bold">{count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}
      </div>
    </section>
  );
}

import type { Page } from '../types';
export function Pagination<T>({ data, onPage }: { data: Page<T>; onPage: (page: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>{data.total} registro(s)</span>
      <div className="flex gap-2">
        <button
          className="btn-secondary"
          disabled={data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          Anterior
        </button>
        <span className="px-2 py-2">
          Página {data.page} de {Math.max(data.totalPages, 1)}
        </span>
        <button
          className="btn-secondary"
          disabled={data.page >= data.totalPages}
          onClick={() => onPage(data.page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

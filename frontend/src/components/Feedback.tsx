export function Loading() {
  return (
    <div className="card text-slate-500" role="status">
      Carregando…
    </div>
  );
}
export function Empty({
  children = 'Nenhum registro encontrado.'
}: {
  children?: React.ReactNode;
}) {
  return <div className="card text-center text-slate-500">{children}</div>;
}
export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="card border-red-200 bg-red-50 text-red-800" role="alert">
      {error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
      {value.replaceAll('_', ' ')}
    </span>
  );
}

import type { ApiError } from '../types';

export class HttpError extends Error {
  constructor(
    public status: number,
    public payload: ApiError
  ) {
    super(payload.message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new HttpError(
      response.status,
      body?.error ?? { code: 'UNKNOWN', message: 'Não foi possível concluir a operação.' }
    );
  return body as T;
}
export const queryString = (values: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(values).forEach(
    ([key, value]) => value !== undefined && value !== '' && query.set(key, String(value))
  );
  return query.toString();
};

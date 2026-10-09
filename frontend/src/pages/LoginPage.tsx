import { FormEvent, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';

export function LoginPage() {
  const { refresh } = useAuth();
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWaiting(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: data.get('email'),
          password: data.get('password'),
          totp_code: data.get('totp_code') || undefined
        })
      });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.');
    } finally {
      setWaiting(false);
    }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-brand-950 p-5">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <p className="mb-2 text-sm font-semibold text-blue-700">GESTÃO DE ATIVOS DE TI</p>
        <h1 className="text-2xl font-bold">Acesse sua conta</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use seu e-mail corporativo e senha individual.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="label">
            E-mail
            <input className="field" name="email" type="email" autoComplete="username" required />
          </label>
          <label className="label">
            Senha
            <input
              className="field"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label className="label">
            Código 2FA <span className="font-normal text-slate-500">(se habilitado)</span>
            <input className="field" name="totp_code" inputMode="numeric" pattern="[0-9]*" />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="btn-primary w-full" disabled={waiting}>
            {waiting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}

export function OnboardingPage() {
  const { user, refresh } = useAuth();
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const password = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('password');
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ password: value })
      });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erro ao alterar senha.');
    }
  };
  const setup = async () => {
    const response = await api<{ secret: string; uri: string }>('/api/auth/totp/setup', {
      method: 'POST'
    });
    setSecret(response.secret);
  };
  const confirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api('/api/auth/totp/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: new FormData(event.currentTarget).get('code') })
      });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Código inválido.');
    }
  };
  if (user?.must_change_password)
    return (
      <main className="grid min-h-screen place-items-center p-5">
        <section className="card w-full max-w-md">
          <h1 className="text-xl font-bold">Defina sua senha pessoal</h1>
          <p className="mt-2 text-sm text-slate-600">
            A senha provisória deve ser trocada antes de continuar.
          </p>
          <form className="mt-5 space-y-4" onSubmit={password}>
            <input
              className="field"
              name="password"
              type="password"
              minLength={12}
              placeholder="Nova senha (mínimo 12 caracteres)"
              required
            />
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="btn-primary">Salvar senha</button>
          </form>
        </section>
      </main>
    );
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="card w-full max-w-md">
        <h1 className="text-xl font-bold">Configure a autenticação em duas etapas</h1>
        <p className="mt-2 text-sm text-slate-600">O 2FA é obrigatório para administradores.</p>
        {!secret ? (
          <button className="btn-primary mt-5" onClick={setup}>
            Gerar chave 2FA
          </button>
        ) : (
          <>
            <p className="mt-5 break-all rounded bg-slate-100 p-3 font-mono text-sm">{secret}</p>
            <p className="mt-2 text-sm">
              Cadastre a chave no aplicativo autenticador e informe o código gerado.
            </p>
            <form className="mt-4 space-y-3" onSubmit={confirm}>
              <input className="field" name="code" inputMode="numeric" required />
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button className="btn-primary">Confirmar 2FA</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

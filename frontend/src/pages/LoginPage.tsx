import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, HttpError } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail valido.'),
  password: z.string().min(1, 'Informe sua senha.'),
  totp_code: z.string().regex(/^\d{6}$/, 'Informe os seis digitos do 2FA.').or(z.literal(''))
});
const passwordSchema = z
  .object({
    password: z.string().min(12, 'A senha deve ter ao menos 12 caracteres.'),
    confirmation: z.string().min(1, 'Confirme a nova senha.')
  })
  .refine((value) => value.password === value.confirmation, {
    path: ['confirmation'],
    message: 'As senhas nao conferem.'
  });
const totpSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Informe os seis digitos do codigo.') });

function errorMessage(error: unknown) {
  return error instanceof HttpError || error instanceof Error
    ? error.message
    : 'Nao foi possivel concluir a operacao.';
}

export function LoginPage() {
  const { refresh } = useAuth();
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', totp_code: '' }
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ ...values, totp_code: values.totp_code || undefined })
      });
      await refresh();
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  });
  return (
    <main className="grid min-h-screen place-items-center bg-brand-950 p-5">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <p className="mb-2 text-sm font-semibold text-blue-700">GESTAO DE ATIVOS DE TI</p>
        <h1 className="text-2xl font-bold">Acesse sua conta</h1>
        <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
          <label className="label">E-mail<input className="field" type="email" autoComplete="username" {...form.register('email')} /></label>
          {form.formState.errors.email && <p className="field-error">{form.formState.errors.email.message}</p>}
          <label className="label">Senha<input className="field" type="password" autoComplete="current-password" {...form.register('password')} /></label>
          {form.formState.errors.password && <p className="field-error">{form.formState.errors.password.message}</p>}
          <label className="label">Codigo 2FA (se habilitado)<input className="field" inputMode="numeric" {...form.register('totp_code')} /></label>
          {form.formState.errors.totp_code && <p className="field-error">{form.formState.errors.totp_code.message}</p>}
          {form.formState.errors.root && <p role="alert" className="text-sm text-red-700">{form.formState.errors.root.message}</p>}
          <button className="btn-primary w-full" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </section>
    </main>
  );
}

export function OnboardingPage() {
  const { user, refresh, logout } = useAuth();
  const passwordForm = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });
  const totpForm = useForm<z.infer<typeof totpSchema>>({ resolver: zodResolver(totpSchema) });
  const passwordSubmit = passwordForm.handleSubmit(async ({ password }) => {
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ password }) });
      await refresh();
    } catch (error) { passwordForm.setError('root', { message: errorMessage(error) }); }
  });
  const [secret, setSecret] = useState<string>();
  const [setupError, setSetupError] = useState<string>();
  const setup = async () => {
    try { setSecret((await api<{ secret: string }>('/api/auth/totp/setup', { method: 'POST' })).secret); }
    catch (error) { setSetupError(errorMessage(error)); }
  };
  const confirm = totpForm.handleSubmit(async ({ code }) => {
    try {
      await api('/api/auth/totp/confirm', { method: 'POST', body: JSON.stringify({ code }) });
      await refresh();
    } catch (error) { totpForm.setError('root', { message: errorMessage(error) }); }
  });
  return <main className="grid min-h-screen place-items-center p-5"><section className="card w-full max-w-md">
    <div className="flex items-start justify-between gap-4"><h1 className="text-xl font-bold">{user?.must_change_password ? 'Defina sua senha pessoal' : 'Configure a autenticacao em duas etapas'}</h1><button className="text-sm underline" onClick={() => logout()}>Sair</button></div>
    {user?.must_change_password ? <form className="mt-5 space-y-3" onSubmit={passwordSubmit} noValidate>
      <label className="label">Nova senha<input className="field" type="password" autoComplete="new-password" {...passwordForm.register('password')} /></label>
      {passwordForm.formState.errors.password && <p className="field-error">{passwordForm.formState.errors.password.message}</p>}
      <label className="label">Confirmar nova senha<input className="field" type="password" autoComplete="new-password" {...passwordForm.register('confirmation')} /></label>
      {passwordForm.formState.errors.confirmation && <p className="field-error">{passwordForm.formState.errors.confirmation.message}</p>}
      {passwordForm.formState.errors.root && <p role="alert" className="field-error">{passwordForm.formState.errors.root.message}</p>}
      <button className="btn-primary" type="submit" disabled={passwordForm.formState.isSubmitting}>Salvar senha</button>
    </form> : <div className="mt-5 space-y-4">
      {!secret ? <button className="btn-primary" onClick={setup}>Gerar chave 2FA</button> : <><p className="rounded bg-slate-100 p-3 font-mono text-sm break-all">{secret}</p><form className="space-y-3" onSubmit={confirm} noValidate><label className="label">Codigo do autenticador<input className="field" inputMode="numeric" {...totpForm.register('code')} /></label>{totpForm.formState.errors.code && <p className="field-error">{totpForm.formState.errors.code.message}</p>}{totpForm.formState.errors.root && <p role="alert" className="field-error">{totpForm.formState.errors.root.message}</p>}<button className="btn-primary" type="submit" disabled={totpForm.formState.isSubmitting}>Confirmar 2FA</button></form></>}
      {setupError && <p role="alert" className="field-error">{setupError}</p>}
    </div>}
  </section></main>;
}

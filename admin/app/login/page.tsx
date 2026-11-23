import { redirect } from 'next/navigation';
import { sessionState } from '@admin/lib/session';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const s = await sessionState();
  if (s.state === 'admin') redirect('/');
  if (s.state === 'mfa') redirect('/login/2fa');
  return (
    <main className="login">
      <h1>Granula! <span>manažér</span></h1>
      {s.state === 'forbidden' ? <p className="msg err">Účet {s.email} nemá prístup do manažéra.</p> : null}
      <LoginForm />
    </main>
  );
}

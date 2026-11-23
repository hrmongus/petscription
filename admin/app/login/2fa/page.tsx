import { redirect } from 'next/navigation';
import { sessionState } from '@admin/lib/session';
import { logoutAction } from '../actions';
import { EnrollForm, VerifyForm } from './mfa-forms';

export default async function MfaPage() {
  const s = await sessionState();
  if (s.state === 'admin') redirect('/');
  if (s.state !== 'mfa') redirect('/login');
  const factor = (s.user.factors ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified');
  return (
    <main className="login">
      <h1>Granula! <span>manažér</span></h1>
      <p className="small">Prihlásený ako {s.user.email}</p>
      {factor ? <VerifyForm factorId={factor.id} /> : <EnrollForm />}
      <form action={logoutAction}>
        <button className="link">Odhlásiť sa</button>
      </form>
    </main>
  );
}

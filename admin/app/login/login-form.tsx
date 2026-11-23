'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export function LoginForm() {
  const [state, run, pending] = useActionState(loginAction, null);
  return (
    <form action={run} className="stack">
      <label>
        E-mail
        <input name="email" type="email" autoComplete="username" required autoFocus />
      </label>
      <label>
        Heslo
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="btn" disabled={pending}>{pending ? 'Prihlasujem…' : 'Prihlásiť sa'}</button>
      {state?.msg ? <p className={state.ok ? 'msg ok' : 'msg err'}>{state.msg}</p> : null}
    </form>
  );
}

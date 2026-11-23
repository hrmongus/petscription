'use client';

import { useActionState } from 'react';
import { enrollAction, verifyAction } from '../actions';

function CodeForm({ factorId }: { factorId: string }) {
  const [state, run, pending] = useActionState(verifyAction, null);
  return (
    <form action={run} className="stack">
      <input type="hidden" name="factorId" value={factorId} />
      <label>
        Kód z aplikácie
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      </label>
      <button className="btn" disabled={pending}>{pending ? 'Overujem…' : 'Overiť'}</button>
      {state?.msg ? <p className="msg err">{state.msg}</p> : null}
    </form>
  );
}

export function VerifyForm({ factorId }: { factorId: string }) {
  return (
    <>
      <p>Zadaj 6-miestny kód z overovacej aplikácie.</p>
      <CodeForm factorId={factorId} />
    </>
  );
}

export function EnrollForm() {
  const [state, run, pending] = useActionState(enrollAction, null);
  const d = state?.data as { factorId: string; qr: string; secret: string } | undefined;
  if (d) {
    return (
      <>
        <p>Naskenuj QR kód v aplikácii (Google Authenticator, Microsoft Authenticator, 1Password…) a zadaj kód, ktorý ukáže.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.qr} alt="QR kód pre overovaciu aplikáciu" width={200} height={200} className="qr" />
        <p className="small">
          Alebo zadaj kľúč ručne: <code>{d.secret}</code>
        </p>
        <CodeForm factorId={d.factorId} />
      </>
    );
  }
  return (
    <form action={run} className="stack">
      <p>Manažér vyžaduje dvojfázové overenie. Pri prvom prihlásení si ho nastav v overovacej aplikácii v telefóne.</p>
      <button className="btn" disabled={pending}>{pending ? 'Pripravujem…' : 'Nastaviť overenie'}</button>
      {state?.msg ? <p className={state.ok ? 'msg ok' : 'msg err'}>{state.msg}</p> : null}
    </form>
  );
}

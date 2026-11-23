'use client';

import { useActionState, type ReactNode } from 'react';
import type { ActionResult } from '@admin/lib/action';

/*
 * Formulár pre serverovú akciu admina: zobrazí výsledok (ok / chyba), počas behu zablokuje tlačidlo,
 * pri nebezpečných akciách (refund, storno, zrušenie) sa najprv opýta (confirm).
 */
export function ActionForm({
  action,
  children,
  confirm,
  submit,
  danger,
  className,
  inline,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children?: ReactNode;
  confirm?: string;
  submit: string;
  danger?: boolean;
  className?: string;
  inline?: boolean;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form
      action={run}
      className={`${inline ? 'af inline' : 'af'} ${className ?? ''}`}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <button type="submit" className={danger ? 'btn danger' : 'btn'} disabled={pending}>
        {pending ? 'Pracujem…' : submit}
      </button>
      {state?.msg ? (
        <p className={state.ok ? 'msg ok' : 'msg err'} role="status" key={state.at}>
          {state.msg}
        </p>
      ) : null}
    </form>
  );
}

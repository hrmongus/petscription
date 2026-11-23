'use client';

import { startTransition, useActionState, useRef } from 'react';
import type { ActionResult } from '@admin/lib/action';

/*
 * Zmena receptúry / balenia / váhy / veku: najprv „Prepočítať“ (náhľad, nič nemení), potom „Potvrdiť zmenu“.
 * Server pri potvrdení počíta znova z tých istých vstupov (náhľad sa neprenáša).
 */
export function PlanChange({
  id,
  preview,
  apply,
  products,
  current,
}: {
  id: string;
  preview: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  apply: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  products: { id: string; name: string }[];
  current: { productId: string; bagId: string; kg: number | string; years: string; months: string };
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pv, runPreview, previewing] = useActionState(preview, null);
  const [, runApply, applying] = useActionState(apply, null);
  const data = pv?.ok ? (pv.data as { changed: boolean; rows: string[][] }) : null;
  return (
    <form
      ref={form}
      className="af"
      onSubmit={(e) => {
        // bez form action: React by po akcii formulár vynuloval a potvrdenie by poslalo pôvodné hodnoty
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => runPreview(fd));
      }}
    >
      <input type="hidden" name="id" value={id} />
      <div className="row">
        <label>
          Receptúra
          <select name="product" defaultValue={current.productId}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Balenie
          <select name="bag" defaultValue={current.bagId}>
            <option value="4">4 kg</option>
            <option value="9">9 kg</option>
            <option value="18">18 kg</option>
          </select>
        </label>
        <label>
          Hmotnosť (kg)
          <input name="kg" inputMode="decimal" defaultValue={String(current.kg).replace('.', ',')} size={6} />
        </label>
        <label>
          Vek: roky
          <input name="years" inputMode="numeric" placeholder={current.years} size={4} />
        </label>
        <label>
          mesiace
          <input name="months" inputMode="numeric" placeholder={current.months} size={4} />
        </label>
      </div>
      <p className="small muted">Vek vyplň iba pri oprave (inak sa počíta z dátumu narodenia). Receptúra mimo odporúčania engine je povolená, v náhľade bude označená.</p>
      <div className="row">
        <button className="btn ghost" disabled={previewing}>{previewing ? 'Počítam…' : 'Prepočítať (náhľad)'}</button>
        {data?.changed ? (
          <button
            type="button"
            className="btn"
            disabled={applying}
            onClick={() => {
              if (!form.current || !window.confirm('Zmeniť predplatné podľa náhľadu?')) return;
              const fd = new FormData(form.current);
              startTransition(() => runApply(fd));
            }}
          >
            {applying ? 'Mením…' : 'Potvrdiť zmenu'}
          </button>
        ) : null}
      </div>
      {data ? (
        <table className="t small">
          <thead>
            <tr>
              <th></th>
              <th>Teraz</th>
              <th>Po zmene</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r[0]}>
                <th>{r[0]}</th>
                <td>{r[1]}</td>
                <td>{r[1] !== r[2] ? <b>{r[2]}</b> : r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </form>
  );
}

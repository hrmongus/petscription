'use client';

import { useState, useTransition } from 'react';
import type { ActionResult } from '@admin/lib/action';
import { ActionForm } from './action-form';

type Method = 'packeta_point' | 'dpd_pickup' | 'sps_courier';
type Point = { id: string; label: string; kind: string };

/*
 * Zmena doručenia (objednávka v pending alebo pred odoslaním do FHB, adresa predplatného). Výdajné miesto sa hľadá
 * v aktuálnom zozname FHB; server ho overí znova (resolveDelivery) a názov aj adresu berie z FHB.
 * Adresa zákazníka je povinná pri každom spôsobe (FHB 24. 11. 2026: dopravcovia ju chcú aj pri výdajnom mieste),
 * PSČ musí existovať (lib/psc.ts, overí server).
 */
export function DeliveryForm({
  action,
  hidden,
  initial,
  methods,
  labels,
  boxes,
  search,
  submit = 'Uložiť doručenie',
  note,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  hidden: Record<string, string>;
  initial: { method: string; name: string; email: string; phone: string; point_id?: string | null; point_label?: string | null; street?: string | null; zip?: string | null; city?: string | null };
  methods: Method[];
  labels: Record<string, string>;
  boxes: Record<string, boolean>;
  search: (service: 'packeta' | 'dpd', q: string, boxes: boolean) => Promise<Point[]>;
  submit?: string;
  note?: string;
}) {
  const [method, setMethod] = useState<Method>((methods.includes(initial.method as Method) ? initial.method : methods[0]) as Method);
  const [point, setPoint] = useState<{ id: string; label: string } | null>(initial.point_id && initial.method === method ? { id: initial.point_id, label: initial.point_label ?? initial.point_id } : null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Point[] | null>(null);
  const [busy, start] = useTransition();
  const pickup = method !== 'sps_courier';
  const service = method === 'packeta_point' ? 'packeta' : 'dpd';

  return (
    <ActionForm action={action} submit={submit}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {note ? <p className="small">{note}</p> : null}
      <label>
        Spôsob
        <select
          name="method"
          value={method}
          onChange={(e) => {
            setMethod(e.target.value as Method);
            setPoint(null);
            setFound(null);
          }}
        >
          {methods.map((m) => (
            <option key={m} value={m}>
              {labels[m]}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          Meno a priezvisko
          <input name="name" defaultValue={initial.name} required />
        </label>
        <label>
          E-mail
          <input name="email" type="email" defaultValue={initial.email} required maxLength={50} />
        </label>
        <label>
          Telefón
          <input name="phone" defaultValue={initial.phone} required />
        </label>
      </div>
      {pickup ? (
        <>
          <input type="hidden" name="point" value={point?.id ?? ''} />
          <p className="small">
            Miesto: <b>{point ? `${point.label} (${point.id})` : 'nevybrané'}</b>
            {!boxes[method] ? ' · pri tomto balení iba odberné miesta, bez boxov' : ''}
          </p>
          <div className="row">
            <label>
              Hľadať miesto (mesto, PSČ, ulica)
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    start(async () => setFound(await search(service, q, boxes[method])));
                  }
                }}
              />
            </label>
            <button type="button" className="btn ghost" disabled={busy || q.trim().length < 2} onClick={() => start(async () => setFound(await search(service, q, boxes[method])))}>
              {busy ? 'Hľadám…' : 'Hľadať'}
            </button>
          </div>
          {found ? (
            <ul className="small" style={{ maxHeight: 200, overflowY: 'auto', margin: 0, paddingLeft: 18 }}>
              {found.length ? null : <li>Nič sa nenašlo.</li>}
              {found.map((p) => (
                <li key={p.id}>
                  <button type="button" className="link" onClick={() => setPoint(p)}>
                    {p.label}
                  </button>{' '}
                  <span className="muted">
                    {p.id}
                    {p.kind === 'box' ? ' · box' : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <p className="small">{pickup ? 'Adresa zákazníka (dopravca ju vyžaduje aj pri výdajnom mieste; balík ide na miesto vyššie)' : 'Adresa doručenia'}</p>
      {
        <div className="row">
          <label>
            Ulica a číslo
            <input name="street" defaultValue={initial.street ?? ''} required size={30} />
          </label>
          <label>
            PSČ
            <input name="zip" defaultValue={initial.zip ?? ''} required size={6} />
          </label>
          <label>
            Mesto
            <input name="city" defaultValue={initial.city ?? ''} required />
          </label>
        </div>
      }
    </ActionForm>
  );
}

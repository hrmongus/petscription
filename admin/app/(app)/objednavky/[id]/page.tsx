import Link from 'next/link';
import { notFound } from 'next/navigation';
import { boxesAllowed, methodsFor, METHODS, type DeliveryMethod } from '@lib/carriers';
import { db } from '@lib/db';
import { fhbOrderId } from '@lib/fhb/build-order';
import { bagOfItems, fhbState, paymentInfo, type FhbState, type PaymentInfo } from '@lib/order-actions';
import { ActionForm } from '@admin/components/action-form';
import { Badge } from '@admin/components/badge';
import { DeliveryForm } from '@admin/components/delivery-form';
import { History } from '@admin/components/history';
import { fhb, stripe } from '@admin/lib/deps';
import { dt, eur, json, kindLabel, methodLabel, skuLabel, type ShipToView } from '@admin/lib/format';
import { historyOf } from '@admin/lib/history';
import { stripeUrl } from '@admin/lib/links';
import { cancelAction, deliveryAction, refundAction, resendAction, reshipAction, searchPointsAction } from './actions';
import { requireAdmin } from '@admin/lib/session';

export const metadata = { title: 'Objednávka' };

type FhbView = { status?: string; tracking_numbers?: string[]; tracking_links?: string[]; shipped_at?: string; delivered_at?: string; returned_at?: string; return_type?: string; parcel_service?: string; delivery_point?: string };

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: o } = await db().from('orders').select('*, customers(id, email, name, phone, stripe_customer_id)').eq('id', id).maybeSingle();
  if (!o) notFound();
  const c = o.customers as { id: string; email: string; name: string | null; phone: string | null; stripe_customer_id: string | null } | null;
  const ship = (o.ship_to ?? {}) as ShipToView;

  const [state, pay, history, reships, parent] = await Promise.all([
    fhbState(o, fhb()).catch((e) => ({ fhb: null, mode: 'none', reason: (e as Error).message, unavailable: true }) as FhbState),
    o.amount_cents > 0 ? paymentInfo(o.stripe_ref, stripe()).catch((e) => ({ error: (e as Error).message })) : Promise.resolve(null),
    historyOf('order', o.id),
    db().from('orders').select('id, number, status').eq('reship_of', o.id).order('number'),
    o.reship_of ? db().from('orders').select('id, number').eq('id', o.reship_of).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const f = state.fhb as FhbView | null;
  const payment = pay && 'paymentIntentId' in pay ? (pay as PaymentInfo) : null;
  const remaining = payment ? payment.amount - payment.refunded : 0;
  const bag = (() => {
    try {
      return bagOfItems(o.items);
    } catch {
      return null;
    }
  })();
  const err = o.fhb_error as { message?: string; violations?: Record<string, { code?: string; message?: string }[] | string[]> } | null;
  const editable = state.mode !== 'none';

  return (
    <>
      <p className="small">
        <Link href="/objednavky">← Objednávky</Link>
      </p>
      <h1>
        Objednávka #{o.number} <Badge status={o.status} />
      </h1>
      <p className="small">
        {kindLabel(o)} · vytvorená {dt(o.created_at)} · FHB id <code>{fhbOrderId(o.number)}</code>
        {parent?.data ? (
          <>
            {' '}
            · znova odoslaná za <Link href={`/objednavky/${parent.data.id}`}>#{parent.data.number}</Link>
          </>
        ) : null}
        {o.subscription_id ? (
          <>
            {' '}
            · <Link href={`/predplatne/${o.subscription_id}`}>predplatné</Link>
          </>
        ) : null}
      </p>

      {err && o.status === 'fhb_error' ? (
        <div className="msg err" style={{ marginBottom: 14 }}>
          Chyba FHB: {err.message}
          {err.violations ? (
            <ul className="small">
              {Object.entries(err.violations).map(([k, v]) => (
                <li key={k}>
                  <b>{k}</b>: {(v as ({ code?: string; message?: string } | string)[]).map((x) => (typeof x === 'string' ? x : `${x.message ?? ''} ${x.code ? `(${x.code})` : ''}`)).join('; ')}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid2">
        <section className="panel">
          <h2>Zákazník a doručenie</h2>
          <dl className="kv">
            <dt>Zákazník</dt>
            <dd>
              {c?.name ?? ship.name} · <a href={`mailto:${c?.email ?? ship.email}`}>{c?.email ?? ship.email}</a>
            </dd>
            <dt>Príjemca</dt>
            <dd>{ship.name}</dd>
            <dt>Telefón</dt>
            <dd>{ship.phone}</dd>
            <dt>E-mail</dt>
            <dd>{ship.email}</dd>
            <dt>Spôsob</dt>
            <dd>{methodLabel(ship.delivery_method)}</dd>
            {ship.point_id ? (
              <>
                <dt>Miesto</dt>
                <dd>
                  {ship.point_label} <code>{ship.point_id}</code>
                </dd>
              </>
            ) : (
              <>
                <dt>Adresa</dt>
                <dd>
                  {ship.street}, {ship.zip} {ship.city}
                </dd>
              </>
            )}
          </dl>
          <h2>Položky</h2>
          <ul>
            {(o.items as { sku: string; qty: number }[]).map((i) => (
              <li key={i.sku}>
                {i.qty} × {skuLabel(i.sku)} <code className="small">{i.sku}</code>
              </li>
            ))}
          </ul>
          <p>
            Suma: <b>{eur(o.amount_cents)}</b>
          </p>
        </section>

        <section className="panel">
          <h2>FHB (naživo)</h2>
          {state.unavailable ? <p className="msg warn">{state.reason}</p> : null}
          {f ? (
            <dl className="kv">
              <dt>Stav FHB</dt>
              <dd>
                <b>{f.status}</b>
              </dd>
              <dt>Služba</dt>
              <dd>
                {f.parcel_service ?? '—'} {f.delivery_point ? <code>{f.delivery_point}</code> : null}
              </dd>
              <dt>Odoslaná</dt>
              <dd>{dt(f.shipped_at ?? o.shipped_at)}</dd>
              <dt>Doručená</dt>
              <dd>{dt(f.delivered_at ?? o.delivered_at)}</dd>
              {f.returned_at ? (
                <>
                  <dt>Vrátená</dt>
                  <dd>
                    {dt(f.returned_at)} {f.return_type}
                  </dd>
                </>
              ) : null}
              <dt>Tracking</dt>
              <dd>
                {(f.tracking_links ?? []).length
                  ? f.tracking_links!.map((l, i) => (
                      <a key={l} href={l} target="_blank" rel="noreferrer">
                        {f.tracking_numbers?.[i] ?? l}{' '}
                      </a>
                    ))
                  : (f.tracking_numbers ?? []).join(', ') || '—'}
              </dd>
            </dl>
          ) : !state.unavailable ? (
            <p className="small">Vo FHB nie je.</p>
          ) : null}
          <p className="small muted">{state.reason}</p>

          <h2>Platba (Stripe)</h2>
          {o.amount_cents <= 0 ? (
            <p className="small">Bez platby (opätovné odoslanie).</p>
          ) : payment ? (
            <dl className="kv">
              <dt>Zaplatené</dt>
              <dd>
                {eur(payment.amount)} · {payment.status}
              </dd>
              <dt>Karta</dt>
              <dd>{payment.card ?? '—'}</dd>
              <dt>Vrátené</dt>
              <dd>{payment.refunded ? <b>{eur(payment.refunded)}</b> : '—'}</dd>
              {payment.refunds.map((r) => (
                <dd key={r.id} className="small" style={{ gridColumn: 2 }}>
                  {dt(r.created)} · {eur(r.amount)} · {r.status}
                </dd>
              ))}
              <dt>Stripe</dt>
              <dd className="small">
                <a href={stripeUrl(`payments/${payment.paymentIntentId}`)} target="_blank" rel="noreferrer">
                  {payment.paymentIntentId}
                </a>
                {payment.receiptUrl ? (
                  <>
                    {' '}
                    ·{' '}
                    <a href={payment.receiptUrl} target="_blank" rel="noreferrer">
                      potvrdenie
                    </a>
                  </>
                ) : null}
              </dd>
            </dl>
          ) : (
            <p className="msg warn small">Platbu sa nepodarilo načítať{pay && 'error' in pay ? `: ${pay.error}` : ''}. Ref: {o.stripe_ref}</p>
          )}
          {(reships.data ?? []).length ? (
            <>
              <h2>Znova odoslané</h2>
              <ul>
                {reships.data!.map((r) => (
                  <li key={r.id}>
                    <Link href={`/objednavky/${r.id}`}>#{r.number}</Link> <Badge status={r.status} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>

      <section className="panel actions">
        <h2>Akcie</h2>
        {['paid', 'fhb_error'].includes(o.status) ? (
          <ActionForm action={resendAction} submit="Znova odoslať do FHB" inline>
            <input type="hidden" name="id" value={o.id} />
          </ActionForm>
        ) : null}

        {editable && bag ? (
          <details>
            <summary>Upraviť doručenie</summary>
            <DeliveryForm
              action={deliveryAction}
              hidden={{ id: o.id }}
              initial={{ method: ship.delivery_method ?? '', name: ship.name ?? '', email: ship.email ?? '', phone: ship.phone ?? '', point_id: ship.point_id, point_label: ship.point_label, street: ship.street, zip: ship.zip, city: ship.city }}
              methods={methodsFor(bag)}
              labels={Object.fromEntries(Object.entries(METHODS).map(([k, v]) => [k, v.label]))}
              boxes={Object.fromEntries(methodsFor(bag).map((m) => [m, boxesAllowed(m as DeliveryMethod, bag)]))}
              search={searchPointsAction}
              note={state.mode === 'fhb' ? 'Zmení sa aj vo FHB (objednávka tam čaká v stave pending).' : 'Objednávka ešte nie je vo FHB; po uložení ju odošli.'}
            />
          </details>
        ) : (
          <p className="small muted">Doručenie a storno: {state.reason}</p>
        )}

        {editable ? (
          <details>
            <summary>Stornovať</summary>
            <ActionForm action={cancelAction} submit="Stornovať objednávku" danger confirm={`Naozaj stornovať objednávku #${o.number}?`}>
              <input type="hidden" name="id" value={o.id} />
              {o.amount_cents > 0 && remaining > 0 ? (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" name="refund" defaultChecked /> a vrátiť peniaze ({eur(remaining)})
                </label>
              ) : null}
              <p className="small">{state.mode === 'fhb' ? 'Zmaže objednávku vo FHB (DELETE /order).' : 'Vo FHB nie je, stornuje sa iba u nás.'} Predplatné sa tým nezruší.</p>
            </ActionForm>
          </details>
        ) : null}

        {o.amount_cents > 0 && remaining > 0 ? (
          <details>
            <summary>Vrátiť peniaze (refund)</summary>
            <ActionForm action={refundAction} submit="Vrátiť peniaze" danger confirm={`Vrátiť peniaze za objednávku #${o.number}?`}>
              <input type="hidden" name="id" value={o.id} />
              <div className="row">
                <label>
                  Suma v € (prázdne = celý zostatok {eur(remaining)})
                  <input name="amount" inputMode="decimal" placeholder={(remaining / 100).toFixed(2).replace('.', ',')} />
                </label>
                <label>
                  Poznámka (interná)
                  <input name="note" size={30} />
                </label>
              </div>
              <p className="small">Peniaze pôjdu späť na kartu zákazníka. Celý refund nastaví stav „Peniaze vrátené“; tovar ani predplatné sa tým nemenia.</p>
            </ActionForm>
          </details>
        ) : null}

        {['returned', 'sent', 'delivered'].includes(o.status) ? (
          <details>
            <summary>Poslať znova (nová zásielka bez platby)</summary>
            <ActionForm action={reshipAction} submit="Poslať znova" confirm={`Vytvoriť novú zásielku s rovnakým tovarom pre #${o.number}?`}>
              <input type="hidden" name="id" value={o.id} />
              <p className="small">Vytvorí novú objednávku (0 €, rovnaké položky a doručenie) a hneď ju odošle do FHB. Ak treba inú adresu, uprav ju v novej objednávke, kým je vo FHB pending.</p>
            </ActionForm>
          </details>
        ) : null}
      </section>

      <section className="panel">
        <h2>História</h2>
        <History items={history} />
        <details>
          <summary className="small">Surové dáta</summary>
          <pre className="json">{json({ ...o, customers: undefined })}</pre>
        </details>
      </section>
    </>
  );
}

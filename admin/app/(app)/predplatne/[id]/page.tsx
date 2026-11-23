import Link from 'next/link';
import { notFound } from 'next/navigation';
import type Stripe from 'stripe';
import { boxesAllowed, methodsFor, METHODS, type BagKey, type DeliveryMethod } from '@lib/carriers';
import { answersAt } from '@lib/checkout';
import { db } from '@lib/db';
import type { Answers } from '@lib/engine-server';
import { addDays } from '@lib/subscription-schedule';
import { ActionForm } from '@admin/components/action-form';
import { Badge } from '@admin/components/badge';
import { DeliveryForm } from '@admin/components/delivery-form';
import { History } from '@admin/components/history';
import { PlanChange } from '@admin/components/plan-change';
import { stripe } from '@admin/lib/deps';
import { day, dt, eur, json, kindLabel, methodLabel, PRODUCTS, productName, ymdLocal } from '@admin/lib/format';
import { historyOf } from '@admin/lib/history';
import { stripeUrl } from '@admin/lib/links';
import { loadSubscription } from '@admin/lib/subscription';
import { searchPointsAction } from '../../objednavky/[id]/actions';
import { addressAction, applyAction, cancelAction, moveAction, pauseAction, previewAction, resumeAction, skipAction, uncancelAction } from './actions';

export const metadata = { title: 'Predplatné' };

export default async function SubscriptionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await loadSubscription(id);
  if (!c) notFound();
  const { sub, dog, address, customer } = c;
  const [orders, history, live] = await Promise.all([
    db().from('orders').select('id, number, kind, reship_of, status, amount_cents, created_at, delivered_at').eq('subscription_id', sub.id).order('created_at', { ascending: false }),
    historyOf('subscription', sub.id),
    sub.stripe_subscription_id
      ? stripe()
          .subscriptions.retrieve(sub.stripe_subscription_id)
          .catch((e) => ({ error: (e as Error).message }) as const)
      : Promise.resolve(null),
  ]);
  const s = live && !('error' in live) ? (live as Stripe.Subscription) : null;
  const a = dog.answers as Answers;
  const age = dog.birth_date ? answersAt(a, dog.birth_date, new Date()) : a;
  const shipItem = s?.items.data.find((i) => (typeof i.price.product === 'string' ? i.price.product : i.price.product?.id) === 'granula-doprava');
  const total = s?.items.data.reduce((x, i) => x + (i.price.unit_amount ?? 0) * (i.quantity ?? 1), 0) ?? null;
  const open = sub.status !== 'cancelled';
  const tomorrow = ymdLocal(addDays(new Date(), 1));
  const bag = sub.bag_id as BagKey;

  return (
    <>
      <p className="small">
        <Link href="/predplatne">← Predplatné</Link>
      </p>
      <h1>
        {customer.name ?? customer.email} · {dog.name} <Badge status={sub.status} kind="sub" />
      </h1>
      {s?.cancel_at_period_end || s?.cancel_at ? <p className="msg warn">V Stripe je nastavené zrušenie k {day(s.cancel_at ?? s.trial_end ?? null)}; ďalšia platba neprebehne.</p> : null}
      {s?.pause_collection ? <p className="msg warn">Pozastavené{s.pause_collection.resumes_at ? ` do ${day(s.pause_collection.resumes_at)}` : ' bez dátumu obnovenia'} (faktúry sa nevytvárajú).</p> : null}
      {live && 'error' in live ? <p className="msg warn">Stripe: {live.error}</p> : null}

      <div className="grid2">
        <section className="panel">
          <h2>Predplatné</h2>
          <dl className="kv">
            <dt>Receptúra</dt>
            <dd>
              {productName(sub.product_id)} · {sub.bag_id} kg
            </dd>
            <dt>Dávka</dt>
            <dd>{sub.grams_per_day} g/deň</dd>
            <dt>D (interval)</dt>
            <dd>{sub.days_per_bag} dní</dd>
            <dt>Cena</dt>
            <dd>
              vrece {eur(sub.unit_amount_cents)}
              {s ? ` + doprava ${shipItem ? eur(shipItem.price.unit_amount) : 'zadarmo'} = ${eur(total)}` : ''}
            </dd>
            <dt>Ďalšia platba</dt>
            <dd>
              <b>{open ? dt(sub.next_charge_at) : '—'}</b>
              {s?.trial_end && open && Math.abs(s.trial_end * 1000 - new Date(sub.next_charge_at ?? 0).getTime()) > 3600_000 && s.status === 'trialing' ? <span className="small"> (Stripe: {dt(s.trial_end)})</span> : null}
            </dd>
            <dt>Posledné doručenie</dt>
            <dd>{day(sub.last_delivered_at)}</dd>
            <dt>Vytvorené</dt>
            <dd>{dt(sub.created_at)}</dd>
            <dt>Stripe</dt>
            <dd className="small">
              {sub.stripe_subscription_id ? (
                <a href={stripeUrl(`subscriptions/${sub.stripe_subscription_id}`)} target="_blank" rel="noreferrer">
                  {sub.stripe_subscription_id}
                </a>
              ) : '—'}{' '}
              {s ? `· ${s.status}` : ''}
            </dd>
          </dl>
        </section>
        <section className="panel">
          <h2>Zákazník a pes</h2>
          <dl className="kv">
            <dt>Zákazník</dt>
            <dd>
              {customer.name} · <a href={`mailto:${customer.email}`}>{customer.email}</a> · {customer.phone}
            </dd>
            <dt>Pes</dt>
            <dd>
              {dog.name} ({a.sex}), {a.breed}
            </dd>
            <dt>Hmotnosť</dt>
            <dd>{String(a.kg).replace('.', ',')} kg</dd>
            <dt>Vek</dt>
            <dd>
              {age.years} r. {age.months} m.{dog.birth_date ? <span className="small muted"> (nar. ~{day(dog.birth_date)})</span> : null}
            </dd>
            <dt>Aktivita</dt>
            <dd>
              {a.activity}
              {a.allergies?.length ? ` · alergie: ${a.allergies.join(', ')}` : ''}
            </dd>
            <dt>Doručenie</dt>
            <dd>
              {methodLabel(address.delivery_method)}: {address.point_label ?? `${address.street}, ${address.zip} ${address.city}`}
            </dd>
          </dl>
        </section>
      </div>

      {open ? (
        <section className="panel actions">
          <h2>Akcie</h2>
          {sub.status !== 'paused' ? (
            <>
              <ActionForm action={moveAction} submit="Posunúť ďalšiu platbu" inline>
                <input type="hidden" name="id" value={sub.id} />
                <label>
                  Nový dátum platby
                  <input type="date" name="date" min={tomorrow} defaultValue={ymdLocal(sub.next_charge_at)} required />
                </label>
              </ActionForm>
              <ActionForm action={skipAction} submit={`Preskočiť dodávku (+${sub.days_per_bag} dní)`} inline confirm="Preskočiť jednu dodávku?">
                <input type="hidden" name="id" value={sub.id} />
                <span className="small">ďalšia platba {sub.next_charge_at ? day(addDays(new Date(sub.next_charge_at), sub.days_per_bag)) : '—'}</span>
              </ActionForm>
              <details>
                <summary>Pozastaviť</summary>
                <ActionForm action={pauseAction} submit="Pozastaviť" inline>
                  <input type="hidden" name="id" value={sub.id} />
                  <label>
                    Obnoviť automaticky (voliteľné)
                    <input type="date" name="until" min={tomorrow} />
                  </label>
                </ActionForm>
              </details>
            </>
          ) : (
            <ActionForm action={resumeAction} submit="Obnoviť predplatné" inline>
              <input type="hidden" name="id" value={sub.id} />
              <label>
                Ďalšia platba
                <input type="date" name="date" min={tomorrow} defaultValue={tomorrow} required />
              </label>
            </ActionForm>
          )}
          <details>
            <summary>Zmeniť receptúru, balenie, váhu alebo vek (prepočet)</summary>
            <PlanChange
              id={sub.id}
              preview={previewAction}
              apply={applyAction}
              products={PRODUCTS}
              current={{ productId: sub.product_id, bagId: sub.bag_id, kg: a.kg, years: age.years, months: age.months }}
            />
          </details>
          <details>
            <summary>Zmeniť doručenie pre ďalšie dodávky</summary>
            <DeliveryForm
              action={addressAction}
              hidden={{ id: sub.id }}
              initial={{ method: address.delivery_method, name: address.name, email: customer.email, phone: customer.phone ?? '', point_id: address.point_id, point_label: address.point_label, street: address.delivery_method === 'sps_courier' ? address.street : '', zip: address.delivery_method === 'sps_courier' ? address.zip : '', city: address.delivery_method === 'sps_courier' ? address.city : '' }}
              methods={methodsFor(bag)}
              labels={Object.fromEntries(Object.entries(METHODS).map(([k, v]) => [k, v.label]))}
              boxes={Object.fromEntries(methodsFor(bag).map((m) => [m, boxesAllowed(m as DeliveryMethod, bag)]))}
              search={searchPointsAction}
              note="Platí od ďalšej objednávky; e-mail ostáva e-mail zákazníka. Ak sa zmení cena dopravy, upraví sa aj v Stripe."
              submit="Uložiť doručenie"
            />
          </details>
          <details>
            <summary>Zrušiť predplatné</summary>
            {s?.cancel_at_period_end ? (
              <ActionForm action={uncancelAction} submit="Odvolať zrušenie (pokračovať)" inline>
                <input type="hidden" name="id" value={sub.id} />
              </ActionForm>
            ) : null}
            <ActionForm action={cancelAction} submit="Zrušiť predplatné" danger confirm="Naozaj zrušiť predplatné?">
              <input type="hidden" name="id" value={sub.id} />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="radio" name="mode" value="period_end" defaultChecked /> pred ďalšou platbou (bežné zrušenie, už zaplatené sa doručí)
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="radio" name="mode" value="now" /> okamžite (odstúpenie od zmluvy)
              </label>
              <label>
                Dôvod (interný)
                <input name="reason" />
              </label>
              <p className="small">Peniaze sa tým nevracajú; refund je pri objednávke.</p>
            </ActionForm>
          </details>
        </section>
      ) : null}

      <section className="panel">
        <h2>Objednávky</h2>
        <table className="t small">
          <tbody>
            {(orders.data ?? []).map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/objednavky/${o.id}`}>#{o.number}</Link>
                </td>
                <td>{dt(o.created_at)}</td>
                <td>{kindLabel(o)}</td>
                <td className="num">{eur(o.amount_cents)}</td>
                <td>
                  <Badge status={o.status} />
                </td>
                <td>{o.delivered_at ? `doručená ${day(o.delivered_at)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>História</h2>
        <History items={history} />
        <details>
          <summary className="small">Odpovede dotazníka a posledný výpočet</summary>
          <pre className="json">{json({ answers: dog.answers, engine_snapshot: sub.engine_snapshot })}</pre>
        </details>
      </section>
    </>
  );
}

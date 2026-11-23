import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@lib/db';
import { ActionForm } from '@admin/components/action-form';
import { Badge } from '@admin/components/badge';
import { History } from '@admin/components/history';
import { day, dt, eur, json, kindLabel, WITHDRAWAL_STATUS } from '@admin/lib/format';
import { actionText, canRefund, daysLeft, dueOf, RETURN_CONDITION, RETURN_STATUS, urgency, type Withdrawal } from '@admin/lib/withdrawals';
import { todayLocal, ymdLocal } from '@admin/lib/format';
import { returnAction, statusAction, withdrawalCancelSubAction, withdrawalRefundAction } from './actions';
import { requireAdmin } from '@admin/lib/session';

export const metadata = { title: 'Odstúpenie od zmluvy' };

export default async function WithdrawalDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await db().from('withdrawals').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  const w = data as Withdrawal;

  // objednávky zmluvy: označená objednávka + všetky objednávky jej predplatného
  const { data: order } = w.order_id ? await db().from('orders').select('*').eq('id', w.order_id).maybeSingle() : { data: null };
  const subId = w.subscription_id ?? order?.subscription_id ?? null;
  const [subOrders, sub, audits] = await Promise.all([
    subId ? db().from('orders').select('*').eq('subscription_id', subId).order('created_at') : Promise.resolve({ data: order ? [order] : [] }),
    subId ? db().from('subscriptions').select('id, status').eq('id', subId).maybeSingle() : Promise.resolve({ data: null }),
    db().from('audit_log').select('at, actor, action, before, after').eq('entity', 'withdrawal').eq('entity_id', w.id).order('at', { ascending: false }),
  ]);
  const orders = subOrders.data ?? [];
  const dl = dueOf(w);
  const left = daysLeft(dl);
  const u = !w.refunded_at && w.status !== 'rejected' ? urgency(dl) : null;
  const gate = canRefund(w);

  return (
    <>
      <p className="small">
        <Link href="/odstupenia">← Odstúpenia</Link>
      </p>
      <h1>
        Odstúpenie: {w.name} <Badge status={w.status} kind="withdrawal" />
      </h1>
      {w.needs_review ? <p className="msg warn">Na posúdenie{w.in_deadline === false ? ': odstúpenie prišlo po lehote 14 dní od prevzatia.' : ' (napr. e-mail nesedí s objednávkou alebo automatický krok zlyhal).'}</p> : null}
      <div className="grid2">
        <section className="panel">
          <h2>Odstúpenie</h2>
          <dl className="kv">
            <dt>Prijaté</dt>
            <dd>{dt(w.submitted_at)} (čas servera)</dd>
            <dt>Meno</dt>
            <dd>{w.name}</dd>
            <dt>E-mail</dt>
            <dd>
              <a href={`mailto:${w.email}`}>{w.email}</a>
            </dd>
            <dt>Zmluva</dt>
            <dd>{w.contract_ref}</dd>
            <dt>Dôvod</dt>
            <dd>{w.reason ?? '—'}</dd>
            <dt>Lehota na odstúpenie</dt>
            <dd>
              {w.deadline_at ? `do ${day(w.deadline_at)}` : 'tovar ešte nebol doručený'} · v lehote: {w.in_deadline == null ? '—' : w.in_deadline ? 'áno' : 'NIE'}
            </dd>
            <dt>Vrátiť peniaze do</dt>
            <dd style={u ? { color: u === 'overdue' ? 'var(--err)' : '#a34300', fontWeight: 700 } : undefined}>
              <b>{day(dl)}</b> {!w.refunded_at && w.status !== 'rejected' ? `(${left >= 0 ? `zostáva ${left} d.` : `prešvihnuté o ${-left} d.`})` : ''}
            </dd>
            <dt>Peniaze</dt>
            <dd>{w.refunded_at ? `vrátené ${dt(w.refunded_at)}, ${eur(w.refund_amount_cents ?? 0)}${w.stripe_refund_id ? ` (${w.stripe_refund_id})` : ''}` : 'zatiaľ nevrátené'}</dd>
            <dt>Vrátenie tovaru</dt>
            <dd>
              {RETURN_STATUS[w.return_status ?? 'not_needed']}
              {w.return_received_at ? `, prijaté ${day(w.return_received_at)}` : ''}
              {w.return_condition ? `, ${RETURN_CONDITION[w.return_condition]}` : ''}
              {w.return_note ? <div className="small">{w.return_note}</div> : null}
            </dd>
            <dt>Potvrdenie</dt>
            <dd>{w.confirmation_sent_at ? `odoslané ${dt(w.confirmation_sent_at)}` : 'neodoslané'}</dd>
          </dl>
          <h2>Čo sa urobilo automaticky</h2>
          {(w.actions ?? []).length ? (
            <ul>
              {w.actions!.map((a, i) => (
                <li key={i} style={a.ok ? undefined : { color: 'var(--err)' }}>
                  {actionText(a)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small">Nič (bez zhody s objednávkou alebo pred P4).</p>
          )}
        </section>
        <section className="panel actions">
          <h2>Riešenie</h2>
          <ActionForm action={statusAction} submit="Uložiť stav">
            <input type="hidden" name="id" value={w.id} />
            <div className="row">
              <label>
                Stav
                <select name="status" defaultValue={w.status}>
                  {Object.entries(WITHDRAWAL_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ flex: 1 }}>
                Interná poznámka
                <input name="note" defaultValue={w.review_note ?? ''} />
              </label>
            </div>
          </ActionForm>
          <details open={w.return_status === 'awaiting'}>
            <summary>Vrátenie tovaru</summary>
            <ActionForm action={returnAction} submit="Uložiť vrátenie">
              <input type="hidden" name="id" value={w.id} />
              <div className="row">
                <label>
                  Stav vrátenia
                  <select name="return_status" defaultValue={w.return_status === 'awaiting' ? 'received' : w.return_status ?? 'not_needed'}>
                    {Object.entries(RETURN_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Prijaté dňa
                  <input type="date" name="return_received_at" defaultValue={w.return_received_at ? ymdLocal(w.return_received_at) : todayLocal()} max={todayLocal()} />
                </label>
                <label>
                  Stav vrecka
                  <select name="return_condition" defaultValue={w.return_condition ?? ''}>
                    <option value="">—</option>
                    {Object.entries(RETURN_CONDITION).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Poznámka k vráteniu (interná)
                <input name="return_note" defaultValue={w.return_note ?? ''} />
              </label>
              <p className="small">Dátum a stav vrecka sa uložia iba pri „Tovar prijatý“. Pri otvorenom alebo poškodenom vrecku zváž čiastočný refund.</p>
            </ActionForm>
          </details>
          {sub.data && sub.data.status !== 'cancelled' ? (
            <ActionForm action={withdrawalCancelSubAction} submit="Zrušiť predplatné okamžite" danger inline confirm="Zrušiť predplatné okamžite?">
              <input type="hidden" name="id" value={w.id} />
              <input type="hidden" name="sub" value={sub.data.id} />
              <Link href={`/predplatne/${sub.data.id}`} className="small">
                predplatné ({sub.data.status})
              </Link>
            </ActionForm>
          ) : sub.data ? (
            <p className="small">
              <Link href={`/predplatne/${sub.data.id}`}>Predplatné</Link> je zrušené.
            </p>
          ) : null}
          <h3>Objednávky zmluvy</h3>
          {!orders.length ? <p className="small">Zmluva sa nespárovala s objednávkou (číslo: {w.contract_ref}). Nájdi ju v Objednávkach a refund urob tam.</p> : null}
          {orders.map((o) => (
            <div key={o.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <p style={{ margin: '0 0 6px' }}>
                <Link href={`/objednavky/${o.id}`}>#{o.number}</Link> · {kindLabel(o)} · {eur(o.amount_cents)} · <Badge status={o.status} />
                {o.delivered_at ? <span className="small"> · doručená {day(o.delivered_at)}</span> : null}
              </p>
              {o.amount_cents > 0 && o.status !== 'refunded' && !gate.ok ? <p className="msg warn small">{gate.reason}</p> : null}
              {o.amount_cents > 0 && o.status !== 'refunded' && gate.ok ? (
                <ActionForm action={withdrawalRefundAction} submit="Vrátiť peniaze" danger inline confirm={`Vrátiť peniaze za #${o.number}?`}>
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="order" value={o.id} />
                  <label>
                    Suma € (prázdne = všetko)
                    <input name="amount" size={8} inputMode="decimal" />
                  </label>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" name="resolve" defaultChecked /> označiť odstúpenie ako vyriešené
                  </label>
                </ActionForm>
              ) : null}
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <h2>História</h2>
        <History items={(audits.data ?? []).map((r) => ({ at: r.at, who: r.actor, what: r.action, detail: r.before || r.after ? { before: r.before, after: r.after } : undefined }))} />
        <details>
          <summary className="small">Obsah formulára</summary>
          <pre className="json">{json(w.content)}</pre>
        </details>
      </section>
    </>
  );
}

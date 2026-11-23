import Link from 'next/link';
import type Stripe from 'stripe';
import { db } from '@lib/db';
import { ActionForm } from '@admin/components/action-form';
import { stripe } from '@admin/lib/deps';
import { dt, eur, productName } from '@admin/lib/format';
import { stripeUrl } from '@admin/lib/links';
import { retryInvoiceAction } from './actions';

export const metadata = { title: 'Neúspešné platby' };

type Row = { invoice: Stripe.Invoice | null; error: string | null };

async function openInvoice(stripeSubId: string): Promise<Row> {
  try {
    const s = stripe();
    const list = await s.invoices.list({ subscription: stripeSubId, status: 'open', limit: 1 });
    const inv = list.data[0] ?? null;
    if (!inv?.id) return { invoice: null, error: null };
    const pays = await s.invoicePayments.list({ invoice: inv.id, limit: 5 });
    const piId = pays.data.map((p) => p.payment?.payment_intent).find(Boolean);
    const pi = piId ? await s.paymentIntents.retrieve(typeof piId === 'string' ? piId : piId!.id) : null;
    return { invoice: inv, error: pi?.last_payment_error?.message ?? null };
  } catch (e) {
    return { invoice: null, error: `Stripe: ${(e as Error).message}` };
  }
}

export default async function FailedPayments() {
  const { data: subs } = await db()
    .from('subscriptions')
    .select('id, stripe_subscription_id, product_id, bag_id, next_charge_at, updated_at, customers(email, name, phone), dogs(name)')
    .eq('status', 'past_due')
    .order('updated_at', { ascending: false });
  const rows = await Promise.all((subs ?? []).map(async (s) => ({ s, r: s.stripe_subscription_id ? await openInvoice(s.stripe_subscription_id) : { invoice: null, error: null } })));

  return (
    <>
      <h1>Neúspešné platby</h1>
      <p className="small">
        Predplatné v stave „nezaplatené“ (past_due). Stripe skúša platbu znova sám (Smart Retries, ~4 pokusy) a zákazník dostal e-mail s odkazom na zaplatenie. Keď platba prejde, objednávka vznikne automaticky.
      </p>
      {!rows.length ? <p className="msg ok">Žiadne neúspešné platby.</p> : null}
      {rows.map(({ s, r }) => {
        const c = s.customers as { email: string; name: string | null; phone: string | null } | null;
        const inv = r.invoice;
        return (
          <section className="panel" key={s.id}>
            <h2 style={{ marginTop: 0 }}>
              <Link href={`/predplatne/${s.id}`}>{c?.name ?? c?.email}</Link> · {(s.dogs as { name: string } | null)?.name} · {productName(s.product_id)} {s.bag_id} kg
            </h2>
            <dl className="kv">
              <dt>Kontakt</dt>
              <dd>
                <a href={`mailto:${c?.email}`}>{c?.email}</a> · {c?.phone}
              </dd>
              {inv ? (
                <>
                  <dt>Faktúra</dt>
                  <dd>
                    {eur(inv.amount_due)} · vytvorená {dt(inv.created)} ·{' '}
                    <a href={stripeUrl(`invoices/${inv.id}`)} target="_blank" rel="noreferrer">
                      {inv.number ?? inv.id}
                    </a>
                  </dd>
                  <dt>Pokusy</dt>
                  <dd>
                    {inv.attempt_count} · ďalší pokus Stripe: {inv.next_payment_attempt ? dt(inv.next_payment_attempt) : <b>žiadny (Stripe to vzdal)</b>}
                  </dd>
                  <dt>Dôvod</dt>
                  <dd>{r.error ?? '—'}</dd>
                  <dt>Odkaz na platbu</dt>
                  <dd className="small">{inv.hosted_invoice_url ? <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">{inv.hosted_invoice_url}</a> : '—'}</dd>
                </>
              ) : (
                <>
                  <dt>Faktúra</dt>
                  <dd>{r.error ?? 'Otvorená faktúra sa v Stripe nenašla (možno už zaplatená; stav sa obnoví z webhooku).'}</dd>
                </>
              )}
            </dl>
            {inv?.id ? (
              <div className="row" style={{ marginTop: 10 }}>
                <ActionForm action={retryInvoiceAction} submit="Skúsiť strhnúť znova" inline confirm="Skúsiť strhnúť platbu uloženou kartou teraz?">
                  <input type="hidden" name="invoice" value={inv.id} />
                  <input type="hidden" name="sub" value={s.id} />
                </ActionForm>
                <Link className="btn ghost" href={`/predplatne/${s.id}`}>
                  Predplatné (posunúť, pozastaviť, zrušiť)
                </Link>
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

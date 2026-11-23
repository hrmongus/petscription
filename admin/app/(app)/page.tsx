import Link from 'next/link';
import { db } from '@lib/db';
import { addDays } from '@lib/subscription-schedule';
import { day, dt, eur, productName, skuLabel, startOfTodayLocal } from '@admin/lib/format';
import { liveStock } from '@admin/lib/stock-live';
import { OPEN_STATUSES, daysLeft, refundDeadline, type Withdrawal } from '@admin/lib/withdrawals';
import { requireAdmin } from '@admin/lib/session';

export const metadata = { title: 'Prehľad dňa' };

const CRONS = ['cron.fhb-orders', 'cron.fhb-rma', 'cron.fhb-stock', 'cron.reminders'];

function Card({ n, label, href, tone }: { n: number | string; label: string; href?: string; tone?: 'alert' | 'warn' }) {
  const body = (
    <>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className={`card ${tone ?? ''}`}>
      {body}
    </Link>
  ) : (
    <div className={`card ${tone ?? ''}`}>{body}</div>
  );
}

export default async function Home() {
  await requireAdmin();
  const today = startOfTodayLocal().toISOString();
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const in7 = addDays(new Date(), 8).toISOString();
  const c = { count: 'exact' as const, head: true };
  const [paidToday, stuck, fhbErr, shippedToday, pastDue, withdrawals, returned, upcoming, crons, stock] = await Promise.all([
    db().from('orders').select('id, amount_cents, status').gte('created_at', today).gt('amount_cents', 0),
    db().from('orders').select('id', c).eq('status', 'paid').lt('created_at', tenMinAgo),
    db().from('orders').select('id', c).eq('status', 'fhb_error'),
    db().from('orders').select('id', c).gte('shipped_at', today),
    db().from('subscriptions').select('id', c).eq('status', 'past_due'),
    db().from('withdrawals').select('*').in('status', OPEN_STATUSES),
    db().from('orders').select('id, reship:orders!orders_reship_of_fkey(id)').eq('status', 'returned'),
    db().from('subscriptions').select('id, next_charge_at, product_id, bag_id, unit_amount_cents, customers(name, email), dogs(name)').eq('status', 'active').gte('next_charge_at', new Date().toISOString()).lt('next_charge_at', in7).order('next_charge_at'),
    db().from('fhb_events').select('type, received_at, payload').in('type', CRONS).order('received_at', { ascending: false }).limit(40),
    liveStock().catch((e) => ({ error: (e as Error).message })),
  ]);

  const paid = paidToday.data ?? [];
  const inFhb = paid.filter((o) => !['paid', 'fhb_error', 'cancelled'].includes(o.status)).length;
  const ws = (withdrawals.data ?? []) as Withdrawal[];
  const nearest = ws.map((w) => daysLeft(refundDeadline(w))).sort((a, b) => a - b)[0];
  const unresolvedReturns = (returned.data ?? []).filter((o) => !((o as { reship?: unknown[] }).reship ?? []).length).length;
  const low = Array.isArray(stock) ? stock.filter((r) => r.low) : [];
  const attention = (stuck.count ?? 0) + (fhbErr.count ?? 0);
  const lastCron = CRONS.map((t) => ({ t, e: (crons.data ?? []).find((x) => x.type === t) }));

  return (
    <>
      <h1>Prehľad dňa</h1>
      <div className="cards">
        <Card n={paid.length} label={`zaplatené dnes (${eur(paid.reduce((s, o) => s + o.amount_cents, 0))})`} href="/objednavky" />
        <Card n={inFhb} label="z nich odoslané do FHB" href="/objednavky?stav=fhb" />
        <Card n={shippedToday.count ?? 0} label="odoslané zo skladu dnes" href="/objednavky?stav=odoslane" />
        <Card n={attention} label={`na riešenie: chyby FHB ${fhbErr.count ?? 0}, neodoslané ${stuck.count ?? 0}`} href="/objednavky?stav=riesit" tone={attention ? 'alert' : undefined} />
        <Card n={pastDue.count ?? 0} label="nezaplatené predplatné" href="/platby" tone={pastDue.count ? 'warn' : undefined} />
        <Card n={ws.length} label={ws.length ? `odstúpenia na riešenie (najbližšia lehota ${nearest} d.)` : 'odstúpenia na riešenie'} href="/odstupenia" tone={ws.length ? (nearest <= 3 ? 'alert' : 'warn') : undefined} />
        <Card n={unresolvedReturns} label="vrátené zásielky bez riešenia" href="/vratene" tone={unresolvedReturns ? 'warn' : undefined} />
        <Card n={Array.isArray(stock) ? low.length : '?'} label={Array.isArray(stock) ? 'produkty treba doobjednať' : `sklad: ${stock.error}`} href="/sklad" tone={low.length || !Array.isArray(stock) ? 'alert' : undefined} />
      </div>

      {low.length ? (
        <p className="msg err">
          Nízky sklad: {low.map((r) => `${skuLabel(r.sku)} (voľných ${r.free}, ~${r.coverDays} dní)`).join(' · ')}
        </p>
      ) : null}

      <div className="grid2">
        <section className="panel">
          <h2>Platby predplatného na najbližších 7 dní</h2>
          {upcoming.data?.length ? (
            <table className="t small">
              <tbody>
                {upcoming.data.map((s) => (
                  <tr key={s.id}>
                    <td>{day(s.next_charge_at)}</td>
                    <td>
                      <Link href={`/predplatne/${s.id}`}>{(s.customers as { name: string | null; email: string } | null)?.name ?? (s.customers as { email: string } | null)?.email}</Link> · {(s.dogs as { name: string } | null)?.name}
                    </td>
                    <td>
                      {productName(s.product_id)} {s.bag_id} kg
                    </td>
                    <td className="num">{eur(s.unit_amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="small">Žiadne.</p>
          )}
        </section>
        <section className="panel">
          <h2>Automatické úlohy (cron)</h2>
          <table className="t small">
            <tbody>
              {lastCron.map(({ t, e }) => {
                const ok = (e?.payload as { ok?: boolean } | null)?.ok;
                const old = e ? Date.now() - new Date(e.received_at).getTime() > 26 * 3600_000 : true;
                return (
                  <tr key={t}>
                    <td>{t.replace('cron.', '')}</td>
                    <td>{e ? dt(e.received_at) : 'zatiaľ nebežal'}</td>
                    <td>{!e ? '' : ok === false ? <span className="badge fhb_error">chyba</span> : old ? <span className="badge paused">dlho nebežal</span> : <span className="badge delivered">OK</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted">Bežia denne (Vercel Cron na projekte webu). Chyba alebo „dlho nebežal“ = pozri Vercel → granula → Logs.</p>
        </section>
      </div>
    </>
  );
}

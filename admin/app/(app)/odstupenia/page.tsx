import Link from 'next/link';
import { db } from '@lib/db';
import { Badge } from '@admin/components/badge';
import { day, dt } from '@admin/lib/format';
import { one } from '@admin/lib/query';
import { daysLeft, dueOf, RETURN_CONDITION, RETURN_STATUS, urgency, type Withdrawal } from '@admin/lib/withdrawals';
import { requireAdmin } from '@admin/lib/session';

export const metadata = { title: 'Odstúpenia od zmluvy' };

export default async function Withdrawals({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const all = one((await searchParams).vsetky) === '1';
  // čakajúce = peniaze ešte nevrátené (refunded_at is null), okrem zamietnutých; zoradené podľa lehoty na refund
  let q = db().from('withdrawals').select('*').limit(300);
  q = all ? q.order('submitted_at', { ascending: false }) : q.is('refunded_at' as never, null).neq('status', 'rejected').order('refund_due_at' as never, { ascending: true, nullsFirst: false });
  const { data, error } = await q;
  const rows = (data ?? []) as Withdrawal[];
  const orderIds = rows.map((w) => w.order_id).filter(Boolean) as string[];
  const { data: orders } = orderIds.length ? await db().from('orders').select('id, number').in('id', orderIds) : { data: [] };

  return (
    <>
      <h1>Odstúpenia od zmluvy</h1>
      <div className="chips">
        <Link href="/odstupenia" className={all ? 'chip' : 'chip on'}>
          Čakajú na refund
        </Link>
        <Link href="/odstupenia?vsetky=1" className={all ? 'chip on' : 'chip'}>
          Všetky
        </Link>
      </div>
      <p className="small">
        Peniaze treba vrátiť do <b>14 dní od prijatia odstúpenia</b> (lehota refund_due_at). Ak sa tovar vracia, najprv v detaile zapíš jeho prijatie a stav vrecka, až potom vráť peniaze. Červená = lehota prešvihnutá, oranžová = do 3 dní. Lehota na odstúpenie je 14 dní od prevzatia prvého tovaru; odstúpenie po lehote alebo bez zhody e-mailu je označené „na posúdenie“.
      </p>
      {error ? <p className="msg err">{error.message}</p> : null}
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr>
              <th>Prijaté</th>
              <th>Meno / e-mail</th>
              <th>Zmluva</th>
              <th>V lehote</th>
              <th>Refund do</th>
              <th>Vrátenie tovaru</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const dl = dueOf(w);
              const left = daysLeft(dl);
              const open = !w.refunded_at && w.status !== 'rejected';
              const u = open ? urgency(dl) : null;
              const o = (orders ?? []).find((x) => x.id === w.order_id);
              return (
                <tr key={w.id} className={u ? `due-${u}` : undefined}>
                  <td>
                    <Link href={`/odstupenia/${w.id}`}>{dt(w.submitted_at)}</Link>
                  </td>
                  <td>
                    {w.name}
                    <div className="small muted">{w.email}</div>
                  </td>
                  <td>
                    {w.contract_ref}
                    {o ? (
                      <div className="small">
                        <Link href={`/objednavky/${o.id}`}>#{o.number}</Link>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {w.in_deadline == null ? '—' : w.in_deadline ? 'áno' : <b>nie</b>}
                    {w.needs_review ? (
                      <div>
                        <span className="badge received">na posúdenie</span>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <b>{day(dl)}</b>
                    {open ? <div className="small">{left >= 0 ? `zostáva ${left} d.` : `prešvihnuté o ${-left} d.`}</div> : w.refunded_at ? <div className="small muted">vrátené {day(w.refunded_at)}</div> : null}
                  </td>
                  <td className="small">
                    {RETURN_STATUS[w.return_status ?? 'not_needed']}
                    {w.return_condition ? <div className="muted">{RETURN_CONDITION[w.return_condition]}</div> : null}
                  </td>
                  <td>
                    <Badge status={w.status} kind="withdrawal" />
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={7}>{all ? 'Zatiaľ žiadne odstúpenia.' : 'Nič nečaká na refund.'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

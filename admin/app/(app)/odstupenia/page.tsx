import Link from 'next/link';
import { db } from '@lib/db';
import { Badge } from '@admin/components/badge';
import { day, dt } from '@admin/lib/format';
import { one } from '@admin/lib/query';
import { daysLeft, OPEN_STATUSES, refundDeadline, type Withdrawal } from '@admin/lib/withdrawals';

export const metadata = { title: 'Odstúpenia od zmluvy' };

export default async function Withdrawals({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const all = one((await searchParams).vsetky) === '1';
  let q = db().from('withdrawals').select('*').order('submitted_at', { ascending: false }).limit(300);
  if (!all) q = q.in('status', OPEN_STATUSES);
  const { data, error } = await q;
  const rows = (data ?? []) as Withdrawal[];
  const orderIds = rows.map((w) => w.order_id).filter(Boolean) as string[];
  const { data: orders } = orderIds.length ? await db().from('orders').select('id, number').in('id', orderIds) : { data: [] };

  return (
    <>
      <h1>Odstúpenia od zmluvy</h1>
      <div className="chips">
        <Link href="/odstupenia" className={all ? 'chip' : 'chip on'}>
          Na riešenie
        </Link>
        <Link href="/odstupenia?vsetky=1" className={all ? 'chip on' : 'chip'}>
          Všetky
        </Link>
      </div>
      <p className="small">
        Peniaze treba vrátiť do <b>14 dní od prijatia odstúpenia</b> (môžeš počkať, kým sa tovar vráti). Lehota na odstúpenie je 14 dní od prevzatia prvého tovaru; odstúpenie po lehote alebo bez zhody e-mailu je označené „na posúdenie“.
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
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const dl = refundDeadline(w);
              const left = daysLeft(dl);
              const open = OPEN_STATUSES.includes(w.status);
              const o = (orders ?? []).find((x) => x.id === w.order_id);
              return (
                <tr key={w.id}>
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
                    {day(dl)}
                    {open ? <div className={left <= 3 ? 'small' : 'small muted'} style={left <= 3 ? { color: 'var(--err)', fontWeight: 700 } : undefined}>{left >= 0 ? `zostáva ${left} d.` : `po lehote ${-left} d.`}</div> : null}
                  </td>
                  <td>
                    <Badge status={w.status} kind="withdrawal" />
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={6}>{all ? 'Zatiaľ žiadne odstúpenia.' : 'Nič na riešenie.'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

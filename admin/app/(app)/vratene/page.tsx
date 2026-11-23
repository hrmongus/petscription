import Link from 'next/link';
import { db } from '@lib/db';
import { ActionForm } from '@admin/components/action-form';
import { Badge } from '@admin/components/badge';
import { dt, eur, kindLabel, shipShort } from '@admin/lib/format';
import { refundAction, reshipAction } from '../objednavky/[id]/actions';
import { requireAdmin } from '@admin/lib/session';

export const metadata = { title: 'Vrátené zásielky' };

export default async function Returned() {
  await requireAdmin();
  const { data: orders } = await db()
    .from('orders')
    .select('id, number, kind, reship_of, amount_cents, status, ship_to, created_at, updated_at, subscription_id, customers(email, name)')
    .eq('status', 'returned')
    .order('updated_at', { ascending: false })
    .limit(200);
  const ids = (orders ?? []).map((o) => o.id);
  const [reships, audits] = await Promise.all([
    ids.length ? db().from('orders').select('id, number, status, reship_of').in('reship_of', ids) : Promise.resolve({ data: [] }),
    ids.length ? db().from('audit_log').select('entity_id, at, after').eq('action', 'order.status.returned').in('entity_id', ids) : Promise.resolve({ data: [] }),
  ]);

  return (
    <>
      <h1>Vrátené zásielky</h1>
      <p className="small">
        Zásielky, ktoré FHB eviduje ako vrátené (denný cron <code>/rma/list</code> a stav objednávky). Rozhodni: <b>poslať znova</b> (nová zásielka bez platby) alebo <b>vrátiť peniaze</b>. Po refunde zmizne zo zoznamu.
      </p>
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr>
              <th>Objednávka</th>
              <th>Vrátená</th>
              <th>Zákazník</th>
              <th>Doručenie</th>
              <th className="num">Suma</th>
              <th>Riešenie</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => {
              const c = o.customers as { email: string; name: string | null } | null;
              const re = (reships.data ?? []).filter((r) => r.reship_of === o.id);
              const a = (audits.data ?? []).find((x) => x.entity_id === o.id);
              const type = (a?.after as { return_type?: string } | null)?.return_type;
              return (
                <tr key={o.id}>
                  <td>
                    <Link href={`/objednavky/${o.id}`}>#{o.number}</Link>
                    <div className="small muted">{kindLabel(o)}</div>
                  </td>
                  <td>
                    {dt(a?.at ?? o.updated_at)}
                    {type ? <div className="small muted">{type}</div> : null}
                  </td>
                  <td>
                    {c?.name}
                    <div className="small muted">{c?.email}</div>
                  </td>
                  <td className="small">{shipShort(o.ship_to)}</td>
                  <td className="num">{eur(o.amount_cents)}</td>
                  <td>
                    {re.length ? (
                      re.map((r) => (
                        <div key={r.id}>
                          znova poslaná <Link href={`/objednavky/${r.id}`}>#{r.number}</Link> <Badge status={r.status} />
                        </div>
                      ))
                    ) : (
                      <div className="row">
                        <ActionForm action={reshipAction} submit="Poslať znova" inline confirm={`Poslať tovar z #${o.number} znova (bez platby)?`}>
                          <input type="hidden" name="id" value={o.id} />
                        </ActionForm>
                        {o.amount_cents > 0 ? (
                          <ActionForm action={refundAction} submit="Vrátiť peniaze" danger inline confirm={`Vrátiť celú sumu ${eur(o.amount_cents)} za #${o.number}?`}>
                            <input type="hidden" name="id" value={o.id} />
                            <input type="hidden" name="note" value="vrátená zásielka" />
                          </ActionForm>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!orders?.length ? (
              <tr>
                <td colSpan={6}>Žiadne vrátené zásielky.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="small muted">Čiastočný refund (napr. bez poštovného) urob v detaile objednávky.</p>
    </>
  );
}

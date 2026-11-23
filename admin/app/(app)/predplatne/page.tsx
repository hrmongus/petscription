import Link from 'next/link';
import { db } from '@lib/db';
import { Badge } from '@admin/components/badge';
import { Pager } from '@admin/components/pager';
import { day, eur, productName } from '@admin/lib/format';
import { one, pageOf, searchTerm } from '@admin/lib/query';
import { requireAdmin } from '@admin/lib/session';

export const metadata = { title: 'Predplatné' };

const FILTERS: [string, string, string[] | null][] = [
  ['', 'Aktívne a problémové', ['active', 'past_due', 'paused']],
  ['active', 'Aktívne', ['active']],
  ['past_due', 'Nezaplatené', ['past_due']],
  ['paused', 'Pozastavené', ['paused']],
  ['cancelled', 'Zrušené', ['cancelled']],
  ['vsetky', 'Všetky', null],
];

export default async function Subscriptions({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const stav = one(sp.stav);
  const q = searchTerm(one(sp.q));
  const { page, from, to } = pageOf(sp);
  const statuses = FILTERS.find((f) => f[0] === stav)?.[2] ?? null;

  let customerIds: string[] | null = null;
  if (q) {
    const { data } = await db().from('customers').select('id').or(`email.ilike.*${q}*,name.ilike.*${q}*,phone.ilike.*${q}*`).limit(200);
    customerIds = (data ?? []).map((c) => c.id);
  }
  let query = db().from('subscriptions').select('id, status, product_id, bag_id, days_per_bag, grams_per_day, unit_amount_cents, next_charge_at, created_at, customers(email, name), dogs(name)', { count: 'exact' });
  if (statuses) query = query.in('status', statuses);
  if (customerIds) query = query.in('customer_id', customerIds.length ? customerIds : ['00000000-0000-0000-0000-000000000000']);
  const { data, count, error } = await query.order('next_charge_at', { ascending: true, nullsFirst: false }).range(from, to);

  return (
    <>
      <h1>Predplatné</h1>
      <div className="chips">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={`/predplatne?${new URLSearchParams({ ...(k ? { stav: k } : {}), ...(q ? { q } : {}) })}`} className={stav === k ? 'chip on' : 'chip'}>
            {label}
          </Link>
        ))}
      </div>
      <form className="filters">
        {stav ? <input type="hidden" name="stav" value={stav} /> : null}
        <label>
          Hľadať (e-mail, meno, telefón)
          <input name="q" defaultValue={q} size={36} />
        </label>
        <button className="btn ghost">Hľadať</button>
      </form>
      {error ? <p className="msg err">{error.message}</p> : null}
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr>
              <th>Zákazník</th>
              <th>Pes</th>
              <th>Receptúra</th>
              <th className="num">D</th>
              <th className="num">Vrece</th>
              <th>Ďalšia platba a expedícia</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((s) => {
              const c = s.customers as { email: string; name: string | null } | null;
              return (
                <tr key={s.id}>
                  <td>
                    <Link href={`/predplatne/${s.id}`}>{c?.name ?? c?.email}</Link>
                    <div className="small muted">{c?.email}</div>
                  </td>
                  <td>{(s.dogs as { name: string } | null)?.name}</td>
                  <td>
                    {productName(s.product_id)} {s.bag_id} kg<div className="small muted">{s.grams_per_day} g/deň</div>
                  </td>
                  <td className="num">{s.days_per_bag}</td>
                  <td className="num">{eur(s.unit_amount_cents)}</td>
                  <td>{s.status === 'cancelled' ? '—' : day(s.next_charge_at)}</td>
                  <td>
                    <Badge status={s.status} kind="sub" />
                  </td>
                </tr>
              );
            })}
            {!data?.length ? (
              <tr>
                <td colSpan={7}>Nič sa nenašlo.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="small muted">Expedícia: v deň platby vznikne objednávka a ide do FHB (platba o 7:00 / 8:00), FHB ju odošle zvyčajne do 1 pracovného dňa.</p>
      <Pager page={page} count={count ?? 0} base="/predplatne" params={{ ...(stav ? { stav } : {}), ...(q ? { q } : {}) }} />
    </>
  );
}

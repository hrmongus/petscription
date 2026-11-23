import Link from 'next/link';
import { db } from '@lib/db';
import { Badge } from '@admin/components/badge';
import { Pager } from '@admin/components/pager';
import { dt, eur, kindLabel, shipShort } from '@admin/lib/format';
import { one, pageOf, searchTerm } from '@admin/lib/query';

export const metadata = { title: 'Objednávky' };

const FILTERS: [string, string, string[] | null][] = [
  ['', 'Všetky', null],
  ['riesit', 'Na riešenie', ['paid', 'fhb_error']],
  ['fhb', 'Vo FHB', ['sent_to_fhb', 'confirmed']],
  ['odoslane', 'Odoslané', ['sent']],
  ['dorucene', 'Doručené', ['delivered']],
  ['vratene', 'Vrátené', ['returned']],
  ['storno', 'Storno / refund', ['cancelled', 'refunded']],
];

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const stav = one(sp.stav);
  const q = searchTerm(one(sp.q));
  const { page, from, to } = pageOf(sp);
  const statuses = FILTERS.find((f) => f[0] === stav)?.[2] ?? null;

  let query = db().from('orders').select('id, number, created_at, kind, reship_of, amount_cents, status, ship_to, customers(email, name)', { count: 'exact' });
  if (statuses) query = query.in('status', statuses);
  if (q) {
    const n = q.replace(/^GR-0*/i, '').replace(/^#/, '');
    query = /^\d{1,10}$/.test(n) ? query.eq('number', Number(n)) : query.or(`ship_to->>email.ilike.*${q}*,ship_to->>name.ilike.*${q}*,ship_to->>phone.ilike.*${q}*`);
  }
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);

  return (
    <>
      <h1>Objednávky</h1>
      <div className="chips">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={`/objednavky?${new URLSearchParams({ ...(k ? { stav: k } : {}), ...(q ? { q } : {}) })}`} className={stav === k ? 'chip on' : 'chip'}>
            {label}
          </Link>
        ))}
      </div>
      <form className="filters">
        {stav ? <input type="hidden" name="stav" value={stav} /> : null}
        <label>
          Hľadať (číslo, GR-…, e-mail, meno, telefón)
          <input name="q" defaultValue={q} size={36} />
        </label>
        <button className="btn ghost">Hľadať</button>
      </form>
      {error ? <p className="msg err">{error.message}</p> : null}
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr>
              <th>Číslo</th>
              <th>Vytvorená</th>
              <th>Zákazník</th>
              <th>Druh</th>
              <th>Doručenie</th>
              <th className="num">Suma</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((o) => {
              const c = o.customers as { email: string; name: string | null } | null;
              return (
                <tr key={o.id}>
                  <td>
                    <Link href={`/objednavky/${o.id}`}>#{o.number}</Link>
                  </td>
                  <td>{dt(o.created_at)}</td>
                  <td>
                    {c?.name ?? '—'}
                    <div className="small muted">{c?.email}</div>
                  </td>
                  <td>{kindLabel(o)}</td>
                  <td className="small">{shipShort(o.ship_to)}</td>
                  <td className="num">{eur(o.amount_cents)}</td>
                  <td>
                    <Badge status={o.status} />
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
      <Pager page={page} count={count ?? 0} base="/objednavky" params={{ ...(stav ? { stav } : {}), ...(q ? { q } : {}) }} />
    </>
  );
}

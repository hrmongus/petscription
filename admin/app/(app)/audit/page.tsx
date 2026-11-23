import Link from 'next/link';
import { db } from '@lib/db';
import { Pager } from '@admin/components/pager';
import { dt, json } from '@admin/lib/format';
import { one, pageOf, searchTerm } from '@admin/lib/query';
import { requireAdmin } from '@admin/lib/session';

export const metadata = { title: 'Audit' };

const HREF: Record<string, string> = { order: '/objednavky/', subscription: '/predplatne/', withdrawal: '/odstupenia/' };

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const kto = one(sp.kto);
  const q = searchTerm(one(sp.q));
  const { page, from, to } = pageOf(sp);
  let query = db().from('audit_log').select('*', { count: 'exact' });
  if (kto === 'admin') query = query.like('actor', '%@%');
  if (kto === 'system') query = query.eq('actor', 'system');
  if (q) query = query.ilike('action', `%${q}%`);
  const { data, count, error } = await query.order('at', { ascending: false }).range(from, to);
  const params = { ...(kto ? { kto } : {}), ...(q ? { q } : {}) };
  return (
    <>
      <h1>Audit</h1>
      <div className="chips">
        {[['', 'Všetko'], ['admin', 'Akcie adminov'], ['system', 'Systém']].map(([k, l]) => (
          <Link key={k} href={`/audit?${new URLSearchParams({ ...(k ? { kto: k } : {}), ...(q ? { q } : {}) })}`} className={kto === k ? 'chip on' : 'chip'}>
            {l}
          </Link>
        ))}
      </div>
      <form className="filters">
        {kto ? <input type="hidden" name="kto" value={kto} /> : null}
        <label>
          Akcia obsahuje (napr. refund, order.cancelled, login)
          <input name="q" defaultValue={q} size={30} />
        </label>
        <button className="btn ghost">Filtrovať</button>
      </form>
      {error ? <p className="msg err">{error.message}</p> : null}
      <table className="t small">
        <thead>
          <tr>
            <th>Čas</th>
            <th>Kto</th>
            <th>Akcia</th>
            <th>Čoho sa týka</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{dt(r.at)}</td>
              <td>{r.actor}</td>
              <td>{r.action}</td>
              <td>{r.entity_id && HREF[r.entity] && /^[0-9a-f-]{36}$/.test(r.entity_id) ? <Link href={HREF[r.entity] + r.entity_id}>{r.entity}</Link> : `${r.entity} ${r.entity_id ?? ''}`}</td>
              <td>
                {r.before || r.after ? (
                  <details>
                    <summary className="muted">zobraziť</summary>
                    <pre className="json">{json({ before: r.before, after: r.after })}</pre>
                  </details>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} count={count ?? 0} base="/audit" params={params} />
    </>
  );
}

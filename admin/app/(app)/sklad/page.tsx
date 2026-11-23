import { db } from '@lib/db';
import { STOCK_ALERT_DAYS } from '@lib/stock';
import { day, dt, skuLabel } from '@admin/lib/format';
import { liveStock } from '@admin/lib/stock-live';

export const metadata = { title: 'Sklad' };

export default async function Stock() {
  const [rows, alerts] = await Promise.all([
    liveStock().catch((e) => ({ error: (e as Error).message })),
    db().from('audit_log').select('at, entity_id, after').eq('action', 'stock.low').order('at', { ascending: false }).limit(20),
  ]);
  const list = Array.isArray(rows) ? rows : [];
  return (
    <>
      <h1>Sklad</h1>
      <p className="small">
        Naživo z FHB. <b>Voľné</b> = nerezervované kusy (free_quantity), z nich sa počíta upozornenie: voľné kusy nevydržia {STOCK_ALERT_DAYS} dní spotreby aktívnych a nezaplatených predplatných (dodávateľ min. 3 týždne). 18 kg = sada 2 × 9 kg, preto spotreba 9 kg zahŕňa aj 18 kg a sada je dostupná v počte voľných 9 kg / 2.
      </p>
      {!Array.isArray(rows) ? <p className="msg err">FHB: {rows.error}</p> : null}
      <div className="tablewrap">
        <table className="t">
          <thead>
            <tr>
              <th>Produkt</th>
              <th className="num">Na sklade</th>
              <th className="num">Voľné</th>
              <th className="num">Sady 18 kg</th>
              <th className="num">Spotreba / deň</th>
              <th className="num">Vydrží</th>
              <th className="num">Hranica ({STOCK_ALERT_DAYS} d.)</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.sku}>
                <td>
                  {skuLabel(r.sku)}
                  <div className="small muted">{r.sku}</div>
                </td>
                <td className="num">{r.stock ?? '—'}</td>
                <td className="num">
                  <b>{r.free}</b>
                </td>
                <td className="num">{r.sku.endsWith('-9') ? Math.floor(r.free / 2) : ''}</td>
                <td className="num">{r.perDay ? r.perDay.toLocaleString('sk-SK') : '—'}</td>
                <td className="num">{r.coverDays == null ? '—' : `${r.coverDays} d. (${day(new Date(Date.now() + r.coverDays * 86_400_000))})`}</td>
                <td className="num">{r.threshold || '—'}</td>
                <td>{r.low ? <span className="badge fhb_error">doobjednať</span> : r.perDay ? <span className="badge delivered">OK</span> : <span className="small muted">bez predplatných</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Posledné upozornenia (cron fhb-stock)</h2>
      <table className="t small">
        <tbody>
          {(alerts.data ?? []).map((a, i) => (
            <tr key={i}>
              <td>{dt(a.at)}</td>
              <td>{a.entity_id}</td>
              <td>
                {(() => {
                  const x = a.after as { free?: number; perDay?: number; coverDays?: number } | null;
                  return x ? `voľných ${x.free}, ${x.perDay} ks/deň, ~${x.coverDays} dní` : '';
                })()}
              </td>
            </tr>
          ))}
          {!alerts.data?.length ? (
            <tr>
              <td>Žiadne.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="small muted">Príjem tovaru (príjemka) sa zatiaľ zakladá vo FHB portáli alebo skriptom; v manažéri iba stav.</p>
    </>
  );
}

import { dt, json } from '@admin/lib/format';
import type { HistoryItem } from '@admin/lib/history';

export function History({ items }: { items: HistoryItem[] }) {
  if (!items.length) return <p className="small muted">Zatiaľ nič.</p>;
  return (
    <table className="t small">
      <tbody>
        {items.map((h, i) => (
          <tr key={i}>
            <td style={{ whiteSpace: 'nowrap' }}>{dt(h.at)}</td>
            <td>{h.who}</td>
            <td>
              {h.what}
              {h.detail ? (
                <details>
                  <summary className="muted">detail</summary>
                  <pre className="json">{json(h.detail)}</pre>
                </details>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

import Link from 'next/link';
import { PAGE } from '@admin/lib/query';

export function Pager({ page, count, base, params }: { page: number; count: number; base: string; params: Record<string, string> }) {
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const href = (p: number) => `${base}?${new URLSearchParams({ ...params, strana: String(p) })}`;
  return (
    <div className="pager small">
      {page > 1 ? <Link href={href(page - 1)}>← novšie</Link> : null}
      <span>
        Strana {page} z {pages} · spolu {count}
      </span>
      {page < pages ? <Link href={href(page + 1)}>staršie →</Link> : null}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

/** Hlásenie po akcii admina (cookie ga_flash z lib/action.ts); ostane, kým ho admin nezavrie alebo neurobí ďalšiu akciu. */
export function Flash({ raw }: { raw: string | null }) {
  const data = (() => {
    try {
      return raw ? (JSON.parse(decodeURIComponent(raw)) as { ok: boolean; msg: string; at: number }) : null;
    } catch {
      return null;
    }
  })();
  const [hidden, setHidden] = useState<number | null>(null);
  useEffect(() => {
    if (raw) document.cookie = 'ga_flash=; Max-Age=0; path=/';
  }, [raw]);
  if (!data || hidden === data.at) return null;
  return (
    <div className={`msg flash ${data.ok ? 'ok' : 'err'}`} role="status">
      <span>{data.msg}</span>
      <button className="link" onClick={() => setHidden(data.at)} aria-label="Zavrieť">
        ✕
      </button>
    </div>
  );
}

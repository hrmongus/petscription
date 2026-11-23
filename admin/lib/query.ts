/** Hodnota na hľadanie v PostgREST .or(): bez znakov, ktoré majú v syntaxi filtra význam. */
export const searchTerm = (q: string) => q.replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 80);

export const PAGE = 50;

export function pageOf(sp: Record<string, string | string[] | undefined>) {
  const p = Math.max(1, Number(sp.strana) || 1);
  return { page: p, from: (p - 1) * PAGE, to: p * PAGE - 1 };
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * QR kód 2FA ako obrázok. Supabase vracia `data:image/svg+xml;utf-8,<svg …>` s nezakódovaným SVG (znaky #, ", <);
 * prehliadače taký obrázok nenačítajú (zobrazí sa iba alt text). Preto SVG vždy ako base64.
 */
export function qrDataUrl(raw: string): string {
  if (raw.startsWith('data:image/svg+xml;base64,')) return raw;
  let svg = raw;
  if (raw.startsWith('data:')) {
    const body = raw.slice(raw.indexOf(',') + 1);
    try {
      svg = decodeURIComponent(body);
    } catch {
      svg = body; // nezakódované SVG s „%“ v texte
    }
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

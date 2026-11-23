import { redirect } from 'next/navigation';
import { sessionState } from './session';

/** /vypocet je mimo layoutu admina (samostatná statická stránka), preto vlastná kontrola prihlásenia. */
export async function requireAdminRoute() {
  const s = await sessionState();
  if (s.state === 'mfa') redirect('/login/2fa');
  if (s.state !== 'admin') redirect('/login');
}

const NOSTORE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };

export function asset(body: string, type: string) {
  return new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, ...NOSTORE } });
}

/**
 * Stránka z verejného webu: obrázky, CSS a ikony z www.granula.sk (base), engine.js a radar.js z tohto nasadenia
 * (rovnaký commit ako server), odkazy na dotazník vedú na web.
 */
export function vypocetHtml(html: string, siteUrl: string, origin: string) {
  const base = siteUrl.replace(/\/$/, '') + '/';
  return html
    .replace(/<head>/i, `<head>\n<base href="${base}">`)
    .replace('<script src="engine.js"></script>', `<script src="${origin}/vypocet/engine.js"></script>`)
    .replace('<script src="radar.js"></script>', `<script src="${origin}/vypocet/radar.js"></script>`)
    .replace('Kontrola výpočtu · interná, dočasná stránka', `Kontrola výpočtu · manažér · <a href="${origin}/" style="color:inherit">← späť do manažéra</a>`);
}

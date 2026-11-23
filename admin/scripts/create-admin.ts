/*
 * Admin účet pre granula-manazer.vercel.app (SPEC P3): Supabase Auth používateľ s app_metadata.role = "admin".
 *
 *   cd admin && npm run create-admin -- meno@granula.sk            → vytvorí účet (alebo pridá rolu existujúcemu) a vypíše dočasné heslo
 *   cd admin && npm run create-admin -- meno@granula.sk --password  → nové heslo pre existujúci účet
 *   cd admin && npm run create-admin -- meno@granula.sk --revoke    → odoberie rolu admin
 *   cd admin && npm run create-admin -- meno@granula.sk --reset-2fa → zmaže 2FA (nový telefón), pri ďalšom prihlásení sa nastaví znova
 *
 * Potrebuje NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY (napr. z .env.local v koreni repa). 2FA si admin
 * nastaví pri prvom prihlásení. Rolu nemôže zmeniť nikto okrem service role (app_metadata, nie user_metadata).
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const [email, flag] = process.argv.slice(2);
if (!email || !email.includes('@')) {
  console.error('Použitie: npm run create-admin -- email@granula.sk [--password | --revoke | --reset-2fa]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chýba NEXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const password = () => randomBytes(12).toString('base64url');

async function findUser(e: string) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === e.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const e = email.toLowerCase();
  const user = await findUser(e);
  if (flag === '--revoke') {
    if (!user) throw new Error('Účet neexistuje.');
    const { role: _role, ...rest } = user.app_metadata ?? {};
    await sb.auth.admin.updateUserById(user.id, { app_metadata: { ...rest, role: null } });
    console.log(`Rola admin odobratá: ${e}`);
    return;
  }
  if (flag === '--reset-2fa') {
    if (!user) throw new Error('Účet neexistuje.');
    const { data, error } = await sb.auth.admin.mfa.listFactors({ userId: user.id });
    if (error) throw error;
    for (const f of data.factors) await sb.auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id });
    console.log(`2FA zmazané (${data.factors.length}): ${e}. Pri ďalšom prihlásení si ho nastaví znova.`);
    return;
  }
  if (!user) {
    const pw = password();
    const { error } = await sb.auth.admin.createUser({ email: e, password: pw, email_confirm: true, app_metadata: { role: 'admin' } });
    if (error) throw error;
    console.log(`Admin účet vytvorený: ${e}\nDočasné heslo: ${pw}\nPrihlásenie: https://granula-manazer.vercel.app (pri prvom prihlásení nastaví 2FA).`);
    return;
  }
  const pw = flag === '--password' ? password() : null;
  await sb.auth.admin.updateUserById(user.id, { app_metadata: { ...(user.app_metadata ?? {}), role: 'admin' }, ...(pw ? { password: pw } : {}) });
  console.log(`Účet ${e} má rolu admin.${pw ? `\nNové heslo: ${pw}` : ' Heslo sa nemenilo (nové: --password).'}`);
}

main().catch((err) => {
  console.error('Chyba:', err.message ?? err);
  process.exit(1);
});

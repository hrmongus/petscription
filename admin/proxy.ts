import { NextResponse, type NextRequest } from 'next/server';
import { gotrue, jwtPayload } from './lib/gotrue';

/*
 * Admin: obnovenie prístupového tokenu (Supabase Auth) skôr, ako vyprší, a presmerovanie neprihlásených na /login.
 * Toto je iba pohodlie; skutočná kontrola (token, rola admin, 2FA) je na serveri v každej stránke a akcii
 * (lib/session.ts requireAdmin).
 */
const AT = 'ga_at';
const RT = 'ga_rt';
const PUBLIC = ['/login'];

const opts = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge });

export async function proxy(req: NextRequest) {
  // iba `next dev` s ADMIN_DEV_USER (lib/session.ts devAdmin)
  if (process.env.NODE_ENV === 'development' && process.env.ADMIN_DEV_USER) return NextResponse.next();
  const at = req.cookies.get(AT)?.value;
  const rt = req.cookies.get(RT)?.value;
  const isPublic = PUBLIC.some((p) => req.nextUrl.pathname === p || req.nextUrl.pathname.startsWith(p + '/'));

  const exp = at ? jwtPayload(at).exp ?? 0 : 0;
  if (rt && exp * 1000 - Date.now() < 120_000) {
    try {
      const s = await gotrue.refresh(rt);
      // nové tokeny aj pre túto požiadavku (server ich prečíta z cookies)
      req.cookies.set(AT, s.access_token);
      req.cookies.set(RT, s.refresh_token);
      const res = NextResponse.next({ request: { headers: req.headers } });
      res.cookies.set(AT, s.access_token, opts(Math.max(60, s.expires_in)));
      res.cookies.set(RT, s.refresh_token, opts(7 * 86_400));
      return res;
    } catch {
      if (isPublic) return NextResponse.next();
      const res = NextResponse.redirect(new URL('/login', req.url));
      res.cookies.delete(AT);
      res.cookies.delete(RT);
      return res;
    }
  }
  if (!at && !isPublic) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/|favicon|vypocet/assets/).*)'],
};

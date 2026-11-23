import Link from 'next/link';
import { fhbMode, stripeMode } from '@lib/env-mode';
import { requireAdmin } from '@admin/lib/session';
import { logoutAction } from '../login/actions';
import { Nav } from '@admin/components/nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const s = stripeMode();
  const f = fhbMode();
  const test = s !== 'live' || f !== 'production';
  return (
    <div className="shell">
      <header className="top">
        <Link href="/" className="logo">
          Granula! <span>manažér</span>
        </Link>
        {test ? (
          <span className="mode test" title="Stripe a FHB podľa kľúčov v prostredí">
            TEST · Stripe {s} · FHB {f}
          </span>
        ) : (
          <span className="mode live">OSTRÁ PREVÁDZKA</span>
        )}
        <span className="who">{admin.email}</span>
        <form action={logoutAction}>
          <button className="link">Odhlásiť</button>
        </form>
      </header>
      <Nav />
      <main className="main">{children}</main>
    </div>
  );
}

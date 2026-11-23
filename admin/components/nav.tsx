'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS: [string, string][] = [
  ['/', 'Prehľad dňa'],
  ['/objednavky', 'Objednávky'],
  ['/predplatne', 'Predplatné'],
  ['/platby', 'Neúspešné platby'],
  ['/vratene', 'Vrátené zásielky'],
  ['/odstupenia', 'Odstúpenia'],
  ['/sklad', 'Sklad'],
  ['/vypocet', 'Kontrola výpočtu'],
  ['/audit', 'Audit'],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {ITEMS.map(([href, label]) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        // /vypocet je samostatná statická stránka (mimo React), preto obyčajný odkaz
        return href === '/vypocet' ? (
          <a key={href} href={href}>{label}</a>
        ) : (
          <Link key={href} href={href} className={active ? 'on' : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

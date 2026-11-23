import path from 'node:path';
import type { NextConfig } from 'next';

/*
 * Admin portál (SPEC P3, manazer.granula.sk). Samostatný Vercel projekt s Root Directory `admin`, ale kód zdieľa
 * s webom: importuje ../lib (engine, stripe, fhb, db, subscription-schedule) a ../public/granula/engine.js.
 * Závislosti sú iba v koreňovom node_modules (vercel.json: installCommand `cd .. && npm ci`).
 */
const root = path.join(import.meta.dirname, '..');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  // súbory mimo admin/ (../lib, ../public/granula) a koreňové node_modules
  turbopack: { root },
  outputFileTracingRoot: root,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;

import { describe, expect, it } from 'vitest';
import { qrDataUrl } from './qr';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#000000" d="M0 0h1v1H0z"/></svg>';
const back = (u: string) => Buffer.from(u.split(',')[1], 'base64').toString('utf8');

describe('QR kód 2FA', () => {
  it('nezakódované SVG zo Supabase → base64', () => {
    const u = qrDataUrl(`data:image/svg+xml;utf-8,${svg}`);
    expect(u.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(back(u)).toBe(svg);
  });
  it('URL-zakódované aj holé SVG', () => {
    expect(back(qrDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`))).toBe(svg);
    expect(back(qrDataUrl(svg))).toBe(svg);
  });
});

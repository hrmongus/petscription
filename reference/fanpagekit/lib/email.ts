import { config, driveLink, fanpagekitGuideLink, guidesLink, privateLinks } from './config';
import { PACKS } from './data';
import { STUDIO_PRICE } from './prices';

/*
 * Transactional email through Resend's HTTP API (RESEND_API_KEY + EMAIL_FROM). Without a key the email is
 * only logged in development, so local checkouts still work; in production it throws. EMAIL_FROM must be on
 * a domain verified in Resend; replies go to EMAIL_REPLY_TO when set.
 */

type Mail = { to: string; subject: string; html: string; text: string; idempotencyKey: string };

/** Resolves true once Resend has the email (sent now or earlier under the same key); false when not configured. */
async function send(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    // In production a missing key must fail the webhook, so Stripe retries until it's configured.
    if (process.env.NODE_ENV === 'production') throw new Error('[email] RESEND_API_KEY / EMAIL_FROM not set — order email not sent');
    console.warn('[email] RESEND_API_KEY / EMAIL_FROM not set — not sent:', mail.subject, '→', mail.to);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    // Stripe retries webhooks; the idempotency key keeps that to one email.
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': mail.idempotencyKey },
    body: JSON.stringify({
      from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text,
      ...(process.env.EMAIL_REPLY_TO && { reply_to: process.env.EMAIL_REPLY_TO }),
    }),
  });
  // 409: this idempotency key was already used, or the same send is in flight — either way it isn't sent twice.
  if (res.status === 409) {
    console.info('[email] duplicate send skipped', mail.subject, '→', mail.to, await res.text());
    return true;
  }
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  console.info('[email] sent', mail.subject, '→', mail.to);
  return true;
}

/* ---------- content ---------- */

/** `cta` is the button label; folders default to "Open folder". */
type Folder = { name: string; sub: string; url: string; cta?: string };

const PACK_SUB = '30 finished videos · raw clips · posting playbook';
const BUNDLE_SUB = '120 finished videos · raw clips · 4 months of playbook';
const GUIDES_SUB = '9 step-by-step guides, one per editing tool';
const FANPAGEKIT_GUIDE_SUB = 'The method, start to finish — read this first';

/** Drive folders for pack slugs ('bundle' is the four-pack folder). Missing links are logged and kept, shown as pending. */
function packFolders(slugs: string[]): Folder[] {
  return slugs.map((slug) => {
    const url = driveLink(slug);
    if (!url) console.error('[email] no Drive link configured for', slug);
    const name = PACKS.find((p) => p.slug === slug)?.name ?? slug;
    return { name: slug === 'bundle' ? 'All four packs' : name, sub: slug === 'bundle' ? BUNDLE_SUB : PACK_SUB, url };
  });
}

function fanpagekitGuide(): Folder {
  const url = fanpagekitGuideLink();
  if (!url) console.error('[email] DRIVE_URL_FANPAGEKIT_GUIDE is not set');
  return { name: 'The FanpageKit Guide', sub: FANPAGEKIT_GUIDE_SUB, url, cta: 'Open guide' };
}

function guidesFolder(): Folder {
  const url = guidesLink();
  if (!url) console.error('[email] DRIVE_URL_GUIDES is not set');
  return { name: 'Editing guides', sub: GUIDES_SUB, url };
}

type Content = {
  subject: string;
  preheader: string;
  /** The line above the heading; orders and renewals default to "Payment confirmed". */
  badge?: string;
  heading: string;
  intro: string;
  folders: Folder[];
  note?: string;
  /** The buyer's /access page: onboarding video, booking and Discord. */
  setupUrl?: string;
};

/** Emails a paid order: its pack folders, The FanpageKit Guide, the editing guides, Discord and the way back to the setup page. */
export async function sendOrderEmail(opts: {
  to: string; idempotencyKey: string; orderName: string; slugs: string[]; monthly: boolean; total: string; setupUrl: string;
}) {
  const many = opts.slugs.includes('bundle') || opts.slugs.length > 1;
  return deliver(opts.to, opts.idempotencyKey, {
    subject: many ? 'Your FanpageKit packs are ready' : `Your FanpageKit pack is ready: ${opts.orderName}`,
    preheader: 'Your Drive folders, The FanpageKit Guide, the editing guides and your Discord invite.',
    heading: many ? 'Your packs are ready.' : 'Your pack is ready.',
    intro: `Thanks for your order — ${opts.orderName}, ${opts.total}${opts.monthly ? ' a month' : ''}. Everything is in the folders below. Save this email so you can come back to them any time.`,
    folders: [...packFolders(opts.slugs), fanpagekitGuide(), guidesFolder()],
    note: opts.monthly ? 'You’re on the monthly plan: a fresh 30-video pack arrives by email every month. Cancel any time from your setup page.' : undefined,
    setupUrl: opts.setupUrl,
  });
}

/** Emails the packs an accepted upsell unlocked. */
export async function sendUpsellEmail(opts: { to: string; idempotencyKey: string; slugs: string[]; setupUrl?: string }) {
  return deliver(opts.to, opts.idempotencyKey, {
    subject: 'Your extra FanpageKit packs are ready',
    preheader: 'The packs you just added, ready in Google Drive.',
    heading: 'Your extra packs are ready.',
    intro: 'Thanks for adding them. Here are the folders for everything you just unlocked.',
    folders: packFolders(opts.slugs),
    setupUrl: opts.setupUrl,
  });
}

/**
 * Emails the studio's one-click login (the upsell, or the studio bought on its own). `loginUrl` signs them in
 * (lib/studio.ts) and stays valid for LOGIN_LINK_TTL.email; after that the studio asks for a sign-in code sent to this
 * same address.
 */
export async function sendStudioEmail(opts: {
  to: string; idempotencyKey: string; slugs: string[]; loginUrl: string; setupUrl?: string;
  /** The studio subscription (false: a one-time purchase from before it). */
  monthly: boolean;
  /** Where a subscriber manages or cancels it when there's no setup page (the studio bought on its own). */
  manageUrl?: string;
}) {
  const names = opts.slugs.map((s) => PACKS.find((p) => p.slug === s)?.name ?? s);
  // The studio bought on its own (/studio) may come without any packs.
  const unlocked = !names.length ? '' : names.length === 4 ? 'all four packs' : names.join(', ').replace(/, ([^,]*)$/, ' and $1');
  return deliver(opts.to, opts.idempotencyKey, {
    subject: 'Your FanpageKit Studio is ready',
    preheader: unlocked ? 'One click and you’re in. Your packs are already unlocked.' : 'One click and you’re in.',
    badge: 'Studio added',
    heading: 'Your studio is ready.',
    intro: `Your FanpageKit Studio account is set up under ${opts.to}${unlocked ? `, with ${unlocked} unlocked` : ''}. Drop in your song and the studio writes out the lyrics and puts them on your clips. The button below signs you straight in, no password.`,
    folders: [{ name: 'FanpageKit Studio', sub: unlocked ? `studio.fanpagekit.com · ${unlocked} unlocked` : 'studio.fanpagekit.com', url: opts.loginUrl, cta: 'Open the studio' }],
    note: [
      'The button signs you in for the next 30 days. After that, go to studio.fanpagekit.com and sign in with this email: we send you a code, no password.',
      ...(opts.monthly
        ? [`Your studio is $${STUDIO_PRICE} a month and renews on this date until you cancel. Manage or cancel any time ${opts.manageUrl ? `here: ${opts.manageUrl}` : 'from your setup page'}.`]
        : []),
    ].join(' '),
    setupUrl: opts.setupUrl,
  });
}

/** Emails a monthly subscriber the pack this renewal paid for. */
export async function sendRenewalEmail(opts: { to: string; idempotencyKey: string; slug: string }) {
  const name = PACKS.find((p) => p.slug === opts.slug)?.name ?? opts.slug;
  return deliver(opts.to, opts.idempotencyKey, {
    subject: `Your new FanpageKit pack is ready: ${name}`,
    preheader: 'This month’s pack, ready in Google Drive.',
    heading: 'Your new pack is ready.',
    intro: `This month’s pack is ${name}. Everything is in the folder below. Save this email so you can come back to it any time.`,
    folders: packFolders([opts.slug]),
    note: 'Your next pack arrives with your next renewal. You can manage or cancel your plan from the setup page linked in your first email.',
  });
}

/**
 * Emails a lead the link to their Blueprint. The address comes from a public form, so nothing the visitor typed
 * goes in the email, and the paid-only Discord invite stays out of it.
 */
export async function sendResultsEmail(opts: { to: string; idempotencyKey: string; resultsUrl: string }) {
  const c: Content = {
    subject: 'Your Fanpage Blueprint is ready',
    preheader: 'Your fan page plan, saved under a private link.',
    badge: 'Free Blueprint',
    heading: 'Your Blueprint is ready.',
    intro: 'Here is your fan page plan: your score, your top fan pages and your growth path. Save this email so you can come back to it any time.',
    folders: [{ name: 'Your Fanpage Blueprint', sub: 'Saved under a private link', url: opts.resultsUrl, cta: 'Open' }],
  };
  return send({ to: opts.to, idempotencyKey: opts.idempotencyKey, subject: c.subject, html: html(c, ''), text: text(c, '') });
}

async function deliver(to: string, idempotencyKey: string, c: Content) {
  const { discordUrl } = privateLinks();
  const discord = discordUrl && discordUrl !== '#' ? discordUrl : '';
  return send({ to, idempotencyKey, subject: c.subject, html: html(c, discord), text: text(c, discord) });
}

/* ---------- rendering ---------- */

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

const DISCORD_BLURB = 'where musicians share how they grow fan pages organically, from a single page to 20 at scale. Ask questions, share your numbers, get feedback on your clips.';

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const C = { bg: '#F2F2F4', card: '#FFFFFF', fg: '#0A0A0B', muted: '#6E6E73', line: '#E6E6EA', tile: '#F6F6F8', green: '#1F9D46' };

function text(c: Content, discord: string) {
  return [
    c.heading,
    '',
    c.intro,
    '',
    ...c.folders.map((f) => `${f.name} — ${f.sub}\n${f.url || 'Link on its way — we’ll follow up shortly.'}\n`),
    ...(c.note ? [c.note, ''] : []),
    ...(c.setupUrl ? [`Finish setting up (${config.vslUrl ? 'onboarding video, ' : ''}1:1 call, community):`, c.setupUrl, ''] : []),
    ...(discord ? [`Join the community on Discord — ${DISCORD_BLURB}`, discord, ''] : []),
    'Questions or a missing link? Just reply to this email.',
    '',
    '— FanpageKit',
  ].join('\n');
}

function folderRow(f: Folder) {
  const action = f.url
    ? `<a href="${esc(f.url)}" style="display:inline-block;background:${C.fg};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:10px 16px;border-radius:999px;white-space:nowrap;">${esc(f.cta ?? 'Open folder')}&nbsp;→</a>`
    : `<span style="font-size:13px;color:${C.muted};white-space:nowrap;">Link coming soon</span>`;
  return `
  <tr><td style="padding:0 0 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.tile};border-radius:14px;">
      <tr>
        <td style="padding:16px 8px 16px 18px;">
          <div style="font-size:16px;font-weight:600;color:${C.fg};letter-spacing:-0.01em;">${esc(f.name)}</div>
          <div style="font-size:13px;color:${C.muted};padding-top:3px;">${esc(f.sub)}</div>
        </td>
        <td align="right" style="padding:16px 16px 16px 8px;">${action}</td>
      </tr>
    </table>
  </td></tr>`;
}

function html(c: Content, discord: string) {
  const setup = c.setupUrl
    ? `
      <tr><td style="padding:26px 0 0;border-top:1px solid ${C.line};">
        <div style="font-size:16px;font-weight:600;color:${C.fg};">Finish setting up</div>
        <div style="font-size:14px;line-height:1.55;color:${C.muted};padding:6px 0 16px;">${config.vslUrl ? 'Watch the 7-minute welcome video, book' : 'Book'} your onboarding call and join the community — about ten minutes, then you post your first clip.</div>
        <a href="${esc(c.setupUrl)}" style="display:inline-block;background:${C.green};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px;">Open your setup page</a>
      </td></tr>`
    : '';
  const community = discord
    ? `
      <tr><td style="padding:26px 0 0;${c.setupUrl ? '' : `border-top:1px solid ${C.line};`}">
        <div style="font-size:16px;font-weight:600;color:${C.fg};">Join the community</div>
        <div style="font-size:14px;line-height:1.55;color:${C.muted};padding:6px 0 16px;">Our Discord is ${esc(DISCORD_BLURB)}</div>
        <a href="${esc(discord)}" style="display:inline-block;background:#5865F2;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px;">Join Discord&nbsp;→</a>
      </td></tr>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 8px 18px;font-size:17px;font-weight:700;color:${C.fg};letter-spacing:-0.02em;">FanpageKit</td></tr>
      <tr><td style="background:${C.card};border-radius:22px;padding:34px 26px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 0 6px;"><span style="font-size:12px;font-weight:600;color:${C.green};letter-spacing:0.06em;text-transform:uppercase;">● ${esc(c.badge ?? 'Payment confirmed')}</span></td></tr>
          <tr><td style="padding:0 0 12px;font-size:28px;line-height:1.15;font-weight:700;color:${C.fg};letter-spacing:-0.03em;">${esc(c.heading)}</td></tr>
          <tr><td style="padding:0 0 24px;font-size:15px;line-height:1.6;color:${C.muted};">${esc(c.intro)}</td></tr>
          ${c.folders.map(folderRow).join('')}
          ${c.note ? `<tr><td style="padding:8px 0 4px;font-size:14px;line-height:1.55;color:${C.muted};">${esc(c.note)}</td></tr>` : ''}
          <tr><td style="height:18px;"></td></tr>
          ${setup}
          ${community}
        </table>
      </td></tr>
      <tr><td style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:${C.muted};">
        Questions or a missing link? Just reply to this email.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

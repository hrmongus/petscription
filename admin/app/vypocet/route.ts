import { html } from '@admin/lib/vypocet.generated';
import { asset, requireAdminRoute, vypocetHtml } from '@admin/lib/vypocet';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await requireAdminRoute();
  return asset(vypocetHtml(html, process.env.NEXT_PUBLIC_SITE_URL || 'https://www.granula.sk', new URL(req.url).origin), 'text/html');
}

import { radarJs } from '@admin/lib/vypocet.generated';
import { asset, requireAdminRoute } from '@admin/lib/vypocet';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireAdminRoute();
  return asset(radarJs, 'text/javascript');
}

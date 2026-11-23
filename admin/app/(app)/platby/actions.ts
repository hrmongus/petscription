'use server';

import { revalidatePath } from 'next/cache';
import { adminAction, str, UserError } from '@admin/lib/action';
import { audit } from '@admin/lib/audit';
import { stripe } from '@admin/lib/deps';
import { eur } from '@admin/lib/format';

/** Znova strhnúť neuhradenú faktúru predplatného (uloženou kartou). Pri úspechu vznikne objednávka z webhooku invoice.paid. */
export const retryInvoiceAction = adminAction(async (admin, fd) => {
  const invoiceId = str(fd, 'invoice');
  const subId = str(fd, 'sub');
  const inv = await stripe().invoices.retrieve(invoiceId);
  const sid = typeof inv.parent?.subscription_details?.subscription === 'string' ? inv.parent.subscription_details.subscription : inv.parent?.subscription_details?.subscription?.id;
  if (inv.parent?.subscription_details?.metadata?.app !== 'granula' || !sid) throw new UserError('Faktúra nepatrí predplatnému Granuly.');
  if (inv.status !== 'open') throw new UserError(`Faktúra nie je otvorená (stav ${inv.status}).`);
  try {
    const r = await stripe().invoices.pay(invoiceId);
    await audit(admin.email, 'invoice.retry', 'subscription', subId, null, { invoice: invoiceId, status: r.status, amount_paid: r.amount_paid });
    revalidatePath('/platby');
    return r.status === 'paid' ? `Zaplatené ${eur(r.amount_paid)}. Objednávka vznikne z webhooku o pár sekúnd.` : `Stav faktúry: ${r.status}.`;
  } catch (e) {
    const msg = (e as { raw?: { message?: string }; message: string }).raw?.message ?? (e as Error).message;
    await audit(admin.email, 'invoice.retry_failed', 'subscription', subId, null, { invoice: invoiceId, error: msg });
    throw new UserError(`Platba neprešla: ${msg}`);
  }
});

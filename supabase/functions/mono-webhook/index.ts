// Win Auto: повідомлення monobank про зміну статусу оплати.
// Тілу запиту не довіряємо: статус рахунку щоразу перепитуємо в monobank за секретним токеном.
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => null);
    const invoiceId = body?.invoiceId;
    if (!invoiceId) return new Response('ok');

    const res = await fetch(`https://api.monobank.ua/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`, {
      headers: { 'X-Token': Deno.env.get('MONO_TOKEN')! }
    });
    const inv = await res.json();
    if (!res.ok || !inv.status) return new Response('ok');

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: o } = await db.from('orders').select('id,paid').eq('mono_invoice', invoiceId).maybeSingle();
    if (!o) return new Response('ok');

    if (inv.status === 'success' && !o.paid) {
      await db.from('orders').update({
        paid: true,
        paid_at: new Date().toISOString(),
        invoice: `monobank ${invoiceId}`,
        pay_status: 'success'
      }).eq('id', o.id);
    } else if (!o.paid) {
      // processing, hold, failure, reversed, expired
      await db.from('orders').update({ pay_status: inv.status }).eq('id', o.id);
    }
    return new Response('ok');
  } catch (_e) {
    return new Response('ok');   // monobank повторить спробу; помилки не віддаємо назовні
  }
});

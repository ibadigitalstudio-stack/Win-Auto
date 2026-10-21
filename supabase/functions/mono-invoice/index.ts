// Win Auto: створення рахунку на оплату через monobank (Plata by mono).
// Функція Supabase Edge. Секрет MONO_TOKEN задається в Supabase → Edge Functions → Secrets.
// Сума рахунку береться не з браузера, а перераховується за цінами на сайті та знижкою клієнта з бази.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SITE = 'https://win-auto.com.ua';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Ціни товарів із файлів сайту (кешуються на 5 хвилин)
let priceCache: { at: number; map: Map<string, number> } | null = null;
async function sitePrices(): Promise<Map<string, number>> {
  if (priceCache && Date.now() - priceCache.at < 5 * 60 * 1000) return priceCache.map;
  const t = Date.now();
  const core = await (await fetch(`${SITE}/products.js?t=${t}`)).text();
  const brands: [string, string[]][] = JSON.parse(core.match(/window\.BRANDS=(\[.*?\]);\n/s)![1]);
  const map = new Map<string, number>();
  await Promise.all(brands.map(async ([b]) => {
    const slug = b.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const text = await (await fetch(`${SITE}/data/${slug}.js?t=${t}`)).text();
    const list = JSON.parse(text.slice(text.indexOf(']=') + 2, text.trimEnd().lastIndexOf(';')));
    for (const p of list) map.set(String(p.id), Number(p.p));
  }));
  priceCache = { at: Date.now(), map };
  return map;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { orderId, check } = await req.json();
    if (!orderId) return json({ error: 'Не вказано замовлення' }, 400);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: o } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!o) return json({ error: 'Замовлення не знайдено' }, 404);

    // Сторінка після оплати питає лише статус
    if (check) return json({ paid: o.paid, status: o.pay_status || null });

    if (o.pay !== 'mono') return json({ error: 'Для цього замовлення обрано інший спосіб оплати' }, 400);
    if (o.paid) return json({ error: 'Замовлення вже оплачене' }, 400);

    // Знижка — лише та, яку адміністратор призначив схваленому оптовому клієнту
    let discount = 0;
    if (o.customer_id) {
      const { data: c } = await db.from('wholesale_clients').select('discount,status').eq('id', o.customer_id).maybeSingle();
      if (c && c.status === 'approved') discount = Number(c.discount) || 0;
    }

    // Перерахунок суми за актуальними цінами сайту
    const prices = await sitePrices();
    let total = 0;
    for (const it of o.items || []) {
      const base = prices.get(String(it.id));
      if (base == null) return json({ error: `Товар «${it.name}» більше не продається. Зв'яжіться з нами.` }, 409);
      const unit = discount ? Math.round(base * (100 - discount)) / 100 : base;
      total += unit * Number(it.qty);
    }
    total = Math.round(total * 100) / 100;
    if (Math.abs(total - Number(o.total)) > 1) {
      return json({ error: 'Ціни змінилися з моменту оформлення. Оновіть сторінку та оформіть замовлення ще раз.' }, 409);
    }

    const res = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
      method: 'POST',
      headers: { 'X-Token': Deno.env.get('MONO_TOKEN')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(total * 100),          // у копійках
        ccy: 980,
        merchantPaymInfo: { reference: o.id, destination: `Оплата замовлення ${o.id}` },
        redirectUrl: `${SITE}/checkout.html?paid=${encodeURIComponent(o.id)}`,
        webHookUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mono-webhook`,
        validity: 3600
      })
    });
    const inv = await res.json();
    if (!res.ok || !inv.pageUrl) return json({ error: 'monobank: ' + (inv.errText || inv.errCode || res.status) }, 502);

    await db.from('orders').update({ mono_invoice: inv.invoiceId, pay_status: 'created' }).eq('id', o.id);
    return json({ pageUrl: inv.pageUrl });
  } catch (e) {
    return json({ error: 'Помилка сервера оплати: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});

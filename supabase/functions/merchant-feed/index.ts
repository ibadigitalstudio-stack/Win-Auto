// Win Auto: автооновлюваний фід товарів для Google Merchant Center.
// Щоразу формується з актуальних даних сайту (ціни, наявність, нові товари з адмін-панелі).
// Та сама логіка, що й у tools/make_feed.py. Адреса для Merchant Center:
//   https://<проєкт>.supabase.co/functions/v1/merchant-feed
const SITE = 'https://win-auto.com.ua';

type P = { id: string; n: string; d?: string; p: number; s: boolean; img: string; a?: [string, string][]; oe: string[]; o?: number; cars: [string, string][]; g: string; sg?: string };

const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const KEYS: Record<string, string> = {
  'Cторона': 'Сторона', 'Сторонаі': 'Сторона', 'Місце у машині': 'Місце в машині', 'Місце в автомобілі': 'Місце в машині',
  'Розташування': 'Місце в машині', 'Передній/задній': 'Місце в машині', 'Рік': 'Роки випуску', 'Деталі моделі': 'Версія / комплектація'
};
const SKIP = new Set(['Опис', 'Код запчастини', 'Тип продукту', 'Тип товару', 'Якість', 'Стан', 'Виробник']);

function item(p: P, cats: Record<string, string>): string {
  const [carB, carM] = p.cars[0];
  const title = p.n.toLowerCase().includes(carB.toLowerCase()) ? p.n : `${p.n} ${carB} ${carM}`;
  const cars = p.cars.map((c) => c.join(' '));
  const details: [string, string, string][] = [];
  const seen = new Set<string>();
  for (const [k0, v0] of p.a || []) {
    const k1 = k0.trim().replace(/^﻿/, '');
    const k = KEYS[k1] || k1, v = String(v0).trim();
    if (SKIP.has(k) || !v || seen.has(k + '|' + v)) continue;
    seen.add(k + '|' + v); details.push(['Характеристики', k, v]);
  }
  details.push(['Характеристики', 'Тип деталі', p.o ? 'Оригінал' : 'Аналог (не оригінал)']);
  if (p.oe?.length) details.push(['Характеристики', 'Оригінальний номер (OE)', p.oe.slice(0, 5).join(', ')]);
  details.push(['Сумісність', 'Підходить для', cars.slice(0, 30).join(', ')]);
  if (cars.length > 1) for (const c of cars.slice(0, 10)) details.push(['Сумісність', 'Марка і модель', c]);
  const years = details.find((d) => d[1] === 'Роки випуску')?.[2] || '';
  const highlights = [
    `Підходить для ${cars.slice(0, 3).join(', ')}` + (years ? ` (${years})` : ''),
    p.o ? 'Оригінальна деталь' : 'Якісний аналог оригінальної деталі',
    'В наявності на складі Win Auto',
    'Відправка в день замовлення, якщо оформлено до 14:00',
    'Обмін і повернення протягом 14 днів'
  ];
  const attrs = details.filter((d) => d[0] === 'Характеристики' && d[1] !== 'Оригінальний номер (OE)').map((d) => `${d[1]}: ${d[2]}`).join('; ');
  const desc = `${p.n}. Підходить для: ${cars.slice(0, 8).join(', ')}.` + (p.d ? ` ${p.d}.` : '') + (attrs ? ` ${attrs}.` : '') +
    (p.oe?.length ? ` Оригінальний номер (OE): ${p.oe.slice(0, 3).join(', ')}.` : '');
  const link = `${SITE}/catalog.html?` + new URLSearchParams({ brand: carB, model: carM, cat: 'all', p: p.id }).toString();
  const ptype = (cats[p.g] || '') + (p.sg ? ' > ' + p.sg : '');
  const out = [
    `<g:id>${esc(p.id)}</g:id>`, `<g:title>${esc(title.slice(0, 150))}</g:title>`, `<g:description>${esc(desc.slice(0, 5000))}</g:description>`,
    `<g:link>${esc(link)}</g:link>`, `<g:image_link>${SITE}/${esc(p.img)}</g:image_link>`,
    '<g:availability>in_stock</g:availability>', `<g:price>${Math.round(p.p)} UAH</g:price>`, '<g:condition>new</g:condition>',
    '<g:brand>Win Auto</g:brand>', '<g:identifier_exists>no</g:identifier_exists>',
    '<g:google_product_category>Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories &gt; Motor Vehicle Parts</g:google_product_category>',
    `<g:product_type>${esc(carB + ' > ' + carM + ' > ' + ptype)}</g:product_type>`,
    `<g:custom_label_0>${esc(carB)}</g:custom_label_0>`, `<g:custom_label_1>${esc((carB + ' ' + carM).slice(0, 100))}</g:custom_label_1>`,
    `<g:custom_label_2>${p.o ? 'Оригінал' : 'Аналог'}</g:custom_label_2>`,
    ...highlights.map((h) => `<g:product_highlight>${esc(h.slice(0, 150))}</g:product_highlight>`),
    ...details.slice(0, 40).map(([s, k, v]) =>
      `<g:product_detail><g:section_name>${esc(s)}</g:section_name><g:attribute_name>${esc(k.slice(0, 140))}</g:attribute_name><g:attribute_value>${esc(v.slice(0, 1000))}</g:attribute_value></g:product_detail>`)
  ];
  return '<item>\n' + out.join('\n') + '\n</item>';
}

Deno.serve(async () => {
  try {
    const t = Date.now();
    const core = await (await fetch(`${SITE}/products.js?t=${t}`)).text();
    const brands: [string, string[]][] = JSON.parse(core.match(/window\.BRANDS=(\[.*?\]);\n/s)![1]);
    const cats: Record<string, string> = {};
    for (const c of JSON.parse(core.match(/window\.CATS=(\[.*?\]);\n/s)![1])) cats[c.id] = c.t;
    const lists = await Promise.all(brands.map(async ([b]) => {
      const slug = b.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const text = await (await fetch(`${SITE}/data/${slug}.js?t=${t}`)).text();
      return JSON.parse(text.slice(text.indexOf(']=') + 2, text.trimEnd().lastIndexOf(';'))) as P[];
    }));
    const seen = new Set<string>(), items: string[] = [];
    for (const list of lists) for (const p of list) {
      // лише товари з фото, ціною й у наявності
      if (seen.has(p.id) || !p.img || !p.p || !p.s) continue;
      seen.add(p.id); items.push(item(p, cats));
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Win Auto — кузовні запчастини, оптика та тюнінг</title>
<link>${SITE}</link>
<description>Фід товарів Win Auto для Google Merchant Center (${new Date().toISOString().slice(0, 10)})</description>
${items.join('\n')}
</channel>
</rss>
`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=1800' } });
  } catch (e) {
    return new Response('Помилка формування фіду: ' + (e instanceof Error ? e.message : String(e)), { status: 500 });
  }
});

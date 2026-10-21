# -*- coding: utf-8 -*-
# Фід товарів для Google Merchant Center: merchant-feed.xml у корені сайту.
# Запуск: python3 tools/make_feed.py (з папки win-auto) — після змін каталогу.
import json, re, html, os, urllib.parse
from datetime import datetime, timezone
SITE = 'https://win-auto.com.ua'
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
core = open(os.path.join(root, 'products.js'), encoding='utf-8').read()
brands = json.loads(re.search(r'window\.BRANDS=(\[.*?\]);\n', core, re.S).group(1))
cats = {c['id']: c['t'] for c in json.loads(re.search(r'window\.CATS=(\[.*?\]);\n', core, re.S).group(1))}
esc = lambda s: html.escape(str(s), quote=False)
seen, items = set(), []
for b, _ in brands:
    slug = re.sub(r'[^a-z0-9]+', '-', b.lower())
    t = open(os.path.join(root, 'data', slug + '.js'), encoding='utf-8').read()
    for p in json.loads(t[t.index(']=') + 2: t.rstrip().rindex(';')]):
        # у фід — лише товари з фото, ціною й у наявності (вимоги Google)
        if p['id'] in seen or not p.get('img') or not p.get('p') or not p.get('s'): continue
        if not os.path.exists(os.path.join(root, p['img'])): continue
        seen.add(p['id'])
        car_b, car_m = p['cars'][0]
        title = p['n'] if car_b.lower() in p['n'].lower() else f"{p['n']} {car_b} {car_m}"
        cars = ', '.join(' '.join(c) for c in p['cars'][:8])
        attrs = '; '.join(f"{k}: {v}" for k, v in p.get('a', [])[:6])
        desc = f"{p['n']}. Підходить для: {cars}." + (f" {p['d']}." if p.get('d') else '') + (f" {attrs}." if attrs else '') + \
               (f" Оригінальний номер (OE): {', '.join(p['oe'][:3])}." if p.get('oe') else '') + (' Оригінал.' if p.get('o') else ' Якісний аналог.')
        link = f"{SITE}/catalog.html?" + urllib.parse.urlencode({'brand': car_b, 'model': car_m, 'cat': 'all', 'p': p['id']})
        ptype = cats.get(p['g'], '') + (' > ' + p['sg'] if p.get('sg') else '')
        items.append(f"""<item>
<g:id>{esc(p['id'])}</g:id>
<g:title>{esc(title[:150])}</g:title>
<g:description>{esc(desc[:5000])}</g:description>
<g:link>{esc(link)}</g:link>
<g:image_link>{SITE}/{esc(p['img'])}</g:image_link>
<g:availability>in_stock</g:availability>
<g:price>{round(p['p'])} UAH</g:price>
<g:condition>new</g:condition>
<g:brand>Win Auto</g:brand>
<g:identifier_exists>no</g:identifier_exists>
<g:google_product_category>Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories &gt; Motor Vehicle Parts</g:google_product_category>
<g:product_type>{esc(ptype)}</g:product_type>
<g:custom_label_0>{esc(car_b)}</g:custom_label_0>
</item>""")
feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Win Auto — кузовні запчастини, оптика та тюнінг</title>
<link>{SITE}</link>
<description>Фід товарів Win Auto для Google Merchant Center ({datetime.now(timezone.utc).strftime('%Y-%m-%d')})</description>
{chr(10).join(items)}
</channel>
</rss>
"""
open(os.path.join(root, 'merchant-feed.xml'), 'w', encoding='utf-8').write(feed)
print('товарів у фіді:', len(items), '· розмір', round(len(feed.encode()) / 1e6, 1), 'МБ')

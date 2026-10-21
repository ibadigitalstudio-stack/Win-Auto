# -*- coding: utf-8 -*-
# Фід товарів для Google Merchant Center: merchant-feed.xml у корені сайту.
# Запуск: python3 tools/make_feed.py (з папки win-auto) — після змін каталогу.
# Та сама логіка працює в серверній функції supabase/functions/merchant-feed (автооновлюваний фід).
import json, re, html, os, urllib.parse
from datetime import datetime, timezone

SITE = 'https://win-auto.com.ua'
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
core = open(os.path.join(root, 'products.js'), encoding='utf-8').read()
brands = json.loads(re.search(r'window\.BRANDS=(\[.*?\]);\n', core, re.S).group(1))
cats = {c['id']: c['t'] for c in json.loads(re.search(r'window\.CATS=(\[.*?\]);\n', core, re.S).group(1))}
esc = lambda s: html.escape(str(s), quote=False)

# назви характеристик приводимо до єдиного вигляду
KEYS = {'Cторона': 'Сторона', 'Сторонаі': 'Сторона', 'Місце у машині': 'Місце в машині', 'Місце в автомобілі': 'Місце в машині',
        'Розташування': 'Місце в машині', 'Передній/задній': 'Місце в машині', 'Рік': 'Роки випуску', 'Деталі моделі': 'Версія / комплектація'}
SKIP = {'Опис', 'Код запчастини', 'Тип продукту', 'Тип товару', 'Якість', 'Стан', 'Виробник'}

def item(p):
    car_b, car_m = p['cars'][0]
    title = p['n'] if car_b.lower() in p['n'].lower() else f"{p['n']} {car_b} {car_m}"
    cars = [' '.join(c) for c in p['cars']]
    details, seen = [], set()
    for k, v in p.get('a', []):
        k = KEYS.get(k.strip().lstrip('﻿'), k.strip().lstrip('﻿'))
        if k in SKIP or not str(v).strip() or (k, v) in seen: continue
        seen.add((k, v)); details.append(('Характеристики', k, str(v).strip()))
    details.append(('Характеристики', 'Тип деталі', 'Оригінал' if p.get('o') else 'Аналог (не оригінал)'))
    if p.get('oe'): details.append(('Характеристики', 'Оригінальний номер (OE)', ', '.join(p['oe'][:5])))
    # сумісність з авто — окремим блоком характеристик
    details.append(('Сумісність', 'Підходить для', ', '.join(cars[:30])))
    if len(cars) > 1:
        for c in cars[:10]: details.append(('Сумісність', 'Марка і модель', c))
    years = next((v for s, k, v in details if k == 'Роки випуску'), '')
    highlights = [
        f"Підходить для {', '.join(cars[:3])}" + (f" ({years})" if years else ''),
        'Оригінальна деталь' if p.get('o') else 'Якісний аналог оригінальної деталі',
        'В наявності на складі Win Auto',
        'Відправка в день замовлення, якщо оформлено до 14:00',
        'Обмін і повернення протягом 14 днів'
    ]
    attrs = '; '.join(f"{k}: {v}" for s, k, v in details if s == 'Характеристики' and k not in ('Оригінальний номер (OE)',))
    desc = f"{p['n']}. Підходить для: {', '.join(cars[:8])}." + (f" {p['d']}." if p.get('d') else '') + (f" {attrs}." if attrs else '') + \
           (f" Оригінальний номер (OE): {', '.join(p['oe'][:3])}." if p.get('oe') else '')
    link = f"{SITE}/catalog.html?" + urllib.parse.urlencode({'brand': car_b, 'model': car_m, 'cat': 'all', 'p': p['id']})
    ptype = cats.get(p['g'], '') + (' > ' + p['sg'] if p.get('sg') else '')
    out = [f"<g:id>{esc(p['id'])}</g:id>", f"<g:title>{esc(title[:150])}</g:title>", f"<g:description>{esc(desc[:5000])}</g:description>",
           f"<g:link>{esc(link)}</g:link>", f"<g:image_link>{SITE}/{esc(p['img'])}</g:image_link>",
           '<g:availability>in_stock</g:availability>', f"<g:price>{round(p['p'])} UAH</g:price>", '<g:condition>new</g:condition>',
           '<g:brand>Win Auto</g:brand>', '<g:identifier_exists>no</g:identifier_exists>',
           '<g:google_product_category>Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories &gt; Motor Vehicle Parts</g:google_product_category>',
           f"<g:product_type>{esc(car_b + ' > ' + car_m + ' > ' + ptype)}</g:product_type>",
           f"<g:custom_label_0>{esc(car_b)}</g:custom_label_0>", f"<g:custom_label_1>{esc((car_b + ' ' + car_m)[:100])}</g:custom_label_1>",
           f"<g:custom_label_2>{'Оригінал' if p.get('o') else 'Аналог'}</g:custom_label_2>"]
    out += [f"<g:product_highlight>{esc(h[:150])}</g:product_highlight>" for h in highlights[:10]]
    out += [f"<g:product_detail><g:section_name>{esc(s)}</g:section_name><g:attribute_name>{esc(k[:140])}</g:attribute_name><g:attribute_value>{esc(v[:1000])}</g:attribute_value></g:product_detail>"
            for s, k, v in details[:40]]
    return '<item>\n' + '\n'.join(out) + '\n</item>'

seen, items = set(), []
for b, _ in brands:
    slug = re.sub(r'[^a-z0-9]+', '-', b.lower())
    t = open(os.path.join(root, 'data', slug + '.js'), encoding='utf-8').read()
    for p in json.loads(t[t.index(']=') + 2: t.rstrip().rindex(';')]):
        # у фід — лише товари з фото, ціною й у наявності (вимоги Google)
        if p['id'] in seen or not p.get('img') or not p.get('p') or not p.get('s'): continue
        if not os.path.exists(os.path.join(root, p['img'])): continue
        seen.add(p['id']); items.append(item(p))

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

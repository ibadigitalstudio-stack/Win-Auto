# -*- coding: utf-8 -*-
# Імпорт каталогу з прайсу постачальника (PriceList.xlsx) у файли сайту: products.js і data/<марка>.js.
# Запуск з папки win-auto:  python3 tools/import_price.py ~/Downloads/PriceList.xlsx [--markup 15]
# Беруться лише товари в наявності (Qty > 0). Ціна = «Price With VAT» + націнка, округлена до гривні.
# Марки й моделі: наявні на сайті (tools/site_models.json) лишаються, товари прив'язуються до них; решта додається з прайсу.
# Фото: якщо файл з колонки «Image File» лежить у img/, товар отримує фото; інакше — «Фото очікується».
import json, os, re, sys, zipfile, collections, xml.etree.ElementTree as ET

here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
args = sys.argv[1:]
if not args: sys.exit('Вкажіть шлях до PriceList.xlsx')
SRC = os.path.expanduser(args[0])
MARKUP = float(args[args.index('--markup') + 1]) if '--markup' in args else 15.0
UNIVERSAL = 'Універсальні'

# ---------- читання xlsx без сторонніх бібліотек ----------
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def xlsx_rows(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for _, el in ET.iterparse(z.open('xl/sharedStrings.xml')):
            if el.tag == NS + 'si':
                shared.append(''.join(t.text or '' for t in el.iter(NS + 't'))); el.clear()
    col = lambda ref: sum((ord(c) - 64) * 26 ** i for i, c in enumerate(reversed(re.match(r'[A-Z]+', ref).group())))
    for _, el in ET.iterparse(z.open('xl/worksheets/sheet1.xml')):
        if el.tag != NS + 'row': continue
        row = {}
        for c in el.iter(NS + 'c'):
            t = c.get('t'); v = c.find(NS + 'v')
            if t == 's': val = shared[int(v.text)]
            elif t == 'inlineStr': val = ''.join(x.text or '' for x in c.iter(NS + 't'))
            else: val = v.text if v is not None else ''
            row[col(c.get('r')) - 1] = (val or '').strip()
        el.clear()
        yield [row.get(i, '') for i in range(max(row) + 1)] if row else []

# ---------- марки та моделі ----------
BRAND_KEYS = {'VW': 'Volkswagen', 'MERCEDES BENZ': 'Mercedes-Benz', 'MERCEDES': 'Mercedes-Benz', 'LAND ROVER': 'Land Rover',
              'RANGE ROVER': 'Land Rover', 'ALFA ROMEO': 'Alfa Romeo', 'BMW-M3': 'BMW', 'DACIA/RENAULT': 'Dacia', 'LYNK & CO': 'Lynk & Co',
              'MINI': 'MINI', 'MG': 'MG', 'GMC': 'GMC', 'DAF': 'DAF', 'MAN': 'MAN', 'BMW': 'BMW', 'DS': 'DS', 'SSANGYONG': 'SsangYong'}
# позиції без конкретного авто → розділи «Універсальних»
UNIVERSAL_MODELS = [(r'CLIPS', 'Кріплення та кліпси'), (r'LAMP|SOCKET', 'Лампи та освітлення'), (r'WIPER', 'Склоочисники'),
                    (r'BATTER', 'Акумулятори'), (r'ALYVA|OIL|CHEMIJA', 'Масла та автохімія'), (r'', 'Аксесуари та інше')]
YEARS = re.compile(r'[,.]?\s*(\d{2}(?:\.\d{2})?|\d{6})\s*-\s*(\d{2}(?:\.\d{2})?|\d{6})?\s*$')

def year(s):
    if not s: return None
    s = s.split('.')[-1]
    if len(s) == 6: s = s[2:4]
    v = int(s[:2]); return 1900 + v if v > 40 else 2000 + v

def parse_model(m):
    """'BMW 5 (F10/F11), 09 - 17' → ('BMW', '5 (F10/F11)', 2009, 2017); без років — універсальний товар"""
    y = YEARS.search(m)
    if not y:
        return UNIVERSAL, next(t for k, t in UNIVERSAL_MODELS if re.search(k, m.upper())), None, None
    body = m[:y.start()].strip(' ,.'); up = body.upper()
    for k in sorted(BRAND_KEYS, key=len, reverse=True):
        if up == k or up.startswith(k + ' '):
            brand, rest = BRAND_KEYS[k], body[len(k):].strip(); break
    else:
        w = body.split(' ', 1); brand, rest = w[0].title(), (w[1] if len(w) > 1 else '')
    if up.startswith('RANGE ROVER'): rest = 'Range Rover ' + rest
    return brand, rest.strip(), year(y.group(1)), year(y.group(2))

ROMAN = {'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'}
KEEP = {'GT', 'GTI', 'RS', 'AMG', 'SUV', 'EV', 'USA', 'EU', 'SW', 'CC', 'GL', 'GLS', 'CR-V', 'HR-V', 'MX-5', 'RAV', 'BZ4X'}
def pretty(s):
    def word(w):
        if not w or w in ROMAN or w in KEEP or re.search(r'\d', w) or len(w) <= 3: return w
        return '-'.join(p if len(p) <= 1 else p[0] + p[1:].lower() for p in w.split('-'))
    out, depth = [], 0
    for tok in re.split(r'(\s+|[()/,])', s):
        if tok == '(': depth += 1
        if tok == ')': depth -= 1
        out.append(tok if depth or not tok.isupper() else word(tok))
    return re.sub(r'\s+', ' ', ''.join(out)).strip()

def model_title(base, y1, y2):
    return f"{pretty(base)} {y1}–{y2 or ''}".strip() if y1 else pretty(base)

core_path = os.path.join(root, 'products.js')
core = open(core_path, encoding='utf-8').read()
# базові марки й моделі сайту (з фото авто в cars/); products.js після імпорту — це вже результат, тому беремо звідси
OLD = json.load(open(os.path.join(here, 'site_models.json'), encoding='utf-8'))
RATES = re.search(r'window\.RATES=(.*?);\n', core).group(1)
codes = lambda s: {x for x in re.split(r'[\s/,]+', ' '.join(re.findall(r'\(([^)]*)\)', s)).upper()) if x}
base = lambda s: re.sub(r'\s+', ' ', re.sub(r'\(.*?\)', '', s)).strip().upper()

# моделі сайту, які не зіставляються автоматично: (база в прайсі, рік початку від, до)
ALIAS = {
    ('Audi', 'A5 (8T)'): [('A5 (B8)', 2007, 2016)], ('Audi', 'A5 (F5)'): [('A5 (B9)', 2016, 2024)],
    ('Audi', 'Q4 e-tron (F4)'): [('Q4 E-TRON (FZ)', 2021, 2030)],
    ('Ford', 'Edge II (CD4)'): [('EDGE', 2015, 2019)], ('Ford', 'Explorer V (U502)'): [('EXPLORER', 2010, 2018)],
    ('Ford', 'Explorer VI (U625)'): [('EXPLORER', 2020, 2030)], ('Ford', 'Focus III (MK3)'): [('FOCUS', 2011, 2014)],
    ('Ford', 'Kuga II / Escape (MK2)'): [('KUGA', 2013, 2017)], ('Ford', 'Mondeo V (MK5)'): [('MONDEO', 2015, 2020)],
    ('Ford', 'Mustang VI (S550)'): [('MUSTANG', 2015, 2018)],
    ('Ford', 'Transit VIII (MK8 / V363)'): [('TRANSIT/TOURNEO', 2014, 2014), ('TRANSIT', 2019, 2030)],
    ('Honda', 'Accord X (CV)'): [('ACCORD', 2018, 2018)],
    ('Hyundai', 'Elantra VI (AD)'): [('ELANTRA', 2015, 2015)], ('Hyundai', 'Ioniq (AE)'): [('IONIQ PLUG-IN', 2016, 2016)],
    ('Hyundai', 'Ioniq 5 (NE)'): [('IONIQ 5', 2021, 2021)], ('Hyundai', 'Kona (OS)'): [('KONA', 2017, 2017)],
    ('Hyundai', 'Santa Fe III (DM)'): [('SANTAFE', 2013, 2013)], ('Hyundai', 'Tucson III (TL)'): [('TUCSON', 2015, 2015)],
    ('Hyundai', 'Tucson IV (NX4)'): [('TUCSON', 2020, 2020)],
    ('Land Rover', 'Defender II (L663)'): [('DEFENDER', 2020, 2020)], ('Land Rover', 'Discovery 4 (L319)'): [('DISCOVERY IV', 2009, 2009)],
    ('Land Rover', 'Discovery 5 (L462)'): [('DISCOVERY V', 2016, 2016)], ('Land Rover', 'Discovery Sport (L550)'): [('DISCOVERY SPORT', 2014, 2014)],
    ('Land Rover', 'Range Rover Evoque (L538)'): [('RANGE ROVER EVOQUE I', 2011, 2015)],
    ('Land Rover', 'Range Rover Evoque (L551)'): [('RANGE ROVER EVOQUE II', 2018, 2018)],
    ('Land Rover', 'Range Rover IV (L405)'): [('RANGE ROVER IV', 2012, 2017)],
    ('Land Rover', 'Range Rover Sport II (L494)'): [('RANGE ROVER SPORT II', 2013, 2017)],
    ('Land Rover', 'Range Rover V (L460)'): [('RANGE ROVER V', 2021, 2021)], ('Land Rover', 'Range Rover Velar (L560)'): [('RANGE ROVER VELAR', 2017, 2017)],
    ('Lexus', 'ES350 (XV50/XV60)'): [('ES (XV50)', 2012, 2012), ('ES (XV60)', 2015, 2015)],
    ('Mazda', '3 (BM) 2013–2016'): [('3 (BM)', 2014, 2014)], ('Mazda', '3 (BM / BN) 2017-2018'): [('3 (BM)', 2017, 2017)],
    ('Mazda', '3 (BP) 2019 -'): [('3 (BP)', 2018, 2019)],
    ('Mazda', '6 (GJ) 2012-2015'): [('6', 2012, 2012)], ('Mazda', '6 (GJ) 2015-2018'): [('6', 2014, 2014)],
    ('Mazda', '6 (GJ) 2018-2024'): [('6', 2018, 2018)], ('Mazda', 'CX-5 (KE)'): [('CX-5', 2012, 2012)], ('Mazda', 'CX-5 II (KF)'): [('CX-5', 2017, 2017)],
    ('Mercedes-Benz', 'E-Class (W214)'): [('(E-CLASS W214)', 2023, 2023), ('E-CLASS T-MODEL (S214)', 2023, 2023)],
    ('Mercedes-Benz', 'GLC-Class (X254)'): [('(GLC X254)', 2022, 2022), ('(GLC COUPE C254)', 2023, 2023)],
    ('Mercedes-Benz', 'Vito (V-Class W447)'): [('VITO/V-CLASS (W447)', 2014, 2014)],
    ('MINI', '(F55 / F56)'): [('COOPER (F55/F56)', 2013, 2013)],
    ('Nissan', 'Murano (Z52)'): [('MURANO', 2015, 2019)], ('Nissan', 'X-Trail III (T32)'): [('X-TRAIL', 2014, 2017)],
    ('Nissan', 'X-Trail IV (T33)'): [('X-TRAIL', 2021, 2024)], ('Peugeot', '3008 II'): [('3008', 2016, 2021)],
    ('Porsche', 'Taycan (Y1A)'): [('TAYCAN (9J1)', 2019, 2019)],
    ('Skoda', 'Fabia III'): [('FABIA', 2014, 2018)], ('Skoda', 'Kodiaq I'): [('KODIAQ', 2017, 2017)],
    ('Skoda', 'Octavia A7'): [('OCTAVIA', 2013, 2017)], ('Skoda', 'Octavia A8'): [('OCTAVIA', 2020, 2020)],
    ('Skoda', 'Rapid I'): [('RAPID', 2012, 2012)], ('Skoda', 'Superb II (B6)'): [('SUPERB', 2008, 2013)],
    ('Skoda', 'Superb III (B8)'): [('SUPERB', 2015, 2015)],
    ('Toyota', 'C-HR I (AX10)'): [('C-HR', 2016, 2016)], ('Toyota', 'Highlander III (XU50)'): [('HIGHLANDER', 2014, 2019)],
    ('Toyota', 'Highlander IV (XU70)'): [('HIGHLANDER', 2020, 2020)],
    ('Volkswagen', 'Tiguan (2016-2020)'): [('TIGUAN', 2016, 2016)], ('Volkswagen', 'Touareg 3 (CR7)'): [('TOUAREG', 2018, 2018)],
    ('Volvo', 'S40'): [('S40/V50', 2003, 2012)], ('Volvo', 'S60 II / V60 I'): [('S60/V60', 2010, 2013)],
    ('Volvo', 'S60 III / V60 II (SPA)'): [('S60 III', 2019, 2019), ('V60 II', 2019, 2019)],
    ('Volvo', 'S80 II / V70 III / XC70 III'): [('S80', 2006, 2013), ('V70', 2007, 2007), ('XC70', 2007, 2007)],
    ('Volvo', 'S90'): [('S90/V90', 2016, 2016)], ('Volvo', 'V40 II'): [('V40', 2012, 2012)],
    ('Volvo', 'XC60'): [('XC60', 2008, 2013)], ('Volvo', 'XC60 II'): [('XC60', 2017, 2017)],
    ('Volvo', 'XC90'): [('XC90', 2002, 2002)], ('Volvo', 'XC90 II'): [('XC90', 2015, 2015)],
}

def site_model(brand, rest, y1):
    """модель сайту, до якої належить модель з прайсу (None — нової моделі на сайті ще немає)"""
    for om in dict(OLD).get(brand, []):
        al = ALIAS.get((brand, om))
        if al is not None:
            if any(rest.upper() == b and y1 and a <= y1 <= z for b, a, z in al): return om
            continue
        oc, ob = codes(om), base(om)
        if (oc and oc & codes(rest) and base(rest).split(' ')[0] == ob.split(' ')[0]) or (not oc and base(rest) == ob):
            return om
    return None

# ---------- категорії ----------
NEW_CATS = [('c12', 'Скло та дзеркала'), ('c13', 'Охолодження та кондиціонер'), ('c14', 'Підвіска, кермо та гальма'),
            ('c15', 'Фільтри, масла та рідини'), ('c16', 'Склоочисники та омивачі'), ('c17', 'Лампи та електрика'),
            ('c18', 'Кріплення та кліпси'), ('c19', 'Автохімія та аксесуари')]
B = 'c0'
RULES = [  # (шаблон назви, категорія, підкатегорія) — перший збіг виграє
    (r'ОМИВАЧ|СКЛООЧИСН|ДВІРНИК|СКЛООМИВ|ОЧИСНИК', 'c16', ''),
    (r'ЛОБОВ|СКЛО ДВЕР|ЗАДНЄ СКЛО|СКЛО ДЗЕРК|ДЗЕРКАЛ|УЩІЛЬНЮВАЧ ЛОБ|ПIД ЛОБОВ|ПІД ЛОБОВ', 'c12', ''),
    (r'ФАР|ЛІХТАР|ЛIХТАР|ПОВОРОТ|ПОВТОРЮВАЧ|ПРОТИТУМ|ПРОТИВОТУМ|ДЕННОГО|КСЕНОН|LED|ПІДСВІ|ВІДБИВАЧ|КАТАФОТ|ОСВІТЛ', 'c8', ''),
    (r'ЛАМП|ЦОКОЛЬ|АКУМУЛЯТОР|ДАТЧИК|БЛОК|ЗАПОБІЖН|КАБЕЛЬ|КОНЕКТОР|РОЗ.ЄМ|ПЕРЕМИКАЧ|КНОПКА|СИГНАЛ|ГЕНЕРАТОР|СВІЧА|СВЕЧА|КОТУШКА|МУЛЬТИМЕД|ВІДЕОКАМ|ПАРКУВАН|ПРОВОДКА|ЛЯМБДА|АДАПТЕР|КОНТАКТ ДВЕРЕЙ', 'c17', ''),
    (r'ФІЛЬТР|МАСЛО|ОЛИВ|АНТИФРИЗ|РІДИН|ADBLUE|ПРИСАДК|ВОДА ДИСТ|SAE', 'c15', ''),
    (r'РАДІАТОР|ІНТЕРКУЛЕР|КОНДИЦІОН|ВЕНТИЛЯТОР|РОЗШИРЮВАЛ|ТЕРМОСТАТ|ОХОЛОДЖ|ПАТРУБОК|ВИПАРНИК|ВОДЯНИЙ НАСОС|ОБІГРІВ|ФЛАНЕЦЬ', 'c13', ''),
    (r'ВАЖІЛЬ|ВАЖЕЛ|СТАБІЛІЗАТОР|ТЯГ|САЙЛЕНТ|АМОРТИЗАТОР(?! (БАГАЖ|КАПОТ))|ПІДШИПНИК|СТУПІЦ|СТУПИЦ|ПРУЖИН|ОПОРА|ГАЛЬМ|ТОРМОЗ|КЕРМ|РУЛЬОВ|РУЛЕВ|ПРИВОДНОЙ|ПОДУШКА|ЗЧЕПЛЕН|ВТУЛКА', 'c14', ''),
    (r'КЛІПС|ПЛАСТМАСОВІ КРІПЛ|ГВИНТ|ҐВИНТ|ГАЙКА|БОЛТ|ЗАТИСКАЧ|ЗАКЛЕП', 'c18', ''),
    (r'РЕШІТК|РАМОЧКА ДЛЯ РЕШ|ХРОМ НА РЕШ|НАПИС НА РЕШ|СТРІЧКА НАД РЕШ|ПЛАСТМАСА НАД РЕШ', B, 'Решітки та їх частини'),
    (r'ЗАГЛУШКА|ГАЧКА|КРИШКА ДЛЯ РЕШ', B, 'Заглушки та катафоти'),
    (r'СПОЙЛЕР БАМПЕР|ДИФУЗОР(?! (КОНД|РАД))|РАМКА ДИФУЗОР|ГУБА', B, 'Спойлери / Губи / Дифузори'),
    (r'ОБВІС', B, 'Обвіси'),
    (r'(ПЕРЕДНІЙ|ЗАДНІЙ|БОКОВИЙ) БАМПЕР', B, 'Бампери'),
    (r'БАМПЕР', B, 'Елементи бампера'),
    (r'ПОРОГ', 'c7', ''),
    (r'КАПОТ', 'c2', ''),
    (r'КРИЛ|ПІДКРИЛ|НАДКРИЛ|АРКА|АРКИ|БРИЗКОВИК', 'c3', ''),
    (r'ЗАХИСТ|ЗАЩИТА|НИЖНІЙ ЗАХ|ДНИЩЕ|КАРТЕР|ТЕПЛОЗАХ', 'c1', ''),
    (r'РАМА|КРОНШТЕЙН|ЛОНЖЕРОН|ТРАВЕРС|ОБРОБКА НАД РАД|ПАНЕЛЬ(?! ЗАДН)', 'c4', ''),
    (r'ЗАДНЯ ПАНЕЛЬ|ГАК ДЛЯ БУКС|БАГАЖНИК(?!А)|ЗАВІСКА БАГАЖ|ЖАЛЮЗІ', 'c5', ''),
    (r'ДВЕР|БАГАЖНИКА|ЗАМОК|СКЛОПІДЙОМ|РУЧК|МОЛДИНГ|МОЛДІНГ|БІК|ЛЮК|ДАХ|ЗАЛІЗО|БАК|ЕМБЛЕМ|EМБЛЕМ|НАКЛАДК|ОЗДОБЛЕН|ОБЛИЦЮВ|СТІЙКИ', 'c6', ''),
    (r'ДЕФЛЕКТОР|СПОЙЛЕР|ДИСК|РОЗШИРЮВАЧ|ДЕКОР|ЗАХИСНА ДУГА|СХОДИ|РАМКА ДЛЯ НОМ|НОМЕРНА РАМКА', 'c9', ''),
    (r'ЗАСІБ|КЛЕЙ|КЛЕЇ|ГЕРМЕТИК|НАНОПОКР|ЛАК|ФАРБ|КРАСК|ШПАКЛ|ШЛІФ|РУКАВИЧ|ПАПІР|СТРІЧК|ПЛІВК|ПІСТОЛЕТ|КОМПРЕСОР|ІНСТРУМЕНТ|КИЛИМ|АКСЕСУАР|ОСВІЖУВАЧ|ЗАРЯД|ТЕСТЕР|ЛІХТАРИК|РОЗЧИННИК|МАСТИЛ|ОЧИЩ|НАКЛЕЙК|КОВПАК|ОБОДА|АНТИКОРОЗ|ЗАХИСНЕ ПОКРИТ|ГЕЛЬ', 'c19', ''),
]
SKIP = re.compile(r'ПОКРАСК|ОКРАСК|ПОШКОДЖЕН|ВАРТІСТЬ ЗВОРОТН', re.I)
def category(name):
    up = name.upper()
    for rx, g, sg in RULES:
        if re.search(rx, up): return g, sg
    return 'c11', ''

def sentence(s):
    s = s.replace('ПIД', 'ПІД').strip()
    out = ' '.join(w if re.search(r'[A-Z0-9]', w) else w.lower() for w in s.split())
    return out[:1].upper() + out[1:]

# ---------- збирання товарів ----------
rows = xlsx_rows(SRC); head = next(rows); I = {k.strip(): i for i, k in enumerate(head)}
num = lambda v: float(re.sub(r'[^\d.\-]', '', str(v).replace(',', '.')) or 0)
items = collections.OrderedDict()
for r in rows:
    if not r or len(r) <= I['Price With VAT']: continue
    code = r[I['Catalog Code']]
    if not code or num(r[I['Qty']]) <= 0 or r[I['Quality']] == 'Naudota prekė': continue
    name = r[I['Part Name UA']] or r[I['Part Name RU']]
    if not name or SKIP.search(name): continue
    it = items.get(code)
    if not it:
        price = round(num(r[I['Price With VAT']]) * (1 + MARKUP / 100))
        if price <= 0: continue
        it = items[code] = {'code': code, 'name': name, 'd': r[I['Description UA']], 'p': price, 'img': r[I['Image File']],
                            'oe': [x.strip() for x in re.split(r'[,;]', r[I['OEM code']]) if x.strip()],
                            'maker': r[I['Supplier']], 'models': []}
    if r[I['Model EN']] and r[I['Model EN']] not in it['models']: it['models'].append(r[I['Model EN']])

brand_models = collections.defaultdict(dict)    # марка → {назва моделі на сайті: рік (для сортування нових)}
old_models = dict(OLD)
by_brand = collections.defaultdict(list)
counts = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
img_dir = os.path.join(root, 'img')
safe_id = lambda c: re.sub(r'[^A-Za-z0-9._-]', '-', c)
seen_ids = set()
for it in items.values():
    cars = []
    for m in it['models']:
        brand, rest, y1, y2 = parse_model(m)
        om = site_model(brand, rest, y1) if brand in old_models else None
        title = om or (rest if brand == UNIVERSAL else model_title(rest, y1, y2))
        if not om: brand_models[brand].setdefault(title, (base(rest), y1 or 0))
        if [brand, title] not in cars: cars.append([brand, title])
    if not cars: continue
    pid = safe_id(it['code'])
    if pid in seen_ids: continue
    seen_ids.add(pid)
    g, sg = category(it['name'])
    part = sentence(it['name'])
    # у назві — авто, лише якщо товар для однієї моделі чи однієї марки
    brands = {c[0] for c in cars} - {UNIVERSAL}
    car0 = cars[0][0] + ' ' + cars[0][1] if len(cars) == 1 and brands else (cars[0][0] if len(brands) == 1 else '')
    img = it['img'] and os.path.exists(os.path.join(img_dir, it['img'])) and 'img/' + it['img'] or ''
    p = {'id': pid, 'n': (part + ' ' + car0).strip(), 'd': it['d'], 'p': it['p'], 's': True, 'img': img,
         'a': [['Виробник', it['maker']]] if it['maker'] else [], 'oe': it['oe'], 'o': 0, 'cars': cars, 'g': g, 'sg': sg, 'c': it['code']}
    for b in {c[0] for c in cars}:
        by_brand[b].append(p)
        for c in cars:
            if c[0] == b: counts[b][c[1]][g] += 1

# марки: спершу наявні на сайті (з їхніми моделями), далі нові за алфавітом, «Універсальні» — в кінці
BRANDS = []
for b, ms in OLD:
    extra = sorted(brand_models.get(b, {}), key=lambda t: brand_models[b][t])
    BRANDS.append([b, ms + [m for m in extra if m not in ms]])
for b in sorted(k for k in brand_models if k not in old_models and k != UNIVERSAL):
    BRANDS.append([b, sorted(brand_models[b], key=lambda t: brand_models[b][t])])
if UNIVERSAL in brand_models: BRANDS.append([UNIVERSAL, [t for k, t in UNIVERSAL_MODELS if t in brand_models[UNIVERSAL]]])

CATS = json.loads(re.search(r'window\.CATS=(\[.*?\]);\n', core, re.S).group(1))
have = {c['id'] for c in CATS}
CATS += [{'id': i, 't': t} for i, t in NEW_CATS if i not in have]

slug = lambda b: re.sub(r'[^a-z0-9]+', '-', b.lower()).strip('-') or 'universal'
data_dir = os.path.join(root, 'data'); os.makedirs(data_dir, exist_ok=True)
for f in os.listdir(data_dir):
    if f.endswith('.js'): os.remove(os.path.join(data_dir, f))
dump = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
for b, _ in BRANDS:
    with open(os.path.join(data_dir, slug(b) + '.js'), 'w', encoding='utf-8') as f:
        f.write('(window.PRODUCTS_BY=window.PRODUCTS_BY||{})[' + dump(b) + ']=' + dump(by_brand.get(b, [])) + ';')

import time
with open(core_path, 'w', encoding='utf-8') as f:
    f.write(f"window.DATA_V={int(time.time())};\nwindow.RATES={RATES};\nwindow.BRANDS={dump(BRANDS)};\nwindow.CATS={dump(CATS)};\n"
            f"window.COUNTS={dump(counts)};\nwindow.FEATURED=[];\n")

total = sum(len(v) for v in by_brand.values())
print(f"Товарів: {len(seen_ids)} (записів по марках: {total}), марок: {len(BRANDS)}, моделей: {sum(len(m) for _, m in BRANDS)}")
print(f"З фото: {sum(1 for v in by_brand.values() for p in v if p['img'])}")
cat_n = collections.Counter(p['g'] for v in by_brand.values() for p in v)
print('Категорії:', ', '.join(f"{c['t']}: {cat_n.get(c['id'], 0)}" for c in CATS))

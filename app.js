(function () {
  // Марки, моделі та категорії — з products.js (структура як на kik-tuning.com.ua)
  var MODELS = {};
  var BRANDS = (window.BRANDS || []).map(function (b) { MODELS[b[0]] = b[1]; return b[0]; });
  var CATS = window.CATS || [];
  var CAT = {};
  CATS.forEach(function (c) { CAT[c.id] = c; });

  var CUR = {
    UAH: { sign: 'грн', after: true, dec: 0 },
    USD: { sign: '$', dec: 2 },
    EUR: { sign: '€', dec: 2 }
  };
  var rates = window.RATES || { USD: 45, EUR: 50.5, date: '' };
  var PAGE = 24;

  var $ = function (id) { return document.getElementById(id); };
  var isCatalog = !!$('grid');   // catalog.html; інакше — головна сторінка
  var norm = function (s) { return String(s || '').toUpperCase().replace(/[^0-9A-ZА-ЯІЇЄҐ]/g, ''); };

  // Товари зберігаються окремими файлами по марках (data/<марка>.js) і підвантажуються за потреби
  var COUNTS = window.COUNTS || {};   // {марка: {модель: {категорія: кількість}}}
  var all = [], byId = {}, loaded = {};
  function register(list) {
    list.forEach(function (p) {
      if (byId[p.id] || !CAT[p.g]) return;
      byId[p.id] = p;
      p.brands = [];
      p.cars.forEach(function (c) { if (p.brands.indexOf(c[0]) === -1) p.brands.push(c[0]); });
      p.noe = p.oe.map(norm);            // оригінальні номери
      if (p.c) p.noe.push(norm(p.c));    // артикул виробника (номер аналога)
      all.push(p);
    });
  }
  register(window.FEATURED || []);
  function loadBrand(b) {
    if (!loaded[b]) {
      loaded[b] = new Promise(function (done) {
        var s = document.createElement('script');
        s.src = 'data/' + b.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.js?v=' + (window.DATA_V || 1);
        s.onload = function () { register((window.PRODUCTS_BY || {})[b] || []); done(); };
        s.onerror = done;
        document.head.appendChild(s);
      });
    }
    return loaded[b];
  }
  function loadAll() { return Promise.all(BRANDS.map(loadBrand)); }
  function countFor(brand, model, cat) {
    var m = (COUNTS[brand] || {})[model] || {}, n = 0;
    Object.keys(m).forEach(function (k) { if (!cat || k === cat) n += m[k]; });
    return n;
  }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('winauto-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('winauto-' + k, JSON.stringify(v)); } catch (e) {} }
  };

  var state = { brand: '', model: '', cat: '', sub: '', q: '', num: '', vin: '', sort: 'def', stock: false, shown: PAGE };
  var URL_KEYS = ['brand', 'model', 'cat', 'sub', 'q', 'num', 'vin'];
  var cur = store.get('cur', 'UAH');
  if (!CUR[cur]) cur = 'UAH';
  var cart = store.get('cart', {});
  Object.keys(cart).forEach(function (k) { if (!cart[k] || typeof cart[k] !== 'object') delete cart[k]; });

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var opts = function (list, first) {
    return '<option value="">' + first + '</option>' + list.map(function (v) {
      return '<option value="' + esc(v[0]) + '">' + esc(v[1]) + '</option>';
    }).join('');
  };
  // посилання на каталог із заданими фільтрами
  function catalogUrl(params) {
    var q = Object.keys(params).filter(function (k) { return params[k]; })
      .map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return 'catalog.html' + (q ? '?' + q : '');
  }
  // застосувати фільтри: на сторінці каталогу — одразу, на головній — перейти в каталог
  function go(params) {
    if (!isCatalog) { location.href = catalogUrl(params); return; }
    URL_KEYS.forEach(function (k) { state[k] = params[k] || ''; });
    $('q').value = state.q;
    update();
    window.scrollTo(0, 0);
  }

  /* ---------- Ціни та валюти ---------- */
  function fmt(uah, code) {
    var c = CUR[code];
    var v = code === 'UAH' ? uah : uah / rates[code];
    var s = v.toFixed(c.dec).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return c.after ? s + ' <small>' + c.sign + '</small>' : '<small>' + c.sign + '</small>' + s;
  }
  var money = function (uah) { return fmt(uah, cur); };
  // оптова знижка схваленого клієнта (wholesale.js)
  var WS = window.WAWholesale;
  var sale = function (v) { return WS ? WS.apply(v) : v; };
  var priceHtml = function (v) { var s = sale(v); return s !== v ? '<s class="old">' + money(v) + '</s> ' + money(s) : money(v); };
  function altPrices(uah) {
    return Object.keys(CUR).filter(function (c) { return c !== cur; }).map(function (c) {
      return fmt(uah, c).replace(/<\/?small>/g, '');
    }).join(' · ');
  }
  function renderRate() {
    $('rate').textContent = 'Курс НБУ' + (rates.date ? ' на ' + rates.date : '') + ': 1 $ = ' + rates.USD.toFixed(2) +
      ' грн, 1 € = ' + rates.EUR.toFixed(2) + ' грн';
    [].forEach.call($('cur').children, function (b) { b.classList.toggle('on', b.dataset.cur === cur); });
  }
  function renderPrices() {
    if (isCatalog) renderGrid(); else renderHome();
    renderCart();
  }
  // свіжий курс НБУ; якщо недоступний — лишається курс, збережений у products.js
  function loadRates() {
    if (!window.fetch) return;
    fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json')
      .then(function (r) { return r.json(); })
      .then(function (list) {
        var next = { date: '' };
        list.forEach(function (x) { if (x.cc === 'USD' || x.cc === 'EUR') { next[x.cc] = x.rate; next.date = x.exchangedate; } });
        if (next.USD > 0 && next.EUR > 0) { rates = next; renderRate(); renderPrices(); }
      })
      .catch(function () {});
  }

  /* ---------- Дані каталогу ---------- */
  function fitsCar(p, brand, model) {
    if (!brand) return true;
    return p.cars.some(function (c) { return c[0] === brand && (!model || c[1] === model); });
  }
  function matchNum(p) {
    return !state.num || p.noe.some(function (n) { return n.indexOf(state.num) !== -1; });
  }
  // skip — фільтр, який не враховується (для лічильників)
  function filtered(skip) {
    var q = state.q.trim().toLowerCase();
    return all.filter(function (p) {
      if (skip !== 'car' && !fitsCar(p, state.brand, state.model)) return false;
      if (skip !== 'cat' && state.cat && state.cat !== 'all' && (p.g !== state.cat || (state.sub && p.sg !== state.sub))) return false;
      if (state.stock && !p.s) return false;
      if (!matchNum(p)) return false;
      if (q && (p.n + ' ' + p.d + ' ' + p.oe.join(' ') + ' ' + p.cars.join(' ')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }
  function models(brand) { return MODELS[brand] || []; }
  function carLabel(p) {
    var list = p.cars.filter(function (c) { return !state.brand || c[0] === state.brand; });
    if (state.model) list = list.filter(function (c) { return c[1] === state.model; });
    if (!list.length) list = p.cars;
    return list[0][0] + ' ' + list[0][1] + (p.cars.length > 1 ? ' +' + (p.cars.length - 1) : '');
  }

  function pic(p, badges) {
    return '<div class="pic" data-open="' + p.id + '">' +
      (p.img ? '<img loading="lazy" src="' + esc(p.img) + '" alt="' + esc(p.n) + '">' : '<span class="pic__none">Фото очікується</span>') +
      (badges ? '<span class="badge">' + esc(state.brand || p.brands[0]) + '</span>' +
        (p.o ? '<span class="badge badge--r">Оригінал</span>' : '') : '') +
      '</div>';
  }
  function numLine(p) {
    if (!p.oe.length) return p.c ? 'Арт.: ' + esc(p.c) : '';
    var oe = p.oe.slice(0, 2).map(esc).join(', ') + (p.oe.length > 2 ? '…' : '');
    return (p.c ? 'Арт.: ' + esc(p.c) + '<br>' : '') + 'OE: ' + (state.num ? '<mark>' + oe + '</mark>' : oe);
  }
  function card(p) {
    return '<article class="card">' + pic(p, true) +
      '<div class="card__b">' +
      '<span class="card__maker">' + esc(carLabel(p)) + '</span>' +
      '<span class="card__name" data-open="' + p.id + '">' + esc(p.n) + '</span>' +
      (p.d ? '<span class="card__meta">' + esc(p.d) + '</span>' : '') +
      '<span class="card__meta">' + numLine(p) + '</span>' +
      '<span class="stock' + (p.s ? '' : ' stock--no') + '">' + (p.s ? '● В наявності' : '● Під замовлення') + '</span>' +
      '<div class="card__f"><span class="price">' + priceHtml(p.p) + '</span>' +
      '<button type="button" class="btn btn--sm" data-add="' + p.id + '">У кошик</button></div>' +
      '</div></article>';
  }

  /* ---------- Сторінка каталогу ---------- */
  // Ієрархія каталогу: марка → модель → категорія → товари
  var CARIMG = window.CARIMG || {}, CATIMG = window.CATIMG || {};
  function step() {
    if (state.q.trim() || state.num) return 'grid';
    if (!state.brand) return 'brand';
    if (!state.model) return 'model';
    if (!state.cat) return 'cat';
    return 'grid';
  }
  // модель, чиє фото представляє марку (якщо не задано — перша модель із фото)
  var BRAND_COVER = { 'Volkswagen': 'Tiguan (2016-2020)' };
  function brandImg(b) {
    var m = CARIMG[b] || {};
    return m[BRAND_COVER[b]] || m[models(b).filter(function (x) { return m[x]; })[0]] || '';
  }
  function tile(attr, value, title, sub, img, cls) {
    return '<button type="button" class="ctile ' + (cls || '') + '" ' + attr + '="' + esc(value) + '">' +
      '<span class="ctile__img">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="' + esc(title) + '">' : '') + '</span>' +
      '<b>' + esc(title) + '</b><small>' + sub + '</small></button>';
  }
  function words(n, one, few, many) {
    var d = n % 10, h = n % 100;
    return n + ' ' + (d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many);
  }
  var plural = function (n) { return words(n, 'товар', 'товари', 'товарів'); };
  function renderSteps(s) {
    var titles = { brand: 'Крок 1. Оберіть марку авто', model: 'Крок 2. Оберіть модель ' + state.brand, cat: 'Крок 3. Оберіть категорію запчастин' };
    var html = '';
    if (s === 'brand') {
      html = BRANDS.map(function (b) {
        return tile('data-brand', b, b, words(models(b).length, 'модель', 'моделі', 'моделей'), brandImg(b), 'ctile--car');
      }).join('');
    } else if (s === 'model') {
      html = models(state.brand).map(function (m) {
        var n = countFor(state.brand, m);
        return tile('data-model', m, state.brand + ' ' + m, plural(n), (CARIMG[state.brand] || {})[m], 'ctile--car' + (n ? '' : ' ctile--empty'));
      }).join('');
    } else {
      var base = { length: countFor(state.brand, state.model) };
      html = tile('data-cat', 'all', 'Всі товари', plural(base.length), (CARIMG[state.brand] || {})[state.model], '') +
        CATS.map(function (c) {
          var n = countFor(state.brand, state.model, c.id);
          return n ? tile('data-cat', c.id, c.t, plural(n), CATIMG[c.t], '') : '';
        }).join('');
      if (!base.length) html = '<p class="empty">Для цієї моделі товарів поки немає.</p>';
    }
    $('steps').innerHTML = '<h2 class="steps__title">' + esc(titles[s]) + '</h2><div class="ctiles">' + html + '</div>';
  }
  function renderCrumbs() {
    var parts = [['root', 'Каталог']];
    if (state.brand) parts.push(['brand', state.brand]);
    if (state.model) parts.push(['model', state.model]);
    if (state.brand && state.model && state.cat) parts.push(['cat', state.cat === 'all' ? 'Всі товари' : CAT[state.cat].t]);
    if (state.sub) parts.push(['sub', state.sub]);
    $('crumbs').innerHTML = parts.map(function (p, i) {
      return i === parts.length - 1 ? '<span>' + esc(p[1]) + '</span>' : '<button type="button" data-crumb="' + p[0] + '">' + esc(p[1]) + '</button>';
    }).join('<i>›</i>');
  }
  function renderTree() {
    var base = filtered('cat');
    var cnt = function (g, sg) { return base.filter(function (p) { return (g === 'all' || p.g === g) && (!sg || p.sg === sg); }).length; };
    var row = function (g, sg, title, cls) {
      var n = cnt(g, sg), on = state.cat === g && state.sub === sg;
      return '<button type="button" class="' + cls + (on ? ' on' : '') + '" data-cat="' + g + '" data-sub="' + esc(sg) + '"' +
        (n || on ? '' : ' disabled') + '><span>' + esc(title) + '</span><small>' + n + '</small></button>';
    };
    $('tree').innerHTML = row('all', '', 'Всі товари', '') + CATS.map(function (c) {
      return row(c.id, '', c.t, '') + (c.sub ? c.sub.map(function (s) { return row(c.id, s, s, 'sub'); }).join('') : '');
    }).join('');
  }
  function renderActive() {
    var pills = [];
    if (state.num) pills.push(['num', 'Номер запчастини: <b>' + esc(state.num) + '</b>']);
    if (state.vin && state.brand) pills.push(['vin', 'VIN: <b>' + esc(state.vin) + '</b>']);
    if (state.cat && state.cat !== 'all' && !state.model) pills.push(['cat', 'Категорія: <b>' + esc(state.sub || CAT[state.cat].t) + '</b>']);
    if (state.q) pills.push(['q', 'Пошук: <b>' + esc(state.q) + '</b>']);
    $('active').innerHTML = pills.map(function (p) {
      return '<span class="pill">' + p[1] + '<button type="button" data-clear="' + p[0] + '" aria-label="Скинути">×</button></span>';
    }).join('');
  }
  function renderGrid() {
    var list = filtered();
    if (state.sort === 'asc') list.sort(function (a, b) { return a.p - b.p; });
    if (state.sort === 'desc') list.sort(function (a, b) { return b.p - a.p; });
    if (state.sort === 'name') list.sort(function (a, b) { return a.n.localeCompare(b.n, 'uk'); });
    $('count').textContent = 'Знайдено товарів: ' + list.length;
    $('grid').innerHTML = list.slice(0, state.shown).map(card).join('') ||
      '<p class="empty">Нічого не знайдено. Спробуйте змінити фільтри або запит.</p>';
    $('more').hidden = list.length <= state.shown;
  }
  var loadSeq = 0;
  function update() {
    if (!isCatalog) return;
    state.shown = PAGE;
    var s = step();
    $('steps').hidden = s === 'grid';
    $('gridView').hidden = s !== 'grid';
    renderCrumbs(); renderActive();
    if (s === 'grid') {
      var token = ++loadSeq;
      $('count').textContent = '';
      $('grid').innerHTML = '<p class="empty">Завантаження товарів…</p>';
      $('more').hidden = true;
      (state.brand ? loadBrand(state.brand) : loadAll()).then(function () {
        if (token === loadSeq) { renderTree(); renderGrid(); }
      });
    } else renderSteps(s);
    var params = {};
    URL_KEYS.forEach(function (k) { params[k] = state[k]; });
    try { history.replaceState(null, '', catalogUrl(params)); } catch (e) {}
  }

  /* ---------- Головна сторінка ---------- */
  function renderHome() {
    // на головній — лише найпопулярніші марки; решта на сторінці каталогу
    var POPULAR = ['Tesla', 'Audi', 'BMW', 'Volkswagen', 'Volvo'];
    $('homeBrands').innerHTML = POPULAR.filter(function (b) { return BRANDS.indexOf(b) !== -1; }).map(function (b) {
      return '<a class="ctile ctile--car" href="' + catalogUrl({ brand: b }) + '"><span class="ctile__img">' +
        (brandImg(b) ? '<img loading="lazy" src="' + esc(brandImg(b)) + '" alt="' + esc(b) + '">' : '') + '</span><b>' + esc(b) +
        '</b><small>' + words(models(b).length, 'модель', 'моделі', 'моделей') + '</small></a>';
    }).join('');
    var picked = (window.FEATURED || []).slice(0, 8);
    $('homeGrid').innerHTML = picked.map(card).join('');
  }

  /* ---------- Картка товару ---------- */
  function analogs(p) {
    return all.filter(function (x) {
      return x !== p && x.noe.some(function (n) { return p.noe.indexOf(n) !== -1; });
    });
  }
  function openProduct(id) {
    var p = byId[id];
    if (!p) return;
    var rows = [['Категорія', CAT[p.g].t + (p.sg ? ' → ' + p.sg : '')], ['Тип', p.o ? 'Оригінал' : 'Аналог']].concat(p.a);
    var an = analogs(p);
    $('modalBody').innerHTML = '<div class="pv">' + pic(p, false) + '<div>' +
      '<span class="card__maker">' + esc(p.o ? 'Оригінал' : 'Аналог') + '</span>' +
      '<h2>' + esc(p.n) + '</h2>' +
      (p.d ? '<div class="card__meta">' + esc(p.d) + '</div>' : '') +
      (p.oe.length ? '<h5>Оригінальні номери (OE)</h5><div class="nums">' + p.oe.map(function (n) {
        return '<button type="button" class="num" data-oe="' + esc(n) + '" title="Знайти всі деталі з цим номером">' + esc(n) + '</button>';
      }).join('') + '</div>' : '') +
      '<h5>Підходить для</h5><ul class="fits">' + p.cars.map(function (c) { return '<li>' + esc(c[0] + ' ' + c[1]) + '</li>'; }).join('') + '</ul>' +
      (an.length ? '<h5>Інші деталі з цим номером</h5>' + an.map(function (x) {
        return '<button type="button" class="analog" data-open="' + x.id + '"><span>' + esc(x.n + ' · ' + (x.o ? 'оригінал' : 'аналог')) + '</span><b>' + money(sale(x.p)) + '</b></button>';
      }).join('') : '') +
      '<table>' + rows.map(function (r) { return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>' +
      '<span class="stock' + (p.s ? '' : ' stock--no') + '">' + (p.s ? '● В наявності' : '● Під замовлення') + '</span>' +
      '<div class="pv__buy"><span class="price">' + priceHtml(p.p) + '<span class="price__alt">' + (sale(p.p) !== p.p ? 'Оптова ціна, знижка ' + WS.discount() + '% · ' : '≈ ') + altPrices(sale(p.p)) + '</span></span>' +
      '<button type="button" class="btn" data-add="' + p.id + '">Додати в кошик</button></div>' +
      '</div></div>';
    $('modal').hidden = false;
  }

  /* ---------- Кошик ---------- */
  // У кошику зберігається знімок товару (назва, ціна, фото), щоб він не залежав від завантажених марок
  function renderCart() {
    var keys = Object.keys(cart).filter(function (k) { return cart[k] && cart[k].q > 0; });
    var qty = 0, sum = 0;
    keys.forEach(function (k) { qty += cart[k].q; sum += cart[k].q * cart[k].p; });
    $('cartCount').textContent = qty;
    if (!keys.length) {
      $('cartBody').innerHTML = '<p class="empty">Кошик порожній</p>';
      $('cartFoot').innerHTML = '';
      return;
    }
    $('cartBody').innerHTML = keys.map(function (k) {
      var it = cart[k];
      return '<div class="ci"><div class="pic">' + (it.img ? '<img src="' + esc(it.img) + '" alt="">' : '') + '</div>' +
        '<div><div class="ci__n">' + esc(it.n) + '</div><div class="ci__c">' + esc(it.car) + '</div>' +
        '<div class="qty"><button type="button" data-dec="' + k + '">−</button><span>' + it.q + '</span><button type="button" data-inc="' + k + '">+</button></div></div>' +
        '<div class="ci__r">' + money(it.p * it.q) + '<button type="button" class="rm" data-rm="' + k + '">Видалити</button></div></div>';
    }).join('');
    $('cartFoot').innerHTML = '<div class="total"><span>Разом</span><span>' + money(sum) + '</span></div>' +
      (cur !== 'UAH' ? '<p class="note" style="margin:-6px 0 12px">Оплата в гривні: ' + fmt(sum, 'UAH').replace(/<\/?small>/g, '') + '</p>' : '') +
      '<a class="btn btn--wide" href="checkout.html">Оформити замовлення</a>' +
      '<p class="note">Доставку та оплату оберете на наступному кроці.</p>';
  }
  function add(k, d) {
    var it = cart[k];
    if (!it) {
      var p = byId[k];
      if (!p || d <= 0) return;
      it = cart[k] = { q: 0, n: p.n, p: sale(p.p), pb: p.p, img: p.img, car: p.cars[0].join(' '), oe: p.oe.join(' / ') };
    }
    if (d > 0 && window.WATrack) window.WATrack('add_to_cart', it.p, [{ item_id: k, item_name: it.n, quantity: 1, price: it.p }]);
    it.q += d;
    if (!(it.q > 0)) delete cart[k];
    store.set('cart', cart);
    renderCart();
  }

  var toastT;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.hidden = true; }, 1800);
  }

  /* ---------- Підбір за VIN-кодом ---------- */
  // WMI (перші 3 символи VIN) → марка
  var WMI = {
    'Tesla': ['5YJ', '7SA', '7G2', 'LRW', 'XP7'],
    'BMW': ['WBA', 'WBS', 'WBY', 'WBX', '5UX', '5UJ', '5YM', '4US', '3MW', 'LBV'],
    'Audi': ['WAU', 'WA1', 'WUA', 'TRU'],
    'Hyundai': ['KMH', 'KM8', 'KMF', '5NP', '5NM', '5NT', 'TMA', 'NLH'],
    'Kia': ['KNA', 'KND', 'KNE', 'KNC', 'U5Y', '5XY', '5XX', '3KP'],
    'Mercedes-Benz': ['WDB', 'WDD', 'WDC', 'WDF', 'W1K', 'W1N', 'W1V', 'W1H', '4JG', '55S'],
    'Porsche': ['WP0', 'WP1'],
    'Volkswagen': ['WVW', 'WVG', 'WV1', 'WV2', '1VW', '3VW', '1V2'],
    'Skoda': ['TMB'],
    'Volvo': ['YV1', 'YV4', 'LYV', '7JR'],
    'Toyota': ['JTD', 'JTE', 'JTM', 'JTN', 'JTK', '4T1', '4T3', '5TD', '2T1', '2T3', 'SB1', 'NMT'],
    'Lexus': ['JTH', 'JTJ', '2T2', '58A'],
    'Mazda': ['JM1', 'JM3', 'JMZ', '3MZ'],
    'Nissan': ['JN8', '5N1', 'SJN', '1N4', '3N1'],
    'Ford': ['1FA', '1FM', '1FT', '3FA', 'WF0', 'NM0'],
    'Honda': ['1HG', 'JHM', '2HG', '5J6'],
    'Jeep': ['1C4', '1J4', '3C4', 'ZAC'],
    'Land Rover': ['SAL'],
    'Jaguar': ['SAJ', 'SAD'],
    'MINI': ['WMW'],
    'Peugeot': ['VF3', 'VR3'],
    'Infiniti': ['JNK', '5N3', '3PC']
  };
  // кузовні коди Audi у VIN (позиції 7–8) → позначення покоління в каталозі
  var AUDI = { '8K': ['B8'], '8W': ['B9'], '8T': ['B8'], '8F': ['B8'], 'F5': ['B9'], '4A': ['C8'], '4K': ['4K8'], '4H': ['D4'], '4N': ['D5'], '4G': ['C7', '4G'] };
  var YEAR = 'ABCDEFGHJKLMNPRSTVWXY';

  function vinYear(ch) {
    var i = YEAR.indexOf(ch);
    if (i === -1) return /[1-9]/.test(ch) ? 2000 + +ch : 0;
    var y = 2010 + i;
    return y > new Date().getFullYear() + 1 ? y - 30 : y;
  }
  var modelBase = function (m) { return norm(m.split(/[,(]/)[0]); };
  var findBrand = function (name) { return BRANDS.filter(function (b) { return norm(b) === norm(name); })[0] || ''; };

  // те, що можна визначити із самого VIN без зовнішніх сервісів
  function decodeLocal(vin) {
    var res = { brand: '', year: 0, models: [], name: '' };
    Object.keys(WMI).forEach(function (b) { if (WMI[b].indexOf(vin.slice(0, 3)) !== -1) res.brand = findBrand(b); });
    if (!res.brand) return res;
    var list = models(res.brand), tokens = [];
    // у європейських BMW та Mercedes 10-й символ не кодує рік
    if (res.brand !== 'BMW' && res.brand !== 'Mercedes-Benz') res.year = vinYear(vin[9]);
    if (res.brand === 'Tesla') {
      res.name = 'Model ' + vin[3];
      res.models = list.filter(function (m) { return modelBase(m) === norm(res.name); });
    } else if (res.brand === 'Mercedes-Benz') {
      tokens = [vin.slice(3, 6)];            // 213 → W213
    } else if (res.brand === 'Audi') {
      tokens = [vin.slice(6, 8)].concat(AUDI[vin.slice(6, 8)] || []);
    } else if (res.brand === 'Porsche') {
      tokens = [vin.slice(6, 8) + vin[11]];  // 92 + A → 92A
    }
    if (tokens.length) {
      res.models = list.filter(function (m) {
        var codes = (m.match(/\(([^)]*)\)/) || ['', ''])[1].toUpperCase();
        return tokens.some(function (t) { return /^[0-9A-Z]{2,3}$/.test(t) && codes.indexOf(t) !== -1; });
      });
    }
    return res;
  }
  // уточнення через відкритий декодер NHTSA (найкраще знає авто для ринку США)
  function decodeRemote(vin, res) {
    if (!window.fetch) return Promise.resolve(res);
    return fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + vin + '?format=json')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var r = (j.Results || [])[0] || {};
        var brand = findBrand(r.Make);
        if (!res.brand && brand) res.brand = brand;
        if (!r.Model || brand !== res.brand) return res;
        res.name = r.Model;
        if (+r.ModelYear) res.year = +r.ModelYear;
        if (!res.models.length) {
          var n = norm(r.Model).replace(/CLASS$|SERIES$/, '');
          if (res.brand === 'BMW' && /^\d{3}/.test(n)) n = n[0];      // 530i → 5 серія
          if (res.brand === 'BMW' && /^M\d$/.test(n)) n = n[1];       // M5 → 5 серія
          res.models = models(res.brand).filter(function (m) {
            var b = modelBase(m).replace(/CLASS$/, '');
            return b === n || (b.indexOf(n) === 0 && !/^\d/.test(b.slice(n.length)));
          });
        }
        return res;
      })
      .catch(function () { return res; });
  }
  function renderVin(vin, res) {
    var box = $('vinResult');
    box.hidden = false;
    if (!res.brand) {
      box.innerHTML = '<b>Марку за цим VIN не розпізнано</b><p>або запчастин для неї в каталозі немає. Перевірте код чи скористайтеся вкладкою «За авто».</p>';
      return;
    }
    var list = res.models;
    var title = res.brand + (res.name && res.brand !== 'Mercedes-Benz' ? ' ' + res.name : '') + (res.year ? ', ' + res.year + ' р.' : '');
    var html = '<b>Розпізнано: ' + esc(title) + '</b>';
    if (list.length) {
      html += '<p>' + (list.length > 1 ? 'Оберіть своє покоління:' : 'Знайдено модель у каталозі:') + '</p>' + list.map(function (m) {
        return '<a class="btn btn--wide" href="' + catalogUrl({ brand: res.brand, model: m, vin: vin }) + '">' + esc(res.brand + ' ' + m) + '</a>';
      }).join('');
    } else {
      html += '<p>Модель за VIN точно визначити не вдалося (або для неї ще немає товарів). Оберіть модель зі списку:</p>' +
        '<select id="vinModel">' + opts(models(res.brand).map(function (m) { return [m, res.brand + ' ' + m]; }), 'Оберіть модель') + '</select>';
    }
    html += '<a class="vin__all" href="' + catalogUrl({ brand: res.brand, vin: vin }) + '">Усі запчастини для ' + esc(res.brand) + ' →</a>';
    box.innerHTML = html;
    var sel = $('vinModel');
    if (sel) sel.addEventListener('change', function () {
      if (sel.value) location.href = catalogUrl({ brand: res.brand, model: sel.value, vin: vin });
    });
  }
  function searchVin(raw) {
    var vin = String(raw).toUpperCase().replace(/[^0-9A-Z]/g, ''), box = $('vinResult');
    box.hidden = false;
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      box.innerHTML = '<b>Перевірте VIN-код.</b><p>Він складається з 17 латинських літер і цифр, без літер I, O та Q. Зараз введено символів: ' + vin.length + '.</p>';
      return;
    }
    box.innerHTML = '<p>Розшифровуємо VIN…</p>';
    decodeRemote(vin, decodeLocal(vin)).then(function (res) { renderVin(vin, res); });
  }

  /* ---------- Підбір за авто / пошук за номером ---------- */
  function fillFinder() {
    $('fBrand').innerHTML = opts(BRANDS.map(function (b) { return [b, b]; }), 'Оберіть марку');
    $('fCat').innerHTML = opts(CATS.map(function (c) { return [c.id, c.t]; }), 'Усі категорії');
  }
  function fillFinderModels() {
    var b = $('fBrand').value;
    $('fModel').innerHTML = opts(models(b).map(function (m) { return [m, m]; }), b ? 'Усі моделі' : 'Спершу оберіть марку');
    $('fModel').disabled = !b;
  }
  /* ---------- Події ---------- */
  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('overlay')) { e.target.hidden = true; return; }
    var t = e.target.closest('[data-brand],[data-model],[data-crumb],[data-cat],[data-add],[data-open],[data-inc],[data-dec],[data-rm],[data-close],[data-clear],[data-cur],[data-ftab],[data-oe]');
    if (!t) return;
    var d = t.dataset;
    if ('add' in d) { add(d.add, 1); toast('Додано в кошик'); }
    else if ('brand' in d) { state.brand = d.brand; state.model = state.vin = ''; update(); window.scrollTo(0, 0); }
    else if ('model' in d) { state.model = d.model; update(); window.scrollTo(0, 0); }
    else if ('crumb' in d) {
      if (d.crumb === 'root') state.brand = state.model = state.cat = state.sub = state.q = state.num = state.vin = '';
      if (d.crumb === 'brand') state.model = state.cat = state.sub = '';
      if (d.crumb === 'model') state.cat = state.sub = '';
      if (d.crumb === 'cat') state.sub = '';
      $('q').value = state.q;
      update();
    }
    else if ('cat' in d) {
      state.cat = d.cat; state.sub = d.sub || ''; update();
      if (t.classList.contains('ctile')) window.scrollTo(0, 0);
      if (window.matchMedia('(max-width: 980px)').matches) $('sideBox').open = false;
    }
    else if ('oe' in d) { $('modal').hidden = true; go({ num: norm(d.oe) }); }
    else if ('open' in d) { if (!t.closest('.ci') && !(t.closest('.pv') && t.classList.contains('pic'))) openProduct(d.open); }
    else if ('inc' in d) add(d.inc, 1);
    else if ('dec' in d) add(d.dec, -1);
    else if ('rm' in d) add(d.rm, -Infinity);
    else if ('close' in d) t.closest('.overlay').hidden = true;
    else if ('clear' in d) {
      if (d.clear === 'num') state.num = '';
      if (d.clear === 'vin') state.vin = '';
      if (d.clear === 'cat') state.cat = state.sub = '';
      if (d.clear === 'q') { state.q = ''; $('q').value = ''; }
      update();
    }
    else if ('cur' in d) { cur = d.cur; store.set('cur', cur); renderRate(); renderPrices(); }
    else if ('ftab' in d) {
      [].forEach.call(document.querySelectorAll('[data-ftab]'), function (b) { b.classList.toggle('on', b === t); });
      [].forEach.call(document.querySelectorAll('[data-fpane]'), function (p) { p.hidden = p.dataset.fpane !== d.ftab; });
    }
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = e.target.id;
    if (id === 'carForm') go({ brand: $('fBrand').value, model: $('fModel').value, cat: $('fCat').value });
    else if (id === 'numForm') go({ num: norm($('fNum').value) });
    else if (id === 'vinForm') searchVin($('fVin').value);
    else if (id === 'searchForm' && !isCatalog) go({ q: $('q').value.trim() });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { $('modal').hidden = true; $('cart').hidden = true; }
  });

  $('cartBtn').addEventListener('click', function () { renderCart(); $('cart').hidden = false; });
  $('themeBtn').addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('winauto-theme', next); } catch (e) {}
  });

  $('year').textContent = new Date().getFullYear();
  renderRate();

  if (isCatalog) {
    var params = new URLSearchParams(location.search);
    URL_KEYS.forEach(function (k) { if (params.get(k)) state[k] = params.get(k); });
    if (BRANDS.indexOf(state.brand) === -1) state.brand = state.model = '';
    if (models(state.brand).indexOf(state.model) === -1) state.model = '';
    if (!CAT[state.cat] && state.cat !== 'all') state.cat = state.sub = '';
    state.num = norm(state.num);
    $('q').value = state.q;
    $('q').addEventListener('input', function (e) { state.q = e.target.value; update(); });
    $('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderGrid(); });
    $('inStock').addEventListener('change', function (e) { state.stock = e.target.checked; update(); });
    $('more').addEventListener('click', function () { state.shown += PAGE; renderGrid(); });
    if (window.matchMedia('(max-width: 980px)').matches) $('sideBox').open = false;
    update();
  } else {
    $('fBrand').addEventListener('change', fillFinderModels);
    fillFinder();
    renderHome();
    // швидкий підбір для авто з кабінету
    var garage = store.get('garage', []);
    $('garage').innerHTML = garage.length ? 'Мої авто: ' + garage.map(function (c) {
      return '<a href="' + catalogUrl({ brand: c.brand, model: c.model }) + '">' + esc(c.brand + ' ' + c.model) + '</a>';
    }).join('') : '<a href="cabinet.html">+ Додати своє авто в кабінет</a>';
  }
  renderCart();
  loadRates();
  // після перевірки статусу оптового клієнта перемальовуємо ціни, якщо знижка змінилась
  if (WS) {
    var before = WS.discount();
    WS.refresh().then(function () {
      var now = WS.discount();
      if (now !== before) {
        // кошик: перераховуємо ціни за поточною знижкою
        Object.keys(cart).forEach(function (k) { var it = cart[k]; if (it.pb) it.p = WS.apply(it.pb); });
        store.set('cart', cart);
        renderPrices();
      }
    }).catch(function () {});
  }
})();

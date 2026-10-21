(function () {
  // Реквізити для оплати на рахунок (запасні значення; робочі — у site.js)
  var BANK = {
    name: 'ФОП / ТОВ «Win Auto»',
    code: '00000000',
    iban: 'UA00 0000 0000 0000 0000 0000 00000',
    bank: 'Назва банку'
  };
  if (window.SITE && window.SITE.bank) BANK = window.SITE.bank; // реквізити з адмін-панелі
  var NP_API = 'https://api.novaposhta.ua/v2.0/json/';
  var NP_KEY = ''; // публічні довідники працюють і без ключа; для продакшену додайте свій
  var DEL_API = 'https://www.delivery-auto.com/api/v4/Public/';

  var CUR = { UAH: { sign: 'грн', after: true, dec: 0 }, USD: { sign: '$', dec: 2 }, EUR: { sign: '€', dec: 2 } };
  var rates = window.RATES || { USD: 45, EUR: 50.5 };

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('winauto-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('winauto-' + k, JSON.stringify(v)); } catch (e) {} }
  };

  var cart = store.get('cart', {});
  var cur = store.get('cur', 'UAH');
  if (!CUR[cur]) cur = 'UAH';

  function fmt(uah, code, plain) {
    var c = CUR[code];
    var s = (code === 'UAH' ? uah : uah / rates[code]).toFixed(c.dec).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    if (plain) return c.after ? s + ' ' + c.sign : c.sign + s;
    return c.after ? s + ' <small>' + c.sign + '</small>' : '<small>' + c.sign + '</small>' + s;
  }

  /* ---------- Замовлення ---------- */
  function lines() {
    return Object.keys(cart).filter(function (k) { return cart[k] && cart[k].q > 0; }).map(function (k) {
      var it = cart[k];
      var WS = window.WAWholesale, price = WS && it.pb ? WS.apply(it.pb) : it.p;   // актуальна оптова знижка
      return { p: { id: k, n: it.n, p: price, pb: it.pb || it.p, img: it.img, car: it.car, oe: it.oe }, q: it.q };
    });
  }
  function total() { return lines().reduce(function (s, l) { return s + l.p.p * l.q; }, 0); }

  function renderSummary() {
    var list = lines();
    [].forEach.call($('cur').children, function (b) { b.classList.toggle('on', b.dataset.cur === cur); });
    if (!list.length) {
      $('coGrid').hidden = true;
      $('done').hidden = false;
      $('done').innerHTML = '<h2>Кошик порожній</h2><p>Додайте товари в кошик, щоб оформити замовлення.</p>' +
        '<a class="btn" href="catalog.html">Перейти до каталогу</a>';
      return;
    }
    $('items').innerHTML = list.map(function (l) {
      var p = l.p;
      return '<div class="ci"><div class="pic">' + (p.img ? '<img src="' + esc(p.img) + '" alt="">' : '') + '</div>' +
        '<div><div class="ci__n">' + esc(p.n) + '</div><div class="ci__c">' + esc(p.car) + ' · ' + l.q + ' шт.</div></div>' +
        '<div class="ci__r">' + fmt(p.p * l.q, cur) + '</div></div>';
    }).join('');
    $('sumGoods').innerHTML = fmt(total(), cur);
    $('sumTotal').innerHTML = fmt(total(), cur);
    var disc = window.WAWholesale ? window.WAWholesale.discount() : 0;
    $('sumNote').textContent = (disc ? 'Ціни з вашою оптовою знижкою ' + disc + '%. ' : '') +
      (cur === 'UAH' ? '' : 'Оплата в гривні: ' + fmt(total(), 'UAH', true) + ' (за курсом НБУ).');
  }

  /* ---------- Довідники перевізників ---------- */
  function np(model, method, props) {
    return fetch(NP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: NP_KEY, modelName: model, calledMethod: method, methodProperties: props })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.success) throw new Error((j.errors || []).join('; ') || 'Nova Poshta API');
      return j.data;
    });
  }
  var delCities; // кеш міст Делівері
  function del(path) {
    return fetch(DEL_API + path).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.status) throw new Error(j.message || 'Delivery API');
      return j.data;
    });
  }

  var carriers = {
    np: {
      title: 'Нова Пошта',
      cities: function (q) {
        return np('AddressGeneral', 'searchSettlements', { CityName: q, Limit: '20', Page: '1' }).then(function (d) {
          return ((d[0] || {}).Addresses || []).filter(function (a) { return a.Warehouses > 0; }).map(function (a) {
            return { id: a.DeliveryCity, label: a.Present };
          });
        });
      },
      warehouses: function (city, q) {
        return np('AddressGeneral', 'getWarehouses', { CityRef: city.id, FindByString: q, Limit: '50', Page: '1' }).then(function (d) {
          return d.map(function (w) { return { id: w.Ref, label: w.Description }; });
        });
      }
    },
    del: {
      title: 'Делівері',
      cities: function (q) {
        delCities = delCities || del('GetAreasList?culture=uk-UA&fl_all=false&country=1');
        return delCities.then(function (list) {
          q = q.toLowerCase();
          return list.filter(function (c) { return c.IsWarehouse && c.name.toLowerCase().indexOf(q) === 0; })
            .slice(0, 20)
            .map(function (c) { return { id: c.id, label: c.name + (c.regionName ? ', ' + c.regionName : '') }; });
        });
      },
      warehouses: function (city, q) {
        city.wh = city.wh || del('GetWarehousesList?culture=uk-UA&country=1&CityId=' + encodeURIComponent(city.id));
        return city.wh.then(function (list) {
          q = q.toLowerCase();
          return list.map(function (w) { return { id: w.id, label: w.name + ' — ' + w.address }; })
            .filter(function (w) { return w.label.toLowerCase().indexOf(q) !== -1; });
        });
      }
    }
  };

  /* ---------- Поле з випадним списком ---------- */
  function combo(box, opts) {
    var input = box.querySelector('input'), list = box.querySelector('ul');
    var items = [], timer, seq = 0;
    var api = { value: null };

    function show(html) { list.innerHTML = html; list.hidden = false; }
    function load() {
      var q = input.value.trim(), my = ++seq;
      if (q.length < opts.min) { show('<li class="combo__msg">' + opts.hint + '</li>'); return; }
      show('<li class="combo__msg">Завантаження…</li>');
      opts.load(q).then(function (res) {
        if (my !== seq) return;
        items = res;
        show(res.length ? res.map(function (r, i) { return '<li data-i="' + i + '">' + esc(r.label) + '</li>'; }).join('')
          : '<li class="combo__msg">Нічого не знайдено</li>');
      }).catch(function () {
        if (my !== seq) return;
        show('<li class="combo__msg">Не вдалося завантажити список. Перевірте з\'єднання та спробуйте ще раз.</li>');
      });
    }
    input.addEventListener('input', function () {
      if (api.value) { api.value = null; opts.onChange(null); }
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    });
    input.addEventListener('focus', function () { if (!api.value) load(); });
    // mousedown, щоб вибір спрацював раніше за blur
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li[data-i]');
      if (!li) return;
      e.preventDefault();
      api.value = items[+li.dataset.i];
      input.value = api.value.label;
      list.hidden = true;
      opts.onChange(api.value);
    });
    input.addEventListener('blur', function () { list.hidden = true; });
    api.reset = function (placeholder, disabled) {
      seq++; api.value = null; items = []; input.value = ''; list.innerHTML = ''; list.hidden = true;
      input.placeholder = placeholder; input.disabled = !!disabled;
    };
    return api;
  }

  var form = $('checkout');
  // підставляємо дані з кабінету
  var profile = store.get('profile', {});
  if (profile.first) form.first.value = profile.first;
  if (profile.last) form.last.value = profile.last;
  if (profile.phone) form.phone.value = profile.phone;
  var carrier = function () { return carriers[form.carrier.value]; };
  var isPickup = function () { return form.carrier.value === 'pickup'; };
  // самовивіз: адреса й графік беруться з налаштувань сайту (адмін-панель → Контакти)
  function pickupInfo() {
    var S = window.SITE || {};
    return { address: S.address || 'Волинська обл., с. Гаразджа, вул. Рівненська, 1', hours: S.hours || 'Пн–Сб 9:00–19:00' };
  }
  function showPickup() {
    var on = isPickup(), p = pickupInfo();
    // при самовивозі «накладений платіж» означає оплату на складі
    $('codNote').textContent = on ? 'Оплата готівкою або карткою під час отримання на складі.'
      : 'Оплата при отриманні у відділенні перевізника. Перевізник стягує комісію за переказ коштів.';
    $('cityBox').hidden = on; $('whBox').hidden = on; $('pickupBox').hidden = !on;
    if (on) $('pickupBox').innerHTML = '<b>Адреса складу:</b> ' + esc(p.address) + '<br><b>Графік:</b> ' + esc(p.hours) +
      '<br><small>Менеджер зателефонує, коли замовлення буде готове до видачі. Візьміть із собою номер замовлення.</small>';
  }

  var whCombo = combo($('whBox'), {
    min: 0, hint: '',
    load: function (q) { return carrier().warehouses(cityCombo.value, q); },
    onChange: function () { setErr('wh', ''); }
  });
  var cityCombo = combo($('cityBox'), {
    min: 2, hint: 'Введіть щонайменше 2 літери',
    load: function (q) { return carrier().cities(q); },
    onChange: function (city) {
      setErr('city', '');
      whCombo.reset(city ? 'Оберіть відділення або введіть номер / адресу' : 'Спершу оберіть населений пункт', !city);
    }
  });

  /* ---------- Перевірка та відправка ---------- */
  function setErr(name, msg) {
    var el = document.querySelector('[data-err="' + name + '"]');
    el.textContent = msg;
    var fld = el.closest('.fld');
    if (fld) fld.classList.toggle('bad', !!msg);
  }
  var nameRe = /^[A-Za-zА-Яа-яІіЇїЄєҐґ'ʼ’ -]{2,}$/;
  function phoneDigits(v) {
    var d = v.replace(/\D/g, '');
    if (d.length === 10 && d[0] === '0') d = '38' + d;
    return /^380\d{9}$/.test(d) ? d : '';
  }
  function validate() {
    var f = form.first.value.trim(), l = form.last.value.trim(), ok = true;
    var check = function (name, msg) { setErr(name, msg); if (msg) ok = false; };
    check('first', nameRe.test(f) ? '' : "Вкажіть ім'я");
    check('last', nameRe.test(l) ? '' : 'Вкажіть прізвище');
    check('phone', phoneDigits(form.phone.value) ? '' : 'Вкажіть номер у форматі +380XXXXXXXXX');
    if (!isPickup()) {
      check('city', cityCombo.value ? '' : 'Оберіть населений пункт зі списку');
      check('wh', whCombo.value ? '' : 'Оберіть відділення зі списку');
    }
    return ok;
  }

  form.addEventListener('change', function (e) {
    if (e.target.name === 'carrier') {
      showPickup();
      cityCombo.reset('Почніть вводити назву міста');
      whCombo.reset('Спершу оберіть населений пункт', true);
      setErr('city', ''); setErr('wh', '');
    }
  });
  ['first', 'last', 'phone'].forEach(function (n) {
    form[n].addEventListener('input', function () { setErr(n, ''); });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) {
      var bad = form.querySelector('.bad');
      if (bad) bad.scrollIntoView({ block: 'center' });
      return;
    }
    var sum = total();
    var order = {
      id: 'WA-' + Date.now().toString().slice(-8),
      date: new Date().toISOString(),
      name: form.first.value.trim() + ' ' + form.last.value.trim(),
      phone: '+' + phoneDigits(form.phone.value),
      carrier: isPickup() ? 'Самовивіз' : carrier().title,
      city: isPickup() ? pickupInfo().address : cityCombo.value.label,
      warehouse: isPickup() ? 'Самовивіз зі складу · ' + pickupInfo().hours : whCombo.value.label,
      pay: form.pay.value,
      note: form.note.value.trim(),
      items: lines().map(function (l) { return { id: l.p.id, base_price: l.p.pb, oe: l.p.oe, name: l.p.n, qty: l.q, price: l.p.p }; }),
      total: sum,
      total_base: lines().reduce(function (s, l) { return s + l.p.pb * l.q; }, 0),
      discount: window.WAWholesale ? window.WAWholesale.discount() : 0
    };
    // Копія замовлення лишається в браузері покупця (для розділу «Мої замовлення» в кабінеті)
    var orders = store.get('orders', []);
    orders.push(order);
    store.set('orders', orders);
    // якщо підключено сервер замовлень — надсилаємо замовлення туди (його побачать менеджер і бухгалтер)
    if (!profile.first && !profile.phone) store.set('profile', { first: form.first.value.trim(), last: form.last.value.trim(), phone: order.phone, email: '' });
    var BE = window.WABackend;
    var finish = function () {
      store.set('cart', {});
      cart = {};
      if (window.WATrack) window.WATrack('purchase', order.total, order.items.map(function (i) { return { item_id: i.id, item_name: i.name, quantity: i.qty, price: i.price }; }));
    };
    if (order.pay === 'mono') {
      // онлайн-оплата: зберегти замовлення на сервері, отримати рахунок monobank і перейти на сторінку оплати
      var btn = form.querySelector('.co__submit');
      btn.disabled = true; btn.textContent = 'Переходимо до оплати…';
      BE.createOrder(order).then(function () { return BE.monoInvoice(order.id); }).then(function (r) {
        finish();
        location.href = r.pageUrl;
      }).catch(function (err) {
        btn.disabled = false; btn.textContent = 'Підтвердити замовлення';
        alert('Не вдалося перейти до оплати: ' + err.message + '\nОберіть інший спосіб оплати або спробуйте ще раз.');
      });
      return;
    }
    // якщо підключено сервер замовлень — надсилаємо замовлення туди (його побачать менеджер і бухгалтер)
    if (BE && BE.enabled) BE.createOrder(order).catch(function () {});
    finish();
    showDone(order);
  });

  // Повернення зі сторінки оплати monobank: ?paid=<номер замовлення>
  function showPaid(id) {
    $('coGrid').hidden = true;
    document.querySelector('.co__title').textContent = 'Оплата замовлення';
    $('done').hidden = false;
    var tries = 0;
    var render = function (state) {
      var msg = state === 'success'
        ? '<div class="done__ok">✓</div><h2>Оплату отримано!</h2><p>Замовлення <b>' + esc(id) + '</b> оплачено. Менеджер зателефонує для підтвердження доставки.</p>'
        : state === 'wait'
          ? '<h2>Перевіряємо оплату…</h2><p>Зачекайте кілька секунд, не закривайте сторінку.</p>'
          : '<h2>Оплату не завершено</h2><p>Замовлення <b>' + esc(id) + '</b> збережено, але оплата не пройшла або ще обробляється банком. Менеджер зв\'яжеться з вами, щоб завершити замовлення.</p>';
      $('done').innerHTML = msg + '<a class="btn" href="catalog.html">Повернутися до каталогу</a>';
    };
    render('wait');
    (function poll() {
      window.WABackend.monoStatus(id).then(function (r) {
        if (r.paid) { render('success'); return; }
        if (++tries < 10 && (!r.status || r.status === 'created' || r.status === 'processing')) setTimeout(poll, 3000);
        else render('fail');
      }).catch(function () { if (++tries < 10) setTimeout(poll, 3000); else render('fail'); });
    })();
  }

  function showDone(o) {
    var pay = o.pay === 'bank'
      ? '<h3>Реквізити для оплати</h3><table class="req">' +
        '<tr><th>Отримувач</th><td>' + esc(BANK.name) + '</td></tr>' +
        '<tr><th>ЄДРПОУ / ІПН</th><td>' + esc(BANK.code) + '</td></tr>' +
        '<tr><th>IBAN</th><td><span class="num">' + esc(BANK.iban) + '</span></td></tr>' +
        '<tr><th>Банк</th><td>' + esc(BANK.bank) + '</td></tr>' +
        '<tr><th>Сума</th><td><b>' + fmt(o.total, 'UAH', true) + '</b></td></tr>' +
        '<tr><th>Призначення</th><td>Оплата замовлення ' + esc(o.id) + '</td></tr></table>' +
        '<p class="note">Замовлення відправимо після надходження оплати.</p>'
      : o.carrier === 'Самовивіз'
        ? '<h3>Оплата при отриманні</h3><p>Оплатіть замовлення готівкою або карткою під час отримання на складі. Сума: <b>' + fmt(o.total, 'UAH', true) + '</b>.</p>'
        : '<h3>Накладений платіж</h3><p>Оплатіть замовлення при отриманні у відділенні ' + esc(o.carrier) + '. Сума товарів: <b>' +
          fmt(o.total, 'UAH', true) + '</b>; перевізник додатково стягує комісію за переказ коштів за своїми тарифами.</p>';
    $('coGrid').hidden = true;
    document.querySelector('.co__title').textContent = 'Замовлення оформлено';
    $('done').hidden = false;
    $('done').innerHTML = '<div class="done__ok">✓</div><h2>Дякуємо, ' + esc(o.name.split(' ')[0]) + '!</h2>' +
      '<p>Замовлення <b>' + esc(o.id) + '</b> прийнято. Менеджер зателефонує на ' + esc(o.phone) + ' для підтвердження.</p>' +
      '<table class="req"><tr><th>Отримувач</th><td>' + esc(o.name) + '</td></tr>' +
      '<tr><th>Доставка</th><td>' + esc(o.carrier) + '<br>' + esc(o.city) + '<br>' + esc(o.warehouse) + '</td></tr>' +
      '<tr><th>Товарів</th><td>' + o.items.reduce(function (s, i) { return s + i.qty; }, 0) + ' шт. на ' + fmt(o.total, 'UAH', true) + '</td></tr></table>' +
      pay + '<a class="btn" href="catalog.html">Повернутися до каталогу</a>';
    window.scrollTo(0, 0);
  }

  /* ---------- Шапка ---------- */
  $('cur').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cur]');
    if (!b) return;
    cur = b.dataset.cur;
    store.set('cur', cur);
    if (lines().length) renderSummary();
  });
  $('themeBtn').addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('winauto-theme', next); } catch (e) {}
  });

  $('year').textContent = new Date().getFullYear();
  var paidId = new URLSearchParams(location.search).get('paid');
  if (window.WABackend && window.WABackend.monoEnabled) $('monoOpt').hidden = false;
  if (paidId && window.WABackend && window.WABackend.enabled) { showPaid(paidId); return; }
  renderSummary();
  // оптовий клієнт: підтягнути актуальну знижку й перерахувати суму
  if (window.WAWholesale) window.WAWholesale.refresh().then(function () { if (lines().length) renderSummary(); }).catch(function () {});
  if (window.fetch) {
    fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json').then(function (r) { return r.json(); }).then(function (list) {
      var next = {};
      list.forEach(function (x) { if (x.cc === 'USD' || x.cc === 'EUR') next[x.cc] = x.rate; });
      if (next.USD > 0 && next.EUR > 0) { rates = next; if (lines().length) renderSummary(); }
    }).catch(function () {});
  }
})();

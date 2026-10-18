// Каркас адмін-панелі: вхід, ролі, бічне меню, замовлення та облік.
// Розділи каталогу й текстів сайту обслуговує admin.js.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var BE = window.WABackend;
  var ROLES = { admin: 'Адміністратор', manager: 'Менеджер', accountant: 'Бухгалтер' };
  var STATUS = { 'new': 'Нове', confirmed: 'Підтверджене', shipped: 'Відправлене', done: 'Виконане', cancelled: 'Скасоване' };
  var PAY = { bank: 'На рахунок', paypass: 'PayPass при отриманні' };

  // Розділи панелі та ролі, яким вони доступні
  var SECTIONS = [
    { group: 'Замовлення', items: [{ id: 'orders', t: 'Усі замовлення', roles: ['admin', 'manager', 'accountant'] }] },
    { group: 'Бухгалтерія', items: [{ id: 'accounting', t: 'Облік замовлень', roles: ['admin', 'accountant'] }] },
    { group: 'Клієнти', items: [{ id: 'wholesale', t: 'Оптові клієнти', roles: ['admin'] }] },
    { group: 'Каталог', items: [
      { id: 'products', t: 'Товари', roles: ['admin'] },
      { id: 'prices', t: 'Ціни та прайс-листи', roles: ['admin'] }] },
    { group: 'Сайт', items: [
      { id: 'contacts', t: 'Контакти', roles: ['admin'] },
      { id: 'texts', t: 'Головна сторінка', roles: ['admin'] },
      { id: 'bank', t: 'Реквізити оплати', roles: ['admin'] },
      { id: 'tracking', t: 'Аналітика та пікселі', roles: ['admin'] }] },
    { group: 'Доступ', items: [
      { id: 'users', t: 'Користувачі та ролі', roles: ['admin'] },
      { id: 'github', t: 'Підключення до GitHub', roles: ['admin'] }] }
  ];
  var CATALOG_PANES = ['products', 'prices', 'contacts', 'texts', 'bank', 'tracking'];

  var user = null, orders = [], pane = '';
  var can = {
    manage: function () { return user.role === 'admin' || user.role === 'manager'; },      // статус, ТТН, нотатки
    account: function () { return user.role === 'admin' || user.role === 'accountant'; }   // оплата, документи
  };
  var money = function (n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  var day = function (iso) { return iso ? new Date(iso).toLocaleDateString('uk-UA') : ''; };
  function status(id, text, kind) { var el = $(id); el.textContent = text || ''; el.className = 'status' + (kind ? ' ' + kind : ''); }

  /* ---------- Дані замовлень ---------- */
  // Демо-режим: приклади + замовлення, оформлені в цьому браузері; зміни зберігаються лише тут
  function demoOrders() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('winauto-admin-demo')); } catch (e) {}
    var list = saved || sample();
    var mine = [];
    try { mine = JSON.parse(localStorage.getItem('winauto-orders')) || []; } catch (e) {}
    mine.forEach(function (o) {
      if (list.some(function (x) { return x.id === o.id; })) return;
      list.unshift({ id: o.id, created_at: o.date, name: o.name, phone: o.phone, carrier: o.carrier, city: o.city, warehouse: o.warehouse,
        pay: o.pay, note: o.note, items: o.items, total: o.total, status: 'new', paid: false });
    });
    return list;
  }
  function sample() {
    var now = Date.now(), d = function (days) { return new Date(now - days * 864e5).toISOString(); };
    var it = function (name, qty, price, oe) { return { name: name, qty: qty, price: price, oe: oe }; };
    return [
      { id: 'WA-ПРИКЛАД-6', created_at: d(0.1), name: 'Олена Коваль', phone: '+380501112233', carrier: 'Нова Пошта', city: 'м. Київ, Київська обл.', warehouse: 'Відділення №12', pay: 'bank', note: 'Передзвоніть після 14:00', items: [it('Бампер передній - Tesla Model 3', 1, 3212, '1084168-S0-E')], total: 3212, status: 'new', paid: false },
      { id: 'WA-ПРИКЛАД-5', created_at: d(1), name: 'Андрій Мельник', phone: '+380671234567', carrier: 'Делівері', city: 'Львів, Львівська область', warehouse: 'ЛЬВІВ-1 — вул. Городоцька, 357', pay: 'paypass', note: '', items: [it('Капот - BMW 3 (F30)', 1, 9800, '41007290947'), it('Петля капота ліва', 2, 650, '41617434311')], total: 11100, status: 'confirmed', paid: false },
      { id: 'WA-ПРИКЛАД-4', created_at: d(3), name: 'Ірина Шевчук', phone: '+380931234567', carrier: 'Нова Пошта', city: 'м. Луцьк, Волинська обл.', warehouse: 'Відділення №5', pay: 'bank', note: '', items: [it('Решітка радіатора - Audi A6 (C7)', 1, 4350, '4G0853651')], total: 4350, status: 'shipped', ttn: '20450000000001', paid: true, paid_at: d(2.5), invoice: 'РН-0004' },
      { id: 'WA-ПРИКЛАД-3', created_at: d(6), name: 'Тарас Бондар', phone: '+380661234567', carrier: 'Нова Пошта', city: 'м. Одеса, Одеська обл.', warehouse: 'Поштомат №3301', pay: 'bank', note: 'VIN: WBA8E9G50GNT00000', items: [it('Підкрилок передній правий - BMW 3 (F30)', 1, 1180, '51717260726')], total: 1180, status: 'done', ttn: '20450000000002', paid: true, paid_at: d(5), invoice: 'РН-0003' },
      { id: 'WA-ПРИКЛАД-2', created_at: d(9), name: 'Марія Ткаченко', phone: '+380731234567', carrier: 'Делівері', city: 'Харків, Харківська область', warehouse: 'ХАРКІВ-2', pay: 'paypass', note: '', items: [it('Крило переднє ліве - Volvo XC60', 1, 5600, '31385349')], total: 5600, status: 'done', ttn: '5900000001', paid: true, paid_at: d(7), invoice: 'РН-0002' },
      { id: 'WA-ПРИКЛАД-1', created_at: d(12), name: 'Сергій Литвин', phone: '+380991234567', carrier: 'Нова Пошта', city: 'м. Дніпро, Дніпропетровська обл.', warehouse: 'Відділення №40', pay: 'bank', note: '', items: [it('Фара протитуманна - Mazda CX-5', 2, 1450, 'KD5351680')], total: 2900, status: 'cancelled', paid: false, manager_note: 'Клієнт відмовився' }
    ];
  }
  function loadOrders() {
    if (!BE.enabled) { orders = demoOrders(); return Promise.resolve(); }
    return BE.listOrders().then(function (rows) { orders = rows; });
  }
  function saveOrder(o, patch) {
    Object.keys(patch).forEach(function (k) { o[k] = patch[k]; });
    if (!BE.enabled) {
      try { localStorage.setItem('winauto-admin-demo', JSON.stringify(orders)); } catch (e) {}
      return Promise.resolve();
    }
    return BE.updateOrder(o.id, patch);
  }

  /* ---------- Вхід ---------- */
  function enter(u) {
    user = u;
    $('login').hidden = true;
    $('app').hidden = false;
    $('userBox').hidden = false; $('logout').hidden = false;
    $('userName').textContent = u.name;
    $('userRole').textContent = ROLES[u.role] + (BE.enabled ? '' : ' · демо');
    $('usersHelp').innerHTML = BE.enabled
      ? 'Користувачів додають у Supabase: розділ Authentication → Users → Add user (e-mail і пароль), потім у таблиці <code>profiles</code> — рядок з id цього користувача, іменем і роллю: <code>admin</code>, <code>manager</code> або <code>accountant</code>.'
      : '<b>Зараз демо-режим.</b> Справжніх облікових записів і паролів ще немає: ролі перемикаються на екрані входу, а замовлення — це приклади. Щоб працювали вхід за паролем і реальні замовлення із сайту, потрібно підключити сервер (файли <code>backend.js</code> і <code>supabase-setup.sql</code>).';
    renderNav();
    Promise.all([loadOrders(), loadWholesale()]).then(function () {
      renderNav();
      open(firstPane());
    }).catch(function (err) { open(firstPane()); status('ordersStatus', err.message, 'bad'); });
  }
  if (BE.enabled) $('loginForm').hidden = false; else $('demoLogin').hidden = false;

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    status('loginStatus', 'Вхід…');
    BE.login($('lEmail').value.trim(), $('lPass').value).then(function (u) {
      if (!ROLES[u.role]) throw new Error('Невідома роль користувача: ' + u.role);
      $('lPass').value = '';
      status('loginStatus', '');
      enter(u);
    }).catch(function (err) { status('loginStatus', err.message === 'Invalid login credentials' ? 'Невірний e-mail або пароль.' : err.message, 'bad'); });
  });
  $('demoLogin').addEventListener('click', function (e) {
    var b = e.target.closest('[data-role]');
    if (b) enter({ name: ROLES[b.dataset.role], role: b.dataset.role });
  });
  $('logout').addEventListener('click', function () { BE.logout(); location.reload(); });

  /* ---------- Бічне меню ---------- */
  function allowed(item) { return item.roles.indexOf(user.role) !== -1; }
  function firstPane() {
    var first = '';
    SECTIONS.forEach(function (s) { s.items.forEach(function (i) { if (!first && allowed(i)) first = i.id; }); });
    return first;
  }
  function renderNav() {
    var fresh = orders.filter(function (o) { return (o.status || 'new') === 'new'; }).length;
    $('nav').innerHTML = SECTIONS.map(function (s) {
      var items = s.items.filter(allowed);
      if (!items.length) return '';
      return '<div class="adm__group">' + s.group + '</div>' + items.map(function (i) {
        return '<button type="button" data-open="' + i.id + '"' + (i.id === pane ? ' class="on"' : '') + '><span>' + i.t + '</span>' +
          (i.id === 'orders' && fresh ? '<em>' + fresh + '</em>' : '') +
          (i.id === 'wholesale' && wsPending() ? '<em>' + wsPending() + '</em>' : '') + '</button>';
      }).join('');
    }).join('');
  }
  function open(id) {
    var ok = false;
    SECTIONS.forEach(function (s) { s.items.forEach(function (i) { if (i.id === id && allowed(i)) ok = true; }); });
    if (!ok) return;   // розділ недоступний для цієї ролі
    pane = id;
    [].forEach.call(document.querySelectorAll('[data-pane]'), function (p) { p.hidden = p.dataset.pane !== id; });
    document.querySelector('.adm__side').classList.remove('open');
    renderNav();
    if (CATALOG_PANES.indexOf(id) !== -1) window.AdminCatalog.ensure();
    if (id === 'orders') renderOrders();
    if (id === 'accounting') renderAccounting();
    if (id === 'wholesale') renderWholesale();
    if (id === 'prices') window.AdminCatalog.ensure().then(function () { window.AdminCatalog.prices(); });
    window.scrollTo(0, 0);
  }
  $('nav').addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]');
    if (b) open(b.dataset.open);
  });
  $('sideToggle').addEventListener('click', function () { document.querySelector('.adm__side').classList.toggle('open'); });

  /* ---------- Замовлення ---------- */
  var tag = function (st) { st = st || 'new'; return '<span class="tag tag--' + st + '">' + STATUS[st] + '</span>'; };
  var paidTag = function (o) { return o.paid ? '<span class="tag tag--paid">Оплачено</span>' : '<span class="tag">Не оплачено</span>'; };
  $('oStatus').innerHTML = '<option value="">Усі статуси</option>' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '">' + STATUS[k] + '</option>'; }).join('');

  function renderOrders() {
    var st = $('oStatus').value, q = $('oSearch').value.trim().toLowerCase();
    var list = orders.filter(function (o) {
      if (st && (o.status || 'new') !== st) return false;
      if (q && (o.id + ' ' + o.name + ' ' + o.phone).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var count = function (s) { return orders.filter(function (o) { return (o.status || 'new') === s; }).length; };
    $('orderKpis').innerHTML = [['Нові', count('new')], ['Підтверджені', count('confirmed')], ['Відправлені', count('shipped')], ['Виконані', count('done')]]
      .map(function (k) { return '<div class="kpi"><b>' + k[1] + '</b><span>' + k[0] + '</span></div>'; }).join('');
    status('ordersStatus', 'Замовлень: ' + list.length + (BE.enabled ? '' : ' · демо-дані'));
    $('orderRows').innerHTML = list.map(function (o) {
      return '<tr class="click" data-order="' + esc(o.id) + '"><td><b>' + esc(o.id) + '</b></td><td>' + day(o.created_at) + '</td>' +
        '<td>' + esc(o.name) + '<br><small>' + esc(o.phone) + '</small></td>' +
        '<td class="num">' + money(o.total) + ' грн</td><td>' + paidTag(o) + '</td><td>' + tag(o.status) + '</td>' +
        '<td class="acts"><button type="button" class="btn btn--sm btn--ghost">Відкрити</button></td></tr>';
    }).join('') || '<tr><td colspan="7" class="empty">Замовлень немає.</td></tr>';
  }
  $('oStatus').addEventListener('change', renderOrders);
  $('oSearch').addEventListener('input', renderOrders);
  $('orderRows').addEventListener('click', function (e) {
    var tr = e.target.closest('[data-order]');
    if (tr) openOrder(tr.dataset.order);
  });

  function openOrder(id) {
    var o = orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    var m = can.manage(), a = can.account();
    var dis = function (ok) { return ok ? '' : ' disabled'; };
    $('orderBody').innerHTML = '<div class="ord"><h2>Замовлення ' + esc(o.id) + '</h2>' +
      '<div class="card__meta">' + new Date(o.created_at).toLocaleString('uk-UA') + ' · ' + tag(o.status) + ' ' + paidTag(o) + '</div>' +
      '<div class="ord__grid"><div><h5>Клієнт</h5><p><b>' + esc(o.name) + '</b></p><p><a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a></p>' +
      (o.note ? '<p><small>Коментар: ' + esc(o.note) + '</small></p>' : '') + '</div>' +
      '<div><h5>Доставка</h5><p>' + esc(o.carrier) + '</p><p>' + esc(o.city) + '</p><p>' + esc(o.warehouse) + '</p></div></div>' +
      '<h5>Товари</h5><table class="req">' + (o.items || []).map(function (i) {
        return '<tr><td>' + esc(i.name) + (i.oe ? '<br><small>OE: ' + esc(i.oe) + '</small>' : '') + '</td><td class="num">' + i.qty + ' × ' + money(i.price) + '</td><td class="num"><b>' + money(i.qty * i.price) + ' грн</b></td></tr>';
      }).join('') + (o.discount ? '<tr><td>Оптова знижка ' + o.discount + '%' + (o.total_base ? ' (без знижки ' + money(o.total_base) + ' грн)' : '') + '</td><td></td><td></td></tr>' : '') +
      '<tr><th>Разом</th><td></td><td class="num"><b>' + money(o.total) + ' грн</b></td></tr></table>' +
      '<form class="ord__form" id="orderForm">' +
      '<h5 class="wide">Обробка замовлення' + (m ? '' : ' (лише перегляд)') + '</h5>' +
      '<label class="fld">Статус<select id="fStatus"' + dis(m) + '>' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + ((o.status || 'new') === k ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="fld">Номер накладної (ТТН)<input id="fTtn" value="' + esc(o.ttn || '') + '"' + dis(m) + '></label>' +
      '<label class="fld wide">Нотатка менеджера<input id="fMnote" value="' + esc(o.manager_note || '') + '"' + dis(m) + '></label>' +
      '<h5 class="wide">Оплата' + (a ? '' : ' (лише перегляд)') + ' · ' + esc(PAY[o.pay] || o.pay || '') + '</h5>' +
      '<label class="fld">Статус оплати<select id="fPaid"' + dis(a) + '><option value="0"' + (o.paid ? '' : ' selected') + '>Не оплачено</option><option value="1"' + (o.paid ? ' selected' : '') + '>Оплачено</option></select></label>' +
      '<label class="fld">Дата оплати<input id="fPaidAt" type="date" value="' + (o.paid_at ? o.paid_at.slice(0, 10) : '') + '"' + dis(a) + '></label>' +
      '<label class="fld wide">Номер документа (рахунок / накладна)<input id="fInvoice" value="' + esc(o.invoice || '') + '"' + dis(a) + '></label>' +
      '<div class="wide cab__actions"><button class="btn" type="submit">Зберегти</button><button class="btn btn--ghost" type="button" data-close>Закрити</button><span class="status" id="orderStatus"></span></div>' +
      '</form></div>';
    $('orderForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var patch = {};
      if (m) { patch.status = $('fStatus').value; patch.ttn = $('fTtn').value.trim(); patch.manager_note = $('fMnote').value.trim(); }
      if (a) {
        patch.paid = $('fPaid').value === '1';
        patch.paid_at = patch.paid ? ($('fPaidAt').value ? new Date($('fPaidAt').value).toISOString() : new Date().toISOString()) : null;
        patch.invoice = $('fInvoice').value.trim();
      }
      status('orderStatus', 'Збереження…');
      saveOrder(o, patch).then(function () {
        $('orderModal').hidden = true;
        renderNav();
        if (pane === 'accounting') renderAccounting(); else renderOrders();
      }).catch(function (err) { status('orderStatus', err.message, 'bad'); });
    });
    $('orderModal').hidden = false;
  }
  $('orderModal').addEventListener('click', function (e) {
    if (e.target === $('orderModal') || e.target.closest('[data-close]')) $('orderModal').hidden = true;
  });

  /* ---------- Облік ---------- */
  function accList() {
    var from = $('accFrom').value, to = $('accTo').value, paid = $('accPaid').value;
    return orders.filter(function (o) {
      var d = (o.created_at || '').slice(0, 10);
      if ((o.status || 'new') === 'cancelled') return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (paid && String(o.paid ? 1 : 0) !== paid) return false;
      return true;
    });
  }
  function renderAccounting() {
    var list = accList(), sum = 0, paid = 0;
    list.forEach(function (o) { sum += o.total; if (o.paid) paid += o.total; });
    $('accKpis').innerHTML = [['Замовлень', list.length], ['Сума, грн', money(sum)], ['Оплачено, грн', money(paid)], ['Очікує оплати, грн', money(sum - paid)]]
      .map(function (k) { return '<div class="kpi"><b>' + k[1] + '</b><span>' + k[0] + '</span></div>'; }).join('');
    $('accRows').innerHTML = list.map(function (o) {
      return '<tr data-acc="' + esc(o.id) + '"><td><b>' + esc(o.id) + '</b></td><td>' + day(o.created_at) + '</td><td>' + esc(o.name) + '</td>' +
        '<td>' + esc(PAY[o.pay] || o.pay || '') + '</td><td class="num">' + money(o.total) + '</td>' +
        '<td><input type="checkbox" data-f="paid"' + (o.paid ? ' checked' : '') + ' aria-label="Оплачено"></td>' +
        '<td><input type="date" data-f="paid_at" value="' + (o.paid_at ? o.paid_at.slice(0, 10) : '') + '" aria-label="Дата оплати"></td>' +
        '<td><input type="text" data-f="invoice" value="' + esc(o.invoice || '') + '" aria-label="Номер документа"></td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">За цей період замовлень немає.</td></tr>';
  }
  ['accFrom', 'accTo', 'accPaid'].forEach(function (id) { $(id).addEventListener('change', renderAccounting); });
  $('accRows').addEventListener('change', function (e) {
    var tr = e.target.closest('[data-acc]'), f = e.target.dataset.f;
    if (!tr || !f) return;
    var o = orders.filter(function (x) { return x.id === tr.dataset.acc; })[0], patch = {};
    if (f === 'paid') {
      patch.paid = e.target.checked;
      patch.paid_at = patch.paid ? (o.paid_at || new Date().toISOString()) : null;
    } else if (f === 'paid_at') {
      patch.paid_at = e.target.value ? new Date(e.target.value).toISOString() : null;
    } else patch.invoice = e.target.value.trim();
    saveOrder(o, patch).then(renderAccounting).catch(function (err) { alert('Не вдалося зберегти: ' + err.message); });
  });
  // звіт для бухгалтерії: CSV, що відкривається в Excel
  $('accExport').addEventListener('click', function () {
    var cell = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['Номер', 'Дата', 'Клієнт', 'Телефон', 'Спосіб оплати', 'Сума, грн', 'Оплачено', 'Дата оплати', 'Документ', 'Статус', 'Товари']];
    accList().forEach(function (o) {
      rows.push([o.id, day(o.created_at), o.name, o.phone, PAY[o.pay] || o.pay, String(o.total).replace('.', ','), o.paid ? 'так' : 'ні', day(o.paid_at), o.invoice || '',
        STATUS[o.status || 'new'], (o.items || []).map(function (i) { return i.name + ' × ' + i.qty; }).join('; ')]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(cell).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'win-auto-oblik-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  });

  /* ---------- Оптові клієнти ---------- */
  var WSX = window.WAWholesale, clients = [], wsTab = 'pending';
  function loadWholesale() {
    if (BE.enabled) return BE.listWholesale().then(function (rows) { clients = rows; }).catch(function () { clients = []; });
    clients = WSX ? WSX.demoList() : [];
    return Promise.resolve();
  }
  function wsPending() { return clients.filter(function (c) { return c.status === 'pending'; }).length; }
  function saveClient(c, patch) {
    Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
    if (BE.enabled) return BE.updateWholesale(c.id, patch);
    WSX.demoSave(clients);
    return Promise.resolve();
  }
  // покупки клієнта: замовлення з його акаунта або з його телефоном
  function purchases(c) {
    var mine = orders.filter(function (o) { return (o.status || 'new') !== 'cancelled' && ((o.customer_id && o.customer_id === c.id) || (c.phone && o.phone === c.phone)); });
    return { n: mine.length, sum: mine.reduce(function (s, o) { return s + (+o.total || 0); }, 0) };
  }
  function renderWholesale() {
    [].forEach.call(document.querySelectorAll('#wsTabs [data-ws]'), function (b) { b.classList.toggle('on', b.dataset.ws === wsTab); });
    var list = clients.filter(function (c) { return c.status === wsTab; });
    status('wsStatus', (BE.enabled ? '' : 'Демо-режим: тут видно заявки, подані в цьому браузері. ') + (list.length ? '' : 'Порожньо.'));
    $('wsRows').innerHTML = list.map(function (c) {
      var p = purchases(c);
      var acts = c.status === 'pending'
        ? '<button type="button" class="btn btn--sm" data-act="approve">Схвалити</button><button type="button" class="rm" style="display:inline" data-act="reject">Відхилити</button>'
        : c.status === 'approved'
          ? '<button type="button" class="btn btn--sm btn--ghost" data-act="save">Зберегти знижку</button><button type="button" class="rm" style="display:inline" data-act="reject">Відключити</button>'
          : '<button type="button" class="btn btn--sm btn--ghost" data-act="approve">Схвалити</button>';
      return '<tr data-client="' + esc(c.id) + '"><td>' + day(c.created_at) + '</td>' +
        '<td><b>' + esc(c.last_name + ' ' + c.first_name) + '</b>' + (c.business_type ? '<br><span class="tag">' + esc(c.business_type) + '</span>' : '') + (c.company ? '<br><small>' + esc(c.company) + '</small>' : '') + '</td>' +
        '<td>' + esc(c.phone) + '<br><small>' + esc(c.email) + '</small><br><small>' + esc(c.address) + '</small></td>' +
        '<td class="num">' + p.n + ' зам.<br><small>' + money(p.sum) + ' грн</small></td>' +
        '<td><input type="number" min="0" max="90" step="0.5" value="' + (+c.discount || 0) + '" data-disc aria-label="Знижка, %"></td>' +
        '<td class="acts">' + acts + '</td></tr>';
    }).join('');
  }
  $('wsTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ws]');
    if (b) { wsTab = b.dataset.ws; renderWholesale(); }
  });
  $('wsRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'), tr = e.target.closest('[data-client]');
    if (!b || !tr) return;
    var c = clients.filter(function (x) { return x.id === tr.dataset.client; })[0];
    var disc = parseFloat(tr.querySelector('[data-disc]').value);
    if (!(disc >= 0 && disc <= 90)) { status('wsStatus', 'Знижка має бути від 0 до 90%.', 'bad'); return; }
    if (b.dataset.act === 'reject' && !confirm('Відхилити / відключити клієнта ' + c.last_name + ' ' + c.first_name + '?')) return;
    var patch = b.dataset.act === 'reject' ? { status: 'rejected' }
      : b.dataset.act === 'approve' ? { status: 'approved', discount: disc, approved_at: new Date().toISOString() }
      : { discount: disc };
    saveClient(c, patch).then(function () {
      renderWholesale(); renderNav();
      status('wsStatus', b.dataset.act === 'approve' ? 'Клієнта схвалено зі знижкою ' + disc + '%. Він у вкладці «Оптові клієнти».' : b.dataset.act === 'save' ? 'Знижку змінено на ' + disc + '%.' : 'Клієнта відхилено.', 'ok');
    }).catch(function (err) { status('wsStatus', err.message, 'bad'); });
  });
})();

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
  var PAY = { bank: 'На рахунок', cod: 'Накладений платіж', paypass: 'PayPass при отриманні', mono: 'Карткою онлайн (monobank)' };

  // Розділи панелі та ролі, яким вони доступні
  var SECTIONS = [
    { group: 'Замовлення', items: [{ id: 'orders', t: 'Усі замовлення', roles: ['admin', 'manager', 'accountant'] }] },
    { group: 'Бухгалтерія', items: [{ id: 'accounting', t: 'Облік замовлень', roles: ['admin', 'accountant'], perm: ['accounting'] }] },
    { group: 'Клієнти', items: [{ id: 'wholesale', t: 'Оптові клієнти', roles: ['admin'], perm: ['wholesale'] }] },
    { group: 'Каталог', items: [
      { id: 'products', t: 'Товари', roles: ['admin'], perm: ['catalog'] },
      { id: 'prices', t: 'Ціни та прайс-листи', roles: ['admin'], perm: ['catalog'] }] },
    { group: 'Сайт', items: [
      { id: 'contacts', t: 'Контакти', roles: ['admin'], perm: ['site'] },
      { id: 'texts', t: 'Головна сторінка', roles: ['admin'], perm: ['site'] },
      { id: 'bank', t: 'Реквізити оплати', roles: ['admin'], perm: ['site'] },
      { id: 'tracking', t: 'Аналітика та пікселі', roles: ['admin'], perm: ['site'] }] },
    { group: 'Доступ', items: [
      { id: 'users', t: 'Працівники та доступи', roles: ['admin'] },
      { id: 'github', t: 'Підключення до GitHub', roles: ['admin'], perm: ['catalog', 'site'] }] }
  ];
  var CATALOG_PANES = ['products', 'prices', 'contacts', 'texts', 'bank', 'tracking'];

  var user = null, orders = [], pane = '';
  // Додаткові права, які адміністратор може дати понад роль (ті самі назви перевіряє сервер)
  var PERMS = [
    ['orders_manage', 'Обробка замовлень (статуси, ТТН, нотатки)'],
    ['accounting', 'Облік і оплати'],
    ['wholesale', 'Оптові клієнти та знижки'],
    ['catalog', 'Товари й ціни'],
    ['site', 'Контакти, тексти, реквізити, аналітика']
  ];
  var ROLE_PERMS = { admin: PERMS.map(function (p) { return p[0]; }), manager: ['orders_manage'], accountant: ['accounting'] };
  function has(p, u) {
    u = u || user;
    return (ROLE_PERMS[u.role] || []).indexOf(p) !== -1 || (u.perms || []).indexOf(p) !== -1;
  }
  var can = {
    manage: function () { return has('orders_manage'); },   // статус, ТТН, нотатки
    account: function () { return has('accounting'); }      // оплата, документи
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
      { id: 'WA-ПРИКЛАД-5', created_at: d(1), name: 'Андрій Мельник', phone: '+380671234567', carrier: 'Делівері', city: 'Львів, Львівська область', warehouse: 'ЛЬВІВ-1 — вул. Городоцька, 357', pay: 'cod', note: '', items: [it('Капот - BMW 3 (F30)', 1, 9800, '41007290947'), it('Петля капота ліва', 2, 650, '41617434311')], total: 11100, status: 'confirmed', paid: false },
      { id: 'WA-ПРИКЛАД-4', created_at: d(3), name: 'Ірина Шевчук', phone: '+380931234567', carrier: 'Нова Пошта', city: 'м. Луцьк, Волинська обл.', warehouse: 'Відділення №5', pay: 'bank', note: '', items: [it('Решітка радіатора - Audi A6 (C7)', 1, 4350, '4G0853651')], total: 4350, status: 'shipped', ttn: '20450000000001', paid: true, paid_at: d(2.5), invoice: 'РН-0004' },
      { id: 'WA-ПРИКЛАД-3', created_at: d(6), name: 'Тарас Бондар', phone: '+380661234567', carrier: 'Нова Пошта', city: 'м. Одеса, Одеська обл.', warehouse: 'Поштомат №3301', pay: 'bank', note: 'VIN: WBA8E9G50GNT00000', items: [it('Підкрилок передній правий - BMW 3 (F30)', 1, 1180, '51717260726')], total: 1180, status: 'done', ttn: '20450000000002', paid: true, paid_at: d(5), invoice: 'РН-0003' },
      { id: 'WA-ПРИКЛАД-2', created_at: d(9), name: 'Марія Ткаченко', phone: '+380731234567', carrier: 'Делівері', city: 'Харків, Харківська область', warehouse: 'ХАРКІВ-2', pay: 'cod', note: '', items: [it('Крило переднє ліве - Volvo XC60', 1, 5600, '31385349')], total: 5600, status: 'done', ttn: '5900000001', paid: true, paid_at: d(7), invoice: 'РН-0002' },
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
    $('userBox').hidden = false; $('logout').hidden = false; $('myPass').hidden = !BE.enabled; $('sidePass').hidden = !BE.enabled;
    $('userName').textContent = u.name;
    $('sideName').textContent = u.name;
    $('admBurger').hidden = false;
    $('userRole').textContent = ROLES[u.role] + (BE.enabled ? '' : ' · демо');
    $('sideRole').textContent = $('userRole').textContent;
    $('usersHelp').innerHTML = BE.enabled
      ? 'Працівник входить на цій сторінці з e-mail і паролем, які ви йому задали. Пароль передайте особисто; змінити його можна кнопкою «Змінити пароль».'
      : '<b>Зараз демо-режим.</b> Справжніх облікових записів і паролів ще немає: ролі перемикаються на екрані входу, а замовлення — це приклади. Щоб працювали вхід за паролем і реальні замовлення із сайту, потрібно підключити сервер (файли <code>backend.js</code> і <code>supabase-setup.sql</code>).';
    renderNav();
    Promise.all([loadOrders(), loadWholesale()]).then(function () {
      renderNav();
      open(firstPane());
    }).catch(function (err) { open(firstPane()); status('ordersStatus', err.message, 'bad'); });
  }
  if (BE.enabled) {
    // збережений вхід («Не виходити на цьому пристрої»)
    status('loginStatus', 'Перевірка входу…');
    $('loginForm').hidden = false;
    BE.restoreStaff().then(function (u) {
      status('loginStatus', '');
      if (u && ROLES[u.role]) enter(u);
    });
  } else $('demoLogin').hidden = false;

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    status('loginStatus', 'Вхід…');
    var email = $('lEmail').value.trim(), pass = $('lPass').value;
    BE.login(email, pass, $('lRemember').checked).then(function (u) {
      if (!ROLES[u.role]) throw new Error('Невідома роль користувача: ' + u.role);
      // підказка браузеру (Chrome, Edge) зберегти логін і пароль; Safari та інші пропонують це самі
      if (window.PasswordCredential && navigator.credentials) {
        try { navigator.credentials.store(new window.PasswordCredential({ id: email, password: pass, name: u.name })).catch(function () {}); } catch (err) {}
      }
      status('loginStatus', '');
      enter(u);
    }).catch(function (err) { status('loginStatus', err.message === 'Invalid login credentials' ? 'Невірний e-mail або пароль.' : err.message, 'bad'); });
  });
  $('demoLogin').addEventListener('click', function (e) {
    var b = e.target.closest('[data-role]');
    if (b) enter({ id: 'demo-' + b.dataset.role, name: ROLES[b.dataset.role], role: b.dataset.role, perms: [] });
  });
  $('logout').addEventListener('click', function () { BE.logout(); location.reload(); });
  // зміна власного пароля працівника
  function changeMyPassword() {
    var cur = prompt('Чинний пароль:');
    if (!cur) return;
    var next = prompt('Новий пароль (щонайменше 8 символів):');
    if (next == null) return;
    if (next.length < 8) { alert('Пароль має містити щонайменше 8 символів.'); return; }
    if (prompt('Повторіть новий пароль:') !== next) { alert('Паролі не збігаються.'); return; }
    BE.changePassword(cur, next).then(function () { alert('Пароль змінено. Якщо браузер запропонує оновити збережений пароль — погодьтеся.'); })
      .catch(function (err) { alert(err.message); });
  }
  $('myPass').addEventListener('click', changeMyPassword);
  $('sidePass').addEventListener('click', changeMyPassword);

  /* ---------- Бічне меню ---------- */
  function allowed(item) {
    return item.roles.indexOf(user.role) !== -1 || (item.perm || []).some(function (p) { return (user.perms || []).indexOf(p) !== -1; });
  }
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
    side(false);
    renderNav();
    if (CATALOG_PANES.indexOf(id) !== -1) window.AdminCatalog.ensure();
    if (id === 'orders') renderOrders();
    if (id === 'accounting') renderAccounting();
    if (id === 'wholesale') renderWholesale();
    if (id === 'users') loadStaff();
    if (id === 'prices') window.AdminCatalog.ensure().then(function () { window.AdminCatalog.prices(); });
    window.scrollTo(0, 0);
  }
  $('nav').addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]');
    if (b) open(b.dataset.open);
  });
  // Мобільне бічне меню з розділами
  function side(open) {
    $('admSide').classList.toggle('open', open);
    $('admShade').hidden = !open;
    document.body.classList.toggle('noscroll', open);
  }
  $('admBurger').addEventListener('click', function () { side(true); });
  $('admClose').addEventListener('click', function () { side(false); });
  $('admShade').addEventListener('click', function () { side(false); });
  $('sideLogout').addEventListener('click', function () { $('logout').click(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') side(false); });
  // підписи колонок для карткового вигляду таблиць на телефоні
  function labelTables() {
    [].forEach.call(document.querySelectorAll('.adm .tbl'), function (t) {
      var heads = [].map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
      if (!heads.length) return;
      [].forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
        [].forEach.call(tr.children, function (td, i) { if (heads[i] && !td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i]); });
      });
    });
  }
  new MutationObserver(labelTables).observe(document.getElementById('app'), { childList: true, subtree: true });

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
      '<h5 class="wide">Оплата' + (a ? '' : ' (лише перегляд)') + ' · ' + esc(PAY[o.pay] || o.pay || '') + (o.pay === 'mono' ? ' · статус банку: ' + esc({ created: 'рахунок створено', processing: 'обробляється', hold: 'заблоковано', success: 'успішно', failure: 'помилка', reversed: 'повернуто', expired: 'прострочено' }[o.pay_status] || o.pay_status || 'немає') : '') + '</h5>' +
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
  // Ручне додавання оптового клієнта (одразу схвалений, зі знижкою)
  $('wsAdd').addEventListener('click', function () {
    ['wcLast', 'wcFirst', 'wcCompany', 'wcAddress', 'wcPhone', 'wcEmail', 'wcPass'].forEach(function (id) { $(id).value = ''; });
    $('wcType').value = ''; $('wcDisc').value = 5;
    status('wcStatus', '');
    $('wsModal').hidden = false;
  });
  $('wcGen').addEventListener('click', function () {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', p = '', a = new Uint32Array(10);
    crypto.getRandomValues(a);
    for (var i = 0; i < a.length; i++) p += abc[a[i] % abc.length];
    $('wcPass').value = p;
  });
  $('wsModal').addEventListener('click', function (e) {
    if (e.target === $('wsModal') || e.target.closest('[data-close]')) $('wsModal').hidden = true;
  });
  $('wsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = $('wcPhone').value.replace(/\D/g, ''); if (d.length === 10 && d[0] === '0') d = '38' + d;
    var f = {
      last_name: $('wcLast').value.trim(), first_name: $('wcFirst').value.trim(), business_type: $('wcType').value,
      company: $('wcCompany').value.trim(), address: $('wcAddress').value.trim(), phone: '+' + d,
      email: $('wcEmail').value.trim().toLowerCase(), password: $('wcPass').value, discount: parseFloat($('wcDisc').value)
    };
    if (!f.last_name || !f.first_name || !f.address) { status('wcStatus', 'Заповніть прізвище, ім\'я та адресу.', 'bad'); return; }
    if (!/^380\d{9}$/.test(d)) { status('wcStatus', 'Телефон у форматі +380XXXXXXXXX.', 'bad'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) { status('wcStatus', 'Вкажіть правильний e-mail.', 'bad'); return; }
    if (f.password.length < 8) { status('wcStatus', 'Пароль має містити щонайменше 8 символів.', 'bad'); return; }
    if (!(f.discount >= 0 && f.discount <= 90)) { status('wcStatus', 'Знижка має бути від 0 до 90%.', 'bad'); return; }
    status('wcStatus', 'Збереження…');
    var save = BE.enabled ? BE.staff('client_create', f) : (function () {
      var list = WSX.demoList();
      if (list.some(function (c) { return c.email === f.email; })) return Promise.reject(new Error('Клієнт із таким e-mail уже є.'));
      list.unshift({ id: 'w' + Date.now(), created_at: new Date().toISOString(), status: 'approved', discount: f.discount, approved_at: new Date().toISOString(),
        last_name: f.last_name, first_name: f.first_name, business_type: f.business_type, company: f.company, address: f.address, phone: f.phone, email: f.email });
      WSX.demoSave(list);
      return Promise.resolve();
    })();
    save.then(loadWholesale).then(function () {
      $('wsModal').hidden = true;
      wsTab = 'approved';
      renderWholesale(); renderNav();
      status('wsStatus', 'Клієнта ' + f.last_name + ' ' + f.first_name + ' додано зі знижкою ' + f.discount + '%. Дані для входу: ' + f.email + ' / ' + f.password + ' — передайте їх клієнту.', 'ok');
    }).catch(function (err) {
      status('wcStatus', /Failed to fetch|not found/i.test(err.message) ? 'Оновіть функцію staff-admin у Supabase (Edge Functions), щоб додавати клієнтів.' : err.message, 'bad');
    });
  });

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

  /* ---------- Працівники та доступи ---------- */
  var staff = [], editingStaff = null;
  // демо: список працівників живе лише в цьому браузері
  function demoStaff() {
    try { var v = JSON.parse(localStorage.getItem('winauto-admin-staff')); if (v) return v; } catch (e) {}
    return [
      { id: 'demo-admin', name: 'Адміністратор', email: 'admin@win-auto.com.ua', role: 'admin', perms: [], active: true },
      { id: 'demo-manager', name: 'Менеджер', email: 'manager@win-auto.com.ua', role: 'manager', perms: [], active: true },
      { id: 'demo-accountant', name: 'Бухгалтер', email: 'buh@win-auto.com.ua', role: 'accountant', perms: [], active: true }
    ];
  }
  function staffCall(action, data) {
    if (BE.enabled) return BE.staff(action, data);
    // демо-імітація серверної функції
    var list = demoStaff(), i = list.map(function (x) { return x.id; }).indexOf(data && data.id);
    if (action === 'list') return Promise.resolve(list);
    if (action === 'create') {
      if (list.some(function (x) { return x.email === data.email; })) return Promise.reject(new Error('Користувач із таким e-mail уже існує.'));
      list.push({ id: 'demo-' + Date.now(), name: data.name, email: data.email, role: data.role, perms: data.perms, active: true });
    } else if (action === 'update') {
      if (data.id === user.id && ((data.role && data.role !== 'admin') || data.active === false)) return Promise.reject(new Error('Не можна зняти права адміністратора із самого себе.'));
      ['name', 'role', 'perms', 'active'].forEach(function (k) { if (data[k] !== undefined) list[i][k] = data[k]; });
    } else if (action === 'delete') {
      if (data.id === user.id) return Promise.reject(new Error('Не можна видалити самого себе.'));
      list.splice(i, 1);
    }
    try { localStorage.setItem('winauto-admin-staff', JSON.stringify(list)); } catch (e) {}
    return Promise.resolve({ ok: true });
  }
  function loadStaff() {
    status('staffStatus', 'Завантаження…');
    staffCall('list').then(function (list) {
      staff = list.sort(function (a, b) { return ['admin', 'manager', 'accountant'].indexOf(a.role) - ['admin', 'manager', 'accountant'].indexOf(b.role); });
      status('staffStatus', BE.enabled ? '' : 'Демо-режим: працівники зберігаються лише в цьому браузері й увійти не можуть.');
      renderStaff();
    }).catch(function (err) {
      status('staffStatus', /Failed to fetch|404|not found/i.test(err.message)
        ? 'Не вдалося звернутися до серверної функції staff-admin. Перевірте, що її встановлено в Supabase (Edge Functions) і вимкнено Verify JWT.'
        : err.message, 'bad');
    });
  }
  var permLabel = function (p) { return (PERMS.filter(function (x) { return x[0] === p; })[0] || [p, p])[1]; };
  function renderStaff() {
    $('staffRows').innerHTML = staff.map(function (m) {
      var extra = (m.perms || []).filter(function (p) { return (ROLE_PERMS[m.role] || []).indexOf(p) === -1; });
      return '<tr data-staff="' + esc(m.id) + '"><td><b>' + esc(m.name || '') + '</b>' + (m.id === user.id ? ' <small>(ви)</small>' : '') + '<br><small>' + esc(m.email || '') + '</small></td>' +
        '<td>' + ROLES[m.role] + '</td>' +
        '<td>' + (m.role === 'admin' ? '<small>усі</small>' : extra.length ? extra.map(function (p) { return '<span class="tag">' + esc(permLabel(p)) + '</span>'; }).join(' ') : '<small>—</small>') + '</td>' +
        '<td>' + (m.active === false ? '<span class="tag tag--cancelled">вимкнено</span>' : '<span class="tag tag--done">активний</span>') + '</td>' +
        '<td class="acts"><button type="button" class="btn btn--sm btn--ghost">Редагувати</button></td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty">Працівників ще немає.</td></tr>';
  }
  function fillPerms(role, perms) {
    var base = ROLE_PERMS[role] || [];
    $('stPerms').innerHTML = PERMS.map(function (p) {
      var inRole = base.indexOf(p[0]) !== -1;
      return '<label><input type="checkbox" value="' + p[0] + '"' + (inRole || (perms || []).indexOf(p[0]) !== -1 ? ' checked' : '') + (inRole ? ' disabled' : '') + '><span>' +
        esc(p[1]) + (inRole ? ' — входить у роль' : '') + '</span></label>';
    }).join('');
  }
  function openStaff(m) {
    editingStaff = m || null;
    $('staffTitle').textContent = m ? 'Працівник: ' + (m.name || m.email) : 'Новий працівник';
    $('stName').value = m ? m.name || '' : '';
    $('stEmail').value = m ? m.email || '' : '';
    $('stEmail').disabled = !!m;
    $('stRole').value = m ? m.role : 'manager';
    $('stPass').value = '';
    $('stPassBox').hidden = !!m;
    $('stPassBtn').hidden = !m; $('stDelete').hidden = !m || m.id === user.id;
    $('stActiveBox').hidden = !m || m.id === user.id;
    $('stActive').checked = !m || m.active !== false;
    fillPerms($('stRole').value, m ? m.perms : []);
    status('stStatus', '');
    $('staffModal').hidden = false;
  }
  $('staffAdd').addEventListener('click', function () { openStaff(null); });
  $('staffRows').addEventListener('click', function (e) {
    var tr = e.target.closest('[data-staff]');
    if (tr) openStaff(staff.filter(function (m) { return m.id === tr.dataset.staff; })[0]);
  });
  $('stRole').addEventListener('change', function () {
    var cur = [].map.call($('stPerms').querySelectorAll('input:checked:not(:disabled)'), function (i) { return i.value; });
    fillPerms($('stRole').value, cur);
  });
  $('staffModal').addEventListener('click', function (e) {
    if (e.target === $('staffModal') || e.target.closest('[data-close]')) $('staffModal').hidden = true;
  });
  function staffDone(msg) {
    $('staffModal').hidden = true;
    loadStaff();
    setTimeout(function () { status('staffStatus', msg, 'ok'); }, 400);
  }
  $('staffForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var role = $('stRole').value;
    var perms = [].map.call($('stPerms').querySelectorAll('input:checked:not(:disabled)'), function (i) { return i.value; });
    var data = { name: $('stName').value.trim(), role: role, perms: perms };
    if (!data.name) { status('stStatus', 'Вкажіть ім\'я.', 'bad'); return; }
    if (!editingStaff) {
      data.email = $('stEmail').value.trim().toLowerCase();
      data.password = $('stPass').value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) { status('stStatus', 'Вкажіть правильний e-mail.', 'bad'); return; }
      if (data.password.length < 8) { status('stStatus', 'Пароль має містити щонайменше 8 символів.', 'bad'); return; }
    } else {
      data.id = editingStaff.id;
      if (editingStaff.id !== user.id) data.active = $('stActive').checked;
    }
    status('stStatus', 'Збереження…');
    staffCall(editingStaff ? 'update' : 'create', data).then(function () {
      staffDone(editingStaff ? 'Зміни збережено.' : 'Працівника додано. Передайте йому e-mail і пароль для входу.');
    }).catch(function (err) { status('stStatus', err.message, 'bad'); });
  });
  $('stPassBtn').addEventListener('click', function () {
    var p = prompt('Новий пароль для ' + (editingStaff.name || editingStaff.email) + ' (щонайменше 8 символів):');
    if (p == null) return;
    if (p.length < 8) { status('stStatus', 'Пароль має містити щонайменше 8 символів.', 'bad'); return; }
    staffCall('password', { id: editingStaff.id, password: p }).then(function () { status('stStatus', 'Пароль змінено.', 'ok'); })
      .catch(function (err) { status('stStatus', err.message, 'bad'); });
  });
  $('stDelete').addEventListener('click', function () {
    if (!confirm('Видалити працівника ' + (editingStaff.name || editingStaff.email) + '? Він більше не зможе увійти.')) return;
    staffCall('delete', { id: editingStaff.id }).then(function () { staffDone('Працівника видалено.'); })
      .catch(function (err) { status('stStatus', err.message, 'bad'); });
  });
})();

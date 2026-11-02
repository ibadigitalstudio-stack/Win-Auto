(function () {
  // Демо-кабінет: дані зберігаються лише в браузері користувача (localStorage).
  // Для входу з різних пристроїв потрібен сервер з реєстрацією та авторизацією.
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
  var opts = function (list, first) {
    return '<option value="">' + first + '</option>' + list.map(function (v) {
      return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
    }).join('');
  };

  var MODELS = {};
  var BRANDS = (window.BRANDS || []).map(function (b) { MODELS[b[0]] = b[1]; return b[0]; });
  var garage = store.get('garage', []);
  var editing = null; // id авто, яке редагується

  function setErr(name, msg) {
    var el = document.querySelector('[data-err="' + name + '"]');
    el.textContent = msg;
    el.closest('.fld').classList.toggle('bad', !!msg);
  }
  function catalogUrl(c) {
    return 'catalog.html?brand=' + encodeURIComponent(c.brand) + (c.model ? '&model=' + encodeURIComponent(c.model) : '');
  }

  /* ---------- Гараж ---------- */
  function renderCars() {
    $('cars').innerHTML = garage.map(function (c) {
      var meta = [];
      if (c.plate) meta.push('<span class="num">' + esc(c.plate) + '</span>');
      if (c.vin) meta.push('VIN: <span class="num">' + esc(c.vin) + '</span>');
      var extra = [c.engine, c.color].filter(Boolean).map(esc).join(' · ');
      return '<div class="car"><b>' + esc(c.brand + ' ' + c.model) + (c.year ? ', ' + esc(c.year) + ' р.' : '') + '</b>' +
        '<div class="car__meta">' + meta.join(' ') + (meta.length && extra ? '<br>' : '') + extra +
        (c.note ? '<br>' + esc(c.note) : '') + '</div>' +
        '<div class="car__btns"><a class="btn btn--sm" href="' + catalogUrl(c) + '">Підібрати запчастини</a>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-edit="' + c.id + '">Редагувати</button>' +
        '<button type="button" class="rm" data-del="' + c.id + '">Видалити</button></div></div>';
    }).join('') || '<p class="note" style="margin:0 0 14px">Тут поки порожньо. Додайте своє авто, щоб швидко підбирати до нього запчастини.</p>';
  }
  function fillModels(value) {
    var b = $('cBrand').value;
    $('cModel').innerHTML = opts(MODELS[b] || [], b ? 'Оберіть модель' : 'Спершу оберіть марку');
    $('cModel').disabled = !b;
    $('cModel').value = value || '';
  }
  function openForm(car) {
    editing = car ? car.id : null;
    $('carTitle').textContent = car ? 'Редагування авто' : 'Нове авто';
    car = car || {};
    $('cBrand').value = car.brand || '';
    fillModels(car.model);
    $('cYear').value = car.year || '';
    $('cPlate').value = car.plate || '';
    $('cVin').value = car.vin || '';
    $('cEngine').value = car.engine || '';
    $('cColor').value = car.color || '';
    $('cNote').value = car.note || '';
    ['brand', 'year', 'vin'].forEach(function (n) { setErr(n, ''); });
    $('carForm').hidden = false;
    $('addCar').hidden = true;
    $('carForm').scrollIntoView({ block: 'nearest' });
  }
  function closeForm() { $('carForm').hidden = true; $('addCar').hidden = false; editing = null; }

  $('cBrand').innerHTML = opts(BRANDS, 'Оберіть марку');
  $('cBrand').addEventListener('change', function () { fillModels(''); setErr('brand', ''); });
  $('addCar').addEventListener('click', function () { openForm(null); });
  $('cancelCar').addEventListener('click', closeForm);

  $('carForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var year = $('cYear').value.trim(), vin = $('cVin').value.toUpperCase().replace(/[^0-9A-Z]/g, ''), ok = true;
    var check = function (name, msg) { setErr(name, msg); if (msg) ok = false; };
    check('brand', $('cBrand').value ? '' : 'Оберіть марку');
    check('year', !year || (/^\d{4}$/.test(year) && +year >= 1980 && +year <= new Date().getFullYear() + 1) ? '' : 'Вкажіть рік чотирма цифрами');
    check('vin', !vin || /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? '' : 'VIN — це 17 латинських літер і цифр без I, O, Q');
    if (!ok) return;
    var car = {
      id: editing || 'c' + Date.now(),
      brand: $('cBrand').value, model: $('cModel').value, year: year,
      plate: $('cPlate').value.trim().toUpperCase(), vin: vin,
      engine: $('cEngine').value.trim(), color: $('cColor').value.trim(), note: $('cNote').value.trim()
    };
    var i = garage.map(function (c) { return c.id; }).indexOf(car.id);
    if (i === -1) garage.push(car); else garage[i] = car;
    store.set('garage', garage);
    closeForm();
    renderCars();
  });

  $('cars').addEventListener('click', function (e) {
    var t = e.target.closest('[data-edit],[data-del]');
    if (!t) return;
    var id = t.dataset.edit || t.dataset.del;
    var car = garage.filter(function (c) { return c.id === id; })[0];
    if (t.dataset.edit) { openForm(car); return; }
    if (!confirm('Видалити ' + car.brand + ' ' + car.model + ' з гаража?')) return;
    garage = garage.filter(function (c) { return c.id !== id; });
    store.set('garage', garage);
    if (editing === id) closeForm();
    renderCars();
  });

  /* ---------- Профіль ---------- */
  var profile = store.get('profile', {});
  $('pFirst').value = profile.first || '';
  $('pLast').value = profile.last || '';
  $('pPhone').value = profile.phone || '';
  $('pEmail').value = profile.email || '';
  $('profile').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = $('pPhone').value.replace(/\D/g, '');
    if (d.length === 10 && d[0] === '0') d = '38' + d;
    var bad = $('pPhone').value.trim() && !/^380\d{9}$/.test(d);
    setErr('phone', bad ? 'Вкажіть номер у форматі +380XXXXXXXXX' : '');
    if (bad) return;
    store.set('profile', {
      first: $('pFirst').value.trim(), last: $('pLast').value.trim(),
      phone: d ? '+' + d : '', email: $('pEmail').value.trim()
    });
    $('pSaved').textContent = '✓ Збережено';
    setTimeout(function () { $('pSaved').textContent = ''; }, 2500);
  });
  $('wipe').addEventListener('click', function () {
    if (!confirm('Видалити профіль, гараж та історію замовлень із цього браузера?')) return;
    ['profile', 'garage', 'orders'].forEach(function (k) { try { localStorage.removeItem('winauto-' + k); } catch (e) {} });
    location.reload();
  });

  /* ---------- Замовлення ---------- */
  // Оптовий клієнт, що увійшов, бачить лише свої замовлення з сервера (з будь-якого пристрою);
  // гість — замовлення, оформлені в цьому браузері
  var ORDER_STATUS = { 'new': 'нове', confirmed: 'підтверджене', shipped: 'відправлене', done: 'виконане', cancelled: 'скасоване' };
  function orderRow(o, date) {
    var n = (o.items || []).reduce(function (s, i) { return s + (+i.qty || 0); }, 0);
    return '<div class="order"><b>' + esc(o.id) + '</b>' + new Date(date).toLocaleDateString('uk-UA') +
      ' · ' + n + ' шт. · ' + Math.round(o.total).toLocaleString('uk-UA') + ' грн' +
      (o.status ? ' · <b style="margin:0">' + esc(ORDER_STATUS[o.status] || o.status) + '</b>' : '') +
      (o.paid ? ' · оплачено' : '') +
      '<small>' + esc([o.carrier, o.city, o.warehouse].filter(Boolean).join(', ')) + (o.ttn ? ' · ТТН ' + esc(o.ttn) : '') + '</small></div>';
  }
  function renderMyOrders() {
    var WSo = window.WAWholesale, BEo = window.WABackend;
    if (BEo && BEo.enabled && WSo && WSo.current()) {
      $('orders').innerHTML = '<p class="note" style="margin:0">Завантаження…</p>';
      BEo.myOrders().then(function (list) {
        $('orders').innerHTML = list.map(function (o) { return orderRow(o, o.created_at); }).join('') ||
          '<p class="note" style="margin:0">Замовлень ще немає.</p>';
      }).catch(function () { $('orders').innerHTML = '<p class="note" style="margin:0">Не вдалося завантажити замовлення. Оновіть сторінку.</p>'; });
      return;
    }
    var local = store.get('orders', []).slice().reverse();
    $('orders').innerHTML = local.map(function (o) { return orderRow(o, o.date); }).join('') || '<p class="note" style="margin:0">Замовлень ще немає.</p>';
  }
  renderMyOrders();

  /* ---------- Шапка ---------- */
  $('themeBtn').addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('winauto-theme', next); } catch (e) {}
  });
  $('year').textContent = new Date().getFullYear();
  renderCars();

  /* ---------- Оптові клієнти ---------- */
  var WS = window.WAWholesale, BE = window.WABackend;
  var STAT = { pending: 'на модерації', approved: 'схвалено', rejected: 'відхилено' };
  function wsForm(mode) {
    var server = BE && BE.enabled;
    if (mode === 'login') {
      $('wsBody').innerHTML = '<form id="wsLogin" class="form" novalidate>' +
        '<input id="wlEmail" type="email" placeholder="E-mail" autocomplete="username">' +
        '<input id="wlPass" type="password" placeholder="Пароль" autocomplete="current-password">' +
        '<button class="btn btn--wide" type="submit">Увійти</button></form>' +
        '<p class="note"><button type="button" class="rm" style="display:inline" data-ws="apply">Подати заявку</button></p><p class="status" id="wsStatus"></p>';
      return;
    }
    $('wsBody').innerHTML = '<form id="wsApply" class="form" novalidate>' +
      '<div class="row2"><input id="wLast" placeholder="Прізвище *" autocomplete="family-name"><input id="wFirst" placeholder="Ім\'я *" autocomplete="given-name"></div>' +
      '<select id="wType"><option value="">Тип діяльності *</option>' + ['СТО', 'Розборка', 'Інтернет-магазин', 'Дилер', 'Автопарк'].map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select>' +
      '<input id="wCompany" placeholder="Назва фірми (якщо є)" autocomplete="organization">' +
      '<input id="wAddress" placeholder="Адреса *" autocomplete="street-address">' +
      '<div class="row2"><input id="wPhone" type="tel" placeholder="Телефон *" autocomplete="tel"><input id="wEmail" type="email" placeholder="E-mail *" autocomplete="email"></div>' +
      (server ? '<input id="wPass" type="password" placeholder="Пароль для входу (мін. 8 символів) *" autocomplete="new-password">' : '') +
      '<button class="btn btn--wide" type="submit">Надіслати заявку</button></form>' +
      '<p class="note">Заявку розгляне адміністратор і призначить вашу оптову знижку.' + (server ? ' <button type="button" class="rm" style="display:inline" data-ws="login">Уже маєте акаунт? Увійти</button>' : '') + '</p>' +
      '<p class="status" id="wsStatus"></p>';
    var p = store.get('profile', {});
    if (p.first) $('wFirst').value = p.first;
    if (p.last) $('wLast').value = p.last;
    if (p.phone) $('wPhone').value = p.phone;
    if (p.email) $('wEmail').value = p.email;
  }
  function wsMsg(t, bad) { var el = $('wsStatus'); if (el) { el.textContent = t; el.style.color = bad ? 'var(--accent)' : ''; } }
  function wsRender() {
    renderMyOrders();
    var c = WS.current();
    if (!c) {
      $('wsBody').innerHTML = '<p class="note" style="margin:0 0 12px">СТО, магазинам і постійним покупцям — індивідуальна знижка на всі товари. Зареєструйтеся як оптовий клієнт: після перевірки адміністратор призначить вашу знижку.</p>' +
        '<button type="button" class="btn" data-ws="apply">Зареєструватися як оптовий клієнт</button>' +
        (BE && BE.enabled ? ' <button type="button" class="btn btn--ghost" data-ws="login">Увійти</button>' : '');
      return;
    }
    var info = '<p style="margin:0 0 6px"><b>' + esc(c.last_name + ' ' + c.first_name) + '</b>' + (c.business_type ? ' · ' + esc(c.business_type) : '') + (c.company ? ' · ' + esc(c.company) : '') + '</p>' +
      '<p class="note" style="margin:0 0 12px">' + esc(c.address) + ' · ' + esc(c.phone) + ' · ' + esc(c.email) + '</p>';
    var st = c.status === 'approved'
      ? '<p style="margin:0 0 12px">Статус: <b style="color:var(--ok)">оптовий клієнт</b>. Ваша знижка: <b style="font-size:20px">' + (+c.discount || 0) + '%</b> — вона вже врахована в цінах каталогу та кошика.</p>'
      : c.status === 'rejected'
        ? '<p style="margin:0 0 12px">Заявку <b>відхилено</b>. Якщо це помилка, зв\'яжіться з нами.</p>'
        : '<p style="margin:0 0 12px">Заявка <b>на модерації</b>. Після схвалення тут з\'явиться ваша знижка.</p>';
    $('wsBody').innerHTML = st + info +
      (BE && BE.enabled ? '<button type="button" class="rm" style="display:inline;margin-right:16px" data-ws="pass">Змінити пароль</button>' : '') +
      '<button type="button" class="rm" style="display:inline" data-ws="out">' + (BE && BE.enabled ? 'Вийти' : 'Скасувати заявку на цьому пристрої') + '</button>' +
      '<div id="wsPassBox"></div>';
  }
  $('wsBox').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ws]');
    if (!b) return;
    if (b.dataset.ws === 'out') { WS.signOut(); wsRender(); }
    else if (b.dataset.ws === 'pass') {
      // форма зміни пароля (поля з autocomplete, щоб браузер оновив збережений пароль)
      $('wsPassBox').innerHTML = '<form id="wsPass" class="form" style="margin-top:14px" novalidate>' +
        '<input type="email" autocomplete="username" value="' + esc((WS.current() || {}).email || '') + '" hidden>' +
        '<input id="wpCur" type="password" placeholder="Чинний пароль" autocomplete="current-password">' +
        '<input id="wpNew" type="password" placeholder="Новий пароль (мін. 8 символів)" autocomplete="new-password">' +
        '<input id="wpNew2" type="password" placeholder="Повторіть новий пароль" autocomplete="new-password">' +
        '<button class="btn btn--wide" type="submit">Зберегти новий пароль</button></form><p class="status" id="wsStatus"></p>';
      $('wpCur').focus();
    }
    else wsForm(b.dataset.ws);
  });
  $('wsBox').addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'wsPass') {
      var cur = $('wpCur').value, next = $('wpNew').value;
      if (!cur) { wsMsg('Введіть чинний пароль.', true); return; }
      if (next.length < 8) { wsMsg('Новий пароль має містити щонайменше 8 символів.', true); return; }
      if (next !== $('wpNew2').value) { wsMsg('Нові паролі не збігаються.', true); return; }
      wsMsg('Збереження…');
      BE.changePassword(cur, next).then(function () {
        $('wsPassBox').innerHTML = '<p class="note" style="color:var(--ok);margin-top:12px">✓ Пароль змінено.</p>';
      }).catch(function (err) { wsMsg(err.message, true); });
      return;
    }
    if (e.target.id === 'wsLogin') {
      wsMsg('Вхід…');
      WS.signIn($('wlEmail').value.trim(), $('wlPass').value).then(wsRender)
        .catch(function (err) { wsMsg(err.message === 'Invalid login credentials' ? 'Невірний e-mail або пароль.' : err.message, true); });
      return;
    }
    var f = {
      last_name: $('wLast').value.trim(), first_name: $('wFirst').value.trim(), business_type: $('wType').value, company: $('wCompany').value.trim(),
      address: $('wAddress').value.trim(), phone: $('wPhone').value.trim(), email: $('wEmail').value.trim(),
      password: $('wPass') ? $('wPass').value : ''
    };
    var d = f.phone.replace(/\D/g, ''); if (d.length === 10 && d[0] === '0') d = '38' + d;
    if (!f.last_name || !f.first_name || !f.address) { wsMsg('Заповніть прізвище, ім\'я та адресу.', true); return; }
    if (!f.business_type) { wsMsg('Оберіть тип діяльності.', true); return; }
    if (!/^380\d{9}$/.test(d)) { wsMsg('Вкажіть телефон у форматі +380XXXXXXXXX.', true); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) { wsMsg('Вкажіть правильний e-mail.', true); return; }
    if ($('wPass') && f.password.length < 8) { wsMsg('Пароль має містити щонайменше 8 символів.', true); return; }
    f.phone = '+' + d;
    wsMsg('Надсилання…');
    WS.register(f).then(wsRender).catch(function (err) { wsMsg(err.message, true); });
  });
  if (WS) { wsRender(); WS.refresh().then(wsRender).catch(function () {}); } else $('wsBox').hidden = true;
})();

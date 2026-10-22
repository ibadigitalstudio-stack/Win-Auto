// Підключення сервера замовлень і входу в адмін-панель (Supabase).
// Поки url і key порожні, сайт працює в демо-режимі: замовлення лишаються в браузері покупця,
// а в адмін-панелі вхід без пароля з вибором ролі.
// Після створення проєкту Supabase впишіть сюди Project URL і публічний ключ (anon / publishable key).
// Це не секрет: ключ призначений для сайту, а доступ до даних обмежують правила з файлу supabase-setup.sql.
window.BACKEND = { url: 'https://qqlnhbnhkzvhlsxgmfxl.supabase.co', key: 'sb_publishable_arCc0EGMW4ivOiBlf1zH6w__Vc1i93p' };
// Онлайн-оплата monobank: true — після налаштування функцій mono-invoice та mono-webhook у Supabase
window.BACKEND.mono = true;

// Спільний клієнт для сайту та адмін-панелі
window.WABackend = (function () {
  var B = window.BACKEND || {}, session = null, sessionKey = null;
  var on = !!(B.url && B.key);
  var base = (B.url || '').replace(/\/$/, '');

  // Сесії зберігаються в браузері: оптового клієнта — завжди, працівника — якщо він обрав «Не виходити»
  var CLIENT = 'winauto-client', STAFF = 'winauto-staff-session';
  function save(key, s) { try { s ? localStorage.setItem(key, JSON.stringify(s)) : localStorage.removeItem(key); } catch (e) {} }
  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function use(s, key) { session = s; sessionKey = key || null; if (key) save(key, s); }

  function raw(path, method, body, token, extra) {
    var headers = { 'apikey': B.key, 'Authorization': 'Bearer ' + (token || B.key), 'Content-Type': 'application/json' };
    Object.keys(extra || {}).forEach(function (k) { headers[k] = extra[k]; });
    return fetch(base + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var data = null;
          try { data = t ? JSON.parse(t) : null; } catch (e) { data = { message: t }; }
          if (!r.ok) throw new Error((data && (data.error_description || data.msg || data.message || data.error)) || ('Помилка сервера ' + r.status));
          return data;
        });
      });
  }
  // Сесія діє годину; за хвилину до кінця непомітно оновлюємо її
  var refreshing = null;
  function fresh() {
    if (!session || !session.refresh_token) return Promise.resolve();
    var exp = (session.expires_at || 0) * 1000;
    if (exp && exp - Date.now() > 60000) return Promise.resolve();
    refreshing = refreshing || raw('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: session.refresh_token })
      .then(function (s) { use(s, sessionKey); })
      .catch(function (err) { if (sessionKey) save(sessionKey, null); session = null; throw new Error('Сесія завершилась. Увійдіть знову.'); })
      .then(function () { refreshing = null; }, function (e) { refreshing = null; throw e; });
    return refreshing;
  }
  function call(path, method, body, extra) {
    return fresh().then(function () { return raw(path, method, body, session && session.access_token, extra); });
  }
  function signIn(email, password) {
    return raw('/auth/v1/token?grant_type=password', 'POST', { email: email, password: password });
  }
  function staffProfile() {
    return call('/rest/v1/profiles?select=*&id=eq.' + session.user.id).then(function (rows) {
      if (!rows.length) throw new Error('Для цього користувача не призначено роль.');
      if (rows[0].active === false) throw new Error('Обліковий запис вимкнено адміністратором.');
      return { id: session.user.id, email: session.user.email, role: rows[0].role, perms: rows[0].perms || [], name: rows[0].name || session.user.email };
    });
  }

  return {
    enabled: on,
    // покупець: зберегти нове замовлення (правила дозволяють лише додавання)
    createOrder: function (o) {
      var client = load(CLIENT);
      if (client && !session) use(client, CLIENT);
      return call('/rest/v1/orders', 'POST', {
        id: o.id, created_at: o.date, name: o.name, phone: o.phone, carrier: o.carrier, city: o.city, warehouse: o.warehouse,
        pay: o.pay, note: o.note, items: o.items, total: o.total, total_base: o.total_base, discount: o.discount || 0,
        customer_id: session && sessionKey === CLIENT ? session.user.id : null
      }, { 'Prefer': 'return=minimal' });
    },
    // онлайн-оплата monobank: рахунок створює серверна функція (там же перевіряється сума)
    monoEnabled: on && !!B.mono,
    monoInvoice: function (orderId) { return call('/functions/v1/mono-invoice', 'POST', { orderId: orderId }); },
    monoStatus: function (orderId) { return call('/functions/v1/mono-invoice', 'POST', { orderId: orderId, check: true }); },

    // --- працівники ---
    // вхід за e-mail і паролем; remember — не виходити на цьому пристрої
    login: function (email, password, remember) {
      try { localStorage.removeItem(STAFF); } catch (e) {}
      return signIn(email, password).then(function (s) {
        use(s, remember ? STAFF : null);
        return staffProfile();
      }).catch(function (err) { session = null; save(STAFF, null); throw err; });
    },
    // відновити збережений вхід працівника після перезавантаження сторінки
    restoreStaff: function () {
      var s = load(STAFF);
      if (!s) return Promise.resolve(null);
      use(s, STAFF);
      return staffProfile().catch(function () { save(STAFF, null); session = null; return null; });
    },
    logout: function () { session = null; save(STAFF, null); },
    // керування працівниками (серверна функція staff-admin)
    staff: function (action, data) {
      var body = { action: action };
      Object.keys(data || {}).forEach(function (k) { body[k] = data[k]; });
      return call('/functions/v1/staff-admin', 'POST', body);
    },
    listOrders: function () { return call('/rest/v1/orders?select=*&order=created_at.desc&limit=2000'); },
    deleteOrder: function (id) {
      return call('/rest/v1/orders?id=eq.' + encodeURIComponent(id), 'DELETE', null, { 'Prefer': 'return=representation' }).then(function (rows) {
        if (!rows || !rows.length) throw new Error('Замовлення не видалено: немає права або його вже немає.');
      });
    },
    // оптовий клієнт: лише власні замовлення (правило сервера «client reads own orders»)
    myOrders: function () {
      var s = load(CLIENT);
      if (!s) return Promise.resolve([]);
      use(s, CLIENT);
      return call('/rest/v1/orders?select=id,created_at,items,total,discount,status,ttn,paid,pay,carrier,city,warehouse&customer_id=eq.' + s.user.id + '&order=created_at.desc');
    },
    updateOrder: function (id, patch) {
      return call('/rest/v1/orders?id=eq.' + encodeURIComponent(id), 'PATCH', patch, { 'Prefer': 'return=minimal' });
    },

    // --- оптові клієнти ---
    // реєстрація: акаунт + заявка зі статусом «на модерації»
    signUpWholesale: function (f) {
      return raw('/auth/v1/signup', 'POST', { email: f.email, password: f.password }).then(function (s) {
        if (!s.access_token) throw new Error('Підтвердіть e-mail за посиланням у листі, а потім увійдіть, щоб заявка надійшла на розгляд.');
        use(s, CLIENT);
        return call('/rest/v1/wholesale_clients', 'POST', {
          id: s.user.id, last_name: f.last_name, first_name: f.first_name, business_type: f.business_type, company: f.company, address: f.address, phone: f.phone, email: f.email
        }, { 'Prefer': 'return=minimal' });
      });
    },
    signInClient: function (email, password) {
      return signIn(email, password).then(function (s) { use(s, CLIENT); });
    },
    // поточний клієнт (якщо входив на цьому пристрої) та його заявка
    myWholesale: function () {
      var s = load(CLIENT);
      if (!s) return Promise.resolve(null);
      use(s, CLIENT);
      return call('/rest/v1/wholesale_clients?select=*&id=eq.' + s.user.id).then(function (rows) { return rows[0] || null; })
        .catch(function () { save(CLIENT, null); session = null; return null; });
    },
    signOutClient: function () { save(CLIENT, null); session = null; },
    // зміна пароля поточного користувача: спершу перевіряємо чинний пароль
    changePassword: function (current, next) {
      if (!session) return Promise.reject(new Error('Увійдіть знову.'));
      var key = sessionKey;
      return signIn(session.user.email, current).catch(function () { throw new Error('Чинний пароль введено неправильно.'); })
        .then(function (s) { use(s, key); return call('/auth/v1/user', 'PUT', { password: next }); });
    },
    listWholesale: function () { return call('/rest/v1/wholesale_clients?select=*&order=created_at.desc'); },
    updateWholesale: function (id, patch) {
      return call('/rest/v1/wholesale_clients?id=eq.' + encodeURIComponent(id), 'PATCH', patch, { 'Prefer': 'return=minimal' });
    }
  };
})();

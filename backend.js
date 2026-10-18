// Підключення сервера замовлень і входу в адмін-панель (Supabase).
// Поки url і key порожні, сайт працює в демо-режимі: замовлення лишаються в браузері покупця,
// а в адмін-панелі вхід без пароля з вибором ролі.
// Після створення проєкту Supabase впишіть сюди Project URL і публічний ключ (anon / publishable key).
// Це не секрет: ключ призначений для сайту, а доступ до даних обмежують правила з файлу supabase-setup.sql.
window.BACKEND = { url: '', key: '' };

// Спільний клієнт для сторінки оформлення замовлення та адмін-панелі
window.WABackend = (function () {
  var B = window.BACKEND || {}, session = null;
  // сесія оптового клієнта на сайті (зберігається в браузері клієнта)
  function saveClient(s) { try { s ? localStorage.setItem('winauto-client', JSON.stringify(s)) : localStorage.removeItem('winauto-client'); } catch (e) {} }
  function loadClient() { try { return JSON.parse(localStorage.getItem('winauto-client')); } catch (e) { return null; } }
  var on = !!(B.url && B.key);
  function call(path, method, body, extra) {
    var headers = { 'apikey': B.key, 'Authorization': 'Bearer ' + (session ? session.access_token : B.key), 'Content-Type': 'application/json' };
    Object.keys(extra || {}).forEach(function (k) { headers[k] = extra[k]; });
    return fetch(B.url.replace(/\/$/, '') + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var data = t ? JSON.parse(t) : null;
          if (!r.ok) throw new Error((data && (data.error_description || data.msg || data.message)) || ('Помилка сервера ' + r.status));
          return data;
        });
      });
  }
  return {
    enabled: on,
    // покупець: зберегти нове замовлення (правила дозволяють лише додавання)
    createOrder: function (o) {
      return call('/rest/v1/orders', 'POST', {
        id: o.id, created_at: o.date, name: o.name, phone: o.phone, carrier: o.carrier, city: o.city, warehouse: o.warehouse,
        pay: o.pay, note: o.note, items: o.items, total: o.total, total_base: o.total_base, discount: o.discount || 0,
        customer_id: (loadClient() || { user: {} }).user.id || null
      }, { 'Prefer': 'return=minimal' });
    },
    // співробітник: вхід за e-mail і паролем, роль береться з таблиці profiles
    login: function (email, password) {
      return call('/auth/v1/token?grant_type=password', 'POST', { email: email, password: password }).then(function (s) {
        session = s;
        return call('/rest/v1/profiles?select=role,name&id=eq.' + s.user.id);
      }).then(function (rows) {
        if (!rows.length) { session = null; throw new Error('Для цього користувача не призначено роль.'); }
        return { email: session.user.email, role: rows[0].role, name: rows[0].name || session.user.email };
      });
    },
    logout: function () { session = null; },
    listOrders: function () { return call('/rest/v1/orders?select=*&order=created_at.desc&limit=2000'); },
    // --- оптові клієнти ---
    // реєстрація: акаунт + заявка зі статусом «на модерації»
    signUpWholesale: function (f) {
      return call('/auth/v1/signup', 'POST', { email: f.email, password: f.password }).then(function (s) {
        if (!s.access_token) throw new Error('Підтвердіть e-mail за посиланням у листі, а потім увійдіть, щоб заявка надійшла на розгляд.');
        session = s; saveClient(s);
        return call('/rest/v1/wholesale_clients', 'POST', {
          id: s.user.id, last_name: f.last_name, first_name: f.first_name, business_type: f.business_type, company: f.company, address: f.address, phone: f.phone, email: f.email
        }, { 'Prefer': 'return=minimal' });
      });
    },
    signInClient: function (email, password) {
      return call('/auth/v1/token?grant_type=password', 'POST', { email: email, password: password }).then(function (s) { session = s; saveClient(s); });
    },
    // поточний клієнт (якщо входив на цьому пристрої) та його заявка
    myWholesale: function () {
      var s = loadClient();
      if (!s) return Promise.resolve(null);
      session = s;
      return call('/rest/v1/wholesale_clients?select=*&id=eq.' + s.user.id).then(function (rows) { return rows[0] || null; })
        .catch(function () { saveClient(null); session = null; return null; });
    },
    signOutClient: function () { saveClient(null); session = null; },
    listWholesale: function () { return call('/rest/v1/wholesale_clients?select=*&order=created_at.desc'); },
    updateWholesale: function (id, patch) {
      return call('/rest/v1/wholesale_clients?id=eq.' + encodeURIComponent(id), 'PATCH', patch, { 'Prefer': 'return=minimal' });
    },
    updateOrder: function (id, patch) {
      return call('/rest/v1/orders?id=eq.' + encodeURIComponent(id), 'PATCH', patch, { 'Prefer': 'return=minimal' });
    }
  };
})();

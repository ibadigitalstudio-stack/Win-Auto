// Підключення сервера замовлень і входу в адмін-панель (Supabase).
// Поки url і key порожні, сайт працює в демо-режимі: замовлення лишаються в браузері покупця,
// а в адмін-панелі вхід без пароля з вибором ролі.
// Після створення проєкту Supabase впишіть сюди Project URL і публічний ключ (anon / publishable key).
// Це не секрет: ключ призначений для сайту, а доступ до даних обмежують правила з файлу supabase-setup.sql.
window.BACKEND = { url: '', key: '' };

// Спільний клієнт для сторінки оформлення замовлення та адмін-панелі
window.WABackend = (function () {
  var B = window.BACKEND || {}, session = null;
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
        pay: o.pay, note: o.note, items: o.items, total: o.total
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
    updateOrder: function (id, patch) {
      return call('/rest/v1/orders?id=eq.' + encodeURIComponent(id), 'PATCH', patch, { 'Prefer': 'return=minimal' });
    }
  };
})();

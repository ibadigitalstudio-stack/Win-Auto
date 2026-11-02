// Оптові клієнти на сайті: статус заявки та знижка поточного клієнта.
// З сервером (backend.js) дані беруться з Supabase; без нього — демо в межах цього браузера.
window.WAWholesale = (function () {
  var BE = window.WABackend;
  var LIST = 'winauto-wholesale-list', ME = 'winauto-wholesale-me';
  var get = function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  var set = function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  var me = null;
  // синхронно: знижка з останнього відомого стану (щоб ціни одразу показувались правильно)
  var cached = get('winauto-wholesale-cache', null);

  function demoMe() {
    var id = get(ME, null);
    return id ? (get(LIST, []).filter(function (c) { return c.id === id; })[0] || null) : null;
  }
  function refresh() {
    var p = BE && BE.enabled ? BE.myWholesale() : Promise.resolve(demoMe());
    return p.then(function (c) {
      me = c;
      cached = c ? { status: c.status, discount: +c.discount || 0, name: c.first_name } : null;
      set('winauto-wholesale-cache', cached);
      return c;
    });
  }
  return {
    demo: !(BE && BE.enabled),
    refresh: refresh,
    current: function () { return me; },
    // знижка у відсотках; діє лише для схваленого клієнта
    discount: function () { return cached && cached.status === 'approved' ? Math.max(0, Math.min(90, cached.discount)) : 0; },
    apply: function (price) {
      var d = this.discount();
      return d ? Math.round(price * (100 - d)) / 100 : price;
    },
    register: function (f) {
      if (BE && BE.enabled) return BE.signUpWholesale(f).then(refresh);
      var list = get(LIST, []), c = {
        id: 'w' + Date.now(), created_at: new Date().toISOString(), status: 'pending', discount: 0,
        last_name: f.last_name, first_name: f.first_name, business_type: f.business_type, company: f.company, address: f.address, phone: f.phone, email: f.email
      };
      list.unshift(c); set(LIST, list); set(ME, c.id);
      return refresh();
    },
    signIn: function (email, password) { return BE.signInClient(email, password).then(refresh); },
    signOut: function () {
      if (BE && BE.enabled) BE.signOutClient(); else set(ME, null);
      set('winauto-wholesale-cache', null); cached = null; me = null;
    },
    // для адмін-панелі в демо-режимі
    demoList: function () { return get(LIST, []); },
    demoSave: function (list) { set(LIST, list); }
  };
})();

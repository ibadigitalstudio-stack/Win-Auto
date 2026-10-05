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
  var orders = store.get('orders', []).slice().reverse();
  $('orders').innerHTML = orders.map(function (o) {
    var n = o.items.reduce(function (s, i) { return s + i.qty; }, 0);
    return '<div class="order"><b>' + esc(o.id) + '</b>' + new Date(o.date).toLocaleDateString('uk-UA') +
      ' · ' + n + ' шт. · ' + Math.round(o.total).toLocaleString('uk-UA') + ' грн' +
      '<small>' + esc(o.carrier + ', ' + o.city + ', ' + o.warehouse) + '</small></div>';
  }).join('') || '<p class="note" style="margin:0">Замовлень ще немає.</p>';

  /* ---------- Шапка ---------- */
  $('themeBtn').addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('winauto-theme', next); } catch (e) {}
  });
  $('year').textContent = new Date().getFullYear();
  renderCars();
})();

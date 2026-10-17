// Адмін-панель Win Auto.
// Сайт статичний, тому зміни зберігаються комітом у репозиторій GitHub через його API.
// Ключ доступу вводить власник сайту; він лишається в браузері й надсилається лише на api.github.com.
(function () {
  var API = 'https://api.github.com';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var opts = function (list, first) {
    return (first == null ? '' : '<option value="">' + esc(first) + '</option>') + list.map(function (v) {
      return '<option value="' + esc(v[0]) + '">' + esc(v[1]) + '</option>';
    }).join('');
  };
  var slug = function (b) { return b.toLowerCase().replace(/[^a-z0-9]+/g, '-'); };
  var PAGE = 60;

  var cfg = { owner: '', repo: '', token: '', branch: 'main' };
  var core = null;           // вміст products.js: BRANDS, CATS, COUNTS, FEATURED, RATES
  var site = null;           // вміст site.js
  var lists = {};            // марка -> масив товарів (завантажені)
  var dirty = {};            // марка -> true, якщо її товари змінено
  var changedIds = {};       // id змінених товарів (для підсвічування)
  var images = {};           // шлях у репозиторії -> base64 нового фото
  var previews = {};         // шлях -> dataURL для показу до публікації
  var siteDirty = false;
  var shown = PAGE, editing = null, newPhoto = null;
  var demo = false;          // перегляд без ключа: дані читаються із сайту, публікація вимкнена

  /* ---------- GitHub ---------- */
  function gh(path, method, body, raw) {
    return fetch(API + '/repos/' + cfg.owner + '/' + cfg.repo + path, {
      method: method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = r.status === 401 ? 'Ключ доступу не підходить або прострочений.'
            : r.status === 403 ? 'Ключ не має прав на запис у цей репозиторій (потрібно Contents: Read and write).'
            : r.status === 404 ? 'Репозиторій або файл не знайдено. Перевірте власника, назву та доступ ключа.'
            : 'Помилка GitHub ' + r.status + ': ' + t.slice(0, 160);
          throw new Error(msg);
        });
      }
      return raw ? r.text() : r.json();
    });
  }
  // свіжий вміст файлу просто з репозиторію (а не із закешованого сайту)
  function readFile(path) {
    if (demo) return fetch(path + '?t=' + Date.now()).then(function (r) { if (!r.ok) throw new Error('Не вдалося завантажити ' + path); return r.text(); });
    return gh('/contents/' + path + '?ref=' + cfg.branch + '&t=' + Date.now(), 'GET', null, true);
  }
  function evalData(text) { return new Function('var window={};' + text + ';return window;')(); }

  /* ---------- Стан і повідомлення ---------- */
  function status(id, text, kind) {
    var el = $(id);
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  function pendingCount() { return Object.keys(changedIds).length + (siteDirty ? 1 : 0); }
  function renderBar() {
    var n = pendingCount();
    $('bar').hidden = !n;
    $('pending').textContent = 'Неопубліковані зміни: ' + n;
  }
  window.addEventListener('beforeunload', function (e) {
    if (pendingCount()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- Підключення ---------- */
  try {
    var saved = JSON.parse(localStorage.getItem('winauto-admin') || sessionStorage.getItem('winauto-admin') || 'null');
    if (saved) {
      $('owner').value = saved.owner; $('repo').value = saved.repo; $('token').value = saved.token;
      $('remember').checked = !!localStorage.getItem('winauto-admin');
    }
  } catch (e) {}

  function start() {
    return Promise.all([readFile('products.js'), readFile('site.js')]).then(function (files) {
      core = evalData(files[0]);
      site = evalData(files[1]).SITE || {};
      $('aBrand').innerHTML = opts(core.BRANDS.map(function (b) { return [b[0], b[0]]; }), 'Оберіть марку');
      fillSettings();
      renderRows();
    });
  }
  window.AdminCatalog = window.AdminCatalog || {};
  $('connect').addEventListener('submit', function (e) {
    e.preventDefault();
    cfg.owner = $('owner').value.trim();
    cfg.repo = $('repo').value.trim();
    cfg.token = $('token').value.trim();
    if (!cfg.owner || !cfg.repo || !cfg.token) { status('connStatus', 'Заповніть усі три поля.', 'bad'); return; }
    status('connStatus', 'Підключення…');
    gh('').then(function (info) {
      if (!info.permissions || !info.permissions.push) throw new Error('Ключ не має прав на запис у цей репозиторій (потрібно Contents: Read and write).');
      cfg.branch = info.default_branch || 'main';
      demo = false; core = null; lists = {}; dirty = {}; changedIds = {}; images = {}; siteDirty = false;
      renderBar();
      return start();
    }).then(function () {
      try {
        var data = JSON.stringify({ owner: cfg.owner, repo: cfg.repo, token: cfg.token });
        localStorage.removeItem('winauto-admin'); sessionStorage.removeItem('winauto-admin');
        ($('remember').checked ? localStorage : sessionStorage).setItem('winauto-admin', data);
      } catch (err) {}
      status('connStatus', 'Підключено до ' + cfg.owner + '/' + cfg.repo + '.', 'ok');
    }).catch(function (err) { status('connStatus', err.message, 'bad'); });
  });
  // Без ключа GitHub каталог і налаштування відкриваються лише для перегляду (дані читаються із сайту)
  function ensure() {
    if (core) return Promise.resolve();
    demo = !cfg.token;
    return start().then(function () {
      if (demo) status('listStatus', 'Режим перегляду: щоб зберігати зміни, підключіть GitHub у розділі «Підключення».');
    }).catch(function (err) { status('listStatus', err.message, 'bad'); });
  }
  window.AdminCatalog = { ensure: ensure };

  /* ---------- Товари ---------- */
  function models(b) { return (core.BRANDS.filter(function (x) { return x[0] === b; })[0] || [0, []])[1]; }
  function cat(id) { return core.CATS.filter(function (c) { return c.id === id; })[0] || {}; }
  function current() { return lists[$('aBrand').value] || []; }

  function loadBrand(b) {
    if (lists[b]) return Promise.resolve();
    status('listStatus', 'Завантаження товарів ' + b + '…');
    return readFile('data/' + slug(b) + '.js').then(function (text) {
      lists[b] = (evalData(text).PRODUCTS_BY || {})[b] || [];
      status('listStatus', '');
    });
  }
  function visible() {
    var b = $('aBrand').value, m = $('aModel').value, q = $('aSearch').value.trim().toLowerCase();
    return current().filter(function (p) {
      if (m && !p.cars.some(function (c) { return c[0] === b && c[1] === m; })) return false;
      if (q && (p.n + ' ' + p.oe.join(' ') + ' ' + (p.c || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }
  function carOf(p, b) { return (p.cars.filter(function (c) { return c[0] === b; })[0] || p.cars[0] || ['', ''])[1]; }
  function renderRows() {
    var b = $('aBrand').value;
    if (!b) { $('rows').innerHTML = '<tr><td colspan="6" class="empty">Оберіть марку, щоб побачити товари.</td></tr>'; $('moreRows').hidden = true; return; }
    var list = visible();
    status('listStatus', 'Товарів: ' + list.length + (list.length !== current().length ? ' із ' + current().length : ''));
    $('rows').innerHTML = list.slice(0, shown).map(function (p) {
      var img = previews[p.img] || p.img;
      return '<tr data-id="' + esc(p.id) + '"' + (changedIds[p.id] ? ' class="changed"' : '') + '>' +
        '<td>' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : '') + '</td>' +
        '<td>' + esc(p.n) + (p.oe.length ? '<br><small style="color:var(--muted)">OE: ' + esc(p.oe.slice(0, 2).join(', ')) + '</small>' : '') + '</td>' +
        '<td>' + esc(carOf(p, b)) + '</td>' +
        '<td><input type="number" min="0" step="0.01" value="' + p.p + '" data-f="p" aria-label="Ціна"></td>' +
        '<td><input type="checkbox" data-f="s"' + (p.s ? ' checked' : '') + ' aria-label="У наявності"></td>' +
        '<td class="acts"><button type="button" class="btn btn--sm btn--ghost" data-edit>Редагувати</button>' +
        '<button type="button" class="rm" data-del style="display:inline">Видалити</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">Нічого не знайдено.</td></tr>';
    $('moreRows').hidden = list.length <= shown;
  }
  function find(id) { return current().filter(function (p) { return p.id === id; })[0]; }
  function touch(p) {
    dirty[$('aBrand').value] = true;
    changedIds[p.id] = true;
    renderBar();
  }

  $('aBrand').addEventListener('change', function () {
    var b = $('aBrand').value;
    $('aModel').innerHTML = opts(models(b).map(function (m) { return [m, m]; }), 'Усі моделі');
    shown = PAGE;
    if (!b) { renderRows(); return; }
    loadBrand(b).then(renderRows).catch(function (err) { status('listStatus', err.message, 'bad'); });
  });
  $('aModel').addEventListener('change', function () { shown = PAGE; renderRows(); });
  $('aSearch').addEventListener('input', function () { shown = PAGE; renderRows(); });
  $('moreRows').addEventListener('click', function () { shown += PAGE; renderRows(); });

  // швидке редагування ціни та наявності просто в таблиці
  $('rows').addEventListener('change', function (e) {
    var tr = e.target.closest('tr[data-id]'), f = e.target.dataset.f;
    if (!tr || !f) return;
    var p = find(tr.dataset.id);
    if (f === 'p') {
      var v = parseFloat(e.target.value);
      if (!(v >= 0)) { e.target.value = p.p; return; }
      p.p = Math.round(v * 100) / 100;
    } else p.s = e.target.checked;
    tr.classList.add('changed');
    touch(p);
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    var p = find(tr.dataset.id);
    if (e.target.closest('[data-edit]')) openEditor(p);
    else if (e.target.closest('[data-del]')) {
      if (!confirm('Видалити товар «' + p.n + '»?')) return;
      var b = $('aBrand').value;
      lists[b] = lists[b].filter(function (x) { return x !== p; });
      touch(p);
      renderRows();
    }
  });

  /* ---------- Редактор товару ---------- */
  function fillSubs(value) {
    var subs = cat($('eCat').value).sub || [];
    $('eSub').innerHTML = opts(subs.map(function (s) { return [s, s]; }), subs.length ? 'Без підкатегорії' : 'Немає');
    $('eSub').disabled = !subs.length;
    $('eSub').value = value || '';
  }
  function openEditor(p) {
    var b = $('aBrand').value;
    if (!b) { status('listStatus', 'Спершу оберіть марку.', 'bad'); return; }
    editing = p || null; newPhoto = null;
    $('editTitle').textContent = p ? 'Редагування товару' : 'Новий товар — ' + b;
    $('eModel').innerHTML = opts(models(b).map(function (m) { return [m, m]; }));
    $('eCat').innerHTML = opts(core.CATS.map(function (c) { return [c.id, c.t]; }));
    p = p || { n: '', p: '', s: true, o: 0, oe: [], c: '', d: '', g: core.CATS[0].id, sg: '', img: '', cars: [[b, $('aModel').value || models(b)[0] || '']] };
    $('eName').value = p.n;
    $('eModel').value = carOf(p, b);
    $('ePrice').value = p.p;
    $('eCat').value = p.g;
    fillSubs(p.sg);
    $('eType').value = p.o ? '1' : '0';
    $('eStock').value = p.s ? '1' : '0';
    $('eOe').value = p.oe.join(', ');
    $('eCode').value = p.c || '';
    $('eDesc').value = p.d || '';
    $('ePic').src = previews[p.img] || p.img || '';
    $('eFile').value = '';
    status('editStatus', '');
    $('editor').hidden = false;
  }
  $('addBtn').addEventListener('click', function () { openEditor(null); });
  $('eCat').addEventListener('change', function () { fillSubs(''); });
  $('editor').addEventListener('click', function (e) {
    if (e.target === $('editor') || e.target.closest('[data-close]')) $('editor').hidden = true;
  });

  // фото зменшується в браузері до 800 px і зберігається як JPEG
  $('eFile').addEventListener('change', function () {
    var file = $('eFile').files[0];
    if (!file) return;
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var k = Math.min(1, 800 / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      newPhoto = c.toDataURL('image/jpeg', 0.85);
      $('ePic').src = newPhoto;
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { status('editStatus', 'Не вдалося прочитати файл зображення.'); };
    img.src = url;
  });

  $('edit').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('aBrand').value, name = $('eName').value.trim(), price = parseFloat($('ePrice').value);
    if (!name) { status('editStatus', 'Вкажіть назву.'); return; }
    if (!(price >= 0)) { status('editStatus', 'Вкажіть ціну числом.'); return; }
    if (!$('eModel').value) { status('editStatus', 'Оберіть модель.'); return; }
    var p = editing;
    if (!p) {
      p = { id: 'a' + Date.now(), a: [], img: '', cars: [] };
      lists[b].unshift(p);
    }
    p.n = name;
    p.p = Math.round(price * 100) / 100;
    p.s = $('eStock').value === '1';
    p.o = $('eType').value === '1' ? 1 : 0;
    p.g = $('eCat').value;
    p.sg = $('eSub').value;
    p.oe = $('eOe').value.split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    p.c = $('eCode').value.trim();
    if (!p.c) delete p.c;
    p.d = $('eDesc').value.trim();
    p.cars = [[b, $('eModel').value]].concat(p.cars.filter(function (c) { return c[0] !== b; }));
    if (newPhoto) {
      p.img = 'img/' + p.id + '-' + Date.now().toString(36) + '.jpg';
      images[p.img] = newPhoto.split(',')[1];
      previews[p.img] = newPhoto;
    }
    touch(p);
    $('editor').hidden = true;
    renderRows();
  });

  /* ---------- Контакти й тексти ---------- */
  var FIELDS = { sPhone: 'phone', sEmail: 'email', sAddress: 'address', sHours: 'hours', sTopbar: 'topbar', sHeroTitle: 'heroTitle', sHeroAccent: 'heroAccent', sHeroSub: 'heroSub' };
  var BANKF = { sBankName: 'name', sBankCode: 'code', sBankIban: 'iban', sBankBank: 'bank' };
  // Лічильники та пікселі: зберігаються лише ідентифікатори, код підключення сайт формує сам
  var TRACK = {
    tFb:  { key: 'fbPixel', re: /^\d{8,20}$/, msg: 'ID пікселя Facebook — це лише цифри (15–16 знаків).' },
    tGa:  { key: 'ga4', re: /^G-[A-Z0-9]{4,}$/i, msg: 'ID Google Analytics має вигляд G-XXXXXXXXXX.' },
    tGtm: { key: 'gtm', re: /^GTM-[A-Z0-9]{4,}$/i, msg: 'ID Google Tag Manager має вигляд GTM-XXXXXXX.' },
    tGsc: { key: 'gsc', re: /^[A-Za-z0-9_-]{20,}$/, msg: 'Код Search Console — це значення content із метатега підтвердження.' }
  };
  var gscPublished = null;   // код Search Console, який уже вписано в index.html
  function fillSettings() {
    var t = site.tracking || {};
    Object.keys(TRACK).forEach(function (id) { $(id).value = t[TRACK[id].key] || ''; });
    if (gscPublished === null) gscPublished = t.gsc || '';
    Object.keys(FIELDS).forEach(function (id) { $(id).value = site[FIELDS[id]] || ''; });
    Object.keys(BANKF).forEach(function (id) { $(id).value = (site.bank || {})[BANKF[id]] || ''; });
  }
  $('settings').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = $('sPhone').value.replace(/\D/g, '');
    if (d.length === 10 && d[0] === '0') d = '38' + d;
    if (!/^380\d{9}$/.test(d)) { status('setStatus', 'Телефон має бути у форматі +380XXXXXXXXX.', 'bad'); return; }
    Object.keys(FIELDS).forEach(function (id) { site[FIELDS[id]] = $(id).value.trim(); });
    site.phone = '+' + d;
    var tracking = {}, bad = '';
    Object.keys(TRACK).forEach(function (id) {
      var v = $(id).value.trim();
      // можна вставити весь метатег Search Console — візьмемо з нього лише код
      if (id === 'tGsc') { var m = v.match(/content=["']([^"']+)["']/); if (m) v = m[1]; }
      if (v && !TRACK[id].re.test(v)) bad = bad || TRACK[id].msg;
      tracking[TRACK[id].key] = v.toUpperCase().indexOf('G') === 0 && id !== 'tGsc' ? v.toUpperCase() : v;
    });
    if (bad) { status('setStatus', bad, 'bad'); return; }
    site.tracking = tracking;
    site.bank = {};
    Object.keys(BANKF).forEach(function (id) { site.bank[BANKF[id]] = $(id).value.trim(); });
    siteDirty = true;
    status('setStatus', 'Готово. Натисніть «Опублікувати на сайті» внизу.', 'ok');
    renderBar();
  });

  /* ---------- Публікація: один коміт з усіма змінами ---------- */
  function coreText() {
    return 'window.DATA_V=' + Date.now() + ';\nwindow.RATES=' + JSON.stringify(core.RATES) + ';\nwindow.BRANDS=' + JSON.stringify(core.BRANDS) +
      ';\nwindow.CATS=' + JSON.stringify(core.CATS) + ';\nwindow.COUNTS=' + JSON.stringify(core.COUNTS) + ';\nwindow.FEATURED=' + JSON.stringify(core.FEATURED) + ';\n';
  }
  function recount(b) {
    var out = {};
    lists[b].forEach(function (p) {
      p.cars.forEach(function (c) {
        if (c[0] !== b) return;
        var m = out[c[1]] = out[c[1]] || {};
        m[p.g] = (m[p.g] || 0) + 1;
      });
    });
    core.COUNTS[b] = out;
    // популярні товари на головній: оновити змінені, прибрати видалені
    var byId = {};
    lists[b].forEach(function (p) { byId[p.id] = p; });
    core.FEATURED = (core.FEATURED || []).map(function (f) {
      var mine = f.cars.some(function (c) { return c[0] === b; });
      return mine ? byId[f.id] : f;
    }).filter(Boolean);
  }
  $('publish').addEventListener('click', function () {
    var btn = $('publish'), n = pendingCount();
    if (!n || btn.disabled) return;
    if (demo) { alert('Зміни не збережено: спершу підключіть GitHub у розділі «Підключення».'); return; }
    btn.disabled = true;
    $('pending').textContent = 'Публікація…';
    var files = [];
    Object.keys(dirty).forEach(function (b) {
      recount(b);
      files.push({ path: 'data/' + slug(b) + '.js', content: '(window.PRODUCTS_BY=window.PRODUCTS_BY||{})[' + JSON.stringify(b) + ']=' + JSON.stringify(lists[b]) + ';', encoding: 'utf-8' });
    });
    if (Object.keys(dirty).length) files.push({ path: 'products.js', content: coreText(), encoding: 'utf-8' });
    if (siteDirty) files.push({ path: 'site.js', content: 'window.SITE=' + JSON.stringify(site) + ';\n', encoding: 'utf-8' });
    Object.keys(images).forEach(function (path) { files.push({ path: path, content: images[path], encoding: 'base64' }); });

    var head, baseTree;
    // Код підтвердження Search Console має бути просто в HTML головної сторінки, тому оновлюємо index.html
    var gsc = (site.tracking || {}).gsc || '';
    var prep = siteDirty && gsc !== gscPublished ? readFile('index.html').then(function (html) {
      html = html.replace(/\s*<meta name="google-site-verification"[^>]*>/g, '');
      if (gsc) html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="google-site-verification" content="' + gsc + '">');
      files.push({ path: 'index.html', content: html, encoding: 'utf-8' });
    }) : Promise.resolve();
    prep.then(function () { return gh('/git/ref/heads/' + cfg.branch); }).then(function (ref) {
      head = ref.object.sha;
      return gh('/git/commits/' + head);
    }).then(function (commit) {
      baseTree = commit.tree.sha;
      // блоби створюються по черзі, щоб не перевищити ліміти GitHub
      return files.reduce(function (chain, f) {
        return chain.then(function (acc) {
          return gh('/git/blobs', 'POST', { content: f.content, encoding: f.encoding }).then(function (blob) {
            acc.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
            return acc;
          });
        });
      }, Promise.resolve([]));
    }).then(function (tree) {
      return gh('/git/trees', 'POST', { base_tree: baseTree, tree: tree });
    }).then(function (tree) {
      return gh('/git/commits', 'POST', { message: 'Адмін-панель: зміни (' + n + ')', tree: tree.sha, parents: [head] });
    }).then(function (commit) {
      return gh('/git/refs/heads/' + cfg.branch, 'PATCH', { sha: commit.sha });
    }).then(function () {
      dirty = {}; changedIds = {}; images = {}; siteDirty = false; gscPublished = gsc;
      btn.disabled = false;
      renderBar(); renderRows();
      status('listStatus', 'Опубліковано. Зміни з\'являться на сайті за 1–10 хвилин.', 'ok');
      status('setStatus', 'Опубліковано.', 'ok');
      alert('Зміни опубліковано. На сайті вони з\'являться за 1–10 хвилин.');
    }).catch(function (err) {
      btn.disabled = false;
      renderBar();
      alert('Не вдалося опублікувати: ' + err.message + '\nВаші зміни збережено на цій сторінці — спробуйте ще раз.');
    });
  });
  $('discard').addEventListener('click', function () {
    if (!confirm('Скасувати всі неопубліковані зміни?')) return;
    dirty = {}; changedIds = {}; images = {}; previews = {}; siteDirty = false; lists = {};
    renderBar();
    core = null;
    ensure();
    $('aBrand').value = '';
  });

})();

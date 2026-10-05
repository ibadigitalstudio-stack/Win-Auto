// Навігація в шапці: мега-меню «Каталог» (комп'ютер) і бічне меню (телефон)
(function () {
  var brands = window.BRANDS || [];
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------- Мега-меню з марками ---------- */
  var link = document.querySelector('.nav a[href="catalog.html"]');
  if (link && brands.length) {
    var item = document.createElement('div');
    item.className = 'nav__item';
    link.parentNode.insertBefore(item, link);
    item.appendChild(link);
    link.setAttribute('aria-haspopup', 'true');
    var mega = document.createElement('div');
    mega.className = 'mega';
    mega.innerHTML = '<div class="mega__in"><p class="mega__title">Оберіть марку авто</p><div class="mega__grid">' +
      brands.map(function (b) {
        return '<a href="catalog.html?brand=' + encodeURIComponent(b[0]) + '"><b>' + esc(b[0]) + '</b><small>' + b[1].length + '</small></a>';
      }).join('') + '</div><a class="mega__all" href="catalog.html">Весь каталог →</a></div>';
    item.appendChild(mega);
  }

  /* ---------- Бічне меню для телефона ---------- */
  var bar = document.querySelector('.header__in');
  if (!bar) return;
  var page = location.pathname.split('/').pop() || 'index.html';
  var main = [['index.html', 'Головна'], ['catalog.html', 'Каталог'], ['cabinet.html', 'Мій кабінет'], ['contacts.html', 'Контакти']];
  var info = [['about.html', 'Про нас'], ['delivery.html', 'Доставка та оплата'], ['returns.html', 'Обмін та повернення'],
    ['offer.html', 'Договір оферти'], ['privacy.html', 'Політика конфіденційності']];
  var links = function (list) {
    return list.map(function (l) { return '<a href="' + l[0] + '"' + (l[0] === page ? ' class="on"' : '') + '>' + l[1] + '</a>'; }).join('');
  };

  var burger = document.createElement('button');
  burger.type = 'button';
  burger.className = 'burger';
  burger.setAttribute('aria-label', 'Меню');
  burger.innerHTML = '<span></span><span></span><span></span>';
  bar.insertBefore(burger, bar.firstChild);

  var side = document.createElement('div');
  side.className = 'mnav';
  side.hidden = true;
  side.innerHTML = '<aside class="mnav__panel" role="dialog" aria-modal="true" aria-label="Меню">' +
    '<div class="mnav__head"><span class="logo logo--sm"><span class="logo__mark"><i></i><i></i><i></i></span><span class="logo__txt">WIN<b>AUTO</b></span></span>' +
    '<button type="button" class="x" aria-label="Закрити">×</button></div>' +
    '<nav class="mnav__main">' + links(main) + '</nav>' +
    '<div class="mnav__tools"><div class="mnav__row" data-slot="cur"><span>Валюта</span></div>' +
    '<div class="mnav__row" data-slot="theme"><span>Тема</span></div></div>' +
    '<nav class="mnav__info">' + links(info) + '</nav>' +
    '<div class="mnav__contact"><a href="tel:+380930210975">+38 (093) 021-09-75</a><small>Пн–Сб 9:00–19:00</small></div>' +
    '</aside>';
  document.body.appendChild(side);

  function toggle(open) {
    side.hidden = !open;
    document.body.classList.toggle('noscroll', open);
  }
  burger.addEventListener('click', function () { toggle(true); });
  side.addEventListener('click', function (e) {
    if (e.target === side || e.target.closest('.x')) toggle(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });

  // На телефоні перемикачі валюти й теми переїжджають із шапки в бічне меню (обробники лишаються ті самі)
  var cur = document.getElementById('cur'), theme = document.getElementById('themeBtn');
  var home = [cur, theme].map(function (el) { return el ? { el: el, next: el.nextSibling } : null; });
  var mq = window.matchMedia('(max-width: 760px)');
  function place() {
    home.forEach(function (h, i) {
      if (!h) { side.querySelector('[data-slot="' + (i ? 'theme' : 'cur') + '"]').hidden = true; return; }
      if (mq.matches) side.querySelector('[data-slot="' + (i ? 'theme' : 'cur') + '"]').appendChild(h.el);
      else bar.insertBefore(h.el, h.next && h.next.parentNode === bar ? h.next : null);
    });
    if (!mq.matches) toggle(false);
  }
  place();
  if (mq.addEventListener) mq.addEventListener('change', place); else mq.addListener(place);
})();

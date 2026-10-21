// Лічильники та пікселі (ідентифікатори задаються в адмін-панелі → «Аналітика та пікселі»)
(function () {
  var T = (window.SITE || {}).tracking || {};
  function script(src) { var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
  window.dataLayer = window.dataLayer || [];
  if (/^GTM-[A-Z0-9]+$/i.test(T.gtm || '')) {
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    script('https://www.googletagmanager.com/gtm.js?id=' + T.gtm);
  }
  if (/^G-[A-Z0-9]+$/i.test(T.ga4 || '')) {
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', T.ga4);
    script('https://www.googletagmanager.com/gtag/js?id=' + T.ga4);
  }
  if (/^\d+$/.test(T.fbPixel || '')) {
    var f = window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
    window._fbq = f; f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
    script('https://connect.facebook.net/en_US/fbevents.js');
    f('init', T.fbPixel);
    f('track', 'PageView');
  }
  // події магазину: надсилаються в усі підключені сервіси
  window.WATrack = function (name, value, items) {
    var ga = { add_to_cart: 'add_to_cart', purchase: 'purchase' }[name], fb = { add_to_cart: 'AddToCart', purchase: 'Purchase' }[name];
    var params = { currency: 'UAH', value: Math.round(value * 100) / 100 };
    if (window.fbq && fb) window.fbq('track', fb, params);
    if (items) params.items = items;
    if (window.gtag && ga) window.gtag('event', ga, params);
    else if (T.gtm && ga) window.dataLayer.push({ event: ga, ecommerce: params });
  };
})();

// Налаштування сайту (site.js, редагуються в адмін-панелі) підставляються в усі сторінки
(function () {
  var S = window.SITE;
  if (!S) return;
  // значення, вписані у верстку сторінок
  var D = { phoneText: '+38 (093) 021-09-75', email: 'info@win-auto.com.ua', address: 'Волинська обл., с. Гаразджа, вул. Рівненська, 1',
    hours: 'Пн–Сб 9:00–19:00', hours2: 'Пн–Сб: 9:00–19:00', topbar: 'Доставка по всій Україні · Нова Пошта · Делівері' };
  var d = String(S.phone || '').replace(/\D/g, '');
  var phoneText = /^380\d{9}$/.test(d) ? '+38 (' + d.slice(2, 5) + ') ' + d.slice(5, 8) + '-' + d.slice(8, 10) + '-' + d.slice(10) : (S.phone || D.phoneText);
  window.SITE_PHONE = { href: 'tel:+' + d, text: phoneText };
  var swaps = [[D.phoneText, phoneText], [D.email, S.email], [D.address, S.address], [D.hours2, String(S.hours || '').replace(' ', ': ')], [D.hours, S.hours], [D.topbar, S.topbar]]
    .filter(function (p) { return p[1] && p[0] !== p[1]; });
  if (swaps.length) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = walker.nextNode())) {
      var t = n.nodeValue;
      swaps.forEach(function (p) { if (t.indexOf(p[0]) !== -1) t = t.split(p[0]).join(p[1]); });
      if (t !== n.nodeValue) n.nodeValue = t;
    }
  }
  [].forEach.call(document.querySelectorAll('a[href^="tel:"]'), function (a) { a.href = 'tel:+' + d; });
  [].forEach.call(document.querySelectorAll('a[href^="mailto:"]'), function (a) { if (S.email) a.href = 'mailto:' + S.email; });
  var h1 = document.querySelector('.hero h1'), sub = document.querySelector('.hero__sub');
  if (h1 && S.heroTitle) {
    h1.textContent = S.heroTitle + ' ';
    var sp = document.createElement('span');
    sp.textContent = S.heroAccent || '';
    h1.appendChild(sp);
  }
  if (sub && S.heroSub) sub.textContent = S.heroSub;
  // реквізити продавця (договір оферти) — з розділу «Реквізити оплати» адмін-панелі
  var bank = S.bank || {};
  [].forEach.call(document.querySelectorAll('[data-bank]'), function (el) {
    var k = el.getAttribute('data-bank');
    var v = bank[k];
    if (v) el.textContent = v;
  });
})();

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
    '<div class="mnav__contact"><a href="' + ((window.SITE_PHONE || {}).href || 'tel:+380930210975') + '">' + ((window.SITE_PHONE || {}).text || '+38 (093) 021-09-75') + '</a><small>' + esc((window.SITE || {}).hours || 'Пн–Сб 9:00–19:00') + '</small></div>' +
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

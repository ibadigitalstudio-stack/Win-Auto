// Інформаційні сторінки: тема та рік у футері
(function () {
  document.getElementById('themeBtn').addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('winauto-theme', next); } catch (e) {}
  });
  document.getElementById('year').textContent = new Date().getFullYear();
})();

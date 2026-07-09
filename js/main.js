// i(m)perfect — общие мелочи фронта, без зависимостей.

(function () {
  // плавный скролл для якорей на лендинге
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  window.imp = window.imp || {};

  // грубая проверка формата устройства — предупреждение, не блокировка
  window.imp.isHandheld = function () {
    var narrow = window.matchMedia('(max-width: 820px)').matches;
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    var touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return narrow && (coarse || touch);
  };
})();

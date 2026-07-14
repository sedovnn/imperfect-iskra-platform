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

  window.imp.loadSession = function () {
    try { return JSON.parse(localStorage.getItem('imp_current_session') || 'null'); } catch (e) { return null; }
  };

  // Позиция по развилке Агеева («Крепость» / «Вторая кривая» / своя) выбирается на
  // станции 2 и служит спиной всего финала: холл ссылается на неё, три разговора
  // раскрывают её грани, финал собирает из неё документ стратегии. Подпись держим
  // в одном месте, чтобы формулировка не разъехалась между экранами.
  // Аргумент — стейт станции 2 (объект). Возвращает {code, label} или null.
  window.imp.stanceOf = function (s2state) {
    if (!s2state || !s2state.stance) return null;
    var code = s2state.stance;
    if (code === 'fortress') return { code: code, label: '«Крепость»' };
    if (code === 'secondCurve') return { code: code, label: '«Вторая кривая»' };
    if (code === 'other') {
      var own = (s2state.stanceOther || '').trim();
      return { code: code, label: own ? '«' + own + '»' : 'ваша собственная позиция' };
    }
    return null;
  };
})();

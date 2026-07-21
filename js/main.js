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

  // ---- Телеметрия ввода: маркер ИИ-помощи. Копим ТОЛЬКО агрегаты (как вводили:
  // вставки, темп набора, правки), НЕ содержание нажатий. Делегированные слушатели
  // на document — устойчивы к динамически добавляемым полям (карточки, шаги комнат).
  // snapshot() отдаёт суммарную картину по странице; api.js цепляет её к save*.
  (function initTelemetry() {
    var stats = new Map();
    var IDLE = 5000; // паузы длиннее — не «активный набор», в activeMs не идут
    function isTracked(el) {
      if (!el) return false;
      if (el.isContentEditable) return true;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'INPUT') return /^(text|search|email|url|tel|number|)$/i.test(el.type || '');
      return false;
    }
    function statFor(el) {
      var s = stats.get(el);
      if (!s) { s = { pasted: 0, maxPaste: 0, keys: 0, back: 0, activeMs: 0, lastKey: 0, tabBlur: 0 }; stats.set(el, s); }
      return s;
    }
    document.addEventListener('paste', function (e) {
      if (!isTracked(e.target)) return;
      var s = statFor(e.target), txt = '';
      try { txt = (e.clipboardData || window.clipboardData).getData('text') || ''; } catch (_) {}
      s.pasted += txt.length; if (txt.length > s.maxPaste) s.maxPaste = txt.length;
    }, true);
    document.addEventListener('keydown', function (e) {
      if (!isTracked(e.target)) return;
      var s = statFor(e.target), now = Date.now();
      if (s.lastKey) { var d = now - s.lastKey; if (d > 0 && d < IDLE) s.activeMs += d; }
      s.lastKey = now; s.keys++;
      if (e.key === 'Backspace' || e.key === 'Delete') s.back++;
    }, true);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && isTracked(document.activeElement)) statFor(document.activeElement).tabBlur++;
    }, true);

    window.imp.telemetry = {
      snapshot: function () {
        var t = { pastedChars: 0, finalChars: 0, keystrokes: 0, backspaces: 0, activeMs: 0, maxPasteChars: 0, tabBlur: 0, fieldCount: 0 };
        stats.forEach(function (s, el) {
          var len = 0;
          try { len = (el.isContentEditable ? (el.textContent || '') : (el.value || '')).length; } catch (_) {}
          if (len === 0 && s.keys === 0 && s.pasted === 0) return;
          t.finalChars += len; t.pastedChars += s.pasted; t.keystrokes += s.keys;
          t.backspaces += s.back; t.activeMs += s.activeMs; t.tabBlur += s.tabBlur;
          if (s.maxPaste > t.maxPasteChars) t.maxPasteChars = s.maxPaste;
          t.fieldCount++;
        });
        return { v: 1, totals: t };
      }
    };
  })();

  // грубая проверка формата устройства — предупреждение, не блокировка
  window.imp.isHandheld = function () {
    var narrow = window.matchMedia('(max-width: 820px)').matches;
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    var touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return narrow && (coarse || touch);
  };

  // Сессию читаем sessionStorage → localStorage. sessionStorage изолирован по
  // ВКЛАДКЕ: режим «Экскурсия» держит свою демо-сессию (bib 900) только там, где
  // запущен, и не перезаписывает общую (localStorage) реальную сессию в других
  // вкладках. Реальный участник живёт в localStorage (общий между его вкладками —
  // это ожидаемо). Все экраны читают сессию через этот хелпер.
  window.imp.loadSession = function () {
    try {
      var s = sessionStorage.getItem('imp_current_session');
      if (s) return JSON.parse(s);
    } catch (e) {}
    try {
      var real = JSON.parse(localStorage.getItem('imp_current_session') || 'null');
      // самолечение старой протечки: до фикса экскурсия писала демо-сессию (bib 900)
      // в общий localStorage. Если демо в этой вкладке не активно, а в localStorage
      // лежит демо-биб — это протечка, а не реальная сессия: игнорируем и вычищаем.
      if (real && real.bib === 900 && !sessionStorage.getItem('imp_demo')) {
        localStorage.removeItem('imp_current_session');
        return null;
      }
      return real;
    } catch (e) { return null; }
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

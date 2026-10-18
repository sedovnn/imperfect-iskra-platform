// i(m)perfect — boot-загрузчик. Пока страница решает, какой экран показать
// (проверяет на бэкенде, что уже пройдено — loadStationN / hydrateOnce), все
// секции скрыты и участник видит пустой фон. Этот скрипт закрывает тот зазор
// нейтральным «Загружаю…» и сам прячется в момент, когда появляется любой
// реальный экран. Гейт-логику страниц НЕ трогает — только наблюдает за ними.
(function () {
  'use strict';

  // Контейнеры «настоящих» экранов assessment.html. Как только любой из них
  // становится видимым — ожидание закончилось, загрузчик убираем.
  // phoneGate и versionGate добавлены 17.10 (долг ревизии): без них загрузчик 12 секунд закрывал
  // предупреждение о телефоне и экран «материалы обновились».
  var SCREENS = ['phoneGate', 'gate', 'versionGate', 'finishOverlay', 'assessRoot'];

  var obs = null;

  function isVisible(el) {
    if (!el) return false;
    if (el.style && el.style.display === 'none') return false;
    return getComputedStyle(el).display !== 'none';
  }

  function anyScreenVisible() {
    for (var i = 0; i < SCREENS.length; i++) {
      if (isVisible(document.getElementById(SCREENS[i]))) return true;
    }
    return false;
  }

  function hide() {
    var b = document.getElementById('bootLoading');
    if (b && b.parentNode) b.parentNode.removeChild(b);
    if (obs) { obs.disconnect(); obs = null; }
  }

  // Экран появился — загрузчик (или экран сбоя) убираем: раз экран показан, страница работает.
  function watch() {
    if (obs || typeof MutationObserver !== 'function') return;
    obs = new MutationObserver(function () { if (anyScreenVisible()) hide(); });
    SCREENS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['style'] });
    });
  }

  function observe() {
    if (typeof MutationObserver !== 'function') { setTimeout(hide, 8000); return; }
    watch();
    // ⚠ ПУСТОЙ ЭКРАН ВМЕСТО ОШИБКИ (долг ревизии 17.10). Прежде через 12 секунд загрузчик убирался в любом случае, и если
    // движок упал, участник оставался перед пустой страницей без единого слова. Теперь: 12 секунд — подпись «дольше
    // обычного» (холодный старт бэкенда бывает до 10 с, запрос ждёт до 30 с); 35 секунд без экрана — экран сбоя с кнопкой
    // «Обновить страницу». Ошибка скрипта, пока ни одного экрана нет, — экран сбоя сразу. Ошибка при уже открытом экране
    // день не трогает: перекрывать работающий экран из-за сбоя в одном обработчике хуже, чем промолчать.
    setTimeout(function () {
      if (anyScreenVisible()) { hide(); return; }
      var t = document.querySelector('#bootLoading .boot-text');
      if (t) t.textContent = 'Загрузка идёт дольше обычного…';
    }, 12000);
    setTimeout(function () { if (anyScreenVisible()) hide(); else crash(); }, 35000);
  }

  var crashed = false;
  function crash() {
    if (crashed || anyScreenVisible()) return;
    crashed = true;
    var b = document.getElementById('bootLoading');
    if (!b) { inject(true); b = document.getElementById('bootLoading'); }
    if (!b) return;
    b.setAttribute('role', 'alert');
    b.innerHTML = '<div class="gate-card boot-crash">' +
      '<p class="kicker">Сбой загрузки</p>' +
      '<h2>Страница не открылась</h2>' +
      '<p class="section-lead" style="margin:0 0 24px;">Обновите страницу. Если экран снова останется пустым, скажите ведущему.</p>' +
      '<button type="button" class="btn btn-primary btn-block" id="bootReload">Обновить страницу</button>' +
      '</div>';
    var r = document.getElementById('bootReload');
    if (r) r.addEventListener('click', function () { location.reload(); });
    watch();
  }
  window.addEventListener('error', function () { if (!anyScreenVisible()) crash(); });
  window.addEventListener('unhandledrejection', function () { if (!anyScreenVisible()) crash(); });

  function inject(quiet) {
    if (document.getElementById('bootLoading')) return;

    var style = document.createElement('style');
    style.textContent =
      // Фон — бумага, а не вермилион: загрузчик стоит на месте будущего экрана,
      // и оранжевая заливка на полэкрана читалась как отдельный «экран-заглушка».
      // Акцент несёт только сам индикатор — по DESIGN.md вермилион сигнальный,
      // не фоновый. Текст — ink: вермилион на белом даёт ~3.3:1, для мелкой
      // подписи 11px этого мало (WCAG 1.4.3 требует 4.5:1).
      '#bootLoading{position:fixed;inset:0;z-index:40;display:flex;align-items:center;' +
        'justify-content:center;background:var(--paper,#fff);}' +
      '#bootLoading .boot-inner{text-align:center;color:var(--ink,#181818);' +
        'font-family:var(--ff-body,"Inter Tight"),system-ui,sans-serif;}' +
      '#bootLoading .boot-spin{width:34px;height:34px;margin:0 auto 14px;border-radius:50%;' +
        'border:3px solid var(--accent-line,#ffd7c7);border-top-color:var(--accent,#ff4800);' +
        'animation:bootSpin .8s linear infinite;}' +
      // строчными и Medium, без разрядки — бренд-бук (18.10)
      '#bootLoading .boot-text{font-size:var(--label-size,11px);font-weight:500;}' +
      '#bootLoading .boot-crash{max-width:440px;margin:0 16px;text-align:left;}' +
      '@keyframes bootSpin{to{transform:rotate(360deg)}}' +
      '@media (prefers-reduced-motion: reduce){#bootLoading .boot-spin{animation:none;}}';
    document.head.appendChild(style);

    var d = document.createElement('div');
    d.id = 'bootLoading';
    d.setAttribute('role', 'status');
    d.setAttribute('aria-live', 'polite');
    d.innerHTML = '<div class="boot-inner"><div class="boot-spin"></div>' +
      '<div class="boot-text">Загружаю ваш прогресс…</div></div>';
    document.body.appendChild(d);

    if (quiet) return;                 // экран сбоя после того, как загрузчик уже убран
    // экран уже готов (редкий быстрый путь / кэш) — не мигаем загрузчиком
    if (anyScreenVisible()) hide();
    else observe();
  }

  if (document.body) inject();
  else document.addEventListener('DOMContentLoaded', inject);
})();

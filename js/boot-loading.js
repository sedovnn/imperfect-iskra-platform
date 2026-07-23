// i(m)perfect — boot-загрузчик. Пока страница решает, какой экран показать
// (проверяет на бэкенде, что уже пройдено — loadStationN / hydrateOnce), все
// секции скрыты и участник видит пустой фон. Этот скрипт закрывает тот зазор
// нейтральным «Загружаю…» и сам прячется в момент, когда появляется любой
// реальный экран. Гейт-логику страниц НЕ трогает — только наблюдает за ними.
(function () {
  'use strict';

  // Контейнеры «настоящих» экранов на станциях/в комнатах. Как только любой из
  // них становится видимым — ожидание закончилось, загрузчик убираем.
  var SCREENS = ['stationRoot', 'gate', 'gateStation1', 'gateStation2', 'finishOverlay', 'finalizeScreen'];

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

  function observe() {
    if (typeof MutationObserver !== 'function') { setTimeout(hide, 8000); return; }
    obs = new MutationObserver(function () { if (anyScreenVisible()) hide(); });
    SCREENS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['style'] });
    });
    // страховка: никогда не держим участника в загрузке дольше разумного
    setTimeout(hide, 12000);
  }

  function inject() {
    if (document.getElementById('bootLoading')) return;

    var style = document.createElement('style');
    style.textContent =
      '#bootLoading{position:fixed;inset:0;z-index:40;display:flex;align-items:center;' +
        'justify-content:center;background:var(--accent,#ff4800);}' +
      '#bootLoading .boot-inner{text-align:center;color:#0a0a0a;' +
        'font-family:Inter,system-ui,sans-serif;}' +
      '#bootLoading .boot-spin{width:34px;height:34px;margin:0 auto 14px;border-radius:50%;' +
        'border:3px solid rgba(10,10,10,.25);border-top-color:#0a0a0a;' +
        'animation:bootSpin .8s linear infinite;}' +
      '#bootLoading .boot-text{font-size:11px;font-weight:600;' +
        'text-transform:uppercase;letter-spacing:.12em;}' +
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

    // экран уже готов (редкий быстрый путь / кэш) — не мигаем загрузчиком
    if (anyScreenVisible()) hide();
    else observe();
  }

  if (document.body) inject();
  else document.addEventListener('DOMContentLoaded', inject);
})();

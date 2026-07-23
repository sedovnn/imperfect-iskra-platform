// i(m)perfect — карта пути раунда + мягкий счётчик активного времени (п.5, п.6).
//
// Показывает участнику, на каком этапе он сейчас (Карта → Агеев → Холл), и сколько
// активного времени прошло. Время идёт ТОЛЬКО пока вкладка видима и в фокусе:
// «пауза», когда человек ушёл со страницы, «продолжение» при возврате — так число
// отражает реальное время работы, а не время, что вкладка висела открытой
// (полезно для статистики скорости прохождения). Копится по bib между экранами
// раунда в localStorage (imp_elapsed_<bib>). Не обратный отсчёт — давления нет.

(function () {
  var STEPS = [
    { label: '1 · Карта проблем', match: ['station1.html'] },
    { label: '2 · Встреча с Агеевым', match: ['station2.html'] },
    { label: '3 · Холл и финал', match: ['station3.html', 'room-future.html', 'room-alternatives.html', 'room-path.html'] }
  ];
  var page = (location.pathname.split('/').pop() || '').toLowerCase();
  var curIdx = -1;
  STEPS.forEach(function (s, i) { if (s.match.indexOf(page) !== -1) curIdx = i; });
  if (curIdx === -1) return; // не экран раунда

  var session = null;
  try { session = window.imp.loadSession(); } catch (e) {}
  if (!session || !session.bib) return;

  var host = document.querySelector('#stationRoot .station-header');
  if (!host || host.parentNode.querySelector('.round-progress')) return;

  var st = document.createElement('style');
  st.textContent =
    '.round-progress{display:flex;align-items:center;justify-content:space-between;gap:16px;' +
      'padding:8px 24px;border-bottom:1px solid #ececec;background:#fafafa;' +
      'font-family:system-ui,sans-serif;font-size:12.5px;flex-wrap:wrap;}' +
    '.round-steps{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#8a8f98;}' +
    '.rp-step{white-space:nowrap;}' +
    '.rp-step.is-done{color:#1a1e26;}' +
    '.rp-step.is-current{color:#1a1e26;font-weight:700;background:var(--accent,#ff4800);border-radius:6px;padding:2px 8px;}' +
    '.rp-sep{color:#c8cdd4;}' +
    '.round-time{color:#5c6675;white-space:nowrap;font-variant-numeric:tabular-nums;}' +
    '.round-time-label{color:#8a8f98;text-transform:uppercase;letter-spacing:.04em;font-size:11px;margin-right:6px;}';
  document.head.appendChild(st);

  var stepsHtml = STEPS.map(function (s, i) {
    var cls = i < curIdx ? 'is-done' : (i === curIdx ? 'is-current' : '');
    return '<span class="rp-step ' + cls + '">' + s.label + '</span>';
  }).join('<span class="rp-sep">→</span>');

  var bar = document.createElement('div');
  bar.className = 'round-progress';
  bar.innerHTML = '<div class="round-steps">' + stepsHtml + '</div>' +
    '<div class="round-time" title="активное время работы — на паузе, когда вы уходите со страницы">' +
    '<span class="round-time-label">Прошло времени</span> <span id="roundTime">—</span></div>';
  host.parentNode.insertBefore(bar, host.nextSibling);

  // ---------- мягкий счётчик активного времени ----------
  var KEY = 'imp_elapsed_' + session.bib;
  var elapsed = parseInt(localStorage.getItem(KEY) || '0', 10) || 0;

  function fmt(s) {
    if (s < 60) return 'меньше минуты';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' мин';
    return Math.floor(m / 60) + ' ч ' + (m % 60) + ' мин';
  }
  function render() { var el = document.getElementById('roundTime'); if (el) el.textContent = fmt(elapsed); }
  function persist() { try { localStorage.setItem(KEY, String(elapsed)); } catch (e) {} }

  render();
  setInterval(function () {
    // тик только когда вкладка видима — пауза, когда человек переключился/свернул
    // (по visibility, не по фокусу окна: чтобы не «паузиться», пока человек читает
    // при неактивном окне)
    if (document.visibilityState === 'visible') {
      elapsed++;
      render();
      if (elapsed % 5 === 0) persist();
    }
  }, 1000);
  document.addEventListener('visibilitychange', persist);
  window.addEventListener('blur', persist);
  window.addEventListener('beforeunload', persist);
})();

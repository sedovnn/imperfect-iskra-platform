// i(m)perfect — «Ваша линия»: тонкая полоса решений под шапкой, одинаковая на
// станции 2, станции 3 и в комнатах. Показывает, что участник УЖЕ собрал к этому
// экрану (карта → приоритет №1 → позиция → стратегия) — чтобы держать линию, не
// перестраивая внимание от станции к станции. Read-only, без баллов и подсказок;
// источник — тот же localStorage, что и у «Моих ответов» (dossier-render.js).
//
// Рендерится на загрузке: полоса отражает линию, с которой участник ВОШЁЛ на
// экран (то, что он решает прямо сейчас, и так перед ним). Пусто — полоса скрыта.

(function () {
  window.imp = window.imp || {};

  function read(key) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function truncate(s, n) { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  function chipsFor(bib) {
    var chips = [];
    var s1 = read('imp_round1_' + bib);
    var s2 = read('imp_round2_' + bib);
    var s3 = read('imp_map_' + bib);

    if (s1) {
      var cards = (s1.cards || []).filter(function (c) { return c.text && String(c.text).trim(); });
      if (cards.length) chips.push({ k: 'Карта', v: cards.length + ' ' + plural(cards.length, 'проблема', 'проблемы', 'проблем') });
    }
    if (s2) {
      var prs = s2.priorities || [];
      if (prs.length) {
        var snap = {}; (s2.cardsSnapshot || []).forEach(function (c) { snap[c.id] = c; });
        var top = snap[prs[0].cardId];
        if (top && top.text) chips.push({ k: 'Приоритет №1', v: '«' + truncate(top.text, 40) + '»' });
      }
      var st = window.imp.stanceOf && window.imp.stanceOf(s2);
      if (st) chips.push({ k: 'Позиция', v: st.label });
    }
    if (s3 && s3.finalDefense && String(s3.finalDefense).trim()) {
      chips.push({ k: 'Стратегия', v: 'защищена' });
    }
    return chips;
  }

  function render() {
    var host = document.getElementById('impSpine');
    if (!host) return;
    var session = window.imp.loadSession && window.imp.loadSession();
    if (!session || !session.bib) { host.style.display = 'none'; return; }
    var chips = chipsFor(session.bib);
    if (!chips.length) { host.style.display = 'none'; return; }
    host.innerHTML =
      '<span class="imp-spine-label">Ваша линия</span>' +
      chips.map(function (c) {
        return '<span class="imp-spine-chip"><span class="imp-spine-k">' + esc(c.k) + '</span> ' + esc(c.v) + '</span>';
      }).join('<span class="imp-spine-sep" aria-hidden="true">→</span>');
    host.style.display = '';
  }

  window.imp.renderSpine = render;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();

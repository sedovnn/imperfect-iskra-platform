// i(m)perfect — «Мои ходы»: read-only досье участника по всему раунду 1.
// Память не должна быть скрытым препятствием — методология меряет мышление,
// а не то, сколько человек удержит в голове за два часа. Показываем только
// СОБСТВЕННЫЕ ходы участника и материал, который он сам собрал; никаких баллов,
// уровней и подсказок. Источник — localStorage этого браузера (мгновенно,
// без сети); зафиксированные шаги видны, но отсюда не редактируются.

(function () {
  function loadSession() {
    try { return JSON.parse(localStorage.getItem('imp_current_session') || 'null'); } catch (e) { return null; }
  }
  function read(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function esc(s) {
    var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML;
  }

  var session = loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }
  var bib = session.bib;
  document.getElementById('dossierRoot').style.display = '';
  document.getElementById('hdrBib').textContent = '№ ' + String(bib).padStart(3, '0');
  document.getElementById('closeBtn').addEventListener('click', function () {
    // открыт в отдельной вкладке — закрываем; иначе назад
    if (window.opener) window.close(); else history.back();
  });

  var s1 = read('imp_station1_' + bib);
  var s2 = read('imp_station2_' + bib);
  var rf = read('imp_room_future_' + bib);
  var ra = read('imp_room_alternatives_' + bib);
  var rp = read('imp_room_path_' + bib);
  var s3 = read('imp_station3_' + bib);

  var GA_SOURCE = {
    own: 'мои собственные суждения на месте',
    practice: 'то, что обычно делают в таких ситуациях',
    example: 'конкретный пример откуда-то ещё',
    pattern: 'что-то более общее, что видно за разными примерами'
  };
  var TAG = { threat: 'угроза', opportunity: 'возможность' };

  var html = '';
  function section(title) { html += '<h4>' + esc(title) + '</h4>'; }
  function text(t) { html += '<p class="fac-detail-text">' + esc(t) + '</p>'; }
  function textB(label, t) { html += '<p class="fac-detail-text"><b>' + esc(label) + '</b> ' + esc(t) + '</p>'; }
  function empty(t) { html += '<p class="fac-detail-text" style="color:var(--muted-soft);">' + esc(t) + '</p>'; }
  function cardsOpen() { html += '<div class="fac-cards">'; }
  function cardsClose() { html += '</div>'; }

  // ---------- Станция 1 ----------
  section('Станция 1 · Вычитка и карта проблем');
  if (!s1) {
    empty('Ещё не начата.');
  } else {
    var groupNames = {};
    (s1.groups || []).forEach(function (g) { groupNames[g.id] = g.name; });
    if (s1.rationale) textB('Как я структурировал карту:', s1.rationale);

    var cards = (s1.cards || []).filter(function (c) { return c.text && String(c.text).trim(); });
    html += '<p class="fac-detail-text"><b>Карточки проблем (' + cards.length + '):</b></p>';
    if (!cards.length) { empty('Пока пусто.'); }
    else {
      cardsOpen();
      cards.forEach(function (c) {
        html += '<div class="fac-card"><p>' + esc(c.text) + '</p><div class="fac-card-meta">' +
          (c.anchor ? '<span>якорь: ' + esc(c.anchor) + '</span>' : '') +
          (c.group && groupNames[c.group] ? '<span>' + esc(groupNames[c.group]) + '</span>' : '') +
          (TAG[c.tag] ? '<span>' + TAG[c.tag] + '</span>' : '') +
          '</div>' + (c.influence ? '<p class="fac-detail-text">' + esc(c.influence) + '</p>' : '') + '</div>';
      });
      cardsClose();
    }

    var conns = s1.connections || [];
    if (conns.length) {
      html += '<p class="fac-detail-text"><b>Корневые связки (' + conns.length + '):</b></p>';
      var cardById = {}; (s1.cards || []).forEach(function (c) { cardById[c.id] = c; });
      cardsOpen();
      conns.forEach(function (cn) {
        var t = (cn.cardIds || []).map(function (id) { return cardById[id] ? '«' + (cardById[id].text || '') + '»' : '(карточка)'; }).join(' + ');
        html += '<div class="fac-card"><p>' + esc(t) + '</p>' +
          (cn.mechanism ? '<div class="fac-card-meta"><span>механизм: ' + esc(cn.mechanism) + '</span></div>' : '') +
          (cn.conclusion ? '<div class="fac-card-meta"><span>вывод: ' + esc(cn.conclusion) + '</span></div>' : '') + '</div>';
      });
      cardsClose();
    }

    var hls = s1.highlights || [];
    html += '<p class="fac-detail-text"><b>Мои выделения (' + hls.length + '):</b></p>';
    if (!hls.length) { empty('Нет отметок.'); }
    else {
      cardsOpen();
      hls.forEach(function (h) {
        html += '<div class="fac-card"><p>«' + esc(h.snippet || h.text || '') + '»</p>' +
          (h.note ? '<div class="fac-card-meta"><span>' + esc(h.note) + '</span></div>' : '') + '</div>';
      });
      cardsClose();
    }
    var reviewed = s1.appxReviewed ? Object.keys(s1.appxReviewed).length : 0;
    text('Приложения изучено: ' + reviewed + '/8');
  }

  // ---------- Станция 2 ----------
  section('Станция 2 · Встреча с Агеевым');
  if (!s2) {
    empty('Ещё не начата.');
  } else {
    var cardById2 = {}; (s2.cardsSnapshot || []).forEach(function (c) { cardById2[c.id] = c; });
    function t2(id) { var c = cardById2[id]; return c ? c.text : '(карточка)'; }

    var prs = s2.priorities || [];
    if (prs.length) {
      html += '<p class="fac-detail-text"><b>Мои приоритеты (по порядку):</b></p>';
      cardsOpen();
      prs.forEach(function (p, i) {
        html += '<div class="fac-card"><p><b>' + (i + 1) + '.</b> ' + esc(t2(p.cardId)) + '</p>' +
          (p.target ? '<div class="fac-card-meta"><span>ориентир: ' + esc(p.target) + '</span></div>' : '') + '</div>';
      });
      cardsClose();
    }
    var rej = s2.rejected || [];
    if (rej.length) {
      html += '<p class="fac-detail-text"><b>Отложил (не сейчас):</b></p>';
      cardsOpen();
      rej.forEach(function (r) {
        html += '<div class="fac-card"><p>' + esc(t2(r.cardId)) + '</p>' +
          (r.freed ? '<div class="fac-card-meta"><span>освобождает: ' + esc(r.freed) + '</span></div>' : '') + '</div>';
      });
      cardsClose();
    }
    if (s2.rejectionRule) textB('Правило отказа:', s2.rejectionRule);
    if (s2.rationale) textB('Почему №1 первым:', s2.rationale);
    if (s2.stressChoice) {
      textB('Стресс-тест «отложим на полгода»:', s2.stressChoice === 'hold' ? 'настоял на своём' : 'согласился пересобрать');
      if (s2.stressComment) text(s2.stressComment);
    }
    if (s2.proactiveText) textB('При каких условиях пересмотрю выбор:', s2.proactiveText);
    if (!prs.length && !rej.length && !s2.rationale) empty('Пока пусто.');
  }

  // ---------- Комнаты ----------
  section('Коридор Лемеха');
  if (!rf || (!rf.answer1 && !rf.answer2)) empty('Не заходил или пусто.');
  else {
    if (rf.answer1) textB('Куда всё идёт:', rf.answer1);
    if (rf.answer2) textB('Если пойдёт не так:', rf.answer2);
  }

  section('Очередь в «Прожектор»');
  if (!ra || (!ra.answer1 && !ra.source && !ra.sourceElaboration)) empty('Не заходил или пусто.');
  else {
    if (ra.answer1) textB('На месте Агеева:', ra.answer1);
    if (ra.source) textB('Источник идей:', GA_SOURCE[ra.source] || ra.source);
    if (ra.sourceElaboration) text(ra.sourceElaboration);
  }

  section('Черновик к мартовскому комитету');
  if (!rp || (!rp.currentState && !rp.targetState && !(rp.stages || []).length)) empty('Не заходил или пусто.');
  else {
    if (rp.currentState || rp.targetState) textB('Текущее → целевое:', (rp.currentState || '—') + ' → ' + (rp.targetState || '—'));
    var stages = (rp.stages || []).filter(function (s) { return s.description; });
    if (stages.length) {
      html += '<p class="fac-detail-text"><b>Этапы пути:</b></p>';
      cardsOpen();
      stages.forEach(function (st, i) {
        html += '<div class="fac-card"><p><b>Этап ' + (i + 1) + '.</b> ' + esc(st.description) + '</p>' +
          (st.rationale ? '<div class="fac-card-meta"><span>почему здесь: ' + esc(st.rationale) + '</span></div>' : '') + '</div>';
      });
      cardsClose();
    }
    var barriers = (rp.barriers || []).filter(function (b) { return b.text; });
    var enablers = (rp.enablers || []).filter(function (e) { return e.text; });
    if (barriers.length) { html += '<p class="fac-detail-text"><b>Барьеры:</b></p>'; cardsOpen(); barriers.forEach(function (b) { html += '<div class="fac-card"><p>' + esc(b.text) + '</p></div>'; }); cardsClose(); }
    if (enablers.length) { html += '<p class="fac-detail-text"><b>Опора / ресурсы:</b></p>'; cardsOpen(); enablers.forEach(function (e) { html += '<div class="fac-card"><p>' + esc(e.text) + '</p></div>'; }); cardsClose(); }
  }

  // ---------- Финализация ----------
  section('Финальная защита стратегии');
  if (s3 && s3.finalDefense && String(s3.finalDefense).trim()) text(s3.finalDefense);
  else empty('Пока не заполнена.');

  document.getElementById('dossierContent').innerHTML = html;
})();

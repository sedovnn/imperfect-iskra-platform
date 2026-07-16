// i(m)perfect — общая логика сборки html для «Моих ответов»: используется и
// отдельной страницей (dossier.html), и выезжающей панелью на станциях/комнатах.
// Один источник правды, чтобы список полей не расходился между двумя местами.
//
// Показывает только СОБСТВЕННЫЕ ответы участника; никаких баллов, уровней и
// подсказок. Источник — localStorage этого браузера. Каждый раздел рендерится,
// только если по нему реально есть сохранённые данные — иначе название и
// структура ещё не пройденных станций/комнат были бы видны заранее.

(function () {
  window.imp = window.imp || {};

  function read(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function esc(s) {
    var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML;
  }

  var GA_SOURCE = {
    own: 'мои собственные суждения на месте',
    practice: 'то, что обычно делают в таких ситуациях',
    example: 'конкретный пример откуда-то ещё',
    pattern: 'что-то более общее, что видно за разными примерами'
  };
  var TAG = { threat: 'угроза', opportunity: 'возможность' };

  window.imp.buildDossierHtml = function (bib) {
    var s1 = read('imp_station1_' + bib);
    var s2 = read('imp_station2_' + bib);
    var rf = read('imp_room_future_' + bib);
    var ra = read('imp_room_alternatives_' + bib);
    var rp = read('imp_room_path_' + bib);
    var s3 = read('imp_station3_' + bib);

    var html = '';
    function section(title) { html += '<h4>' + esc(title) + '</h4>'; }
    function text(t) { html += '<p class="fac-detail-text">' + esc(t) + '</p>'; }
    function textB(label, t) { html += '<p class="fac-detail-text"><b>' + esc(label) + '</b> ' + esc(t) + '</p>'; }
    function cardsOpen() { html += '<div class="fac-cards">'; }
    function cardsClose() { html += '</div>'; }

    // ---------- Станция 1 ----------
    if (s1) {
      section('Станция 1 · Вычитка и карта проблем');

      // проблема = отметка: описание своими словами + цитата, откуда она
      var cards = (s1.cards || []).filter(function (c) { return c.text && String(c.text).trim(); });
      if (cards.length) {
        html += '<p class="fac-detail-text"><b>Мои проблемы (' + cards.length + '):</b></p>';
        cardsOpen();
        cards.forEach(function (c) {
          html += '<div class="fac-card"><p>' + esc(c.text) + '</p>' +
            (c.anchor ? '<div class="fac-card-meta"><span>из цитаты: «' + esc(c.anchor) + '»</span></div>' : '') +
            (TAG[c.tag] ? '<div class="fac-card-meta"><span>' + TAG[c.tag] + '</span></div>' : '') +
            (c.influence ? '<p class="fac-detail-text">' + esc(c.influence) + '</p>' : '') + '</div>';
        });
        cardsClose();
      }

      // основная проблема — рефлексивный выбор (не в балл)
      if (s1.mainProblemId) {
        var mainCard = cards.filter(function (c) { return c.id === s1.mainProblemId; })[0];
        if (mainCard) textB('Основная, по-моему:', mainCard.text + (s1.mainProblemWhy ? ' — ' + s1.mainProblemWhy : ''));
      }

      var conns = s1.connections || [];
      if (conns.length) {
        html += '<p class="fac-detail-text"><b>Корневые связки (' + conns.length + '):</b></p>';
        var cardById = {}; (s1.cards || []).forEach(function (c) { cardById[c.id] = c; });
        cardsOpen();
        conns.forEach(function (cn) {
          var t = (cn.cardIds || []).map(function (id) { return cardById[id] ? '«' + (cardById[id].text || '') + '»' : '(проблема)'; }).join(' + ');
          html += '<div class="fac-card"><p>' + esc(t) + '</p>' +
            (cn.mechanism ? '<div class="fac-card-meta"><span>механизм: ' + esc(cn.mechanism) + '</span></div>' : '') +
            (cn.conclusion ? '<div class="fac-card-meta"><span>вывод: ' + esc(cn.conclusion) + '</span></div>' : '') + '</div>';
        });
        cardsClose();
      }

      if (s1.appxReviewed && Object.keys(s1.appxReviewed).length) {
        text('Приложения изучено: ' + Object.keys(s1.appxReviewed).length + '/8');
      }
    }

    // ---------- Станция 2 ----------
    if (s2) {
      section('Станция 2 · Встреча с Агеевым');
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
      if (s2.firstAction) textB('Первый ход по приоритету №1:', s2.firstAction);
      if (s2.rationale) textB('Почему №1 первым:', s2.rationale);
      if (s2.stressChoice) {
        textB('Стресс-тест «отложим на полгода»:', s2.stressChoice === 'hold' ? 'настоял на своём' : (s2.stressChoice === 'calibrate' ? 'пересобрал частично' : 'согласился пересобрать'));
        if (s2.stressComment) text(s2.stressComment);
      }
      if (s2.proactiveText) textB('При каких условиях пересмотрю выбор:', s2.proactiveText);
    }

    // ---------- Комнаты ----------
    if (rf && (rf.answer1 || rf.answer2)) {
      section('Коридор Лемеха');
      if (rf.answer1) textB('Куда всё идёт:', rf.answer1);
      if (rf.answer2) textB('Если пойдёт не так:', rf.answer2);
    }

    if (ra && (ra.answer1 || ra.source || ra.sourceElaboration)) {
      section('Очередь в «Прожектор»');
      if (ra.answer1) textB('Почему это сработает:', ra.answer1);
      if (ra.source) textB('Источник идей:', GA_SOURCE[ra.source] || ra.source);
      if (ra.sourceElaboration) text(ra.sourceElaboration);
    }

    if (rp && (rp.currentState || rp.targetState || (rp.stages || []).length)) {
      section('Черновик к мартовскому комитету');
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
    if (s3 && s3.finalDefense && String(s3.finalDefense).trim()) {
      section('Финальная защита стратегии');
      text(s3.finalDefense);
    }

    if (!html) {
      html = '<p class="fac-detail-text" style="color:var(--muted-soft);">Пока ничего не сохранено — начните с текущего задания, здесь появится то, что вы уже сделали.</p>';
    }

    return html;
  };
})();

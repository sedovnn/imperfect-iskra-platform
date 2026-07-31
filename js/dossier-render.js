// i(m)perfect — общая логика сборки html для «Моих ответов»: используется и
// выезжающей панелью на станциях/комнатах.
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
    var s1 = read('imp_round1_' + bib);
    var s2 = read('imp_round2_' + bib);
    var rf = read('imp_round3_' + bib);
    var ra = read('imp_round5_' + bib);
    var rp = read('imp_round4_' + bib);
    var s3 = read('imp_map_' + bib);

    var html = '';
    // Заголовок раздела — ЛЕНИВЫЙ: печатается только когда за ним появился
    // реальный контент. Иначе пустой (но уже сохранённый) стейт раунда давал
    // «голый» заголовок, и заглушка «пока ничего не сохранено» не срабатывала.
    var pendingSection = null;
    function section(title) { pendingSection = title; }
    function flushSection() {
      if (pendingSection) { html += '<h4>' + esc(pendingSection) + '</h4>'; pendingSection = null; }
    }
    function raw(s) { flushSection(); html += s; }
    function text(t) { raw('<p class="fac-detail-text">' + esc(t) + '</p>'); }
    function textB(label, t) { raw('<p class="fac-detail-text"><b>' + esc(label) + '</b> ' + esc(t) + '</p>'); }
    function cardsOpen() { raw('<div class="fac-cards">'); }
    function cardsClose() { html += '</div>'; }

    // ---------- Станция 1 ----------
    if (s1) {
      section('Раунд 1 · Знакомство с «Искрой»');

      // проблема = отметка: описание своими словами + цитата, откуда она
      var cards = (s1.cards || []).filter(function (c) { return c.text && String(c.text).trim(); });
      if (cards.length) {
        raw('<p class="fac-detail-text"><b>Мои проблемы (' + cards.length + '):</b></p>');
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
        raw('<p class="fac-detail-text"><b>Корневые связки (' + conns.length + '):</b></p>');
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
        text('Приложений изучено: ' + Object.keys(s1.appxReviewed).length + ' из 8');
      }
    }

    // ---------- Станция 2 ----------
    if (s2) {
      section('Раунд 2 · Встреча с Агеевым');
      var cardById2 = {}; (s2.cardsSnapshot || []).forEach(function (c) { cardById2[c.id] = c; });
      function t2(id) { var c = cardById2[id]; return c ? c.text : '(карточка)'; }

      if (s2.ownMove) textB('Мой ход (до того, как услышал позиции правления):', s2.ownMove);
      var st2 = window.imp.stanceOf && window.imp.stanceOf(s2);
      if (st2) textB('Позиция по развилке:', st2.isOwn && st2.named ? st2.named : st2.label);
      if (s2.stanceCriteria) textB('Два критерия:', s2.stanceCriteria);
      if (s2.stressChoice) {
        textB('Штерн предложил отложить на полгода:', s2.stressChoice === 'hold' ? 'держу позицию' : (s2.stressChoice === 'calibrate' ? 'меняю детали, ядро оставляю' : 'пересматриваю'));
        if (s2.stressComment) text(s2.stressComment);
      }

      // Разбор бэклога менеджеров (разговор переписан 2026-07-31).
      var picks = s2.picks || {};
      var pickIds = Object.keys(picks);
      if (pickIds.length && window.imp.backlogById) {
        function itemOf(id) {
          var own = (s2.ownItems || []).filter(function (o) { return String(o.id) === String(id); })[0];
          return own ? { title: own.title, people: own.people, money: own.money, own: true } : window.imp.backlogById(id);
        }
        var taken = pickIds.filter(function (id) { return picks[id] && picks[id].take; });
        var dropped = pickIds.filter(function (id) { return picks[id] && !picks[id].take; });
        if (taken.length) {
          raw('<p class="fac-detail-text"><b>Беру на год (' + taken.length + '):</b></p>');
          cardsOpen();
          taken.forEach(function (id) {
            var it = itemOf(id); if (!it) return;
            html += '<div class="fac-card"><p>' + esc(it.title) + (it.own ? ' <i>(моё предложение)</i>' : '') + '</p>' +
              '<div class="fac-card-meta"><span>' + esc(it.people) + ' чел.</span><span>' + esc(it.money) + ' млрд</span></div></div>';
          });
          cardsClose();
        }
        if (dropped.length) {
          raw('<p class="fac-detail-text"><b>Откладываю (' + dropped.length + '):</b></p>');
          cardsOpen();
          dropped.forEach(function (id) {
            var it = itemOf(id); if (!it) return;
            html += '<div class="fac-card"><p>' + esc(it.title) + '</p>' +
              (picks[id].reason ? '<div class="fac-card-meta"><span>' + esc(picks[id].reason) + '</span></div>' : '') + '</div>';
          });
          cardsClose();
        }
      } else {
        // прогоны прежней формы: ранжированные карточки раунда 1
        var prs = s2.priorities || [];
        if (prs.length) {
          raw('<p class="fac-detail-text"><b>Мои приоритеты (по порядку):</b></p>');
          cardsOpen();
          prs.forEach(function (p, i) {
            html += '<div class="fac-card"><p><b>' + (i + 1) + '.</b> ' + esc(t2(p.cardId)) + '</p>' +
              (p.target ? '<div class="fac-card-meta"><span>ориентир: ' + esc(p.target) + '</span></div>' : '') + '</div>';
          });
          cardsClose();
        }
        var rej = s2.rejected || [];
        if (rej.length) {
          raw('<p class="fac-detail-text"><b>Отложил (не сейчас):</b></p>');
          cardsOpen();
          rej.forEach(function (r) {
            html += '<div class="fac-card"><p>' + esc(t2(r.cardId)) + '</p>' +
              (r.freed ? '<div class="fac-card-meta"><span>освобождает: ' + esc(r.freed) + '</span></div>' : '') + '</div>';
          });
          cardsClose();
        }
        if (s2.firstAction) textB('Первый ход по приоритету №1:', s2.firstAction);
      }
      if (s2.blindSpot) textB('Чего менеджеры не видят:', s2.blindSpot);
      if (s2.rationale) textB('Почему именно эти приоритеты:', s2.rationale);
      if (s2.rejectionRule) textB('Как проверить новую идею:', s2.rejectionRule);
      if (s2.proactiveText) textB('Что заставит меня пересматривать:', s2.proactiveText);
    }

    // ---------- Комнаты (по порядку раундов: 3 → 4 → 5) ----------
    if (rf && (rf.answer1 || rf.answer2)) {
      section('Раунд 3 · Встреча с Лемехом у лифта');
      if (rf.answer1) textB('Куда всё идёт:', rf.answer1);
      if (rf.answer2) textB('Если пойдёт не так:', rf.answer2);
    }

    if (rp && (rp.currentState || rp.targetState || (rp.stages || []).length)) {
      section('Раунд 4 · Черновик к мартовскому комитету');
      if (rp.currentState || rp.targetState) textB('Текущее → целевое:', (rp.currentState || '—') + ' → ' + (rp.targetState || '—'));
      var stages = (rp.stages || []).filter(function (s) { return s.description; });
      if (stages.length) {
        raw('<p class="fac-detail-text"><b>Этапы пути:</b></p>');
        cardsOpen();
        stages.forEach(function (st, i) {
          html += '<div class="fac-card"><p><b>Этап ' + (i + 1) + '.</b> ' + esc(st.description) + '</p>' +
            (st.rationale ? '<div class="fac-card-meta"><span>почему здесь: ' + esc(st.rationale) + '</span></div>' : '') +
            (st.doneWhen ? '<div class="fac-card-meta"><span>завершён, когда: ' + esc(st.doneWhen) + '</span></div>' : '') + '</div>';
        });
        cardsClose();
      }
      if (rp.contingency) textB('Что меняет маршрут:', rp.contingency);
      var barriers = (rp.barriers || []).filter(function (b) { return b.text; });
      var enablers = (rp.enablers || []).filter(function (e) { return e.text; });
      var BT = { fixed: 'стена', surmountable: 'можно обойти' };
      if (barriers.length) { html += '<p class="fac-detail-text"><b>Барьеры:</b></p>'; cardsOpen(); barriers.forEach(function (b) { html += '<div class="fac-card"><p>' + esc(b.text) + '</p>' + (b.type ? '<div class="fac-card-meta"><span>' + (BT[b.type] || b.type) + '</span></div>' : '') + (b.counter ? '<div class="fac-card-meta"><span>чем закрываем: ' + esc(b.counter) + '</span></div>' : '') + '</div>'; }); cardsClose(); }
      if (enablers.length) { html += '<p class="fac-detail-text"><b>Опора / ресурсы:</b></p>'; cardsOpen(); enablers.forEach(function (e) { html += '<div class="fac-card"><p>' + esc(e.text) + '</p></div>'; }); cardsClose(); }
    }

    var raSources = (ra && (ra.sources || (ra.source ? String(ra.source).split(',') : []))) || [];
    raSources = raSources.map(function (s) { return String(s).trim(); }).filter(function (s) { return s; });
    if (ra && (ra.answer1 || ra.subdecisions || raSources.length || ra.sourceElaboration)) {
      section('Раунд 5 · Очередь в «Прожектор»');
      // подписи нейтральны к версии раунда: до редизайна answer1 был про собственную
      // рекомендацию, после — про задачу Даши; спрашивал в обоих случаях Брагин
      if (ra.answer1) textB('Ответ Брагину:', ra.answer1);
      if (ra.subdecisions) textB('Где колебался, что отбросил:', ra.subdecisions);
      if (raSources.length) textB('Источники идей (прежний формат):', raSources.map(function (s) { return GA_SOURCE[s] || s; }).join('; '));
      if (ra.sourceElaboration) textB('Откуда ход:', ra.sourceElaboration);
    }

    // ---------- Финализация ----------
    if (s3 && s3.finalDefense && String(s3.finalDefense).trim()) {
      section('Раунд 6 · Защита стратегии');
      text(s3.finalDefense);
    }

    if (!html) {
      html = '<p class="fac-detail-text" style="color:var(--muted-soft);">Пока ничего не сохранено — начните с текущего задания, здесь появится то, что вы уже сделали.</p>';
    }

    return html;
  };
})();

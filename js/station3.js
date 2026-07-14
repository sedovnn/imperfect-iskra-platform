// i(m)perfect — финальный отрезок раунда 1: хаб трёх свободно-упорядочиваемых
// комнат (МК — «Коридор Лемеха», ГА — «Очередь в „Прожектор"», ПП — «Черновик
// к мартовскому комитету») + финализация стратегии. Названия и тизеры комнат —
// намеренно про сюжет кейса, не про способность: как и станции 1/2 названы по
// событию («Встреча с Агеевым»), а не по конструкту, чтобы не подсказывать,
// что именно здесь меряется. Порядок посещения свободный, полнота не гейтится —
// единственное реальное ограничение — общее время участника на раунд 1 (~2 часа),
// поэтому финализировать можно и не зайдя во все комнаты: непосещённая комната
// просто не даёт сигнала по своей способности, это не штраф и не блокер.

(function () {
  var ROOMS = [
    {
      key: 'future',
      title: 'Коридор Лемеха',
      teaser: 'Лемех перехватывает вас у лифта: у него пять минут и вопрос не по повестке встречи.',
      href: 'room-future.html',
      storageKey: function (bib) { return 'imp_room_future_' + bib; }
    },
    {
      key: 'alternatives',
      title: 'Очередь в «Прожектор»',
      teaser: 'В очереди за кофе кто-то роняет реплику, которая не идёт из головы.',
      href: 'room-alternatives.html',
      storageKey: function (bib) { return 'imp_room_alternatives_' + bib; }
    },
    {
      key: 'path',
      title: 'Черновик к мартовскому комитету',
      teaser: 'Через месяц — заседание, которое ждали с декабря. Пора собрать то, с чем туда идти.',
      href: 'room-path.html',
      storageKey: function (bib) { return 'imp_room_path_' + bib; }
    }
  ];

  var session = null;
  var state = null;

  function storageKey(bib) { return 'imp_station3_' + bib; }
  function station2Key(bib) { return 'imp_station2_' + bib; }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem('imp_current_session') || 'null'); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { finished: false, finalDefense: '', startedAt: new Date().toISOString() };
  }

  var backendSyncTimer = null;

  function saveState() {
    localStorage.setItem(storageKey(session.bib), JSON.stringify(state));
    scheduleBackendSync();
  }

  function scheduleBackendSync() {
    if (!window.imp.isApiConfigured()) return;
    clearTimeout(backendSyncTimer);
    backendSyncTimer = setTimeout(syncStateToBackend, 3000);
  }

  function syncStateToBackend() {
    if (!window.imp.isApiConfigured()) return;
    // бэкенд для финального отрезка появится вместе с содержанием комнат —
    // до этого действие best-effort и молча не срабатывает, как везде в проекте
    window.imp.callApi('saveStation3', { bib: session.bib, state: state });
  }

  // ---------- gate ----------

  session = loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }

  // восстановление доступа на новом устройстве: локально для этого отрезка пусто —
  // сначала подтягиваем реальный прогресс с бэкенда, иначе следующий же автосейв
  // затрёт его пустым стейтом (см. api.js hydrateOnce) — фоновая проверка,
  // не блокирует рендер; если найдётся реальный прогресс, страница перезагрузится сама
  window.imp.hydrateOnce('loadStation3', session.bib, storageKey(session.bib));

  function localStation2Finished() {
    try {
      var raw = localStorage.getItem(station2Key(session.bib));
      if (!raw) return false;
      return !!JSON.parse(raw).finished;
    } catch (e) { return false; }
  }

  function proceedToStation() {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('gateStation2').style.display = 'none';
    document.getElementById('stationRoot').style.display = '';
    document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(3, '0');
    initWorkspace();
  }

  function showStation2Gate() {
    document.getElementById('gateStation2').style.display = 'flex';
  }

  if (window.imp.isApiConfigured()) {
    window.imp.callApi('loadStation2', { bib: session.bib }).then(function (res) {
      if (res && res.ok && res.state && res.state.finished) {
        proceedToStation();
      } else if (res && res.ok) {
        showStation2Gate();
      } else if (localStation2Finished()) {
        proceedToStation();
      } else {
        showStation2Gate();
      }
    });
  } else if (localStation2Finished()) {
    proceedToStation();
  } else {
    showStation2Gate();
  }

  // ---------- workspace ----------

  function initWorkspace() {
    state = loadState(session.bib);

    var introKey = 'imp_station3_intro_seen_' + session.bib;
    var introEl = document.getElementById('stationIntro');
    if (localStorage.getItem(introKey)) introEl.style.display = 'none';
    document.getElementById('dismissIntro').addEventListener('click', function () {
      introEl.style.display = 'none';
      localStorage.setItem(introKey, '1');
    });
    document.getElementById('reopenIntroBtn').addEventListener('click', function () {
      introEl.style.display = 'flex';
    });

    function roomStatus(room) {
      try {
        var raw = localStorage.getItem(room.storageKey(session.bib));
        if (!raw) return { text: 'не начата', cls: 'is-none' };
        var s = JSON.parse(raw);
        if (s.finished) return { text: 'завершена', cls: 'is-done' };
        return { text: 'в процессе', cls: 'is-progress' };
      } catch (e) {
        return { text: 'не начата', cls: 'is-none' };
      }
    }

    function renderRooms() {
      var list = document.getElementById('hubRooms');
      list.innerHTML = '';
      ROOMS.forEach(function (room) {
        var status = roomStatus(room);
        var card = document.createElement('a');
        card.className = 'hub-room-card' + (state.finished ? ' is-locked' : '');
        card.href = state.finished ? '#' : room.href;
        if (state.finished) card.addEventListener('click', function (e) { e.preventDefault(); });
        card.innerHTML =
          '<div class="hub-room-top">' +
            '<h3>' + room.title + '</h3>' +
            '<span class="fac-pill ' + status.cls + '">' + status.text + '</span>' +
          '</div>' +
          '<p>' + room.teaser + '</p>';
        list.appendChild(card);
      });
    }

    renderRooms();

    // ---------- сводка «что у вас получилось» + финальная защита стратегии ----------
    // Отдельный большой экран (не крошечное окошко на хабе): показывает то, что
    // участник уже сложил (приоритет со станции 2 + вынесенное из комнат), и даёт
    // защите место, соразмерное её значимости. Сама защита — интегративный
    // контрольный вопрос: пере-вызывает ПР-2 / МК-2 / ГА-1 на настоящей глубине
    // для перекрёстной проверки (§7-8 методологии). Не оптимизирован под одну
    // способность — это и есть «контрольная роль». Необязателен, как и комнаты.
    function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

    function readJson(key) {
      try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }

    function buildRecapHtml() {
      var html = '';
      var s2 = readJson(station2Key(session.bib));
      if (s2 && (s2.priorities || []).length) {
        var cardById = {};
        (s2.cardsSnapshot || []).forEach(function (c) { cardById[c.id] = c; });
        var top = s2.priorities[0];
        var topText = top && cardById[top.cardId] ? cardById[top.cardId].text : null;
        if (topText) {
          html += '<div class="fac-card"><p><b>Приоритет №1:</b> ' + esc(topText) + '</p>' +
            (s2.rationale ? '<div class="fac-card-meta"><span>' + esc(s2.rationale) + '</span></div>' : '') + '</div>';
        }
      }
      ROOMS.forEach(function (room) {
        var st = readJson(room.storageKey(session.bib));
        if (!st || !st.finished) return;
        var line = '';
        if (room.key === 'future' && st.answer1) line = st.answer1;
        else if (room.key === 'alternatives' && st.answer1) line = st.answer1;
        else if (room.key === 'path' && (st.currentState || st.targetState)) line = (st.currentState || '—') + ' → ' + (st.targetState || '—');
        if (line) html += '<div class="fac-card"><p><b>' + esc(room.title) + ':</b> ' + esc(line) + '</p></div>';
      });
      if (!html) html = '<p class="fac-detail-text" style="color:var(--muted-soft);">Пока пусто — вернитесь в холл, чтобы собрать материал.</p>';
      return html;
    }

    var defenseEl = document.getElementById('finalDefense');
    var finalizeScreenEl = document.getElementById('finalizeScreen');
    var strategyRecapEl = document.getElementById('strategyRecap');
    var openFinalizeBtn = document.getElementById('openFinalizeBtn');

    if (defenseEl) {
      defenseEl.value = state.finalDefense || '';
      defenseEl.disabled = !!state.finished;
      defenseEl.addEventListener('input', function () {
        state.finalDefense = defenseEl.value;
        saveState();
      });
    }

    openFinalizeBtn.addEventListener('click', function () {
      strategyRecapEl.innerHTML = buildRecapHtml();
      document.getElementById('stationRoot').style.display = 'none';
      finalizeScreenEl.style.display = 'flex';
    });
    document.getElementById('closeFinalizeBtn').addEventListener('click', function () {
      finalizeScreenEl.style.display = 'none';
      document.getElementById('stationRoot').style.display = '';
    });

    // ---------- finalize ----------

    function showFinishOverlay() {
      finalizeScreenEl.style.display = 'none';
      document.getElementById('stationRoot').style.display = 'none';
      document.getElementById('finishOverlay').style.display = 'flex';
    }

    function finalizeRound() {
      var visited = ROOMS.filter(function (r) { return roomStatus(r).text === 'завершена'; }).length;
      if (visited < ROOMS.length) {
        var left = ROOMS.length - visited;
        var word = left === 1 ? 'разговор' : 'разговора';
        if (!window.confirm('Вы не зашли в ' + left + ' ' + word + ' из ' + ROOMS.length + '. Финализировать стратегию с тем, что есть?')) return;
      }
      if (defenseEl) state.finalDefense = defenseEl.value;
      state.finished = true;
      state.finishedAt = new Date().toISOString();
      saveState();
      clearTimeout(backendSyncTimer);
      syncStateToBackend();
      openFinalizeBtn.setAttribute('disabled', 'disabled');
      document.getElementById('finalizeBtn').setAttribute('disabled', 'disabled');
      if (defenseEl) defenseEl.disabled = true;
      renderRooms();
      showFinishOverlay();
    }

    document.getElementById('finalizeBtn').addEventListener('click', finalizeRound);
    document.getElementById('finishOverlayReview').addEventListener('click', function () {
      document.getElementById('finishOverlay').style.display = 'none';
      document.getElementById('stationRoot').style.display = '';
      renderRooms();
    });

    if (state.finished) {
      openFinalizeBtn.setAttribute('disabled', 'disabled');
      showFinishOverlay();
    }
  }
})();

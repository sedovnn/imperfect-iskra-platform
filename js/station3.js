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
    return { finished: false, startedAt: new Date().toISOString() };
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

    // ---------- finalize ----------

    function showFinishOverlay() {
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
      state.finished = true;
      state.finishedAt = new Date().toISOString();
      saveState();
      clearTimeout(backendSyncTimer);
      syncStateToBackend();
      document.getElementById('finalizeBtn').setAttribute('disabled', 'disabled');
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
      document.getElementById('finalizeBtn').setAttribute('disabled', 'disabled');
      showFinishOverlay();
    }
  }
})();

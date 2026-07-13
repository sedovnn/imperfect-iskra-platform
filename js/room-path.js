// i(m)perfect — «Черновик к мартовскому комитету» (кейс «Искра»). Навык ПП
// целиком: декомпозиция цели и маршрута (ПП-1) + работа с барьерами и
// ресурсами (ПП-2). Один открытый вопрос про целевое состояние и путь к нему,
// один follow-up про то, что мешает и на что можно опереться — без отдельных
// полей «барьер»/«enabler», чтобы структура не была подсказана заранее.

(function () {
  var session = null;
  var state = null;

  function storageKey(bib) { return 'imp_room_path_' + bib; }
  function station2Key(bib) { return 'imp_station2_' + bib; }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem('imp_current_session') || 'null'); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { answer1: '', answer2: '', step: 'q1', finished: false, startedAt: new Date().toISOString() };
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
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
    window.imp.callApi('saveRoomPath', { bib: session.bib, state: state });
  }

  // ---------- gate ----------

  session = loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }

  // восстановление доступа на новом устройстве: локально для этой комнаты пусто —
  // сначала подтягиваем реальный прогресс с бэкенда, иначе следующий же автосейв
  // затрёт его пустым стейтом (см. api.js hydrateOnce) — фоновая проверка,
  // не блокирует рендер; если найдётся реальный прогресс, страница перезагрузится сама
  window.imp.hydrateOnce('loadRoomPath', session.bib, storageKey(session.bib));

  function localStation2Finished() {
    try {
      var raw = localStorage.getItem(station2Key(session.bib));
      if (!raw) return false;
      return !!JSON.parse(raw).finished;
    } catch (e) { return false; }
  }

  function proceedToRoom() {
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
        proceedToRoom();
      } else if (res && res.ok) {
        showStation2Gate();
      } else if (localStation2Finished()) {
        proceedToRoom();
      } else {
        showStation2Gate();
      }
    });
  } else if (localStation2Finished()) {
    proceedToRoom();
  } else {
    showStation2Gate();
  }

  // ---------- workspace ----------

  function initWorkspace() {
    state = loadState(session.bib);

    var introKey = 'imp_room_path_intro_seen_' + session.bib;
    var introEl = document.getElementById('stationIntro');
    if (localStorage.getItem(introKey)) introEl.style.display = 'none';
    document.getElementById('dismissIntro').addEventListener('click', function () {
      introEl.style.display = 'none';
      localStorage.setItem(introKey, '1');
    });

    var body = document.getElementById('roomBody');
    var STEPS = ['q1', 'q2', 'done'];
    function stepIndex(s) { return STEPS.indexOf(s); }
    function stepLocked(s) { return state.finished || stepIndex(s) < stepIndex(state.step); }

    function buildQ1Block() {
      var locked = stepLocked('q1');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Штерн:</b> «Раз уж вы смотрите на всё это со стороны — как, по-вашему, должен выглядеть путь отсюда до целевого состояния, которое вы считаете правильным? Не общими словами: с чего начинается и куда ведёт?»</p>' +
        '<textarea class="s2-rationale" rows="4" placeholder="ваш ответ"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.answer1) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitQ1Btn" style="margin-top:12px;">Ответить →</button>');
      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.answer1 = e.target.value; saveState();
        });
        block.querySelector('#commitQ1Btn').addEventListener('click', function () {
          if (!state.answer1.trim()) {
            if (!window.confirm('Ничего не ответить — так и зафиксируем?')) return;
          }
          state.step = 'q2';
          saveState();
          render();
        });
      }
      return block;
    }

    function buildQ2Block() {
      var locked = stepLocked('q2');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Штерн</b> отпивает кофе: «Хорошо. А что реально этому мешает — и есть ли что-то, на что можно опереться?»</p>' +
        '<textarea class="s2-rationale" rows="4" placeholder="необязательно"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.answer2) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="finishBtn" style="margin-top:12px;">Завершить разговор →</button>');
      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.answer2 = e.target.value; saveState();
        });
        block.querySelector('#finishBtn').addEventListener('click', finishRoom);
      }
      return block;
    }

    function render() {
      body.innerHTML = '';
      var upTo = state.finished ? STEPS.length - 1 : stepIndex(state.step);
      if (upTo >= 0) body.appendChild(buildQ1Block());
      if (upTo >= 1) body.appendChild(buildQ2Block());
      var last = body.lastElementChild;
      if (last && !state.finished) last.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function showFinishOverlay() {
      document.getElementById('stationRoot').style.display = 'none';
      document.getElementById('finishOverlay').style.display = 'flex';
    }

    function finishRoom() {
      state.finished = true;
      state.finishedAt = new Date().toISOString();
      saveState();
      clearTimeout(backendSyncTimer);
      syncStateToBackend();
      render();
      showFinishOverlay();
    }

    document.getElementById('finishOverlayReview').addEventListener('click', function () {
      document.getElementById('finishOverlay').style.display = 'none';
      document.getElementById('stationRoot').style.display = '';
      render();
    });

    render();

    if (state.finished) showFinishOverlay();
  }
})();

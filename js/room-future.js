// i(m)perfect — «Коридор Лемеха» (кейс «Искра»). Навык МК целиком: горизонт
// рассуждения (МК-1) + тип мышления о будущем — экстраполяция / образ / сценарии /
// «другая реальность» (МК-2). Два открытых обмена репликами, без заранее
// подписанных горизонтов — участник сам решает, как далеко зайти; ИИ читает
// содержание, а не факт того, что участник заполнил конкретное поле.

(function () {
  var session = null;
  var state = null;

  function storageKey(bib) { return 'imp_room_future_' + bib; }
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
    // бэкенд для этой комнаты подключим отдельным шагом — до этого best-effort и молча не срабатывает
    window.imp.callApi('saveRoomFuture', { bib: session.bib, state: state });
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
  window.imp.hydrateOnce('loadRoomFuture', session.bib, storageKey(session.bib));

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

    var introKey = 'imp_room_future_intro_seen_' + session.bib;
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
        '<p class="s2-ageev"><b>Лемех:</b> «Через полгода я буду перед советом директоров — на сроке длиннее, чем в этом здании любят обсуждать. Одной фразой: где мы окажемся, если заглянуть по-настоящему далеко — не на квартал, а туда, где нас самих может уже не быть?»</p>' +
        '<textarea class="s2-rationale" rows="4" placeholder="ваш ответ"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.answer1) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitQ1Btn" style="margin-top:12px;">Ответить →</button>');
      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.answer1 = e.target.value; saveState();
        });
        block.querySelector('#commitQ1Btn').addEventListener('click', function () {
          if (!state.answer1.trim()) {
            if (!window.confirm('Ничего не ответить Лемеху — так и зафиксируем?')) return;
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
        '<p class="s2-ageev"><b>Лемех</b> щурится: «Хорошо. А если пойдёт не так, как вы сказали — что тогда?»</p>' +
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

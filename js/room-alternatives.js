// i(m)perfect — «Очередь в «Прожектор»» (кейс «Искра»). Навык ГА целиком:
// самостоятельная генерация альтернатив (ГА-1) + привлечение идей из разных
// областей (ГА-2). Первый вопрос остаётся открытым и ничем не подсказанным —
// это единственный источник для ГА-1, где граница 2→3 буквально требует, чтобы
// генерация была самостоятельной, а не запрошенной («не только потому, что
// вопрос прямо просил»); любая структура здесь испортила бы этот сигнал.
// Второй шаг — про ГА-2 (широта источника идей), а не про спонтанность, поэтому
// у него есть дешёвый структурный пол: самотег источника (как тег угроза/
// возможность у АК-2) + необязательная элаборация. Тег не решает уровень сам —
// ИИ всё ещё проверяет содержание элаборации на L3+.

(function () {
  var session = null;
  var state = null;

  var SOURCE_OPTIONS = [
    { value: 'own', label: 'Мои собственные суждения на месте' },
    { value: 'practice', label: 'То, что обычно делают в таких ситуациях' },
    { value: 'example', label: 'Конкретный пример откуда-то ещё' },
    { value: 'pattern', label: 'Что-то более общее, что я вижу за разными примерами' }
  ];

  function storageKey(bib) { return 'imp_room_alternatives_' + bib; }
  function station2Key(bib) { return 'imp_station2_' + bib; }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem('imp_current_session') || 'null'); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.source === undefined) parsed.source = '';
        if (parsed.sourceElaboration === undefined) parsed.sourceElaboration = '';
        return parsed;
      }
    } catch (e) {}
    return { answer1: '', source: '', sourceElaboration: '', step: 'q1', finished: false, startedAt: new Date().toISOString() };
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
    window.imp.callApi('saveRoomAlternatives', { bib: session.bib, state: state });
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
  window.imp.hydrateOnce('loadRoomAlternatives', session.bib, storageKey(session.bib));

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

    var introKey = 'imp_room_alternatives_intro_seen_' + session.bib;
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
        '<p class="s2-ageev"><b>Сосед по очереди:</b> «И как, есть версия? А что бы вы сами сделали на месте Агеева?»</p>' +
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
        '<p class="s2-ageev"><b>Сосед по очереди</b> забирает свой кофе: «Слушайте, а вам не кажется, что вы одну и ту же логику применяете? Откуда вы это вообще берёте?»</p>' +
        '<div class="rationale-block" style="margin-top:6px;"><label>Это в основном...</label></div>';

      var optWrap = document.createElement('div');
      optWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin:8px 0 12px;';
      SOURCE_OPTIONS.forEach(function (opt) {
        var lbl = document.createElement('label');
        lbl.className = 's2-radio';
        lbl.innerHTML =
          '<input type="radio" name="ga2Source" value="' + opt.value + '"' +
          (state.source === opt.value ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> ' + escapeHtml(opt.label);
        optWrap.appendChild(lbl);
      });
      block.appendChild(optWrap);

      var elabWrap = document.createElement('div');
      elabWrap.innerHTML =
        '<textarea class="s2-rationale" rows="3" placeholder="если хотите — опишите, что это за пример или паттерн (необязательно)"' +
        (locked ? ' disabled' : '') + '>' + escapeHtml(state.sourceElaboration) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="finishBtn" style="margin-top:12px;">Завершить разговор →</button>');
      block.appendChild(elabWrap);

      if (!locked) {
        optWrap.querySelectorAll('input[name="ga2Source"]').forEach(function (r) {
          r.addEventListener('change', function () {
            if (r.checked) { state.source = r.value; saveState(); }
          });
        });
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.sourceElaboration = e.target.value; saveState();
        });
        block.querySelector('#finishBtn').addEventListener('click', function () {
          if (!state.source) {
            if (!window.confirm('Не выбрать вариант — так и зафиксируем?')) return;
          }
          finishRoom();
        });
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

// i(m)perfect — «Черновик к мартовскому комитету» (кейс «Искра»). Навык ПП
// целиком: декомпозиция цели и маршрута (ПП-1) + работа с барьерами и
// ресурсами (ПП-2). В отличие от ГА/МК, граничные тесты ПП — про структуру
// и содержание ответа, а не про спонтанность (ни один из них не требует
// «не потому, что вопрос попросил») — поэтому здесь безопасно дать реальный
// структурный каркас: поля текущее/целевое + список этапов (стартует пустым,
// участник сам решает, сколько добавить) для ПП-1, и два раздельных списка
// барьеры/ресурсы для ПП-2. Каркас организует собственный текст участника,
// не подсказывает содержание — связность этапов и качество барьер→ресурс
// по-прежнему решает ИИ.

(function () {
  var session = null;
  var state = null;

  function storageKey(bib) { return 'imp_room_path_' + bib; }
  function station2Key(bib) { return 'imp_station2_' + bib; }
  function uid() { return 'id_' + Math.random().toString(36).slice(2, 10); }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem('imp_current_session') || 'null'); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.currentState === undefined) parsed.currentState = '';
        if (parsed.targetState === undefined) parsed.targetState = '';
        if (!parsed.stages) parsed.stages = [];
        if (!parsed.barriers) parsed.barriers = [];
        if (!parsed.enablers) parsed.enablers = [];
        return parsed;
      }
    } catch (e) {}
    return {
      currentState: '', targetState: '', stages: [], barriers: [], enablers: [],
      step: 'q1', finished: false, startedAt: new Date().toISOString()
    };
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
    document.getElementById('reopenIntroBtn').addEventListener('click', function () {
      introEl.style.display = 'flex';
    });

    var body = document.getElementById('roomBody');
    var STEPS = ['q1', 'q2', 'done'];
    function stepIndex(s) { return STEPS.indexOf(s); }
    function stepLocked(s) { return state.finished || stepIndex(s) < stepIndex(state.step); }

    // ---------- блок 1: путь к цели (ПП-1) ----------

    function buildQ1Block() {
      var locked = stepLocked('q1');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Штерн:</b> «Раз уж вы смотрите на всё это со стороны — как, по-вашему, добраться отсюда туда, где нам нужно оказаться?»</p>' +
        '<div class="field-row" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">' +
          '<div class="field"><label>Текущее состояние</label><input type="text" class="pp-current" placeholder="где мы сейчас"' + (locked ? ' disabled' : '') + ' value="' + escapeHtml(state.currentState) + '" /></div>' +
          '<div class="field"><label>Целевое состояние</label><input type="text" class="pp-target" placeholder="куда должны прийти"' + (locked ? ' disabled' : '') + ' value="' + escapeHtml(state.targetState) + '" /></div>' +
        '</div>' +
        '<div class="pp-stages" data-list="stages"></div>' +
        (locked ? '' : '<button class="btn btn-ghost" id="addStageBtn" style="margin-top:10px;">+ добавить этап</button>') +
        (locked ? '' : '<button class="btn btn-primary" id="commitQ1Btn" style="margin-top:12px; margin-left:8px;">Ответить →</button>');

      var stagesList = block.querySelector('[data-list="stages"]');

      function renderStages() {
        stagesList.innerHTML = '';
        state.stages.forEach(function (st, i) {
          var item = document.createElement('div');
          item.className = 'pp-stage-item';
          item.innerHTML =
            '<div class="pp-stage-head"><span>Этап ' + (i + 1) + '</span>' +
              (locked ? '' : '<button class="pp-stage-remove" title="Убрать этап">✕</button>') +
            '</div>' +
            '<textarea class="pp-stage-desc" rows="2" placeholder="что происходит на этом этапе"' + (locked ? ' disabled' : '') + '>' + escapeHtml(st.description) + '</textarea>' +
            '<textarea class="pp-stage-rationale" rows="2" placeholder="почему этот этап идёт здесь, а не раньше/позже (необязательно)"' + (locked ? ' disabled' : '') + '>' + escapeHtml(st.rationale) + '</textarea>';
          if (!locked) {
            item.querySelector('.pp-stage-desc').addEventListener('input', function (e) { st.description = e.target.value; saveState(); });
            item.querySelector('.pp-stage-rationale').addEventListener('input', function (e) { st.rationale = e.target.value; saveState(); });
            item.querySelector('.pp-stage-remove').addEventListener('click', function () {
              state.stages = state.stages.filter(function (s) { return s.id !== st.id; });
              saveState();
              renderStages();
            });
          }
          stagesList.appendChild(item);
        });
      }
      renderStages();

      if (!locked) {
        block.querySelector('.pp-current').addEventListener('input', function (e) { state.currentState = e.target.value; saveState(); });
        block.querySelector('.pp-target').addEventListener('input', function (e) { state.targetState = e.target.value; saveState(); });
        block.querySelector('#addStageBtn').addEventListener('click', function () {
          state.stages.push({ id: uid(), description: '', rationale: '' });
          saveState();
          renderStages();
        });
        block.querySelector('#commitQ1Btn').addEventListener('click', function () {
          if (!state.targetState.trim() && !state.stages.length) {
            if (!window.confirm('Ничего не ответить — так и зафиксируем?')) return;
          }
          state.step = 'q2';
          saveState();
          render();
        });
      }
      return block;
    }

    // ---------- блок 2: барьеры и ресурсы (ПП-2) ----------

    function buildQ2Block() {
      var locked = stepLocked('q2');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Штерн</b> отпивает кофе: «Хорошо. А что реально этому мешает — и есть ли что-то, на что можно опереться?»</p>' +
        '<div class="pp-columns">' +
          '<div class="pp-column"><h4>Барьеры</h4><div class="pp-list" data-list="barriers"></div>' +
            (locked ? '' : '<button class="btn btn-ghost" data-add="barriers" style="margin-top:8px;">+ добавить барьер</button>') +
          '</div>' +
          '<div class="pp-column"><h4>Опора / ресурсы</h4><div class="pp-list" data-list="enablers"></div>' +
            (locked ? '' : '<button class="btn btn-ghost" data-add="enablers" style="margin-top:8px;">+ добавить ресурс</button>') +
          '</div>' +
        '</div>' +
        (locked ? '' : '<button class="btn btn-primary" id="finishBtn" style="margin-top:16px;">Завершить разговор →</button>');

      function renderList(key, placeholder) {
        var listEl = block.querySelector('[data-list="' + key + '"]');
        listEl.innerHTML = '';
        state[key].forEach(function (it) {
          var item = document.createElement('div');
          item.className = 'pp-list-item';
          item.innerHTML =
            '<textarea rows="2" placeholder="' + escapeHtml(placeholder) + '"' + (locked ? ' disabled' : '') + '>' + escapeHtml(it.text) + '</textarea>' +
            (locked ? '' : '<button class="pp-item-remove" title="Убрать">✕</button>');
          if (!locked) {
            item.querySelector('textarea').addEventListener('input', function (e) { it.text = e.target.value; saveState(); });
            item.querySelector('.pp-item-remove').addEventListener('click', function () {
              state[key] = state[key].filter(function (x) { return x.id !== it.id; });
              saveState();
              renderList(key, placeholder);
            });
          }
          listEl.appendChild(item);
        });
      }
      renderList('barriers', 'что мешает на пути к цели');
      renderList('enablers', 'на что можно опереться');

      if (!locked) {
        block.querySelectorAll('[data-add]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var key = btn.getAttribute('data-add');
            var placeholder = key === 'barriers' ? 'что мешает на пути к цели' : 'на что можно опереться';
            state[key].push({ id: uid(), text: '' });
            saveState();
            renderList(key, placeholder);
          });
        });
        block.querySelector('#finishBtn').addEventListener('click', function () {
          if (!state.barriers.length && !state.enablers.length) {
            if (!window.confirm('Ничего не ответить — так и зафиксируем?')) return;
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

    render();

    if (state.finished) showFinishOverlay();
  }
})();

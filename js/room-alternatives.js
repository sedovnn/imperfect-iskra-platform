// i(m)perfect — «Очередь в «Прожектор»» (кейс «Искра»). Навык ГА целиком:
// самостоятельная генерация альтернатив (ГА-1) + привлечение идей из разных
// областей (ГА-2).
//
// ПЕРЕСОБРАНО (валидация 2026-07-18): прежняя версия просила ЗАЩИТИТЬ одну
// позицию — это не вызывало гейт ГА 2→3 («две альтернативы на разных
// механизмах»), и сильный кросс-отраслевой сигнал (3→4) повисал, не в силах
// засчитаться. Ключевое ограничение: ГА-1 2→3 требует, чтобы генерация была
// САМОСТОЯТЕЛЬНОЙ («не только потому, что вопрос прямо просил») — поэтому
// напрямую просить список альтернатив нельзя, это навсегда рубит сигнал на L2.
//
// Решение — провокация вместо просьбы. Три шага:
//   q1  Олег Брагин (из первой сотни, 20 лет на платформе) ОТРИЦАЕТ, что выбор
//       вообще был («выбора обычно нет, любой пришёл бы к тому же»). Естественное
//       возражение на это — не «мой ход прав» (защита), а «варианты БЫЛИ, вот
//       они» → участник САМ разворачивает альтернативы, чтобы доказать, что выбор
//       существовал (спонтанная генерация, ложится в answer1 — единственный
//       источник ГА-1). Списка не просим (иначе рубится самостоятельность
//       ga1_2to3); провокация отрицанием, не запросом. Обобщённо, без цитаты
//       позиции участника, чтобы не якорить.
//   q2  Брагин добивает про под-решения внутри ответа («где сам сомневался,
//       что отбросил») → subdecisions (ГА-1 3→4).
//   q3  Позже, отдельным шагом — человек с ДРУГОГО этажа (логистика Меридиана)
//       роняет структурную рифму из своего мира (не готовое решение) и уходит;
//       Брагин легитимизирует перенос («тут все друг у друга подсматривают») и
//       спрашивает, откуда идея → источник + элаборация (ГА-2). Рифму участник
//       переносит сам — источник не подаётся готовым.
//
// Поля те же (answer1/subdecisions/sources/sourceElaboration) — судью ГА в
// backend/code.js и деплой не трогаем, промпт уже читает всё это и верен §10.

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
    try { return window.imp.loadSession(); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        // миграция: source (одна строка) → sources (массив, несколько источников)
        if (!parsed.sources) parsed.sources = parsed.source ? [parsed.source] : [];
        if (parsed.subdecisions === undefined) parsed.subdecisions = '';
        if (parsed.sourceElaboration === undefined) parsed.sourceElaboration = '';
        // миграция шагов: прежний поток был ['q1','q2','done'] (q2 = под-решения +
        // источник вместе). Теперь ['q1','q2','q3','done']. Старый step 'q2'
        // совпадает по смыслу (под-решения); поля источника, если уже заполнены,
        // подтянутся на q3 предзаполненными — потери нет.
        delete parsed.source;
        return parsed;
      }
    } catch (e) {}
    return { answer1: '', sources: [], subdecisions: '', sourceElaboration: '', step: 'q1', finished: false, startedAt: new Date().toISOString() };
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
    document.getElementById('reopenIntroBtn').addEventListener('click', function () {
      introEl.style.display = 'flex';
    });

    var body = document.getElementById('roomBody');
    var STEPS = ['q1', 'q2', 'q3', 'done'];
    function stepIndex(s) { return STEPS.indexOf(s); }
    function stepLocked(s) { return state.finished || stepIndex(s) < stepIndex(state.step); }

    // q1 — Брагин УТВЕРЖДАЕТ, что ход один, и предлагает переубедить. Списка не
    // просим: генерация всплывает как возражение → спонтанность (ГА-1 2→3 «б»)
    // сохранена. Обобщённо, без цитаты позиции участника — чтобы не якорить.
    function buildQ1Block() {
      var locked = stepLocked('q1');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Олег Брагин</b> скользит взглядом по вашему бейджу: «Консультант, значит. Двадцать лет я тут — и скажу прямо: выбора обычно нет. „Развилки“, „альтернативы“ — это вы любите, а на деле любой на вашем месте пришёл бы ровно к тому же ходу. Так что докажите, что я неправ: что у вас правда было из чего выбирать — и почему вы отмели остальное, а не приняли единственное очевидное.»</p>' +
        '<textarea class="s2-rationale" rows="4" placeholder="ваш ответ Брагину"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.answer1) + '</textarea>' +
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

    // q2 — Брагин добивает про под-решения ВНУТРИ ответа (ГА-1 3→4). Не
    // запрашивает альтернативы к главному вопросу — спрашивает, где сам колебался.
    function buildQ2Block() {
      var locked = stepLocked('q2');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev">' + ((state.answer1 || '').trim().length >= 40
          ? '<b>Брагин</b> хмыкает: «Ладно. Не пустой звук — уже кое-что».'
          : '<b>Брагин</b> пожимает плечами: «Ну, допустим».') + '</p>' +
        '<p class="s2-ageev"><b>Брагин</b> отхлёбывает кофе: «Ну а внутри-то? Какие ещё ходы вы взвешивали по дороге — и почему в итоге отмели каждый? Вот это мне и интересно.»</p>' +
        '<textarea class="ga-subdec" rows="3" placeholder="ходы, что рассматривали и отвергли — по одному-двум словам на каждый и почему"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.subdecisions) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitQ2Btn" style="margin-top:12px;">Дальше →</button>');
      if (!locked) {
        block.querySelector('.ga-subdec').addEventListener('input', function (e) {
          state.subdecisions = e.target.value; saveState();
        });
        block.querySelector('#commitQ2Btn').addEventListener('click', function () {
          state.step = 'q3';
          saveState();
          render();
        });
      }
      return block;
    }

    // плейсхолдер элаборации подстраивается под выбор: приглашает показать паттерн/пример,
    // а не просто «если хотите» — чтобы верхние уровни ГА-2 демонстрировались, а не заявлялись.
    function elabPlaceholder() {
      if (state.sources.indexOf('pattern') !== -1) return 'сформулируйте паттерн одной фразой — что общего вы видите за разными случаями';
      if (state.sources.indexOf('example') !== -1) return 'назовите пример и из какой он области';
      return 'если хотите — коротко, что именно навело (необязательно)';
    }

    // q3 — ПОЗЖЕ, отдельным шагом. Человек с другого этажа роняет структурную
    // рифму (не готовое решение) и уходит; Брагин легитимизирует перенос и
    // спрашивает источник → ГА-2 (широта источника идей). Рифму участник
    // переносит сам — источник не подаётся готовым.
    function buildQ3Block() {
      var locked = stepLocked('q3');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Женщина с логистики Меридиана</b>, вполуха из очереди позади: «У нас та же песня была — одна система тянула три разных процесса разом и постоянно клинила». Забирает свой стакан, уходит к лифтам.</p>' +
        '<p class="s2-ageev"><b>Брагин</b> провожает её взглядом: «Тут все друг у друга подсматривают, кофейня такая. А вы сами к своему как пришли — из опыта, где-то видели?»</p>' +
        '<div class="rationale-block" style="margin-top:6px;"><label>Отметьте всё, что применили</label></div>';

      var optWrap = document.createElement('div');
      optWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin:8px 0 12px;';
      SOURCE_OPTIONS.forEach(function (opt) {
        var lbl = document.createElement('label');
        lbl.className = 's2-radio';
        lbl.innerHTML =
          '<input type="checkbox" name="ga2Source" value="' + opt.value + '"' +
          (state.sources.indexOf(opt.value) !== -1 ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> ' + escapeHtml(opt.label);
        optWrap.appendChild(lbl);
      });
      block.appendChild(optWrap);

      var elabWrap = document.createElement('div');
      elabWrap.innerHTML =
        '<textarea class="ga-elab" rows="3" placeholder="' + escapeHtml(elabPlaceholder()) + '"' +
        (locked ? ' disabled' : '') + '>' + escapeHtml(state.sourceElaboration) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="finishBtn" style="margin-top:12px;">Завершить разговор →</button>');
      block.appendChild(elabWrap);

      if (!locked) {
        optWrap.querySelectorAll('input[name="ga2Source"]').forEach(function (c) {
          c.addEventListener('change', function () {
            var v = c.value, i = state.sources.indexOf(v);
            if (c.checked && i === -1) state.sources.push(v);
            else if (!c.checked && i !== -1) state.sources.splice(i, 1);
            saveState();
            block.querySelector('.ga-elab').setAttribute('placeholder', elabPlaceholder());
          });
        });
        block.querySelector('.ga-elab').addEventListener('input', function (e) {
          state.sourceElaboration = e.target.value; saveState();
        });
        block.querySelector('#finishBtn').addEventListener('click', function () {
          if (!state.sources.length) {
            if (!window.confirm('Не отметить ни одного источника — так и зафиксируем?')) return;
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
      if (upTo >= 2) body.appendChild(buildQ3Block());
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

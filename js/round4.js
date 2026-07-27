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
  // имя из окна Агеева (может быть пустым) — для обращения Штерна; textContent сам экранирует
  function pname() { return session && session.name ? String(session.name).trim() : ''; }
  var state = null;

  function storageKey(bib) { return 'imp_round4_' + bib; }
  function station2Key(bib) { return 'imp_round2_' + bib; }
  function uid() { return 'id_' + Math.random().toString(36).slice(2, 10); }

  function loadSession() {
    try { return window.imp.loadSession(); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.currentState === undefined) parsed.currentState = '';
        if (parsed.targetState === undefined) parsed.targetState = '';
        if (parsed.contingency === undefined) parsed.contingency = '';
        if (!parsed.stages) parsed.stages = [];
        if (!parsed.barriers) parsed.barriers = [];
        if (!parsed.enablers) parsed.enablers = [];
        // миграция: новые поля этапов/барьеров у старых сессий
        parsed.stages.forEach(function (st) { if (st.doneWhen === undefined) st.doneWhen = ''; });
        parsed.barriers.forEach(function (b) { if (b.type === undefined) b.type = ''; if (b.counter === undefined) b.counter = ''; });
        return parsed;
      }
    } catch (e) {}
    return {
      currentState: '', targetState: '', contingency: '', stages: [], barriers: [], enablers: [],
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
    // возвращает Promise<boolean>: подтвердил ли бэкенд запись. Нужно на завершении
    // раунда — финиш-оверлей не показываем, пока ответ не принят (см. finishRoom)
    if (!window.imp.isApiConfigured()) return Promise.resolve(true);
    return window.imp.callApiConfirmed('saveRoomPath', { bib: session.bib, state: state });
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
    document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(6, '0');
    var sg = document.getElementById('sternGreet');
    if (sg) sg.textContent = pname() ? (pname() + ', слышал') : 'Слышал';
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

    // позиция со станции 2 — то, путь к чему Штерн заставляет расписать (ПП).
    var s2 = null;
    try { s2 = JSON.parse(localStorage.getItem(station2Key(session.bib)) || 'null'); } catch (e) {}
    var stance = window.imp.stanceOf && window.imp.stanceOf(s2);
    var stancePhrase = stance ? stance.label : 'выбранный вами курс';
    // Когда название позиции стоит ВНУТРИ реплики (сама реплика уже в «ёлочках»),
    // берём его во внутренние „лапки“ — иначе на стыке выходит «« (stanceOf отдаёт
    // метку уже в «ёлочках»). Тот же приём, что в репликах раунда 2.
    var stanceInner = stancePhrase.replace(/^«/, '„').replace(/»$/, '“');
    // первый ход со станции 2 — подставляем как опору, чтобы путь не начинался с чистого листа
    var firstMove = (s2 && s2.firstAction ? String(s2.firstAction).trim() : '');

    // ПРЕДЗАПОЛНЕНИЕ (relocate декомпозиции в дом): первый ход = первый этап пути.
    // Данные 7 живых: этапы «Пути» пусты у 5/7, т.к. комната последняя и с чистого
    // листа на усталости. Сеем первый этап из «первого хода» Станции 2, чтобы
    // участник ДОРАБАТЫВАЛ, а не начинал с нуля. Один раз (флаг pathPrefilled);
    // если удалит — не пересеваем.
    if (!state.pathPrefilled && !state.finished && !(state.stages || []).length && firstMove) {
      state.stages.push({ id: uid(), description: firstMove, rationale: '', doneWhen: '' });
      state.pathPrefilled = true;
      saveState();
    }

    var introKey = 'imp_round4_intro_seen_' + session.bib;
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
        '<p class="s2-ageev"><b>Штерн</b> ставит чашку: «' + escapeHtml(stanceInner) + ' — на словах красиво. Но я финансист, мне нужен путь, а не название. Покажите его по-честному: где мы сейчас — и какими шагами дойдём до цели?»</p>' +
        (firstMove ? '<div class="pp-firstmove">Ваш первый ход из раунда 2: «' + escapeHtml(firstMove) + '». С него и начните раскладывать путь — не с чистого листа.</div>' : '') +
        '<div class="field-row" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">' +
          '<div class="field"><label>Текущее состояние</label><input type="text" class="pp-current" aria-label="Текущее состояние — где мы сейчас" placeholder="где мы сейчас"' + (locked ? ' disabled' : '') + ' value="' + escapeHtml(state.currentState) + '" /></div>' +
          '<div class="field"><label>Целевое состояние</label><input type="text" class="pp-target" aria-label="Целевое состояние — куда должны прийти" placeholder="куда должны прийти"' + (locked ? ' disabled' : '') + ' value="' + escapeHtml(state.targetState) + '" /></div>' +
        '</div>' +
        '<div class="pp-stages" data-list="stages"></div>' +
        (locked ? '' : '<button class="btn btn-ghost" id="addStageBtn" style="margin-top:10px;">+ добавить этап</button>') +
        '<div class="field pp-contingency-field" style="margin-top:16px;"><label>Что меняет маршрут</label>' +
          '<textarea class="pp-contingency" aria-label="Что может заставить перестроить маршрут" rows="2" placeholder="ваш ответ"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.contingency) + '</textarea></div>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitQ1Btn" style="margin-top:12px;">Ответить →</button>');

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
            '<textarea class="pp-stage-desc" aria-label="Что происходит на этом этапе" rows="2" placeholder="что происходит на этом этапе"' + (locked ? ' disabled' : '') + '>' + escapeHtml(st.description) + '</textarea>' +
            // Поле «этап завершён, когда… — индикатор перехода» убрано (аудит 2026-07-27):
            // оно реализовывало признак верхнего уровня ПП-1 («критерии перехода по
            // результату») обязательной графой — его проходили все. Кто мыслит критериями,
            // напишет их в описании этапа сам. st.doneWhen в стейте/бэкенде остаётся
            // (легаси-данные читаются судьёй как раньше).
            '<details class="pp-stage-more"' + (st.rationale ? ' open' : '') + '><summary>детали этапа: почему здесь</summary>' +
              '<textarea class="pp-stage-rationale" aria-label="Почему этап на этом месте" rows="2" placeholder="почему на этом месте"' + (locked ? ' disabled' : '') + '>' + escapeHtml(st.rationale) + '</textarea>' +
            '</details>';
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
        block.querySelector('.pp-contingency').addEventListener('input', function (e) { state.contingency = e.target.value; saveState(); });
        block.querySelector('#addStageBtn').addEventListener('click', function () {
          state.stages.push({ id: uid(), description: '', rationale: '', doneWhen: '' });
          saveState();
          renderStages();
        });
        block.querySelector('#commitQ1Btn').addEventListener('click', function () {
          var go = function () { state.step = 'q2'; saveState(); render(); };
          if (!state.targetState.trim() && !state.stages.length) {
            window.imp.confirm('Ничего не ответить Штерну — так и зафиксируем?', { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
              .then(function (ok) { if (ok) go(); });
            return;
          }
          go();
        });
      }
      return block;
    }

    // ---------- блок 2: барьеры и ресурсы (ПП-2) ----------

    function buildQ2Block() {
      var locked = stepLocked('q2');
      var block = document.createElement('div');
      block.className = 's2-block';
      var pathLaidOut = (state.targetState || '').trim() || (state.stages || []).some(function (s) { return (s.description || '').trim(); });
      var react = pathLaidOut
        ? '<b>Штерн</b> кивает на этапы: «Уже похоже на план. Хорошо».'
        : '<b>Штерн</b> поднимает бровь: «Для меня это пока набросок — и тогда у меня к вам ещё один вопрос».';
      block.innerHTML =
        '<p class="s2-ageev">' + react + '</p>' +
        '<p class="s2-ageev"><b>Штерн</b> проходится по вашим этапам глазами: «Что реально этому помешает — и есть ли на что опереться? Мешает всегда что-то конкретное, а не „рынок вообще“. Ну и где совсем стена, а где можно обойти — тоже не маловажный фактор в бизнесе.»</p>' +
        '<div class="pp-columns">' +
          '<div class="pp-column"><h4>Барьеры</h4><div class="pp-list" data-list="barriers"></div>' +
            (locked ? '' : '<button class="btn btn-ghost" data-add="barriers" style="margin-top:8px;">+ добавить барьер</button>') +
          '</div>' +
          '<div class="pp-column"><h4>Опора / ресурсы</h4><div class="pp-list" data-list="enablers"></div>' +
            (locked ? '' : '<button class="btn btn-ghost" data-add="enablers" style="margin-top:8px;">+ добавить ресурс</button>') +
          '</div>' +
        '</div>' +
        // диегетическое закрытие вместо механического «Завершить разговор»:
        // раунд заканчивается действием в истории (комментарий Егора про «обрыв
        // таблицей»; глубокий закрывающий вопрос отвергнут — не перегружаем мышление)
        (locked ? '' : '<button class="btn btn-primary" id="finishBtn" style="margin-top:16px;">Отдать наброски Штерну →</button>');

      // Барьеры (ПП-2): карточка = что мешает + тип «стена/можно обойти» + чем закрываем.
      function renderBarriers() {
        var listEl = block.querySelector('[data-list="barriers"]');
        listEl.innerHTML = '';
        state.barriers.forEach(function (it) {
          var item = document.createElement('div');
          item.className = 'pp-barrier-card';
          item.innerHTML =
            '<div class="pp-barrier-top">' +
              '<textarea rows="2" class="pp-barrier-text" aria-label="Что мешает на пути к цели" placeholder="что мешает на пути к цели"' + (locked ? ' disabled' : '') + '>' + escapeHtml(it.text) + '</textarea>' +
              (locked ? '' : '<button class="pp-item-remove" title="Убрать">✕</button>') +
            '</div>' +
            '<div class="pp-type">' +
              '<button type="button" class="pp-type-btn' + (it.type === 'fixed' ? ' is-on' : '') + '" data-type="fixed"' + (locked ? ' disabled' : '') + '>стена</button>' +
              '<button type="button" class="pp-type-btn' + (it.type === 'surmountable' ? ' is-on' : '') + '" data-type="surmountable"' + (locked ? ' disabled' : '') + '>можно обойти</button>' +
            '</div>' +
            '<textarea rows="2" class="pp-barrier-counter" aria-label="Что с этим делать" placeholder="что с этим делать — если есть ответ"' + (locked ? ' disabled' : '') + '>' + escapeHtml(it.counter) + '</textarea>';
          if (!locked) {
            item.querySelector('.pp-barrier-text').addEventListener('input', function (e) { it.text = e.target.value; saveState(); });
            item.querySelector('.pp-barrier-counter').addEventListener('input', function (e) { it.counter = e.target.value; saveState(); });
            item.querySelectorAll('.pp-type-btn').forEach(function (b) {
              b.addEventListener('click', function () {
                var t = b.getAttribute('data-type');
                it.type = (it.type === t) ? '' : t;  // повторный клик снимает
                saveState();
                renderBarriers();
              });
            });
            item.querySelector('.pp-item-remove').addEventListener('click', function () {
              state.barriers = state.barriers.filter(function (x) { return x.id !== it.id; });
              saveState();
              renderBarriers();
            });
          }
          listEl.appendChild(item);
        });
      }

      function renderEnablers() {
        var listEl = block.querySelector('[data-list="enablers"]');
        listEl.innerHTML = '';
        state.enablers.forEach(function (it) {
          var item = document.createElement('div');
          item.className = 'pp-list-item';
          item.innerHTML =
            '<textarea rows="2" aria-label="Опора или ресурс" placeholder="на что можно опереться"' + (locked ? ' disabled' : '') + '>' + escapeHtml(it.text) + '</textarea>' +
            (locked ? '' : '<button class="pp-item-remove" title="Убрать">✕</button>');
          if (!locked) {
            item.querySelector('textarea').addEventListener('input', function (e) { it.text = e.target.value; saveState(); });
            item.querySelector('.pp-item-remove').addEventListener('click', function () {
              state.enablers = state.enablers.filter(function (x) { return x.id !== it.id; });
              saveState();
              renderEnablers();
            });
          }
          listEl.appendChild(item);
        });
      }
      renderBarriers();
      renderEnablers();

      if (!locked) {
        block.querySelectorAll('[data-add]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var key = btn.getAttribute('data-add');
            if (key === 'barriers') {
              state.barriers.push({ id: uid(), text: '', type: '', counter: '' });
              saveState();
              renderBarriers();
            } else {
              state.enablers.push({ id: uid(), text: '' });
              saveState();
              renderEnablers();
            }
          });
        });
        block.querySelector('#finishBtn').addEventListener('click', function () {
          if (!state.barriers.length && !state.enablers.length) {
            window.imp.confirm('Ничего не ответить Штерну — так и зафиксируем?', { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
              .then(function (ok) { if (ok) finishRoom(); });
            return;
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
      render();
      // Финиш-оверлей ждёт подтверждения записи: раньше он показывался сразу,
      // и при сбое сети участник уходил дальше уверенным, что ответ сохранён,
      // хотя до бэкенда он не дошёл. Не дождались — оверлей всё равно покажем
      // (локально всё сохранено), но статус в полосе времени скажет «не
      // сохранено», а api.js повторит отправку сам.
      syncStateToBackend().then(showFinishOverlay, showFinishOverlay);
    }

    render();

    if (state.finished) showFinishOverlay();
  }
})();

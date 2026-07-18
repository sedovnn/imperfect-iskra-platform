// i(m)perfect — станция 2 «Встреча с Агеевым» (кейс «Искра»).
// Навык ПР целиком: ПР-1 (что выбрано — сортировка собственных карточек станции 1
// в приоритеты и явные отказы) + ПР-2 (почему выбрано и держится ли под давлением).
// Разговор идёт только вперёд: зафиксированные шаги не переигрываются — как в
// настоящей встрече. Оценку считает бэкенд при завершении; участнику не показывается.

(function () {
  var MAX_PRIORITIES = 5;
  var session = null;
  var state = null;

  function storageKey(bib) { return 'imp_station2_' + bib; }
  function station1Key(bib) { return 'imp_station1_' + bib; }

  function loadSession() {
    try { return window.imp.loadSession(); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (!parsed.cardsSnapshot) parsed.cardsSnapshot = [];
        if (!parsed.priorities) parsed.priorities = [];
        if (!parsed.rejected) parsed.rejected = [];
        if (!parsed.step) parsed.step = 'sort';
        if (!parsed.stance) parsed.stance = '';
        if (!parsed.stanceOther) parsed.stanceOther = '';
        if (!parsed.stanceCriteria) parsed.stanceCriteria = '';
        if (parsed.firstAction === undefined) parsed.firstAction = '';
        // миграция: сессия, начатая ДО появления шага 'stance', могла уже уйти
        // на 'proactive' — тогда вставленный позади текущего шага блок развилки
        // рендерился «пройденным», т.е. запертым: радио видны, но не кликабельны.
        // Возвращаем разговор на шаг развилки; набранный текст proactive не
        // теряется (лежит в state.proactiveText и вернётся при следующем шаге).
        if (parsed.step === 'proactive' && !parsed.stance && !parsed.finished) parsed.step = 'stance';
        return parsed;
      }
    } catch (e) {}
    return {
      cardsSnapshot: [],   // копия карточек станции 1 (id+text) — самодостаточна для судьи и кабинета
      priorities: [],      // [{cardId, target}] — порядок массива = ранг
      rejected: [],        // [{cardId, freed}] — явные отказы
      rejectionRule: '',
      rationale: '',
      firstAction: '',     // «первый ход» — каким действием откроют приоритет №1 (нарратив, не в балл)
      stressChoice: '',    // 'hold' | 'calibrate' | 'change'
      stressComment: '',
      proactiveText: '',
      // рекомендация по развилке из письма Агеева (задание №3 кейса) — спина
      // всего финала. 'fortress' | 'secondCurve' | 'other'; stanceOther — своя
      // позиция, если обе неверны; stanceCriteria — два критерия, что Агеев просит.
      stance: '',
      stanceOther: '',
      stanceCriteria: '',
      step: 'sort',        // 'sort' → 'rationale' → 'stress' → 'stance' → 'proactive'
      finished: false,
      startedAt: new Date().toISOString()
    };
  }

  function uid() { return 'id_' + Math.random().toString(36).slice(2, 10); }

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
    window.imp.callApi('saveStation2', { bib: session.bib, state: state });
  }

  // ---------- gate ----------

  session = loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }

  // восстановление доступа на новом устройстве: локально для этой станции пусто —
  // сначала подтягиваем реальный прогресс с бэкенда, иначе следующий же автосейв
  // затрёт его пустым стейтом (см. api.js hydrateOnce) — фоновая проверка,
  // не блокирует рендер; если найдётся реальный прогресс, страница перезагрузится сама
  window.imp.hydrateOnce('loadStation2', session.bib, storageKey(session.bib));

  function localStation1() {
    try {
      var raw = localStorage.getItem(station1Key(session.bib));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function realCardsOf(s1state) {
    return ((s1state && s1state.cards) || []).filter(function (c) { return c.text && String(c.text).trim(); });
  }

  function proceedToStation(s1cards) {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('gateStation1').style.display = 'none';
    document.getElementById('stationRoot').style.display = '';
    document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(3, '0');
    initWorkspace(s1cards);
  }

  function showStation1Gate() {
    document.getElementById('gateStation1').style.display = 'flex';
  }

  // источник правды — бэкенд (кросс-девайсный), локальный стейт станции 1 — фолбэк
  if (window.imp.isApiConfigured()) {
    window.imp.callApi('loadStation1', { bib: session.bib }).then(function (res) {
      if (res && res.ok && res.state && res.state.finished) {
        proceedToStation(realCardsOf(res.state));
      } else if (res && res.ok) {
        showStation1Gate();
      } else if (localStation1() && localStation1().finished) {
        proceedToStation(realCardsOf(localStation1()));
      } else {
        showStation1Gate();
      }
    });
  } else if (localStation1() && localStation1().finished) {
    proceedToStation(realCardsOf(localStation1()));
  } else {
    showStation1Gate();
  }

  // ---------- workspace ----------

  function initWorkspace(s1cards) {
    state = loadState(session.bib);

    // снимок карточек: судья и кабинет читают тексты отсюда, не из станции 1.
    // Станция 1 к этому моменту завершена и заперта, так что дрейфа не будет.
    if (!state.cardsSnapshot.length) {
      state.cardsSnapshot = s1cards.map(function (c) { return { id: c.id, text: c.text }; });
      saveState();
    }

    var introKey = 'imp_station2_intro_seen_' + session.bib;
    var introEl = document.getElementById('stationIntro');
    if (localStorage.getItem(introKey)) introEl.style.display = 'none';
    document.getElementById('dismissIntro').addEventListener('click', function () {
      introEl.style.display = 'none';
      localStorage.setItem(introKey, '1');
    });
    document.getElementById('reopenIntroBtn').addEventListener('click', function () {
      introEl.style.display = 'flex';
    });

    var body = document.getElementById('s2Body');

    function cardById(id) {
      return state.cardsSnapshot.filter(function (c) { return c.id === id; })[0];
    }

    function unsortedCards() {
      var used = {};
      state.priorities.forEach(function (p) { used[p.cardId] = true; });
      state.rejected.forEach(function (r) { used[r.cardId] = true; });
      return state.cardsSnapshot.filter(function (c) { return !used[c.id]; });
    }

    function topPriorityText() {
      var top = state.priorities[0] && cardById(state.priorities[0].cardId);
      return top ? top.text : '';
    }

    var STEPS = ['sort', 'rationale', 'stress', 'stance', 'proactive'];
    function stepIndex(step) { return STEPS.indexOf(step); }
    function stepLocked(step) {
      // шаг залочен, если разговор уже ушёл дальше него (или станция завершена)
      return state.finished || stepIndex(step) < stepIndex(state.step);
    }

    // ---------- блок 1: сортировка (ПР-1) ----------

    function moveToPriorities(cardId) {
      if (state.priorities.length >= MAX_PRIORITIES) return;
      state.rejected = state.rejected.filter(function (r) { return r.cardId !== cardId; });
      if (!state.priorities.some(function (p) { return p.cardId === cardId; })) {
        state.priorities.push({ cardId: cardId, target: '' });
      }
      saveState();
      render();
    }

    function moveToRejected(cardId) {
      state.priorities = state.priorities.filter(function (p) { return p.cardId !== cardId; });
      if (!state.rejected.some(function (r) { return r.cardId === cardId; })) {
        state.rejected.push({ cardId: cardId, freed: '' });
      }
      saveState();
      render();
    }

    function moveToPool(cardId) {
      state.priorities = state.priorities.filter(function (p) { return p.cardId !== cardId; });
      state.rejected = state.rejected.filter(function (r) { return r.cardId !== cardId; });
      saveState();
      render();
    }

    function movePriority(cardId, delta) {
      var idx = -1;
      state.priorities.forEach(function (p, i) { if (p.cardId === cardId) idx = i; });
      var to = idx + delta;
      if (idx === -1 || to < 0 || to >= state.priorities.length) return;
      var item = state.priorities.splice(idx, 1)[0];
      state.priorities.splice(to, 0, item);
      saveState();
      render();
    }

    function attachCardDrag(el, cardId, locked) {
      if (locked) return;
      el.draggable = true;
      el.addEventListener('dragstart', function (ev) {
        ev.dataTransfer.setData('application/x-imp-s2-card', cardId);
        ev.dataTransfer.effectAllowed = 'move';
      });
    }

    function attachDropZone(el, onDrop, locked) {
      if (locked) return;
      el.addEventListener('dragover', function (ev) {
        ev.preventDefault();
        el.classList.add('is-drop-target');
      });
      el.addEventListener('dragleave', function () { el.classList.remove('is-drop-target'); });
      el.addEventListener('drop', function (ev) {
        ev.preventDefault();
        el.classList.remove('is-drop-target');
        var cardId = ev.dataTransfer.getData('application/x-imp-s2-card');
        if (cardId) onDrop(cardId);
      });
    }

    function buildSortBlock() {
      var locked = stepLocked('sort');
      // в экскурсии показываем механику разбора даже на залоченном шаге —
      // кнопки видны, но неактивны (обработчики вешаются только при !locked)
      var demoShow = !!(window.imp.isDemo && window.imp.isDemo());
      var showActions = !locked || demoShow;
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Агеев:</b> «Разложите: с чем идём к правлению в первую очередь, что — потом, а что честно откладываем. Не обязательно раскладывать всё — но порядок в приоритетах для меня важен».</p>' +
        '<div class="s2-columns">' +
          '<div class="s2-col" data-zone="pool"><h4>Карта</h4><p class="links-hint">неразобранное</p><div class="s2-list" data-list="pool"></div></div>' +
          '<div class="s2-col is-priorities" data-zone="priorities"><h4>Приоритеты</h4><p class="links-hint">порядок = ранг, максимум ' + MAX_PRIORITIES + '</p><div class="s2-list" data-list="priorities"></div></div>' +
          '<div class="s2-col" data-zone="rejected"><h4>Не сейчас</h4><p class="links-hint">явные отказы</p><div class="s2-list" data-list="rejected"></div></div>' +
        '</div>' +
        '<div class="rationale-block" style="margin-top:18px;">' +
          '<label>Правило отказа <span style="color:var(--muted-soft); font-weight:400; text-transform:none; letter-spacing:0;">(необязательно — какие инициативы вы отсекаете в принципе, а не перечнем)</span></label>' +
          '<textarea class="s2-rejection-rule" rows="2" placeholder="по какому принципу вы отсекаете инициативы — правилом, а не перечнем"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.rejectionRule) + '</textarea>' +
        '</div>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitSortBtn" style="margin-top:14px;">Зафиксировать приоритеты →</button>');

      var poolList = block.querySelector('[data-list="pool"]');
      var prioList = block.querySelector('[data-list="priorities"]');
      var rejList = block.querySelector('[data-list="rejected"]');

      unsortedCards().forEach(function (c) {
        var item = document.createElement('div');
        item.className = 's2-item';
        item.innerHTML = '<p>' + escapeHtml(c.text) + '</p>' +
          (showActions ?
            '<div class="s2-item-actions">' +
              (state.priorities.length < MAX_PRIORITIES ? '<button class="s2-act" data-act="prio"' + (locked ? ' disabled' : '') + '>в приоритеты</button>' : '') +
              '<button class="s2-act" data-act="rej"' + (locked ? ' disabled' : '') + '>не сейчас</button>' +
            '</div>' : '');
        if (!locked) {
          var actPrio = item.querySelector('[data-act="prio"]');
          if (actPrio) actPrio.addEventListener('click', function () { moveToPriorities(c.id); });
          item.querySelector('[data-act="rej"]').addEventListener('click', function () { moveToRejected(c.id); });
        }
        attachCardDrag(item, c.id, locked);
        poolList.appendChild(item);
      });
      if (!unsortedCards().length) poolList.innerHTML = '<p class="links-hint">пусто</p>';

      state.priorities.forEach(function (p, i) {
        var c = cardById(p.cardId);
        if (!c) return;
        var item = document.createElement('div');
        item.className = 's2-item is-priority';
        item.innerHTML =
          '<div class="s2-item-rank">' + (i + 1) + '</div>' +
          '<div class="s2-item-body"><p>' + escapeHtml(c.text) + '</p>' +
          '<input type="text" class="s2-target" placeholder="ориентир: величина и срок" value="' + escapeHtml(p.target || '') + '"' + (locked ? ' disabled' : '') + ' />' +
          '</div>' +
          (showActions ?
            '<div class="s2-item-actions">' +
              '<button class="s2-act" data-act="up" title="выше"' + (locked ? ' disabled' : '') + '>↑</button>' +
              '<button class="s2-act" data-act="down" title="ниже"' + (locked ? ' disabled' : '') + '>↓</button>' +
              '<button class="s2-act" data-act="back" title="вернуть в карту"' + (locked ? ' disabled' : '') + '>✕</button>' +
            '</div>' : '');
        if (!locked) {
          item.querySelector('[data-act="up"]').addEventListener('click', function () { movePriority(p.cardId, -1); });
          item.querySelector('[data-act="down"]').addEventListener('click', function () { movePriority(p.cardId, 1); });
          item.querySelector('[data-act="back"]').addEventListener('click', function () { moveToPool(p.cardId); });
          item.querySelector('.s2-target').addEventListener('input', function (e) { p.target = e.target.value; saveState(); });
        }
        attachCardDrag(item, p.cardId, locked);
        prioList.appendChild(item);
      });
      if (!state.priorities.length) prioList.innerHTML = '<p class="links-hint">перетащите или нажмите «в приоритеты»</p>';

      state.rejected.forEach(function (r) {
        var c = cardById(r.cardId);
        if (!c) return;
        var item = document.createElement('div');
        item.className = 's2-item is-rejected';
        item.innerHTML = '<div class="s2-item-body"><p>' + escapeHtml(c.text) + '</p>' +
          '<input type="text" class="s2-freed" placeholder="что освобождает: люди / деньги / время" value="' + escapeHtml(r.freed || '') + '"' + (locked ? ' disabled' : '') + ' />' +
          '</div>' +
          (showActions ? '<div class="s2-item-actions"><button class="s2-act" data-act="back" title="вернуть в карту"' + (locked ? ' disabled' : '') + '>✕</button></div>' : '');
        if (!locked) {
          item.querySelector('[data-act="back"]').addEventListener('click', function () { moveToPool(r.cardId); });
          item.querySelector('.s2-freed').addEventListener('input', function (e) { r.freed = e.target.value; saveState(); });
        }
        attachCardDrag(item, r.cardId, locked);
        rejList.appendChild(item);
      });
      if (!state.rejected.length) rejList.innerHTML = '<p class="links-hint">сюда — то, что откладываете сознательно</p>';

      attachDropZone(block.querySelector('[data-zone="pool"]'), moveToPool, locked);
      attachDropZone(block.querySelector('[data-zone="priorities"]'), moveToPriorities, locked);
      attachDropZone(block.querySelector('[data-zone="rejected"]'), moveToRejected, locked);

      if (!locked) {
        block.querySelector('.s2-rejection-rule').addEventListener('input', function (e) {
          state.rejectionRule = e.target.value; saveState();
        });
        block.querySelector('#commitSortBtn').addEventListener('click', function () {
          if (!state.priorities.length) {
            window.alert('Агеев ждёт хотя бы один приоритет — с чем-то идти к правлению нужно.');
            return;
          }
          if (!window.confirm('Приоритеты зафиксируются, и разговор пойдёт дальше — вернуться и пересобрать список будет нельзя. Продолжаем?')) return;
          state.step = 'rationale';
          saveState();
          render();
        });
      }

      return block;
    }

    // ---------- блок 2: обоснование №1 (вход в ПР-2) ----------

    function buildRationaleBlock() {
      var locked = stepLocked('rationale');
      // реакция Агеева на разбор (п.11): заметил ли отказы
      var sortReact = state.rejected.length
        ? '<b>Агеев</b> ведёт пальцем по списку: «Вижу, кое-что вы честно отложили. Хорошо — значит, не пытаетесь спасти всё сразу».'
        : '<b>Агеев</b>: «Ничего не отложили — ну-ну. Смелость оценю, если выдержит следующий вопрос».';
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev">' + sortReact + '</p>' +
        '<p class="s2-ageev"><b>Агеев</b> смотрит на верхнюю карточку: «Хорошо. Почему именно „' + escapeHtml(topPriorityText()) + '“ — первым? К чему нас это ведёт?»</p>' +
        '<textarea class="s2-rationale" rows="3" placeholder="ваш ответ"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.rationale) + '</textarea>' +
        // «первый ход» (п.12): чтобы финал читался как стратегия действий, а не список бед
        '<div class="rationale-block" style="margin-top:12px;">' +
          '<label>С какого конкретного действия вы откроете работу по приоритету №1? <span style="color:var(--muted-soft); font-weight:400; text-transform:none; letter-spacing:0;">(необязательно)</span></label>' +
          '<textarea class="s2-first-action" rows="2" placeholder="например: за две недели вынести на комитет решение по юр.контуру «Миры»"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.firstAction || '') + '</textarea>' +
        '</div>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitRationaleBtn" style="margin-top:12px;">Ответить →</button>');

      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.rationale = e.target.value; saveState();
        });
        block.querySelector('.s2-first-action').addEventListener('input', function (e) {
          state.firstAction = e.target.value; saveState();
        });
        block.querySelector('#commitRationaleBtn').addEventListener('click', function () {
          if (!state.rationale.trim()) {
            if (!window.confirm('Ответ пустой — промолчать в ответ на прямой вопрос Агеева? Так и зафиксируем.')) return;
          }
          state.step = 'stress';
          saveState();
          render();
        });
      }
      return block;
    }

    // ---------- блок 3: давление (стресс-тест ПР-2) ----------

    function buildStressBlock() {
      var locked = stepLocked('stress');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Агеев</b> откидывается в кресле: «Теперь то, что вы услышите на правлении. Штерн скажет: „' + escapeHtml(topPriorityText()) + '“ — не горит. Подождём полгода, будет больше данных, вернёмся к вопросу. И часть правления его поддержит. Настаиваете, что это идёт первым, — или пересобираем список?»</p>' +
        '<label class="s2-radio"><input type="radio" name="stressChoice" value="hold"' + (state.stressChoice === 'hold' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> Настаиваю: это идёт первым</label>' +
        '<label class="s2-radio"><input type="radio" name="stressChoice" value="calibrate"' + (state.stressChoice === 'calibrate' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> Пересоберу частично — вот что меняю, а что удерживаю</label>' +
        '<label class="s2-radio"><input type="radio" name="stressChoice" value="change"' + (state.stressChoice === 'change' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> Соглашусь пересобрать список</label>' +
        '<textarea class="s2-stress-comment" rows="2" placeholder="почему — в двух словах; если пересобираете частично, назовите, что меняете, а что удерживаете"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.stressComment) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitStressBtn" style="margin-top:12px;">Ответить →</button>');

      if (!locked) {
        block.querySelectorAll('input[name="stressChoice"]').forEach(function (r) {
          r.addEventListener('change', function () {
            if (r.checked) { state.stressChoice = r.value; saveState(); }
          });
        });
        block.querySelector('.s2-stress-comment').addEventListener('input', function (e) {
          state.stressComment = e.target.value; saveState();
        });
        block.querySelector('#commitStressBtn').addEventListener('click', function () {
          if (!state.stressChoice) {
            window.alert('Агеев ждёт ответа: настаиваете или пересобираем.');
            return;
          }
          // после стресс-теста идёт РАЗВИЛКА (stance), не финальный вопрос —
          // прыжок сразу на 'proactive' показывал блок развилки запертым
          // («радио видны, но не кликабельны») до перезагрузки страницы
          state.step = 'stance';
          saveState();
          render();
        });
      }
      return block;
    }

    // ---------- блок 4: рекомендация по развилке (задание №3 кейса) ----------
    // Это спина финала: с этого момента у участника есть занятая позиция, на
    // которую ссылается холл и вокруг которой раскрываются три разговора.
    // Сам выбор не оценивается как отдельный навык — это ось, а не балл; но он
    // питает контрольный вопрос финала и собирается в документ стратегии.

    function buildStanceBlock() {
      var locked = stepLocked('stance');
      // реакция Агеева на стресс-тест (п.11): настоял или согласился пересобрать
      // реакция Агеева на стресс-тест: нейтральная, три варианта равновесны —
      // не поощряем «настоять» соц-желательно, иначе смещаем замер устойчивости (ПР-2).
      var stressReact = state.stressChoice === 'hold'
        ? '<b>Агеев</b> кивает: «Настояли. Услышал вашу позицию — на совете передам как есть».'
        : (state.stressChoice === 'calibrate'
          ? '<b>Агеев</b> хмыкает: «Пересобрали частично. Понял, что меняете, а что держите».'
          : (state.stressChoice === 'change'
            ? '<b>Агеев</b>: «Пересобрали. Ок, посмотрим, куда это выведет».'
            : ''));
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        (stressReact ? '<p class="s2-ageev">' + stressReact + '</p>' : '') +
        '<p class="s2-ageev"><b>Агеев</b> кладёт распечатку письма на стол: «И то, ради чего я, собственно, и звал. В правлении две позиции — вы их видели. „Крепость“: защищать рекламное ядро, „Миру“ на партнёрскую модель, железо свернуть. „Вторая кривая“: вынести устройства в отдельную компанию и строить новую выручку к 2030-му. Мне нужна ваша рекомендация — и два критерия, на которых она стоит. Считаете, что обе мимо, — так и скажите, но тогда предложите свою.»</p>' +
        '<label class="s2-radio"><input type="radio" name="stance" value="fortress"' + (state.stance === 'fortress' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> «Крепость» — защищать рекламное ядро</label>' +
        '<label class="s2-radio"><input type="radio" name="stance" value="secondCurve"' + (state.stance === 'secondCurve' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> «Вторая кривая» — ставка на новое направление</label>' +
        '<label class="s2-radio"><input type="radio" name="stance" value="other"' + (state.stance === 'other' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> Обе позиции неверны — предложу свою</label>' +
        '<textarea class="s2-stance-other" rows="2" placeholder="ваша позиция одной фразой" style="display:' + (state.stance === 'other' ? '' : 'none') + ';"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.stanceOther) + '</textarea>' +
        '<div class="rationale-block" style="margin-top:12px;">' +
          '<label>Два критерия, на которых стоит рекомендация</label>' +
          '<textarea class="s2-stance-criteria" rows="3" placeholder="два критерия, на которых держится ваша рекомендация"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.stanceCriteria) + '</textarea>' +
        '</div>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitStanceBtn" style="margin-top:12px;">Дать рекомендацию →</button>');

      if (!locked) {
        var otherField = block.querySelector('.s2-stance-other');
        block.querySelectorAll('input[name="stance"]').forEach(function (r) {
          r.addEventListener('change', function () {
            if (!r.checked) return;
            state.stance = r.value;
            otherField.style.display = r.value === 'other' ? '' : 'none';
            saveState();
          });
        });
        otherField.addEventListener('input', function (e) {
          state.stanceOther = e.target.value; saveState();
        });
        block.querySelector('.s2-stance-criteria').addEventListener('input', function (e) {
          state.stanceCriteria = e.target.value; saveState();
        });
        block.querySelector('#commitStanceBtn').addEventListener('click', function () {
          if (!state.stance) {
            window.alert('Агеев ждёт рекомендацию по развилке — выберите позицию.');
            return;
          }
          if (state.stance === 'other' && !state.stanceOther.trim()) {
            if (!window.confirm('Вы отвергли обе позиции, но свою не сформулировали. Так и зафиксируем?')) return;
          }
          state.step = 'proactive';
          saveState();
          render();
        });
      }
      return block;
    }

    // ---------- блок 5: проактивность (финал, необязательно) ----------

    function buildProactiveBlock() {
      var locked = state.finished;
      // реакция Агеева на выбранную позицию (п.11)
      var st = window.imp.stanceOf && window.imp.stanceOf(state);
      var stanceReact = st && st.code === 'fortress'
        ? '<b>Агеев</b>: «Крепость. Осторожно — но вы хотя бы не делаете вид, что всё хорошо».'
        : (st && st.code === 'secondCurve'
          ? '<b>Агеев</b> усмехается: «Вторая кривая. Смело. Если вы правы — я буду должен вам ужин».'
          : (st && st.code === 'other'
            ? '<b>Агеев</b> откидывается: «Своя позиция. Убедите совет так же, как убедили меня сейчас — и мы сработаемся».'
            : ''));
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        (stanceReact ? '<p class="s2-ageev">' + stanceReact + '</p>' : '') +
        '<p class="s2-ageev"><b>Агеев</b> встаёт: «Последний вопрос. При каких условиях вы сами скажете, что этот выбор устарел — что пора пересматривать?»</p>' +
        '<textarea class="s2-proactive" rows="2" placeholder="необязательно — можно пожать плечами и попрощаться"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.proactiveText) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="finishBtn" style="margin-top:12px;">Завершить встречу →</button>');

      if (!locked) {
        block.querySelector('.s2-proactive').addEventListener('input', function (e) {
          state.proactiveText = e.target.value; saveState();
        });
        block.querySelector('#finishBtn').addEventListener('click', finishStation);
      }
      return block;
    }

    // ---------- рендер разговора ----------

    function render() {
      body.innerHTML = '';
      var upTo = state.finished ? STEPS.length - 1 : stepIndex(state.step);
      if (upTo >= 0) body.appendChild(buildSortBlock());
      if (upTo >= 1) body.appendChild(buildRationaleBlock());
      if (upTo >= 2) body.appendChild(buildStressBlock());
      // старые ЗАВЕРШЁННЫЕ прогоны (до появления развилки) — без stance;
      // им пустой запертый блок при просмотре не показываем
      if (upTo >= 3 && (state.stance || !state.finished)) body.appendChild(buildStanceBlock());
      if (upTo >= 4) body.appendChild(buildProactiveBlock());
      var last = body.lastElementChild;
      if (last && !state.finished) last.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    // ---------- finish ----------

    function showFinishOverlay() {
      document.getElementById('stationRoot').style.display = 'none';
      document.getElementById('finishOverlay').style.display = 'flex';
    }

    function finishStation() {
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
    });

    render();

    if (state.finished) showFinishOverlay();
  }
})();

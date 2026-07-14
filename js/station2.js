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
    try { return JSON.parse(localStorage.getItem('imp_current_session') || 'null'); } catch (e) { return null; }
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
        return parsed;
      }
    } catch (e) {}
    return {
      cardsSnapshot: [],   // копия карточек станции 1 (id+text) — самодостаточна для судьи и кабинета
      priorities: [],      // [{cardId, target}] — порядок массива = ранг
      rejected: [],        // [{cardId, freed}] — явные отказы
      rejectionRule: '',
      rationale: '',
      stressChoice: '',    // 'hold' | 'change'
      stressComment: '',
      proactiveText: '',
      step: 'sort',        // 'sort' → 'rationale' → 'stress' → 'proactive'
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

    var STEPS = ['sort', 'rationale', 'stress', 'proactive'];
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
          '<textarea class="s2-rejection-rule" rows="2" placeholder="например: всё, что не ускоряет приоритет 1 или 2 и требует больше одной команды, — не берём"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.rejectionRule) + '</textarea>' +
        '</div>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitSortBtn" style="margin-top:14px;">Зафиксировать приоритеты →</button>');

      var poolList = block.querySelector('[data-list="pool"]');
      var prioList = block.querySelector('[data-list="priorities"]');
      var rejList = block.querySelector('[data-list="rejected"]');

      unsortedCards().forEach(function (c) {
        var item = document.createElement('div');
        item.className = 's2-item';
        item.innerHTML = '<p>' + escapeHtml(c.text) + '</p>' +
          (locked ? '' :
            '<div class="s2-item-actions">' +
              (state.priorities.length < MAX_PRIORITIES ? '<button class="s2-act" data-act="prio">в приоритеты</button>' : '') +
              '<button class="s2-act" data-act="rej">не сейчас</button>' +
            '</div>');
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
          '<input type="text" class="s2-target" placeholder="измеримый ориентир: величина + срок; провал — при чём? (необязательно)" value="' + escapeHtml(p.target || '') + '"' + (locked ? ' disabled' : '') + ' />' +
          '</div>' +
          (locked ? '' :
            '<div class="s2-item-actions">' +
              '<button class="s2-act" data-act="up" title="выше">↑</button>' +
              '<button class="s2-act" data-act="down" title="ниже">↓</button>' +
              '<button class="s2-act" data-act="back" title="вернуть в карту">✕</button>' +
            '</div>');
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
          '<input type="text" class="s2-freed" placeholder="что это освобождает — люди/деньги/время (необязательно)" value="' + escapeHtml(r.freed || '') + '"' + (locked ? ' disabled' : '') + ' />' +
          '</div>' +
          (locked ? '' : '<div class="s2-item-actions"><button class="s2-act" data-act="back" title="вернуть в карту">✕</button></div>');
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
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Агеев</b> смотрит на верхнюю карточку: «Хорошо. Почему именно „' + escapeHtml(topPriorityText()) + '“ — первым? К чему нас это ведёт?»</p>' +
        '<textarea class="s2-rationale" rows="3" placeholder="ваш ответ"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.rationale) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitRationaleBtn" style="margin-top:12px;">Ответить →</button>');

      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.rationale = e.target.value; saveState();
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
        '<label class="s2-radio"><input type="radio" name="stressChoice" value="change"' + (state.stressChoice === 'change' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> Соглашусь пересобрать список</label>' +
        '<textarea class="s2-stress-comment" rows="2" placeholder="почему — в двух словах (необязательно)"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.stressComment) + '</textarea>' +
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
          state.step = 'proactive';
          saveState();
          render();
        });
      }
      return block;
    }

    // ---------- блок 4: проактивность (финал, необязательно) ----------

    function buildProactiveBlock() {
      var locked = state.finished;
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
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
      if (upTo >= 3) body.appendChild(buildProactiveBlock());
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

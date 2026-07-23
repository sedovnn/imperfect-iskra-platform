// i(m)perfect — финальный отрезок раунда 1: хаб трёх свободно-упорядочиваемых
// комнат (МК — «Коридор Лемеха», ГА — «Очередь в „Прожектор"», ПП — «Черновик
// к мартовскому комитету») + финализация стратегии. Названия и тизеры комнат —
// намеренно про сюжет кейса, не про способность: как и станции 1/2 названы по
// событию («Встреча с Агеевым»), а не по конструкту, чтобы не подсказывать,
// что именно здесь меряется. Порядок посещения свободный, НО все три обязательны
// (п.10): финализировать стратегию можно только пройдя каждый разговор — они
// раскрывают разные грани выбранной позиции и покрывают МК/ГА/ПП. Гейт снят
// только в режиме экскурсии (demo).

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
      key: 'path',
      title: 'Черновик к мартовскому комитету',
      teaser: 'Через месяц — заседание, которое ждали с декабря. Пора собрать то, с чем туда идти.',
      href: 'room-path.html',
      storageKey: function (bib) { return 'imp_room_path_' + bib; }
    },
    {
      key: 'alternatives',
      title: 'Очередь в «Прожектор»',
      teaser: 'В очереди за кофе кто-то роняет реплику, которая не идёт из головы.',
      href: 'room-alternatives.html',
      storageKey: function (bib) { return 'imp_room_alternatives_' + bib; }
    }
  ];
  // Порядок фиксирован (мастер-план §2.1): Будущее → Путь → Альтернативы. «Путь»
  // сразу за «Будущим» (пока силы есть, не в хвост усталости); каждая следующая
  // комната открывается, когда завершена предыдущая (см. renderRooms).

  var session = null;
  var state = null;

  function storageKey(bib) { return 'imp_station3_' + bib; }
  function station2Key(bib) { return 'imp_station2_' + bib; }

  function loadSession() {
    try { return window.imp.loadSession(); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { finished: false, finalDefense: '', stratos: null, startedAt: new Date().toISOString() };
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

    // Текстовое закрепление выбранной на станции 2 позиции: «слух разошёлся по
    // офису» — теперь три разговора не абстрактны, а про ВАШ выбор. Опора всего
    // финала (см. window.imp.stanceOf). Если позиция почему-то не выбрана
    // (старый прогон до этой механики) — блок просто не показываем.
    (function renderStanceCallback() {
      var el = document.getElementById('hubStanceCallback');
      if (!el) return;
      var s2 = null;
      try { s2 = JSON.parse(localStorage.getItem(station2Key(session.bib)) || 'null'); } catch (e) {}
      var stance = window.imp.stanceOf && window.imp.stanceOf(s2);
      if (!stance) { el.style.display = 'none'; return; }
      el.innerHTML =
        '<p>Слух о том, что вы склоняетесь к позиции <b>' + esc(stance.label) + '</b>, уже разошёлся по этажам. ' +
        'В коридорах вас ловят на разговор — каждый про свою грань вашего выбора.</p>';
      el.style.display = '';
    })();

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
      // фиксированный порядок: комната открыта, если она уже завершена ИЛИ
      // предыдущая по порядку завершена (первая — всегда). prevDone ведёт цепочку.
      var prevDone = true;
      ROOMS.forEach(function (room) {
        var status = roomStatus(room);
        var done = status.text === 'завершена';
        var openable = !state.finished && (done || prevDone);
        var card = document.createElement('a');
        card.className = 'hub-room-card' + (openable ? '' : ' is-locked');
        card.href = openable ? room.href : '#';
        if (!openable) card.addEventListener('click', function (e) { e.preventDefault(); });
        var pill = (!state.finished && !done && !prevDone)
          ? '<span class="fac-pill is-none">откроется после предыдущего</span>'
          : '<span class="fac-pill ' + status.cls + '">' + status.text + '</span>';
        card.innerHTML =
          '<div class="hub-room-top">' +
            '<h3>' + room.title + '</h3>' + pill +
          '</div>' +
          '<p>' + room.teaser + '</p>';
        list.appendChild(card);
        prevDone = done;
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

    // ФИНАЛ = окно fp ▸ stratos: ответы раунда собираются в НАСТОЯЩИЙ
    // StratOS-документ стратегии (артефакты StratOS по карте мастер-плана §7),
    // участник РЕДАКТИРУЕТ их на месте и финализирует. Правки живут в
    // state.stratos (переживают перезагрузку). Дельта правки — будущий процессный
    // сигнал/целостность (пока не считается — ждём билды §3 и ответы Егора).
    function strVal(x) { return (x == null ? '' : String(x)).trim(); }

    function stratosSources() {
      var s2 = readJson(station2Key(session.bib));
      var cardById = {};
      (((s2 && s2.cardsSnapshot) || [])).forEach(function (x) { cardById[x.id] = x; });
      return {
        s1: readJson('imp_station1_' + session.bib),
        s2: s2,
        rf: readJson('imp_room_future_' + session.bib),
        ra: readJson('imp_room_alternatives_' + session.bib),
        rp: readJson('imp_room_path_' + session.bib),
        stance: (window.imp.stanceOf && window.imp.stanceOf(s2)) || null,
        cardById: cardById
      };
    }

    // Артефакты StratOS + откуда предзаполняем (карта §7 спека). Порядок — как в
    // «Обзоре стратегии» StratOS: горизонт → БАЦ → декомпозиция → текущее
    // состояние → фокус через отказ → ценностное предложение → проекты → риски.
    var STRATOS_FIELDS = [
      { key: 'horizon', label: 'Горизонт планирования', kind: 'input',
        seed: function (s) { return strVal(s.rf && s.rf.horizon).split('\n')[0]; } },
      { key: 'bhag', label: 'БАЦ — большая амбициозная цель', rows: 3,
        hint: 'формула: «К [горизонту] мы станем …, чтобы …»',
        seed: function (s) { var st = s.stance ? s.stance.label : ''; var v = strVal(s.rf && s.rf.vision); return (st ? st + ' — ' : '') + v; } },
      { key: 'decomp', label: 'Декомпозиция на метрики', rows: 4,
        hint: 'по направлениям ССП: финансы · клиенты/рынок · продукт/процессы · люди/технологии',
        seed: function (s) { var p = []; if (s.rp && strVal(s.rp.targetState)) p.push('Цель: ' + strVal(s.rp.targetState)); var t = (((s.s2 && s.s2.priorities) || []).map(function (x) { return strVal(x.target); }).filter(Boolean)); if (t.length) p.push('Метрики приоритетов: ' + t.join('; ')); return p.join('\n'); } },
      { key: 'currentWeak', label: 'Текущее состояние — слабые места', rows: 3,
        seed: function (s) { return (((s.s1 && s.s1.cards) || []).map(function (c) { return strVal(c.problem || c.text); }).filter(Boolean).slice(0, 8).map(function (x) { return '• ' + x; }).join('\n')); } },
      { key: 'currentStrong', label: 'Текущее состояние — сильные стороны и ресурсы', rows: 3,
        seed: function (s) { return (((s.rp && s.rp.enablers) || []).map(function (e) { return strVal(typeof e === 'string' ? e : (e && e.text)); }).filter(Boolean).map(function (x) { return '• ' + x; }).join('\n')); } },
      { key: 'currentActions', label: 'Первые действия', rows: 3,
        seed: function (s) { var p = []; if (s.s2 && strVal(s.s2.firstAction)) p.push('Первый ход: ' + strVal(s.s2.firstAction)); var st = (((s.rp && s.rp.stages) || []).map(function (x) { return strVal(x.description); }).filter(Boolean)); if (st.length) p.push('Этапы: ' + st.join('; ')); return p.join('\n'); } },
      { key: 'focusRefusal', label: 'Фокус через отказ', rows: 3,
        hint: 'от чего сознательно отказываемся и по какому правилу',
        seed: function (s) { var s2 = s.s2; if (!s2) return ''; var rej = ((s2.rejected || []).map(function (r) { var c = s.cardById[r.cardId]; return c ? strVal(c.text) : ''; }).filter(Boolean)); var out = []; if (rej.length) out.push('Отказываемся от: ' + rej.join('; ')); if (strVal(s2.rejectionRule)) out.push('Правило отсечения: ' + strVal(s2.rejectionRule)); return out.join('\n'); } },
      { key: 'valueProp', label: 'Ценностное предложение', rows: 3,
        seed: function (s) { var st = s.stance ? s.stance.label : ''; var cr = strVal(s.s2 && s.s2.stanceCriteria); return st + (cr ? '\nКритерии: ' + cr : ''); } },
      { key: 'projects', label: 'Проекты / дорожная карта', rows: 3,
        seed: function (s) { return (((s.rp && s.rp.stages) || []).filter(function (x) { return strVal(x.description); }).map(function (x, i) { return (i + 1) + ') ' + strVal(x.description) + (strVal(x.doneWhen) ? ' — готово когда: ' + strVal(x.doneWhen) : ''); }).join('\n')); } },
      { key: 'risks', label: 'Развороты и риски', rows: 3,
        seed: function (s) { var out = []; if (strVal(s.rf && s.rf.answer2)) out.push('Развороты: ' + strVal(s.rf.answer2)); var b = (((s.rp && s.rp.barriers) || []).map(function (x) { return strVal(typeof x === 'string' ? x : (x && x.text)); }).filter(Boolean)); if (b.length) out.push('Барьеры: ' + b.join('; ')); return out.join('\n'); } }
    ];

    function seedStratos() {
      var s = stratosSources();
      var out = {};
      STRATOS_FIELDS.forEach(function (f) { out[f.key] = f.seed(s) || ''; });
      return out;
    }

    // Рендер редактируемого StratOS-документа. readOnly — режим просмотра после
    // финализации. Предзаполняет из state.stratos (собирает при первом открытии).
    function renderStratosDoc(readOnly) {
      if (!state.stratos) { state.stratos = seedStratos(); saveState(); }
      var doc = state.stratos;
      strategyRecapEl.innerHTML = STRATOS_FIELDS.map(function (f) {
        var val = doc[f.key] || '';
        var head = '<div class="stratos-art-h">' + f.label +
          (f.hint ? ' <span class="stratos-hint">' + f.hint + '</span>' : '') + '</div>';
        var field = f.kind === 'input'
          ? '<input class="stratos-in" data-sk="' + f.key + '"' + (readOnly ? ' disabled' : '') + ' value="' + esc(val) + '" />'
          : '<textarea class="stratos-ta" data-sk="' + f.key + '" rows="' + (f.rows || 3) + '"' + (readOnly ? ' disabled' : '') + '>' + esc(val) + '</textarea>';
        return '<div class="stratos-art">' + head + field + '</div>';
      }).join('');
      if (!readOnly) {
        strategyRecapEl.querySelectorAll('[data-sk]').forEach(function (el) {
          el.addEventListener('input', function () {
            state.stratos[el.getAttribute('data-sk')] = el.value;
            saveState();
          });
        });
      }
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

    var reviewMode = false; // «посмотреть стратегию ещё раз» после финализации

    openFinalizeBtn.addEventListener('click', function () {
      renderStratosDoc(false);
      document.getElementById('closeFinalizeBtn').textContent = '← Назад в холл';
      document.getElementById('finalizeBtn').style.display = '';
      reviewMode = false;
      document.getElementById('stationRoot').style.display = 'none';
      finalizeScreenEl.style.display = 'flex';
    });
    document.getElementById('closeFinalizeBtn').addEventListener('click', function () {
      finalizeScreenEl.style.display = 'none';
      if (reviewMode) { reviewMode = false; document.getElementById('finishOverlay').style.display = 'flex'; }
      else document.getElementById('stationRoot').style.display = '';
    });

    // жёсткий гейт финализации (п.10): все три разговора обязательны — финал
    // открывается только когда пройдены все. В режиме экскурсии гейт снят.
    function roomsDone() {
      return ROOMS.filter(function (r) { return roomStatus(r).text === 'завершена'; }).length;
    }
    function finalizeBypass() { return !!(window.imp.isDemo && window.imp.isDemo()); }
    function updateFinalizeGate() {
      if (state.finished) return;
      if (roomsDone() >= ROOMS.length || finalizeBypass()) {
        openFinalizeBtn.removeAttribute('disabled');
        openFinalizeBtn.textContent = 'Собрать и финализировать стратегию →';
        openFinalizeBtn.removeAttribute('title');
      } else {
        var missing = ROOMS.filter(function (r) { return roomStatus(r).text !== 'завершена'; })
          .map(function (r) { return r.title; });
        openFinalizeBtn.setAttribute('disabled', 'disabled');
        openFinalizeBtn.textContent = 'Пройдите все три разговора (осталось ' + missing.length + ')';
        openFinalizeBtn.setAttribute('title', 'Не хватает: ' + missing.join(', '));
      }
    }
    updateFinalizeGate();

    // Кросс-девайс: гейт финала и рекап читают завершённость комнат из localStorage.
    // Если участник прошёл комнаты на другом устройстве или вошёл по фамилии (recover),
    // локально пусто → кнопка «Финализировать» залочена и станция 3 никогда не
    // сохраняется, хотя на бэкенде все три комнаты завершены. Подтягиваем их статус
    // с бэкенда (сидируем localStorage непройденных локально), затем перерисовываем.
    if (window.imp.isApiConfigured()) {
      var roomLoadActions = { future: 'loadRoomFuture', alternatives: 'loadRoomAlternatives', path: 'loadRoomPath' };
      var pendingRooms = 0;
      ROOMS.forEach(function (room) {
        var localFin = false;
        try { var lr = localStorage.getItem(room.storageKey(session.bib)); localFin = !!(lr && JSON.parse(lr).finished); } catch (e) {}
        if (localFin) return; // локально уже завершена — не трогаем
        pendingRooms++;
        window.imp.callApi(roomLoadActions[room.key], { bib: session.bib }).then(function (res) {
          if (res && res.ok && res.state && res.state.finished) {
            localStorage.setItem(room.storageKey(session.bib), JSON.stringify(res.state));
          }
        }).catch(function () {}).then(function () {
          if (--pendingRooms === 0) { renderRooms(); updateFinalizeGate(); }
        });
      });
    }

    // повторный просмотр собранной стратегии после финала — read-only (п.13)
    document.getElementById('reviewStrategyBtn').addEventListener('click', function () {
      renderStratosDoc(true);
      document.getElementById('finishOverlay').style.display = 'none';
      document.getElementById('finalizeBtn').style.display = 'none';
      if (defenseEl) defenseEl.disabled = true;
      document.getElementById('closeFinalizeBtn').textContent = '← Закрыть';
      reviewMode = true;
      finalizeScreenEl.style.display = 'flex';
    });

    // ---------- finalize ----------

    // Прощальное письмо Агеева под выбранную позицию (п.13) — эмоция закрытия
    // после двух часов работы. Живое, не шаблонное; оценок не показываем.
    function ageevLetterText() {
      var s2 = readJson(station2Key(session.bib));
      var stance = window.imp.stanceOf && window.imp.stanceOf(s2);
      var code = stance ? stance.code : null;
      if (code === 'fortress')
        return '«Прочитал вашу записку. Крепость — значит, держим то, что кормит, и не геройствуем. Спорить на совете будут, но иду туда с вашими словами, а не со своими сомнениями». — К. Агеев';
      if (code === 'secondCurve')
        return '«Прочитал. Вторая кривая — это ставка, и вы её не спрятали за оговорками. Рискованно. И, кажется, впервые за месяц я не думаю, что мы просто плывём по течению. Иду на совет с вашей запиской». — К. Агеев';
      if (code === 'other')
        return '«Прочитал. Вы не приняли ни одну из готовых позиций — и, чёрт возьми, у вас есть основания. Спорить будут. Иду на совет с вашей запиской». — К. Агеев';
      return '«Прочитал. Спорить на совете будут, но иду туда с вашей запиской». — К. Агеев';
    }

    function showFinishOverlay() {
      finalizeScreenEl.style.display = 'none';
      document.getElementById('stationRoot').style.display = 'none';
      var letter = document.getElementById('ageevLetter');
      if (letter) letter.textContent = ageevLetterText();
      document.getElementById('finishOverlay').style.display = 'flex';
    }

    function finalizeRound() {
      // жёсткий гейт (п.10): без всех трёх разговоров финализация невозможна
      // (кроме режима экскурсии). Кнопка «собрать» и так заблокирована — это
      // страховка на случай прямого вызова.
      if (!finalizeBypass() && roomsDone() < ROOMS.length) {
        window.alert('Финализировать стратегию можно только после всех трёх разговоров.');
        return;
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

    if (state.finished) {
      openFinalizeBtn.setAttribute('disabled', 'disabled');
      showFinishOverlay();
    }
  }
})();

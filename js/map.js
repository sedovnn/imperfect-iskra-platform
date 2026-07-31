// i(m)perfect — финальный отрезок раунда 1: хаб трёх свободно-упорядочиваемых
// комнат (МК — «Встреча с Лемехом у лифта», ГА — «Очередь в „Прожектор"», ПП — «Черновик
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
      title: 'Встреча с Лемехом у лифта',
      teaser: 'Лемех перехватывает вас у лифта: у него пять минут и вопрос не по повестке встречи.',
      href: 'round3.html',
      storageKey: function (bib) { return 'imp_round3_' + bib; }
    },
    {
      key: 'path',
      title: 'Черновик к мартовскому комитету',
      teaser: 'Через месяц — заседание, которое ждали с декабря. Пора собрать то, с чем туда идти.',
      href: 'round4.html',
      storageKey: function (bib) { return 'imp_round4_' + bib; }
    },
    {
      key: 'alternatives',
      title: 'Очередь в «Прожектор»',
      teaser: 'В очереди за кофе кто-то роняет реплику, которая не идёт из головы.',
      href: 'round5.html',
      storageKey: function (bib) { return 'imp_round5_' + bib; }
    }
  ];
  // Порядок фиксирован (мастер-план §2.1): Будущее → Путь → Альтернативы. «Путь»
  // сразу за «Будущим» (пока силы есть, не в хвост усталости); каждая следующая
  // комната открывается, когда завершена предыдущая (см. renderRooms).
  // ROOMS (3) держит логику финала/синка/рекапа. STAGES (5) — плитки КАРТЫ раунда:
  // весь путь на одном экране, по очереди. Т.к. комнаты открываются только после
  // станций 1–2, «все 3 комнаты пройдены» = «все 5 этапов пройдены» → гейт финала
  // (roomsDone >= ROOMS.length) остаётся корректным.
  var STAGES = [
    { key: 'station1', title: 'Раунд 1 · Знакомство с «Искрой»', teaser: 'Читаете материалы про компанию и собираете карту проблем: что происходит и как связано.', href: 'round1.html', storageKey: function (bib) { return 'imp_round1_' + bib; } },
    { key: 'station2', title: 'Раунд 2 · Встреча с Агеевым', teaser: 'Понедельник, 10:00. Агеев ждёт разговора по существу: с чего начинать, а что подождёт.', href: 'round2.html', storageKey: function (bib) { return 'imp_round2_' + bib; } },
    { key: 'future', title: 'Раунд 3 · Встреча с Лемехом у лифта', teaser: 'Лемех перехватывает вас у лифта: пять минут и вопрос не по повестке.', href: 'round3.html', storageKey: function (bib) { return 'imp_round3_' + bib; } },
    { key: 'path', title: 'Раунд 4 · Черновик к мартовскому комитету', teaser: 'Собираете черновик к заседанию, которое ждали с декабря, но к вам заходит неожиданный гость.', href: 'round4.html', storageKey: function (bib) { return 'imp_round4_' + bib; } },
    { key: 'alternatives', title: 'Раунд 5 · Очередь в «Прожектор»', teaser: 'В очереди за кофе Брагин роняет реплику, которая не идёт из головы.', href: 'round5.html', storageKey: function (bib) { return 'imp_round5_' + bib; } }
  ];

  var session = null;
  var state = null;

  function storageKey(bib) { return 'imp_map_' + bib; }
  function station2Key(bib) { return 'imp_round2_' + bib; }

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

  // Станция 3 теперь — КАРТА раунда (дом после входа), не финальный отрезок:
  // на неё попадают сразу после установки, гейт «сначала станция 2» снят.
  // Прохождение по очереди обеспечивают сами плитки (renderRooms: prevDone).
  function proceedToStation() {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('stationRoot').style.display = '';
    document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(6, '0');
    initWorkspace();
  }

  proceedToStation();

  // ---------- workspace ----------

  function initWorkspace() {
    state = loadState(session.bib);

    var introKey = 'imp_map_intro_seen_' + session.bib;
    var introEl = document.getElementById('stationIntro');
    if (localStorage.getItem(introKey)) introEl.style.display = 'none';
    document.getElementById('dismissIntro').addEventListener('click', function () {
      introEl.style.display = 'none';
      localStorage.setItem(introKey, '1');
    });
    document.getElementById('reopenIntroBtn').addEventListener('click', function () {
      introEl.style.display = 'flex';
    });

    // шапка экрана сборки Р6 (свой ряд — .gate прячет шапку станции):
    // номер участника, «?» (возвращает к легенде карты) и «← К карте» — тот же
    // набор и тот же порядок, что в шапке раундов
    document.getElementById('finalizeBib').textContent = '№ ' + String(session.bib).padStart(6, '0');
    function closeFinalize() {
      document.getElementById('finalizeScreen').style.display = 'none';
      document.getElementById('stationRoot').style.display = '';
    }
    document.getElementById('finalizeHelpBtn').addEventListener('click', function () {
      closeFinalize();
      introEl.style.display = 'flex';
    });
    document.getElementById('finalizeBackBtn').addEventListener('click', function (e) {
      e.preventDefault();
      closeFinalize();
    });

    // Плашка «слух о позиции разошёлся» теперь рендерится ВНУТРИ renderRooms —
    // между плиткой «Встреча с Агеевым» и разговорами (мост после развилки).

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
      // позиция с развилки (станция 2) — для плашки-моста «слух разошёлся», которая
      // появляется МЕЖДУ встречей с Агеевым и разговорами (после того, как ст.2 пройдена)
      var s2state = null;
      try { s2state = JSON.parse(localStorage.getItem(station2Key(session.bib)) || 'null'); } catch (e) {}
      var stance = (window.imp.stanceOf && window.imp.stanceOf(s2state)) || null;
      // фиксированный порядок: этап открыт, если уже завершён ИЛИ предыдущий завершён
      // (первый — всегда). prevDone ведёт цепочку; текущий = первый незавершённый (фокус).
      var prevDone = true;
      STAGES.forEach(function (room) {
        var status = roomStatus(room);
        var done = status.text === 'завершена';
        var openable = !state.finished && (done || prevDone);
        var isCurrent = openable && !done;
        var card = document.createElement('a');
        card.className = 'hub-room-card' + (openable ? '' : ' is-locked') + (isCurrent ? ' is-current' : '');
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
        // слух о позиции — «облако мысли» справа от 3-го раунда (первого коридорного
        // разговора), а не вклейкой в вертикальный поток плиток (ломала визуальную логику).
        if (room.key === 'future' && stance) {
          var slot = document.createElement('div');
          slot.className = 'hub-room-slot';
          slot.appendChild(card);
          var cloud = document.createElement('div');
          cloud.className = 'hub-stance-cloud';
          cloud.innerHTML = (stance.isOwn && !stance.named)
            ? '<p>О том, что вы не приняли ни одну из двух готовых позиций и предложили свою, уже все в курсе: Агеев, похоже, ещё со встречи разослал вашу записку по чатам.</p>'
            : '<p>О вашей позиции — <b>' + esc(stance.label) + '</b> — уже все в курсе: Агеев, похоже, ещё со встречи разослал её по чатам.</p>';
          slot.appendChild(cloud);
          list.appendChild(slot);
        } else {
          list.appendChild(card);
        }
        prevDone = done;
      });
      // неразрывные пробелы после предлогов — уже по вставленной разметке
      if (window.imp.typoDom) window.imp.typoDom(list);
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
        s1: readJson('imp_round1_' + session.bib),
        s2: s2,
        rf: readJson('imp_round3_' + session.bib),
        ra: readJson('imp_round5_' + session.bib),
        rp: readJson('imp_round4_' + session.bib),
        stance: (window.imp.stanceOf && window.imp.stanceOf(s2)) || null,
        cardById: cardById
      };
    }

    // Артефакты StratOS + откуда предзаполняем (карта §7 спека). Порядок — как в
    // «Обзоре стратегии» StratOS: горизонт → БАЦ → декомпозиция → текущее
    // состояние → фокус через отказ → ценностное предложение → проекты → риски.
    // ⚠ Каждое поле обрабатывает ТРИ случая, а не один. Замер показал, что беда
    // двусторонняя: ИИ-прогон переполняет поля (в «Первых действиях» 5089 знаков,
    // в позиции 4536), а живые люди оставляют их ПУСТЫМИ — цели приоритетов не
    // заполнены у 3 прогонов из 7, обоснования отказов у 5 из 7, этапы пути у 3
    // из 7. Поэтому: пусто → участник видит подсказку ph, что здесь пишут (а не
    // прочерк в карточке с заголовком «мы собрали вашу стратегию»); нормально →
    // подставляем; слишком длинно → не подставляем обрубок, максимум лимита.
    var STRATOS_FIELDS = [
      { key: 'horizon', label: 'Горизонт планирования', kind: 'input',
        ph: 'например: 2028 год · три года',
        // поле в одну строку: длинный ответ показал бы обрубок первой трети (на
        // прогоне 005001 сюда попало 337 знаков, горизонта в видимой части не было)
        max: 130,
        seed: function (s) { return strVal(s.rf && s.rf.horizon).split('\n')[0]; } },
      { key: 'bhag', label: 'БАЦ — большая амбициозная цель', rows: 3,
        hint: 'формула: «К [горизонту] мы станем …, чтобы …»',
        ph: 'К какому году кем станем и зачем',
        seed: function (s) { return strVal(s.rf && s.rf.vision); } },
      { key: 'decomp', label: 'Декомпозиция на метрики', rows: 4,
        hint: 'по направлениям ССП: финансы · клиенты/рынок · продукт/процессы · люди/технологии',
        ph: 'метрика · порог · владелец — по каждому направлению',
        seed: function (s) { var p = []; if (s.rp && strVal(s.rp.targetState)) p.push('Цель: ' + strVal(s.rp.targetState)); else if (s.rp && strVal(s.rp.pathText)) p.push('Из ответа Штерну про путь: ' + strVal(s.rp.pathText)); if (s.s2 && strVal(s.s2.rationale)) p.push('Из разбора приоритетов года (черновик — добавьте числа и владельцев): ' + strVal(s.s2.rationale)); var t = (((s.s2 && s.s2.priorities) || []).map(function (x) { return strVal(x.target); }).filter(Boolean)); if (t.length) p.push('Метрики приоритетов: ' + t.join('; ')); return p.join('\n'); } },
      // Отбор по смыслу, а не «первые восемь»: сначала та проблема, которую
      // участник назвал корневой, затем помеченные как угроза, и только потом
      // остальные до лимита. У живого участника карточек было 37 — «первые
      // восемь» давали меньше четверти карты, и принцип нигде не назывался.
      { key: 'currentWeak', label: 'Текущее состояние — слабые места', rows: 3,
        hint: 'корневая проблема и то, что помечено угрозой',
        ph: 'что в компании работает против неё прямо сейчас',
        seed: function (s) { return weakSeed(s); } },
      { key: 'currentStrong', label: 'Текущее состояние — сильные стороны и ресурсы', rows: 3,
        ph: 'на что опираемся: люди, деньги, продукты, данные',
        seed: function (s) { var e = (((s.rp && s.rp.enablers) || []).map(function (x) { return strVal(typeof x === 'string' ? x : (x && x.text)); }).filter(Boolean).map(function (x) { return '• ' + x; }).join('\n')); return e || strVal(s.rp && s.rp.barriersText); } },
      // Первый ход и первый этап — «Проекты / дорожная карта» ниже держит ВСЕ
      // этапы. Раньше оба поля получали один и тот же список: у 005001 5089 и
      // 4215 знаков одного содержания подряд в одном документе.
      { key: 'currentActions', label: 'Первые действия', rows: 3,
        hint: 'что делаем в первые недели',
        ph: 'первый ход и чем он заканчивается',
        seed: function (s) { var p = []; var fm = firstMoveOf(s.s2); if (fm) p.push('Первый ход: ' + fm); var st = (((s.rp && s.rp.stages) || []).map(function (x) { return strVal(x.description); }).filter(Boolean)); if (st.length) p.push('Первый этап: ' + st[0]); return p.join('\n'); } },
      // Фокус — это отказ от ДЕЙСТВИЙ. Обоснования отказов участник пишет сам
      // («Не ставлю целью вернуться в первую тройку OMI в 2026 году…»), и если
      // они есть — берём их. Прежний вариант печатал «Отказываемся от:» и текст
      // отложенной ПРОБЛЕМЫ («Отказываемся от: ключевая компетенция ушла») —
      // отказаться от проблемы нельзя. Обоснования пусты у 5 живых из 7,
      // поэтому запасной путь остаётся, но с честной подписью.
      { key: 'focusRefusal', label: 'Фокус через отказ', rows: 3,
        hint: 'от чего сознательно отказываемся и по какому правилу',
        ph: 'чего сознательно НЕ делаем в этот период и почему',
        seed: function (s) { return refusalSeed(s); } },
      { key: 'valueProp', label: 'Ценностное предложение', rows: 3,
        ph: 'чем ваша позиция ценна для компании и клиента',
        seed: function (s) { var st = s.stance ? s.stance.full : ''; var cr = strVal(s.s2 && s.s2.stanceCriteria); return st + (cr ? '\nКритерии: ' + cr : ''); } },
      { key: 'projects', label: 'Проекты / дорожная карта', rows: 3,
        ph: 'этапы по порядку: что и когда готово',
        seed: function (s) { var st = (((s.rp && s.rp.stages) || []).filter(function (x) { return strVal(x.description); }).map(function (x, i) { return (i + 1) + ') ' + strVal(x.description) + (strVal(x.doneWhen) ? ' — готово когда: ' + strVal(x.doneWhen) : ''); }).join('\n')); return st || strVal(s.rp && s.rp.pathText); } },
      { key: 'risks', label: 'Развороты и риски', rows: 3,
        ph: 'что может пойти не так и что тогда меняем',
        seed: function (s) { var out = []; if (strVal(s.rf && s.rf.answer2)) out.push('Развороты: ' + strVal(s.rf.answer2)); var b = (((s.rp && s.rp.barriers) || []).map(function (x) { return strVal(typeof x === 'string' ? x : (x && x.text)); }).filter(Boolean)); if (b.length) out.push('Барьеры: ' + b.join('; ')); else if (strVal(s.rp && s.rp.barriersText)) out.push('Барьеры и опора: ' + strVal(s.rp.barriersText)); return out.join('\n'); } }
    ];

    // Слабые места: корневая проблема → помеченные угрозой → остальные, до лимита.
    function weakSeed(s) {
      var cards = ((s.s1 && s.s1.cards) || []).filter(function (c) { return strVal(c.problem || c.text); });
      if (!cards.length) return '';
      var rootId = s.s1 && s.s1.mainProblemId;
      // тег ставится в раунде 1 кнопками «угроза»/«возможность» и хранится как 'threat'
      var isThreat = function (c) { return String(c.tag || '') === 'threat'; };
      var root = cards.filter(function (c) { return c.id && c.id === rootId; });
      var threats = cards.filter(function (c) { return !(c.id && c.id === rootId) && isThreat(c); });
      var rest = cards.filter(function (c) { return !(c.id && c.id === rootId) && !isThreat(c); });
      var picked = root.concat(threats).concat(rest).slice(0, 8);
      var lines = picked.map(function (c) {
        var mark = (c.id && c.id === rootId) ? ' (вы назвали это корнем остальных)' : '';
        return '• ' + strVal(c.problem || c.text) + mark;
      });
      if (cards.length > picked.length) {
        lines.push('— в карте ещё ' + (cards.length - picked.length) + ', полный список в «Моих ответах»');
      }
      return lines.join('\n');
    }

    // Фокус через отказ: сначала собственные формулировки отказов, иначе — что
    // сняли с фокуса (без «отказываемся от <проблемы>»).
    function refusalSeed(s) {
      var s2 = s.s2;
      if (!s2) return '';
      var out = [];
      // Разговор переписан 2026-07-31: отказы — это решения менеджеров, от которых
      // участник отказался с причиной. Прежняя форма (отложенные карточки раунда 1)
      // остаётся запасным путём для уже пройденных прогонов.
      var picks = s2.picks || {};
      var dropped = Object.keys(picks).filter(function (k) { return picks[k] && !picks[k].take && strVal(picks[k].reason); });
      if (dropped.length) {
        out.push(dropped.map(function (k) {
          var own = (s2.ownItems || []).filter(function (o) { return String(o.id) === String(k); })[0];
          var it = own || (window.imp.backlogById && window.imp.backlogById(k));
          return '• ' + (it ? it.title + ' — ' : '') + strVal(picks[k].reason);
        }).join('\n'));
      } else {
        var reasons = ((s2.rejected || []).map(function (r) { return strVal(r.freed); }).filter(Boolean));
        if (reasons.length) {
          out.push(reasons.map(function (x) { return '• ' + x; }).join('\n'));
        } else {
          var titles = ((s2.rejected || []).map(function (r) { var c = s.cardById[r.cardId]; return c ? strVal(c.text) : ''; }).filter(Boolean));
          if (titles.length) out.push('Сняли с фокуса сейчас: ' + titles.join('; '));
        }
      }
      if (strVal(s2.rejectionRule)) out.push('Правило отсечения: ' + strVal(s2.rejectionRule));
      return out.join('\n');
    }

    // «Первый ход» отдельным полем больше не спрашивается: в новом разговоре его
    // роль играет собственное решение, названное ДО того, как прозвучали позиции
    // правления. У прежних прогонов берём старое поле.
    function firstMoveOf(s2) {
      if (!s2) return '';
      return strVal(s2.ownMove) || strVal(s2.firstAction);
    }

    function seedStratos() {
      var s = stratosSources();
      var out = {};
      STRATOS_FIELDS.forEach(function (f) {
        var v = f.seed(s) || '';
        // третий случай: подставляемое не влезает в поле (f.max задан только у
        // однострочных). Обрубок первой трети фразы читается как сбой платформы —
        // лучше оставить пустым с подсказкой, участник впишет коротко сам.
        if (f.max && v.length > f.max) v = '';
        out[f.key] = v;
      });
      return out;
    }

    // Рендер редактируемого StratOS-документа. readOnly — режим просмотра после
    // финализации. Предзаполняет из state.stratos (собирает при первом открытии).
    // Раскладка StratOS-дашборда: три колонки-смысла (артефакты §7 распределены по ним).
    var STRATOS_COLS = { bhag: 1, horizon: 1, valueProp: 1, currentWeak: 2, currentStrong: 2, focusRefusal: 2, decomp: 3, currentActions: 3, projects: 3, risks: 3 };
    var STRATOS_COL_TITLES = { 1: 'Куда идём', 2: 'Где мы сейчас', 3: 'Как движемся' };

    function renderStratosDoc(readOnly) {
      if (!state.stratos) { state.stratos = seedStratos(); saveState(); }
      var doc = state.stratos;
      function card(f) {
        var val = doc[f.key] || '';
        var head = '<div class="stratos-art-h">' + f.label +
          (f.hint ? ' <span class="stratos-hint">' + f.hint + '</span>' : '') + '</div>';
        // подсказка вместо пустоты: карточка без ответа не должна выглядеть
        // прочерком в документе, который экран называет собранной стратегией
        var ph = f.ph ? ' placeholder="' + esc(f.ph) + '"' : '';
        var field = f.kind === 'input'
          ? '<input class="stratos-in" data-sk="' + f.key + '" aria-label="' + esc(f.label) + '"' + ph + (readOnly ? ' disabled' : '') + ' value="' + esc(val) + '" />'
          : '<textarea class="stratos-ta" data-sk="' + f.key + '" aria-label="' + esc(f.label) + '" rows="' + (f.rows || 3) + '"' + ph + (readOnly ? ' disabled' : '') + '>' + esc(val) + '</textarea>';
        return '<div class="stratos-art">' + head + field + '</div>';
      }
      strategyRecapEl.innerHTML = '<div class="stratos-grid">' + [1, 2, 3].map(function (col) {
        return '<div class="stratos-col"><div class="stratos-col-h">' + STRATOS_COL_TITLES[col] + '</div>' +
          STRATOS_FIELDS.filter(function (f) { return STRATOS_COLS[f.key] === col; }).map(card).join('') + '</div>';
      }).join('') + '</div>';
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
      document.getElementById('closeFinalizeBtn').textContent = '← Назад к карте';
      var fb = document.getElementById('finalizeBtn');
      fb.style.display = '';
      fb.textContent = 'Финализировать стратегию →';
      var db = document.getElementById('defenseBlock');
      if (db) db.style.display = 'none'; // записка правлению появится после «Финализировать»
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
        openFinalizeBtn.textContent = 'Раунд 6 · Собрать стратегию →';
        openFinalizeBtn.removeAttribute('title');
        openFinalizeBtn.classList.add('btn-primary');   // доступна — вермилион, это кульминация
        openFinalizeBtn.classList.remove('btn-ghost');
      } else {
        var missing = STAGES.filter(function (r) { return roomStatus(r).text !== 'завершена'; })
          .map(function (r) { return r.title; });
        openFinalizeBtn.setAttribute('disabled', 'disabled');
        openFinalizeBtn.classList.add('btn-ghost');     // ещё заперта — тихая
        openFinalizeBtn.classList.remove('btn-primary');
        openFinalizeBtn.textContent = 'Пройдите все раунды (осталось ' + missing.length + ')';
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
      // синкаем статус ВСЕХ этапов карты (не только комнат), чтобы плитки станций 1–2
      // тоже были верны после восстановления доступа на другом устройстве
      var roomLoadActions = { station1: 'loadStation1', station2: 'loadStation2', future: 'loadRoomFuture', alternatives: 'loadRoomAlternatives', path: 'loadRoomPath' };
      var pendingRooms = 0;
      STAGES.forEach(function (room) {
        var localFin = false;
        try { var lr = localStorage.getItem(room.storageKey(session.bib)); localFin = !!(lr && JSON.parse(lr).finished); } catch (e) {}
        pendingRooms++;
        window.imp.callApi(roomLoadActions[room.key], { bib: session.bib }).then(function (res) {
          if (!res) return; // сетевая ошибка — локаль не трогаем
          if (res.ok && res.state && res.state.finished) {
            if (!localFin) localStorage.setItem(room.storageKey(session.bib), JSON.stringify(res.state)); // сид с другого устройства
          } else if ((res.error === 'not_found' || (res.ok && !res.state)) && localFin) {
            // локально «завершена», а на бэкенде записи нет → прогресс сброшен фасилитатором: чистим локаль
            localStorage.removeItem(room.storageKey(session.bib));
          }
        }).catch(function () {}).then(function () {
          if (--pendingRooms === 0) { renderRooms(); updateFinalizeGate(); }
        });
      });
      // сверка собственного финала карты: на бэкенде карта не финализирована, а
      // локально «завершено» → сброшено, снимаем локальный финиш и показываем карту.
      window.imp.callApi('loadStation3', { bib: session.bib }).then(function (res) {
        var backendFinished = !!(res && res.ok && res.state && res.state.finished);
        var backendKnown = !!(res && (res.ok || res.error === 'not_found')); // внятный ответ, а не сетевой сбой
        if (backendKnown && state.finished && !backendFinished) {
          state.finished = false; state.finalDefense = ''; state.stratos = null; saveState();
          document.getElementById('finishOverlay').style.display = 'none';
          document.getElementById('stationRoot').style.display = '';
          renderRooms(); updateFinalizeGate();
        }
      }).catch(function () {});
    }

    // повторный просмотр собранной стратегии после финала — read-only (п.13)
    document.getElementById('reviewStrategyBtn').addEventListener('click', function () {
      renderStratosDoc(true);
      var db = document.getElementById('defenseBlock');
      if (db) db.style.display = ''; // показать записку правлению read-only
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
        return '«Прочитал вашу записку. Крепость — значит, держим то, что кормит, и не геройствуем. Спорить на правлении будут, но иду туда с вашими словами, а не со своими сомнениями». — К. Агеев';
      if (code === 'secondCurve')
        return '«Прочитал. Вторая кривая — это ставка, и вы её не спрятали за оговорками. Рискованно. И, кажется, впервые за месяц я не думаю, что мы просто плывём по течению. Иду на правление с вашей запиской». — К. Агеев';
      if (code === 'other')
        return '«Прочитал. Вы не приняли ни одну из готовых позиций — и, чёрт возьми, у вас есть основания. Спорить будут. Иду на правление с вашей запиской». — К. Агеев';
      return '«Прочитал. Спорить на правлении будут, но иду туда с вашей запиской». — К. Агеев';
    }

    function showFinishOverlay() {
      finalizeScreenEl.style.display = 'none';
      document.getElementById('stationRoot').style.display = 'none';
      var letter = document.getElementById('ageevLetter');
      if (letter) letter.textContent = ageevLetterText();
      document.getElementById('finishOverlay').style.display = 'flex';
    }

    // двухшаговая финализация: 1-й клик открывает записку правлению и меняет
    // кнопку на «Отправить К. Агееву», 2-й — собственно финализирует.
    function handleFinalizeClick() {
      var db = document.getElementById('defenseBlock');
      if (db && db.style.display === 'none' && !state.finished) {
        db.style.display = '';
        // мягкое появление записки (с уважением к prefers-reduced-motion)
        var reduce = false;
        try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
        if (!reduce) {
          db.style.opacity = '0';
          db.style.transform = 'translateY(6px)';
          requestAnimationFrame(function () {
            db.style.transition = 'opacity .28s ease, transform .28s ease';
            db.style.opacity = '1';
            db.style.transform = 'none';
          });
        }
        document.getElementById('finalizeBtn').textContent = 'Отправить К. Агееву →';
        if (defenseEl) { try { defenseEl.focus(); } catch (e) {} }
        return;
      }
      finalizeRound();
    }

    function finalizeRound() {
      // жёсткий гейт (п.10): без всех пяти раундов финализация невозможна
      // (кроме режима экскурсии). Кнопка «собрать» и так заблокирована — это
      // страховка на случай прямого вызова.
      if (!finalizeBypass() && roomsDone() < ROOMS.length) {
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

    document.getElementById('finalizeBtn').addEventListener('click', handleFinalizeClick);

    if (state.finished) {
      openFinalizeBtn.setAttribute('disabled', 'disabled');
      showFinishOverlay();
    }
  }
})();

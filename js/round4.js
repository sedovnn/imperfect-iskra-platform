// i(m)perfect — «Черновик к мартовскому комитету» (кейс «Искра»). Навык ПП
// целиком: декомпозиция цели и маршрута (ПП-1) + работа с барьерами и
// ресурсами (ПП-2).
//
// ДВА СВОБОДНЫХ ОКНА, без слотов и кнопок (принятый формат, минутки 30.07;
// реализовано 2026-07-31). Прежний структурный конструктор — поля текущее/
// целевое, список этапов с обоснованиями, карточки барьеров с типами — снят,
// и это не упрощение, а починка замера. Сверка каждого маркера с формой:
//   pp1_1to2 «сформулировал конечную точку» — слот «Целевое состояние» выдавал
//     маркер за заполнение поля;
//   pp1_2to3 «цель задана первой, путь строится назад от неё» — форма ставила
//     «текущее» первым, и судье приходилось дописывать в промпт оговорку
//     «порядок граф задан платформой, не считай его сигналом направления»:
//     мы латали словами то, что сломали формой;
//   pp1_3to4 «порядок следует из предпосылок» — поле «почему на этом месте»
//     подсказывало, что место надо обосновать;
//   pp1_4to5 «граф зависимых и независимых треков» — линейный список этапов
//     структурно этого не позволял: чтобы показать граф, надо было сломать форму;
//   pp2_1to2 / pp2_2to3 — слоты «Барьеры» и «Опора» выдавали маркеры за наличие
//     заполненных списков;
//   pp2_3to4 «функциональная классификация ВМЕСТЕ с механизмом» — кнопки
//     «стена / можно обойти» дарили классификацию за нажатие.
// Итог по данным первого потока: у ИИ по ПП-1 ровно пятёрка без дисперсии
// (заполнить слоты — его дефолт), у людей полный разброс, а этапы пусты
// у пятерых из семи. Задание ловило поведение модели, а не мышление.
//
// Поэтому вопросы теперь ничего не подсказывают про структуру ответа: ни что
// нужна цель, ни что нужны этапы, ни что порядок надо обосновать. Всё это
// приносит участник — и ровно это меряют маркеры.
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

  function freshState(startedAt) {
    return {
      v: 2,
      pathText: '', barriersText: '',
      step: 'q1', finished: false, startedAt: startedAt || new Date().toISOString()
    };
  }

  // Запись структурного формата: у неё нет v, зато есть этапы/барьеры/состояния.
  function isLegacyRecord(o) {
    return o && o.v !== 2;
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (isLegacyRecord(parsed)) {
          // Завершённый прогон структурного формата оставляем как есть — он
          // историческая запись, судья читает его прежними правилами. Незавершённый
          // начинаем заново: его поля отвечали на другие вопросы, и под новыми
          // они исказили бы оценку (та же логика, что в раунде 5).
          if (parsed.finished) return parsed;
          return freshState(parsed.startedAt);
        }
        if (parsed.pathText === undefined) parsed.pathText = '';
        if (parsed.barriersText === undefined) parsed.barriersText = '';
        return parsed;
      }
    } catch (e) {}
    return freshState();
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
    if (sg) sg.textContent = pname() ? (pname() + ', Агеев написал') : 'Агеев написал';
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

    // ── речь персонажей — теми же пузырями, что в раундах 3 и 5 ──
    // Раунд 4 не переписка: под репликой идёт рабочая форма (состояния, этапы,
    // барьеры). Пузырь нужен только чтобы речь везде выглядела одинаково.
    function speechOf(t) {
      // Внешние кавычки у реплик не пишем (нормализация 2026-07-31), и снимать
      // их нельзя: реплика может НАЧИНАТЬСЯ с названия в «ёлочках» — прежний
      // strip съедал у него открывающую кавычку.
      return String(t || '').trim();
    }
    // «Моя» сторона — как в раунде 2: пока шаг открыт, поле справа; зафиксированный
    // ответ становится своим пузырём.
    function me(text) {
      var t = String(text == null ? '' : text).trim();
      return '<div class="chat"><div class="chat-msg me"><span class="chat-name">Вы</span>' +
        '<div class="chat-bubble">' + (t ? escapeHtml(t).replace(/\n/g, '<br />') : '<i>промолчали</i>') + '</div>' +
        '</div></div>';
    }
    function them(name, o) {
      o = o || {};
      return '<div class="chat"><div class="chat-msg them" data-who="' + name + '">' +
        (name ? '<span class="chat-name">' + name +
          (o.note ? ' <span class="chat-note">(' + o.note + ')</span>' : '') + '</span>' : '') +
        (o.act ? '<div class="chat-act">' + o.act + '</div>' : '') +
        '<div class="chat-bubble">' + speechOf(o.speech) + '</div>' +
        '</div></div>';
    }

    // позиция со станции 2 — то, путь к чему Штерн заставляет расписать (ПП).
    var s2 = null;
    try { s2 = JSON.parse(localStorage.getItem(station2Key(session.bib)) || 'null'); } catch (e) {}
    var stance = window.imp.stanceOf && window.imp.stanceOf(s2);
    // своя позиция без названия (длинное описание) в реплику Штерна не влезает —
    // тогда говорим о «курсе»; названную позицию подставляем как обычно
    var stancePhrase = (stance && (!stance.isOwn || stance.named)) ? stance.label : 'выбранный вами курс';
    // Собственное решение со встречи с Агеевым — подставляем как опору, чтобы путь
    // не начинался с чистого листа. В новом разговоре это ownMove (ход, названный
    // до того, как прозвучали позиции правления); у прежних прогонов — firstAction.
    var firstMove = (s2 && (s2.ownMove || s2.firstAction) ? String(s2.ownMove || s2.firstAction).trim() : '');

    // Предзаполнение первым ходом снято вместе с конструктором этапов: сеять
    // текст в окно значило бы диктовать форму ответа. Ход остаётся НАПОМИНАНИЕМ
    // над окном (см. .pp-firstmove ниже) — это своё же решение участника, которое
    // он не обязан держать в голове, а не подсказка структуры.

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

    // ---------- окно 1: путь (ПП-1) ----------
    // Вопрос называет ограничение (люди и деньги одни и те же) и НЕ называет
    // ни цели, ни этапов, ни необходимости обосновать порядок. Ограничение здесь
    // не подсказка, а условие задачи: без него «путь» можно описать как список
    // желаемого, и тогда мерить нечего.

    function buildQ1Block() {
      var locked = stepLocked('q1');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        them('Григорий Штерн', { note: 'финансовый директор', act: 'ставит чашку',
          speech: escapeHtml(stancePhrase) + ' — на словах красиво. Но я финансист, мне нужен путь, а не название.' }) +
        them('', { speech: 'Как мы туда придём? Только сразу учтите: люди у нас одни и те же, денег ровно столько, сколько есть. Значит всё сразу не поедет — и вот что за чем и почему, мне и надо понять.' }) +
        (firstMove ? '<div class="pp-firstmove">Ваш ход из разговора с Агеевым: «' + escapeHtml(firstMove) + '». Держите его в виду — переписывать не обязательно.</div>' : '') +
        (locked ? me(state.pathText)
                : '<div class="s2-mine"><span class="chat-name">Вы</span>' +
                    '<textarea class="pp-path" aria-label="Как придём к цели" rows="10" placeholder="ваш ответ Штерну">' + escapeHtml(state.pathText) + '</textarea>' +
                  '</div>' +
                  '<button class="btn btn-primary" id="commitQ1Btn" style="margin-top:12px;">Ответить →</button>');

      if (!locked) {
        block.querySelector('.pp-path').addEventListener('input', function (e) {
          state.pathText = e.target.value; saveState();
        });
        block.querySelector('#commitQ1Btn').addEventListener('click', function () {
          var go = function () { state.step = 'q2'; saveState(); render(); };
          if (!state.pathText.trim()) {
            window.imp.confirm('Штерн ждёт путь — промолчать?', { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
              .then(function (ok) { if (ok) go(); });
            return;
          }
          go();
        });
      }
      return block;
    }

    // ---------- окно 2: барьеры и опора (ПП-2) ----------
    // Ни кнопок «данность / снимаю», ни отдельных списков: функциональная
    // классификация — это маркер pp2_3to4, и она обязана прийти из текста.
    // Кнопкой она выдавалась за нажатие, а подпись поля («чем платите за снятие»)
    // была дословной формулировкой маркера, то есть прямой утечкой рубрики.

    function buildQ2Block() {
      var locked = stepLocked('q2');
      var laid = String(state.pathText || '').trim().length;
      var react = laid >= 200
        ? { act: 'дочитывает', speech: 'Ясно. Уже похоже на путь, а не на список желаний.' }
        : { act: 'поднимает бровь', speech: 'Коротко. Ну ладно, тогда второй вопрос.' };
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        them('Григорий Штерн', react) +
        them('', { act: 'откладывает чашку', speech: 'И где это сломается. Что вас остановит — и на что вы тут опираетесь. Мне не «рынок изменится», мне конкретно.' }) +
        (locked ? me(state.barriersText)
                : '<div class="s2-mine"><span class="chat-name">Вы</span>' +
                    '<textarea class="pp-barriers" aria-label="Что остановит и на что опираетесь" rows="9" placeholder="ваш ответ Штерну">' + escapeHtml(state.barriersText) + '</textarea>' +
                  '</div>' +
                  '<button class="btn btn-primary" id="commitQ2Btn" style="margin-top:12px;">Ответить</button>');

      if (!locked) {
        block.querySelector('.pp-barriers').addEventListener('input', function (e) {
          state.barriersText = e.target.value; saveState();
        });
        block.querySelector('#commitQ2Btn').addEventListener('click', function () {
          var go = function () { state.step = 'done'; saveState(); render(); };
          if (!state.barriersText.trim()) {
            window.imp.confirm('Ничего не ответить Штерну — так и зафиксируем?', { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
              .then(function (ok) { if (ok) go(); });
            return;
          }
          go();
        });
      }
      return block;
    }

    // Последний ответ сначала становится репликой, и только потом раунд можно
    // закончить: прежняя кнопка делала оба действия сразу, и свой последний ответ
    // участник в разговоре не видел — он сразу улетал в оверлей.
    function buildDoneBlock() {
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML = '<button class="btn btn-primary" id="finishBtn">Закончить раунд →</button>';
      block.querySelector('#finishBtn').addEventListener('click', finishRoom);
      return block;
    }

    function render() {
      body.innerHTML = '';
      var upTo = state.finished ? STEPS.length - 1 : stepIndex(state.step);
      if (upTo >= 0) body.appendChild(buildQ1Block());
      if (upTo >= 1) body.appendChild(buildQ2Block());
      if (state.step === 'done' && !state.finished) body.appendChild(buildDoneBlock());
      // неразрывные пробелы после предлогов — уже по вставленной разметке
      if (window.imp && window.imp.typoDom) window.imp.typoDom(body);
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

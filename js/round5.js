// i(m)perfect — «Очередь в «Прожектор»» (кейс «Искра»). Навык ГА целиком:
// самостоятельная генерация альтернатив (ГА-1) + привлечение идей из разных
// областей (ГА-2).
//
// РЕДИЗАЙН v2 (2026-07-27): прежняя версия просила участника ретроспективно
// ДОКАЗАТЬ, что у него был выбор («что у вас было из чего выбирать — и почему
// отмели остальное»). Три врождённых порока: (1) это экзамен памяти о собственном
// размышлении — рационализацию задним числом не отличить от реальной генерации;
// (2) к пятому раунду участник уже трижды защитил позицию (Агеев → Лемех → Штерн),
// просьба «а какие были альтернативы» читается как предложение сдать её;
// (3) материал выработан — по главной развилке всё уже сказано. Эмпирика:
// ГА-1 = 1 у всех живых прогонов.
//
// Решение — генерация ВЖИВУЮ на свежей под-задаче ИЗ КЕЙСА, которую стратегия
// участника не покрывает: Даше (тимлид) спустили сверху «перебей офферы, удержи
// людей» — половина команды переписывается с Nord Labs. Задача с двойным дном:
// за очевидным «доплатить» есть переформулировка проблемы (почему смотрят наружу)
// — это и есть верхние уровни ГА. Сама развилка «деньги/не деньги» участнику
// НЕ подсказывается: ни Даша, ни камео её не проговаривают.
//
// Три шага ( id шагов прежние — q1/q2/q3):
//   q1  Брагин пересказывает Дашину задачу и задаёт ОТКРЫТЫЙ вопрос («сработает
//       так, как ей велят? что бы вы держали в голове?»). Списка НЕ просим —
//       иначе рубится самостоятельность (ГА-1 2→3 «б»): несколько разных ходов
//       должны появиться сами. → answer1
//   q2  Брагин добивает: «где сами колебались, что перебрали и отбросили» —
//       ПРЯМОЙ запрос под-решений (ГА-1 3→4; судья знает, что это прямой
//       вопрос, и спонтанность здесь не начисляет). → subdecisions
//   q3  Камео с другого этажа (без выводов и без готовых аналогий — только
//       «у нас та же песня была») легитимизирует перенос; Брагин спрашивает,
//       откуда ход («из головы, из жизни?») — свободный текст, БЕЗ меню
//       источников: прежние чекбоксы перечисляли лестницу ГА-2 и подсказывали
//       рубрику. → sourceElaboration (state.sources остаётся пустым легаси-полем)
//
// Поля бэкенда те же (answer1/subdecisions/sourceElaboration; source больше не
// пишется). В сохранение добавлен v=2 (roundVer) — судья отличает записи новой
// механики от прежних.
//
// Миграция: незавершённая сессия старой версии начинается заново (её ответы
// отвечали на другие вопросы — переносить их под новые нельзя); завершённая
// не трогается, это исторические данные.

(function () {
  var session = null;
  // имя из окна Агеева (может быть пустым) — для обращения в репликах; экранируем при вставке
  function pname() { return session && session.name ? String(session.name).trim() : ''; }
  var state = null;

  function storageKey(bib) { return 'imp_round5_' + bib; }
  function station2Key(bib) { return 'imp_round2_' + bib; }

  function loadSession() {
    try { return window.imp.loadSession(); } catch (e) { return null; }
  }

  function freshState(startedAt) {
    return {
      v: 2,
      answer1: '', sources: [], subdecisions: '', sourceElaboration: '',
      step: 'q1', finished: false,
      startedAt: startedAt || new Date().toISOString()
    };
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.v !== 2) {
          // сессия старой механики: завершённую сохраняем как есть (историческая,
          // показывается только финиш-оверлей), незавершённую начинаем заново —
          // её ответы отвечали на прежние вопросы и под новыми исказили бы оценку
          if (parsed.finished) return parsed;
          return freshState(parsed.startedAt);
        }
        if (!parsed.sources) parsed.sources = [];
        if (parsed.subdecisions === undefined) parsed.subdecisions = '';
        if (parsed.sourceElaboration === undefined) parsed.sourceElaboration = '';
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
    return window.imp.callApiConfirmed('saveRoomAlternatives', { bib: session.bib, state: state });
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
    document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(6, '0');
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

    var introKey = 'imp_round5_intro_seen_' + session.bib;
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

    // q1 — сцена (Брагин + Даша) и ОТКРЫТЫЙ вопрос. Списка не просим: несколько
    // разных ходов должны появиться сами (ГА-1 2→3 «б»). Даша НЕ проговаривает
    // сомнение «деньги ли это» — иначе переформулировка задачи (верхний уровень)
    // была бы подсказана; спор Брагина и Даши сигналит только «это обсуждаемо».
    function buildQ1Block() {
      var locked = stepLocked('q1');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Олег Брагин</b> — тот самый, из первой сотни, — ловит взглядом ваш бейдж: «' + (pname() ? escapeHtml(pname()) + '? Консультант' : 'Консультант') + ', значит. Со стороны. Тогда рассудите — а то мы тут с Дашей второй кофе спорим».</p>' +
        '<p class="s2-ageev"><b>Даша</b>, тимлид одной из продуктовых команд, не отрываясь от стакана: «Да что спорить. У меня половина команды переписывается с Nord Labs — сама видела, как двое ходили „на кофе“ к их рекрутеру. Сверху спустили бюджет: перебей офферы, удержи людей. А я думаю — да и уйдут, правильно сделают. Там интереснее, чем у нас.»</p>' +
        '<p class="s2-ageev"><b>Брагин</b> фыркает: «Да ничего они не построят. Наберут звёзд и утонут». Поворачивается к вам: «Вот и рассудите: кто из нас прав — получится у них или нет? И если бы вы у них за это отвечали — что бы делали?»</p>' +
        '<textarea class="s2-rationale" aria-label="Получится ли у Nord Labs и что бы вы делали на их месте" rows="5" placeholder="ваш ответ"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.answer1) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitQ1Btn" style="margin-top:12px;">Ответить →</button>');
      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.answer1 = e.target.value; saveState();
        });
        block.querySelector('#commitQ1Btn').addEventListener('click', function () {
          var go = function () { state.step = 'q2'; saveState(); render(); };
          if (!state.answer1.trim()) {
            window.imp.confirm('Ничего не ответить Брагину — так и зафиксируем?', { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
              .then(function (ok) { if (ok) go(); });
            return;
          }
          go();
        });
      }
      return block;
    }

    // q2 — ПРЯМОЙ запрос под-решений (ГА-1 3→4): где колебался, что отбросил.
    // Судья знает, что этот вопрос прямой, — спонтанность по нему не начисляется.
    function buildQ2Block() {
      var locked = stepLocked('q2');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev">' + ((state.answer1 || '').trim().length >= 40
          ? '<b>Брагин</b> хмыкает: «Смотрите-ка, не пустой звук».'
          : '<b>Брагин</b> пожимает плечами: «Ну, допустим».') + '</p>' +
        '<p class="s2-ageev"><b>Даша</b> ставит стакан: «А что ещё у них есть в руках? И почему вы бы выбрали именно то, что сказали?»</p>' +
        '<textarea class="ga-subdec" aria-label="Где колебались — что перебрали и отбросили и почему" rows="3" placeholder="ваш ответ Брагину"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.subdecisions) + '</textarea>' +
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

    // q3 — источник хода (ГА-2), свободным текстом. Камео без вывода и без
    // готовой аналогии («чем кончилось» не рассказывает — иначе переформулировка
    // и перенос были бы подсказаны); Брагин не перечисляет типы источников
    // (прежние чекбоксы показывали лестницу ГА-2) — просто «из головы, из жизни?».
    function buildQ3Block() {
      var locked = stepLocked('q3');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Женщина с логистики Меридиана</b>, вполуха из очереди позади: «У нас пару лет назад соседи по рынку полкоманды увели — до сих пор спорим, кто в итоге выиграл». Забирает свой стакан, уходит к лифтам.</p>' +
        '<p class="s2-ageev"><b>Брагин</b> провожает её взглядом: «Тут все друг у друга подсматривают, кофейня такая. Только вы про них ничего толком не знаете — ни цифр, ни планов. Откуда тогда всё это? Из головы или видели где-то?»</p>' +
        '<textarea class="ga-elab" aria-label="Откуда ваш ход" rows="3" placeholder="ваш ответ Брагину"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.sourceElaboration) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="finishBtn" style="margin-top:12px;">Завершить разговор →</button>');
      if (!locked) {
        block.querySelector('.ga-elab').addEventListener('input', function (e) {
          state.sourceElaboration = e.target.value; saveState();
        });
        block.querySelector('#finishBtn').addEventListener('click', function () {
          if (!state.sourceElaboration.trim()) {
            window.imp.confirm('Ничего не ответить Брагину — так и зафиксируем?', { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
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

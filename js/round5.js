// i(m)perfect — «Очередь в „Прожектор“» (кейс «Искра»). Навык ГА целиком:
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
    // ── чат: в пузыре только прямая речь ──
    // name — кто говорит (капсом), note — уточнение о нём (в скобках),
    // act — что делает при этом (курсивом), speech — сама реплика,
    // after — ремарка после реплики (курсивом).
    // Пузырь сам обозначает прямую речь — внешние «ёлочки» в нём лишние.
    // Внутренние лапки («на кофе») не трогаем, точку в конце сохраняем.
    function speechOf(t) {
      return String(t || '').trim().replace(/^«/, '').replace(/»([.!?…]?)$/, '$1');
    }

    function them(name, o) {
      o = o || {};
      return '<div class="chat-msg them" data-who="' + name + '">' +
        (name ? '<span class="chat-name">' + name +
          (o.note ? ' <span class="chat-note">(' + o.note + ')</span>' : '') + '</span>' : '') +
        (o.act ? '<div class="chat-act">' + o.act + '</div>' : '') +
        '<div class="chat-bubble">' + speechOf(o.speech) + '</div>' +
        (o.after ? '<div class="chat-after">' + o.after + '</div>' : '') +
        '</div>';
    }
    function me(text) {
      var t = String(text || '').trim();
      t = t ? escapeHtml(t) : '<i>промолчали</i>';
      return '<div class="chat-msg me" data-who="Вы"><span class="chat-name">Вы</span>' +
             '<div class="chat-bubble">' + t + '</div></div>';
    }
    function inputBox(cls, aria, value, ph, btnId, btnLabel) {
      return '<div class="chat-input"><textarea class="' + cls + '" aria-label="' + aria + '" rows="4" placeholder="' + ph + '">' +
             escapeHtml(value || '') + '</textarea>' +
             '<button class="btn btn-primary" id="' + btnId + '" style="margin-top:10px;">' + btnLabel + '</button></div>';
    }

    function buildQ1Block() {
      var locked = stepLocked('q1');
      var block = document.createElement('div');
      block.className = 'chat';
      block.innerHTML =
        them('Олег Брагин', { note: 'тот самый, из первой сотни', act: 'ловит взглядом ваш бейдж',
          speech: '«' + (pname() ? escapeHtml(pname()) + '? Консультант' : 'Консультант') + ', значит. Со стороны. Тогда рассудите — а то мы тут с Дашей второй кофе спорим».' }) +
        them('Даша', { note: 'тимлид одной из продуктовых команд', act: 'не отрываясь от стакана',
          speech: '«Да что спорить. У меня половина команды переписывается с Nord Labs — сама видела, как двое ходили «на кофе» к их рекрутеру. Сверху спустили бюджет: перебей офферы, удержи людей. А я думаю — да и уйдут, правильно сделают. Там интереснее, чем у нас.»' }) +
        them('Олег Брагин', { act: 'фыркает', speech: '«Вот так ты, значит, к своей команде. Подожди — ничего этот Nord Labs не построит. Наберут звёзд да и утонут».' }) +
        them('Олег Брагин', { act: 'поворачивается к вам', speech: '«Вот и рассудите: кто из нас прав — получится у них или нет? И если бы вы были на месте Даши, но в Nord Labs — что бы делали?»' }) +
        (locked ? me(state.answer1)
                : inputBox('s2-rationale', 'Получится ли у Nord Labs и что бы вы делали на их месте', state.answer1, 'ваш ответ', 'commitQ1Btn', 'Ответить'));
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
      block.className = 'chat';
      block.innerHTML =
        them('Олег Брагин', (state.answer1 || '').trim().length >= 40
          ? { act: 'хмыкает', speech: '«Интересно-интересно».' }
          : { act: 'пожимает плечами', speech: '«Ну, допустим».' }) +
        them('Даша', { act: 'ставит стакан', speech: '«Да, подожди ты. ' + (pname() ? escapeHtml(pname()) + ', почему' : 'Почему') + ' вы сделали именно такие выводы? И как думаете, какие ещё у них карты на руках?»' }) +
        (locked ? me(state.subdecisions)
                : inputBox('ga-subdec', 'Почему такие выводы и какие ещё у них карты на руках', state.subdecisions, 'ваш ответ Даше', 'commitQ2Btn', 'Ответить'));
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
      block.className = 'chat';
      block.innerHTML =
        them('Девушка из отдела логистики «Меридиана»', { act: 'вдогонку из очереди позади',
          speech: '«У нас пару лет назад соседи по рынку полкоманды увели — до сих пор спорим, кто в итоге выиграл».',
          after: 'Забирает свой стакан, уходит к лифтам.' }) +
        them('Олег Брагин', { act: 'провожает её взглядом', speech: '«Тут все друг у друга подсматривают, кофейня такая. Только мне кажется, вы про Nord Labs ничего толком не знаете — ни цифр, ни планов. Откуда тогда все выводы? Придумали или видели где-то?»' }) +
        (locked ? me(state.sourceElaboration)
                : inputBox('ga-elab', 'Откуда ваш ход', state.sourceElaboration, 'ваш ответ Брагину', 'finishBtn', 'Ответить и закончить'));
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
      if (last && !state.finished) {
        // подряд идущие реплики одного человека не повторяют подпись — как в
        // мессенджерах; действие курсивом при этом остаётся у каждой
        var prevWho = null;
        body.querySelectorAll('.chat-msg').forEach(function (m) {
          var who = m.getAttribute('data-who') || '';
          var nameEl = m.querySelector('.chat-name');
          if (nameEl && who && who === prevWho) nameEl.remove();
          prevWho = who;
        });
        last.querySelectorAll('.chat-msg.them').forEach(function (m, i) {
          m.style.animationDelay = (i * 0.42) + 's';
          m.classList.add('is-new');
        });
        var ta = last.querySelector('textarea');
        (ta || last).scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
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

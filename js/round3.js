// i(m)perfect — «Встреча с Лемехом у лифта» (кейс «Искра»). Навык МК целиком: горизонт
// рассуждения (МК-1) + тип мышления о будущем — экстраполяция / образ / сценарии /
// «другая реальность» (МК-2).
//
// ПЕРЕСОБРАНО (валидация 2026-07-18, МК-1): прежняя версия спрашивала только
// «где „Искра" окажется?» — участник давал образ будущего без горизонта, и
// МК-1 (дальность горизонта) нечем было мерить, потолок упирался в ≈L3. Правка
// та же, что у ГА: добавлен бит, который даёт горизонту МЕСТО ПРОЯВИТЬСЯ, не
// подсказывая его. Горизонт нельзя тянуть в даль репликой (иначе меряем
// подсказку, а не мышление) — но спросить «на сколько лет вы смотрите и что за
// это время меняется» можно: судья и так оценивает не названную цифру, а
// глубину рассуждения на выбранном горизонте (см. MK_ESCALATION_PROMPT).
//
// Три бита (все — Лемех, на «вы»):
//   q1  «где „Искра" окажется?»  → образ будущего (vision, МК-2).
//   q2  «на сколько лет + на какой результат готовы работать, даже если
//       застанете не вы, и почему туда?» → горизонт+амбиция (horizon, МК-1 v9).
//       «что меняется по дороге» убрано — тянуло роадмап/декомпозицию (ПП).
//   q3  «какие развороты возможны и по каким признакам поймёте, какой из них
//       начинается?» → развороты (answer2, МК-2 сценарии/сигналы).
//
// Маппинг под неизменный бэкенд: answer1 = vision + horizon (склейка), answer2
// = развороты. Судью МК в backend/code.js и деплой не трогаем — callJudgeMK
// читает answer1/answer2 и верен §10.

(function () {
  var session = null;
  // имя из окна Агеева (может быть пустым) — для обращения в репликах; экранируем при вставке
  function pname() { return session && session.name ? String(session.name).trim() : ''; }
  var state = null;

  function storageKey(bib) { return 'imp_round3_' + bib; }
  function station2Key(bib) { return 'imp_round2_' + bib; }

  function loadSession() {
    try { return window.imp.loadSession(); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        // миграция: прежде answer1 = один ответ (образ будущего). Теперь answer1
        // склеивается из двух битов — картинка (vision) + горизонт (horizon).
        // Старый answer1 становится картинкой; горизонт пуст. Смена шага-цепочки
        // (добавлен q2-горизонт перед разворотами) для незавершённых прогонов
        // даёт максимум один повторный проход шага, без потери answer2.
        if (parsed.vision === undefined) parsed.vision = parsed.answer1 || '';
        if (parsed.horizon === undefined) parsed.horizon = '';
        return parsed;
      }
    } catch (e) {}
    return { vision: '', horizon: '', answer1: '', answer2: '', step: 'q1', finished: false, startedAt: new Date().toISOString() };
  }

  // answer1 (то, что видит судья) — склейка картинки и горизонта+амбиции.
  // «что меняется по дороге» убрано сознательно: это тянуло декомпозицию пути (ПП)
  // не в ту комнату. Спрашиваем горизонт + амбицию (на какой результат готов
  // работать, даже если застанет не он) — под МК-1 v9 (амбициозность+обоснование).
  function syncAnswer1() {
    var v = (state.vision || '').trim();
    var h = (state.horizon || '').trim();
    state.answer1 = h ? (v + '\n\n[горизонт и амбиция цели] ' + h) : v;
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
    window.imp.callApi('saveRoomFuture', { bib: session.bib, state: state });
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
  window.imp.hydrateOnce('loadRoomFuture', session.bib, storageKey(session.bib));

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

    // позиция, выбранная на станции 2, — предмет разговора: Лемех давит на грань
    // будущего именно ВАШЕГО выбора, а не задаёт вопрос в пустоту.
    var s2 = null;
    try { s2 = JSON.parse(localStorage.getItem(station2Key(session.bib)) || 'null'); } catch (e) {}
    var stance = window.imp.stanceOf && window.imp.stanceOf(s2);
    var stancePhrase = stance ? ('позицию ' + stance.label) : 'вашу рекомендацию';

    var introKey = 'imp_round3_intro_seen_' + session.bib;
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

    // q1 — образ будущего (МК-2). Горизонт тут не спрашивается сознательно.
    function buildQ1Block() {
      var locked = stepLocked('q1');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Лемех</b> придерживает двери лифта: «' + (pname() ? escapeHtml(pname()) + ', погодите-ка' : 'Погодите-ка') + '. Мне ' + escapeHtml(stancePhrase) + ' через полгода нести на совет Меридиана, а я пока сам не понимаю, куда оно нас в итоге приводит. Своими словами, без презентаций — если пойдём по-вашему, где „Искра“ окажется?»</p>' +
        '<textarea class="s2-rationale" rows="4" placeholder="ваш ответ Лемеху"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.vision) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitQ1Btn" style="margin-top:12px;">Ответить →</button>');
      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.vision = e.target.value; syncAnswer1(); saveState();
        });
        block.querySelector('#commitQ1Btn').addEventListener('click', function () {
          if (!state.vision.trim()) {
            if (!window.confirm('Ничего не ответить Лемеху — так и зафиксируем?')) return;
          }
          state.step = 'q2';
          saveState();
          render();
        });
      }
      return block;
    }

    // q2 — горизонт (МК-1). Спрашивает СВОЙ срок в годах и что к нему меняется,
    // не подсказывая направление (см. комментарий в шапке).
    function buildQ2Block() {
      var locked = stepLocked('q2');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev"><b>Лемех</b> кивает: «Ясно, картинку вижу. А на сколько лет вперёд вы смотрите — и на какой результат готовы работать, даже если он созреет уже без вас? И почему именно туда, а не куда попроще?»</p>' +
        '<textarea class="ga-horizon" rows="4" placeholder="горизонт в годах + на какой результат работаете (даже если созреет уже без вас) и почему именно туда"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.horizon) + '</textarea>' +
        '<div class="conn-note" style="font-size:12px; color:var(--muted-soft); margin:8px 0 0; line-height:1.45;">Пошаговый план и этапы — в разговоре со Штерном («Путь»). Здесь — куда и зачем, не как.</div>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitQ2Btn" style="margin-top:12px;">Дальше →</button>');
      if (!locked) {
        block.querySelector('.ga-horizon').addEventListener('input', function (e) {
          state.horizon = e.target.value; syncAnswer1(); saveState();
        });
        block.querySelector('#commitQ2Btn').addEventListener('click', function () {
          state.step = 'q3';
          saveState();
          render();
        });
      }
      return block;
    }

    // q3 — развороты будущего (МК-2, сценарии + сигналы). Смысл прежний,
    // формулировка вопроса — читаемее.
    function buildQ3Block() {
      var locked = stepLocked('q3');
      var block = document.createElement('div');
      var react = (state.horizon || '').trim().length >= 40
        ? '<b>Лемех</b> слушает, не перебивая, потом медленно: «Хм. Дальше вы заглянули, чем половина моего комитета».'
        : '<b>Лемех</b> ждёт секунду, будто надеясь на продолжение: «Коротко. Ну ладно, зайдём с другой стороны».';
      block.className = 's2-block';
      block.innerHTML =
        '<p class="s2-ageev">' + react + '</p>' +
        '<p class="s2-ageev"><b>Лемех</b> щурится: «Но будущее ведь может пойти по-разному. Набросайте 2–3 принципиально разных сценария — от чего зависит, куда качнёт (спрос на ИИ, регуляторика, интерфейс), и свой ход стратегии под каждый. По каким признакам поймёте заранее, какой начинается?»</p>' +
        '<textarea class="s2-rationale" rows="4" placeholder="2–3 разных сценария: от чего зависит + ваш ход под каждый (необязательно)"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.answer2) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="finishBtn" style="margin-top:12px;">Завершить разговор →</button>');
      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.answer2 = e.target.value; saveState();
        });
        block.querySelector('#finishBtn').addEventListener('click', finishRoom);
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
      syncAnswer1();
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

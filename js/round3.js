// i(m)perfect — «Встреча с Лемехом у лифта» (кейс «Искра»). Навык МК целиком: горизонт
// рассуждения (МК-1) + тип мышления о будущем — экстраполяция / образ / сценарии /
// «другая реальность» (МК-2).
//
// ПЕРЕСОБРАНО (валидация 2026-07-18, МК-1): прежняя версия спрашивала только
// «где «Искра" окажется?» — участник давал образ будущего без горизонта, и
// МК-1 (дальность горизонта) нечем было мерить, потолок упирался в ≈L3. Правка
// та же, что у ГА: добавлен бит, который даёт горизонту МЕСТО ПРОЯВИТЬСЯ, не
// подсказывая его. Горизонт нельзя тянуть в даль репликой (иначе меряем
// подсказку, а не мышление) — но спросить «на сколько лет вы смотрите и что за
// это время меняется» можно: судья и так оценивает не названную цифру, а
// глубину рассуждения на выбранном горизонте (см. MK_ESCALATION_PROMPT).
//
// Три бита (все — Лемех, на «вы»):
//   q1  «где «Искра" окажется?»  → образ будущего (vision, МК-2).
//   q2  «на какой результат вы в итоге работаете — и почему туда, а не куда
//       попроще?» → горизонт+амбиция (horizon, МК-1). Аудит 2026-07-27: из
//       вопроса убраны «даже если достанется уже не вам» (дословный признак
//       L5 МК-1 — должен прийти от участника) и «горизонт в годах» из
//       плейсхолдера (число лет — слабый прокси, судья обязан его игнорировать,
//       а форма его выпрашивала).
//   q3  «а если мир не подыграет — что тогда, и как поймёте, что пора менять
//       курс?» → answer2 (МК-2). Прежний вопрос зачитывал рецепт L4 целиком
//       («2–3 принципиально разных сценария, от чего зависит, ход под каждый»)
//       и сам называл драйверы — сценарии должны прийти от участника.
//
// Маппинг под неизменный бэкенд: answer1 = vision + horizon (склейка), answer2
// = ответ на «если мир не подыграет». callJudgeMK читает answer1/answer2.

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
        // Сессия, восстановленная с другого устройства, приходит с бэкенда. До
        // 01.08 там не было колонки metrics, а vision/horizon не возвращались
        // вовсе — поля открывались пустыми, и первая же правка пересобирала
        // answer1 из пустого, СТИРАЯ уже данные ответы из судимого поля.
        // Разбираем склейку обратно: текст в ней есть всегда, метки известны.
        var parts = splitAnswer1(parsed.answer1);
        if (parts) {
          if (!String(parsed.vision || '').trim()) parsed.vision = parts.vision;
          if (!String(parsed.horizon || '').trim()) parsed.horizon = parts.horizon;
          if (!String(parsed.metrics || '').trim()) parsed.metrics = parts.metrics;
        }
        // миграция: прежде answer1 = один ответ (образ будущего) без меток —
        // тогда разбирать нечего, весь текст становится картинкой.
        if (parsed.vision === undefined) parsed.vision = parsed.answer1 || '';
        // вопрос про параметры добавлен 2026-07-31 (минутки: четыре вопроса вместо
        // трёх). Незавершённые сессии, ушедшие дальше, вернём на него один раз —
        // иначе вставленный посреди цепочки шаг рендерился бы запертым и пустым.
        if (parsed.metrics === undefined) {
          parsed.metrics = '';
          if (!parsed.finished && (parsed.step === 'q3' || parsed.step === 'done')) parsed.step = 'q3metrics';
        }
        if (parsed.horizon === undefined) parsed.horizon = '';
        // Вопрос про расклады будущего вставлен 01.08 ПЕРЕД вопросом о смене
        // курса. Незавершённую сессию, стоящую на q3 или done, возвращаем на него
        // один раз — иначе вставленный посреди цепочки шаг отрисовался бы запертым
        // и пустым (ровно то, что случилось при вставке q3metrics 31.07).
        // Ответ про смену курса при этом сохраняется: answer2 не трогаем.
        if (parsed.scenarios === undefined) {
          parsed.scenarios = '';
          if (!parsed.finished && (parsed.step === 'q3' || parsed.step === 'done')) parsed.step = 'q3scen';
        }
        return parsed;
      }
    } catch (e) {}
    return { vision: '', horizon: '', metrics: '', scenarios: '', answer1: '', answer2: '', step: 'q1', finished: false, startedAt: new Date().toISOString() };
  }

  var H_MARK = '\n\n[горизонт и амбиция цели] ';
  var M_MARK = '\n\n[по каким параметрам поймём, что дошли] ';

  // Обратная операция к syncAnswer1: достаёт части из склейки. Нужна там, где
  // части потерялись, а склейка цела (восстановление сессии с бэкенда).
  // Возвращает null, если меток нет — значит склейки не было и разбирать нечего.
  function splitAnswer1(a1) {
    var s = String(a1 || '');
    var iH = s.indexOf(H_MARK), iM = s.indexOf(M_MARK);
    if (iH < 0 && iM < 0) return null;
    var bounds = [iH, iM].filter(function (x) { return x >= 0; });
    var out = { vision: s.slice(0, Math.min.apply(null, bounds)).trim(), horizon: '', metrics: '' };
    if (iH >= 0) out.horizon = s.slice(iH + H_MARK.length, (iM > iH) ? iM : s.length).trim();
    if (iM >= 0) out.metrics = s.slice(iM + M_MARK.length, (iH > iM) ? iH : s.length).trim();
    return out;
  }

  // answer1 (то, что видит судья) — склейка картинки и горизонта+амбиции.
  // «что меняется по дороге» убрано сознательно: это тянуло декомпозицию пути (ПП)
  // не в ту комнату. Спрашиваем горизонт + амбицию (на какой результат готов
  // работать, даже если застанет не он) — под МК-1 v9 (амбициозность+обоснование).
  function syncAnswer1() {
    var v = (state.vision || '').trim();
    var h = (state.horizon || '').trim();
    var m = String(state.metrics || '').trim();
    state.answer1 = v +
      (h ? '\n\n[горизонт и амбиция цели] ' + h : '') +
      (m ? '\n\n[по каким параметрам поймём, что дошли] ' + m : '');
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
    return window.imp.callApiConfirmed('saveRoomFuture', { bib: session.bib, state: state });
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

    // позиция, выбранная на станции 2, — предмет разговора: Лемех давит на грань
    // будущего именно ВАШЕГО выбора, а не задаёт вопрос в пустоту.
    var s2 = null;
    try { s2 = JSON.parse(localStorage.getItem(station2Key(session.bib)) || 'null'); } catch (e) {}
    var stance = window.imp.stanceOf && window.imp.stanceOf(s2);
    // Что именно Лемех несёт на совет: у готовых позиций — их название (в
    // винительном, поэтому падежи прописаны, а не собраны из метки), у своей
    // позиции и когда развилка не пройдена — нейтральное «стратегию вашу».
    var stanceSubject = (stance && stance.code === 'fortress') ? 'вашу «Крепость»'
      : (stance && stance.code === 'secondCurve') ? 'вашу «Вторую кривую»'
      : 'стратегию вашу';

    var introKey = 'imp_round3_intro_seen_' + session.bib;
    var introEl = document.getElementById('stationIntro');
    var lg = document.getElementById('lemekhGreet');
    if (lg) lg.textContent = pname() ? (pname() + ', найдёте') : 'Найдёте';
    if (localStorage.getItem(introKey)) introEl.style.display = 'none';
    document.getElementById('dismissIntro').addEventListener('click', function () {
      introEl.style.display = 'none';
      localStorage.setItem(introKey, '1');
    });
    document.getElementById('reopenIntroBtn').addEventListener('click', function () {
      introEl.style.display = 'flex';
    });

    var body = document.getElementById('roomBody');
    // q3scen — сценарии будущего (МК-2), q3 — признаки смены курса.
    // Раньше это был ОДИН вопрос «как поймём, что пора менять курс», и он
    // спрашивал не то, что судит МК-2: судья ищет ≥2 качественно разных мира со
    // стратегией под каждый, а участник честно отвечал про индикаторы провала
    // одного плана — по методологии это «план А с триггерами», потолок L3.
    // Результат: все девять оценённых (7 живых + Опус + Хайку) имели МК-2 ≤ 3,
    // включая того, кто дал четыре развилки. Разводим на два вопроса: сценарии
    // судит МК-2, признаки смены курса остаются в разговоре как материал ПР-2.
    var STEPS = ['q1', 'q2', 'q3metrics', 'q3scen', 'q3', 'done'];
    function stepIndex(s) { return STEPS.indexOf(s); }
    function stepLocked(s) { return state.finished || stepIndex(s) < stepIndex(state.step); }

    // ── чат: в пузыре только прямая речь ──
    // name — кто говорит (капсом), note — уточнение о нём (в скобках),
    // act — что делает при этом (курсивом), speech — сама реплика,
    // after — ремарка после реплики (курсивом).
    // Пузырь сам обозначает прямую речь — внешние «ёлочки» в нём лишние.
    // Внутренние лапки («на кофе») не трогаем, точку в конце сохраняем.
    function speechOf(t) {
      // Внешние кавычки у реплик не пишем (нормализация 2026-07-31), и снимать
      // их нельзя: реплика может НАЧИНАТЬСЯ с названия в «ёлочках» — прежний
      // strip съедал у него открывающую кавычку.
      return String(t || '').trim();
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

    // q1 — образ будущего (МК-2). Горизонт тут не спрашивается сознательно.
    function buildQ1Block() {
      var locked = stepLocked('q1');
      var block = document.createElement('div');
      block.className = 'chat';
      block.innerHTML =
        them('Виктор Лемех', { note: 'вице-президент «Меридиана» по спецпроектам', speech: (pname() ? escapeHtml(pname()) + ', мне' : 'Мне') + ' ' + stanceSubject + ' через полгода нести на совет Меридиана — а я пока не вижу, к чему она в итоге ведёт. Расскажите, своими словами: если пойдём по-вашему пути, где «Искра» окажется?' }) +
        (locked ? me(state.vision)
                : inputBox('s2-rationale', 'Куда придёт «Искра», если пойти по-вашему', state.vision, 'ваш ответ Лемеху', 'commitQ1Btn', 'Ответить'));
      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.vision = e.target.value; syncAnswer1(); saveState();
        });
        block.querySelector('#commitQ1Btn').addEventListener('click', function () {
          var go = function () { state.step = 'q2'; saveState(); render(); };
          if (!state.vision.trim()) {
            window.imp.confirm('Ничего не ответить Лемеху — так и зафиксируем?', { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
              .then(function (ok) { if (ok) go(); });
            return;
          }
          go();
        });
      }
      return block;
    }

    // q2 — горизонт (МК-1). Открытый вопрос про результат и «почему туда»:
    // ни срок, ни выход за пределы участия не подсказываются (см. шапку).
    function buildQ2Block() {
      var locked = stepLocked('q2');
      var block = document.createElement('div');
      block.className = 'chat';
      block.innerHTML =
        them('Виктор Лемех', { act: 'кивает', speech: 'Ясно, картинку вижу. И на какой результат вы нас толкаете — и почему туда, а не куда попроще или наоборот ещё сложнее?' }) +
        (locked ? me(state.horizon)
                : (inputBox('ga-horizon', 'На какой результат работаете и почему туда', state.horizon, 'ваш ответ Лемеху', 'commitQ2Btn', 'Ответить') +
                   '<div class="conn-note" style="font-size:12px; color:var(--muted-soft); margin:6px 0 0; line-height:1.45;">Здесь — про куда и зачем, а не про как: направление и результат, без пошагового плана.</div>'));
      if (!locked) {
        block.querySelector('.ga-horizon').addEventListener('input', function (e) {
          state.horizon = e.target.value; syncAnswer1(); saveState();
        });
        block.querySelector('#commitQ2Btn').addEventListener('click', function () {
          state.step = 'q3metrics';
          saveState();
          render();
        });
      }
      return block;
    }

    // Параметры результата (минутки 30.07: четвёртый вопрос про метрики).
    // Сами метрики НЕ подсказываем — это прямо отклонено: «не наводить
    // участника на метрики в вопросах». Лемех спрашивает, ПО ЧЕМУ поймём,
    // что дошли, но ни одного параметра не называет: на L5 человек оперирует
    // ими сам, и подсказка убила бы этот признак.
    function buildMetricsBlock() {
      var locked = stepLocked('q3metrics');
      var block = document.createElement('div');
      block.className = 'chat';
      block.innerHTML =
        them('Виктор Лемех', { act: 'черкает на обороте распечатки',
          speech: 'Допустим. А как мы поймём, что дошли — по каким параметрам? Мне на совете скажут: покажи, где мы будем считать, что получилось.' }) +
        (locked ? me(state.metrics)
                : inputBox('mk-metrics', 'По каким параметрам поймёте, что дошли', state.metrics, 'ваш ответ Лемеху', 'commitMetricsBtn', 'Ответить'));
      if (!locked) {
        block.querySelector('.mk-metrics').addEventListener('input', function (e) {
          state.metrics = e.target.value; syncAnswer1(); saveState();
        });
        block.querySelector('#commitMetricsBtn').addEventListener('click', function () {
          var go = function () { state.step = 'q3'; saveState(); render(); };
          if (!state.metrics.trim()) {
            window.imp.confirm('Ничего не ответить Лемеху — так и зафиксируем?', { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
              .then(function (ok) { if (ok) go(); });
            return;
          }
          go();
        });
      }
      return block;
    }

    // q3scen — сценарии будущего. Это и есть предмет МК-2: не «что если план не
    // сработает» (успех/провал одной траектории — по методологии L3), а разные
    // МИРЫ, разведённые внешними условиями, и что компания делает в каждом.
    // Вопрос спрашивает ровно это, не преподавая термин «сценарий»: у Лемеха
    // своя причина спрашивать — ему нести стратегию на совет, где спросят «а если».
    function buildScenBlock() {
      var locked = stepLocked('q3scen');
      var block = document.createElement('div');
      var deep = (state.horizon || '').trim().length >= 40;
      var react = deep
        ? { act: 'слушает, не перебивая, потом медленно', speech: 'Хм. Дальше вы заглянули, чем половина моего комитета.' }
        : { act: 'ждёт секунду, будто надеясь на продолжение', speech: 'Коротко. Ну ладно, зайдём с другой стороны.' };
      block.className = 'chat';
      block.innerHTML =
        them('Виктор Лемех', react) +
        them('Виктор Лемех', { act: 'щурится', speech: 'Но мир ведь может повернуться не так, как вы рассчитываете. Опишите пару раскладов, в которых всё сложится по-разному, — и что мы делаем в каждом.' }) +
        them('', { act: 'усмехается', speech: 'Меня на совете об этом спросят первым делом, а «будем следить за ситуацией» там не проходит.' }) +
        (locked ? me(state.scenarios)
                : inputBox('mk-scen', 'Какие расклады будущего вы видите и что делаем в каждом', state.scenarios, 'ваш ответ Лемеху', 'commitScenBtn', 'Ответить'));
      if (!locked) {
        block.querySelector('.mk-scen').addEventListener('input', function (e) {
          state.scenarios = e.target.value; saveState();
        });
        block.querySelector('#commitScenBtn').addEventListener('click', function () {
          var go = function () { state.step = 'q3'; saveState(); render(); };
          if (!state.scenarios.trim()) {
            window.imp.confirm('Ничего не ответить Лемеху — так и зафиксируем?', { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
              .then(function (ok) { if (ok) go(); });
            return;
          }
          go();
        });
      }
      return block;
    }

    // q3 — по каким признакам поймём, что пора менять курс. Судья МК-2 это НЕ
    // читает (триггеры пересмотра одного плана — материал ПР-2); вопрос остаётся,
    // потому что он естественно закрывает разговор и полезен на разборе.
    function buildQ3Block() {
      var locked = stepLocked('q3');
      var block = document.createElement('div');
      block.className = 'chat';
      block.innerHTML =
        them('Виктор Лемех', { act: 'кивает', speech: 'Ладно. И последнее, чтобы я мог это защищать: по каким признакам вы сами поймёте, что пора менять курс?' }) +
        (locked ? me(state.answer2)
                : inputBox('s2-rationale', 'По каким признакам поймёте, что пора менять курс', state.answer2, 'ваш ответ', 'commitQ3Btn', 'Ответить'));
      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.answer2 = e.target.value; saveState();
        });
        block.querySelector('#commitQ3Btn').addEventListener('click', function () {
          state.step = 'done'; saveState(); render();
        });
      }
      return block;
    }

    // Последний ответ сначала становится репликой, и только потом раунд можно
    // закончить: прежняя кнопка «Ответить и закончить» уводила в оверлей, и свой
    // последний ответ участник в разговоре не видел.
    function buildDoneBlock() {
      var block = document.createElement('div');
      block.className = 'chat';
      block.innerHTML = '<button class="btn btn-primary" id="finishBtn">Закончить раунд →</button>';
      block.querySelector('#finishBtn').addEventListener('click', finishRoom);
      return block;
    }

    function render() {
      body.innerHTML = '';
      var upTo = state.finished ? STEPS.length - 1 : stepIndex(state.step);
      if (upTo >= 0) body.appendChild(buildQ1Block());
      if (upTo >= 1) body.appendChild(buildQ2Block());
      if (upTo >= 2) body.appendChild(buildMetricsBlock());
      if (upTo >= 3) body.appendChild(buildScenBlock());
      if (upTo >= 4) body.appendChild(buildQ3Block());
      if (state.step === 'done' && !state.finished) body.appendChild(buildDoneBlock());
      // неразрывные пробелы после предлогов — уже по вставленной разметке
      if (window.imp && window.imp.typoDom) window.imp.typoDom(body);
      // короткое появление только у реплик текущего шага: перечитывая переписку,
      // участник не должен ждать анимации на уже отвеченном
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
        // Пауза перед следующей репликой = время на прочтение предыдущей:
        // 0.55с плюс 0.012с на знак, но не больше 2.2с — иначе на длинной реплике
        // участник ждёт вместо чтения. Фиксированные 0.42с были слишком коротки:
        // вопрос выезжал раньше, чем прочитана реакция.
        var d = 0, prevLen = 0;
        last.querySelectorAll('.chat-msg.them').forEach(function (m, i) {
          if (i) d += Math.min(2.2, 0.55 + prevLen * 0.012);
          m.style.animationDelay = d.toFixed(2) + 's';
          m.classList.add('is-new');
          var b = m.querySelector('.chat-bubble');
          prevLen = b ? b.textContent.trim().length : 0;
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
      syncAnswer1();
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

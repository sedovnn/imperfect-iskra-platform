// i(m)perfect — раунд 2 «Встреча с Агеевым» (кейс «Искра»).
// Навык ПР целиком: ПР-2 (свой ход → позиция по развилке с критериями → удержание
// под давлением) и ПР-1 (разбор двадцати решений менеджеров под ограничениями:
// что берём, от чего отказываемся и почему, плюс правило проверки новых идей).
//
// Порядок шагов — по ~/Desktop/FP/встреча_с_агеевым_диалог_v1.md. Он не случаен:
// собственное решение снимается ДО того, как названы позиции правления, иначе
// нельзя отличить свою мысль от выбора из предложенного. Бэклог идёт ПОСЛЕ
// стратегического выбора — годовые приоритеты проверяются на связность с ним.
//
// Разговор идёт только вперёд: зафиксированные шаги не переигрываются — как в
// настоящей встрече. Оценку считает бэкенд при завершении; участнику не показывается.

(function () {
  var session = null;
  // имя из окна Агеева (может быть пустым) — для обращения в репликах; экранируем при вставке
  function pname() { return session && session.name ? String(session.name).trim() : ''; }
  var state = null;

  function storageKey(bib) { return 'imp_round2_' + bib; }
  function station1Key(bib) { return 'imp_round1_' + bib; }

  function loadSession() {
    try { return window.imp.loadSession(); } catch (e) { return null; }
  }

  var STEPS = ['ownMove', 'stance', 'stress', 'backlog', 'rule'];

  function blankState() {
    return {
      cardsSnapshot: [],   // карта раунда 1 — во входе больше не участвует, остаётся в записи как контекст
      ownMove: '',         // шаг 1: свой ход и зачем — снимается ДО того, как названы позиции
      // шаг 2: рекомендация по развилке из письма Агеева (задание №3 кейса) —
      // спина всего финала: карта ссылается на неё, три разговора раскрывают грани.
      stance: '',          // 'fortress' | 'secondCurve' | 'other'
      stanceOther: '',
      stanceCriteria: '',
      stressChoice: '',    // шаг 3: 'hold' | 'calibrate' | 'change'
      stressComment: '',
      picks: {},           // шаг 4: { '<id решения>': { take: bool, reason: '' } }
      ownItems: [],        // шаг 4: свои позиции — [{id, title, people, money}]
      // Взгляд снаружи — то, зачем Агеев позвал участника («скажите, что я перестал
      // видеть изнутри»). Задаётся после разбора списка. ПОКА НЕ СУДИТСЯ: пишем
      // в запись и смотрим живые ответы. Если люди отвечают про второй порядок —
      // из этого выйдет контроль АК-1 (namesSecondOrder — его верхний маркер);
      // если перечисляют недостающие темы, значит вопрос про покрытие и в контроль
      // не годится, потому что список сам раздаёт карту тем и второй замер выходит
      // легче первого — флаг §7-8 срабатывал бы у всех по построению.
      blindSpot: '',
      rationale: '',       // шаг 5: почему именно эти приоритеты
      rejectionRule: '',   // шаг 5: правило, по которому проверяется новая инициатива
      proactiveText: '',   // шаг 5: что должно случиться, чтобы вы сами пришли пересматривать
      step: 'ownMove',
      finished: false,
      startedAt: new Date().toISOString()
    };
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        var def = blankState();
        Object.keys(def).forEach(function (k) {
          if (parsed[k] === undefined) parsed[k] = def[k];
        });
        if (!parsed.picks || typeof parsed.picks !== 'object') parsed.picks = {};
        if (!Array.isArray(parsed.ownItems)) parsed.ownItems = [];
        // Миграция на новый разговор (2026-07-31). Прежняя цепочка шагов была
        // 'sort' → 'rationale' → 'stress' → 'stance' → 'proactive' и начиналась
        // с сортировки собственных карточек — её больше нет. Незавершённый
        // прогон старой формы возвращаем в начало нового разговора: прежние
        // ответы из стейта НЕ стираем (уходят в запись и в «Мои ответы»), но
        // спрашиваем заново, потому что вопросы стали другими.
        if (!parsed.finished && STEPS.indexOf(parsed.step) === -1) parsed.step = 'ownMove';
        return parsed;
      }
    } catch (e) {}
    return blankState();
  }

  // прогон старой формы: завершён, но разбора бэклога в нём не было
  function isLegacyRun() {
    return state.finished && !Object.keys(state.picks || {}).length;
  }

  function uid() { return 'id_' + Math.random().toString(36).slice(2, 10); }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  // 0.4 → «0,4», 5 → «5»: запятая как десятичный разделитель, целые без хвоста
  function num(n) {
    var v = Math.round(Number(n) * 10) / 10;
    return String(v).replace('.', ',');
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
    // раунда — финиш-оверлей не показываем, пока ответ не принят (см. finishStation)
    if (!window.imp.isApiConfigured()) return Promise.resolve(true);
    return window.imp.callApiConfirmed('saveStation2', { bib: session.bib, state: state });
  }

  // ---------- gate ----------

  session = loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }

  // восстановление доступа на новом устройстве: локально для этого раунда пусто —
  // сначала подтягиваем реальный прогресс с бэкенда, иначе следующий же автосейв
  // затрёт его пустым стейтом (см. api.js hydrateOnce)
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
    document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(6, '0');
    initWorkspace(s1cards);
  }

  function showStation1Gate() {
    document.getElementById('gateStation1').style.display = 'flex';
  }

  // источник правды — бэкенд (кросс-девайсный), локальный стейт раунда 1 — фолбэк
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

    // снимок карточек раунда 1: во входе не участвует, но кабинет и судья читают
    // контекст отсюда, а не из раунда 1 — тот к этому моменту завершён и заперт.
    if (!state.cardsSnapshot.length) {
      state.cardsSnapshot = s1cards.map(function (c) { return { id: c.id, text: c.text }; });
      saveState();
    }

    var introKey = 'imp_round2_intro_seen_' + session.bib;
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

    // ── речь персонажей — теми же пузырями, что в раундах 3–5 ──
    function speechOf(t) {
      return String(t || '').trim().replace(/^«/, '').replace(/»([.!?…]?)$/, '$1');
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

    function stepIndex(step) { return STEPS.indexOf(step); }
    function stepLocked(step) {
      // шаг залочен, если разговор уже ушёл дальше него (или раунд завершён)
      return state.finished || stepIndex(step) < stepIndex(state.step);
    }
    function advance(to) {
      state.step = to;
      saveState();
      render();
    }

    // ---------- шаг 1: своё решение — до того, как названы позиции ----------
    // Собственная формулировка снимается ДО чужих вариантов: если дальше участник
    // предложит свою третью позицию, будет видно, придумал он её сам или
    // оттолкнулся от предложенных.

    function buildOwnMoveBlock() {
      var locked = stepLocked('ownMove');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        them('Кирилл Агеев', { note: 'гендиректор «Поиска и рекламы»', act: 'пожимает руку, кладёт распечатку на стол',
          speech: '«Спасибо, что приехали. Я прочитал. Спорить с формулировками не буду — на это нужен день, а его у нас нет.' }) +
        them('', { speech: '«Давайте сразу. Если бы решали вы — что делаем? Одним ходом, без списка. И обязательно скажите зачем. „Что“ я и сам придумаю, а вот „зачем“ у меня внутри никто не проговаривает».' }) +
        '<textarea class="s2-own-move" aria-label="Ваш ход и зачем вы его делаете" rows="4" placeholder="ваш ход — и зачем вы его делаете"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.ownMove) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="commitOwnMoveBtn" style="margin-top:12px;">Ответить →</button>');

      if (!locked) {
        block.querySelector('.s2-own-move').addEventListener('input', function (e) {
          state.ownMove = e.target.value; saveState();
        });
        block.querySelector('#commitOwnMoveBtn').addEventListener('click', function () {
          if (!state.ownMove.trim()) {
            window.imp.confirm('Ответ пустой — промолчать в ответ на прямой вопрос Агеева?',
              { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
              .then(function (ok) { if (ok) advance('stance'); });
            return;
          }
          advance('stance');
        });
      }
      return block;
    }

    // ---------- шаг 2: рамка и две позиции ----------
    // Обязательное в этой реплике (иначе замер ломается): обе позиции названы
    // с ценой, сказано что хватит только на одну, и проговорено что люди в обеих
    // программах одни и те же. Цифры совпадают с кейсом — менять только парой.

    function buildStanceBlock() {
      var locked = stepLocked('stance');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        them('Кирилл Агеев', { act: 'убирает распечатку',
          speech: '«Теперь то, ради чего я вас звал. В правлении оформились две позиции, у каждой сильные сторонники. Обычно в таких историях побеждает компромисс — вложиться и туда, и туда. У нас такой возможности нет, и вот почему.' }) +
        them('', { speech: '«„Меридиан“ зафиксировал инвестиционную рамку до 2029 года. После программы дата-центров, обязательств по „Маяку“ и дивидендов консорциума свободного капитала на стратегические программы остаётся около 250 миллиардов на три года. Привлекать долг под новые направления консорциум не будет — нам это сказали прямо и довольно откровенно».' }) +
        them('', { speech: '«Первую позицию называют „Крепость“. Это ставка на то, что кормит сегодня: перестроить выдачу под монетизацию „Ответа“, встроить рекламу в ИИ-ответ, дожать точность в цифровых каналах. Часть правления не хочет отказываться от бизнеса, который двадцать лет всех нас кормил. Обойдётся в 180 миллиардов.' }) +
        them('', { speech: '«Вторая — „Вторая кривая“. Ставка на следующее поколение устройств: восстановить локальные модели, довести „Миру“ до проактивного помощника, который живёт на любом устройстве, а дальше, возможно, и своё производство. Порядка 230 миллиардов.' }) +
        them('', { speech: '«Штерн оценил обе и сказал коротко: профинансировать обе на половину — способ гарантированно похоронить обе».' }) +
        them('', { act: 'делает паузу', speech: '«И ещё одно, что стоит держать в голове. В обеих программах работают одни и те же люди — инженеры, разработчики, ML-специалисты. Кандидатов нужного уровня на рынке единицы, и дерёмся мы за них не только со своей индустрией.' }) +
        them('', { speech: '«Что выбираете? Может быть, есть третий вариант, которого мы не видим, — тогда говорите его. И назовите два критерия, на которых стоит ваш ответ».' }) +
        '<label class="s2-radio"><input type="radio" name="stance" value="fortress"' + (state.stance === 'fortress' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> «Крепость» — 180 млрд</label>' +
        '<label class="s2-radio"><input type="radio" name="stance" value="secondCurve"' + (state.stance === 'secondCurve' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> «Вторая кривая» — 230 млрд</label>' +
        '<label class="s2-radio"><input type="radio" name="stance" value="other"' + (state.stance === 'other' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> Третий вариант — свой</label>' +
        '<textarea class="s2-stance-other" aria-label="Опишите вашу позицию" rows="2" placeholder="опишите вашу позицию" style="display:' + (state.stance === 'other' ? '' : 'none') + ';"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.stanceOther) + '</textarea>' +
        '<div class="rationale-block" style="margin-top:14px;">' +
          '<label>Два критерия, на которых стоит ваш ответ</label>' +
          '<textarea class="s2-stance-criteria" aria-label="Два критерия, на которых стоит ваш ответ" rows="3" placeholder="два критерия"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.stanceCriteria) + '</textarea>' +
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
            window.imp.alert('Агеев ждёт рекомендацию — выберите позицию или предложите свою.');
            return;
          }
          if (state.stance === 'other' && !state.stanceOther.trim()) {
            window.imp.confirm('Вы выбрали третий вариант, но не описали его.',
              { confirmLabel: 'Так и зафиксировать', cancelLabel: 'Опишу' })
              .then(function (ok) { if (ok) advance('stress'); });
            return;
          }
          advance('stress');
        });
      }
      return block;
    }

    // ---------- шаг 3: стресс-тест ----------
    // Давят КОМПРОМИССОМ, а не отсрочкой (замена посылки 2026-07-31, решение
    // пользователя). Причина методологическая: шаг несёт heldUnderPressure —
    // «удержал ли участник ЯДРО выбора», — а отсрочка ядра не касается, поэтому
    // «согласен подождать» и «отказался от ставки» были неразличимы: судья не мог
    // отделить уступку от нормального ответа. Плюс отсрочка проверяла ровно то,
    // что через минуту проверяет бэклог (дефицит в людях, а не в деньгах) — дубль.
    // Компромисс бьёт прямо в ядро: половина по условию убивает обе программы
    // (Штерн сказал это на шаге 2), значит удержаться можно только назвав, что
    // в ставке неделимо. Это heldUnderPressure и tradeoffReal без дубля.
    // Компромисс арифметически ВОЗМОЖЕН — 90 + 115 из 250, ещё и резерв остаётся —
    // и именно поэтому смертелен: так сделать можно, соблазн настоящий.
    // Рамка поднята с 210 до 250 (2026-07-31): при 210 «Вторая кривая» за 230 не
    // покупалась вообще, то есть из двух предложенных ставок одна была
    // недоступна. Заметить это было нечем (ни один маркер ПР-2 на арифметику
    // не срабатывает), зато внимательный к цифрам тихо подталкивался к
    // «Крепости» — то есть мы смещали выбор в консервативную сторону там, где
    // правильного ответа нет. При 250 обе ставки по отдельности влезают,
    // вместе (410) — нет, половина на половину влезает. Все три условия нужны:
    // без первого выбор фальшивый, без второго нет развилки, без третьего
    // нечем давить на шаге 3. Правление тянет к нему не
    // потому, что он лучший, а потому, что при нём никто не проигрывает.
    // Реплики Агеева на шаге 2 («обычно побеждает компромисс», цитата Штерна)
    // готовят этот ход — менять их только парой.
    // Значения радио (hold/calibrate/change) НЕ меняем: на них стоит бэкенд.

    function buildStressBlock() {
      var locked = stepLocked('stress');
      // Реакция на выбранную позицию стоит ЗДЕСЬ, сразу за выбором, а не в финальном
      // блоке (где она оказалась при переносе шагов 2026-07-31): позиция выбирается
      // на шаге 2, и отзыв на неё через два шага читался как «откуда это вдруг».
      // Реакции равны по валентности намеренно. «Смело» за одну ставку и «осторожно»
      // за другую — это обратная связь о том, какой выбор нам нравится, а выбранная
      // позиция живёт до конца прогона: раунды 3–5 раскрывают её грани, финал её
      // защищает. Один уходил подкреплённым, другой засомневавшимся, и это смещало
      // замер удержания. Схема одна на три: назвал → следствие → та же концовка.
      var st = window.imp.stanceOf && window.imp.stanceOf(state);
      var stanceReact = st && st.code === 'fortress'
        ? { speech: '«Крепость. Значит, держим то, что кормит, а на устройства в этот цикл не ставим. Записал».' }
        : (st && st.code === 'secondCurve'
          ? { speech: '«Вторая кривая. Значит, ставим на устройства, а рекламное ядро дальше живёт как есть. Записал».' }
          : (st && st.code === 'other'
            ? { speech: '«Ваш вариант. Значит, к правлению я иду не с одним из двух, а с третьим. Записал».' }
            : null));
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        (stanceReact ? them('Кирилл Агеев', stanceReact) : '') +
        them(stanceReact ? '' : 'Кирилл Агеев', { act: 'откидывается в кресле',
          speech: '«Теперь плохая новость. Помните, я сказал, что компромисса быть не может? На обе целиком его и нет. А вот половина есть — и правление на неё смотрит.' }) +
        them('', { speech: '«Я с ними поговорил. Проигрывать никто не хочет, поэтому все тянут к одному: дать обеим программам по половине и через год посмотреть, что вышло. Денег на это хватает, ещё и резерв остаётся. Поэтому им и нравится.' }) +
        them('', { speech: '«Штерн против — говорит, так мы похороним обе. Но он один, а остальные за».' }) +
        them('', { speech: '«В этом варианте ваша ставка получает половину. Держите её целиком или согласны? Если держите — дайте мне аргумент, с которым я к ним выйду».' }) +
        '<label class="s2-radio"><input type="radio" name="stressChoice" value="hold"' + (state.stressChoice === 'hold' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> Только целиком</label>' +
        '<label class="s2-radio"><input type="radio" name="stressChoice" value="calibrate"' + (state.stressChoice === 'calibrate' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> Урезать можно, но вот это — нет</label>' +
        '<label class="s2-radio"><input type="radio" name="stressChoice" value="change"' + (state.stressChoice === 'change' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> Согласен на половину</label>' +
        '<textarea class="s2-stress-comment" aria-label="Аргумент для правления" rows="4" placeholder="с чем Агеев выйдет к правлению"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.stressComment) + '</textarea>' +
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
            window.imp.alert('Агеев ждёт ответа: держите позицию или пересматриваете.');
            return;
          }
          advance('backlog');
        });
      }
      return block;
    }

    // ---------- шаг 4: двадцать решений менеджеров (ПР-1) ----------
    // Ограничения названы Агеевым вслух и совпадают с цифрами бэклога: 22 млрд
    // и около 500 человек против заявленных 2660 и 65. Дефицитны ЛЮДИ, а не
    // деньги — поэтому счётчик показывает оба ресурса, иначе переподписка
    // ненаблюдаема и ловушки бэклога (№16 просит 320 человек при нуле денег,
    // №18 «наймём 700» не работает внутри года) не срабатывают.
    // Выход за рамку НЕ блокируется намеренно: превышение — это наблюдаемый
    // ответ, а не ошибка формы.

    function allItems() {
      return (window.imp.backlog || []).concat(state.ownItems.map(function (o) {
        return { id: o.id, title: o.title, who: 'ваше предложение', people: o.people || 0, money: o.money || 0,
                 argument: o.trade ? 'За счёт чего: ' + o.trade : '', own: true };
      }));
    }

    function pickOf(id) {
      var p = state.picks[String(id)];
      return p && typeof p === 'object' ? p : null;
    }

    function takenTotals() {
      var people = 0, money = 0, taken = 0, undecided = 0, dropped = 0, reasoned = 0;
      allItems().forEach(function (it) {
        var p = pickOf(it.id);
        if (!p) { undecided++; return; }
        if (p.take) { taken++; people += Number(it.people) || 0; money += Number(it.money) || 0; }
        else { dropped++; if (String(p.reason || '').trim()) reasoned++; }
      });
      return { people: people, money: money, taken: taken, undecided: undecided, dropped: dropped, reasoned: reasoned };
    }

    function setPick(id, take) {
      var key = String(id);
      var prev = state.picks[key];
      state.picks[key] = { take: take, reason: prev && !take ? (prev.reason || '') : '' };
      saveState();
      renderBacklog();
    }

    var backlogHost = null;

    function backlogSummaryHtml() {
      var t = takenTotals();
      var lim = window.imp.backlogLimits;
      var overP = t.people > lim.people, overM = t.money > lim.money;
      return '<div class="bl-sum' + (overP || overM ? ' is-over' : '') + '">' +
        '<span class="bl-sum-item"><b>' + t.taken + '</b> берём</span>' +
        '<span class="bl-sum-item' + (overP ? ' is-over' : '') + '"><b>' + t.people + '</b> человек из ' + lim.people + '</span>' +
        '<span class="bl-sum-item' + (overM ? ' is-over' : '') + '"><b>' + num(t.money) + '</b> млрд из ' + lim.money + '</span>' +
        (t.undecided ? '<span class="bl-sum-left">осталось решить: ' + t.undecided + '</span>' : '') +
        '</div>';
    }

    // Полотно из двадцати карточек с аргументом в три строки — шесть экранов, и
    // читать его невозможно. Поэтому разбор идёт в два прохода внутри ОДНОГО шага:
    //   1) раскладываем: в списке только НЕРЕШЁННОЕ, решённое уезжает наверх
    //      в две компактные сводки — полотно тает по мере работы;
    //   2) когда нерешённого не осталось, открывается блок причин по отказам.
    // Так сравнение (это и есть приоритизация) не мешается с писаниной, а причину
    // человек пишет, уже видя всю картину целиком.
    // Аргумент автора виден у нерешённых и складывается у решённых: в аргументах
    // сидят ловушки (№16 «денег не требует» при 320 человеках, №18 «наймём столько
    // же»), и спрятать их за раскрытие значит выключить их.
    // Отдельного списка «теперь причины» больше нет (был до 2026-07-31 — вторая копия
    // тех же семнадцати позиций, страница выходила бесконечной). Пояснение живёт
    // внутри строки отказа, а напоминание — одной строкой у кнопки фиксации.
    function syncReasonHint() {
      if (!backlogHost) return;
      var host = backlogHost.querySelector('.bl-hint');
      if (!host) return;
      var t = takenTotals();
      var show = !stepLocked('backlog') && !t.undecided && t.dropped && !t.reasoned;
      host.innerHTML = show
        ? 'Ни один отказ не пояснён. Агеев просил объяснить те, что сами по себе решение, — хотя бы один: кнопка «пояснить» в строке.'
        : '';
      host.style.display = show ? '' : 'none';
    }

    function renderBacklog() {
      if (!backlogHost) return;
      var locked = stepLocked('backlog');
      var sum = backlogHost.querySelector('.bl-sum-host');
      if (sum) sum.innerHTML = backlogSummaryHtml();

      var decidedHost = backlogHost.querySelector('.bl-decided');
      var list = backlogHost.querySelector('.bl-list');
      if (!list) return;

      var items = allItems();
      var taken = [], dropped = [], undecided = [];
      items.forEach(function (it) {
        var p = pickOf(it.id);
        if (!p) undecided.push(it);
        else if (p.take) taken.push(it);
        else dropped.push(it);
      });

      // ── решённое: по одной строке, с возможностью передумать ──
      decidedHost.innerHTML = '';
      function miniGroup(title, arr, kind) {
        if (!arr.length) return;
        var g = document.createElement('div');
        g.className = 'bl-group is-' + kind;
        g.innerHTML = '<div class="bl-group-head">' + title + ' · ' + arr.length + '</div>';
        arr.forEach(function (it) {
          var p2 = pickOf(it.id) || {};
          var hasReason = kind === 'dropped' && !!String(p2.reason || '').trim();
          var row = document.createElement('div');
          row.className = 'bl-mini' + (hasReason ? ' is-open' : '');
          row.innerHTML =
            '<span class="bl-mini-title">' + escapeHtml(it.title) + '</span>' +
            '<span class="bl-mini-cost">' + it.people + ' чел. · ' + num(it.money) + ' млрд</span>' +
            (locked ? '' :
              '<span class="bl-mini-acts">' +
                (kind === 'dropped' ? '<button type="button" class="s2-act bl-why">' + (hasReason ? 'убрать' : 'пояснить') + '</button>' : '') +
                '<button type="button" class="s2-act" data-flip="1">' + (kind === 'taken' ? 'отложить' : 'взять') + '</button>' +
              '</span>') +
            (hasReason ? '<input type="text" class="bl-reason" aria-label="Почему откладываете: ' + escapeHtml(it.title) + '" placeholder="почему откладываете именно это"' +
              (locked ? ' disabled' : '') + ' value="' + escapeHtml(p2.reason || '') + '" />' : '');

          function bindReason() {
            var inp = row.querySelector('.bl-reason');
            if (!inp || locked) return;
            inp.addEventListener('input', function (e) {
              state.picks[String(it.id)].reason = e.target.value;
              saveState();
              syncReasonHint();
              // без полного ререндера: он бы перерисовал поле и сбросил каретку
            });
          }
          bindReason();

          if (!locked) {
            row.querySelector('[data-flip]').addEventListener('click', function () { setPick(it.id, kind !== 'taken'); });
            var why = row.querySelector('.bl-why');
            if (why) why.addEventListener('click', function () {
              var inp = row.querySelector('.bl-reason');
              if (inp) {
                inp.remove();
                state.picks[String(it.id)].reason = '';
                row.classList.remove('is-open');
                this.textContent = 'пояснить';
              } else {
                row.classList.add('is-open');
                row.insertAdjacentHTML('beforeend',
                  '<input type="text" class="bl-reason" aria-label="Почему откладываете: ' + escapeHtml(it.title) + '" placeholder="почему откладываете именно это" value="" />');
                bindReason();
                row.querySelector('.bl-reason').focus();
                this.textContent = 'убрать';
              }
              saveState();
              syncReasonHint();
            });
          }
          g.appendChild(row);
        });
        decidedHost.appendChild(g);
      }
      miniGroup('Беру', taken, 'taken');
      miniGroup('Откладываю', dropped, 'dropped');

      // ── нерешённое: полная карточка с аргументом автора ──
      list.innerHTML = '';
      undecided.forEach(function (it) {
        var row = document.createElement('div');
        row.className = 'bl-item';
        row.innerHTML =
          '<div class="bl-body">' +
            '<p class="bl-title">' + escapeHtml(it.title) + '</p>' +
            '<p class="bl-meta">' + escapeHtml(it.who) + ' <span>' + it.people + ' чел.</span> <span>' + num(it.money) + ' млрд</span></p>' +
            (it.argument ? '<p class="bl-arg">' + escapeHtml(it.argument) + '</p>' : '') +
          '</div>' +
          (locked ? '' :
            '<div class="bl-actions">' +
              '<button type="button" class="s2-act" data-take="1">берём</button>' +
              '<button type="button" class="s2-act" data-take="0">не сейчас</button>' +
              (it.own ? '<button type="button" class="s2-act" data-own-remove="1">убрать</button>' : '') +
            '</div>');
        if (!locked) {
          row.querySelector('[data-take="1"]').addEventListener('click', function () { setPick(it.id, true); });
          row.querySelector('[data-take="0"]').addEventListener('click', function () { setPick(it.id, false); });
          var rm = row.querySelector('[data-own-remove]');
          if (rm) rm.addEventListener('click', function () {
            state.ownItems = state.ownItems.filter(function (o) { return o.id !== it.id; });
            delete state.picks[String(it.id)];
            saveState(); renderBacklog();
          });
        }
        list.appendChild(row);
      });

      // ── взгляд снаружи: только когда список разложен ──
      // Стоит здесь, а не в финальном блоке, потому что предмет вопроса — сам
      // список: спрашивать «чего они не видят» до того, как человек прочёл все
      // двадцать, бессмысленно. Формулировка намеренно НЕ «чего не хватает
      // в списке»: на такой вопрос ответ лежит в самом списке (он раздаёт карту
      // тем), и мы получили бы перечисление, а не наблюдение.
      syncReasonHint();

      var blindHost = backlogHost.querySelector('.bl-blind');
      if (blindHost) {
        if (undecided.length) {
          blindHost.innerHTML = '';
        } else if (!blindHost.querySelector('.s2-blind')) {
          blindHost.innerHTML =
            them('Кирилл Агеев', { act: 'откладывает распечатку',
              speech: '«И то, зачем я вас, собственно, звал. Эти двадцать решений написали мои же менеджеры — каждый со своей колокольни. Чего они по своему положению увидеть не могут?»' }) +
            '<textarea class="s2-blind" aria-label="Чего менеджеры не могут увидеть по своему положению" rows="4" placeholder="ваш ответ"' +
              (locked ? ' disabled' : '') + '>' + escapeHtml(state.blindSpot || '') + '</textarea>';
          if (!locked) {
            blindHost.querySelector('.s2-blind').addEventListener('input', function (e) {
              state.blindSpot = e.target.value; saveState();
            });
          }
          if (window.imp && window.imp.typoDom) window.imp.typoDom(blindHost);
        }
      }

      if (window.imp && window.imp.typoDom) {
        window.imp.typoDom(list);
        window.imp.typoDom(decidedHost);
      }
    }

    function buildBacklogBlock() {
      var locked = stepLocked('backlog');
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        them('Кирилл Агеев', { act: 'достаёт другую распечатку',
          speech: '«Хорошо, надеюсь, что вы знаете, о чём говорите, и это решение действительно подкрепляют какие-то данные.' }) +
        them('', { speech: '«Но это ещё не всё. Помимо долгосрочных планов у меня на столе двадцать решений от моих менеджеров. Часть из них, возможно, подходят под вашу стратегию, часть, наверное, придётся делать при любой — но это вам и решать. В общем и целом, мы ждём от вас рекомендации по поводу того, что нам приоритизировать на ближайший год.' }) +
        them('', { speech: '«И не путайте с той рамкой. Двести пятьдесят — это три года под ставку, их открывает консорциум. А то, о чём сейчас, — наш операционный год, портфель изменений. Один в другой не переливается.' }) +
        them('', { speech: '«Что вам стоит знать: у нас есть ресурсные ограничения, именно поэтому мы не можем сделать всё. Речь и о деньгах, и о людях. Финансирование сжимается сверху, и я бы не рассчитывал больше чем на 22 миллиарда. С точки зрения людей — перебросить между направлениями в принципе не сложно, свободных рук на год у нас около пятисот, но вот с наймом есть сложности: вакансия закрывается почти полгода, а офферы принимает меньше половины.' }) +
        them('', { speech: '«Если захотите выйти за рамки этих ограничений, у вас должны быть очень веские причины, иначе мы это даже не будем рассматривать. Помогите разобраться: что берём, от чего отказываемся и почему».' }) +
        them('', { speech: '«И не расписывайте каждый отказ — я не аудит заказываю. Поясните те, которые сами по себе решение. По остальным поверю, что там всё очевидно».' }) +
        (isLegacyRun()
          ? '<p class="links-hint">Разбор бэклога появился в разговоре позже — в этом прогоне его не было.</p>'
          : '<div class="bl-sum-host"></div>' +
            '<div class="bl-decided"></div>' +
            '<div class="bl-list"></div>' +
            '<div class="bl-blind"></div>' +
            '<p class="bl-hint" style="display:none;"></p>' +
            (locked ? '' : '<button class="btn btn-primary" id="commitBacklogBtn" style="margin-top:16px;">Зафиксировать разбор →</button>'));

      backlogHost = block;
      if (!isLegacyRun()) renderBacklog();

      if (!locked && !isLegacyRun()) {
        block.querySelector('#commitBacklogBtn').addEventListener('click', function () {
          var t = takenTotals();
          if (t.undecided) {
            window.imp.alert('Агеев просил пройти по всему списку: не решено ещё ' + t.undecided + '. По каждому — берём или не сейчас.');
            return;
          }
          if (!t.taken) {
            window.imp.alert('Ни одно решение не взято — с пустыми руками к правлению не выйти.');
            return;
          }
          if (t.dropped && !t.reasoned) {
            window.imp.alert('Агеев просил пояснить те отказы, которые сами по себе решение. Хотя бы один.');
            return;
          }
          var lock = function () {
            window.imp.confirm(
              'Разбор зафиксируется, и разговор пойдёт дальше — вернуться и пересобрать список будет нельзя.',
              { confirmLabel: 'Зафиксировать', cancelLabel: 'Ещё подумаю' }
            ).then(function (ok) { if (ok) advance('rule'); });
          };
          if (!String(state.blindSpot || '').trim()) {
            window.imp.confirm('Агеев спросил прямо: чего его менеджеры не видят. Промолчать?',
              { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
              .then(function (ok) { if (ok) lock(); });
            return;
          }
          lock();
        });
      }
      return block;
    }

    // ---------- шаг 5: почему эти, правило, триггер пересмотра ----------
    // Последний вопрос Агеева намеренно не называет слов «правило» и «критерий
    // отсечения» — он просит помощи, а не заполнения рубрики.

    function buildRuleBlock() {
      var locked = state.finished;
      var block = document.createElement('div');
      block.className = 's2-block';
      block.innerHTML =
        them('Кирилл Агеев', { act: 'просматривает разбор',
          speech: '«И последнее. Ко мне с новой идеей приходят каждую неделю. Как мне понять, что она попадает в то, что вы сейчас разложили, — не дёргая вас каждый раз?»' }) +
        '<div class="rationale-block">' +
          '<label>Почему выбраны именно эти приоритеты</label>' +
          '<textarea class="s2-rationale" aria-label="Почему выбраны именно эти приоритеты" rows="4" placeholder="ваш ответ"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.rationale) + '</textarea>' +
        '</div>' +
        '<div class="rationale-block">' +
          '<label>Как проверить новую идею на попадание</label>' +
          '<textarea class="s2-rule" aria-label="Как проверить новую идею на попадание в приоритеты" rows="3" placeholder="ваш ответ"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.rejectionRule) + '</textarea>' +
        '</div>' +
        them('', { act: 'уже стоя', speech: '«И обратное. Что должно случиться, чтобы вы сами пришли ко мне и сказали: пора пересматривать?»' }) +
        '<textarea class="s2-proactive" aria-label="При каких условиях этот выбор устареет" rows="3" placeholder="ваш ответ"' + (locked ? ' disabled' : '') + '>' + escapeHtml(state.proactiveText) + '</textarea>' +
        (locked ? '' : '<button class="btn btn-primary" id="finishBtn" style="margin-top:14px;">Завершить встречу →</button>');

      if (!locked) {
        block.querySelector('.s2-rationale').addEventListener('input', function (e) {
          state.rationale = e.target.value; saveState();
        });
        block.querySelector('.s2-rule').addEventListener('input', function (e) {
          state.rejectionRule = e.target.value; saveState();
        });
        block.querySelector('.s2-proactive').addEventListener('input', function (e) {
          state.proactiveText = e.target.value; saveState();
        });
        block.querySelector('#finishBtn').addEventListener('click', finishStation);
      }
      return block;
    }

    // ---------- рендер разговора ----------

    function render() {
      backlogHost = null;
      body.innerHTML = '';
      var upTo = state.finished ? STEPS.length - 1 : stepIndex(state.step);
      if (upTo >= 0) body.appendChild(buildOwnMoveBlock());
      if (upTo >= 1) body.appendChild(buildStanceBlock());
      if (upTo >= 2) body.appendChild(buildStressBlock());
      if (upTo >= 3) body.appendChild(buildBacklogBlock());
      if (upTo >= 4) body.appendChild(buildRuleBlock());
      // неразрывные пробелы после предлогов — уже по вставленной разметке
      if (window.imp && window.imp.typoDom) window.imp.typoDom(body);
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
      render();
      // Финиш-оверлей ждёт подтверждения записи: при сбое сети участник иначе
      // ушёл бы дальше уверенным, что ответ сохранён. Не дождались — оверлей
      // покажем (локально всё сохранено), но статус скажет «не сохранено»,
      // а api.js повторит отправку сам.
      syncStateToBackend().then(showFinishOverlay, showFinishOverlay);
    }

    render();

    if (state.finished) showFinishOverlay();
  }
})();

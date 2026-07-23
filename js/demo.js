// i(m)perfect — режим «Экскурсия» (demo/tour).
//
// Что это. Служебный проходной режим для команды: пройти ВСЕ экраны раунда 1
// с примерами заполнения, без стопов и без создания реальных строк на бэкенде,
// с короткими пояснениями «что здесь меряется и как зашита механика».
// Запускается из витрины (vitrina.html) с выбором профиля ответов.
//
// Как устроено (важно для будущего меня):
//  1. Экраны участника — отдельные страницы, каждая гейтится на .finished
//     ПРЕДЫДУЩЕГО этапа в localStorage (станция 2 ← станция 1; комнаты/холл ←
//     станция 2). demo.js подключён РАНЬШЕ скрипта страницы, поэтому успевает
//     переключить нужные два флага .finished ПОД конкретную страницу — так все
//     гейты проходят, но текущий экран остаётся играбельным (не заперт).
//  2. Бэкенд глушим (isApiConfigured → false, callApi → null, hydrateOnce → no-op),
//     чтобы ни один экскурсионный прогон не попал в живые Sheets и не ждал сети.
//  3. Профиль ответов раскладывается в те же самые ключи localStorage
//     (imp_station1_<bib> и т.д.), что пишет настоящий участник, — экраны не
//     знают, что это демо, и рендерят реальный UI.
//  4. Поверх — тонкая панель пояснений (что меряется) + нижняя навигация по
//     экскурсии (пред./след. экран, смена профиля, выход).
//
// В продакшене demo.js ничего не делает, пока в localStorage нет флага imp_demo.

(function () {
  var DEMO_KEY = 'imp_demo';
  var DEMO_BIB = 900; // локальный, на бэкенд не уходит

  // читаем флаг демо СРАЗУ — если его нет, выходим и ни на что не влияем.
  // Флаг живёт в sessionStorage (изолирован по ВКЛАДКЕ): экскурсия, запущенная в
  // одной вкладке, не может активироваться в другой (там своя sessionStorage).
  // Читаем ТОЛЬКО sessionStorage — иначе утёкший localStorage-флаг снова протёк бы
  // между вкладками, ровно тот баг, который чиним.
  var demo = null;
  try { demo = JSON.parse(sessionStorage.getItem(DEMO_KEY) || 'null'); } catch (e) {}
  if (!demo || !demo.active) return;

  // Защита от протечки демо в реальную сессию. Экскурсия всегда работает под
  // DEMO_BIB (900). Если флаг демо уже засеян, но текущая сессия — не демо-биб,
  // значит реальный участник перекрыл демо (напр. «быстрый тест» зарегистрировал
  // свой bib, а флаг imp_demo завис из-за bfcache/кэша). В этом случае выходим из
  // демо и снимаем флаг, чтобы не подменять реальный прогон экскурсией.
  // Свежий запуск экскурсии (seededFor ещё null) сюда не попадает — он и должен
  // перекрыть любую прошлую сессию своим демо-сеансом.
  if (demo.seededFor) {
    var curSess = null;
    try { curSess = JSON.parse(sessionStorage.getItem('imp_current_session') || 'null'); } catch (e) {}
    if (curSess && curSess.bib && curSess.bib !== DEMO_BIB) {
      sessionStorage.removeItem(DEMO_KEY);
      return;
    }
  }

  window.imp = window.imp || {};

  // ---------- профили ответов ----------
  // Каждый профиль — «человеческий» набор ответов (как в headless-харнессе).
  // Позиции по развилке РАЗНЫЕ, чтобы было видно ветвление: сильный → «Вторая
  // кривая», средний → «Крепость», слабый → своя. expected — иллюстративные
  // ожидаемые уровни (живого судьи в демо нет), чтобы связать «ответ → уровень».

  var PROFILES = {
    strong: {
      id: 'strong', label: 'Сильный прогон', stanceLabel: '«Вторая кривая»',
      note: 'Развёрнутые ответы, широкий контекст, петли, дальний горизонт.',
      station1: {
        rationale: 'Сгруппировал по тому, что бьёт по самой бизнес-модели, а не по метрике.',
        cards: [
          { text: 'Юнит-экономика «Миры+» отрицательная пятый год подряд — направление жжёт кэш рекламного ядра.', tag: 'threat', influence: 'Ядро дотирует убыток, вместо того чтобы финансировать будущее.', snippet: 'Пятый год финансируем направление из рекламы' },
          { text: 'Loop и переход к безэкранным интерфейсам к 2027 обесценивает саму модель «реклама на экране».', tag: 'threat', influence: 'Под угрозой не метрика, а фундамент выручки.', snippet: 'готовит Loop One' },
          { text: 'Отток ключевых инженеров и рост текучки — теряем носителей экспертизы.', tag: 'threat', influence: 'Некому будет вытаскивать «Миру».', snippet: 'Добровольная текучка ключевых грейдов достигла 27%' },
          { text: 'Меридиан рассматривает «Искру» как национальный актив с обязательствами вне выручки.', tag: 'opportunity', influence: 'Одновременно рычаг и ограничение.', snippet: 'национальный актив' },
          { text: '«Искра» теряет позиции в открытом модельном индексе — конкуренты обгоняют технологически.', tag: 'threat', influence: '', snippet: 'В Открытом модельном индексе' },
          { text: '«Мира» растёт в проактивного ассистента — платформенный потенциал за пределами рекламы.', tag: 'opportunity', influence: 'Актив, который не виден в текущей P&L.', snippet: 'нового поколения ассистента с проактивными сценариями' }
        ],
        connections: [
          { cards: [2, 1], mechanism: 'Безэкранный сдвиг убивает рекламный экран → ядро, которым дотируем «Миру», само тает.', conclusion: 'Нельзя чинить «Миру» деньгами ядра, которое под угрозой.', loop: false },
          { cards: [3, 1], mechanism: 'Заморозка опционов ради экономии → уходят те, кто мог бы вытащить железо → «Мира» дешевеет → снова режем.', conclusion: 'Экономия на людях запускает самоусиливающуюся спираль обесценивания.', loop: true }
        ],
        notes: [
          { snippet: 'юнит-экономика «Миры+» остаётся отрицательной пятый год подряд', comment: 'ядро дотирует убыток вместо будущего' },
          { snippet: 'Loop готовит безэкранное носимое устройство Loop One (выход 2027)', comment: 'бьёт по самой модели «реклама на экране», а не по метрике' },
          { snippet: 'добровольная текучка ключевых грейдов — 27% (было 14%)', comment: 'уходят те, кто мог бы вытащить железо' }
        ]
      },
      station2: {
        priorities: [
          { card: 2, target: 'к Q3 2026 — решение по платформенному пивоту' },
          { card: 1, target: 'снять дотацию ядра с «Миры» за 18 мес' },
          { card: 3, target: '' }
        ],
        rejected: [{ card: 5, freed: 'юристы разгрузятся' }],
        rejectionRule: 'Всё, что не двигает ответ на безэкранный сдвиг в ближайший год, — не первым.',
        rationale: 'Loop-сдвиг — единственная угроза, которая обнуляет саму модель, а не метрику; остальное — следствия.',
        firstAction: 'За Q1 вынести на комитет решение по юр.выделению железа в отдельный контур — пока это не сделал за нас рынок.',
        stressChoice: 'hold',
        stressComment: 'Данные не появятся — сдвиг уже идёт; ждать полгода = отдать окно.',
        stance: 'secondCurve', stanceOther: '',
        stanceCriteria: '1) где через 3 года маржа группы; 2) что теряем безвозвратно, если не выносим железо сейчас — команду и окно рынка.',
        proactiveText: 'Пересматриваю, если адаптация рынка к Loop замедлится на 18+ мес или Меридиан свяжет железо мандатом.'
      },
      roomFuture: {
        answer1: 'Через 3–5 лет «Искра» — две сущности: зрелое рекламное ядро как кэш-машина и отдельная железная компания, к 2030 живущая на своей выручке. А дальше, за горизонтом сделки, вопрос уже не про рекламу — останется ли у страны собственный интерфейсный стек, когда экран уйдёт совсем.',
        answer2: 'Если рынок не подыграет — железо не сжигаем внутри, а переводим в лицензирование патентов. Сигнал сменить курс: за 2 года runway отдельной компании не выходит на 40% внешней выручки.'
      },
      roomAlternatives: {
        answer1: 'Сработает — но именно потому, что я не пришёл к ней сразу. Крутил ещё три: продать «Миру» стратегу (отверг — теряем интерфейсный рычаг навсегда), чистую «Крепость» (отверг — лечит симптом, ядро само тает под Loop), СП с Меридианом по железу (держу запасным). Выбранный путь выигрывает, потому что сохраняет и кэш, и опцион на железо.',
        source: 'pattern',
        sourceElaboration: 'Паттерн «второй кривой» Хэнди + как Fujifilm пережил смерть плёнки, уйдя в смежный стек, а Kodak — нет.'
      },
      roomPath: {
        currentState: 'Рекламное ядро дотирует убыточную «Миру», единая P&L.',
        targetState: 'Две компании: ядро-кэш и железо на своей выручке к 2030.',
        stages: [
          { description: 'Q1–Q2: юридически выделить железо в отдельное юрлицо, сохранить IP.', rationale: 'Раньше нельзя — сначала нужен чистый контур.' },
          { description: '2026–2027: внешний раунд/партнёр под железо, снять дотацию с ядра.', rationale: '' },
          { description: '2028–2030: железо на 40%+ внешней выручки, ядро под безэкранный таргетинг.', rationale: '' }
        ],
        barriers: ['Меридиан может связать железо мандатом «национального актива».', 'Senior-инженеры уходят — некому строить.'],
        enablers: ['Бренд «Миры» у Z.', 'Кэш ядра на переходный период.', 'Интерес Меридиана к суверенному стеку.']
      },
      station3: { finalDefense: 'Ставлю на «Вторую кривую»: единственная реальная угроза — обесценивание экрана Loop\'ом — бьёт по модели, а не по метрике; «Крепость» лечит симптом. Критерии: маржа группы через 3 года и безвозвратная потеря окна/команды. Первый ход — юр.выделение железа при живом кэше ядра. Риск — мандат Меридиана; хедж — лицензирование IP.' },
      expected: { ak1: 5, ak2: 5, pr1: 4, pr2: 5, mk1: 4, mk2: 4, ga1: 4, ga2: 5, pp1: 4, pp2: 4 }
    },

    mid: {
      id: 'mid', label: 'Средний прогон', stanceLabel: '«Крепость»',
      note: 'Верные, но более поверхностные ответы; горизонт ближе, связей меньше.',
      station1: {
        rationale: 'Выписал главные проблемы, которые вижу.',
        cards: [
          { text: '«Мира+» убыточна и тянет деньги.', tag: 'threat', influence: 'Теряем прибыль.', snippet: 'Пятый год финансируем направление из рекламы' },
          { text: 'Инженеры увольняются, растёт текучка.', tag: 'threat', influence: '', snippet: 'Добровольная текучка ключевых грейдов достигла 27%' },
          { text: 'Конкуренты по технологиям усиливаются.', tag: 'threat', influence: '', snippet: 'Nord Labs' },
          { text: 'У «Миры» хороший потенциал как продукта.', tag: 'opportunity', influence: '', snippet: 'нового поколения ассистента с проактивными сценариями' }
        ],
        connections: [
          { cards: [1, 2], mechanism: 'Убытки «Миры» → режем расходы → уходят инженеры.', conclusion: 'Экономия бьёт по команде.', loop: false }
        ],
        notes: [
          { snippet: 'юнит-экономика «Миры+» остаётся отрицательной', comment: 'самая большая дыра' }
        ]
      },
      station2: {
        priorities: [
          { card: 1, target: 'вывести «Миру» в ноль за год' },
          { card: 2, target: '' }
        ],
        rejected: [{ card: 3, freed: '' }],
        rejectionRule: '',
        rationale: 'Убыточная «Мира» — самая большая дыра, с неё и начинаем.',
        firstAction: 'Собрать план сокращения расходов на «Миру» и начать искать партнёра под неё.',
        stressChoice: 'calibrate',
        stressComment: 'Сроки по остальному сдвину под данные Штерна, но приоритет №1 — дыру в ядре — удерживаю, её откладывать нельзя.',
        stance: 'fortress', stanceOther: '',
        stanceCriteria: '1) прибыльность ядра; 2) чтобы не потерять рекламный рынок.',
        proactiveText: 'Пересмотрю, если реклама начнёт падать.'
      },
      roomFuture: {
        answer1: 'Если защитим рекламное ядро, через пару лет компания снова прибыльна и стабильна, «Миру» переводим на партнёров.',
        answer2: 'Если не выйдет — придётся закрывать «Миру» и сокращаться.'
      },
      roomAlternatives: {
        answer1: 'Думаю, сработает: защита ядра возвращает прибыль. Вынести «Миру» отдельно я рассматривал, но это рискованно — поэтому остановился на защите.',
        source: 'practice',
        sourceElaboration: 'Обычно в таких случаях сначала стабилизируют основной бизнес.'
      },
      roomPath: {
        currentState: 'Реклама прибыльна, «Мира» в убытке.',
        targetState: 'Реклама защищена, «Мира» на партнёрской модели.',
        stages: [
          { description: 'Сократить расходы на «Миру».', rationale: '' },
          { description: 'Перевести «Миру» на партнёров.', rationale: '' }
        ],
        barriers: ['Партнёров может не найтись.'],
        enablers: ['Прибыль рекламного ядра.']
      },
      station3: { finalDefense: 'Защищаем рекламное ядро — это то, что приносит деньги. «Миру» переводим на партнёрскую модель, чтобы не тянула убыток. Так сохраняем прибыльность.' },
      expected: { ak1: 3, ak2: 3, pr1: 3, pr2: 3, mk1: 3, mk2: 2, ga1: 3, ga2: 3, pp1: 3, pp2: 2 }
    },

    weak: {
      id: 'weak', label: 'Слабый прогон', stanceLabel: 'своя позиция',
      note: 'Общие слова без опоры на кейс — видно, как срабатывают «полы» (L1).',
      station1: {
        rationale: 'Просто выписал проблемы, которые заметил.',
        cards: [
          { text: 'У компании проблемы с деньгами.', tag: '', influence: '', snippet: 'Пятый год финансируем направление из рекламы' },
          { text: 'Люди увольняются.', tag: '', influence: '', snippet: 'Добровольная текучка ключевых грейдов достигла 27%' },
          { text: 'Технологии немного отстают.', tag: '', influence: '', snippet: 'В Открытом модельном индексе' }
        ],
        connections: []
      },
      station2: {
        priorities: [{ card: 1, target: '' }],
        rejected: [], rejectionRule: '',
        rationale: 'Деньги — это важно.',
        stressChoice: 'hold', stressComment: '',
        stance: 'other', stanceOther: 'Просто продавать рекламу и не лезть в железо',
        stanceCriteria: '',
        proactiveText: ''
      },
      roomFuture: { answer1: 'Думаю, дальше всё будет лучше, если решить проблемы.', answer2: 'Ну, если не получится, будет хуже.' },
      roomAlternatives: { answer1: 'Думаю, сработает, это нормальный вариант.', source: 'own', sourceElaboration: '' },
      roomPath: { currentState: 'Сейчас у компании всё не очень хорошо.', targetState: 'Надо, чтобы стало хорошо.', stages: [], barriers: [], enablers: [] },
      station3: { finalDefense: 'Нужно решать проблемы компании, чтобы всё стало лучше.' },
      expected: { ak1: 1, ak2: 1, pr1: 2, pr2: 1, mk1: 1, mk2: 1, ga1: 1, ga2: 1, pp1: 1, pp2: 1 }
    }
  };

  var profileId = demo.profile && PROFILES[demo.profile] ? demo.profile : 'strong';
  var profile = PROFILES[profileId];

  // ---------- глушим бэкенд ----------
  window.imp.isApiConfigured = function () { return false; };
  window.imp.callApi = function () { return Promise.resolve(null); };
  window.imp.hydrateOnce = function () {};
  // флаг для экранов участника: показать механику в неактивном (демонстрационном)
  // виде даже там, где у реального участника шаг уже залочен (напр. разбор карточек
  // на станции 2) — чтобы в экскурсии было видно, как это работает.
  window.imp.isDemo = function () { return true; };

  // ---------- раскладка профиля в localStorage ----------

  function uid() { return 'demo_' + Math.random().toString(36).slice(2, 9); }
  function put(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }
  function nowISO() { return new Date().toISOString(); }

  function seed(profile) {
    var bib = DEMO_BIB;

    // размеченный HTML кейса пере-создаётся под новый профиль (см. injectDemoMarks)
    localStorage.removeItem('imp_station1_html_' + bib);

    // сессия демо — в sessionStorage (per-tab), чтобы не перезаписать общую
    // реальную сессию в других вкладках. Читатели берут её через window.imp.loadSession.
    sessionStorage.setItem('imp_current_session', JSON.stringify({
      id: 'demo_session', bib: bib, case: 'iskra',
      firstName: 'Экскурсия', lastName: '(' + profile.label + ')',
      wave: 'demo', registeredAt: nowISO()
    }));

    // станция 1 — проблемы рождаются из отметок: цитата (snippet) + описание (problem).
    var s1 = profile.station1;
    var highlights = s1.cards.map(function (c, i) {
      return {
        id: 'c' + (i + 1), sectionId: '', domains: [],
        snippet: c.snippet || (c.text || '').slice(0, 60),
        problem: c.text || '', tag: c.tag || '', influence: c.influence || ''
      };
    });
    // снимок для станции 2 — её приоритеты ссылаются на те же id
    var cards = highlights.map(function (h) { return { id: h.id, text: h.problem }; });
    var connections = (s1.connections || []).map(function (cn) {
      return { id: uid(), cardIds: cn.cards.map(function (n) { return 'c' + n; }),
               mechanism: cn.mechanism || '', conclusion: cn.conclusion || '', isLoop: !!cn.loop };
    });
    put('imp_station1_' + bib, {
      // как это делает station1.js deriveCards — чтобы дальше (доссье/связки/кабинет)
      // проблемы были видны, даже если экскурсия прыгнула на станцию 2 мимо станции 1
      cards: highlights.map(function (h) { return { id: h.id, text: h.problem, anchor: h.snippet, tag: h.tag || '', influence: h.influence || '' }; }),
      highlights: highlights, connections: connections,
      mainProblemId: (profile.id === 'weak' ? '' : 'c1'),
      mainProblemWhy: (profile.id === 'strong' ? 'она обнуляет саму бизнес-модель, остальное — следствия' : ''),
      appxOpened: {}, appxReviewed: {},
      phase: 'map', finished: true, startedAt: nowISO(), finishedAt: nowISO()
    });

    // станция 2 — приоритизация + развилка
    var s2 = profile.station2;
    put('imp_station2_' + bib, {
      cardsSnapshot: cards.map(function (c) { return { id: c.id, text: c.text }; }),
      priorities: (s2.priorities || []).map(function (p) { return { cardId: 'c' + p.card, target: p.target || '' }; }),
      rejected: (s2.rejected || []).map(function (r) { return { cardId: 'c' + r.card, freed: r.freed || '' }; }),
      rejectionRule: s2.rejectionRule || '', rationale: s2.rationale || '', firstAction: s2.firstAction || '',
      stressChoice: s2.stressChoice || '', stressComment: s2.stressComment || '',
      stance: s2.stance || '', stanceOther: s2.stanceOther || '', stanceCriteria: s2.stanceCriteria || '',
      proactiveText: s2.proactiveText || '',
      step: 'proactive', finished: true, startedAt: nowISO(), finishedAt: nowISO()
    });

    var rf = profile.roomFuture;
    put('imp_room_future_' + bib, {
      answer1: rf.answer1 || '', answer2: rf.answer2 || '',
      step: 'q2', finished: false, startedAt: nowISO()
    });

    var ra = profile.roomAlternatives;
    put('imp_room_alternatives_' + bib, {
      answer1: ra.answer1 || '', source: ra.source || '', sourceElaboration: ra.sourceElaboration || '',
      step: 'q2', finished: false, startedAt: nowISO()
    });

    var rp = profile.roomPath;
    put('imp_room_path_' + bib, {
      currentState: rp.currentState || '', targetState: rp.targetState || '',
      stages: (rp.stages || []).map(function (s) { return { id: uid(), description: s.description || '', rationale: s.rationale || '' }; }),
      barriers: (rp.barriers || []).map(function (t) { return { id: uid(), text: t }; }),
      enablers: (rp.enablers || []).map(function (t) { return { id: uid(), text: t }; }),
      step: 'q2', finished: false, startedAt: nowISO()
    });

    put('imp_station3_' + bib, {
      finalDefense: (profile.station3 && profile.station3.finalDefense) || '',
      finished: false, startedAt: nowISO()
    });

    // «Постановки» НЕ помечаем просмотренными: экскурсия должна показывать их как
    // участнику (по разу на экран) — там живёт легенда персонажей (напр. заход
    // «Лемех мыслит вдолгую», важный для дальнего горизонта МК). Флаги, которые
    // проставятся при закрытии интро в туре, чистит exitDemo при выходе.
  }

  // сеем при первом заходе или после смены профиля
  if (!demo.seededFor || demo.seededFor !== profileId) {
    seed(profile);
    demo.seededFor = profileId;
    sessionStorage.setItem(DEMO_KEY, JSON.stringify(demo));
  }

  // ---------- переключение флагов .finished под текущую страницу ----------
  // Каждый экран должен быть играбельным (свой .finished = false), но гейт
  // требует .finished ПРЕДЫДУЩЕГО этапа = true. Выставляем оба под страницу.

  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  function setFinished(key, val) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return;
      var o = JSON.parse(raw);
      o.finished = val;
      localStorage.setItem(key, JSON.stringify(o));
    } catch (e) {}
  }

  var bib = DEMO_BIB;

  // собственный ключ .finished для каждого экрана
  var OWN_KEY = {
    'station1.html': 'imp_station1_' + bib,
    'station2.html': 'imp_station2_' + bib,
    'station3.html': 'imp_station3_' + bib,
    'room-future.html': 'imp_room_future_' + bib,
    'room-alternatives.html': 'imp_room_alternatives_' + bib,
    'room-path.html': 'imp_room_path_' + bib
  };

  // 1) гейты предыдущих этапов должны быть пройдены
  if (page === 'station2.html') setFinished('imp_station1_' + bib, true);
  if (page === 'station3.html' || page.indexOf('room-') === 0) setFinished('imp_station2_' + bib, true);

  // 2) ТЕКУЩИЙ экран экскурсии всегда играбелен/просматриваем: даже если на нём
  // нажали «Завершить» и ушли дальше, при возврате он не должен быть заперт
  // (иначе комнаты/холл после финиша показывали бы только оверлей и лок).
  if (OWN_KEY[page]) setFinished(OWN_KEY[page], false);

  // ---------- тур: порядок экранов + пояснения механики ----------

  var TOUR = [
    { file: 'station1.html', label: '1 · Карта проблем', tag: 'Навык АК',
      abilities: ['ak1', 'ak2'],
      how: 'Навык «Анализ контекста». <b>АК-1</b> — широта: сколько из 5 доменов среды затронуто (конкуренты, тех-сдвиг, структура рынка, смена собственника, рынок труда). <b>АК-2</b> — глубина: связи между факторами и петли обратной связи (вторая фаза, «К связкам →»). Оба судит ИИ по <b>тексту</b> карточек и связок. Единственный жёсткий пол: нет карточек → L1.',
      tip: 'Группы и якоря на балл <b>не влияют</b>. Якорь — доказательство опоры на текст (его видит фасилитатор), группировка — необязательный органайзер. Раньше домен засчитывался только за перетащенную отметку — от этого отказались, т.к. сильная карта без перетаскивания падала в L1.' },
    { file: 'station2.html', label: '2 · Встреча с Агеевым', tag: 'Навык ПР + развилка',
      abilities: ['pr1', 'pr2'],
      how: 'Навык «Приоритизация». <b>ПР-1</b> — что выбрано: ранжирование своих же карточек + явные отказы. <b>ПР-2</b> — почему и держится ли под давлением (стресс-тест Агеева). <b>Развилка</b> («Крепость»/«Вторая кривая»/своя) — это <b>не отдельный балл</b>, а ось всего финала: на неё ссылается холл и три разговора, из неё собирается документ стратегии.',
      tip: 'Разговор идёт только вперёд — зафиксированные шаги залочены. Это by design, а не баг.' },
    { file: 'station3.html', label: '3 · Холл трёх разговоров', tag: 'Фиксированный порядок',
      abilities: [],
      how: 'Хаб: три разговора в <b>фиксированном</b> порядке (Будущее → Путь → Альтернативы) — следующий открывается только после завершения предыдущего, чтобы не рвать ход мысли. Все три обязательны (п.10): финализировать стратегию можно только пройдя каждый. Плашка вверху ссылается на выбранную позицию — «слух разошёлся по этажам».',
      tip: 'Названия комнат — про сюжет, не про способность: чтобы не подсказывать, что здесь меряется. «Путь» не последним — чтобы не попадал в хвост усталости.' },
    { file: 'room-future.html', label: 'Коридор Лемеха', tag: 'Навык МК',
      abilities: ['mk1', 'mk2'],
      how: 'Навык «Моделирование будущего». <b>МК-1</b> — горизонт рассуждения + <b>амбициозность</b> цели (на какой результат готов работать, даже если застанет его не он, и обоснование направления). <b>МК-2</b> — тип мышления о будущем (экстраполяция / образ / 2–3 разных сценария). Реплика Лемеха подставляет <b>вашу</b> позицию с развилки. Горизонт и амбиция не подсказываются — участник сам задаёт планку.',
      tip: 'Обратите внимание: текст реплики меняется в зависимости от позиции — переключите профиль и сравните.' },
    { file: 'room-alternatives.html', label: 'Очередь в «Прожектор»', tag: 'Навык ГА',
      abilities: ['ga1', 'ga2'],
      how: 'Навык «Генерация альтернатив». <b>ГА-1</b> — сам ли участник сгенерировал альтернативы (а не потому, что попросили). <b>ГА-2</b> — широта источников идей (свой опыт / практика / пример / общий паттерн). Первый вопрос намеренно без структуры — иначе сигнал ГА-1 испортится. Второй — самотег источника + необязательная элаборация.',
      tip: 'Тег источника не решает уровень сам — ИИ всё равно читает содержание элаборации на L3+.' },
    { file: 'room-path.html', label: 'Черновик к комитету', tag: 'Навык ПП',
      abilities: ['pp1', 'pp2'],
      how: 'Навык «Путь к цели». <b>ПП-1</b> — декомпозиция: текущее → целевое состояние + этапы. <b>ПП-2</b> — барьеры и ресурсы, связка «барьер → чем перекрыть». Здесь есть реальный структурный каркас (в отличие от МК/ГА), потому что граничные тесты ПП — про структуру и содержание, а не про спонтанность.',
      tip: 'Каркас организует текст участника, но связность этапов и качество барьер→ресурс по-прежнему решает ИИ.' },
    { file: 'station3.html#finalize', label: 'Финал · StratOS-документ', tag: 'Сборка + контроль',
      abilities: [],
      how: 'Финал — <b>редактируемый StratOS-документ</b> (fp ▸ stratos): ответы всего раунда автоматически собираются в артефакты StratOS (горизонт, БАЦ, декомпозиция по ССП, текущее состояние, фокус через отказ, ценностное предложение, проекты, риски), участник может свести нестыковки и отредактировать прямо здесь. Поле «защиты» — <b>контрольный вопрос</b> (§7–8): пере-оценивает ПР-2/МК-2/ГА-1 на глубине; при расхождении ≥2 включается арбитр-ИИ.',
      tip: 'Оценка целостности правки и PDF-выгрузка — отдельный трек (пока не считается). Отсылка к продукту StratOS.' }
  ];

  var ABILITY_NAMES = {
    ak1: 'АК-1 широта', ak2: 'АК-2 глубина', pr1: 'ПР-1 выбор', pr2: 'ПР-2 обоснование',
    mk1: 'МК-1 горизонт', mk2: 'МК-2 развилки', ga1: 'ГА-1 генерация', ga2: 'ГА-2 источники',
    pp1: 'ПП-1 декомпозиция', pp2: 'ПП-2 барьеры-ресурсы'
  };

  function currentTourIndex() {
    var hash = location.hash || '';
    // финал = station3.html#finalize; холл = station3.html без хэша
    for (var i = 0; i < TOUR.length; i++) {
      var t = TOUR[i];
      var tf = t.file.split('#')[0];
      var th = t.file.indexOf('#') !== -1 ? '#' + t.file.split('#')[1] : '';
      if (tf === page && (th ? hash === th : true) && (th || !hash || page !== 'station3.html' || i === 2)) {
        if (page === 'station3.html') {
          // различаем холл (без #finalize) и финал (#finalize)
          if (hash === '#finalize' && th === '#finalize') return i;
          if (hash !== '#finalize' && th !== '#finalize') return i;
          continue;
        }
        return i;
      }
    }
    // грубый фолбэк по файлу
    for (var j = 0; j < TOUR.length; j++) if (TOUR[j].file.split('#')[0] === page) return j;
    return -1;
  }

  // ---------- стили экскурсионного UI (инжектим, styles.css не трогаем) ----------

  var css = '' +
    '.demo-bar{position:fixed;left:0;right:0;bottom:0;z-index:99998;background:#181818;color:#fff;' +
      'display:flex;align-items:center;flex-wrap:wrap;gap:10px 12px;padding:10px 16px;font-family:"Inter Tight",system-ui,sans-serif;' +
      'font-size:13px;box-shadow:0 -1px 0 rgba(0,0,0,.25);max-height:40vh;overflow:auto;}' +
    '.demo-bar b{color:#89bbf1;}' +
    '.demo-bar .demo-spacer{flex:1;}' +
    '.demo-bar button,.demo-bar select{font:inherit;border-radius:4px;border:1px solid #3a3f4b;' +
      'background:#242832;color:#fff;padding:7px 12px;cursor:pointer;}' +
    '.demo-bar button:hover{background:#2e333f;}' +
    '.demo-bar button:disabled{opacity:.4;cursor:default;}' +
    '.demo-bar .demo-primary{background:#89bbf1;color:#181818;border-color:#89bbf1;font-weight:700;}' +
    '.demo-bar .demo-exit{border-color:#6b3a3a;color:#ffb4b4;}' +
    '.demo-bar select{max-width:190px;}' +
    '.demo-badge{position:fixed;top:0;left:0;right:0;z-index:99997;background:#89bbf1;color:#181818;' +
      'text-align:center;font:700 12px "Inter Tight",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:4px;}' +
    '.demo-note{position:fixed;right:16px;bottom:64px;z-index:99998;width:340px;max-width:calc(100vw - 32px);' +
      'background:#fff;color:#181818;border:1px solid #e7e7e7;border-radius:4px;box-shadow:0 6px 20px rgba(0,0,0,.12);' +
      'font-family:"Inter Tight",system-ui,sans-serif;overflow:hidden;}' +
    '.demo-note-head{display:flex;align-items:center;justify-content:space-between;gap:8px;' +
      'padding:11px 14px;background:#181818;color:#fff;cursor:pointer;}' +
    '.demo-note-head .demo-note-tag{font:700 11px "Inter Tight",system-ui;letter-spacing:.06em;text-transform:uppercase;color:#89bbf1;flex:1;min-width:0;}' +
    '.demo-note-head .demo-note-toggle{font-size:15px;opacity:.7;}' +
    '.demo-note-body{padding:13px 15px;font-size:13.5px;line-height:1.55;max-height:52vh;overflow:auto;}' +
    '.demo-note-body h5{margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#9a9da2;}' +
    '.demo-note-how{margin:0 0 12px;}' +
    '.demo-note-tip{margin:0 0 12px;padding:9px 11px;background:#eaf3fb;border-radius:4px;font-size:12.5px;color:#6b6e73;}' +
    '.demo-levels{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}' +
    '.demo-levels span{font-size:11.5px;background:#f5f5f6;border-radius:4px;padding:3px 7px;}' +
    '.demo-levels span b{color:#181818;}' +
    '.demo-note.collapsed .demo-note-body{display:none;}' +
    'body{padding-bottom:56px!important;}';

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);

  // ---------- построение UI после загрузки страницы ----------

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  function go(tourItem) {
    location.href = tourItem.file;
  }

  function setProfile(id) {
    demo.profile = id;
    demo.seededFor = null; // заставит пере-сеять на следующей загрузке
    sessionStorage.setItem(DEMO_KEY, JSON.stringify(demo));
    // остаёмся на том же экране, но с новым профилем
    location.reload();
  }

  function exitDemo() {
    var bib = DEMO_BIB;
    // сессия и флаг демо — в sessionStorage (per-tab)
    ['imp_current_session', DEMO_KEY].forEach(function (k) { sessionStorage.removeItem(k); });
    // засеянные данные экскурсии и служебные флаги — в localStorage (+ DEMO_KEY на случай legacy)
    ['imp_current_session', DEMO_KEY, 'imp_demo_note_collapsed',
     'imp_station1_' + bib, 'imp_station1_html_' + bib, 'imp_station2_' + bib,
     'imp_station3_' + bib, 'imp_room_future_' + bib, 'imp_room_alternatives_' + bib,
     'imp_room_path_' + bib].forEach(function (k) { localStorage.removeItem(k); });
    ['station1', 'station2', 'station3', 'room_future', 'room_alternatives', 'room_path'].forEach(function (k) {
      localStorage.removeItem('imp_' + k + '_intro_seen_' + bib);
    });
    location.href = 'vitrina.html';
  }

  function buildUI() {
    var idx = currentTourIndex();
    var item = idx >= 0 ? TOUR[idx] : null;

    // верхняя плашка
    var badge = document.createElement('div');
    badge.className = 'demo-badge';
    badge.textContent = 'РЕЖИМ ЭКСКУРСИИ · ' + profile.label + ' · позиция ' + profile.stanceLabel + ' · данные не сохраняются';
    document.body.appendChild(badge);

    // панель пояснений
    if (item) {
      var note = document.createElement('div');
      note.className = 'demo-note';
      var levelsHtml = '';
      if (item.abilities && item.abilities.length) {
        levelsHtml = '<h5>Ожидаемо для этого профиля (иллюстративно)</h5><div class="demo-levels">' +
          item.abilities.map(function (a) {
            return '<span>' + esc(ABILITY_NAMES[a] || a) + ': <b>L' + (profile.expected[a] || '?') + '</b></span>';
          }).join('') + '</div>';
      }
      note.innerHTML =
        '<div class="demo-note-head"><span class="demo-note-tag">' + esc(item.tag) + '</span>' +
          '<span class="demo-note-toggle">▾ что здесь меряется</span></div>' +
        '<div class="demo-note-body">' +
          '<p class="demo-note-how">' + item.how + '</p>' +
          (item.tip ? '<p class="demo-note-tip">💡 ' + item.tip + '</p>' : '') +
          levelsHtml +
        '</div>';
      document.body.appendChild(note);
      // состояние «свёрнуто» помним между экранами — свернул один раз, и панель
      // больше не перекрывает рабочую область на следующих экранах
      function applyCollapsed(collapsed) {
        note.classList.toggle('collapsed', collapsed);
        note.querySelector('.demo-note-toggle').textContent =
          collapsed ? '▸ что здесь меряется' : '▾ что здесь меряется';
      }
      applyCollapsed(localStorage.getItem('imp_demo_note_collapsed') === '1');
      note.querySelector('.demo-note-head').addEventListener('click', function () {
        var next = !note.classList.contains('collapsed');
        applyCollapsed(next);
        localStorage.setItem('imp_demo_note_collapsed', next ? '1' : '0');
      });
    }

    // нижняя навигация
    var bar = document.createElement('div');
    bar.className = 'demo-bar';
    var pos = idx >= 0 ? (idx + 1) + '/' + TOUR.length : '—';
    var options = TOUR.map(function (t, i) {
      return '<option value="' + i + '"' + (i === idx ? ' selected' : '') + '>' + esc((i + 1) + '. ' + t.label) + '</option>';
    }).join('');
    var profOptions = Object.keys(PROFILES).map(function (p) {
      return '<option value="' + p + '"' + (p === profileId ? ' selected' : '') + '>' + esc(PROFILES[p].label) + '</option>';
    }).join('');
    bar.innerHTML =
      '<b>Экскурсия ' + pos + '</b>' +
      '<button class="demo-prev"' + (idx <= 0 ? ' disabled' : '') + '>← назад</button>' +
      '<select class="demo-jump">' + options + '</select>' +
      '<button class="demo-next demo-primary"' + (idx >= TOUR.length - 1 ? ' disabled' : '') + '>след. экран →</button>' +
      '<span class="demo-spacer"></span>' +
      '<span>Профиль:</span><select class="demo-profile">' + profOptions + '</select>' +
      '<button class="demo-exit">Выйти</button>';
    document.body.appendChild(bar);

    bar.querySelector('.demo-prev').addEventListener('click', function () { if (idx > 0) go(TOUR[idx - 1]); });
    bar.querySelector('.demo-next').addEventListener('click', function () { if (idx < TOUR.length - 1) go(TOUR[idx + 1]); });
    bar.querySelector('.demo-jump').addEventListener('change', function (e) { go(TOUR[parseInt(e.target.value, 10)]); });
    bar.querySelector('.demo-profile').addEventListener('change', function (e) { setProfile(e.target.value); });
    bar.querySelector('.demo-exit').addEventListener('click', exitDemo);

    // финал: автоматически открыть документ стратегии на station3.html#finalize
    if (page === 'station3.html' && location.hash === '#finalize') {
      var tries = 0;
      var t = setInterval(function () {
        var btn = document.getElementById('openFinalizeBtn');
        var screen = document.getElementById('finalizeScreen');
        if (btn && screen && screen.style.display !== 'flex') { btn.click(); clearInterval(t); }
        if (++tries > 40) clearInterval(t);
      }, 100);
    }

    // станция 1: реально размечаем в тексте цитаты засеянных проблем, чтобы в
    // экскурсии была видна связка «отметка в тексте ↔ карточка проблемы» — как у
    // настоящего участника (демо не проходит выделение руками).
    if (page === 'station1.html') injectDemoMarks();
  }

  // Оборачивает в <mark class="hl"> первую встреченную в тексте кейса цитату каждой
  // засеянной проблемы (по её snippet). Клик по отметке station1.js уводит к
  // карточке, клик по цитате карточки — к отметке. Размеченный HTML сохраняем в
  // htmlKey, чтобы отметки пережили перезагрузку экскурсии.
  function injectDemoMarks() {
    var cc = document.getElementById('caseContent');
    if (!cc) return;
    var s1 = null;
    try { s1 = JSON.parse(localStorage.getItem('imp_station1_' + DEMO_BIB) || 'null'); } catch (e) {}
    if (!s1 || !s1.highlights || !s1.highlights.length) return;
    var changed = false;
    s1.highlights.forEach(function (h) {
      if (!h.snippet) return;
      if (cc.querySelector('mark[data-hl-id="' + h.id + '"]')) return; // уже размечено
      var walker = document.createTreeWalker(cc, NodeFilter.SHOW_TEXT, null);
      var node;
      while ((node = walker.nextNode())) {
        if (node.parentElement && node.parentElement.closest('mark.hl')) continue;
        var idx = node.textContent.indexOf(h.snippet);
        if (idx === -1) continue;
        try {
          var range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + h.snippet.length);
          var mark = document.createElement('mark');
          mark.className = 'hl';
          mark.dataset.hlId = h.id;
          range.surroundContents(mark);
          changed = true;
        } catch (e) {}
        break;
      }
    });
    if (changed) {
      try { localStorage.setItem('imp_station1_html_' + DEMO_BIB, cc.innerHTML); } catch (e) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();

// i(m)perfect — ЭКСПЕРТНАЯ ВАЛИДАЦИЯ МЕТОДОЛОГИИ.
//
// Что здесь меряется. Не человек, а ТЕКСТ методологии. Эксперт — измерительный
// прибор, приложенный к описаниям уровней; сходятся эксперты между собой или
// расходятся — это свойство описаний, а не экспертов. Отсюда всё остальное:
// эксперту не показывают правильный ответ ни в каком виде, ни по ходу, ни в
// конце (иначе второй эксперт из той же компании придёт подготовленным), и
// эксперту разрешено возвращаться назад — необратимость шага защищает замер
// человека, а здесь человека не замеряют.
//
// Три блока, и порядок между ними не случаен.
//
//   В-0 · СВОБОДНЫЙ ВЫЗОВ — 4–7 составляющих стратегического мышления своими
//         словами, ДО того как эксперт увидел карту. Три минуты, и это
//         единственный незаякоренный ответ во всём прогоне: после карты
//         «чего не хватает» спрашивать уже поздно — человек видит модель как
//         данность и достраивает её, а не свою.
//   А  ·  АТРИБУЦИЯ — 50 карточек, к какой способности относится каждая.
//         Выбор в два шага (навык → способность внутри навыка): это и легче,
//         и даёт две метрики вместо одной. Попадание в навык при промахе по
//         способности — не «ошибка», а находка: значит, пара внутри навыка
//         не различается.
//   Б  ·  ПОРЯДОК — пять карточек одной способности выстроить от низшего к
//         высшему. Способность здесь названа честно: иначе промах блока А
//         каскадом ломает блок Б, и две метрики не разделить.
//   В-1 · КАРТА — полнота и границы модели. Идёт ПОСЛЕДНИМ: к этому моменту
//         эксперт прочитал 50 описаний и судит о модели изнутри, а не по
//         оглавлению. Расхождение между В-0 и В-1 и есть замер полноты.
//
// Порядок карточек у каждого эксперта свой, но воспроизводимый: зерно —
// хэш его id. Без воспроизводимости нельзя восстановить, что человек видел,
// когда он вернулся на другом устройстве.

(function () {
  var $ = function (id) { return document.getElementById(id); };

  // Корпус приходит РАСШИФРОВАННЫМ из js/expert-lock.js, а не лежит в глобальной
  // переменной с загрузки страницы: до пароля его нет ни в каком виде.
  var C = null, ABILITIES = null, ABILITY_BY_CODE = null, SKILL_BY_CODE = null, CARD_BY_ID = null;

  function indexCorpus(corpus) {
    C = corpus;
    ABILITIES = [];
    C.skills.forEach(function (s) { s.abilities.forEach(function (a) { ABILITIES.push(a); }); });
    ABILITY_BY_CODE = {};
    ABILITIES.forEach(function (a) { ABILITY_BY_CODE[a.code] = a; });
    SKILL_BY_CODE = {};
    C.skills.forEach(function (s) { SKILL_BY_CODE[s.code] = s; });
    CARD_BY_ID = {};
    C.cards.forEach(function (c) { CARD_BY_ID[c.id] = c; });
  }

  // ------------------------------------------------------------ состояние

  var STATE_V = 1;
  var S = null;
  var KEY = function (id) { return 'imp_expert_' + id; };

  // Четырёхзначный номер: его диктуют голосом и переписывают в блокнот, поэтому
  // он короткий. Занятые в этом браузере пропускаем — на одном компьютере два
  // эксперта иногда проходят подряд.
  //
  // ⚠ ПОЧЕМУ ЧЕТЫРЕ, А НЕ ТРИ. Браузеры друг о друге не знают, номер каждый
  // выдаёт себе сам, и два эксперта могут получить один и тот же — тогда второй
  // пишет поверх первого. На двенадцати экспертах при 900 номерах это случалось
  // бы примерно в 7% прогонов, при 9000 — в 0.7%. Разница между «раз в
  // четырнадцать волн» и «раз в полтораста»; цена — одна лишняя цифра в письме.
  // Совсем до нуля это не доводит, поэтому возврат по номеру всё равно
  // показывает имя владельца и спрашивает подтверждение.
  function newId() {
    var taken = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('imp_expert_') === 0) taken[k.slice('imp_expert_'.length)] = true;
      }
    } catch (e) {}
    for (var n = 0; n < 200; n++) {
      var v = String(1000 + Math.floor(Math.random() * 9000));
      if (!taken[v]) return v;
    }
    return String(1000 + Math.floor(Math.random() * 9000));
  }

  function blank(id) {
    return {
      v: STATE_V, id: id, corpus: C.version, builtFrom: C.builtFrom,
      who: { first: '', last: '' },
      startedAt: new Date().toISOString(),
      free: [], attr: {}, order: {}, touched: {},
      map: { rel: {}, pair: {}, extra: [], meta: {}, tools: {}, missing: [] },
      at: { screen: 'intro', i: 0 },
      finishedAt: null
    };
  }

  function load(id) {
    try {
      var raw = localStorage.getItem(KEY(id));
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s.v !== STATE_V) return null;
      // ⚠ Корпус сменился — старые ответы к новым карточкам не относятся.
      // Молча продолжить здесь означало бы смешать в одной строке сводки
      // ответы про два разных текста. Начинаем заново и говорим об этом.
      if (s.corpus !== C.version) return null;
      return s;
    } catch (e) { return null; }
  }

  var saveTimer = null;
  function save(now) {
    if (!S) return;
    try { localStorage.setItem(KEY(S.id), JSON.stringify(S)); } catch (e) {}
    try { localStorage.setItem('imp_expert_last', S.id); } catch (e) {}
    if (saveTimer) clearTimeout(saveTimer);
    if (now) { push(); return; }
    saveTimer = setTimeout(push, 1500);
  }

  function push() {
    // Свой клиент к своему бэкенду (js/expert-api.js). Скрипт ассессмента эта
    // страница не трогает: там другие данные, другой объём и другой срок жизни.
    if (window.imp && window.imp.saveExpert) window.imp.saveExpert(S.id, S);
  }

  // ------------------------------------------------- воспроизводимый порядок

  function seedOf(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rngFrom(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(arr, seed) {
    var a = arr.slice(), rnd = rngFrom(seed);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var deck = null;       // порядок 50 карточек блока А
  var abilityDeck = null; // порядок 10 способностей блока Б

  function buildDecks() {
    var seed = seedOf(S.id + '|' + C.version);
    deck = shuffled(C.cards.map(function (c) { return c.id; }), seed);
    abilityDeck = shuffled(ABILITIES.map(function (a) { return a.code; }), seed ^ 0x9e3779b9);
    // Стартовая раскладка блока Б — тоже от зерна, и она обязана отличаться
    // от правильной: показать пять карточек уже по порядку значило бы
    // измерить готовность эксперта ничего не трогать.
    abilityDeck.forEach(function (code) {
      if (S.order[code]) return;
      var ids = C.cards.filter(function (c) { return c.ability === code; })
        .map(function (c) { return c.id; });
      var mixed = shuffled(ids, seed ^ seedOf(code));
      if (mixed.join() === ids.join()) mixed.reverse();
      S.order[code] = mixed;
    });
  }

  // -------------------------------------------------------------- разметка

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // compact — режим блока Б. Там пять карточек стоят одна под другой, и в
  // полном виде экран уходит на две с половиной высоты: сравнивать пятое с
  // первым приходится по памяти, то есть задание меряет память, а не порядок.
  // Поэтому наблюдаемые признаки убраны под раскрытие: образ уровня («суть»)
  // для сравнения достаточен, признаки нужны только при сомнении.
  function cardHtml(card, compact) {
    // Карточка — абзацы описания уровня, целиком и без раскрытий. Прежде здесь
    // была тройка «ярлык + суть + список признаков» с прятанием признаков под
    // details: она повторяла разметку §10, где уровень описан заголовком,
    // абзацем-сутью и перечнем «Ярлык. Пояснение». Описания больше не режутся
    // из §10 — они написаны под эту задачу связной прозой, и прятать в них
    // нечего: спрятанная половина описания — это половина основания для
    // раскладки, которую эксперт не увидит.
    var h = '<article class="xc' + (compact ? ' xc-compact' : '') + '">';
    (card.paras || []).forEach(function (t, i) {
      h += '<p class="xc-para' + (i === 0 ? ' xc-para-first' : '') + '">' + esc(t) + '</p>';
    });
    return h + '</article>';
  }

  // Справочник по способностям — открыт всегда. Принцип тот же, что на
  // рабочем столе участника (js/engine.js): то, что прибор перечитывает
  // бесплатно, человек должен перечитывать почти бесплатно. Эксперт, который
  // держит десять определений в голове, платит налог за память, а мы потом
  // читаем его промахи как свойство методологии.
  function refHtml() {
    var h = '<details class="xref" id="xRef"><summary>Справочник: пять навыков, десять способностей</summary><div class="xref-body">';
    C.skills.forEach(function (s) {
      h += '<div class="xref-skill"><h4>' + esc(s.name) + '</h4><p class="xref-def">' + esc(s.def) + '</p><ul>';
      s.abilities.forEach(function (a) {
        h += '<li><b>' + esc(a.name) + '</b> — ' + esc(a.def) + '</li>';
      });
      h += '</ul></div>';
    });
    return h + '</div></details>';
  }

  function progressHtml(done, total, label) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    return '<div class="xprog"><div class="xprog-bar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="xprog-num">' + label + '</span></div>';
  }

  // ---------------------------------------------------------------- экраны

  var screens = {};
  var host = null;

  function go(screen, i) {
    S.at = { screen: screen, i: i || 0 };
    save();
    render();
  }

  // Карточка показывается целиком и не прокручивается — размечать нечего.
  // Функция оставлена пустой, чтобы не разбирать три места вызова: если высота
  // когда-нибудь снова станет ограниченной, сигнал вернётся сюда.
  function markScrollable() {}

  var lastAt = '';
  function render() {
    var fn = screens[S.at.screen] || screens.intro;
    host.innerHTML = fn();
    if (fn.after) fn.after();
    // Прокрутка наверх — только при смене ЭКРАНА, но не при переходе к следующей
    // карточке внутри блока. Геометрия у всех пятидесяти карточек теперь
    // одинаковая до пикселя, поэтому сохранённое положение прокрутки означает,
    // что текст и кнопки стоят на одном и том же месте ЭКРАНА все пятьдесят раз.
    // Со сбросом наверх было наоборот: на невысоком окне «дальше» уходила под
    // сгиб, эксперт подкручивал, нажимал — и следующая карточка снова
    // отбрасывала его наверх, к прокрутке заново. Пятьдесят раз.
    markScrollable();
    if (S.at.screen !== lastAt) { window.scrollTo(0, 0); lastAt = S.at.screen; }
    if (window.imp && window.imp.typoDom) { try { window.imp.typoDom(host); } catch (e) {} }
  }

  // --- вход -----------------------------------------------------------------

  screens.intro = function () {
    return '' +
      '<div class="xnarrow">' +
      '<p class="kicker">Валидация методологии</p>' +
      '<h1>Разбор описаний уровней</h1>' +
      '<p class="section-lead">Займёт около часа.</p>' +
      // Номер показывается ДО работы, а не только на финише: закрыть вкладку
      // можно на любой карточке, и узнать номер к тому моменту будет негде.
      '<p class="xbadge">Ваш номер <b>' + esc(S.id) + '</b></p>' +
      '<p class="xnote">Номер может понадобиться, если вы не успеете пройти всё тестирование ' +
      'за один раз, — запомните его или запишите.</p>' +
      // Только имя и фамилия. Компанию, роль и стаж спрашивать незачем: мы сами
      // зовём этих людей и всё это про них знаем, а лишние поля на входе — три
      // повода передумать.
      // ⚠ type="text" обязателен. Правило платформы записано как
      // .field input[type="text"] — без атрибута поле в него не попадает и
      // рисуется браузерным дефолтом: мелким и не в стиле остальных экранов.
      '<div class="xgrid2">' +
      '<div class="field"><label for="xFirst">Имя</label>' +
      '<input type="text" id="xFirst" autocomplete="given-name" /></div>' +
      '<div class="field"><label for="xLast">Фамилия</label>' +
      '<input type="text" id="xLast" autocomplete="family-name" /></div>' +
      '</div>' +
      '<p class="field-err" id="xIntroErr" style="display:none;">Заполните имя и фамилию.</p>' +
      '<button class="btn btn-primary" id="xIntroGo">Начать →</button>' +
      '</div>';
  };
  screens.intro.after = function () {
    ['first', 'last'].forEach(function (k) {
      var el = $('x' + k.charAt(0).toUpperCase() + k.slice(1));
      if (el) el.value = S.who[k] || '';
    });
    $('xIntroGo').onclick = function () {
      S.who = { first: $('xFirst').value.trim(), last: $('xLast').value.trim() };
      if (!S.who.first || !S.who.last) { $('xIntroErr').style.display = ''; return; }
      save(true);
      go('free');
    };
  };

  // --- В-0 · свободный вызов ------------------------------------------------

  var FREE_MIN = 4, FREE_MAX = 7;

  screens.free = function () {
    var h = '<div class="xnarrow">' +
      '<p class="kicker">1 из 4 · три минуты</p>' +
      '<h2>Своими словами</h2>' +
      '<p class="section-lead">Пока вы не видели нашу модель. Назовите от четырёх до семи ' +
      'составляющих стратегического мышления, которые вы стали бы оценивать у руководителя. ' +
      'Коротко, как считаете нужным — списком, без пояснений.</p>' +
      '<p class="xnote">Этот ответ нельзя будет изменить после того, как вы увидите карту модели: ' +
      'он для того и нужен, чтобы остаться независимым от неё.</p>';
    for (var i = 0; i < FREE_MAX; i++) {
      h += '<div class="field xfree-row"><span class="xfree-n">' + (i + 1) + '</span>' +
        '<input type="text" class="xfree" data-i="' + i + '" value="' + esc(S.free[i] || '') + '" ' +
        (i < FREE_MIN ? '' : 'placeholder="необязательно" ') + '/></div>';
    }
    return h +
      '<p class="field-err" id="xFreeErr" style="display:none;">Нужно хотя бы четыре пункта.</p>' +
      '<button class="btn btn-primary" id="xFreeGo">Дальше →</button></div>';
  };
  screens.free.after = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.xfree'), function (el) {
      el.oninput = function () { S.free[Number(el.dataset.i)] = el.value; save(); };
    });
    $('xFreeGo').onclick = function () {
      var filled = S.free.filter(function (s) { return s && s.trim(); }).length;
      if (filled < FREE_MIN) { $('xFreeErr').style.display = ''; return; }
      save(true);
      go('briefA');
    };
  };

  // --- инструкция к блоку А -------------------------------------------------

  screens.briefA = function () {
    return '<div class="xnarrow">' +
      '<p class="kicker">2 из 4 · около получаса</p>' +
      '<h2>К какой способности относится описание</h2>' +
      '<p class="section-lead">Дальше — 50 описаний, по одному на экран. Каждое описывает ' +
      'один уровень одной способности. Ваша задача: сказать, о какой способности идёт речь ' +
      'в описании.</p>' +
      '<p class="section-lead">Сначала читаете описание, потом выбираете навык из пяти ' +
      'возможных, потом одну из двух способностей внутри этого навыка. Определения всегда ' +
      'под рукой — справочник раскрывается внизу экрана.</p>' +
      '<ul class="xlist">' +
      '<li>Номера уровней и коды из описаний убраны. Если что-то похожее попалось — ' +
      'это наш недосмотр, отметьте в заметке.</li>' +
      '<li>Если описание не ложится ни к одной способности — отметьте кнопкой ' +
      '«не могу выбрать». Это не пропуск, а самый ценный ответ: значит, описание не работает.</li>' +
      '<li>Если подходят две — выберите основную, потом отметьте вторую. Пары, которые ' +
      'путаются, — то, что мы ищем в том числе.</li>' +
      '<li>Можно возвращаться назад и пересматривать свой ответ.</li>' +
      '</ul>' +
      '<button class="btn btn-primary" id="xBriefAGo">Начать разбор →</button></div>';
  };
  screens.briefA.after = function () {
    $('xBriefAGo').onclick = function () {
      var first = 0;
      for (var i = 0; i < deck.length; i++) { if (!S.attr[deck[i]]) { first = i; break; } }
      go('attr', first);
    };
  };

  // --- блок А · атрибуция ---------------------------------------------------

  screens.attr = function () {
    var i = Math.max(0, Math.min(S.at.i, deck.length - 1));
    var id = deck[i];
    var card = CARD_BY_ID[id];
    var a = S.attr[id] || {};
    var done = Object.keys(S.attr).length;

    // ⚠ ВСЁ НИЖЕ КАРТОЧКИ СТОИТ НА МЕСТЕ. Раньше экран менял ряд из пяти
    // навыков на ряд из двух способностей, и всё, что ниже, подскакивало на
    // 170px ровно под курсором; появление «подходит ещё и» двигало ещё на 64;
    // а высота карточки гуляла от 148 до 508px, так что «дальше» между
    // карточками ездило на 360px. Три причины, одно следствие: попасть по
    // кнопке можно было только прицелившись заново.
    //
    // Поэтому: (1) ряд навыков виден ВСЕГДА, выбранный подсвечен — ряд не
    // подменяется, а дополняется; (2) под способности и под «ещё подходит»
    // место занято всегда, даже когда там пусто; (3) карточка живёт в области
    // с полом и потолком, и самые длинные прокручиваются внутри себя, а не
    // растягивают экран.
    var h = '<div class="xwide">' +
      progressHtml(done, deck.length, (i + 1) + ' из ' + deck.length) +
      '<div class="xc-slot">' + cardHtml(card) + '</div>' +
      '<div class="xpick" id="xPick">' +
      '<p class="xpick-q">Навык</p><div class="xpick-row xpick-skills" id="xSkills">';
    C.skills.forEach(function (s) {
      h += '<button type="button" class="xchip' + (a.skill === s.code ? ' is-on' : '') +
        '" data-skill="' + esc(s.code) + '">' + esc(s.name) + '</button>';
    });
    h += '</div>' +
      '<p class="xpick-q">Способность</p><div class="xpick-row xpick-abils" id="xAbils">' +
      abilsHtml(a) + '</div>';

    // Кнопкой, а не ссылкой: «не могу выбрать» — такой же полноценный ответ,
    // как выбор способности, и самый ценный из трёх. Подчёркнутой ссылкой
    // мелким кеглем он читается как отказ от задания и подталкивает угадывать.
    // Три второстепенных ответа стоят одной строкой, а не тремя блоками: по
    // отдельности они съедали 130px высоты и утаскивали «дальше» под сгиб
    // экрана. Слот второго выбора при этом никуда не исчезает — до выбора
    // способности он просто выключен: появляющийся элемент двигал бы кнопку
    // ровно в тот момент, когда к ней тянется рука.
    h += '<div class="xextras">' +
      '<button type="button" class="btn btn-ghost btn-sm xunsure' + (a.unsure ? ' is-on' : '') +
      '" id="xUnsure">' + (a.unsure ? '✓ не могу выбрать ни одну' : 'не могу выбрать ни одну') + '</button>' +
      '<span class="xsecond"><label for="xSecond">подходит ещё и</label>' +
      '<select id="xSecond"' + (a.ability ? '' : ' disabled') + '>' + secondHtml(a) + '</select></span>' +
      '</div>' +
      '<details class="xnote-box"' + (a.note ? ' open' : '') + '><summary>Заметка о формулировке</summary>' +
      '<textarea id="xNote" rows="3" placeholder="Что мешает прочитать это описание?">' + esc(a.note || '') + '</textarea></details>';

    // Справочник — ПЕРЕД навигацией. Стоя после неё, он прилипал к нижней
    // границе ряда кнопок и читался как его продолжение; и последним элементом
    // экрана должен быть выход с него, а не опора.
    h += refHtml();

    h += '</div><div class="xnav">' +
      '<button type="button" class="btn btn-ghost" id="xPrev"' + (i === 0 ? ' disabled' : '') + '>← назад</button>' +
      '<button type="button" class="btn btn-primary" id="xNext"' +
      ((a.ability || a.unsure) ? '' : ' disabled') + '>' +
      (i === deck.length - 1 ? 'Завершить блок →' : 'дальше →') + '</button>' +
      '</div></div>';
    return h;
  };

  // Две способности выбранного навыка — или заглушка той же высоты, пока навык
  // не выбран. Заглушка здесь не украшение: без неё блок схлопывается в ноль.
  function abilsHtml(a) {
    if (!a.skill) {
      return '<p class="xabils-empty">Сначала выберите навык — здесь появятся две его способности.</p>';
    }
    var out = '';
    SKILL_BY_CODE[a.skill].abilities.forEach(function (ab) {
      out += '<button type="button" class="xopt' + (a.ability === ab.code ? ' is-on' : '') +
        '" data-ability="' + esc(ab.code) + '">' +
        '<b>' + esc(ab.name) + '</b><span>' + esc(ab.def) + '</span></button>';
    });
    return out;
  }

  function secondHtml(a) {
    var out = '<option value="">— нет, только одна</option>';
    ABILITIES.forEach(function (ab) {
      if (ab.code === a.ability) return;
      out += '<option value="' + esc(ab.code) + '"' + (a.second === ab.code ? ' selected' : '') + '>' +
        esc(SKILL_BY_CODE[ab.code.slice(0, 2)].name) + ' · ' + esc(ab.name) + '</option>';
    });
    return out;
  }

  screens.attr.after = function () {
    var i = Math.max(0, Math.min(S.at.i, deck.length - 1));
    var id = deck[i];
    var shownAt = Date.now();

    function cur() { return S.attr[id] || (S.attr[id] = { ms: 0 }); }

    function put(patch) {
      var c = cur();
      // Время на карточку копится, а не перезаписывается: эксперт может
      // вернуться, и «сколько он на это смотрел» — сумма заходов.
      c.ms = (c.ms || 0) + (Date.now() - shownAt);
      shownAt = Date.now();
      c.at = new Date().toISOString();
      Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
      save();
      paint();
    }

    // Перерисовывается ТОЛЬКО то, что изменилось. Полный render() здесь и был
    // источником рывка: он пересобирал разметку целиком, сбрасывал прокрутку
    // наверх и на мгновение показывал экран без ряда кнопок.
    function paint() {
      var a = cur();
      Array.prototype.forEach.call($('xSkills').children, function (b) {
        b.classList.toggle('is-on', a.skill === b.dataset.skill);
      });
      $('xAbils').innerHTML = abilsHtml(a);
      bindAbils();
      var sel = $('xSecond');
      sel.disabled = !a.ability;
      sel.innerHTML = secondHtml(a);
      var u = $('xUnsure');
      u.classList.toggle('is-on', !!a.unsure);
      u.textContent = a.unsure ? '✓ не могу выбрать ни одну' : 'не могу выбрать ни одну';
      $('xNext').disabled = !(a.ability || a.unsure);
    }

    function bindAbils() {
      Array.prototype.forEach.call(document.querySelectorAll('[data-ability]'), function (b) {
        b.onclick = function () { put({ ability: b.dataset.ability, unsure: false }); };
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-skill]'), function (b) {
      b.onclick = function () {
        var a = cur();
        // Повторный щелчок по выбранному навыку снимает выбор: иначе передумать
        // можно было только выбрав другой навык, а «я ошибся навыком, дайте
        // подумать заново» — законное состояние.
        if (a.skill === b.dataset.skill) put({ skill: '', ability: '', second: '' });
        else put({ skill: b.dataset.skill, ability: '', second: '', unsure: false });
      };
    });
    bindAbils();
    $('xUnsure').onclick = function () {
      var a = cur();
      put(a.unsure ? { unsure: false } : { unsure: true, skill: '', ability: '', second: '' });
    };
    $('xSecond').onchange = function () { put({ second: $('xSecond').value }); };
    $('xNote').oninput = function () { cur().note = $('xNote').value; save(); };

    $('xPrev').onclick = function () { if (i > 0) go('attr', i - 1); };
    $('xNext').onclick = function () {
      if (i === deck.length - 1) { save(true); go('briefB'); }
      else go('attr', i + 1);
    };
  };

  // --- инструкция к блоку Б -------------------------------------------------

  screens.briefB = function () {
    var unanswered = deck.filter(function (id) {
      var a = S.attr[id]; return !a || (!a.ability && !a.unsure);
    });
    var warn = unanswered.length
      ? '<p class="xwarn">Без ответа осталось карточек: ' + unanswered.length +
        '. <button type="button" class="xlink" id="xBackAttr">вернуться к ним</button></p>'
      : '';
    return '<div class="xnarrow">' +
      '<p class="kicker">3 из 4 · около пятнадцати минут</p>' +
      '<h2>От низшего к высшему</h2>' + warn +
      '<p class="section-lead">Теперь те же описания, но собранные по способностям — по пять на ' +
      'экран. Способность названа. Задача: выстроить пять описаний по возрастанию, от самого ' +
      'слабого проявления к самому сильному.</p>' +
      '<p class="section-lead">Порядок на экране случайный. Двигайте карточки стрелками; когда ' +
      'сверху окажется низший уровень, а снизу — высший, идите дальше.</p>' +
      '<button class="btn btn-primary" id="xBriefBGo">Начать →</button></div>';
  };
  screens.briefB.after = function () {
    if ($('xBackAttr')) $('xBackAttr').onclick = function () {
      for (var i = 0; i < deck.length; i++) {
        var a = S.attr[deck[i]];
        if (!a || (!a.ability && !a.unsure)) { go('attr', i); return; }
      }
    };
    $('xBriefBGo').onclick = function () {
      var first = 0;
      for (var i = 0; i < abilityDeck.length; i++) {
        if (!S.touched[abilityDeck[i]]) { first = i; break; }
      }
      go('order', first);
    };
  };

  // --- блок Б · порядок уровней --------------------------------------------

  screens.order = function () {
    var i = Math.max(0, Math.min(S.at.i, abilityDeck.length - 1));
    var code = abilityDeck[i];
    var ab = ABILITY_BY_CODE[code];
    var sk = SKILL_BY_CODE[code.slice(0, 2)];
    var ids = S.order[code];
    var doneCount = Object.keys(S.touched).length;

    var h = '<div class="xwide">' +
      progressHtml(doneCount, abilityDeck.length, (i + 1) + ' из ' + abilityDeck.length) +
      '<div class="xability"><p class="kicker">' + esc(sk.name) + '</p>' +
      '<h2>' + esc(ab.name) + '</h2><p class="xability-def">' + esc(ab.def) + '</p></div>' +
      '<p class="xpick-q">Сверху — низший уровень, снизу — высший.</p>' +
      '<ol class="xorder" id="xOrder">';
    ids.forEach(function (id, n) {
      h += '<li class="xorder-item"><div class="xorder-rank">' + (n + 1) + '</div>' +
        '<div class="xorder-body">' + cardHtml(CARD_BY_ID[id], true) + '</div>' +
        '<div class="xorder-ctl">' +
        '<button type="button" class="xarrow" data-up="' + n + '"' + (n === 0 ? ' disabled' : '') +
        ' aria-label="выше">↑</button>' +
        '<button type="button" class="xarrow" data-down="' + n + '"' + (n === ids.length - 1 ? ' disabled' : '') +
        ' aria-label="ниже">↓</button></div></li>';
    });
    h += '</ol>';

    h += '<details class="xnote-box"' + ((S.orderNote && S.orderNote[code]) ? ' open' : '') +
      '><summary>Заметка: что здесь мешало</summary>' +
      '<textarea id="xONote" rows="3" placeholder="Например: два описания неразличимы по силе.">' +
      esc((S.orderNote && S.orderNote[code]) || '') + '</textarea></details>';

    h += '<div class="xnav">' +
      '<button type="button" class="btn btn-ghost" id="xPrev"' + (i === 0 ? ' disabled' : '') + '>← назад</button>' +
      '<button type="button" class="btn btn-primary" id="xNext">' +
      (i === abilityDeck.length - 1 ? 'Завершить блок →' : 'дальше →') + '</button>' +
      '</div></div>';
    return h;
  };
  screens.order.after = function () {
    var i = Math.max(0, Math.min(S.at.i, abilityDeck.length - 1));
    var code = abilityDeck[i];

    function move(from, to) {
      var ids = S.order[code];
      if (to < 0 || to >= ids.length) return;
      var t = ids[from]; ids[from] = ids[to]; ids[to] = t;
      S.touched[code] = true;
      save();
      render();
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-up]'), function (b) {
      b.onclick = function () { var n = Number(b.dataset.up); move(n, n - 1); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-down]'), function (b) {
      b.onclick = function () { var n = Number(b.dataset.down); move(n, n + 1); };
    });
    $('xONote').oninput = function () {
      S.orderNote = S.orderNote || {};
      S.orderNote[code] = $('xONote').value;
      save();
    };
    $('xPrev').onclick = function () { if (i > 0) go('order', i - 1); };
    $('xNext').onclick = function () {
      // Нетронутый экран — это случайная раскладка, выданная нами же.
      // Записать её как ответ значило бы налить в сводку шум под видом
      // суждения. Поэтому подтверждение спрашивается явно.
      if (!S.touched[code]) {
        if (!window.confirm('Вы не меняли порядок на этом экране. Записать его как ваш ответ?')) return;
        S.touched[code] = true;
        save();
      }
      if (i === abilityDeck.length - 1) { save(true); go('briefC'); }
      else go('order', i + 1);
    };
  };

  // --- инструкция к блоку В -------------------------------------------------

  screens.briefC = function () {
    return '<div class="xnarrow">' +
      '<p class="kicker">4 из 4 · около десяти минут</p>' +
      '<h2>Полнота карты</h2>' +
      '<p class="section-lead">Вы прочитали все пятьдесят описаний и знаете модель изнутри — ' +
      'теперь вопрос о ней целиком. Пять навыков, у каждого две способности. ' +
      'Всё ли здесь на месте, нет ли лишнего и не пропущено ли важное.</p>' +
      '<p class="section-lead">В самом начале вы называли составляющие своими словами. ' +
      'Мы сравним два ваших ответа — не чтобы поймать на несогласии, а чтобы увидеть, что ' +
      'исчезает из виду, когда карта уже перед глазами.</p>' +
      '<button class="btn btn-primary" id="xBriefCGo">Смотреть карту →</button></div>';
  };
  screens.briefC.after = function () {
    $('xBriefCGo').onclick = function () { go('map'); };
  };

  // --- блок В-1 · карта -----------------------------------------------------

  var REL = [
    { v: 1, t: 'не относится' },
    { v: 2, t: 'скорее нет' },
    { v: 3, t: 'скорее да' },
    { v: 4, t: 'определённо да' }
  ];

  screens.map = function () {
    var m = S.map;
    var h = '<div class="xnarrow"><p class="kicker">4 из 4</p><h2>Пять навыков</h2>' +
      '<p class="section-lead">По каждому — два вопроса: относится ли это к стратегическому ' +
      'мышлению и исчерпывают ли навык две названные способности.</p>';

    C.skills.forEach(function (s) {
      h += '<section class="xmap-skill"><h3>' + esc(s.name) + '</h3>' +
        '<p class="xref-def">' + esc(s.def) + '</p><ul class="xmap-ab">';
      s.abilities.forEach(function (a) {
        h += '<li><b>' + esc(a.name) + '</b> — ' + esc(a.def) + '</li>';
      });
      h += '</ul>' +
        '<p class="xpick-q">Относится ли это к стратегическому мышлению?</p><div class="xscale">';
      REL.forEach(function (r) {
        h += '<button type="button" class="xopt xopt-sm' + (m.rel[s.code] === r.v ? ' is-on' : '') +
          '" data-rel="' + esc(s.code) + '" data-v="' + r.v + '">' + esc(r.t) + '</button>';
      });
      h += '</div>';

      var p = m.pair[s.code] || {};
      h += '<p class="xpick-q">Исчерпывают ли навык эти две способности?</p><div class="xscale">' +
        '<button type="button" class="xopt xopt-sm' + (p.verdict === 'yes' ? ' is-on' : '') +
        '" data-pair="' + esc(s.code) + '" data-v="yes">да, исчерпывают</button>' +
        '<button type="button" class="xopt xopt-sm' + (p.verdict === 'no' ? ' is-on' : '') +
        '" data-pair="' + esc(s.code) + '" data-v="no">нет, чего-то не хватает</button></div>' +
        '<textarea class="xpair-note" data-pairnote="' + esc(s.code) + '" rows="2" ' +
        'placeholder="Если не хватает — чего именно?"' + (p.verdict === 'no' ? '' : ' hidden') + '>' +
        esc(p.note || '') + '</textarea></section>';
    });

    h += '<section class="xmap-skill"><h3>Что в оценку не входит</h3>' +
      '<p class="section-lead">Методология объявляет два этажа за пределами оценки. ' +
      'Согласны ли вы с этим решением?</p>' +
      '<p class="xmap-line"><b>Метанавыки:</b> ' +
      esc(C.excluded.metaskills.map(function (x) { return x.name; }).join(', ')) +
      '. Влияют на то, насколько эффективно работает стратегическое мышление, но сами им не являются.</p>' +
      '<div class="xscale">' +
      '<button type="button" class="xopt xopt-sm' + (m.meta.verdict === 'agree' ? ' is-on' : '') +
      '" data-meta="agree">верно не оценивать</button>' +
      '<button type="button" class="xopt xopt-sm' + (m.meta.verdict === 'disagree' ? ' is-on' : '') +
      '" data-meta="disagree">что-то из этого надо оценивать</button></div>' +
      '<textarea id="xMetaNote" rows="2" placeholder="Что именно и почему?">' + esc(m.meta.note || '') + '</textarea>' +
      '<p class="xmap-line"><b>Инструменты:</b> ' + esc(C.excluded.toolsNote) + '</p>' +
      '<div class="xscale">' +
      '<button type="button" class="xopt xopt-sm' + (m.tools.verdict === 'agree' ? ' is-on' : '') +
      '" data-tools="agree">верно не оценивать</button>' +
      '<button type="button" class="xopt xopt-sm' + (m.tools.verdict === 'disagree' ? ' is-on' : '') +
      '" data-tools="disagree">надо оценивать</button></div>' +
      '<textarea id="xToolsNote" rows="2" placeholder="Почему?">' + esc(m.tools.note || '') + '</textarea>' +
      '</section>';

    h += '<section class="xmap-skill"><h3>Чего в карте не хватает</h3>' +
      '<p class="section-lead">Составляющие стратегического мышления, которых в этих десяти ' +
      'способностях нет, а оценивать их стоило бы. До трёх пунктов; если всё на месте — оставьте пустым.</p>';
    for (var k = 0; k < 3; k++) {
      h += '<div class="field"><input class="xmissing" data-i="' + k + '" value="' +
        esc(m.missing[k] || '') + '" /></div>';
    }
    h += '</section>';

    h += '<section class="xmap-skill"><h3>Что здесь лишнее</h3>' +
      '<p class="section-lead">Способности, которые, на ваш взгляд, к стратегическому мышлению ' +
      'не относятся или дублируют друг друга.</p><div class="xchecks">';
    ABILITIES.forEach(function (a) {
      h += '<label class="xcheck"><input type="checkbox" class="xextra" value="' + esc(a.code) + '"' +
        (m.extra.indexOf(a.code) >= 0 ? ' checked' : '') + ' /> ' + esc(a.name) + '</label>';
    });
    h += '</div><textarea id="xExtraNote" rows="2" placeholder="Почему?">' + esc(m.extraNote || '') + '</textarea></section>';

    return h + '<p class="field-err" id="xMapErr" style="display:none;">' +
      'Ответьте на оба вопроса по каждому из пяти навыков.</p>' +
      '<button class="btn btn-primary" id="xMapGo">Завершить →</button></div>';
  };
  screens.map.after = function () {
    var m = S.map;
    function bind(sel, fn) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        el.onclick = function () { fn(el); save(); render(); };
      });
    }
    bind('[data-rel]', function (el) { m.rel[el.dataset.rel] = Number(el.dataset.v); });
    bind('[data-pair]', function (el) {
      var c = el.dataset.pair;
      m.pair[c] = m.pair[c] || {};
      m.pair[c].verdict = el.dataset.v;
    });
    bind('[data-meta]', function (el) { m.meta.verdict = el.dataset.meta; });
    bind('[data-tools]', function (el) { m.tools.verdict = el.dataset.tools; });

    Array.prototype.forEach.call(document.querySelectorAll('[data-pairnote]'), function (el) {
      el.oninput = function () {
        var c = el.dataset.pairnote;
        m.pair[c] = m.pair[c] || {};
        m.pair[c].note = el.value;
        save();
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('.xmissing'), function (el) {
      el.oninput = function () { m.missing[Number(el.dataset.i)] = el.value; save(); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('.xextra'), function (el) {
      el.onchange = function () {
        var i = m.extra.indexOf(el.value);
        if (el.checked && i < 0) m.extra.push(el.value);
        if (!el.checked && i >= 0) m.extra.splice(i, 1);
        save();
      };
    });
    $('xMetaNote').oninput = function () { m.meta.note = this.value; save(); };
    $('xToolsNote').oninput = function () { m.tools.note = this.value; save(); };
    $('xExtraNote').oninput = function () { m.extraNote = this.value; save(); };

    $('xMapGo').onclick = function () {
      var ready = C.skills.every(function (s) {
        return m.rel[s.code] && m.pair[s.code] && m.pair[s.code].verdict;
      });
      if (!ready) { $('xMapErr').style.display = ''; return; }
      S.finishedAt = new Date().toISOString();
      save(true);
      go('done');
    };
  };

  // --- финиш ----------------------------------------------------------------

  screens.done = function () {
    var configured = window.imp && window.imp.expertApiConfigured && window.imp.expertApiConfigured();
    var queued = 0;
    try { queued = (JSON.parse(localStorage.getItem('imp_expert_queue') || '[]') || []).length; } catch (e) {}
    var unsent = !configured || queued > 0;
    // Серого текста — одна строка. Здесь стояло ещё два абзаца: объяснение,
    // почему не показываем правильные ответы, и рассказ о том, что мы будем
    // делать со сводкой. Оба про нас, а не про человека, который отдал час и
    // хочет знать одно: дошло или нет. Заголовок и благодарность остаются —
    // это не объяснение, а нормальный конец разговора.
    return '<div class="xnarrow"><p class="kicker">Готово</p>' +
      '<h1>Спасибо</h1>' +
      '<p class="section-lead">Ваши ответы записаны.</p>' +
      '<p class="xbadge">Ваш номер <b>' + esc(S.id) + '</b></p>' +
      (unsent
        ? '<p class="xwarn">Отправка на сервер не подтверждена — ответы сохранены только в этом ' +
          'браузере. Скачайте файл и пришлите его нам, чтобы работа не пропала.</p>' +
          '<button class="btn btn-primary" id="xDl">Скачать ответы файлом</button>'
        : '') +
      '</div>';
  };
  screens.done.after = function () {
    if (!$('xDl')) return;
    $('xDl').onclick = function () {
      var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'expert-' + S.id + '-' + S.corpus + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    };
  };

  // ------------------------------------------------------------------ запуск

  function begin(id) {
    S = load(id) || blank(id);
    try { localStorage.setItem('imp_expert_last', id); } catch (e) {}
    // Номер живёт в адресе: закладка на эту ссылку возвращает эксперта в свой
    // разбор, а не в чужой и не в новый.
    history.replaceState(null, '', location.pathname + '?e=' + encodeURIComponent(id));
    buildDecks();
    save();
    render();
  }

  function boot(corpus) {
    indexCorpus(corpus);
    host = $('xHost');

    var status = $('xSync');
    if (status && window.imp && window.imp.onExpertSync) {
      window.imp.onExpertSync(function (s) {
        status.textContent = !s.configured ? ''
          : (s.failed ? 'не отправлено: ' + s.failed
            : (s.pending ? 'сохраняю…' : (s.lastOkAt ? 'сохранено' : '')));
      });
    }

    var restart = $('xRestart');
    if (restart) {
      restart.style.display = '';
      restart.onclick = function () {
        var done = S ? Object.keys(S.attr || {}).length : 0;
        if (!window.confirm(
          'Начать разбор заново, с новым номером?\n\n' +
          'Ответы на этом компьютере будут стёрты' + (done ? ' (сейчас их ' + done + ')' : '') + '. ' +
          'Строка с прежним номером останется на сервере — её удаляем мы, не вы.')) return;
        try {
          if (S) localStorage.removeItem(KEY(S.id));
          localStorage.removeItem('imp_expert_last');
          localStorage.removeItem('imp_expert_queue');
        } catch (e) {}
        // Через адрес, а не begin(): перезагрузка гарантирует, что от прежнего
        // разбора не осталось ничего — ни колод, ни таймеров, ни состояния.
        location.search = '?new=1';
      };
    }

    var params = new URLSearchParams(location.search);
    // ?new=1 — принудительно новый номер. Нужен и как выход из чужого разбора,
    // и как способ проверить экран с нуля, не чистя данные сайта руками.
    if (params.get('new')) {
      history.replaceState(null, '', location.pathname);
      begin(newId());
      return;
    }
    var asked = (params.get('e') || '').trim();
    var last = '';
    try { last = localStorage.getItem('imp_expert_last') || ''; } catch (e) {}
    var id = asked || last;

    if (!id) { begin(newId()); return; }
    if (load(id)) { begin(id); return; }

    // Номер есть, а записи в этом браузере нет — эксперт пересел за другой
    // компьютер. Спрашиваем бэкенд; если его нет или номер там неизвестен,
    // молча начинать заново нельзя: человек считает, что продолжает.
    host.innerHTML = '<div class="xnarrow"><p class="section-lead">Ищу разбор №' + esc(id) + '…</p></div>';
    var lookup = (window.imp && window.imp.loadExpert)
      ? window.imp.loadExpert(id) : Promise.resolve(null);
    lookup.then(function (found) {
      if (found && found.corpus === C.version) {
        try { localStorage.setItem(KEY(id), JSON.stringify(found)); } catch (e) {}
        var name = ((found.who && found.who.first) || '') + ' ' + ((found.who && found.who.last) || '');
        // ⚠ ЧЬЁ ЭТО. Номеров всего 900, и двое экспертов могут получить один и
        // тот же — браузеры друг о друге не знают. Молча открыть чужой разбор
        // значит дать одному писать поверх другого, и заметят это только в
        // сводке, где под одним номером окажутся два разных человека. Поэтому
        // имя показывается до продолжения.
        if (name.trim()) {
          host.innerHTML = '<div class="xnarrow"><p class="kicker">Разбор №' + esc(id) + '</p>' +
            '<h2>Продолжаем разбор: ' + esc(name.trim()) + '</h2>' +
            '<p class="section-lead">Отвечено карточек: ' + Object.keys(found.attr || {}).length + ' из 50.</p>' +
            '<div class="xextras"><button class="btn btn-primary" id="xMine">Это я, продолжить →</button>' +
            '<button class="btn btn-ghost btn-sm" id="xNotMine">Это не я</button></div></div>';
          $('xMine').onclick = function () { begin(id); };
          $('xNotMine').onclick = function () {
            try { localStorage.removeItem(KEY(id)); } catch (e) {}
            begin(newId());
          };
          return;
        }
        begin(id);
        return;
      }
      var fresh = newId();
      host.innerHTML = '<div class="xnarrow">' +
        '<p class="kicker">Номер не найден</p><h2>Разбора №' + esc(id) + ' здесь нет</h2>' +
        '<p class="section-lead">' + (found ? 'Он относится к другой версии описаний и продолжен быть не может.'
          : 'Либо номер записан с ошибкой, либо разбор начинали на другом компьютере, а ответы ' +
            'сохранились только там. Проверьте номер — или начните заново, получив новый.') + '</p>' +
        '<div class="xgrid2">' +
        '<div class="field"><label for="xTry">Ввести номер ещё раз</label>' +
        '<input type="text" id="xTry" inputmode="numeric" maxlength="5" value="' + esc(id) + '" /></div></div>' +
        '<div class="xextras"><button class="btn btn-primary" id="xTryGo">Продолжить →</button>' +
        '<button class="btn btn-ghost btn-sm" id="xFresh">Начать заново, номер ' + esc(fresh) + '</button></div>' +
        '</div>';
      $('xTryGo').onclick = function () {
        var v = ($('xTry').value || '').trim();
        if (!v) return;
        location.search = '?e=' + encodeURIComponent(v);
      };
      $('xFresh').onclick = function () { begin(fresh); };
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.imp.expertLock($('xHost'), {
      title: 'Разбор описаний уровней',
      // Как устроен пароль — в js/expert-lock.js. Эксперту нужно его ввести,
      // а не узнать про наше шифрование.
      lead: 'Пароль вам прислали вместе со ссылкой.',
      hint: 'Если пароль не подходит, напишите нам — возможно, описания пересобрали, и пароль сменился.',
      onOpen: boot
    });
  });
})();

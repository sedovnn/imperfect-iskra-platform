/* ============================================================================
   ЯДРО ХАРНЕССА ПРОГОНА МОДЕЛИ — одна копия на страницу и на проверки.

   ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ (решение владельца 09.10). Логика пошагового прогона жила
   внутри frontend/harness.html, и вызвать её вне браузера было нельзя: проверка
   паритета читала код страницы регулярками, а не исполняла его, и фактическое сообщение
   модели не видела ни разу. Здесь — всё, что решает, ЧТО уходит модели и КАК читается её
   ответ: маршрут, ветвления, подстановки, сборка сообщения шага, приём ответа гейтом
   механики, тело заливки. Страница — только оформление: кнопки, поля, буфер, localStorage.
   Этот же файл грузит scripts/checks/lint_harness.js и проходит им день по всем веткам.

   ⚠ ПЕРЕНЕСЕНО БЕЗ ИЗМЕНЕНИЯ СОДЕРЖАНИЯ (09.10). Тексты функций и комментарии — из
   harness.html как были; сверено прогоном в Chromium по трём веткам дня: сообщения
   модели, записи прогона и тело заливки до и после переноса совпали байт в байт.

   Грузится после scenes.js, mechanics.js, mech-fields.js, case-text.js, case-ref.js.
   ============================================================================ */
(function () {
  window.imp = window.imp || {};

  var S = window.imp.scenes, M = window.imp.mechanics, F = window.imp.mechFields;
  var TITLES = window.imp.mechTitles, BACKLOG = window.imp.backlog, LIM = window.imp.backlogLimits;

  // Экранирование — то же, что давал браузер через textContent → innerHTML: &, <, > и
  // неразрывный пробел. Своё, строкой, чтобы node и страница собирали одно и то же.
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
  };
  var num = function (n) { return String(Math.round(Number(n) * 10) / 10).replace('.', ','); };

  var run = null, caseTextCache = null;
  // Что знает только страница: отмечен ли «новый чат». В node — выключатель проверки.
  var env = { fullAgain: function () { return false; } };

  function ctx() {
    return { isDemo: false, BACKLOG: BACKLOG, LIM: LIM, esc: esc, br: esc, num: num,
             blNum: window.imp.backlogNum, mech: function (k) { return run.mech[k]; } };
  }

  // Ветвления — тем же кодом, что у участника: перебор считает сама механика,
  // Северову решает id позиции из backlog.js.
  function applies(when) {
    if (!when) return true;
    // run.mech у неначатого прогона нет вовсе: `run && run.mech.list` падало на
    // `run.mech` ровно так же, как done() выше.
    var lm = run && run.mech && run.mech.list;
    if (!lm) return false;
    if (when === 'overspend') return !!M.list.sums(lm, ctx()).over;
    // Обмен условный с правки 5.1: нет отказов — шаг не играется. Модель получает тот же
    // день, что человек, иначе сравнивать нечего.
    if (when === 'refused') return refusedIds().length > 0;
    // Отложена ли выбранная заявка (правка 13.2) — от этого зависит редакция пузыря.
    if (when === 'refusedLater') {
      return window.imp.refusedOwnerIsLater(refusedSets(), listSumsOf(), LIM);
    }
    if (when === 'severova') {
      // Правило одно на всех — js/backlog.js. С 14.08 встреча у каждого, кто хоть
      // что-то отложил или отклонил, а не только у отказавших заявке №6. С правки 13.1
      // из кандидатов исключена заявка, на которой настояло правление.
      return window.imp.refusedTalkIds(refusedSets(), listSumsOf(), LIM).length > 0;
    }
    return true;
  }


  // ---------- материалы ----------
  // Файл кейса читает страница (fetch) или проверка (с диска) — сюда приходит разметка.
  function setCaseHtml(html) {
    // ⚠ НЕ innerText. Он выбрасывает границы ячеек, и семь таблиц приложений
    // превращались в склеенные числа: «%911131518212326» вместо «9 | 11 | 13 |
    // 15 | 18 | 21 | 23 | 26». Общий переводчик из js/case-text.js работает со
    // строкой, поэтому node и браузер отдают модели побайтово одно и то же.
    caseTextCache = window.imp.caseToText(html);
    if (!caseTextCache) throw new Error('в ' + S.caseSrc + ' нет #caseContent');
    return caseTextCache;
  }

  function cheatsheet() {
    var c = window.imp.caseCheatsheet || {};
    var pair = function (a) { return (a || []).map(function (x) { return '· ' + x[0] + ' — ' + x[1]; }).join('\n'); };
    return 'Кто есть кто:\n' + pair(c.people) + '\n\nЧто есть что:\n' + pair(c.things);
  }

  // Материал рабочей области и пересказ разбора — из js/mech-fields.js, общие
  // со скриптом прогона. Здесь только вызов.
  var helpers = function () { return { num: num, ctx: ctx }; };
  function material(mech, beat) { return window.imp.mechMaterial(mech, run, helpers(), beat); }

  // ---------- маршрут ----------
  function steps() {
    var out = [];
    S.route().forEach(function (r) {
      var a = r.act;
      if (a.kind === 'window' || a.kind === 'mechanic') {
        out.push({ key: a.save, mech: a.kind === 'mechanic' ? a.mech : null,
                   when: a.when || '', unless: a.unless || '',
                   label: a.kind === 'mechanic' ? (TITLES[a.mech] || a.mech) : (a.label || a.save),
                   scene: r.scene.name, ix: r.sceneIx, actIx: r.actIx });
      }
    });
    return out;
  }
  var STEPS = steps();

  // Пока у разбора идёт такт счёта, шаг НЕ пройден: раскладка лежит черновиком, чтобы
  // харнесс мог посчитать по ней сумму и показать её модели.
  function done(s) {
    // ⚠ ПРОГОН МОЖЕТ БЫТЬ НЕ НАЧАТ (правка 21.08). Здесь читалось run.listStage без
    // проверки, и на пустой странице любое обращение к done() падало с «Cannot read
    // properties of null». Ронялся не только столбик шагов: кнопка «Принять и дальше»
    // зовёт current(), то есть done(), — обработчик умирал молча, и нажатие до начала
    // прогона не делало ВООБЩЕ ничего, без единого слова оператору.
    if (!run) return false;
    // ⚠ ТАКТА СЧЁТА БОЛЬШЕ НЕТ (решение владельца 11.09): счёт показывается вместе с
    // вопросом об основании, а не отдельным кругом, где модель второй раз присылала ту же
    // раскладку. Тактов два: раскладка и основание.
    if (s.mech === 'list' && run.listStage === 'why') return false;
    // ⚠ У ВАРИАНТОВ БУДУЩЕГО ТОЖЕ ДВА ТАКТА (правка 11.09). Пока не задан вопрос Лемеха,
    // шаг не пройден: у человека он звучит ПОСЛЕ того, как варианты записаны и отмечен
    // наиболее вероятный, и его редакция зависит от того, один вариант или несколько.
    if (s.mech === 'futures' && run.futuresStage === 'why') return false;
    // ⚠ ВТОРОГО ТАКТА У ВАРИАНТОВ БОЛЬШЕ НЕТ (правка 31.08). Три вопроса про основную
    // рекомендацию стали тремя шагами диалога в scenes.js ещё 28.08, а харнесс продолжал
    // спрашивать снятый такт формой formMain — и модель отвечала на один и тот же вопрос
    // дважды: сначала JSON-формой из трёх полей, потом теми же тремя окнами маршрута.
    // Поймано владельцем 31.08 на ручном прогоне.
    return s.mech ? run.mech[s.mech] !== undefined : run.answers[s.key] !== undefined;
  }
  // Какой такт сейчас идёт и спрашивается ли он обычным текстом. Одно место на обе
  // стороны страницы: и на сборку вопроса, и на разбор ответа — иначе спросят текстом,
  // а разберут как JSON, и мы вернёмся к тому же классу поломок.
  function plainKeyOf(step, run) {
    if (!step || !step.mech || !run || !window.imp.mechPlain) return null;
    var key = null;
    if (step.mech === 'list' && run.listStage === 'why') key = 'formWhy';
    if (step.mech === 'futures' && run.futuresStage === 'why') {
      // Редакция ключа идёт за редакцией вопроса: несколько вариантов — одна, один — другая.
      var fuP = run.mech.futures || {};
      key = ((fuP.cards || []).filter(function (t) { return String(t || '').trim(); }).length > 1)
        ? 'formWhy' : 'formWhyOne';
    }
    if (step.mech === 'seal') {
      key = (run.sealStage === 'phrase') ? 'formPhrase' : (run.sealBack ? 'formHeld' : 'form');
    }
    return (key && window.imp.mechPlain.is(step.mech, key)) ? key : null;
  }

  // ⚠ `unless` — ТО ЖЕ УСЛОВИЕ НАОБОРОТ, И ХАРНЕСС ЕГО НЕ ЗНАЛ (правка 21.08).
  // В сценах на нём разведён вопрос про плату: перебравшему Агеев говорит про
  // превышение (`when: 'overspend'`), уложившемуся — про состав решений
  // (`unless: 'overspend'`). Проверялся только `when`, поэтому реплика с `unless`
  // проходила ВСЕГДА — и модель слышала ОБА вопроса там, где человек слышит один.
  // Устроено так же, как в движке (engine.js, applies): отрицание того же счёта, а не
  // второе независимое условие, — два условия рано или поздно разъедутся.
  function actApplies(a) {
    if (!a) return true;
    // when и unless вместе — как в движке (решение владельца 03.10).
    if (a.unless && applies(a.unless)) return false;
    return a.when ? applies(a.when) : true;
  }
  // Условие у отдельного пузыря — та же проверка, что у акта (правка 13.2).
  // ⚠ ПРИДЕРЖАННЫЕ ПУЗЫРИ СЮДА НЕ ПОПАДАЮТ. Пузырь с меткой beat приезжает не с
  // историей, а со своим тактом (см. heldBetween ниже и S.bubbleBeat в scenes.js).
  var bubbleOk = function (b) { return !S.bubbleBeat(b) && actApplies(b); };
  var heldOk = function (name) {
    return function (b) { return S.bubbleBeat(b) === name && actApplies(b); };
  };
  function skipped(s) { return !actApplies(s); }
  function current() {
    for (var i = 0; i < STEPS.length; i++) if (!done(STEPS[i]) && !skipped(STEPS[i])) return i;
    return -1;
  }

  // Реплики, произнесённые МЕЖДУ прошлым шагом и этим. Раньше на каждом шаге
  // уезжало всё сказанное с начала дня — но вы вставляете текст в ТОТ ЖЕ чат, где
  // модель это уже слышала: пересказ заставлял платить за одно и то же двенадцать
  // раз и путал модель дублями (замечание владельца 11.08). Скрипту прогона
  // история нужна — там каждый вызов к API без памяти, — а чату нет.
  // Подстановки маршрута: {name} и единственная числовая пара {people}/{money} —
  // тот же счётчик, который человек видит на экране разбора.
  // Кого модель встретит на выходе. Сбор отказов здесь, правило выбора — в
  // js/backlog.js, тот же вызов, что у движка страницы.
  function refusedIds() {
    var lm = run && run.mech && run.mech.list;
    if (!lm || !lm.decided) return [];
    var ids = [];
    Object.keys(lm.decided).forEach(function (k) {
      var d = lm.decided[k];
      if (d === 'later' || d === 'never') ids.push(String(k).replace(/^a/, ''));
    });
    return ids;
  }
  // Раскладка целиком: правилу выбора собеседника нужны все три стопки (правка 13.1).
  function refusedSets() {
    var lm = run && run.mech && run.mech.list;
    var out = { taken: [], later: [], never: [] };
    if (!lm || !lm.decided) return out;
    Object.keys(lm.decided).forEach(function (k) {
      var d = lm.decided[k], id = String(k).replace(/^a/, '');
      if (d === 'take') out.taken.push(id);
      else if (d === 'later') out.later.push(id);
      else if (d === 'never') out.never.push(id);
    });
    return out;
  }
  function listSumsOf() {
    var lm = run && run.mech && run.mech.list;
    return lm ? M.list.sums(lm, ctx()) : null;
  }
  function refusedPick() { return window.imp.refusedOwner(refusedSets(), listSumsOf(), LIM); }

  // ⚠ ПОДСТАНОВКИ — ВСЕ, КАКИЕ ЕСТЬ В СЦЕНАХ (правка 21.08). Здесь стояли {name},
  // {who}, {title}, {whoName}, {people} и {money} — и не было {over} и {futureRef},
  // которые появились в сценах 19.08. Модель получала реплику Агеева буквально: «Так.
  // Подождите. У вас получилось {over}» — с фигурными скобками, — а человек в этом же
  // месте читает названное превышение. {people} и {money} в сценах больше не
  // встречаются, но приём их оставлен: записи прежних прогонов их несут.
  // Сам расчёт {over} и {futureRef} — в js/mech-fields.js, общий с экраном: реплика с
  // подстановкой это вопрос, и считать его двумя кодами значит спросить разное.
  function sub(t) {
    var lm = run.mech.list, tt = lm ? M.list.sums(lm, ctx()) : null;
    var pk = window.imp.refusedParts(refusedSets(), tt, LIM);
    var SF = window.imp.subFacts;
    var out = String(t == null ? '' : t).split('{name}').join(run.tag)
      .split('{whoName}').join(pk.whoName)
      .split('{who}').join(pk.who)
      .split('{title}').join(pk.title)
      .replace('{people}', tt ? String(tt.people) : '')
      .replace('{money}', tt ? num(tt.money) : '')
      .split('{а}').join(pk.she ? 'а' : '');
    if (out.indexOf('{over}') >= 0) out = out.split('{over}').join(SF.over(tt, LIM, SF.plural, num));
    if (out.indexOf('{futureRef}') >= 0) out = out.split('{futureRef}').join(SF.futureRef(run.mech.futures));
    // Заявка, на которой настаивает правление (26.08) — выбор общий с экраном.
    if (out.indexOf('{forcedTitle}') >= 0 || out.indexOf('{forcedCost}') >= 0) {
      // Харнесс модели — не демо никогда: заглушка витрины здесь включаться не должна.
      var fp = window.imp.forcedParts(refusedIds(), tt, LIM, num, SF.plural, false);
      out = out.split('{forcedTitle}').join(fp.title).split('{forcedCost}').join(fp.cost);
    }
    return out;
  }

  // Реплики, произнесённые МЕЖДУ прошлым шагом и этим. Раньше на каждом шаге
  // уезжало всё сказанное с начала дня — но вы вставляете текст в ТОТ ЖЕ чат, где
  // модель это уже слышала: пересказ заставлял платить за одно и то же двенадцать
  // раз и путал модель дублями (замечание владельца 11.08). Скрипту прогона
  // история нужна — там каждый вызов к API без памяти, — а чату нет.
  //
  // ⚠ ЗАБИРАЕМ И `after`: это то, что персонаж говорит ПОСЛЕ фиксации шага, и
  // человек слышит его перед следующим. Раньше брались только bubbles, и модель не
  // слышала ни «Штерн пишет, что ждёт вас», ни прощаний — то есть переходов дня.
  function heardBetween(fromStep, toStep) {
    var out = [];
    var after = function (r) {
      if (!fromStep) return true;
      return r.sceneIx > fromStep.ix || (r.sceneIx === fromStep.ix && r.actIx >= fromStep.actIx);
    };
    S.route().forEach(function (r) {
      if (r.sceneIx > toStep.ix || (r.sceneIx === toStep.ix && r.actIx >= toStep.actIx)) return;
      if (!after(r)) return;
      var a = r.act;
      if (!actApplies(a)) return;
      var mine = !fromStep || r.sceneIx > fromStep.ix || r.actIx > fromStep.actIx;
      // У самого прошлого шага берём только `after` — его bubbles модель уже слышала.
      if (mine) S.speechLines(a, 'bubbles', bubbleOk).forEach(function (l) { out.push(sub(l)); });
      S.speechLines(a, 'after', bubbleOk).forEach(function (l) { out.push(sub(l)); });
    });
    return out;
  }

  // Придержанные реплики того же отрезка маршрута — тем же обходом, что и история,
  // только фильтр обратный. Отдаются ровно на своём такте.
  function heldBetween(fromStep, toStep, name) {
    var out = [], ok = heldOk(name);
    var after = function (r) {
      if (!fromStep) return true;
      return r.sceneIx > fromStep.ix || (r.sceneIx === fromStep.ix && r.actIx >= fromStep.actIx);
    };
    S.route().forEach(function (r) {
      if (r.sceneIx > toStep.ix || (r.sceneIx === toStep.ix && r.actIx >= toStep.actIx)) return;
      if (!after(r)) return;
      if (!actApplies(r.act)) return;
      S.speechLines(r.act, 'bubbles', ok).forEach(function (l) { out.push(sub(l)); });
    });
    return out;
  }

  function fullAgain() { return !!env.fullAgain(); }

  function promptFor(step, ix) {
    // Откуда вести разговор: от прошлого СПРОШЕННОГО шага. «Всё сначала» — для
    // нового чата, когда прежний оборвался.
    var from = null;
    if (!fullAgain()) {
      for (var i = ix - 1; i >= 0; i--) { if (!skipped(STEPS[i])) { from = STEPS[i]; break; } }
    }
    // На ВТОРОМ такте одного и того же шага услышанное не повторяется: модель
    // получила эти реплики такт назад, в том же чате. Раньше повторялось — тот же
    // дубль, на который владелец указал 11.08 («зачем в каждом сообщении
    // пересказывается всё что было до»).
    // Второй такт остался только у печати: у разбора заявок такта пересчёта больше нет.
    // ⚠ УСЛЫШАННОЕ НЕ ПОВТОРЯЕТСЯ, если шаг спрашивается ВТОРОЙ РАЗ в том же чате.
    // Два таких случая, и оба на одном экране Агеева:
    //   · второй такт печати — модель получила реплики такт назад;
    //   · ВОЗВРАТ К РАЗБОРУ ЗАЯВОК (добавлено 13.08) — сюда правило не распространялось,
    //     и монолог Агеева про 500 человек и 22 миллиарда уезжал второй раз целиком.
    // У человека это прямо запрограммировано: engine.js, jumpBackTo помечает шаг как
    // уже начатый — «монолог участник слушал, и заставлять слушать заново значит гонять
    // его по кругу». Возвращаясь, человек видит СВОИ двадцать карточек, а не речь снова.
    // Сами карточки остаются: человек на возврате смотрит именно на них.
    // ⚠ ВАРИАНТОВ БУДУЩЕГО ЗДЕСЬ НЕ БЫЛО (правка 14.09, поймано владельцем: «Шаг 10 из 19
    // зачем-то модели показывает предыдущий монолог агеева лемеха, которые вообще не
    // актуальны в рамках задаваемого вопроса»). Второй такт вариантов я завёл 11.09, а в
    // этот список не вписал — и на такте вопроса Лемеха модель получала всю историю
    // заново, вторым отправлением того же самого. Правило одно на все многотактные
    // верстаки: на втором такте услышанное не повторяется, потому что оно прозвучало
    // такт назад в ТОМ ЖЕ чате. Список обязан перечислять все такты; проверку на это
    // держит lint_harness.js.
    var again = (step.mech === 'seal' && run.sealStage === 'phrase') ||
                (step.mech === 'list' && run.sealBack && run.sealBack.prev) ||
                (step.mech === 'list' && run.listStage === 'why') ||
                (step.mech === 'futures' && run.futuresStage === 'why');
    var heard = again ? [] : heardBetween(from, step);

    // ⚠ НИ ОДНОГО СВОЕГО СЛОВА СВЕРХ ЭКРАНА. Раньше здесь стояли «РАБОЧАЯ ОБЛАСТЬ»,
    // «ПОЛЕ ОТВЕТА» и «СПРАВКА (опора, не подсказка)» — наша служебная лексика,
    // которой человек не видит, а последняя ещё и сообщала модели, что мы боимся
    // подсказать. Осталось только то, что читает человек: реплики, подпись поля,
    // подписи полей рабочей области.
    // Речь вокруг рабочей области — вся, как у человека: before над ней, lead
    // строкой-указателем, probe внутри (после действия), ask под ней.
    var act = null;
    S.route().forEach(function (r) { if (r.sceneIx === step.ix && r.actIx === step.actIx) act = r.act; });
    // Пузыри с условием (правка 13.2) отдаются модели по той же ветке, что видит человек.
    var say2 = function (field) { return act ? S.speechLines(act, field, bubbleOk).map(sub) : []; };

    var body;
    if (step.mech) {
      var f = F[step.mech];
      // Блок правления в листе печати — только в первом такте, как у человека (правка 6.3).
      var boardHere = (step.mech === 'seal' && run.sealStage !== 'phrase') ? S.boardLines(act) : [];
      // probeAsk — вопросы второго такта, которые человек видит свёрнутыми над формой.
      // Модели отдаём их теми же словами: свернуть у неё нечего, а вопрос обязан прозвучать.
      var form = f.form, probe = say2('probe').concat(say2('probeAsk')), ask = say2('ask'),
          head = say2('before').concat(boardHere).concat(say2('lead'));
      var beat = null;
      // ⚠ ВОЗВРАТ К РАЗБОРУ: ФОРМА ПРИЕЗЖАЕТ ЗАПОЛНЕННОЙ, как поля на экране у человека.
      // Он видит свои решения и своё обоснование и правит то, что хочет; инструкция при
      // этом та же, что всегда, — никакого дополнительного вопроса не задаётся.
      if (step.mech === 'list' && run.sealBack && run.sealBack.prev) {
        form = window.imp.mechFilled ? window.imp.mechFilled('list', run.sealBack.prev) : form;
      }
      // ⚠ ТАКТ СЧЁТА. Список из двадцати заявок НЕ повторяем: модель получила его такт
      // назад в том же чате. Новое здесь — только сумма взятого, теми же словами, что
      // стоят над стопкой «Берём» у человека, и его же раскладка в полях.
      // Такт 2 — счёт и раскладка; такт 3 — одно поле основания. Ни списка заявок, ни
      // монолога: модель получила их такт назад в том же чате.
      var whyBeat = (step.mech === 'list' && run.listStage === 'why' && run.mech.list);
      var backBeat = (step.mech === 'list' && run.sealBack && run.sealBack.prev);
      if (whyBeat) {
        form = f.formWhy;
        beat = 'why';
        head = [];
        // Просьба Агеева про основание придержана с первого такта — её место здесь,
        // прямо над полем, которое её и спрашивает.
        ask = heldBetween(from, step, 'why');
      }
      // ⚠ ВАРИАНТЫ БУДУЩЕГО: ВОПРОС ЛЕМЕХА — ОТДЕЛЬНЫЙ ТАКТ (правка 11.09). На первом такте
      // его нет вовсе: у человека он появляется только после того, как варианты записаны.
      // На втором — та редакция, которую человек и увидел бы: probe, если вариантов
      // несколько, probeOne, если один. Выбор считается по принятому состоянию, тем же
      // правилом, что в mechanics.js (many = cards.length > 1).
      if (step.mech === 'futures') {
        if (run.futuresStage === 'why') {
          var fu = run.mech.futures || {};
          var manyFu = ((fu.cards || []).filter(function (t) { return String(t || '').trim(); }).length > 1);
          form = manyFu ? f.formWhy : f.formWhyOne;
          beat = 'why';
          head = [];
          ask = [];
          probe = manyFu ? say2('probe') : say2('probeOne');
        } else {
          probe = [];
        }
      }
      if (step.mech === 'seal') {
        if (run.sealStage === 'phrase') {
          // ⚠ ВТОРОЙ ТАКТ: экран заменяет всю область одной итоговой строкой и
          // задаёт вопрос. Ни before, ни ask здесь нет — «Ну что, с этим к ним
          // идти? Финализируем?» относится к выбору хода, который уже сделан
          // (mechanics.js: ask рисуется только при confirmed == null).
          form = f.formPhrase;
          beat = 'phrase';
          head = [];
          ask = [];
          // ⚠ ПО ФАКТУ ИЗМЕНЕНИЯ, А НЕ ВОЗВРАТА (как на экране): модель могла вернуться
          // к разбору и оставить его как был. Тогда вопрос тот же, что без возврата.
          probe = (run.sealBack && M.seal.changed({ returned: true, snap: run.sealBack.snap }, ctx()))
            ? say2('probeReturn') : say2('probe');
        } else {
          form = run.sealBack ? f.formHeld : f.form;
          probe = [];
        }
      }
      var mat = material(step.mech, whyBeat ? 'why' : beat);
      // Строку счёта собирает mech-fields.js — общий код с CLI-харнессом, чтобы не держать
      // две копии одной строки. Слово в слово как шапка стопки «Берём», без сравнения с
      // рамкой и без предупреждения: их человеку не показывают. С 11.09 она приходит на
      // такте основания, вместе с вопросом «почему именно такой состав».
      // На возврате человек видит и карточки, и счётчик над стопкой — значит и модель.
      // Счёт берём тем же общим кодом, только состояние подставляем прежнее: раскладка
      // из run.mech.list на возврате удалена, она лежит в run.sealBack.prev.
      if (backBeat) {
        mat = mat + window.imp.mechMaterial('list', { mech: { list: run.sealBack.prev } },
                                            helpers(), 'sum');
      }
      // ⚠ ИНСТРУКЦИЯ РАЗНАЯ У ПУСТОЙ И У ЗАПОЛНЕННОЙ ФОРМЫ (13.08).
      // «Верните ровно в этом виде» верно для пустого шаблона: речь о ФОРМЕ ответа.
      // Но на возврате к разбору форма приезжает заполненной прежним ответом — и та же
      // фраза читается буквально: «верните то же самое». Модель, которая только что
      // выбрала «возвращаюсь и меняю», получала указание ничего не менять. Поймано
      // владельцем; моя же правка от 12.08 (заполнять форму) осталась недоделанной,
      // потому что инструкцию рядом я не тронул.
      // Человеку этого текста не нужно: он ВИДИТ свои ответы в полях и правит их прямо
      // там. Для модели то же самое приходится сказать словами — это паритет, а не
      // подсказка сверх экрана.
      // ⚠ ТАКТ ИЗ ОДНОГО ПОЛЯ — ОБЫЧНЫМ ТЕКСТОМ (решение владельца 31.08). Скобки и
      // «верните ОДНИМ объектом» ради одного поля ничего не несут: у человека там просто
      // подписанное поле. Реестр и текст вопроса — общие с CLI-харнессом
      // (window.imp.mechPlain), чтобы формулировка не разошлась между двумя прогонами.
      var plainKey = plainKeyOf(step, run);
      var filledIn = (step.mech === 'list' && run.sealBack && run.sealBack.prev);
      var howTo = filledIn
        ? 'Ниже ваш прежний ответ — он стоит в полях, как вы его оставили. Поправьте в нём то, что решили, и верните ОДНИМ объектом JSON целиком — без пояснений до и после:\n'
        : 'Заполните и верните ОДНИМ объектом JSON, ровно в этом виде — без пояснений до и после:\n';
      body = (head.length ? head.join('\n') + '\n\n' : '') +
        mat.replace(/^\n\n/, '') + (mat ? '\n\n' : '') +
        (probe.length ? probe.join('\n') + '\n\n' : '') +
        (ask.length ? ask.join('\n') + '\n\n' : '') +
        (plainKey ? window.imp.mechPlain.ask(step.mech, plainKey)
                  : howTo + JSON.stringify(form, null, 1));
    } else if (act && Array.isArray(act.parts) && act.parts.length) {
      // ⚠ ОКНО НА НЕСКОЛЬКО ВОПРОСОВ СПРАШИВАЕТСЯ ФОРМОЙ (правка 21.08). На экране у
      // этого шага столько полей, сколько вопросов, и над каждым стоит его вопрос —
      // три вопроса Штерна. Прежде здесь стояло общее «Поле „Путь". Напишите ответ
      // обычным текстом»: модель отдавала один абзац, человек — размеченные части, и
      // судья получал по одному шагу разный материал. Ключи формы — те же вопросы,
      // склейку в ответ делает общий window.imp.winParts.
      body = (say2('lead').length ? say2('lead').join('\n') + '\n\n' : '') +
        'Заполните и верните ОДНИМ объектом JSON, ровно в этом виде — без пояснений до и после:\n' +
        JSON.stringify(window.imp.winParts.form(act), null, 1);
    } else {
      body = (say2('lead').length ? say2('lead').join('\n') + '\n\n' : '') +
        'Поле «' + step.label + '». Напишите ответ обычным текстом.';
    }

    // ⚠ НОВЫЙ ЧАТ ПОЛУЧАЕТ И ПРЕЖНИЕ ОТВЕТЫ (решение владельца 09.10). До этого в новый чат
    // уходили установка, кейс и реплики собеседников, но не то, что модель сама ответила и
    // выбрала: её история терялась молча, а у человека она всё время во вкладке «Мои ответы».
    // Блок собирается тем же кодом механик, которым рисуется вкладка (answerHtml), и только
    // из пройденного — будущих этапов в нём нет. В первом сообщении прогона он пуст.
    var mine = (run.sentSetup && fullAgain()) ? myAnswersText() : '';
    var pre = (run.sentSetup && !fullAgain()) ? ''
      : (S.briefForModel(run.tag) + '\n\nО компании\n' + (caseTextCache || '') +
         '\n\nСправка\n' + cheatsheet() + '\n\n' + (mine ? 'Мои ответы\n' + mine + '\n\n' : ''));
    return pre + (heard.length ? heard.join('\n') + '\n\n' : '') + body;
  }

  // ---------- «Мои ответы» для нового чата ----------
  // Как вкладка у человека (engine.js, answersHtml): лист на этап — место и время, внутри
  // шаги этапа своими названиями (подпись шага — только если шагов в этапе больше одного).
  // Верстак попадает сюда и черновиком такта, принятым раньше (раскладка до вопроса об
  // основании, варианты до вопроса Лемеха): человек в этот момент видит их на экране.
  function htmlText(html) {
    return window.imp.caseToText('<div id="caseContent">' + String(html || '') + '</div>') || '';
  }
  function myAnswersText() {
    var byScene = {}, order = [];
    var add = function (sc, title, body) {
      if (!byScene[sc.id]) { byScene[sc.id] = { sc: sc, parts: [] }; order.push(sc.id); }
      byScene[sc.id].parts.push({ title: String(title || ''), body: body });
    };
    S.windows().forEach(function (w) {
      if (w.mech) {
        var m = run.mech[w.mech], spec = M[w.mech];
        if (!m || !spec) return;
        add(w.scene, TITLES[w.mech] || w.mech,
            htmlText(spec.answerHtml ? spec.answerHtml(m, ctx()) : spec.locked(m, ctx())));
        return;
      }
      if (!run.answersAt[w.save]) return;
      var val = String(run.answers[w.save] || '').trim();
      add(w.scene, w.label, val || 'промолчали');
    });
    return order.map(function (k) {
      var g = byScene[k], sc = g.sc;
      return (sc.place || sc.name) + ' · ' + sc.where + '\n' + g.parts.map(function (x) {
        return (g.parts.length > 1 ? x.title.charAt(0).toUpperCase() + x.title.slice(1) + '\n' : '') + x.body;
      }).join('\n\n');
    }).join('\n\n');
  }

  // ---------- приём ответа ----------
  // Возвращает, что произошло, а не рисует: слова оператору и разметку собирает страница.
  // kind: not_started · finished · empty · json_error · parts_empty · read_error · gate ·
  //       seal_back · seal_confirmed · futures_beat · list_beat · accepted.
  // changed — состояние прогона изменилось (страница сохраняет и перерисовывает).
  function acceptInner(rawIn) {
    // Починка разбора называется вслух ВМЕСТЕ с приёмом шага: отдельную строку статуса
    // тут же затирает следующая, и оператор её не увидит. mended живёт на весь приём.
    var mended = '';
    if (!run) return { kind: 'not_started' };
    var cur = current();
    // ⚠ НА ЗАКОНЧЕННОМ ПРОГОНЕ ОБЪЯСНЯЕМ, А НЕ МОЛЧИМ (правка 21.08). Здесь стоял
    // пустой `return`: кнопка нажималась, вставленный текст никуда не шёл, и на экране
    // не менялось ничего — оператор не мог понять, принято или нет.
    if (cur < 0) return { kind: 'finished' };
    var s = STEPS[cur], raw = String(rawIn == null ? '' : rawIn).trim();
    if (!raw) return { kind: 'empty', step: s };

    // Установка и кейс считаются доставленными, как только принят первый шаг:
    // модель на него ответила, значит материалы получила. Прежде флаг поднимался
    // только кнопкой «Скопировать» — кто копирует выделением, получал кейс заново
    // на каждом шаге.
    run.sentSetup = true;

    if (!s.mech) {
      // ⚠ ОКНО НА НЕСКОЛЬКО ВОПРОСОВ ЧИТАЕТСЯ ФОРМОЙ. Спрашивали JSON — значит и
      // разбираем JSON, и складываем в ту же одну строку, что сохраняет экран: вопрос,
      // под ним ответ. Иначе под ключом ответа лежал бы сырой JSON, и судья читал бы
      // фигурные скобки вместо ответа участника.
      var wAct = null;
      S.route().forEach(function (r) { if (r.sceneIx === s.ix && r.actIx === s.actIx) wAct = r.act; });
      if (wAct && Array.isArray(wAct.parts) && wAct.parts.length) {
        // Тот же общий читатель, что у верстаков: окно на три вопроса Штерна тоже
        // спрашивается формой, и кавычки внутри ответа ломают его ровно так же.
        var wRead = window.imp.readJson(raw), wObj;
        if (!wRead.obj) return { kind: 'json_error', step: s, error: wRead.error, at: wRead.at, parts: true };
        wObj = wRead.obj;
        if (wRead.repaired) mended = wRead.repaired;
        var joined = window.imp.winParts.toText(wAct, wObj);
        if (!String(joined).trim()) {
          return { kind: 'parts_empty', step: s,
                   questions: wAct.parts.map(function (p) { return '«' + p.q + '»'; }).join(', ') };
        }
        run.answers[s.key] = joined;
        run.answersAt[s.key] = new Date().toISOString();
        return { kind: 'accepted', step: s, changed: true, mended: mended };
      }
      run.answers[s.key] = raw;
      run.answersAt[s.key] = new Date().toISOString();
      return { kind: 'accepted', step: s, changed: true, mended: mended };
    }

    var obj;
    // Такт из одного поля: ответ приходит текстом и заворачивается под ту же подпись,
    // какой его спросили, — дальше его читает прежний парный читатель.
    var plainNow = plainKeyOf(s, run);
    if (plainNow) {
      obj = window.imp.mechPlain.wrap(s.mech, plainNow, raw);
    } else {
      // ⚠ РАЗБОР ОБЩИЙ С CLI-ХАРНЕССОМ (правка 31.08). Здесь стоял свой JSON.parse и общая
      // жалоба «начните с „{"» — на ответе, где структура верна, а внутри значения стоят
      // прямые кавычки, оператор видел только «Unrecognized token „о"» и не понимал, что
      // чинить. Общий читатель поправляет ровно эту ошибку, говорит о починке вслух и при
      // неудаче показывает кусок, на котором сломалось.
      var read = window.imp.readJson(raw);
      if (!read.obj) return { kind: 'json_error', step: s, error: read.error, at: read.at, parts: false };
      obj = read.obj;
      if (read.repaired) mended = read.repaired;
    }
    var f = F[s.mech];

    // ⚠ ПЕЧАТЬ: ХОД МОДЕЛИ ИСПОЛНЯЕТСЯ, А НЕ ЗАПИСЫВАЕТСЯ ГАЛОЧКОЙ. Человек,
    // нажавший «← Вернуться и изменить», попадает обратно в разбор заявок и правит
    // его; слепок снимается ДО правки, иначе «изменил под давлением» и «удержал»
    // не различить. Прежде модель отвечала «вернуться: да», а харнесс шёл дальше —
    // к Лемеху (поймано владельцем 11.08 на живом прогоне).
    if (s.mech === 'seal' && run.sealStage !== 'phrase') {
      if (f.isBack(obj) && !run.sealBack) {
        // ⚠ ПРЕЖНИЙ ОТВЕТ СОХРАНЯЕМ. На экране человек, вернувшийся к разбору, видит свои
        // решения и свой текст «почему именно так» УЖЕ В ПОЛЯХ — он правит то, что хочет,
        // а не набирает заново. Модели же уезжала пустая форма, и её приходилось заполнять
        // с нуля, включая обоснование, которого у человека повторно не спрашивают
        // (замечание владельца 12.08).
        run.sealBack = { returned: true, snap: M.seal.snap(ctx()), prev: run.mech.list };
        delete run.mech.list;          // разбор снова становится текущим шагом
        delete run.mechAt.list;
        return { kind: 'seal_back', step: s, changed: true, mended: mended };
      }
      // Подтвердила — открывается второй такт, одна фраза.
      run.sealStage = 'phrase';
      return { kind: 'seal_confirmed', step: s, changed: true, mended: mended };
    }

    // Перевод ответа модели в состояние механики: она отвечает подписями с экрана
    // («решения», «№5», «берём»), состояние держит свои ключи (decided, a6, take).
    // ⚠ ОТДЕЛЬНЫЙ ЧИТАТЕЛЬ ВТОРОГО ТАКТА СНЯТ ВМЕСТЕ С ТАКТОМ (31.08). Он появился
    // 21.08, когда харнесс спрашивал формой formMain, а разбирал ответ как веер: rays
    // оставались пусты, гейт требовал «хотя бы одну рекомендацию с непустой сутью», и шаг
    // вставал насмерть. Такта больше нет — веер разбирается одним читателем, как все
    // остальные верстаки.
    // ⚠ ТАКТ 3 РАЗБОРА ЧИТАЕТСЯ СВОИМ ЧИТАТЕЛЕМ (правка 31.08, находка владельца). Форму
    // такта спрашивают подписью с экрана — «Почему вы выбрали именно такой состав?», — а
    // читали общим `toState`, который знает только прежнее написание «Почему именно так»
    // (до правки 4.3). Критерии приходили пустыми, и гейт отвечал «Критерии обязательны:
    // на чём стоит этот выбор» на ответ, где они написаны. Шаг было не пройти в принципе:
    // модель отвечает ровно тем ключом, который у неё спросили. Тот же класс дефекта, что
    // 21.08 у вариантов: спрашивают одной формой, читают чужим читателем.
    // ⚠ ВТОРОЙ ТАКТ ВАРИАНТОВ БУДУЩЕГО — ТОТ ЖЕ СЛУЧАЙ (правка 07.10, прогон примеров L5).
    // Ответ на «Почему именно этот вариант — наиболее вероятный?» читал общий `toState`, который
    // этой подписи не знает: текст пропадал, и ниже `whyToState` получал уже пустое состояние.
    // Пусто было у всех десяти прогонов моделей в листе, а бэкенд отдаёт этот ответ судье МК.
    var whyBeat = (s.mech === 'list' && run.listStage === 'why') ||
                  (s.mech === 'futures' && run.futuresStage === 'why');
    try {
      obj = (s.mech === 'seal') ? f.toState(obj, run.sealBack, ctx())
          : whyBeat ? f.whyToState(obj)
          : f.toState(obj);
    }
    catch (e) {
      return { kind: 'read_error', step: s, error: e.message, mended: mended };
    }
    // ⚠ СЛИЯНИЕ ВЕЕРА С ОТВЕТОМ ВТОРОГО ТАКТА СНЯТО ВМЕСТЕ С ТАКТОМ (31.08). Оно брало веер
    // из черновика, принятого такт назад, и подмешивало к нему основную рекомендацию. Такта
    // нет — веер приходит одним ответом целиком.
    // ⚠ ПРЕЖНЕЕ ОСНОВАНИЕ ПЕРЕЖИВАЕТ ВОЗВРАТ. На возврате поля критериев модель не
    // получает — экран его скрывает, человеку даются только решения. Значит и в ответе
    // его нет, и toState вернул бы пустую строку, а гейт разбора требует непустые
    // критерии. У человека текст просто остаётся в состоянии шага; здесь переносим его
    // так же, из сохранённого прежнего ответа.
    // Источник прежнего текста два: на возврате — сохранённый ответ до печати, на такте
    // счёта — черновик раскладки, принятый такт назад. У человека в обоих случаях текст
    // просто остаётся в поле и не пропадает, если он его не тронул.
    if (s.mech === 'list' && !String(obj.criteria || '').trim()) {
      var prevCrit = (run.sealBack && run.sealBack.prev && run.sealBack.prev.criteria) ||
                     (run.mech.list && run.mech.list.criteria) || '';
      if (prevCrit) obj.criteria = String(prevCrit);
    }
    // ГЕЙТ САМОЙ МЕХАНИКИ — тот же, что держит человека.
    // ⚠ РАЗБОР ГЕЙТИТСЯ ПО ТАКТАМ, а не здесь: на тактах 1–2 критериев ещё не спрашивали,
    // и общий гейт рубил бы шаг сообщением «Критерии обязательны» до того, как модель до
    // них дойдёт. Ниже у разбора свои проверки: раскладка на тактах 1–2, всё целиком на
    // такте 3. Тот же гейт механики, просто в нужный момент.
    // ⚠ ВАРИАНТЫ БУДУЩЕГО ТОЖЕ ГЕЙТЯТСЯ ПО ТАКТАМ (починка 12.09, поймано владельцем на
    // прогоне). С 11.09 у верстака два такта, и на втором ответ модели — одно поле текста,
    // а не карточки. Общий гейт стоит ЗДЕСЬ, до разбора тактов, и честно отвечал «Нужна
    // хотя бы одна карточка» на ответ, в котором карточек и не должно быть. Та же беда,
    // что была у разбора заявок, и лечится так же: гейт вызывается в своей ветке ниже —
    // на такте 1 по принятым карточкам, на такте 2 по собранному состоянию.
    var fail = (s.mech === 'list' || s.mech === 'futures') ? '' : M[s.mech].gate(obj, ctx());
    if (fail) return { kind: 'gate', step: s, message: fail, mended: mended };
    // ⚠ ТРИ ТАКТА РАЗБОРА (последовательность владельца 14.08). Человек делает всё на
    // ОДНОМ экране: раскладывает карточки, видит сумму взятого живьём и пишет «Почему
    // именно так» — поле стоит под стопками всё время. В переписке одного экрана нет, и
    // порядок приходится задать:
    //   такт 1 — разложить (только решения);
    //   такт 2 — показать счёт и дать переложить (снова только решения: присланная
    //            раскладка и есть подтверждение, отдельного «подтверждаю» в переписке нет);
    //   такт 3 — написать «Почему именно так», когда сумма уже известна.
    //
    // ЗАЧЕМ СЧЁТ. На восьми прогонах ни один не уложился по людям (2,2×–4,1× рамки), а
    // 2001, 2002 и 2003 в своих же критериях ПИСАЛИ, что уложились — «Бюджет распределён
    // строго в лимитах (500 чел.)» при 1610. Модель складывала двадцать чисел в уме и
    // узнавала итог только у печати, когда список зафиксирован. ПР-1 мерила арифметику.
    //
    // ЗАЧЕМ КРИТЕРИИ ПОСЛЕДНИМИ. Прежде я спрашивал их на такте 1 — до того, как модель
    // узнала сумму, — и повторно на такте 2. Человек пишет их, уже видя итог, и один раз.
    //
    // Предупреждения о переборе в счёте НЕТ: человеку его намеренно не показывают, чтобы
    // выход за рамку оставался решением с аргументацией, а не запретом.
    // ⚠ НА ВОЗВРАТЕ ТАКТ ОДИН, И КРИТЕРИЕВ НЕ СПРАШИВАЮТ. У человека второй проход
    // короче первого: экран разбора БЕЗ поля критериев (mechanics.js прячет его), кнопка
    // «Продолжить →», и `onCta` сам ставит печати confirmed = true и прыгает на неё —
    // «человек возвращается к вопросу Агеева „Что поменяли и почему?", а не в монолог,
    // перебор и печать заново» (комментарий там же). То есть после правки заявок он
    // слышит СРАЗУ «Что решили изменить и почему?».
    // Модель же получала все три такта заново, включая основание, и вдобавок ещё раз
    // «Мой ход: подтверждаю» — два вопроса, которых человеку не задают.
    // ⚠ ВЕЕР ГЕЙТИТСЯ ОБЩИМ ПРАВИЛОМ (правка 31.08). Здесь стояли свой гейт веера и перевод
    // шага во второй такт. Такт снят 28.08 в самой механике — «верстак теперь ровно веер
    // альтернатив: записал — ответил — день пошёл дальше», — и эта ветка стала второй копией
    // того же гейта: общий гейт механики выше (M[s.mech].gate) держит веер так же, как держит
    // человека, и сообщение уходит модели тем же текстом.
    // ⚠ ВАРИАНТЫ БУДУЩЕГО: ПЕРВЫЙ ТАКТ ЗАКРЫВАЕТСЯ БЕЗ ОТВЕТА НА ВОПРОС (правка 11.09).
    // Модель прислала варианты и отметку наиболее вероятного — это ровно то, что человек
    // отправляет кнопкой. Дальше звучит вопрос Лемеха, и только его ответ закрывает шаг.
    // ⚠ ОТВЕТ УЖЕ РАЗОБРАН ВЫШЕ (правка 07.10). Здесь стоял второй `toState` поверх готового
    // состояния: номер «наиболее вероятного» он читал из индекса как из номера и сдвигал на один
    // назад — отмеченный №3 записывался №2, и Лемех спрашивал модель «если он сработал» не про
    // тот вариант. Так у прогонов 3GR9UZ, EKUAN3, XA6JZN цель описывала не отмеченный вариант.
    if (s.mech === 'futures' && run.futuresStage !== 'why') {
      var st = obj;
      var failFu = M.futures.gate(st, ctx());
      if (failFu) return { kind: 'gate', step: s, message: failFu, mended: mended };
      run.mech.futures = st;
      run.futuresStage = 'why';
      return { kind: 'futures_beat', step: s, changed: true, mended: mended };
    }
    if (s.mech === 'futures') {
      // Такт 2: ответ несёт одно поле, варианты берём из принятого черновика.
      var prevFu = run.mech.futures || {};
      var addFu = F.futures.whyToState(obj);
      obj = { cards: prevFu.cards || [], bet: prevFu.bet, asked: true, betWhy: addFu.betWhy };
      var failFu2 = M.futures.gate(obj, ctx());
      if (failFu2) return { kind: 'gate', step: s, message: failFu2, mended: mended };
    }
    var onReturn = (s.mech === 'list' && run.sealBack && run.sealBack.prev);
    if (s.mech === 'list' && !onReturn && run.listStage !== 'why') {
      // Гейт раскладки БЕЗ гейта критериев: их ещё не спрашивали. Пробный экземпляр с
      // непустым основанием проверяет «все размечены» и «взято хотя бы одно», но не
      // «критерии обязательны» — иначе шаг не пустил бы модель на такт 2.
      var probe = { decided: obj.decided, criteria: 'ещё не спрашивали', chosen: {}, obj: {} };
      var failList = M.list.gate(probe, ctx());
      if (failList) return { kind: 'gate', step: s, message: failList, mended: mended };
      run.mech.list = { decided: obj.decided, chosen: {}, obj: {},
                        criteria: (run.mech.list && run.mech.list.criteria) || '' };
      // Раскладка принята — сразу к основанию: счёт модель увидит вместе с вопросом.
      run.listStage = 'why';
      return { kind: 'list_beat', step: s, changed: true, mended: mended };
    }
    if (s.mech === 'list') {
      // На возврате ответ несёт только раскладку — основание берём прежнее, как остаётся
      // в поле у человека. На такте 3 наоборот: ответ несёт одно поле, раскладку берём из
      // черновика.
      obj = onReturn
        ? { decided: obj.decided, chosen: {}, obj: {},
            criteria: String(run.sealBack.prev.criteria || '') }
        : { decided: run.mech.list.decided, chosen: {}, obj: {},
            criteria: String(obj.criteria || run.mech.list.criteria || '') };
      var failWhy = M.list.gate(obj, ctx());
      if (failWhy) return { kind: 'gate', step: s, message: failWhy, mended: mended };
    }
    run.mech[s.mech] = obj;
    run.mechAt[s.mech] = new Date().toISOString();
    if (s.mech === 'seal') delete run.sealStage;
    if (s.mech === 'list') delete run.listStage;
    if (s.mech === 'futures') delete run.futuresStage;
    // ⚠ МЕТКУ ТАКТА ОБЯЗАТЕЛЬНО СНЯТЬ (правка 21.08). Здесь её не снимали, и шаг
    // рекомендаций не заканчивался никогда: done() отдельной строкой считает шаг
    // НЕ пройденным, пока идёт второй такт (variantsStage === 'main'), — а метка
    // оставалась висеть. Оператор нажимал «Принять и дальше», ответ записывался,
    // страница говорила «верстак зафиксирован» и рисовала тот же самый шаг заново:
    // со стороны это читается как «принимает что угодно и не переключается».
    // У печати и разбора такие же метки снимаются строками выше — эта была забыта.
    // Метка осталась только у прогонов, начатых до 31.08: чистим, чтобы такой прогон
    // доигрался нынешним маршрутом, а не встал на снятом такте.
    if (s.mech === 'variants') delete run.variantsStage;
    // ⚠ ПОСЛЕ ВОЗВРАТА ПЕЧАТЬ НЕ СПРАШИВАЕТ ХОД ЗАНОВО. У человека это делает сама
    // механика разбора: `onCta` ставит печати confirmed = true и прыгает на неё, поэтому
    // после правки заявок он слышит сразу «Что решили изменить и почему?». Модель же
    // получала ещё один такт «Мой ход: подтверждаю», которого человеку не задают.
    if (onReturn) { run.sealStage = 'phrase'; }
    // Разбор заявок пересказываем словами сразу после принятия: сырые ключи a1…a22
    // глазами не проверить, а ошибку модели надо увидеть до конца прогона.
    var recap = s.mech === 'list' ? window.imp.listRecap(obj, helpers()) : '';
    return { kind: 'accepted', step: s, changed: true, mended: mended, recap: recap };
  }

  // ---------- журнал прогона ----------
  // ⚠ ЗАЧЕМ (решение владельца 09.10). Прогон хранил только принятые ответы и метку: что
  // модель фактически получила, сколько было вставок, какие отклонены и с какими настройками
  // шёл прогон — не записывалось нигде. Сравнение людей и моделей без этого нельзя ни
  // проверить, ни повторить. Журнал пишет:
  //   · каждое сообщение модели целиком (один раз на отпечаток) — то, что стояло на экране;
  //   · каждую вставку оператора — сырой текст, такт, номер попытки, после чего она пришла и
  //     чем кончилась (принята / формат починен / не разобрана / не прошла проверку поля);
  //   · сбои ответа, которые видит только оператор (пустой, обрезанный, ошибка сервиса);
  //   · новый чат — событием;
  //   · условия прогона трёх родов: наблюдаемые (знает сам харнесс), заявленные оператором и
  //     неизвестные — последние перечислены явно, ничего не выдумывается.
  // Время в журнале — время оператора (показал, скопировал, вставил), а не время ответа
  // модели: в чате его не видно, и временем размышления человека оно не является.
  //
  // ⚠ ПОВТОР НЕ ПОДМЕНЯЕТ ОТВЕТ. Каждый полученный от модели ответ — отдельная попытка с
  // номером и причиной повтора; принятым считается последний, но прежние не стираются. Повтор
  // после ошибки формата помечается, изменилось ли содержание: в чате нельзя гарантировать,
  // что модель только поправила кавычки.

  // Версия ядра — ключ кэша, с которым страница его загрузила: lint_cache_keys.js не даст
  // изменить файл без подъёма ключа, значит версия меняется вместе с содержанием.
  var CORE_V = (function () {
    try {
      var cs = document.currentScript, m = cs && /harness-core\.js\?v=(\d+)/.exec(cs.src || '');
      return m ? 'harness-core.js?v=' + m[1] : 'harness-core.js (вне страницы)';
    } catch (e) { return 'harness-core.js (вне страницы)'; }
  })();

  // Отпечаток текста: FNV-1a с двумя затравками, 16 знаков. Не криптография — ссылка на
  // сообщение и признак того, что текст изменился.
  function fp(text) {
    var s = String(text == null ? '' : text), h1 = 0x811c9dc5, h2 = 0x050c5d1f;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
    }
    return ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-8);
  }
  function stamp() { return new Date().toISOString(); }

  // Условия, которые заявляет оператор. need — без них прогон не заливается.
  var DECLARED = [
    { key: 'provider', label: 'Провайдер', need: true },
    { key: 'model', label: 'Модель — как названа в интерфейсе', need: true },
    { key: 'modelId', label: 'Точный идентификатор модели, если виден' },
    { key: 'iface', label: 'Интерфейс', options: ['', 'веб-чат', 'приложение', 'API-песочница', 'другое'], need: true },
    { key: 'reasoning', label: 'Режим рассуждения', options: ['неизвестно', 'выключен', 'включён'] },
    { key: 'search', label: 'Поиск в интернете', options: ['неизвестно', 'выключен', 'включён'] },
    { key: 'tools', label: 'Файлы и другие инструменты', options: ['неизвестно', 'не использовались', 'использовались'] },
    { key: 'memory', label: 'Память и персонализация чата', options: ['неизвестно', 'выключены', 'включены'] },
    { key: 'regen', label: 'Перегенерация ответов', options: ['неизвестно', 'не использовалась', 'использовалась'] },
    { key: 'params', label: 'Параметры генерации, если видны' },
    { key: 'context', label: 'Окно контекста, если известно' }
  ];
  // Чего ручной харнесс не видит вовсе: в записи это «неизвестно», а не число.
  var UNKNOWN = [
    'токены запроса и ответа',
    'время ответа модели (записано только время оператора)',
    'внутренние повторы и отбор ответов у провайдера',
    'скрытая системная инструкция интерфейса',
    'параметры генерации, которых интерфейс не показывает'
  ];

  // ---------- условия сравнения ----------
  // Правила доступа к уточнениям, поиску и инструментам — одной записью на исследование
  // (владелец 09.10): у людей и моделей они обязаны быть одинаковыми. rule: null — людям это
  // не задано: заявленное оператором записывается, а различие показывается флагом.
  // ⚠ ПОИСК И ИНСТРУМЕНТЫ ЗАПРЕЩЕНЫ ОБОИМ (решение владельца 09.10, маршрут .102): человеку —
  // строкой общей инструкции (S.system.access), модели — та же строка и выключенные в интерфейсе
  // поиск и инструменты. Прогон с включёнными — несопоставим; «неизвестно» — отметкой.
  var STUDY = {
    id: 'люди и модели, с 09.10.2026',
    clarify: { rule: 'нельзя', source: '«Платформа не ведёт диалог — задать ей уточняющий вопрос не получится.» (установка)' },
    search: { rule: 'нельзя', source: '«Не пользуйтесь поиском в интернете — опирайтесь на материалы кейса и то, что знаете сами.» (установка, с .102)' },
    tools: { rule: 'нельзя', source: 'людям — «Отвечайте сами, без ИИ»; модели — выключены в интерфейсе (решение владельца 09.10)' }
  };

  // Сбои ответа, которые видит только оператор.
  var FAILURES = {
    empty: 'пустой ответ', cut: 'ответ обрезан', service: 'ошибка сервиса или интерфейса',
    refusal: 'модель отказалась отвечать', context: 'модель потеряла начало разговора', other: 'другое'
  };
  var STATUS = {
    accepted: 'принят', seal_back: 'принят: возврат к разбору', seal_confirmed: 'принят: ход',
    futures_beat: 'принят: варианты', list_beat: 'принят: раскладка',
    json_error: 'формат не разобран', parts_empty: 'поля пустые', read_error: 'не разобран',
    gate: 'не прошёл проверку поля'
  };
  var TAKEN = { accepted: 1, seal_back: 1, seal_confirmed: 1, futures_beat: 1, list_beat: 1 };
  var AFTER = { json_error: 'ошибка формата', parts_empty: 'ошибка формата', read_error: 'ошибка формата',
                gate: 'проверка поля' };

  function J() {
    if (!run) return null;
    if (!run.journal) {
      // Прогон, начатый до журнала (черновик или файл): прежние вставки уже не восстановить.
      run.journal = { v: 1, core: CORE_V, since: 'середина прогона', declared: {}, test: false,
                      prompts: {}, events: [] };
    }
    return run.journal;
  }
  function stepKeyOf(s) { return s ? (s.mech || s.key) : ''; }
  function beatOf(s) {
    if (!s || !run) return '';
    if (s.mech === 'list') return (run.sealBack && run.sealBack.prev) ? 'возврат'
      : (run.listStage === 'why' ? 'основание' : 'раскладка');
    if (s.mech === 'seal') return run.sealStage === 'phrase' ? 'фраза' : 'ход';
    if (s.mech === 'futures') return run.futuresStage === 'why' ? 'вопрос Лемеха' : 'варианты';
    return '';
  }
  // Содержание без оформления: буквы и цифры подряд. Для сверки «после ошибки формата
  // модель прислала то же самое или переписала».
  function words(t) { return String(t || '').toLowerCase().replace(/[^0-9a-zа-яё]+/g, ''); }
  function lastTry(step, beat) {
    var ev = (J() || { events: [] }).events;
    for (var i = ev.length - 1; i >= 0; i--) {
      var e = ev[i];
      if ((e.type === 'answer' || e.type === 'failure') && e.step === step && e.beat === beat) return e;
    }
    return null;
  }
  function triesOf(step, beat) {
    return (J() || { events: [] }).events.filter(function (e) {
      return (e.type === 'answer' || e.type === 'failure') && e.step === step && e.beat === beat;
    }).length;
  }

  // Сообщение, стоящее на экране, — в журнал. Один раз на отпечаток подряд: перерисовка
  // того же шага новым событием не считается.
  function noteShown(text) {
    var j = J(); if (!j) return '';
    var cur = current(); if (cur < 0) return '';
    var s = STEPS[cur], f = fp(text);
    if (!j.prompts[f]) j.prompts[f] = String(text);
    if (!j.shown || j.shown.fp !== f) {
      j.shown = { fp: f, step: stepKeyOf(s), beat: beatOf(s), full: fullAgain() };
      j.events.push({ type: 'shown', at: stamp(), step: j.shown.step, beat: j.shown.beat, fp: f,
                      chars: String(text).length, full: j.shown.full });
    }
    return f;
  }
  function noteCopied() {
    var j = J(); if (!j || !j.shown) return;
    j.events.push({ type: 'copy', at: stamp(), step: j.shown.step, beat: j.shown.beat, fp: j.shown.fp });
  }

  function accept(rawIn) {
    var cur = run ? current() : -1;
    var s = cur >= 0 ? STEPS[cur] : null;
    var key = stepKeyOf(s), beat = beatOf(s);
    var j = J(), shown = j && j.shown && j.shown.step === key && j.shown.beat === beat ? j.shown : null;
    var r = acceptInner(rawIn);
    // Пустая вставка — промах оператора, а не ответ модели: пустой ответ модели записывается
    // кнопкой «Сбой ответа».
    if (!j || r.kind === 'not_started' || r.kind === 'finished' || r.kind === 'empty') return r;
    var raw = String(rawIn == null ? '' : rawIn);
    var prev = lastTry(key, beat);
    var ev = { type: 'answer', at: stamp(), step: key, beat: beat, fp: shown ? shown.fp : '',
               attempt: triesOf(key, beat) + 1,
               after: !prev ? '' : (prev.type === 'failure' ? 'сбой ответа' : (AFTER[prev.kind] || '')),
               kind: r.kind, status: (STATUS[r.kind] || r.kind) + (r.mended ? ', формат починен' : ''),
               raw: raw, chars: raw.length };
    if (r.message || r.error) ev.message = r.message || r.error;
    if (r.mended) ev.mended = r.mended;
    if (prev && prev.type === 'answer' && ev.after === 'ошибка формата') ev.sameContent = words(prev.raw) === words(raw);
    j.events.push(ev);
    // Новый чат: сообщение ушло с установкой, кейсом и прежними ответами, и модель на него
    // ответила. Флажок на странице снимается — дальше снова только новое.
    if (shown && shown.full && TAKEN[r.kind] && j.events.some(function (e) {
      return e.type === 'answer' && e !== ev && TAKEN[e.kind];
    })) {
      j.events.push({ type: 'chat_restart', at: ev.at, step: key, beat: beat, fp: shown.fp });
      r.restarted = true;
    }
    r.logged = true;
    return r;
  }

  // Сбой ответа — модель ответила пусто, оборвалась, интерфейс выдал ошибку. Записывается
  // попыткой со статусом ошибки; шаг остаётся текущим, следующий ответ — следующая попытка.
  function noteFailure(reason, rawIn, note) {
    var j = J(); if (!j) return null;
    var cur = current(); if (cur < 0) return null;
    var s = STEPS[cur], key = stepKeyOf(s), beat = beatOf(s);
    var ev = { type: 'failure', at: stamp(), step: key, beat: beat, fp: j.shown ? j.shown.fp : '',
               attempt: triesOf(key, beat) + 1, reason: reason, what: FAILURES[reason] || String(reason),
               raw: String(rawIn || ''), note: String(note || '') };
    j.events.push(ev);
    return ev;
  }

  // Условия, заявленные оператором. Изменение после первого ответа — событием.
  function declare(values, test) {
    var j = J(); if (!j) return;
    var before = JSON.stringify([j.declared, !!j.test]);
    var d = {};
    DECLARED.forEach(function (x) {
      var v = String((values || {})[x.key] == null ? '' : values[x.key]).trim();
      if (v && v !== 'неизвестно') d[x.key] = v;
    });
    j.declared = d; j.test = !!test;
    if (JSON.stringify([j.declared, j.test]) !== before &&
        j.events.some(function (e) { return e.type === 'answer'; })) {
      j.events.push({ type: 'declared', at: stamp(), declared: d, test: j.test });
    }
  }
  function declaredMissing() {
    var d = (J() || {}).declared || {};
    return DECLARED.filter(function (x) { return x.need && !String(d[x.key] || '').trim(); })
      .map(function (x) { return x.label; });
  }

  // Инструкция участника: какая ушла модели и общая ли она с человеческой. Общей она станет,
  // когда в общем источнике (S.system) не останется пунктов про ответ «только модели» и
  // «только человеку» (запрос 08→01 от 09.10). До этого прогон помечается несопоставимым.
  function instructionInfo() {
    var text = S.briefForModel(run ? run.tag : '');
    var sys = S.system || {};
    var modelOnly = (sys.modelOnly || []).map(String);
    var humanOnly = (sys.howItWorks || []).filter(function (x) { return x && x.human; })
      .map(function (x) { return (String(x.head || '') + ' ' + String(x.tail || '')).trim(); });
    return { fp: fp(text), chars: text.length, scenesVersion: S.version,
             common: !modelOnly.length && !humanOnly.length, modelOnly: modelOnly, humanOnly: humanOnly };
  }

  // Сводка журнала — то, что уходит в лист с прогоном (ячейка вмещает около 50 тысяч знаков,
  // поэтому тексты сообщений и вставок туда не идут: они в файле прогона).
  function summary() {
    var j = J() || { events: [], declared: {}, prompts: {} };
    var ev = j.events;
    var answers = ev.filter(function (e) { return e.type === 'answer'; });
    var fails = ev.filter(function (e) { return e.type === 'failure'; });
    var tries = {}, order = [];
    answers.concat(fails).sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; }).forEach(function (e) {
      var k = e.step + (e.beat ? ' · ' + e.beat : '');
      if (!tries[k]) { tries[k] = []; order.push(k); }
      tries[k].push(e.type === 'failure' ? 'сбой: ' + e.what : e.status);
    });
    var retried = order.filter(function (k) { return tries[k].length > 1; })
      .map(function (k) { return { step: k, attempts: tries[k] }; });
    var count = function (after) { return answers.filter(function (e) { return e.after === after; }).length; };
    var changedOnFormat = answers.filter(function (e) { return e.sameContent === false; }).length;
    var restarts = ev.filter(function (e) { return e.type === 'chat_restart'; })
      .map(function (e) { return e.step + (e.beat ? ' · ' + e.beat : ''); });
    var asked = {}, chars = 0;
    answers.concat(fails).forEach(function (e) {
      if (e.fp && !asked[e.fp]) { asked[e.fp] = 1; chars += String(j.prompts[e.fp] || '').length; }
    });
    var ins = instructionInfo();
    var declared = {};
    DECLARED.forEach(function (x) { declared[x.key] = String((j.declared || {})[x.key] || '').trim() || 'неизвестно'; });

    var notComparable = [], flags = [];
    if (!ins.common) {
      notComparable.push('инструкция модели не совпадает с человеческой' +
        (ins.modelOnly.length ? ' — только модели: «' + ins.modelOnly.join('», «') + '»' : '') +
        (ins.humanOnly.length ? ' — только человеку: «' + ins.humanOnly.join('», «') + '»' : ''));
    }
    if (fails.some(function (e) { return e.reason === 'context'; })) notComparable.push('модель потеряла начало разговора');
    if (declared.regen === 'использовалась') notComparable.push('перегенерация ответов в интерфейсе — это выбор из нескольких');
    ['search', 'tools'].forEach(function (k) {
      var rule = STUDY[k].rule, got = declared[k];
      var name = k === 'search' ? 'поиск' : 'инструменты', given = k === 'search' ? 'не задан' : 'не заданы';
      if (rule === 'нельзя' && /включ|использовал/.test(got)) notComparable.push(name + ': у модели ' + got + ', а людям нельзя');
      else if (rule === 'нельзя' && got === 'неизвестно') flags.push(name + ': у модели неизвестно — людям нельзя; сопоставим, только если было выключено');
      else if (rule === null) flags.push(name + ': людям ' + given + ', у модели — ' + got);
    });
    if (j.since) flags.push('журнал неполный: начат с ' + j.since);
    if (count('ошибка формата')) flags.push('повторов после ошибки формата: ' + count('ошибка формата') +
      (changedOnFormat ? ', из них с изменённым содержанием: ' + changedOnFormat : ''));
    if (count('проверка поля')) flags.push('повторов после проверки поля: ' + count('проверка поля'));
    if (count('сбой ответа') || fails.length) flags.push('сбоев ответа: ' + fails.length + ', повторов после сбоя: ' + count('сбой ответа'));
    if (restarts.length) flags.push('новый чат: ' + restarts.join('; '));
    if (j.test) flags.push('тестовая запись — не для выборки');

    var taken = answers.filter(function (e) { return TAKEN[e.kind]; });
    return {
      core: j.core || CORE_V, study: STUDY.id, test: !!j.test,
      instruction: { fp: ins.fp, chars: ins.chars, scenesVersion: ins.scenesVersion, common: ins.common },
      declared: declared, unknown: UNKNOWN.slice(),
      observed: {
        // Прогон дошёл до конца маршрута; неполный в лист не заливается, но в файле и отчёте виден.
        finished: !!run && current() < 0,
        messages: Object.keys(asked).length, chars: chars, answers: answers.length, failures: fails.length,
        formatRetries: count('ошибка формата'), gateRetries: count('проверка поля'),
        failureRetries: count('сбой ответа'), changedOnFormat: changedOnFormat, restarts: restarts,
        retried: retried,
        firstAnswerAt: taken.length ? taken[0].at : '', lastAnswerAt: taken.length ? taken[taken.length - 1].at : ''
      },
      comparable: !notComparable.length, notComparable: notComparable, flags: flags
    };
  }

  // Файл прогона обратно в страницу. Тот же маршрут — иначе вопросы были бы другие.
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || !obj.tag || !obj.answers || !obj.mech) {
      return { ok: false, why: 'это не файл прогона харнесса' };
    }
    if (obj.scenesVersion !== S.version) {
      return { ok: false, why: 'прогон шёл по маршруту ' + obj.scenesVersion + ', а страница — по ' + S.version +
        ': продолжить его этим маршрутом нельзя, вопросы другие' };
    }
    run = obj;
    var had = !!obj.journal;
    J().events.push({ type: 'restored', at: stamp(), from: had ? 'файл с журналом' : 'файл без журнала' });
    return { ok: true, journal: had };
  }

  // ---------- прогон: начало и заливка ----------
  function newRun(tag) {
    return { tag: tag, scenesVersion: S.version, caseVersion: S.caseVersion, backlogVersion: S.backlogVersion,
             startedAt: new Date().toISOString(), answers: {}, answersAt: {}, mech: {}, mechAt: {},
             sent: {}, sentSetup: false,
             journal: { v: 1, core: CORE_V, declared: {}, test: false, prompts: {}, events: [] } };
  }

  // Тело заливки — тем же действием saveAnswers, которым пишет браузер участника.
  function uploadPayload(bib) {
    return {
      bib: bib,
      scenesVersion: run.scenesVersion, caseVersion: run.caseVersion, backlogVersion: run.backlogVersion,
      answers: run.answers, answersAt: run.answersAt,
      mech: run.mech, mechAt: run.mechAt,
      // ⚠ ФЛАГИ ЭЛИСИТАЦИИ ОТДАЮТСЯ, а не пустым объектом (13.08). Здесь стояло
      // elicited: {} — и судья получал «ни одного, всё участник принёс сам» про шаг,
      // где варианты просят прямо. Правило чтения засчитывает непомеченное «в полную
      // силу», то есть модели судились МЯГЧЕ живого участника, который флаги отдаёт
      // через движок. Карта статическая (собирается из полей elicited у актов сцен),
      // от состояния прогона не зависит — потому её можно взять прямо здесь.
      picks: {}, elicited: S.elicitedMap(), marks: [],
      cursor: 0, started: true, finished: true,
      startedAt: run.startedAt, finishedAt: new Date().toISOString(),
      // Сводка журнала едет в колонку runnerJson: судье она не уходит (buildJudgeInput_
      // собирает вход из ответов, — проверяет lint_harness.js), кабинет читает из неё метку.
      runner: { harness: 'harness.html', tag: run.tag, at: new Date().toISOString(), journal: summary() }
    };
  }

  window.imp.harnessCore = {
    // Страница отдаёт то, что знает только она: отмечен ли «новый чат».
    configure: function (o) { if (o && o.fullAgain) env.fullAgain = o.fullAgain; },
    setRun: function (r) { run = r; },
    getRun: function () { return run; },
    setCaseHtml: setCaseHtml,
    caseText: function () { return caseTextCache; },
    steps: function () { return STEPS; },
    stepAt: function (i) { return STEPS[i]; },
    done: done, skipped: skipped, current: current,
    plainKeyOf: function (step) { return plainKeyOf(step, run); },
    promptFor: promptFor,
    accept: accept,
    newRun: newRun,
    uploadPayload: uploadPayload,
    // журнал
    noteShown: noteShown, noteCopied: noteCopied, noteFailure: noteFailure,
    declare: declare, declaredMissing: declaredMissing, summary: summary, restore: restore,
    instructionInfo: instructionInfo, myAnswersText: myAnswersText, fp: fp,
    DECLARED: DECLARED, UNKNOWN: UNKNOWN, STUDY: STUDY, FAILURES: FAILURES, version: CORE_V,
    esc: esc, num: num
  };
})();

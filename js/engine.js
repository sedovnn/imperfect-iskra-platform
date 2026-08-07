// i(m)perfect / «Искра» — платформа v2. ДВИЖОК РАБОЧЕГО СТОЛА.
//
// Заменил ленту разговора на рабочий стол по одной причине, и она про замер, а не
// про удобство. Языковая модель по построению получает на КАЖДОМ шаге: полный кейс
// в system, всю историю разговора дословно и скрытое рассуждение, которое не судится.
// Человек в прежней версии получал кейс, убранный за кнопку, свои ответы — за вторую
// такую же, ленту в восемь тысяч пикселей и двадцать имён, которые надо держать в
// голове. Он платил когнитивный налог, которого модель не платит, — а весь продукт
// стоит на сравнении их между собой. Налог — это ошибка измерения.
//
// Отсюда принцип раскладки: всё, что модель перечитывает бесплатно, человек должен
// перечитывать почти бесплатно. Значит опора (кейс, свои ответы, пометки,
// справочник) живёт РЯДОМ постоянно и НЕ перекрывает поле ответа, а работа —
// ровно один текущий вопрос; прошлые разговоры свёрнуты в строки.
// ⚠ Стороны поменялись 05.08 по решению владельца: работа переехала в ЦЕНТР,
// опора — вправо. Принцип не изменился, изменилось только, где что стоит.
//
// Заметки вернулись, и это тоже про паритет, а не про комфорт: у модели есть
// скрытое рассуждение, которое не попадает ни в ответ, ни к судье. Блокнот —
// его человеческий эквивалент. Поэтому содержимое заметок не уходит на сервер
// НИКОГДА: отдельный ключ localStorage, отсутствие в payload, ноль телеметрии.
//
// Что осталось неизменным: маршрут целиком берётся из scenes.js (семь сцен,
// двенадцать шагов), необратимость каждого шага, отсутствие любых реакций на
// содержание и длину ответа.

(function () {
  var S = window.imp.scenes;
  var BACKLOG = window.imp.backlog || [];
  var LIM = window.imp.backlogLimits || { people: 0, money: 0 };

  // НОМЕР ПОЗИЦИИ НА ЭКРАНЕ — ПОРЯДКОВЫЙ (1–20), а не id (СПЕК §4.5). id Кати идут
  // 1,2,4,5…22 с вырезанными 3 и 8. Таблица считается один раз и на весь файл:
  // раньше она была локальной в рендере портфеля, и свод дня печатал сырой id — то
  // есть участник видел у одной позиции два разных номера и пропуски, которые
  // решением от 03.08 убраны. Новый показ номера — только через blNum().
  var BL_NUM = (function () {
    var m = {};
    BACKLOG.forEach(function (it, ix) { m[it.id] = ix + 1; });
    return m;
  })();
  function blNum(id) { return BL_NUM[id] || ''; }

  var session = null;
  var state = null;
  var route = null;
  var caseLoaded = false;
  var recapShown = false;

  // ---------- утилиты ----------

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function br(s) { return esc(s).replace(/\n/g, '<br />'); }
  function num(n) { return String(Math.round(Number(n) * 10) / 10).replace('.', ','); }
  function nowIso() { return new Date().toISOString(); }
  function pname() { return session && session.name ? String(session.name).trim() : ''; }
  function hhmm(iso) {
    try { var d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    catch (e) { return ''; }
  }
  function el(id) { return document.getElementById(id); }

  function storageKey(bib) { return 'imp_v2_' + bib; }
  // ГДЕ ЖИВЁТ ПРОГОН. Живой участник — localStorage: он должен вернуться в свой день
  // после закрытия браузера. ДЕМО — sessionStorage, то есть только в этой вкладке.
  // Починка 04.08: демо писалось в localStorage под imp_v2_900 и не чистилось ничем
  // (витрина убирала только флаг imp_demo). Поэтому после первого прохода демо
  // навсегда возвращалось в завершённый разговор с Агеевым, и «сброс» не помогал —
  // сбрасывался флаг, а не сам прогон. Витрина теперь дополнительно стирает старый
  // ключ из localStorage: см. vitrina.html.
  function store() {
    var demo = false;
    try { demo = !!sessionStorage.getItem('imp_demo'); } catch (e) {}
    return demo ? sessionStorage : localStorage;
  }
  // Поле заметок убрано (СПЕК §3): сборщик телеметрии слушает любой textarea и
  // складывает totals по всем полям, поэтому копирование цифр из кейса в заметки
  // раздувало pastedChars и поднимало флаг ИИ за легитимное действие. Ключ
  // оставлен только затем, чтобы прежние записи можно было прочитать и убрать.
  function notesKeyLegacy(bib) { return 'imp_v2_notes_' + bib; }

  // ---------- состояние ----------

  function freshState() {
    return {
      v: 1,
      scenesVersion: S.version,
      caseVersion: S.caseVersion,
      backlogVersion: S.backlogVersion,
      answers: {}, answersAt: {},
      picks: {}, picksAt: '',
      // Состояние семи механик маршрута v4.4.f — по одной ветке на механику
      // (js/mechanics.js). Отдельно от picks: picks — прежний разбор заявок на два
      // решения, на маршруте его больше нет, и он остаётся пустым. Ветку не убираем
      // ради строк прежних прогонов: их читает тот же код кабинета.
      mech: {}, mechAt: {},
      // Такт шага: участник отслушал реплики и нажал «приступаю». Отдельно от
      // ответов — это не ответ, а место в шаге; без него перезагрузка возвращала бы
      // к репликам, которые уже отслушаны.
      entered: {},
      // Выписки из материалов. Собираем (владелец: «собирать максимум текста»),
      // но судьям не отдаём: выделение — вспомогательный инструмент, а не
      // инструмент оценки. Попасть в оценку не могут по построению.
      marks: [],
      cursor: 0, started: false, finished: false,
      startedAt: nowIso(), finishedAt: ''
    };
  }

  // Версия маршрута сменилась под уже начатым прогоном. Ответы отвечали на другие
  // реплики, поэтому продолжать нельзя — но и терять их нельзя тем более. Прежняя
  // запись сохраняется под версионным ключом, участник видит отдельный экран, и
  // НИ ОДНА запись на сервер отсюда не уходит: молчаливое обнуление строки в листе
  // было самым дорогим дефектом платформы.
  var blockedByVersion = false;

  function loadState(bib) {
    try {
      var raw = store().getItem(storageKey(bib));
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.v === 1) {
          if (!p.answers) p.answers = {};
          if (!p.answersAt) p.answersAt = {};
          if (!p.picks) p.picks = {};
          if (!p.entered) p.entered = {};
          if (!p.mech) p.mech = {};
          if (!p.mechAt) p.mechAt = {};
          if (!p.marks) p.marks = [];
          // Гейт версии защищает ОТВЕТЫ, а не факт открытия страницы. Поэтому
          // блокируем только когда есть что терять: зафиксированный ответ или
          // разобранный портфель. Прежнее условие включало p.started, и участник,
          // который просто нажал «Начать день» и ушёл, при следующей правке сцен
          // получал «день приостановлен» на пустом месте.
          // ⚠ ШТАМПЫ МЕХАНИК СЧИТАЮТСЯ ЗДЕСЬ НАРАВНЕ С ОКНАМИ. На маршруте v4.4.f
          // первые три шага — механики: участник, зафиксировавший тезисы, варианты и
          // разбор заявок, но ещё не дошедший до свободного окна, по одному
          // answersAt выглядел как «работы нет», и правка сцен стирала его день
          // молча — тот самый дефект, от которого этот гейт и поставлен.
          var hasWork = Object.keys(p.answersAt).some(function (k) { return p.answersAt[k]; }) ||
            Object.keys(p.mechAt).some(function (k) { return p.mechAt[k]; }) || !!p.picksAt;
          if (p.scenesVersion !== S.version && hasWork && !p.finished && !isDemo) {
            try { store().setItem(storageKey(bib) + '_v_' + p.scenesVersion, raw); } catch (e) {}
            blockedByVersion = true;
            return p;
          }
          // Демо и прогон без работы под новой версией начинаем заново молча:
          // сохранять нечего, а показывать «материалы обновились» посетителю
          // витрины — пугать его нашей внутренней жизнью.
          if (p.scenesVersion !== S.version) {
            try { store().removeItem(storageKey(bib)); } catch (e) {}
            return freshState();
          }
          return p;
        }
      }
    } catch (e) {}
    return freshState();
  }

  var syncTimer = null;

  // Демо с витрины (номер 900): на сервер не пишет вовсе, иначе демо-прогоны легли
  // бы в лист Answers рядом с живыми, и отличить их там было бы нечем.
  var isDemo = (function () {
    try { return !!sessionStorage.getItem('imp_demo'); } catch (e) { return false; }
  })();

  function saveState() {
    if (blockedByVersion) return;
    try { store().setItem(storageKey(session.bib), JSON.stringify(state)); } catch (e) {}
    if (isDemo || !window.imp.isApiConfigured()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 3000);
  }

  // Флаги элиситации описывают, что участнику ДЕЙСТВИТЕЛЬНО задали, а не что
  // задумано в маршруте. Один флаг зависит от хода прогона: Агеев спрашивает про две
  // отложенные позиции только если отложенные есть. Если портфель не размечен, пузырь
  // не произносится (bubbleShown), значит и флаг не должен уезжать — иначе протокол
  // утверждал бы, что признак ПР-1 был подсказан вопросом, которого не было, и судья
  // снижал бы уровень за элиситацию впустую.
  function elicitedNow() {
    var m = S.elicitedMap();
    if (namedRefusals().length) return m;
    Object.keys(m).forEach(function (k) {
      m[k] = m[k].filter(function (f) { return f !== 'pr1_named_refusals_asked'; });
      if (!m[k].length) delete m[k];
    });
    return m;
  }

  // Один путь записи: тем же действием saveAnswers, которым пишет харнесс модели.
  // Заметок здесь нет и быть не может — см. шапку файла.
  function payload() {
    return {
      bib: session.bib,
      scenesVersion: state.scenesVersion,
      caseVersion: state.caseVersion,
      backlogVersion: state.backlogVersion,
      answers: state.answers,
      answersAt: state.answersAt,
      picks: picksForJudge(),
      picksAt: state.picksAt,
      // Состояние механик — основной измеряемый материал с маршрута v4.4.f: тезисы
      // и связки, варианты, разбор с вилками, печать, будущее, цель, четыре поля
      // письма. Уезжает СЫРЫМ, без сводок и без оценок: судья читает то же, что
      // видел участник, а не наш пересказ. Пол ПР-1 и факты вилок считает бэкенд по
      // этим же данным — одним кодом, а не двумя.
      mech: state.mech || {},
      mechAt: state.mechAt || {},
      elicited: elicitedNow(),
      // Пометки едут на сервер и НЕ едут судье: buildJudgeInput_ собирает вход по
      // списку окон из V2_JUDGE_TASKS, и колонки marksJson для него не существует.
      marks: state.marks || [],
      cursor: state.cursor,
      started: !!state.started,
      finished: !!state.finished,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt
    };
  }

  function sync() {
    if (blockedByVersion || isDemo || !window.imp.isApiConfigured()) return Promise.resolve(true);
    return window.imp.callApiConfirmed('saveAnswers', payload());
  }

  // ---------- портфель ----------

  function pickOf(id) {
    var p = state.picks[String(id)];
    return p && typeof p === 'object' ? p : null;
  }

  function totals() {
    var t = { people: 0, money: 0, taken: 0, dropped: 0, undecided: 0 };
    BACKLOG.forEach(function (it) {
      var p = pickOf(it.id);
      if (!p) { t.undecided++; return; }
      if (p.take) { t.taken++; t.people += Number(it.people) || 0; t.money += Number(it.money) || 0; }
      else { t.dropped++; }
    });
    t.overPeople = t.people > LIM.people;
    t.overMoney = t.money > LIM.money;
    t.over = t.overPeople || t.overMoney;
    t.leftPeople = LIM.people - t.people;
    t.leftMoney = Math.round((LIM.money - t.money) * 10) / 10;
    return t;
  }

  function picksForJudge() {
    // reasons остаётся пустым объектом и уезжает на сервер как есть: поля причин
    // у позиций больше нет (механика — это поступок), а форма записи не меняется,
    // чтобы прежние строки листа читались тем же кодом.
    var taken = [], dropped = [], reasons = {};
    BACKLOG.forEach(function (it) {
      var p = pickOf(it.id);
      if (!p) return;
      if (p.take) taken.push(it.id); else dropped.push(it.id);
    });
    var t = totals();
    return {
      taken: taken, dropped: dropped, reasons: reasons,
      people: t.people, money: Math.round(t.money * 10) / 10,
      limits: { people: LIM.people, money: LIM.money },
      fitsFrame: !t.over,
      backlogVersion: S.backlogVersion
    };
  }

  // Гейты фиксации портфеля. В ДЕМО их нет (решение владельца 04.08): демо служит
  // тем, чтобы посмотреть день, а не пройти замер, и запирать выход требованием
  // разметить двадцать позиций там нечем — портфель ничего не мерит.
  // ⚠ В живом прогоне гейты пока остаются, и это единственное место, где они
  //   держатся: их обоснование («пол ПР-1 обязан мериться одинаково у человека и у
  //   модели», scenes.js) отпало вместе с самим полом — в рубрике v10 pr1LevelFrom
  //   считает уровень только по признакам судьи. Снимать их в живом прогоне или
  //   нет — решение владельца.
  function gateFailure(act) {
    if (isDemo) return '';
    var t = totals(), g = act.gates || {};
    if (t.undecided) return String(g.allDecided || '').replace('{n}', t.undecided);
    if (!t.taken) return g.atLeastOneTaken || '';
    return '';
  }

  // ---------- маршрут ----------

  // Два машинных ветвления маршрута, оба закрытые и считаются кодом одинаково у
  // человека и у модели. Ни одно не зависит от СОДЕРЖАНИЯ ответа — только от
  // поступка в механике списка.
  var SEVEROVA_ID = 6;   // «выделить „Миру" в отдельный P&L», М. Северова
  function listSums() {
    var lm = state.mech && state.mech.list;
    var spec = window.imp.mechanics && window.imp.mechanics.list;
    // Пока список не собран, ветвление не срабатывает: судить перебор не по чему.
    if (!lm || !spec) return null;
    return spec.sums(lm, mechCtx());
  }
  function applies(act) {
    if (!act.when) return true;
    if (act.when === 'overspend') {
      var t = listSums();
      // ⚠ Перебор считается по НОВОМУ списку (три решения + выбранные внутри вилки
      // числа), а не по прежнему totals() над picks: со маршрута v4.4.f на столе
      // лежат ещё и варианты участника, и их цену участник выбирает сам внутри
      // пределов. Старый totals() их не видел вовсе — ветка «чем платим» молчала
      // бы ровно там, где участник вышел за рамку своим вариантом.
      return t ? t.over : totals().over;
    }
    if (act.when === 'severova') {
      var lm = state.mech && state.mech.list;
      if (!lm || !lm.decided) return false;
      var d = lm.decided['a' + SEVEROVA_ID];
      return d === 'later' || d === 'never';
    }
    return true;
  }
  // Останавливающие акты: на них курсор стоит и ждёт участника. Реплики через
  // такой акт проскакивают — они рисуются как часть текущей сцены. Межсценовый
  // экран останавливающий: он и существует затем, чтобы день не переезжал из
  // разговора в разговор без единого вдоха (СПЕК §4.4).
  function isBlocking(act) {
    return act.kind === 'window' || act.kind === 'mechanic' || act.kind === 'case' || act.kind === 'interlude';
  }

  function normalizeCursor() {
    while (state.cursor < route.length) {
      var st = route[state.cursor];
      if (applies(st.act) && isBlocking(st.act)) return;
      state.cursor++;
    }
  }

  function advance() {
    state.cursor++;
    normalizeCursor();
    saveState();
    render();
  }

  // ---------- речь ----------

  function subst(text) {
    var t = String(text || '');
    if (t.indexOf('{name}') >= 0) {
      var nm = pname();
      // Имени может не быть: старая сессия, вход по номеру без самозаписи, пустое
      // поле. Тогда убираем не подстановку, а всё обращение вместе с запятой —
      // иначе персонаж говорит «Спасибо, . Прочитал» и выглядит сломанным.
      t = nm ? t.split('{name}').join(nm)
             : t.replace(/,\s*\{name\}/g, '').replace(/\{name\}\s*,\s*/g, '').split('{name}').join('');
    }
    if (t.indexOf('{people}') >= 0 || t.indexOf('{money}') >= 0) {
      var tt = totals();
      t = t.split('{people}').join(String(tt.people)).split('{money}').join(num(tt.money));
    }
    if (t.indexOf('{drop1}') >= 0 || t.indexOf('{drop2}') >= 0) {
      var d2 = namedRefusals();
      t = t.split('{drop1}').join(d2[0] || '').split('{drop2}').join(d2[1] || '');
      // При единственном отказе второго имени нет: «отложили X и » выглядело бы
      // сломанным. Гейт фиксации требует хотя бы одного отказа, значит первый есть
      // всегда, а союз убираем вместе с пустым вторым.
      t = t.replace(/\s+и\s*(?=[.,?!])/g, '').replace(/\s{2,}/g, ' ');
    }
    return t;
  }

  // Две позиции, про которые Агеев спрашивает сам: самые дорогие по людям из
  // отложенных, при равенстве — с меньшим номером. Правило детерминировано, а не
  // случайно, по двум причинам: случайность у разных участников давала бы разную
  // задачу, а харнесс модели обязан воспроизвести тот же выбор. Участнику правило
  // неизвестно — подготовить удобный ответ он не может.
  function namedRefusals() {
    var dropped = [];
    BACKLOG.forEach(function (it, ix) {
      var p = pickOf(it.id);
      if (p && !p.take) dropped.push({ it: it, n: ix + 1 });
    });
    dropped.sort(function (a, b) {
      var d = (Number(b.it.people) || 0) - (Number(a.it.people) || 0);
      return d !== 0 ? d : a.n - b.n;
    });
    return dropped.slice(0, 2).map(function (x) {
      // Короткая часть названия — до первого тире, запятой или двоеточия: полное
      // название занимает строку и в реплике не читается. Двоеточие обязательно:
      // без него «Ввести формальные критерии приоритизации: как владельцы
      // продуктов решают…» обрывалось посреди пояснения. Кавычки не ставим, если
      // внутри уже есть свои («перезапустить „Точку"») — двойные выглядят сломанно.
      var short = String(x.it.title || '').split(/\s+—\s+|,\s+|:\s+/)[0].trim();
      // И потолок по длине: у трёх позиций даже первая часть названия тянет на
      // восемьдесят знаков, и реплика Агеева превращалась в цитирование бэклога.
      // Полное название рядом — в столбике «Не сейчас», номер сходится.
      if (short.length > 48) short = short.slice(0, short.lastIndexOf(' ', 48)).trim() + '…';
      return '№' + x.n + (short.indexOf('«') >= 0 ? ' ' + short : ' «' + short + '»');
    });
  }
  window.imp.v2NamedRefusals = namedRefusals;

  // Реплика может опираться на поступок участника, а поступка может не быть: без
  // гейтов фиксации (демо) портфель законно остаётся неразмеченным, и тогда
  // отложенных позиций ноль. Пузырь «Вы отложили {drop1} и {drop2}» в этом случае
  // не произносится вовсе — иначе Агеев спрашивал бы про пустое место. Флаг
  // элиситации pr1_named_refusals_asked при этом тоже не уезжает: см. payload().
  function bubbleShown(b) {
    if (b.needs === 'refusals') return namedRefusals().length > 0;
    return true;
  }

  function speechHtml(act) {
    var out = '';
    // Фильтр ДО перебора, а не внутри: имя говорящего и ремарка привязаны к первому
    // пузырю, и пропуск первого молча стирал бы подпись реплики.
    (act.bubbles || []).filter(bubbleShown).forEach(function (b, i) {
      var name = i === 0 ? (act.who || '') : '';
      var actLine = i === 0 ? (b.act || act.act || '') : (b.act || '');
      out += '<div class="chat"><div class="chat-msg them"' + (act.who ? ' data-who="' + esc(act.who) + '"' : '') + '>' +
        (name ? '<span class="chat-name">' + esc(name) +
          (act.note ? ' <span class="chat-note">(' + esc(act.note) + ')</span>' : '') + '</span>' : '') +
        (actLine ? '<div class="chat-act">' + esc(actLine) + '</div>' : '') +
        '<div class="chat-bubble">' + br(subst(b.text)) + '</div>' +
        '</div></div>';
    });
    return out;
  }

  function meHtml(text, at) {
    var t = String(text == null ? '' : text).trim();
    return '<div class="chat"><div class="chat-msg me"><span class="chat-name">Вы</span>' +
      '<div class="chat-bubble">' + (t ? br(t) : '<i>промолчали</i>') + '</div></div></div>' +
      (at ? '<div class="win-fixed">✓ зафиксировано · ' + hhmm(at) + '</div>' : '');
  }

  // ---------- опора ----------

  var supportTab = 'case';

  function setTab(name) {
    supportTab = name;
    // Порядок как в разметке (кейс · справка · пометки · мои ответы) — на работу он
    // не влияет, но список, читающийся иначе, чем экран, потом обманывает.
    ['case', 'ref', 'marks', 'answers'].forEach(function (k) {
      var b = document.querySelector('.support-tab[data-tab="' + k + '"]');
      var body = el('sup' + k.charAt(0).toUpperCase() + k.slice(1));
      if (b) b.classList.toggle('is-on', k === name);
      if (body) body.classList.toggle('is-on', k === name);
    });
    if (name === 'answers') renderAnswersTab();
    if (name === 'marks') renderMarks();
  }

  // ---------- пометки ----------
  // Пометка — ВЫПИСКА, а не указатель в текст. Поэтому хранится сам фрагмент, и
  // смена версии кейса её не ломает: переякоривать нечего. Переход «показать в
  // кейсе» — по совпадению текста, и если фрагмент не нашёлся (материалы
  // обновились), выписка всё равно на месте, просто без прыжка.

  function markId() { return 'm' + Date.now().toString(36) + Math.floor(Math.random() * 1e3); }

  function addMark(quote) {
    var q = String(quote || '').replace(/\s+/g, ' ').trim();
    if (q.length < 3) return;
    if (q.length > 1200) q = q.slice(0, 1200);
    state.marks = state.marks || [];
    // Тот же фрагмент дважды не добавляем: участник выделил, отвлёкся, выделил снова.
    for (var i = 0; i < state.marks.length; i++) if (state.marks[i].quote === q) return;
    state.marks.push({ id: markId(), quote: q, note: '', at: nowIso() });
    saveState();
    renderMarks();
    markCount();
    paintMarks();
  }

  function markCount() {
    var e = el('marksCount');
    if (!e) return;
    var n = (state.marks || []).length;
    e.textContent = n ? ' · ' + n : '';
  }

  function renderMarks() {
    var host = el('supMarksBody');
    if (!host) return;
    var list = state.marks || [];
    if (!list.length) {
      host.innerHTML = '<p class="bl-empty">Пока ничего. Выделите фрагмент в материалах — появится кнопка «В пометки».</p>';
      return;
    }
    // draggable у цитаты: пометку можно перетащить на карточку тезиса (механика
    // тезисов принимает drop). Клик-выбор из карточки остаётся вторым путём —
    // перетаскивание недоступно с клавиатуры и на планшете.
    host.innerHTML = list.map(function (m) {
      return '<div class="mark-item" data-mark="' + m.id + '">' +
        '<blockquote class="mark-quote" draggable="true" data-dragmark="' + m.id + '">' + esc(m.quote) + '</blockquote>' +
        // data-answer здесь НЕТ сознательно: это не ответ, и в замер вставок и
        // набора поле не идёт. Именно из-за обратного пришлось убрать заметки.
        '<textarea class="mark-note" rows="2" data-note="' + m.id + '" placeholder="своя строка — если нужна">' + esc(m.note || '') + '</textarea>' +
        '<div class="mark-acts">' +
          '<button type="button" class="mark-act" data-show="' + m.id + '">показать в кейсе</button>' +
          '<button type="button" class="mark-act" data-del="' + m.id + '">убрать</button>' +
          '<span class="mark-when">' + hhmm(m.at) + '</span>' +
        '</div></div>';
    }).join('');
  }

  // Ищем фрагмент по тексту, а не по сохранённой позиции: позиция и есть то, что
  // ломается при новой версии кейса.
  function showMarkInCase(quote) {
    setTab('case');
    var host = el('supCaseText');
    var norm = function (s) { return String(s).replace(/\s+/g, ' '); };
    var needle = norm(quote).slice(0, 80);
    var walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
    var node, found = null;
    while ((node = walker.nextNode())) {
      if (norm(node.nodeValue).indexOf(needle.slice(0, Math.min(40, needle.length))) >= 0) { found = node; break; }
    }
    var box = el('markBar');
    if (!found) {
      box.style.display = '';
      el('markBarQuote').textContent = 'Фрагмент не найден: материалы обновились. Выписка сохранена.';
      return;
    }
    box.style.display = 'none';
    var target = found.parentElement;
    // Раздел мог быть свёрнут: сначала раскрываем, иначе прокрутка приводит к
    // закрытой полосе, и участник видит «ничего не произошло».
    openCaseBlockOf(target);
    host.scrollTop += target.getBoundingClientRect().top - host.getBoundingClientRect().top - 10;
    target.classList.add('mark-flash');
    setTimeout(function () { target.classList.remove('mark-flash'); }, 1200);
  }

  // ⚠ Подсветка отметок НЕ хранится и не якорится: рисуется по тексту выписки при
  // каждом показе. Поэтому смена версии кейса её не ломает — ненайденный фрагмент
  // просто не подсвечен.
  function unpaintMarks(host) {
    var old = host.querySelectorAll('.case-mk');
    for (var i = 0; i < old.length; i++) {
      var m = old[i], p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    }
  }

  function paintOneMark(host, m) {
    var nodes = [], full = '';
    var w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      var par = n.parentNode;
      if (par && par.closest && par.closest('.case-mk')) continue;
      nodes.push({ node: n, at: full.length });
      full += n.nodeValue;
    }
    // В выписке пробелы нормализованы (одиночные), в разметке кейса — переводы строк
    // и отступы. Поэтому ищем выражением, где любой пробел сходится с любым.
    var re;
    try {
      re = new RegExp(String(m.quote).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
    } catch (e) { return; }
    var hit = re.exec(full);
    if (!hit) return;
    var from = hit.index, to = from + hit[0].length;
    // Красим КУСКАМИ и с конца: выделение могло пересечь ссылку или <b>, и один
    // <mark> на весь диапазон surroundContents не пустит; идти назад обязательно,
    // потому что splitText сдвигает всё, что после него.
    for (var i = nodes.length - 1; i >= 0; i--) {
      var it = nodes[i], s = it.at, e2 = s + it.node.nodeValue.length;
      if (e2 <= from || s >= to) continue;
      var a = Math.max(0, from - s), b = Math.min(it.node.nodeValue.length, to - s);
      var node = it.node;
      if (b < node.nodeValue.length) node.splitText(b);
      if (a > 0) node = node.splitText(a);
      var mk = document.createElement('mark');
      mk.className = 'case-mk';
      mk.setAttribute('data-mk', m.id);
      node.parentNode.insertBefore(mk, node);
      mk.appendChild(node);
    }
  }

  function paintMarks() {
    var host = el('supCaseText');
    if (!host) return;
    unpaintMarks(host);
    var list = (state.marks || []).slice();
    if (!list.length) return;
    // Длинные выписки красим первыми: короткая внутри длинной иначе разрезала бы её,
    // и вложенные <mark> дали бы двойной фон.
    list.sort(function (a, b) { return String(b.quote).length - String(a.quote).length; });
    list.forEach(function (m) { paintOneMark(host, m); });
  }

  // Клик по подсветке — путь обратно, от текста к своей выписке. На экране чтения
  // пометки стоят в третьей колонке и уже видны, поэтому вкладку там не трогаем.
  function focusMark(id) {
    var item = document.querySelector('.mark-item[data-mark="' + id + '"]');
    if (!el('dayGrid').classList.contains('is-reading')) setTab('marks');
    item = document.querySelector('.mark-item[data-mark="' + id + '"]');
    if (!item) return;
    item.scrollIntoView({ block: 'nearest' });
    item.classList.add('is-hit');
    setTimeout(function () { item.classList.remove('is-hit'); }, 1400);
  }

  function initMarks() {
    var pop = el('markPop'), addBtn = el('markBarAdd'), host = el('supCaseText');
    var pending = '';

    // ── КНОПКА ОТМЕТКИ У ВЫДЕЛЕНИЯ ─────────────────────────────────────────────
    // Была полоса внизу панели: чтобы отметить фрагмент, надо было увести глаз и
    // руку к краю экрана. Отметить стоило дороже, чем не отметить, — и участник не
    // отмечал. Теперь кнопка встаёт над концом выделения, где рука уже есть.
    // Позиция считается по прямоугольнику выделения и ставится fixed: панель
    // прокручивается, и позиция внутри неё уехала бы при первом же колесе.
    var hidePop = function () { pop.style.display = 'none'; pending = ''; };

    var onSelect = function () {
      var sel = window.getSelection ? window.getSelection() : null;
      var txt = sel ? String(sel.toString()).replace(/\s+/g, ' ').trim() : '';
      var inside = false;
      if (sel && sel.rangeCount && txt) {
        var n = sel.getRangeAt(0).commonAncestorContainer;
        inside = host.contains(n.nodeType === 1 ? n : n.parentNode);
      }
      if (!inside || txt.length < 3) { hidePop(); return; }
      pending = txt;
      var rects = sel.getRangeAt(0).getClientRects();
      var r = rects.length ? rects[rects.length - 1] : sel.getRangeAt(0).getBoundingClientRect();
      pop.style.display = '';
      // Ставим НАД концом выделения; если сверху места нет — под ним. Кнопка не
      // должна закрывать сам фрагмент, иначе участник не видит, что отмечает.
      var w = pop.offsetWidth || 96, h = pop.offsetHeight || 28;
      var top = r.top - h - 6;
      if (top < 8) top = r.bottom + 6;
      var left = Math.min(Math.max(8, r.right - w / 2), window.innerWidth - w - 8);
      pop.style.top = Math.round(top) + 'px';
      pop.style.left = Math.round(left) + 'px';
    };
    document.addEventListener('selectionchange', onSelect);
    host.addEventListener('mouseup', onSelect);
    // Прокрутка панели и уход со вкладки прячут кнопку: висящая кнопка над чужим
    // местом хуже, чем её отсутствие.
    host.addEventListener('scroll', hidePop);

    addBtn.addEventListener('click', function () {
      if (!pending) return;
      addMark(pending);
      hidePop();
      try { window.getSelection().removeAllRanges(); } catch (e) {}
    });

    // Возврат из приложения на строку чтения.
    var back = el('caseBackAct');
    if (back) back.addEventListener('click', backToReading);
    // Ссылки на приложения в тексте кейса и путь от подсветки к своей выписке.
    host.addEventListener('click', function (e) {
      var mk = e.target.closest && e.target.closest('.case-mk');
      if (mk) { focusMark(mk.getAttribute('data-mk')); return; }
      var a = e.target.closest && e.target.closest('[data-appx]');
      if (!a) return;
      e.preventDefault();
      goToAppendix(a.getAttribute('data-appx'));
    });

    el('supMarksBody').addEventListener('click', function (e) {
      var del = e.target.getAttribute && e.target.getAttribute('data-del');
      var show = e.target.getAttribute && e.target.getAttribute('data-show');
      if (del) {
        state.marks = (state.marks || []).filter(function (m) { return m.id !== del; });
        saveState(); renderMarks(); markCount(); paintMarks(); return;
      }
      if (show) {
        var m = (state.marks || []).filter(function (x) { return x.id === show; })[0];
        if (m) showMarkInCase(m.quote);
      }
    });
    el('supMarksBody').addEventListener('dragstart', function (e) {
      var q = e.target.getAttribute && e.target.getAttribute('data-dragmark');
      if (!q || !e.dataTransfer) return;
      var m = (state.marks || []).filter(function (x) { return x.id === q; })[0];
      if (!m) return;
      // Два формата: свой — чтобы принимающая сторона знала, что это пометка, и
      // text/plain — чтобы цитата не потерялась, если drop случится в поле ввода.
      e.dataTransfer.setData('text/imp-mark', m.id);
      e.dataTransfer.setData('text/plain', m.quote);
      e.dataTransfer.effectAllowed = 'copy';
    });
    el('supMarksBody').addEventListener('input', function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-note');
      if (!id) return;
      (state.marks || []).forEach(function (m) { if (m.id === id) m.note = e.target.value; });
      saveState();
    });

    renderMarks();
    markCount();
  }

  // ── МАРШРУТ ДНЯ (верх левой колонки) ────────────────────────────────────
  // Что участник видит: разговоры по порядку, в каждом — его шаги; где он сейчас;
  // что уже сделано. Время и место берутся из scene.where, названия шагов — из
  // самих актов (label у окна, MECH_TITLES у механики). Второго списка шагов
  // здесь нет: маршрут собирается из route, то есть из scenes.js.
  //
  // ТРИ ПРАВИЛА, БЕЗ КОТОРЫХ ЭТО СТАЛО БЫ ПОДСКАЗКОЙ:
  //  1. Будущие разговоры не называются — только их счёт. Перечень того, что ещё
  //     спросят, это карта дня; по ней участник готовит ответы заранее и мы мерим
  //     подготовку, а не мышление.
  //  2. Условный шаг, который НЕ сработал, в маршруте не появляется вовсе —
  //     иначе участник узнавал бы, что где-то была развилка, и по какому признаку.
  //  3. Клик по пройденному шагу ПРОКРУЧИВАЕТ к нему, а не возвращает в него:
  //     день идёт вперёд, зафиксированное не переигрывается.
  function renderRoute() {
    var host = el('routeBody');
    if (!host) return;
    var cur = route[state.cursor];
    var curSceneIx = cur ? cur.sceneIx : S.scenes.length - 1;
    var html = '';
    S.scenes.forEach(function (sc, si) {
      if (si > curSceneIx) return;
      html += '<div class="route-scene' + (si === curSceneIx ? ' is-now' : '') + '">' +
        '<div class="route-where">' + esc(sc.where) + '</div>' +
        '<div class="route-name">' + esc(sc.name) + '</div>';
      sc.acts.forEach(function (a, ai) {
        if (!isBlocking(a) || a.kind === 'interlude') return;
        if (!applies(a)) return;
        var ix = -1;
        for (var i = 0; i < route.length; i++) {
          if (route[i].sceneIx === si && route[i].actIx === ai) { ix = i; break; }
        }
        if (ix > state.cursor) return;             // будущее внутри текущей сцены не называем
        // Названия механик в реестре строчные («тезисы и связки») — они там
        // подписи внутри окна. В маршруте это строка списка рядом с «Пакет
        // материалов», поэтому первая буква поднимается здесь, а не в реестре:
        // иначе пришлось бы держать два написания одного названия.
        var title = a.kind === 'case' ? 'Пакет материалов'
          : (a.kind === 'mechanic' ? mechTitle(a.mech) : (a.label || 'Ответ'));
        title = title.charAt(0).toUpperCase() + title.slice(1);
        var done = ix < state.cursor;
        html += '<button type="button" class="route-step' + (done ? ' is-done' : '') +
          (ix === state.cursor ? ' is-on' : '') + '" data-rstep="' + si + '">' +
          '<span class="route-mark">' + (done ? '✓' : '•') + '</span>' + esc(title) + '</button>';
      });
      html += '</div>';
    });
    var left = S.scenes.length - 1 - curSceneIx;
    if (left > 0) {
      html += '<p class="route-left">дальше — ещё ' +
        left + ' ' + plural(left, 'этап', 'этапа', 'этапов') + '</p>';
    }
    host.innerHTML = html;
  }

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  // ⚠ Оглавления открытой вкладки в левой колонке нет (решение владельца 06.08:
  // «слева ТОЛЬКО этапы ассессмента»). Навигация: по пакету — свёрнутые разделы в самом
  // кейсе, по пометкам и ответам — списки в своей вкладке.

  function refHtml() {
    var R = S.reference || { terms: [], people: [], things: [] };
    var rows = function (list) {
      return list.map(function (r) {
        return '<div class="who-row"><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></div>';
      }).join('');
    };
    return '<p class="who-h" id="ref-terms">Термины</p>' + rows(R.terms) +
      '<p class="who-h" id="ref-people">Люди</p>' + rows(R.people) +
      '<p class="who-h" id="ref-things">Компании и продукты</p>' + rows(R.things);
  }

  function initSupport() {
    el('supportTabs').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.support-tab');
      if (b) setTab(b.getAttribute('data-tab'));
    });

    // Справка приезжает из scenes.js: тот же блок харнесс отдаёт модели в system,
    // иначе у человека была бы опора, которой у модели нет (паритет носителей).
    el('supRefBody').innerHTML = refHtml();

    // Сворачивание оглавления — постоянный контрол участника. Автоматическое
    // сворачивание ниже 1360 живёт в CSS и кнопку не заменяет: класс is-tocon
    // говорит «участник попросил» и перебивает медиазапрос, иначе на ноутбуке
    // кнопка «⟩ оглавление» снимала класс, которого там не было, и не делала ничего.
    el('tocCollapse').addEventListener('click', function () {
      el('dayGrid').classList.add('is-collapsed');
      el('dayGrid').classList.remove('is-tocon');
    });
    el('tocRestore').addEventListener('click', function () {
      el('dayGrid').classList.remove('is-collapsed');
      el('dayGrid').classList.add('is-tocon');
    });



    // Клик по маршруту: текущий этап — прокрутка к нему, пройденный — вкладка «Мои
    // ответы». ⚠ Ни курсор, ни зафиксированные ответы отсюда не двигаются.
    el('routeBody').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-rstep]');
      if (!b) return;
      var si = Number(b.getAttribute('data-rstep'));
      var cur = route[state.cursor];
      if (cur && si === cur.sceneIx) {
        var scroller = el('talkScroll'), target = el('talkCurrent');
        if (!target) return;
        scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
        return;
      }
      setTab('answers');
      var name = S.scenes[si] && S.scenes[si].name;
      if (!name) return;
      var host = el('supAnswersBody');
      var hit = [].slice.call(host.querySelectorAll('.recap-q')).filter(function (q) {
        return q.textContent.indexOf(name) === 0;
      })[0];
      if (!hit) return;
      var sc2 = el('supAnswers');
      sc2.scrollTop += hit.getBoundingClientRect().top - sc2.getBoundingClientRect().top - 8;
    });

    // Обработчика «Скрыть материалы» здесь больше нет: кнопка снята из шапки
    // 04.08, класса .is-nomem в styles.css тоже нет.

    loadCaseIntoSupport();
    initMarks();
  }

  // Введение в роль над пакетом. Текст берётся из S.system.lead — того же блока,
  // который харнесс отдаёт модели в system, поэтому переезд с экрана установки на
  // страницу чтения ничего не меняет для паритета носителей. Описание пакета
  // (lead акта чтения) идёт последней строкой: оно про то, что лежит ниже.
  function roleHtml() {
    var sys = S.system || {};
    var caseAct = null;
    (S.scenes || []).forEach(function (sc) {
      (sc.acts || []).forEach(function (a) { if (!caseAct && a.kind === 'case') caseAct = a; });
    });
    var out = '<div class="read-role"><p class="kicker">Ваша роль</p>' +
      (sys.lead || []).map(function (p) { return '<p>' + br(subst(p)) + '</p>'; }).join('');
    if (caseAct && caseAct.lead) out += '<p class="read-role-lead">' + br(caseAct.lead) + '</p>';
    return out + '</div>';
  }

  // ⚠ roleHtml() БОЛЬШЕ НЕ ВСТАВЛЯЕТСЯ В ПАКЕТ (решение владельца 06.08). Введение
  // в роль стало отдельным экраном — role.html, вторым из трёх до старта. Функция
  // оставлена и читается тем же S.system.lead, что и та страница: если роль
  // когда-нибудь понадобится показать внутри ассессмента, второй реализации
  // заводить не придётся. Экран материалов теперь только материалы — как просил
  // владелец, «ничего лишнего».
  function loadCaseIntoSupport() {
    if (caseLoaded) return;
    var host = el('supCaseText');
    if (!window.imp.loadCaseHtml) {
      host.innerHTML = '<p class="fac-detail-text">Сборка страницы неверна: js/case-ref.js должен подключаться до js/engine.js.</p>';
      return;
    }
    window.imp.loadCaseHtml().then(function (html) {
      host.innerHTML = html;
      // Шапка пакета переезжает ВНУТРЬ прокрутки первым узлом: снаружи она навсегда
      // занимала 250px верха панели под инструкцию, которую читают один раз, и текст
      // читался в остатке. Внутри — уезжает вместе с текстом, как и положено врезке.
      var intro = el('caseIntro');
      if (intro) host.insertBefore(intro, host.firstChild);
      caseLoaded = true;
      buildCaseAccordion();
      linkAppendices();
      if (window.imp && window.imp.typoDom) window.imp.typoDom(host);
      // Подсветка выписок — ПОСЛЕ типографа: он переставляет пробелы и переносы, и
      // покрашенные до него куски пришлось бы искать заново. Нужна и при возврате в
      // начатый прогон: пометки в состоянии есть, а текст только что загружен.
      paintMarks();
    }, function () {
      host.innerHTML = '<p class="fac-detail-text">Не удалось загрузить материалы — проверьте соединение и обновите страницу.</p>';
    });
  }

  // ── ПАКЕТ КАК АККОРДЕОН, И ОГЛАВЛЕНИЕ ВНУТРИ НЕГО ───────────────────────────
  // Решение владельца 06.08: отдельного оглавления кейса нет. Четвёртая зона на
  // экране (этапы · работа · оглавление · кейс) — перебор, а свёрнутые заголовки
  // разделов сами и есть оглавление: список, который нельзя рассинхронизировать с
  // текстом, потому что он и есть текст.
  //
  // ЧТО ЗДЕСЬ ВАЖНО НЕ СЛОМАТЬ:
  //  · КЕЙС НЕ ПРАВИТСЯ. Файл case-v8.html не тронут ни на символ — правится он
  //    только новой версией (правило проекта). Аккордеон собирается из готовой
  //    разметки в браузере: <article id> заворачивается в <details>, заголовок
  //    переезжает в <summary>. Значит новая версия кейса ту же структуру получит
  //    без правок здесь.
  //  · ID ОСТАЮТСЯ РАБОЧИМИ. Переход по пометке и по ссылке на приложение ищет
  //    элемент по id, поэтому id переносится на <details>, а не теряется.
  //  · ПЕРВЫЙ РАЗДЕЛ ОТКРЫТ (решение владельца): закрытый целиком список на первом
  //    экране чтения выглядел бы как пустой экран.
  function buildCaseAccordion() {
    var host = el('supCaseText');
    var arts = [].slice.call(host.querySelectorAll('article[id]'));
    if (!arts.length) return;
    arts.forEach(function (art, i) {
      var h = art.querySelector('h2, h3');
      var label = h ? h.textContent.trim() : art.id;
      var det = document.createElement('details');
      det.className = 'case-block';
      det.id = art.id;
      art.removeAttribute('id');
      if (i === 0) det.open = true;
      var sum = document.createElement('summary');
      sum.className = 'case-sum';
      sum.innerHTML = '<span class="case-sum-t"></span><span class="case-sum-mark" aria-hidden="true"></span>';
      sum.querySelector('.case-sum-t').textContent = label;
      // Заголовок внутри статьи убираем: на экране он теперь один — в свёртке.
      // Двойной заголовок читался бы как повтор, а не как структура.
      if (h) {
        var head = h.parentNode;
        h.parentNode.removeChild(h);
        // .appx-doc-head без заголовка пустой — он рисует рамку, и пустая полоса
        // осталась бы висеть над таблицей.
        if (head && head.classList && head.classList.contains('appx-doc-head') && !head.children.length) {
          head.parentNode.removeChild(head);
        }
      }
      art.parentNode.insertBefore(det, art);
      det.appendChild(sum);
      det.appendChild(art);
    });

    // Управление всеми сразу — готовая полоса из разметки, СНАРУЖИ прокрутки
    // (см. комментарий там же). Здесь только включаем её и вешаем обработчик.
    var bar = el('caseBar');
    if (bar) {
      bar.style.display = '';
      bar.addEventListener('click', function (e) {
        var v = e.target.getAttribute && e.target.getAttribute('data-caseall');
        if (v === null || v === undefined) return;
        var open = v === '1';
        host.querySelectorAll('details.case-block').forEach(function (d) { d.open = open; });
      });
    }

  }

  // Раскрыть свёртку, внутри которой лежит узел: переход по пометке или по ссылке
  // на приложение обязан довести до текста, а не до закрытой полосы.
  function openCaseBlockOf(node) {
    var n = node;
    while (n && n !== document.body) {
      if (n.tagName === 'DETAILS') n.open = true;
      n = n.parentNode;
    }
  }

  // ── ССЫЛКИ НА ПРИЛОЖЕНИЯ И ВОЗВРАТ НА СТРОКУ ЧТЕНИЯ ──────────────────────────
  // В тексте кейса приложения упомянуты словами: «(детально — П1)», «(П1, сноска б)».
  // Ссылками они не были — ни одной, проверено по файлу, — поэтому участник, дойдя до
  // «см. П5», уходил искать П5 прокруткой и терял строку, на которой читал. Это налог
  // на память и внимание, а ни одна способность его не мерит.
  //
  // КЕЙС ПРИ ЭТОМ НЕ ПРАВИТСЯ: ссылки навешиваются здесь, по тексту, уже загруженному
  // в панель. Правило проекта — кейс правится только новой версией файла, — остаётся
  // в силе, а новая версия получит ссылки тем же кодом.
  // Трогаем ТОЛЬКО разделы (sec-*): в приложениях единственное упоминание «П1» — это
  // их собственный заголовок, и ссылка на самого себя была бы бессмыслицей.
  var caseReturn = null;   // { top, opened: [ids] } — куда вернуть и что мы раскрыли

  function linkAppendices() {
    var host = el('supCaseText');
    var arts = host.querySelectorAll('.case-block[id^="sec-"] article');
    if (!arts.length) return;
    var nodes = [];
    for (var a = 0; a < arts.length; a++) {
      var w = document.createTreeWalker(arts[a], NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = w.nextNode())) {
        if (!/П\d/.test(n.nodeValue)) continue;
        if (n.parentNode && (n.parentNode.tagName === 'A' || n.parentNode.tagName === 'SUMMARY')) continue;
        nodes.push(n);
      }
    }
    nodes.forEach(function (node) {
      // П10 в разборе идёт ПЕРВЫМ: иначе «П1» съест первую цифру и останется «0».
      // (?!\d) не даёт зацепить будущие П11+ как «П1» с хвостом.
      var parts = String(node.nodeValue).split(/(П(?:10|[1-9])(?!\d))/);
      if (parts.length < 2) return;
      var frag = document.createDocumentFragment();
      parts.forEach(function (piece) {
        if (/^П(?:10|[1-9])$/.test(piece)) {
          var link = document.createElement('a');
          link.className = 'appx-ref';
          link.setAttribute('href', '#');
          link.setAttribute('data-appx', piece.slice(1));
          link.textContent = piece;
          frag.appendChild(link);
        } else if (piece) {
          frag.appendChild(document.createTextNode(piece));
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  // Уйти в приложение, запомнив строку чтения. Возврат — кнопкой, а не браузерным
  // «назад»: назад увёл бы со страницы ассессмента целиком.
  function goToAppendix(num) {
    var host = el('supCaseText');
    var target = host.querySelector('#appx-' + num);
    if (!target) return;
    var opened = [];
    if (!target.open) { target.open = true; opened.push(target.id); }
    caseReturn = { top: host.scrollTop, opened: opened };
    host.scrollTop += target.getBoundingClientRect().top - host.getBoundingClientRect().top - 8;
    showCaseReturn(true);
  }

  function showCaseReturn(on) {
    var bar = el('caseBack');
    if (!bar) return;
    bar.style.display = on ? '' : 'none';
  }

  function backToReading() {
    var host = el('supCaseText');
    if (!caseReturn) { showCaseReturn(false); return; }
    // Раскрытое приложение сворачиваем обратно ТОЛЬКО если открыли его мы: если
    // участник сам его открывал раньше, закрывать за ним — правка его состояния.
    (caseReturn.opened || []).forEach(function (id) {
      var d = host.querySelector('#' + id);
      if (d) d.open = false;
    });
    host.scrollTop = caseReturn.top;
    caseReturn = null;
    showCaseReturn(false);
  }

  // Вкладка «Мои ответы»: только зафиксированное. Незаполненное окно здесь не
  // показывается — иначе панель печатала бы карту вопросов дня вперёд, то есть
  // выдавала бы ось замера до того, как вопрос задан.
  function answersHtml() {
    var out = '';
    S.windows().forEach(function (w) {
      // Механики отдают свой след сами: у них нет одного поля ответа, есть ветка
      // состояния. Без этой ветки вкладка «Мои ответы» после маршрута v4.4.f была
      // бы почти пустой — семь шагов из двенадцати не показывали бы ничего, а
      // именно в них с 05.08 живёт основной текст участника.
      if (w.mech) {
        if (!(state.mechAt && state.mechAt[w.mech])) return;
        out += '<div class="recap-item">' +
          '<div class="recap-q">' + esc(w.scene.name) + ' · ' + esc(mechTitle(w.mech)) + '</div>' +
          '<div class="recap-a">' + mechAnswerHtml(w.mech) + '</div></div>';
        return;
      }
      if (!state.answersAt[w.save]) return;
      var val = state.answers[w.save];
      out += '<div class="recap-item">' +
        '<div class="recap-q">' + esc(w.scene.name) + ' · ' + esc(w.label) + '</div>' +
        '<div class="recap-a">' + (String(val || '').trim() ? br(val) : '<i>промолчали</i>') + '</div>' +
        '</div>';
    });
    if (state.picksAt) {
      var t = totals(), p = picksForJudge(), byId = {};
      BACKLOG.forEach(function (it) { byId[it.id] = it; });
      var line = function (ids) {
        return ids.map(function (id) {
          var it = byId[id] || {};
          return '<li><span class="bl-num">' + blNum(id) + '</span> ' + esc(it.title || '') +
            '<span class="recap-cost">' + (it.people || 0) + ' чел. · ' + num(it.money || 0) + ' млрд</span>' +
            '</li>';
        }).join('');
      };
      out += '<div class="recap-item">' +
        '<div class="recap-q">Кабинет Агеева · разбор портфеля</div>' +
        '<div class="recap-a">' +
          '<p style="margin:0 0 8px;">' + t.people + ' человек из ' + LIM.people + ' · ' + num(t.money) + ' млрд из ' + LIM.money +
          (t.over ? ' — за рамкой' : ' — в рамке') + '</p>' +
          '<p style="margin:10px 0 4px;"><b>Берём (' + p.taken.length + ')</b></p><ul class="recap-list">' + line(p.taken) + '</ul>' +
          '<p style="margin:10px 0 4px;"><b>Не сейчас (' + p.dropped.length + ')</b></p><ul class="recap-list">' + line(p.dropped) + '</ul>' +
        '</div></div>';
    }
    return out || '<p class="support-note">Пока ничего не зафиксировано.</p>';
  }

  function renderAnswersTab() {
    var host = el('supAnswersBody');
    host.innerHTML = answersHtml();
    if (window.imp && window.imp.typoDom) window.imp.typoDom(host);
  }

  // ---------- блоки разговора ----------

  // Заголовок сцены — МЕСТО И ДЕНЬ, без номера разговора (решение владельца 04.08).
  // Номер стоял здесь и в шапке экрана; оба места противоречили СПЕК §4.4, где
  // прогресс дня живёт только на межсценовом экране, потому что в рабочей области
  // он превращает ответ в норматив. Место и день остаются: без них участник не
  // понимает, где он, а «где» ни одной способностью не измеряется.
  // Прогресс дня остался ровно в одном месте — interludeWhen.
  // Заголовок рабочей колонки называет ТЕКУЩИЙ ШАГ (решение владельца 07.08): участник
  // видит, что он сейчас делает, а не в какой сцене находится. Место и время — второй
  // строкой: они ситуируют разговор, но это не название работы.
  function stepTitle(act) {
    if (!act) return '';
    if (act.kind === 'mechanic') return mechTitle(act.mech);
    if (act.kind === 'window') return act.label || '';
    if (act.kind === 'case') return 'Материалы';
    return '';
  }

  function sceneHead(scene, act) {
    var t = stepTitle(act);
    t = t ? t.charAt(0).toUpperCase() + t.slice(1) : esc(scene.name);
    return '<div class="sc-head">' +
      '<span class="sc-head-name">' + esc(t) + '</span>' +
      '<span class="sc-head-sep">·</span>' +
      '<span class="sc-head-where">' + esc(scene.place || scene.name) + ', ' + esc(scene.where) + '</span>' +
      '</div>';
  }

  function windowBlock(act, locked) {
    var d = document.createElement('div');
    d.className = 's2-block';
    var val = state.answers[act.save] || '';
    if (locked) { d.innerHTML = meHtml(val, state.answersAt[act.save]); return d; }
    d.innerHTML =
      '<div class="s2-mine"><span class="chat-name">Вы</span>' +
        '<label class="win-label" for="winInput">' + esc(act.label) + '</label>' +
        // data-answer="1" — метка для сборщика телеметрии: он считает ТОЛЬКО поля
        // ответа. Без метки поле не попадёт в замер вставок и набора, то есть
        // маркер ИИ по этому окну не сработает.
        '<textarea id="winInput" class="win-input" data-answer="1" rows="9" aria-label="' + esc(act.label) + '" placeholder="' + esc(act.placeholder || 'ваш ответ') + '">' + esc(val) + '</textarea>' +
      '</div>' +
      // Порядок [записка, кнопка] обязателен: ряд прижат вправо, значит последний
      // элемент стоит у самого края. При обратном порядке кнопка «Ответить» уезжала
      // влево от записки — на широком экране на четыреста пикселей от края, тогда
      // как «Зафиксировать разбор» (порядок правильный) стояла у края. Именно это
      // видел владелец: действие прыгало от экрана к экрану.
      '<div class="win-foot">' +
        '<span class="win-note">Ответ зафиксируется: вернуться и переписать его нельзя.</span>' +
        '<button class="btn btn-primary" id="commitBtn">Ответить →</button>' +
      '</div>';

    var ta = d.querySelector('#winInput');
    // Поле растёт под ответ: писать письмо правлению в одиннадцать видимых строк,
    // не видя начала, — это про выносливость, а не про мышление. Обратной связи о
    // качестве или объёме здесь нет: реплики не меняются, ничего не подсвечивается.
    var grow = function () {
      ta.style.height = 'auto';
      ta.style.height = Math.max(200, ta.scrollHeight + 2) + 'px';
    };
    ta.addEventListener('input', function (e) {
      state.answers[act.save] = e.target.value;
      grow();
      saveState();
    });
    setTimeout(grow, 0);
    d.querySelector('#commitBtn').addEventListener('click', function () {
      var go = function () {
        state.answers[act.save] = ta.value;
        state.answersAt[act.save] = nowIso();
        advance();
      };
      // ПУСТОЙ ОТВЕТ НЕ ФИКСИРУЕТСЯ. Это гейт формы, а не настойка: план стр. 471
      // прямо разделяет одно и другое — «гейты фиксации не являются настойкой,
      // потому что это форма, а не давление на содержание». Настойка запрещена
      // строкой 469 и касается СОДЕРЖАНИЯ: встречный вопрос вместо ответа мы
      // принимаем как есть, флагуем и идём дальше. Любой непустой текст проходит,
      // включая «не знаю» и встречный вопрос, — на содержание мы не давим.
      // В демо гейт не работает: витрина должна пролистываться.
      if (!String(ta.value).trim()) {
        if (isDemo) { go(); return; }
        // Ситуативная часть — из сцены (кто ждёт и почему), а инвариантная
        // приписка одна на все окна и живёт здесь: так она не может разойтись
        // по сценам, как не может разойтись строка настроя межсценового экрана.
        window.imp.alert((act.silence ? act.silence + ' ' : '') +
          'Ответьте своими словами — если сказать нечего, напишите это словами.');
        try { ta.focus(); } catch (e) {}
        return;
      }
      go();
    });
    return d;
  }

  // Какие доводы авторов раскрыты кнопкой «почему». Не пишется в состояние и не
  // уходит на сервер: это не ответ, а способ читать список.
  var openArg = {};

  // ---------- мост к реестру механик (js/mechanics.js) ----------
  // Движок остаётся распорядителем: он даёт механике место в DOM, состояние,
  // сохранение и подвал с кнопкой — и забирает у неё гейт. Ничего про замер он не
  // знает, а механика ничего не знает про маршрут: единственная связь — этот ctx.
  function mechState(name, def) {
    if (!state.mech) state.mech = {};
    if (!state.mech[name]) state.mech[name] = def ? def() : {};
    return state.mech[name];
  }
  // Название шага для вкладки «Мои ответы» и свода. Живёт рядом с реестром, а не в
  // scenes.js: это подпись СЛЕДА механики, а не реплика маршрута.
  var MECH_TITLES = {
    theses: 'тезисы и связки', variants: 'варианты', list: 'разбор заявок',
    seal: 'печать', futures: 'варианты будущего', goal: 'цель', letter: 'письмо правлению'
  };
  function mechTitle(name) { return MECH_TITLES[name] || name; }
  function mechAnswerHtml(name) {
    var spec = window.imp.mechanics[name];
    var m = state.mech && state.mech[name];
    if (!spec || !m) return '<i>не заполнено</i>';
    // Полный след — дело самой механики (она знает свою форму); если она его не
    // умеет, показываем хотя бы свод, а не пустоту.
    if (spec.answerHtml) return spec.answerHtml(m, mechCtx());
    return spec.locked(m, mechCtx());
  }

  function mechCtx(refreshGate) {
    return {
      esc: esc, br: br, num: num, blNum: blNum, BACKLOG: BACKLOG, LIM: LIM, isDemo: isDemo,
      save: function () { saveState(); },
      sync: refreshGate || function () {},
      // Доступ к соседней ветке: список инициатив (С3) обязан видеть варианты,
      // которые участник назвал в С2, — иначе своё вообще не попадает на стол.
      mech: function (name) { return (state.mech && state.mech[name]) || null; },
      // Выписки участника — механикам НУЖНЫ, чтобы тезис можно было опереть на
      // цитату, а не на перепечатанную ссылку. Отдаём копию массива: механика
      // читает пометки, но не правит их — правит их только вкладка «Пометки».
      marks: function () { return (state.marks || []).slice(); },
      // Перерисовать текущий акт целиком, включая подвал: механике этого не сделать
      // самой, потому что подвал живёт в другой колонке (движок его туда переносит).
      redraw: function () { render(); },
      // ⚠ ЕДИНСТВЕННОЕ ОТСТУПЛЕНИЕ ОТ НЕОБРАТИМОСТИ ДНЯ, и оно из лора: печать
      // (С3б) даёт участнику один возврат к списку — «Вернуться и изменить». Без
      // него маркер устойчивости под давлением вырождается: «утвердил» и «вернулся
      // и изменил» — разные поступки, и различить их можно только дав второй.
      // Возврат ровно один, его считает сама механика печати; движок лишь двигает
      // курсор на акт с нужной механикой и снимает отметку фиксации, иначе список
      // отрисовался бы запертым.
      jumpBackTo: function (mechName) {
        for (var i = state.cursor; i >= 0; i--) {
          if (route[i] && route[i].act && route[i].act.mech === mechName) {
            state.cursor = i;
            if (state.mechAt) delete state.mechAt[mechName];
            saveState(); render();
            return true;
          }
        }
        return false;
      }
    };
  }
  // Механика реестра. Отличается от прежнего разбора заявок тем, что не знает ни
  // одной подробности про маршрут: всё, что ей нужно, лежит в act.mech и ctx.
  function registryBlock(act, locked) {
    var spec = window.imp.mechanics[act.mech];
    var d = document.createElement('div');
    d.className = 's2-block bl-host';
    var m = mechState(act.mech, spec.init);
    if (locked) {
      d.innerHTML = '<div class="bl-locked">' + spec.locked(m, mechCtx()) + '</div>';
      return d;
    }
    var foot = spec.foot(m, mechCtx());
    // Порядок ряда: записка — потом обе кнопки рядом (решение владельца 07.08).
    // Записка объясняет именно второстепенное действие («вернуться можно один раз»),
    // поэтому стоит перед ним, а не между кнопками.
    d.innerHTML = '<div class="mx-host"></div>' +
      '<div class="win-foot">' +
        '<span class="win-note">' + esc(foot.note) + '</span>' +
        (foot.extra || '') +
        '<button class="btn btn-primary" id="fixBtn">' + esc(foot.cta) + '</button>' +
      '</div>';
    var btn = d.querySelector('#fixBtn');
    var refresh = function () { btn.disabled = !!spec.gate(m, mechCtx()); };
    spec.render(d.querySelector('.mx-host'), m, mechCtx(refresh));
    if (spec.footWire) spec.footWire(d.querySelector('.win-foot'), m, mechCtx(refresh));
    refresh();
    btn.addEventListener('click', function () {
      var fail = spec.gate(m, mechCtx());
      // Кнопка и так выключена при незакрытом гейте — alert остаётся на случай
      // клика по включённой кнопке в момент, когда состояние успело измениться.
      if (fail) { window.imp.alert(fail); return; }
      // Механика может забрать главную кнопку себе и НЕ пускать день дальше:
      // печать так делает первый шаг («Утверждаю» ещё не значит «дальше» — после
      // него появляется поле объяснения). Возврат false = «я перерисовалась сама».
      if (spec.onCta && spec.onCta(m, mechCtx(refresh)) === false) return;
      state.mechAt[act.mech] = nowIso();
      saveState();
      advance();
    });
    if (window.imp && window.imp.typoDom) window.imp.typoDom(d);
    return d;
  }

  function mechanicBlock(act, locked) {
    // Новые механики лора идут через реестр; старый разбор заявок (act без .mech)
    // остаётся здесь, пока маршрут не переведён целиком.
    if (act.mech && window.imp.mechanics && window.imp.mechanics[act.mech]) return registryBlock(act, locked);
    var d = document.createElement('div');
    d.className = 's2-block bl-host';
    if (locked) {
      var tl = totals();
      d.innerHTML = '<div class="bl-locked"><b>' + tl.taken + '</b> берём · <b>' + tl.dropped + '</b> не сейчас · ' +
        tl.people + ' человек из ' + LIM.people + ' · ' + num(tl.money) + ' млрд из ' + LIM.money +
        (tl.over ? ' <span class="bl-over-tag">за рамкой</span>' : '') +
        ' <span class="bl-locked-hint">разбор целиком — во вкладке «Мои ответы»</span></div>';
      return d;
    }
    d.innerHTML =
      '<div class="bl-sum-host"></div>' +
      '<div class="bl-decided"></div>' +
      '<div class="bl-list"></div>' +
      '<div class="bl-hint" style="display:none;"></div>' +
      // Тот же класс .win-foot, что у окон: движок переносит этот узел в подвал
      // колонки, и правило «главное действие не требует прокрутки» одно на все акты.
      '<div class="win-foot">' +
        '<span class="win-note">Разбор зафиксируется: переиграть его нельзя.</span>' +
        '<button class="btn btn-primary" id="fixBtn">Зафиксировать разбор →</button>' +
      '</div>';

    function renderList() {
      var t = totals();
      // Счётчик показывает ОСТАТОК, а не только набранное: арифметику «сколько ещё
      // влезает» участник не должен делать в голове — её не меряет ни одна
      // способность. Подсветки «что ещё влезет» нет: это была бы подсказка отбора.
      d.querySelector('.bl-sum-host').innerHTML =
        // Счётчик СПОКОЙНЫЙ: числа без красного и без слова «перебор». Выйти за
        // рамку Агеев разрешил вслух («тогда скажете, чем платите»), и подсветка
        // тревогой читалась бы как «так нельзя» — то есть подталкивала бы к
        // единственному «правильному» поведению там, где мы меряем выбор.
        // Факт перебора не теряется: он считается кодом, уходит судье в fitsFrame
        // и вызывает отдельный вопрос Агеева.
        '<div class="bl-sum">' +
        '<span class="bl-sum-item"><b>' + t.taken + '</b> берём</span>' +
        '<span class="bl-sum-item"><b>' + t.people + '</b> из ' + LIM.people + ' человек</span>' +
        '<span class="bl-sum-item"><b>' + num(t.money) + '</b> из ' + LIM.money + ' млрд</span>' +
        (t.undecided ? '<span class="bl-sum-left">осталось решить: ' + t.undecided + '</span>' : '') +
        '</div>';

      var taken = [], dropped = [], undecided = [];
      BACKLOG.forEach(function (it) {
        var p = pickOf(it.id);
        if (!p) undecided.push(it); else if (p.take) taken.push(it); else dropped.push(it);
      });

      // Нерешённое — компактными карточками в два ряда по десять; решённое уезжает
      // в свой столбик, и портфель собирается на глазах. Замер прототипа: 2×10 с
      // доводом под «почему» — 2,6 экрана прокрутки против 5,5 у списка в один ряд.
      // Номер на экране — порядковый, через blNum() (см. BL_NUM в начале файла).
      // Внутренним ключом picks и записей судьи остаётся id.
      var list = d.querySelector('.bl-list');
      list.innerHTML = undecided.length
        ? '<div class="bl-zone-h">не решено <b>' + undecided.length + '</b></div><div class="bl-grid">' +
          undecided.map(function (it) {
            var open = openArg[it.id];
            return '<div class="bl-card' + (open ? ' is-open' : '') + '" data-card="' + it.id + '">' +
              '<div class="bl-card-top"><span class="bl-n">' + blNum(it.id) + '</span>' +
                '<span class="bl-card-cost">' + it.people + ' чел. · ' + num(it.money) + ' млрд</span></div>' +
              '<div class="bl-card-title">' + esc(it.title) + '</div>' +
              '<div class="bl-card-who">' + esc(it.who) + '</div>' +
              (open && it.argument ? '<p class="bl-card-arg">' + esc(it.argument) + '</p>' : '') +
              '<div class="bl-card-acts">' +
                '<button type="button" class="s2-act" data-take="' + it.id + '">беру</button>' +
                '<button type="button" class="s2-act" data-drop="' + it.id + '">не сейчас</button>' +
                (it.argument ? '<button type="button" class="bl-why" data-why="' + it.id + '">' + (open ? 'скрыть' : 'почему') + '</button>' : '') +
              '</div></div>';
          }).join('') + '</div>'
        : '<div class="bl-zone-h">все двадцать решены</div>';

      var dec = d.querySelector('.bl-decided');
      // Полей «почему не сейчас» здесь БОЛЬШЕ НЕТ. Механика — это поступок:
      // раскидать двадцать позиций, и всё. Объяснение отказа спрашивает Агеев
      // следующей репликой, называя две самые дорогие по людям отложенные позиции,
      // и ответ идёт в окно q2 — туда, где судья читает текст. Комментарий у
      // каждой позиции был вторым запросом того же самого и, будучи обязательным,
      // давал строки, написанные ради кнопки.
      var col = function (title, arr, kind) {
        var rows = arr.map(function (it) {
          return '<div class="bl-row">' +
            '<span class="bl-n">' + blNum(it.id) + '</span>' +
            '<span class="bl-row-t">' + esc(it.title) +
              '<span class="bl-mini-who">' + esc(it.who) + ' · ' + it.people + ' чел. · ' + num(it.money) + ' млрд</span></span>' +
            '<button type="button" class="bl-row-back" data-flip="' + it.id + '">' +
              (kind === 'taken' ? 'не сейчас' : 'беру') + '</button>' +
            '</div>';
        }).join('');
        return '<div><div class="bl-col-head">' + title + ' <span>· ' + arr.length + '</span></div>' +
          (rows || '<p class="bl-empty">пока ничего</p>') + '</div>';
      };
      // Сумма по «не сейчас» НЕ показывается: «высвобожденный ресурс» — верхний
      // маркер ПР-1 (граница 3→4), посчитать его за участника значит выдать
      // половину признака. Рамку по взятому Агеев назвал вслух сам.
      dec.innerHTML = '<div class="bl-zone-h">портфель</div><div class="bl-cols">' +
        col('Берём', taken, 'taken') + col('Не сейчас', dropped, 'dropped') + '</div>';

      var hint = d.querySelector('.bl-hint');
      var lines = [];
      if (t.over) {
        lines.push('Набрано ' + t.people + ' человек при ' + LIM.people + ' и ' + num(t.money) +
          ' млрд при ' + LIM.money + '. Выйти за рамку можно — Агеев тогда спросит, чем платите.');
      }
      hint.innerHTML = lines.join('<br />');
      hint.style.display = lines.length ? '' : 'none';
      if (window.imp && window.imp.typoDom) window.imp.typoDom(d);
    }

    d.addEventListener('click', function (e) {
      var why = e.target.getAttribute && e.target.getAttribute('data-why');
      if (why) { openArg[why] = !openArg[why]; renderList(); return; }
      var take = e.target.getAttribute && e.target.getAttribute('data-take');
      var drop = e.target.getAttribute && e.target.getAttribute('data-drop');
      var flip = e.target.getAttribute && e.target.getAttribute('data-flip');
      var id = take || drop || flip;
      if (!id) return;
      var prev = pickOf(id);
      var next = flip ? !(prev && prev.take) : !!take;
      // Уход карточки заметен глазу: без короткой анимации следующая карточка
      // мгновенно прыгает под курсор, и второй клик попадает не туда.
      var card = d.querySelector('.bl-card[data-card="' + id + '"]');
      if (card && (take || drop)) card.classList.add('is-leaving');
      // Решение — это только «берём / не сейчас». Поля причины у позиции больше
      // нет, поэтому и хранить нечего: объяснение отказа живёт в ответе на вопрос
      // Агеева про две названные позиции.
      state.picks[String(id)] = { take: next };
      saveState();
      if (card && (take || drop)) { setTimeout(renderList, 180); } else renderList();
    });
    d.querySelector('#fixBtn').addEventListener('click', function () {
      var fail = gateFailure(act);
      if (fail) { window.imp.alert(fail); return; }
      state.picksAt = nowIso();
      advance();
    });

    renderList();
    return d;
  }

  // ── БЛОК «СЛУШАЮ»: реплики целиком и кнопка-реплика участника ──
  // Кнопка сформулирована как ЕГО ответ («Спасибо, приступаю»), а не как команда
  // интерфейса («Далее»): участник не листает экраны, он отвечает собеседнику.
  // Текст кнопки и подпись свёртки — данные (act.fold в scenes.js), потому что это
  // текст для участника, а такого текста вне scenes.js быть не может.
  function listenBlock(act, speeches) {
    var d = document.createElement('div');
    d.className = 's2-block talk-listen';
    d.innerHTML = speeches.map(speechHtml).join('') +
      '<div class="win-foot">' +
        '<span class="win-note">' + esc(act.fold.note || '') + '</span>' +
        '<button class="btn btn-primary" id="listenBtn">' + esc(act.fold.cta) + '</button>' +
      '</div>';
    d.querySelector('#listenBtn').addEventListener('click', function () {
      if (!state.entered) state.entered = {};
      state.entered[act.id] = nowIso();
      saveState();
      render();
    });
    return d;
  }

  // ── СВЁРНУТЫЕ РЕПЛИКИ: одна строка вместо семи пузырей ──
  // Раскрывается кликом и остаётся раскрытой до следующей перерисовки: перечитать
  // сказанное надо уметь всегда — тот же принцип, по которому кейс открыт до конца.
  function foldedSpeech(act, speeches) {
    var foldCount = speeches.reduce(function (n, a) {
      return n + ((a.bubbles || []).length || 1);
    }, 0);
    var det = document.createElement('details');
    det.className = 's2-block talk-folded';
    det.innerHTML = '<summary class="talk-folded-sum">' +
        '<span class="talk-folded-t">' + esc(act.fold.label) + '</span>' +
        // Считаем ПУЗЫРИ, а не акты: в сцене 1 один акт на семь пузырей, и «1
        // реплика» противоречило бы тому, что участник только что прочитал.
        '<span class="talk-folded-n">' + foldCount + ' ' +
          plural(foldCount, 'реплика', 'реплики', 'реплик') + ' · показать</span>' +
      '</summary><div class="talk-folded-body">' + speeches.map(speechHtml).join('') + '</div>';
    return det;
  }

  // Свод дня перед письмом: не вторая копия ответов в ленте, а переключение опоры
  // на вкладку «Мои ответы». Требование плана — «участник видит свой день перед
  // тем, как писать письмо» — выполняется, а 1600 пикселей дубля не появляется.
  function recapBlock(act) {
    var d = document.createElement('div');
    d.className = 's2-block recap-pointer';
    d.innerHTML = '<p class="kicker">' + esc(act.title) + '</p>' +
      // «справа», а не «слева»: опора переехала вправо 05.08 вместе с обменом колонок.
      '<p class="section-lead" style="margin:0;">' + esc(act.lead) + ' Всё, что вы сказали, — во вкладке «Мои ответы» справа.</p>';
    if (!recapShown) { recapShown = true; setTab('answers'); }
    return d;
  }


  // ---------- рендер ----------

  // Экран чтения: тело кейса (#supCase) и кнопка «Прочитал» переезжают в среднюю
  // колонку, панель справа остаётся со своими вкладками, вкладка «Кейс» скрыта.
  // ⚠ Переносится сам узел, а не копия: на нём кнопка отметки у выделения, ссылки на
  // приложения и подсветка выписок.
  function caseWideMove(on) {
    var wide = el('caseWide'), sup = el('supportPane'), g = el('dayGrid');
    if (!wide || !sup) return;
    var body = el('supCase'), foot = el('caseReadFoot');
    if (!body) return;
    // ⚠ Ниже 1360 третьей колонки нет: пакету нужна вся ширина (то же правило, по
    // которому на ноутбуке исчезает колонка работы). Значит переезда тоже нет —
    // кейс читается вкладкой «Кейс» в панели, как на рабочих экранах. Порог один и
    // тот же здесь и в CSS.
    if (on && !window.matchMedia('(min-width: 1361px)').matches) on = false;
    if (on) {
      wide.appendChild(body);
      if (foot) wide.appendChild(foot);
    } else if (body.parentNode !== sup) {
      // ⚠ Порядок узлов обязан совпадать с порядком вкладок: иначе tab и скринридер
      // пойдут не так, как глаз.
      sup.insertBefore(body, el('supRef'));
      if (foot) sup.appendChild(foot);
    }
    if (g) g.classList.toggle('is-casewide', !!on);
  }

  // Порог 1360 могли пересечь посреди чтения — переезд пересобирается.
  window.addEventListener('resize', function () {
    var g = el('dayGrid');
    if (!g) return;
    if (g.classList.contains('is-reading')) caseWideMove(true);
  });

  var wasReading = false;

  function readingMode(on, act) {
    var g = el('dayGrid');
    g.classList.toggle('is-reading', !!on);
    caseWideMove(!!on);
    el('caseReadFoot').style.display = on ? '' : 'none';
    var intro = el('caseIntro');
    if (intro) intro.style.display = on ? '' : 'none';
    if (!on) {
      // ⚠ Ровно один раз на переходе: render() зовёт readingMode(false) на каждом шаге,
      // и без флага выбор вкладки участника сбрасывался бы после каждого ответа.
      if (wasReading) setTab('case');
      wasReading = false;
      return;
    }
    wasReading = true;
    // Кейс переехал в середину — открыты пометки; если переезда не было (ниже 1360),
    // открыт кейс.
    setTab(g.classList.contains('is-casewide') ? 'marks' : 'case');
    // Шапка пакета: что это за пакет (act.lead) и как работают пометки (act.marks).
    // Только на экране чтения — в панели рядом с разговором эта строка была бы
    // инструкцией, которую участник уже прочитал, на месте, где ему нужен текст.
    // ⚠ act.lead до 06.08 не показывался ВООБЩЕ: он рисовался внутри введения в
    // роль, а введение уехало на свой экран — строка про пакет уехала вместе с ним.
    if (intro && !intro.dataset.filled) {
      intro.innerHTML =
        (act.lead ? '<p class="case-intro-lead">' + br(act.lead) + '</p>' : '') +
        (act.marks ? '<p class="case-intro-marks">' + br(act.marks) + '</p>' : '');
      intro.dataset.filled = '1';
      if (window.imp && window.imp.typoDom) window.imp.typoDom(intro);
    }
    el('hdrDayName').textContent = '«Искра» · материалы';
    // act.note у акта чтения снят 04.08 (строка уехала в установку), но поле
    // оставлено: подвал один на все акты этого вида, и если у следующего пакета
    // примечание к действию появится, ему есть куда встать. Пустой span скрыт
    // правилом .win-note:empty, иначе он держал бы отступ рядом с кнопкой.
    el('caseReadNote').textContent = act.note || '';
    var cta = el('caseReadCta');
    cta.textContent = act.cta || 'Дальше →';
    cta.onclick = function () { el('hdrDayName').textContent = '«Искра» · ассессмент'; advance(); };
  }

  // Межсценовый экран: перекрывает рабочую область, оставляя кейс и оглавление на
  // месте. Строка настроя берётся из S.interlude — она ОДНА на все переходы, и
  // это не экономия: разная строка подсказывала бы предмет замера следующей сцены.
  function interludeMode(on, step) {
    var box = el('interlude');
    if (!box) return;
    box.style.display = on ? 'flex' : 'none';
    if (!on) return;
    var I = S.interlude || { lead: [], cta: 'Дальше →' };
    var bridge = step.scene.bridge || {};
    // Штамп берём по последнему СОСТОЯВШЕМУСЯ шагу, а не по свободным окнам: семь
    // шагов из двенадцати — механики, и по одним answersAt на переходе из первого
    // этапа штамп был пустым (первый шаг — механика тезисов).
    var lastAt = '';
    S.windows().forEach(function (w) {
      var at = w.mech ? (state.mechAt && state.mechAt[w.mech]) : state.answersAt[w.save];
      if (at) lastAt = at;
    });
    // Заголовок — данные: после первого этапа тезисы УХОДЯТ Агееву в мессенджер, и
    // «ответ отправлен» там правда; на остальных переходах ничего никуда не уходит,
    // и правда — «зафиксирован».
    var sent = bridge.sent || I.sent || 'Ответ зафиксирован';
    el('interludeMark').textContent = lastAt ? '✓ ' + sent + ' · ' + hhmm(lastAt) : '✓ ' + sent;
    el('interludeBridge').innerHTML = (bridge.lead || []).map(function (p) {
      return '<p class="interlude-bridge-p">' + br(p) + '</p>';
    }).join('');
    el('interludeWhere').textContent = step.scene.name;
    // «Этап N из 7», а не «Разговор N из 7»: у части ассессмента одно имя, и оно
    // стоит в столбике слева (решение владельца 06.08). Материалы — тоже этап,
    // поэтому знаменатель — все сцены, включая первую.
    el('interludeWhen').textContent = 'Этап ' + (step.sceneIx + 1) + ' из ' + S.scenes.length +
      ' · ' + step.scene.where;
    el('interludeLead').innerHTML = (I.lead || []).map(function (p) { return '<p style="margin:0 0 6px;">' + br(p) + '</p>'; }).join('');
    var cta = el('interludeCta');
    cta.textContent = I.cta || 'Дальше →';
    cta.onclick = function () { advance(); };
    if (window.imp && window.imp.typoDom) window.imp.typoDom(box);
  }

  function render() {
    var cur = route[state.cursor];
    // Маршрут рисуется ПЕРВЫМ и до всех возвратов: страница чтения пакета выходит
    // из render() сразу, и при вызове в конце левая колонка на первом же шаге дня
    // оставалась без маршрута — то есть ровно там, где участник впервые её видит.
    renderRoute();
    if (cur && applies(cur.act) && cur.act.kind === 'case') { readingMode(true, cur.act); return; }
    readingMode(false);
    interludeMode(!!(cur && applies(cur.act) && cur.act.kind === 'interlude'), cur || { scene: S.scenes[0], sceneIx: 0 });

    var hist = el('talkHistory');
    var now = el('talkCurrent');
    hist.innerHTML = '';
    now.innerHTML = '';

    var curSceneIx = cur ? cur.sceneIx : S.scenes.length - 1;

    // ⚠ Свёрнутых строк прошлых этапов нет (решение владельца 06.08: дублировали
    // столбик этапов). Пройденное — вермилионная галочка в столбике, ответы — вкладка
    // «Мои ответы». Следствие: реплики персонажей из прошлых этапов не перечитать.
    hist.style.display = 'none';

    // ── ДВА ТАКТА ОДНОГО ШАГА: сначала слушаю, потом работаю ──────────────────
    // Решение владельца 06.08. Раньше реплики и рабочая область стояли в одном
    // потоке: участник читал семь пузырей и сразу под ними видел поле — и ни
    // прочитанное, ни работа не занимали экран целиком. Теперь у шага с полем
    // fold два такта:
    //   1) реплики целиком + кнопка-РЕПЛИКА участника («Спасибо, приступаю»);
    //   2) реплики свёрнуты в одну строку, рабочая область занимает экран.
    // Свёрнутая строка раскрывается обратно кликом: перечитать сказанное надо
    // уметь всегда, это тот же принцип, по которому кейс открыт до конца.
    // Такт хранится в state.entered — иначе перезагрузка страницы возвращала бы
    // участника к репликам, которые он уже отслушал.
    var scene = S.scenes[curSceneIx];
    now.insertAdjacentHTML('beforeend', sceneHead(scene, cur && cur.act));

    // Проход по актам ТЕКУЩЕЙ сцены. Реплики накапливаются и отдаются тому шагу,
    // перед которым стоят: у шага с полем fold они превращаются в один узел
    // (свёрнутая строка или блок «слушаю»), у шага без fold — рисуются как были.
    // ⚠ СВЁРТКА ДЕРЖИТСЯ И У ПРОЙДЕННЫХ ШАГОВ. Сначала она стояла только у текущего,
    // и монолог, свёрнутый на своём шаге, разворачивался обратно, едва шаг уезжал в
    // прошлое: лента снова становилась простыней, а участник видел, как то, что он
    // убрал, вернулось само.
    var pending = [];
    var flush = function () {
      pending.forEach(function (a) {
        var b = document.createElement('div');
        b.className = 's2-block';
        b.innerHTML = speechHtml(a);
        now.appendChild(b);
      });
      pending = [];
    };

    for (var i = 0; i < route.length; i++) {
      var st = route[i];
      if (st.sceneIx !== curSceneIx) continue;
      if (!applies(st.act)) continue;
      var past = i < state.cursor, current = i === state.cursor;
      if (!past && !current) break;

      if (st.act.kind === 'speech') { pending.push(st.act); continue; }

      var fold = st.act.fold;
      var entered = !fold || past || !!(state.entered && state.entered[st.act.id]);
      if (fold && pending.length) {
        now.appendChild(entered ? foldedSpeech(st.act, pending) : listenBlock(st.act, pending));
        pending = [];
      } else {
        flush();
      }
      // Пока участник не нажал кнопку-реплику, рабочей области ещё нет.
      if (fold && !entered) break;

      if (st.act.kind === 'recap') now.appendChild(recapBlock(st.act));
      // ⚠ Строки «✓ Пакет материалов прочитан» здесь больше нет (решение владельца
      // 07.08): пройденный шаг помечен галочкой в столбике этапов, и вторая отметка
      // над репликами повторяла её же.
      else if (st.act.kind === 'case') { /* отметка не рисуется */ }
      else if (st.act.kind === 'window') now.appendChild(windowBlock(st.act, past));
      else if (st.act.kind === 'mechanic') now.appendChild(mechanicBlock(st.act, past));
    }
    flush();

    if (state.cursor >= route.length && !state.finished) {
      var fin = document.createElement('div');
      fin.className = 's2-block';
      fin.innerHTML = '<div class="win-foot">' +
        '<span class="win-note">Ассессмент закроется: письмо уйдёт Агееву, ответы менять будет нельзя.</span>' +
        '<button class="btn btn-primary" id="finishBtn">Закончить ассессмент →</button></div>';
      fin.querySelector('#finishBtn').addEventListener('click', finish);
      now.appendChild(fin);
    }

    // Ряд действия переносим из прокрутки в подвал колонки. Именно переносим
    // узел, а не пересобираем разметку: обработчики уже висят на кнопке, и копия
    // означала бы вторую реализацию фиксации ответа.
    var actHost = el('talkAct');
    if (actHost) {
      actHost.innerHTML = '';
      var foot = now.querySelector('.win-foot');
      if (foot) actHost.appendChild(foot);
    }

    if (window.imp && window.imp.typoDom) window.imp.typoDom(now);
    if (supportTab === 'answers') renderAnswersTab();
    renderRoute();
    // Прокрутка: начало текущего разговора — к верху колонки. Считаем по rect'ам,
    // а не по offsetTop: offsetTop меряется от позиционированного предка, и первая
    // версия увозила шапку сцены за экран.
    // Мгновенно, без smooth: плавная прокрутка на первом рендере не срабатывает,
    // и после обновления страницы участник оказывался в начале ленты.
    var scroller = el('talkScroll');
    var head = now.querySelector('.sc-head');
    if (scroller && head) {
      // Ставим НАЧАЛО текущего разговора к верху колонки и на этом останавливаемся.
      // Доводить до поля ответа было ошибкой: реплика персонажа — это вопрос, и
      // прокрутка к полю пролистывала бы участнику вопрос, на который он отвечает.
      scroller.scrollTop += head.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12;
    }
  }

  // Счётчика «N / 6» в шапке нет (решение владельца 04.08, СПЕК §4.4: прогресс дня живёт
  // только на межэтапном экране). Если возвращать — сначала правится §4.4.

  function showFinish() {
    el('assessRoot').style.display = 'none';
    el('finishOverlay').style.display = 'flex';
    // Из демо выход ведёт на витрину, а не на вход по номеру (решение владельца
    // 04.08): демо смотрят с витрины, и отправлять человека на страницу входа
    // участника значит показывать ему гейт, к которому у него нет номера.
    if (isDemo) {
      var out = el('finishOverlay').querySelector('a.btn');
      if (out) { out.setAttribute('href', 'vitrina.html'); out.textContent = 'На витрину →'; }
    }
  }

  function finish() {
    state.finished = true;
    state.finishedAt = nowIso();
    saveState();
    clearTimeout(syncTimer);
    render();
    sync().then(showFinish, showFinish);
  }

  // ---------- старт без своего экрана ----------
  // ⚠ Экрана установки внутри ассессмента нет (решение владельца 06.08). Путь — три
  // экрана: intro.html → role.html → материалы; согласие на старт даёт кнопка на экране
  // роли, она приводит сюда с ?start=1. Без признака и без начатого прогона — на
  // первый экран пути.
  function startedFromRole() {
    try { return new URLSearchParams(location.search).get('start') === '1'; } catch (e) { return false; }
  }

  function showRoot() {
    var g = el('setupGate');
    if (g) g.style.display = 'none';
    el('assessRoot').style.display = '';
    render();
    if (state.finished) showFinish();
  }

  // ---------- старт ----------

  session = (function () { try { return window.imp.loadSession(); } catch (e) { return null; } })();
  // Запрет с телефона — раньше всего, даже раньше проверки сессии: с телефона
  // ассессмент не проходят ни в тесте, ни в живой волне (решение владельца 03.08).
  // Планшет разрешён — см. imp.isPhone.
  if (window.imp.isPhone && window.imp.isPhone()) {
    var R = window.imp.deviceReq || { head: 'Нужен компьютер', lead: '', tail: '' };
    el('phoneGateCard').innerHTML =
      '<p class="kicker">Не с телефона</p><h2>' + R.head + '</h2>' +
      '<p class="section-lead" style="margin:0 0 16px;">' + R.lead + '</p>' +
      '<p class="section-lead" style="margin:0;">' + R.tail + '</p>';
    el('phoneGate').style.display = 'flex';
    return;
  }

  if (!session || !session.bib) { el('gate').style.display = 'flex'; return; }

  // Сверка источников до первого рендера: разошёлся портфель — суммы в реплике
  // Агеева больше не описывают экран, и начинать разговор нельзя.
  if (S.backlogVersion !== window.imp.backlogVersion) {
    el('gate').style.display = 'flex';
    document.querySelector('#gate .gate-card').innerHTML =
      '<p class="kicker">Сборка маршрута</p><h2>Версии портфеля разошлись</h2>' +
      '<p class="section-lead">scenes.js ожидает портфель ' + esc(S.backlogVersion) +
      ', а backlog.js отдаёт ' + esc(window.imp.backlogVersion) + '.</p>';
    return;
  }

  // Номер и пароль всегда на виду. Так тестеру нечего запоминать и незачем
  // хранить письмо с доступами: чтобы продолжить с другого устройства, он
  // переписывает две строки из шапки. Демо-сессии пароля нет.
  var bibLabel = '№ ' + String(session.bib).padStart(6, '0');
  el('hdrBib').textContent = bibLabel + (session.pass ? ' · пароль ' + session.pass : '');
  el('hdrBib').title = 'Ваш номер и пароль: с ними вы продолжите ассессмент на другом устройстве';
  document.body.dataset.caseSrc = S.caseSrc;

  state = loadState(session.bib);
  route = S.route();

  if (blockedByVersion) { el('versionGate').style.display = 'flex'; return; }

  normalizeCursor();

  if (isDemo) {
    var sv = el('hdrSave');
    // ВЕРСИЯ МАРШРУТА ВИДНА В ДЕМО. Заведено 06.08 по случаю: после публикации
    // владелец не мог отличить «не обновилось» от «браузер отдал страницу из кэша»,
    // и проверять приходилось мне через API репозитория. Теперь строка в шапке
    // отвечает на этот вопрос сама, и только в демо: живому участнику версия сцен
    // ничего не говорит и место в шапке не занимает.
    if (sv) {
      sv.className = 'hdr-save';
      sv.textContent = 'демо · не сохраняется на сервер · ' + S.version;
    }
  } else {
    window.imp.hydrateOnce('loadAnswers', session.bib, storageKey(session.bib));
    (function initSaveStatus() {
      var e2 = el('hdrSave');
      if (!e2 || !window.imp.onSyncStatus) return;
      window.imp.onSyncStatus(function (s) {
        if (s.failed > 0) {
          e2.className = 'hdr-save is-failed';
          e2.textContent = 'не сохранено';
          e2.title = 'Ответы сохранены в этом браузере; отправка повторится, когда связь вернётся.';
        } else if (s.pending > 0) {
          e2.className = 'hdr-save is-pending'; e2.textContent = 'сохраняю…'; e2.title = '';
        } else if (s.lastOkAt) {
          e2.className = 'hdr-save'; e2.textContent = 'сохранено ' + hhmm(s.lastOkAt);
          e2.title = 'Последнее подтверждение записи на сервере.';
        } else { e2.className = 'hdr-save'; e2.textContent = ''; }
      });
    })();
  }

  initSupport();

  // Демо с витрины начинает сразу: там нет ни входа, ни экранов настройки, и
  // отправлять посетителя витрины читать инструкцию значило бы прятать от него то,
  // что он пришёл посмотреть.
  if (!state.started && (startedFromRole() || isDemo)) {
    state.started = true;
    state.startedAt = state.startedAt || nowIso();
    saveState();
  }
  if (state.started) showRoot();
  else location.replace('intro.html');

  window.imp.v2 = {
    state: function () { return state; },
    route: function () { return route; },
    payload: payload,
    totals: totals,
    setTab: setTab
  };
})();

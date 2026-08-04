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
// перечитывать почти бесплатно. Значит опора (кейс, свои ответы, заметки,
// справочник) живёт слева постоянно и НЕ перекрывает поле ответа, а справа —
// ровно один текущий вопрос; прошлые разговоры свёрнуты в строки.
//
// Заметки вернулись, и это тоже про паритет, а не про комфорт: у модели есть
// скрытое рассуждение, которое не попадает ни в ответ, ни к судье. Блокнот —
// его человеческий эквивалент. Поэтому содержимое заметок не уходит на сервер
// НИКОГДА: отдельный ключ localStorage, отсутствие в payload, ноль телеметрии.
//
// Что осталось неизменным: шесть сцен и восемь окон из scenes.js, портфель с тремя
// гейтами, необратимость, отсутствие любых реакций на содержание и длину ответа.

(function () {
  var S = window.imp.scenes;
  var BACKLOG = window.imp.backlog || [];
  var LIM = window.imp.backlogLimits || { people: 0, money: 0 };

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
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.v === 1) {
          if (!p.answers) p.answers = {};
          if (!p.answersAt) p.answersAt = {};
          if (!p.picks) p.picks = {};
          if (!p.marks) p.marks = [];
          // Гейт версии защищает ОТВЕТЫ, а не факт открытия страницы. Поэтому
          // блокируем только когда есть что терять: зафиксированный ответ или
          // разобранный портфель. Прежнее условие включало p.started, и участник,
          // который просто нажал «Начать день» и ушёл, при следующей правке сцен
          // получал «день приостановлен» на пустом месте.
          var hasWork = Object.keys(p.answersAt).some(function (k) { return p.answersAt[k]; }) || !!p.picksAt;
          if (p.scenesVersion !== S.version && hasWork && !p.finished && !isDemo) {
            try { localStorage.setItem(storageKey(bib) + '_v_' + p.scenesVersion, raw); } catch (e) {}
            blockedByVersion = true;
            return p;
          }
          // Демо и прогон без работы под новой версией начинаем заново молча:
          // сохранять нечего, а показывать «материалы обновились» посетителю
          // витрины — пугать его нашей внутренней жизнью.
          if (p.scenesVersion !== S.version) {
            try { localStorage.removeItem(storageKey(bib)); } catch (e) {}
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
    try { localStorage.setItem(storageKey(session.bib), JSON.stringify(state)); } catch (e) {}
    if (isDemo || !window.imp.isApiConfigured()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 3000);
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
      elicited: S.elicitedMap(),
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
    var t = { people: 0, money: 0, taken: 0, dropped: 0, undecided: 0, reasoned: 0 };
    BACKLOG.forEach(function (it) {
      var p = pickOf(it.id);
      if (!p) { t.undecided++; return; }
      if (p.take) { t.taken++; t.people += Number(it.people) || 0; t.money += Number(it.money) || 0; }
      else { t.dropped++; if (String(p.reason || '').trim()) t.reasoned++; }
    });
    t.overPeople = t.people > LIM.people;
    t.overMoney = t.money > LIM.money;
    t.over = t.overPeople || t.overMoney;
    t.leftPeople = LIM.people - t.people;
    t.leftMoney = Math.round((LIM.money - t.money) * 10) / 10;
    return t;
  }

  function picksForJudge() {
    var taken = [], dropped = [], reasons = {};
    BACKLOG.forEach(function (it) {
      var p = pickOf(it.id);
      if (!p) return;
      if (p.take) taken.push(it.id);
      else {
        dropped.push(it.id);
        var r = String(p.reason || '').trim();
        if (r) reasons[String(it.id)] = r;
      }
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

  function gateFailure(act) {
    var t = totals(), g = act.gates || {};
    if (t.undecided) return String(g.allDecided || '').replace('{n}', t.undecided);
    if (!t.taken) return g.atLeastOneTaken || '';
    if (t.dropped && !t.reasoned) return g.atLeastOneReason || '';
    return '';
  }

  // ---------- маршрут ----------

  function applies(act) {
    if (!act.when) return true;
    if (act.when === 'overspend') return totals().over;
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
      // Короткая часть названия до первого тире или запятой: полное название
      // занимает строку и в реплике не читается. Кавычки не ставим, если внутри
      // уже есть свои («перезапустить „Точку"») — двойные выглядят сломанно.
      var short = String(x.it.title || '').split(/\s+—\s+|,\s+/)[0].trim();
      return '№' + x.n + (short.indexOf('«') >= 0 ? ' ' + short : ' «' + short + '»');
    });
  }
  window.imp.v2NamedRefusals = namedRefusals;

  function speechHtml(act) {
    var out = '';
    (act.bubbles || []).forEach(function (b, i) {
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
    ['case', 'answers', 'marks', 'ref'].forEach(function (k) {
      var b = document.querySelector('.support-tab[data-tab="' + k + '"]');
      var body = el('sup' + k.charAt(0).toUpperCase() + k.slice(1));
      if (b) b.classList.toggle('is-on', k === name);
      if (body) body.classList.toggle('is-on', k === name);
    });
    if (name === 'answers') renderAnswersTab();
    if (name === 'marks') renderMarks();
    renderToc();
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
    host.innerHTML = list.map(function (m) {
      return '<div class="mark-item" data-mark="' + m.id + '">' +
        '<blockquote class="mark-quote">' + esc(m.quote) + '</blockquote>' +
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
      el('markBarAdd').style.display = 'none';
      return;
    }
    var target = found.parentElement;
    host.scrollTop += target.getBoundingClientRect().top - host.getBoundingClientRect().top - 10;
    target.classList.add('mark-flash');
    setTimeout(function () { target.classList.remove('mark-flash'); }, 1200);
  }

  function initMarks() {
    var bar = el('markBar'), quoteEl = el('markBarQuote'), addBtn = el('markBarAdd');
    var pending = '';

    var onSelect = function () {
      var sel = window.getSelection ? window.getSelection() : null;
      var txt = sel ? String(sel.toString()).replace(/\s+/g, ' ').trim() : '';
      var inside = false;
      if (sel && sel.rangeCount && txt) {
        var n = sel.getRangeAt(0).commonAncestorContainer;
        inside = el('supCaseText').contains(n.nodeType === 1 ? n : n.parentNode);
      }
      if (!inside || txt.length < 3) { bar.style.display = 'none'; pending = ''; return; }
      pending = txt;
      addBtn.style.display = '';
      quoteEl.textContent = txt.length > 120 ? txt.slice(0, 120) + '…' : txt;
      bar.style.display = '';
    };
    document.addEventListener('selectionchange', onSelect);
    el('supCaseText').addEventListener('mouseup', onSelect);

    addBtn.addEventListener('click', function () {
      if (!pending) return;
      addMark(pending);
      pending = '';
      bar.style.display = 'none';
      try { window.getSelection().removeAllRanges(); } catch (e) {}
    });

    el('supMarksBody').addEventListener('click', function (e) {
      var del = e.target.getAttribute && e.target.getAttribute('data-del');
      var show = e.target.getAttribute && e.target.getAttribute('data-show');
      if (del) {
        state.marks = (state.marks || []).filter(function (m) { return m.id !== del; });
        saveState(); renderMarks(); markCount(); return;
      }
      if (show) {
        var m = (state.marks || []).filter(function (x) { return x.id === show; })[0];
        if (m) showMarkInCase(m.quote);
      }
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

  // Оглавление слева — оглавление ТЕКУЩЕЙ вкладки середины, а не отдельный
  // элемент: одна колонка, разное содержимое. Иначе получаются два списка,
  // спорящих за одно место.
  function renderToc() {
    var kicker = el('tocKicker'), body = el('tocBody');
    if (!kicker || !body) return;
    if (supportTab === 'case') {
      kicker.textContent = 'Разделы';
      body.innerHTML = caseTocHtml || '<p class="bl-empty">Загружаю…</p>';
      return;
    }
    if (supportTab === 'marks') {
      kicker.textContent = 'Пометки';
      var ms = state.marks || [];
      body.innerHTML = ms.length
        ? ms.map(function (m, i) {
            var t = m.quote.length > 46 ? m.quote.slice(0, 46) + '…' : m.quote;
            return '<button type="button" class="toc-link" data-markjump="' + m.id + '">' + esc(t) + '</button>';
          }).join('')
        : '<p class="bl-empty">Пока ничего.</p>';
      return;
    }
    if (supportTab === 'ref') {
      kicker.textContent = 'Справка';
      body.innerHTML =
        '<button type="button" class="toc-link" data-ref="ref-terms">Термины</button>' +
        '<button type="button" class="toc-link" data-ref="ref-people">Люди</button>' +
        '<button type="button" class="toc-link" data-ref="ref-things">Компании и продукты</button>';
      return;
    }
    kicker.textContent = 'Зафиксировано';
    var links = '';
    S.windows().forEach(function (w, i) {
      if (!state.answersAt[w.save]) return;
      links += '<button type="button" class="toc-link" data-ans="' + i + '">' + esc(w.label) + '</button>';
    });
    if (state.picksAt) links += '<button type="button" class="toc-link" data-ans="picks">Разбор портфеля</button>';
    body.innerHTML = links || '<p class="bl-empty">Пока ничего.</p>';
  }

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
    // сворачивание ниже 1360 живёт в CSS и кнопку не заменяет.
    el('tocCollapse').addEventListener('click', function () {
      el('dayGrid').classList.add('is-collapsed');
    });
    el('tocRestore').addEventListener('click', function () {
      el('dayGrid').classList.remove('is-collapsed');
    });

    // Прокрутка по оглавлению: внутри колонки, не по хэшу — хэш увёл бы страницу.
    el('tocBody').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.toc-link');
      if (!b) return;
      var host = null, target = null;
      if (b.dataset.markjump) {
        var mk = (state.marks || []).filter(function (x) { return x.id === b.dataset.markjump; })[0];
        if (mk) showMarkInCase(mk.quote);
        return;
      }
      if (b.dataset.target) { host = el('supCaseText'); target = host.querySelector('#' + b.dataset.target); }
      else if (b.dataset.ref) { host = el('supRef'); target = host.querySelector('#' + b.dataset.ref); }
      else if (b.dataset.ans) {
        host = el('supRef') && supportTab === 'answers' ? el('supAnswers') : el('supAnswers');
        var items = host.querySelectorAll('.recap-item');
        target = b.dataset.ans === 'picks' ? items[items.length - 1] : items[Number(b.dataset.ans)];
      }
      if (!host || !target) return;
      var scroller = host.classList.contains('support-body') ? host : host;
      scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
      el('tocBody').querySelectorAll('.toc-link').forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
    });

    // Скрыть материалы — это про СЕРЕДИНУ, а не про оглавление: два разных
    // контрола с разным смыслом, отсюда и два класса.
    el('supportToggle').addEventListener('click', function () {
      var hidden = el('dayGrid').classList.toggle('is-nomem');
      this.textContent = hidden ? 'Показать материалы' : 'Скрыть материалы';
    });

    loadCaseIntoSupport();
    initMarks();
    renderToc();
  }

  function loadCaseIntoSupport() {
    if (caseLoaded) return;
    var host = el('supCaseText');
    if (!window.imp.loadCaseHtml) {
      host.innerHTML = '<p class="fac-detail-text">Сборка страницы неверна: js/case-ref.js должен подключаться до js/engine.js.</p>';
      return;
    }
    window.imp.loadCaseHtml().then(function (html) {
      host.innerHTML = html;
      caseLoaded = true;
      buildCaseToc();
      if (window.imp && window.imp.typoDom) window.imp.typoDom(host);
    }, function () {
      host.innerHTML = '<p class="fac-detail-text">Не удалось загрузить материалы — проверьте соединение и обновите страницу.</p>';
    });
  }

  // Оглавление собирается из самого пакета, а не задаётся списком: разъехаться
  // с кейсом ему тогда нечем. Переход — прокруткой контейнера, а не по хэшу:
  // хэш увёл бы всю страницу.
  var caseTocHtml = '';

  function buildCaseToc() {
    var host = el('supCaseText');
    var arts = host.querySelectorAll('article[id]');
    if (!arts.length) return;
    var html = '', appxStarted = false;
    for (var i = 0; i < arts.length; i++) {
      var h = arts[i].querySelector('h2, h3');
      var label = h ? h.textContent.trim() : '';
      if (!label) {
        // Заголовок может стоять разделителем ПЕРЕД статьёй, а не внутри неё.
        // Без этого в оглавлении появлялся сырой id вида «appx-1».
        var prev = arts[i].previousElementSibling;
        while (prev && !prev.classList.contains('appx-divider')) prev = prev.previousElementSibling;
        label = prev ? prev.textContent.trim() : arts[i].id;
      }
      if (!appxStarted && /^appx/.test(arts[i].id)) {
        appxStarted = true;
        html += '<p class="toc-group">Приложения</p>';
      }
      html += '<button type="button" class="toc-link" data-target="' + arts[i].id + '">' + esc(label) + '</button>';
    }
    caseTocHtml = html;
    renderToc();
  }

  // Вкладка «Мои ответы»: только зафиксированное. Незаполненное окно здесь не
  // показывается — иначе панель печатала бы карту вопросов дня вперёд, то есть
  // выдавала бы ось замера до того, как вопрос задан.
  function answersHtml() {
    var out = '';
    S.windows().forEach(function (w) {
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
          return '<li><span class="bl-id">' + id + '</span> ' + esc(it.title || '') +
            '<span class="recap-cost">' + (it.people || 0) + ' чел. · ' + num(it.money || 0) + ' млрд</span>' +
            (p.reasons[String(id)] ? '<br /><i>' + esc(p.reasons[String(id)]) + '</i>' : '') + '</li>';
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

  function sceneHead(scene, ix) {
    return '<div class="sc-head">' +
      '<span class="sc-head-count">Разговор ' + (ix + 1) + ' из ' + S.scenes.length + '</span>' +
      '<span class="sc-head-name">' + esc(scene.name) + '</span>' +
      '<span class="sc-head-where">' + esc(scene.where) + '</span>' +
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
      '<div class="win-foot">' +
        '<button class="btn btn-primary" id="commitBtn">Ответить →</button>' +
        '<span class="win-note">Ответ зафиксируется: вернуться и переписать его нельзя.</span>' +
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
      if (!String(ta.value).trim()) {
        window.imp.confirm(act.silence || 'Промолчать?', { confirmLabel: 'Промолчать', cancelLabel: 'Вернуться к ответу' })
          .then(function (ok) { if (ok) go(); });
        return;
      }
      go();
    });
    return d;
  }

  // Какие доводы авторов раскрыты кнопкой «почему». Не пишется в состояние и не
  // уходит на сервер: это не ответ, а способ читать список.
  var openArg = {};

  function mechanicBlock(act, locked) {
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
        '<div class="bl-sum' + (t.over ? ' is-over' : '') + '">' +
        '<span class="bl-sum-item"><b>' + t.taken + '</b> берём</span>' +
        '<span class="bl-sum-item' + (t.overPeople ? ' is-over' : '') + '"><b>' + t.people + '</b> из ' + LIM.people + ' человек' +
          '<i>' + (t.leftPeople >= 0 ? 'свободно ' + t.leftPeople : 'перебор на ' + (-t.leftPeople)) + '</i></span>' +
        '<span class="bl-sum-item' + (t.overMoney ? ' is-over' : '') + '"><b>' + num(t.money) + '</b> из ' + LIM.money + ' млрд' +
          '<i>' + (t.leftMoney >= 0 ? 'свободно ' + num(t.leftMoney) : 'перебор на ' + num(-t.leftMoney)) + '</i></span>' +
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
      // НОМЕР НА ЭКРАНЕ — ПОРЯДКОВЫЙ (1–20), а не id: id Кати идут 1,2,4,5…22 с
      // вырезанными 3 и 8, и участник видел пропуски, думая, чего ему не показали.
      // Внутренним ключом picks и записей судьи остаётся id.
      var numOf = {};
      BACKLOG.forEach(function (it, ix) { numOf[it.id] = ix + 1; });

      var list = d.querySelector('.bl-list');
      list.innerHTML = undecided.length
        ? '<div class="bl-zone-h">не решено <b>' + undecided.length + '</b></div><div class="bl-grid">' +
          undecided.map(function (it) {
            var open = openArg[it.id];
            return '<div class="bl-card' + (open ? ' is-open' : '') + '" data-card="' + it.id + '">' +
              '<div class="bl-card-top"><span class="bl-n">' + numOf[it.id] + '</span>' +
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
      var col = function (title, arr, kind) {
        var rows = arr.map(function (it) {
          var p = pickOf(it.id) || {};
          return '<div class="bl-row">' +
            '<span class="bl-n">' + numOf[it.id] + '</span>' +
            '<span class="bl-row-t">' + esc(it.title) +
              '<span class="bl-mini-who">' + esc(it.who) + ' · ' + it.people + ' чел. · ' + num(it.money) + ' млрд</span></span>' +
            '<button type="button" class="bl-row-back" data-flip="' + it.id + '">' +
              (kind === 'taken' ? 'не сейчас' : 'беру') + '</button>' +
            (kind === 'dropped'
              ? '<textarea class="bl-reason bl-row-reason" data-answer="1" rows="2" data-reason="' + it.id + '" placeholder="почему не сейчас — если этот отказ сам по себе решение">' + esc(p.reason || '') + '</textarea>'
              : '') +
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
      // Причина отказа при возврате в «беру» НЕ теряется: участник мог передумать
      // дважды, и стирать написанное молча нельзя.
      state.picks[String(id)] = { take: next, reason: (prev && prev.reason) || '' };
      saveState();
      if (card && (take || drop)) { setTimeout(renderList, 180); } else renderList();
      if (drop) {
        // Поле причины появляется в сводке наверху, а клик был внизу: переводим
        // фокус, иначе участник его просто не находит.
        var box = d.querySelector('.bl-reason[data-reason="' + id + '"]');
        if (box) { box.focus(); }
      }
    });
    d.addEventListener('input', function (e) {
      var rid = e.target.getAttribute && e.target.getAttribute('data-reason');
      if (!rid) return;
      var p = pickOf(rid) || { take: false };
      p.reason = e.target.value;
      state.picks[String(rid)] = p;
      saveState();
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

  // Свод дня перед письмом: не вторая копия ответов в ленте, а переключение опоры
  // на вкладку «Мои ответы». Требование плана — «участник видит свой день перед
  // тем, как писать письмо» — выполняется, а 1600 пикселей дубля не появляется.
  function recapBlock(act) {
    var d = document.createElement('div');
    d.className = 's2-block recap-pointer';
    d.innerHTML = '<p class="kicker">' + esc(act.title) + '</p>' +
      '<p class="section-lead" style="margin:0;">' + esc(act.lead) + ' Всё, что вы сказали за день, — во вкладке «Мои ответы» слева.</p>';
    if (!recapShown) { recapShown = true; setTab('answers'); }
    return d;
  }

  function caseDoneBlock(act) {
    var d = document.createElement('div');
    d.className = 's2-block case-done';
    d.innerHTML = '<span class="case-done-mark">✓</span> ' + esc(act.done || 'Пакет материалов прочитан') +
      ' · <button type="button" class="case-done-reopen" id="caseReopen">' + esc(act.reopen || 'открыть снова') + '</button>';
    d.querySelector('#caseReopen').addEventListener('click', function () {
      setTab('case');
      el('dayGrid').classList.remove('is-nomem');
      el('supportToggle').textContent = 'Скрыть материалы';
    });
    return d;
  }

  // ---------- рендер ----------

  function readingMode(on, act) {
    var g = el('dayGrid');
    g.classList.toggle('is-reading', !!on);
    el('caseReadFoot').style.display = on ? '' : 'none';
    el('supportToggle').style.display = on ? 'none' : '';
    if (!on) return;
    setTab('case');
    el('hdrDayName').textContent = '«Искра» · материалы';
    el('caseReadNote').textContent = act.note || '';
    var cta = el('caseReadCta');
    cta.textContent = act.cta || 'Дальше →';
    cta.onclick = function () { el('hdrDayName').textContent = '«Искра» · один день'; advance(); };
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
    var lastAt = '';
    S.windows().forEach(function (w) { if (state.answersAt[w.save]) lastAt = state.answersAt[w.save]; });
    el('interludeMark').textContent = lastAt ? '✓ Ответ зафиксирован · ' + hhmm(lastAt) : '';
    el('interludeWhere').textContent = step.scene.name;
    el('interludeWhen').textContent = 'Разговор ' + (step.sceneIx + 1) + ' из ' + S.scenes.length +
      ' · ' + step.scene.where;
    el('interludeLead').innerHTML = (I.lead || []).map(function (p) { return '<p style="margin:0 0 6px;">' + br(p) + '</p>'; }).join('');
    var cta = el('interludeCta');
    cta.textContent = I.cta || 'Дальше →';
    cta.onclick = function () { advance(); };
    if (window.imp && window.imp.typoDom) window.imp.typoDom(box);
  }

  function render() {
    var cur = route[state.cursor];
    if (cur && applies(cur.act) && cur.act.kind === 'case') { readingMode(true, cur.act); return; }
    readingMode(false);
    interludeMode(!!(cur && applies(cur.act) && cur.act.kind === 'interlude'), cur || { scene: S.scenes[0], sceneIx: 0 });

    var hist = el('talkHistory');
    var now = el('talkCurrent');
    hist.innerHTML = '';
    now.innerHTML = '';

    var curSceneIx = cur ? cur.sceneIx : S.scenes.length - 1;

    // Прошлые разговоры — свёрнутыми строками. Двенадцать экранов прокрутки,
    // чтобы вспомнить, что сказал в первом разговоре, — это налог на память.
    S.scenes.forEach(function (sc, si) {
      if (si >= curSceneIx) return;
      var det = document.createElement('details');
      det.className = 'talk-past';
      var answered = sc.acts.filter(function (a) { return a.kind === 'window' && state.answersAt[a.save]; }).length;
      det.innerHTML = '<summary><span class="talk-past-mark">✓</span> Разговор ' + (si + 1) + ' · ' + esc(sc.name) +
        '<span class="talk-past-meta">' + (answered ? answered + (answered === 1 ? ' ответ' : ' ответа') : 'пройден') + '</span></summary>';
      var body = document.createElement('div');
      body.className = 'talk-past-body';
      sc.acts.forEach(function (a) {
        if (!applies(a)) return;
        if (a.kind === 'speech') body.innerHTML += speechHtml(a);
        else if (a.kind === 'window' && state.answersAt[a.save]) {
          body.innerHTML += '<div class="win-label-past">' + esc(a.label) + '</div>' +
            meHtml(state.answers[a.save], state.answersAt[a.save]);
        }
      });
      det.appendChild(body);
      hist.appendChild(det);
    });

    // Текущий разговор: его акты до курсора включительно.
    var scene = S.scenes[curSceneIx];
    now.insertAdjacentHTML('beforeend', sceneHead(scene, curSceneIx));
    for (var i = 0; i < route.length; i++) {
      var st = route[i];
      if (st.sceneIx !== curSceneIx) continue;
      if (!applies(st.act)) continue;
      var past = i < state.cursor, current = i === state.cursor;
      if (!past && !current) break;
      if (st.act.kind === 'speech') {
        var b = document.createElement('div');
        b.className = 's2-block';
        b.innerHTML = speechHtml(st.act);
        now.appendChild(b);
      } else if (st.act.kind === 'recap') now.appendChild(recapBlock(st.act));
      else if (st.act.kind === 'case') now.appendChild(caseDoneBlock(st.act));
      else if (st.act.kind === 'window') now.appendChild(windowBlock(st.act, past));
      else if (st.act.kind === 'mechanic') now.appendChild(mechanicBlock(st.act, past));
    }

    if (state.cursor >= route.length && !state.finished) {
      var fin = document.createElement('div');
      fin.className = 's2-block';
      fin.innerHTML = '<div class="win-foot"><button class="btn btn-primary" id="finishBtn">Закончить день →</button>' +
        '<span class="win-note">День закроется: письмо уйдёт Агееву, ответы менять будет нельзя.</span></div>';
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
    renderToc();
    syncHeader();
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

  function syncHeader() {
    var st = route[Math.min(state.cursor, route.length - 1)];
    var ix = st ? st.sceneIx : S.scenes.length - 1;
    var e = el('hdrScene');
    if (e) e.textContent = (state.cursor >= route.length ? S.scenes.length : ix + 1) + ' / ' + S.scenes.length;
  }

  function showFinish() {
    el('assessRoot').style.display = 'none';
    el('finishOverlay').style.display = 'flex';
  }

  function finish() {
    state.finished = true;
    state.finishedAt = nowIso();
    saveState();
    clearTimeout(syncTimer);
    render();
    sync().then(showFinish, showFinish);
  }

  // ---------- установка ----------

  function initSetup() {
    var host = el('setupBody'), sys = S.system;
    host.innerHTML =
      '<p class="kicker">' + esc(sys.title) + '</p>' +
      sys.lead.map(function (p) { return '<p>' + br(p) + '</p>'; }).join('') +
      '<ul class="setup-rules">' + sys.rules.map(function (r) { return '<li>' + br(r) + '</li>'; }).join('') + '</ul>' +
      '<p class="intro-note">' + br(sys.note) + '</p>';
    if (window.imp && window.imp.typoDom) window.imp.typoDom(host);
    el('startDayBtn').addEventListener('click', function () {
      state.started = true;
      saveState();
      showRoot();
    });
  }

  function showRoot() {
    el('setupGate').style.display = 'none';
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
  el('hdrBib').title = 'Ваш номер и пароль: с ними вы продолжите день на другом устройстве';
  document.body.dataset.caseSrc = S.caseSrc;

  state = loadState(session.bib);
  route = S.route();

  if (blockedByVersion) { el('versionGate').style.display = 'flex'; return; }

  normalizeCursor();

  if (isDemo) {
    var sv = el('hdrSave');
    if (sv) { sv.className = 'hdr-save'; sv.textContent = 'демо · не сохраняется на сервер'; }
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
  initSetup();

  if (state.started) showRoot();
  else el('setupGate').style.display = 'flex';

  window.imp.v2 = {
    state: function () { return state; },
    route: function () { return route; },
    payload: payload,
    totals: totals,
    setTab: setTab
  };
})();

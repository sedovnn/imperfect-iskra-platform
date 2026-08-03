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
  function notesKey(bib) { return 'imp_v2_notes_' + bib; }

  // ---------- состояние ----------

  function freshState() {
    return {
      v: 1,
      scenesVersion: S.version,
      caseVersion: S.caseVersion,
      backlogVersion: S.backlogVersion,
      answers: {}, answersAt: {},
      picks: {}, picksAt: '',
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
          var started = p.started || Object.keys(p.answersAt).length || p.picksAt;
          if (p.scenesVersion !== S.version && started && !p.finished) {
            try { localStorage.setItem(storageKey(bib) + '_v_' + p.scenesVersion, raw); } catch (e) {}
            blockedByVersion = true;
            return p;
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
  function isBlocking(act) { return act.kind === 'window' || act.kind === 'mechanic' || act.kind === 'case'; }

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
    return t;
  }

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
    ['case', 'answers', 'notes', 'who'].forEach(function (k) {
      var b = document.querySelector('.support-tab[data-tab="' + k + '"]');
      var body = el('sup' + k.charAt(0).toUpperCase() + k.slice(1));
      if (b) b.classList.toggle('is-on', k === name);
      if (body) body.classList.toggle('is-on', k === name);
    });
    if (name === 'answers') renderAnswersTab();
  }

  function initSupport() {
    el('supportTabs').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.support-tab');
      if (b) setTab(b.getAttribute('data-tab'));
    });

    // Заметки: отдельный ключ, отдельная жизнь. В payload их нет by design.
    var ta = el('notesInput');
    try { ta.value = localStorage.getItem(notesKey(session.bib)) || ''; } catch (e) {}
    ta.addEventListener('input', function () {
      try { localStorage.setItem(notesKey(session.bib), ta.value); } catch (e) {}
    });

    var who = window.imp.caseCheatsheet || { people: [], things: [] };
    var rows = function (list) {
      return list.map(function (r) {
        return '<div class="who-row"><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></div>';
      }).join('');
    };
    el('supWhoBody').innerHTML =
      '<p class="who-h">Люди</p>' + rows(who.people) +
      '<p class="who-h">Компании и продукты</p>' + rows(who.things);

    el('supportToggle').addEventListener('click', function () {
      var g = el('dayGrid');
      var hidden = g.classList.toggle('is-collapsed');
      this.textContent = hidden ? 'Показать материалы' : 'Скрыть материалы';
    });

    loadCaseIntoSupport();
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
  function buildCaseToc() {
    var host = el('supCaseText'), toc = el('supCaseToc');
    var arts = host.querySelectorAll('article[id]');
    if (!arts.length) return;
    var html = '';
    for (var i = 0; i < arts.length; i++) {
      var h = arts[i].querySelector('h2, h3');
      // У справки по терминам своего заголовка внутри статьи нет — он стоит
      // разделителем перед ней. Без этого в оглавлении появлялся сырой id.
      var label = h ? h.textContent.trim() : '';
      if (!label) {
        var prev = arts[i].previousElementSibling;
        while (prev && !prev.classList.contains('appx-divider')) prev = prev.previousElementSibling;
        label = prev ? prev.textContent.trim() : arts[i].id;
      }
      html += '<button type="button" class="toc-link" data-target="' + arts[i].id + '">' + esc(label) + '</button>';
    }
    toc.innerHTML = '<div class="toc-title">Пакет материалов</div>' + html;
    toc.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.toc-link');
      if (!b) return;
      var target = host.querySelector('#' + b.getAttribute('data-target'));
      if (!target) return;
      host.scrollTop += target.getBoundingClientRect().top - host.getBoundingClientRect().top - 8;
      toc.querySelectorAll('.toc-link').forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
    });
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
        '<textarea id="winInput" class="win-input" rows="9" aria-label="' + esc(act.label) + '" placeholder="' + esc(act.placeholder || 'ваш ответ') + '">' + esc(val) + '</textarea>' +
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
      '<button class="btn btn-primary" id="fixBtn" style="margin-top:16px;">Зафиксировать разбор →</button>' +
      '<span class="win-note" style="margin-left:12px;">Разбор зафиксируется: переиграть его нельзя.</span>';

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

      var dec = d.querySelector('.bl-decided');
      dec.innerHTML = '';
      function group(title, arr, kind) {
        if (!arr.length) return;
        var g = document.createElement('div');
        g.className = 'bl-group is-' + kind;
        g.innerHTML = '<div class="bl-group-head">' + title + ' · ' + arr.length + '</div>';
        arr.forEach(function (it) {
          var p = pickOf(it.id) || {};
          var row = document.createElement('div');
          row.className = 'bl-mini';
          // Автор и цена остаются видимыми и после решения: три окна из восьми
          // опираются на эти данные, а после фиксации их больше нигде нет.
          row.innerHTML =
            '<span class="bl-mini-title"><span class="bl-id">' + it.id + '</span> ' + esc(it.title) +
              '<span class="bl-mini-who">' + esc(it.who) + '</span></span>' +
            '<span class="bl-mini-cost">' + it.people + ' чел. · ' + num(it.money) + ' млрд</span>' +
            '<span class="bl-mini-acts"><button type="button" class="s2-act" data-flip="' + it.id + '">' +
              (kind === 'taken' ? 'не сейчас' : 'беру') + '</button></span>' +
            (kind === 'dropped'
              ? '<textarea class="bl-reason" rows="2" data-reason="' + it.id + '" placeholder="почему не сейчас — если этот отказ сам по себе решение">' + esc(p.reason || '') + '</textarea>'
              : '');
          g.appendChild(row);
        });
        dec.appendChild(g);
      }
      group('Берём', taken, 'taken');
      group('Не сейчас', dropped, 'dropped');

      var list = d.querySelector('.bl-list');
      list.innerHTML = '';
      undecided.forEach(function (it) {
        var row = document.createElement('div');
        row.className = 'bl-item';
        row.innerHTML =
          '<p class="bl-title"><span class="bl-id">' + it.id + '</span> ' + esc(it.title) + '</p>' +
          '<p class="bl-meta">' + esc(it.who) + '<span>' + it.people + ' чел.</span><span>' + num(it.money) + ' млрд</span></p>' +
          (it.argument ? '<p class="bl-arg">' + esc(it.argument) + '</p>' : '') +
          '<div class="bl-actions">' +
            '<button type="button" class="s2-act" data-take="' + it.id + '">беру</button>' +
            '<button type="button" class="s2-act" data-drop="' + it.id + '">не сейчас</button>' +
          '</div>';
        list.appendChild(row);
      });

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
      var take = e.target.getAttribute && e.target.getAttribute('data-take');
      var drop = e.target.getAttribute && e.target.getAttribute('data-drop');
      var flip = e.target.getAttribute && e.target.getAttribute('data-flip');
      var id = take || drop || flip;
      if (!id) return;
      var prev = pickOf(id);
      var next = flip ? !(prev && prev.take) : !!take;
      // Причина отказа при возврате в «беру» НЕ теряется: участник мог передумать
      // дважды, и стирать написанное молча нельзя.
      state.picks[String(id)] = { take: next, reason: (prev && prev.reason) || '' };
      saveState();
      renderList();
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
      el('dayGrid').classList.remove('is-collapsed');
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

  function render() {
    var cur = route[state.cursor];
    if (cur && applies(cur.act) && cur.act.kind === 'case') { readingMode(true, cur.act); return; }
    readingMode(false);

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

    if (window.imp && window.imp.typoDom) window.imp.typoDom(now);
    if (supportTab === 'answers') renderAnswersTab();
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

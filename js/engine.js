// i(m)perfect / «Искра» — платформа v2. ОДИН ДВИЖОК РАЗГОВОРА НА ШЕСТЬ СЦЕН.
//
// В v1 было шесть страниц и шесть разных машин шагов (round1.js…round5.js +
// map.js, 262 КБ вместе). Одинаковое поведение приходилось писать заново в каждой,
// и оно расходилось: в одной реплика реагировала на длину ответа, в другой нет;
// в одной шаг «перебор» был, в харнессе — не было. Здесь машина одна, а сцены —
// данные (js/scenes.js). Ни одной реплики литералом в этом файле.
//
// Что движок обязан делать одинаково с харнессом (иначе маршруты расходятся):
//   • предъявлять акты строго по порядку scenes.route(), без переигрывания;
//   • показывать условный акт «перебор» по тому же числовому правилу;
//   • держать три гейта фиксации портфеля;
//   • не менять ни одной реплики в зависимости от содержания или длины ответа.
//
// Чего движок НЕ делает: не настаивает (встречный вопрос вместо ответа —
// сохраняется как есть, прогон идёт дальше), не оценивает, не показывает
// участнику ничего про рубрику.

(function () {
  var S = window.imp.scenes;
  var BACKLOG = window.imp.backlog || [];
  var LIM = window.imp.backlogLimits || { people: 0, money: 0 };

  var session = null;
  var state = null;
  var route = null;

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

  function storageKey(bib) { return 'imp_v2_' + bib; }

  function freshState() {
    return {
      v: 1,
      scenesVersion: S.version,
      caseVersion: S.caseVersion,
      backlogVersion: S.backlogVersion,
      answers: {},      // q1…q8 + overspend
      answersAt: {},
      picks: {},        // {"<id>": {take:bool, reason:string}}
      picksAt: '',
      cursor: 0,
      started: false,
      finished: false,
      startedAt: nowIso(),
      finishedAt: ''
    };
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.v === 1) {
          if (!p.answers) p.answers = {};
          if (!p.answersAt) p.answersAt = {};
          if (!p.picks) p.picks = {};
          // Версия маршрута сменилась под уже начатым прогоном. Тихо продолжать
          // нельзя: ответы отвечали на другие реплики. Незавершённый прогон
          // начинаем заново, завершённый оставляем исторической записью.
          if (p.scenesVersion !== S.version && !p.finished) {
            var fresh = freshState();
            fresh.startedAt = p.startedAt || fresh.startedAt;
            fresh.restartedFrom = p.scenesVersion;
            return fresh;
          }
          return p;
        }
      }
    } catch (e) {}
    return freshState();
  }

  var syncTimer = null;

  function saveState() {
    try { localStorage.setItem(storageKey(session.bib), JSON.stringify(state)); } catch (e) {}
    if (!window.imp.isApiConfigured()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 3000);
  }

  // Один путь записи: тем же действием saveAnswers, которым пишет харнесс.
  // Отдельного «сохрани ответ модели» в боевом пути нет.
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
      // Позиция в маршруте едет с ответами: без неё вход с другого устройства
      // подтягивал восемь ответов и ставил курсор в начало дня — участник получал
      // первый вопрос заново и первым же нажатием переписывал свой ответ.
      cursor: state.cursor,
      started: !!state.started,
      finished: !!state.finished,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt
    };
  }

  function sync() {
    if (!window.imp.isApiConfigured()) return Promise.resolve(true);
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
    return t;
  }

  // Вид, в котором факты портфеля уходят судье: ровно то же, что отдаёт
  // инструмент модели — {taken:[id], dropped:[id], reasons:{}} плюс суммы.
  // Разбора чисел из прозы нет вовсе.
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

  // Три гейта фиксации — те же тексты, что харнесс отдаёт модели в tool_result.
  function gateFailure(act) {
    var t = totals();
    var g = act.gates || {};
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
  function isBlocking(act) { return act.kind === 'window' || act.kind === 'mechanic'; }

  // Курсор всегда стоит на ближайшем применимом блокирующем акте. Речь и свод
  // дня проходятся сами — они ничего не требуют.
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

  // ---------- разметка речи ----------
  // Те же пузыри, что во всех разговорах v1: оформление платформы не меняем.

  function subst(text) {
    var t = String(text || '');
    if (t.indexOf('{name}') >= 0) t = t.split('{name}').join(pname());
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

  function meHtml(text) {
    var t = String(text == null ? '' : text).trim();
    return '<div class="chat"><div class="chat-msg me"><span class="chat-name">Вы</span>' +
      '<div class="chat-bubble">' + (t ? br(t) : '<i>промолчали</i>') + '</div></div></div>';
  }

  // ---------- блоки ----------

  function sceneHead(scene, ix) {
    var d = document.createElement('div');
    d.className = 'sc-head';
    d.innerHTML = '<span class="sc-head-count">Разговор ' + (ix + 1) + ' из ' + S.scenes.length + '</span>' +
      '<span class="sc-head-name">' + esc(scene.name) + '</span>' +
      '<span class="sc-head-where">' + esc(scene.where) + '</span>';
    return d;
  }

  function speechBlock(act) {
    var d = document.createElement('div');
    d.className = 's2-block';
    d.innerHTML = speechHtml(act);
    return d;
  }

  function windowBlock(act, locked) {
    var d = document.createElement('div');
    d.className = 's2-block';
    var val = state.answers[act.save] || '';
    if (locked) {
      d.innerHTML = meHtml(val);
      return d;
    }
    d.innerHTML =
      '<div class="s2-mine"><span class="chat-name">Вы</span>' +
        '<label class="win-label" for="winInput">' + esc(act.label) + '</label>' +
        '<textarea id="winInput" class="win-input" rows="10" aria-label="' + esc(act.label) + '" placeholder="' + esc(act.placeholder || 'ваш ответ') + '">' + esc(val) + '</textarea>' +
      '</div>' +
      '<button class="btn btn-primary" id="commitBtn" style="margin-top:12px;">Ответить →</button>';

    var ta = d.querySelector('#winInput');
    ta.addEventListener('input', function (e) {
      state.answers[act.save] = e.target.value;
      saveState();
    });
    d.querySelector('#commitBtn').addEventListener('click', function () {
      var go = function () {
        state.answers[act.save] = ta.value;
        state.answersAt[act.save] = nowIso();
        advance();
      };
      if (!String(ta.value).trim()) {
        // Не настойка: молчание — законный ответ, он сохраняется как есть и
        // прогон идёт дальше. Спрашиваем один раз, потому что ход необратим.
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
      var t = totals();
      d.innerHTML = '<div class="bl-locked">' +
        '<b>' + t.taken + '</b> берём · <b>' + t.dropped + '</b> не сейчас · ' +
        t.people + ' человек из ' + LIM.people + ' · ' + num(t.money) + ' млрд из ' + LIM.money +
        (t.over ? ' <span class="bl-over-tag">за рамкой</span>' : '') +
        '</div>';
      return d;
    }
    d.innerHTML =
      '<div class="bl-sum-host"></div>' +
      '<div class="bl-decided"></div>' +
      '<div class="bl-list"></div>' +
      '<div class="bl-hint" style="display:none;"></div>' +
      '<button class="btn btn-primary" id="fixBtn" style="margin-top:16px;">Зафиксировать разбор →</button>';

    function renderList() {
      var sum = d.querySelector('.bl-sum-host');
      var t = totals();
      sum.innerHTML = '<div class="bl-sum' + (t.over ? ' is-over' : '') + '">' +
        '<span class="bl-sum-item"><b>' + t.taken + '</b> берём</span>' +
        '<span class="bl-sum-item' + (t.overPeople ? ' is-over' : '') + '"><b>' + t.people + '</b> человек из ' + LIM.people + '</span>' +
        '<span class="bl-sum-item' + (t.overMoney ? ' is-over' : '') + '"><b>' + num(t.money) + '</b> млрд из ' + LIM.money + '</span>' +
        (t.undecided ? '<span class="bl-sum-left">осталось решить: ' + t.undecided + '</span>' : '') +
        '</div>';

      var taken = [], dropped = [], undecided = [];
      BACKLOG.forEach(function (it) {
        var p = pickOf(it.id);
        if (!p) undecided.push(it); else if (p.take) taken.push(it); else dropped.push(it);
      });

      // Решённое уезжает наверх по одной строке: полотно из двадцати карточек
      // тает по мере разбора. Передумать можно тут же.
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
          row.innerHTML =
            '<span class="bl-mini-title"><span class="bl-id">' + it.id + '</span> ' + esc(it.title) + '</span>' +
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

      // Нерешённое: номер, заголовок, автор, цена, аргумент автора. Номера
      // показываем (план §5.1): в v1 они были скрыты, а харнесс переводил
      // порядковый номер в реальный id — трансляция, существовавшая только для
      // одного носителя. В списке есть пропуски (нет 3 и 8, максимум 22).
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
        // Превышение НЕ блокируем: Агеев вслух разрешил выйти за рамку, а
        // превышение — наблюдаемый ответ, не ошибка формы. Но раз он обещал
        // спросить, чем платите, — предупреждаем здесь, спрашиваем следующим тактом.
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
      state.picks[String(id)] = { take: next, reason: next ? '' : (prev && prev.reason) || '' };
      saveState();
      renderList();
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

  // Свод дня перед последним окном: read-only, дословно, плюс разбор портфеля.
  function recapBlock(act) {
    var d = document.createElement('div');
    d.className = 's2-block recap-block';
    d.innerHTML = '<p class="kicker">' + esc(act.title) + '</p>' +
      '<p class="section-lead" style="margin:0 0 18px;">' + esc(act.lead) + '</p>' +
      answersHtml();
    return d;
  }

  // Один рендер и для свода дня, и для панели «Мои ответы»: подписи окон берутся
  // из scenes.js, поэтому вторая копия текстов вопросов не появляется.
  function answersHtml() {
    var out = '';
    S.windows().forEach(function (w) {
      var val = state.answers[w.save];
      if (w.conditional && !String(val || '').trim()) return;
      out += '<div class="recap-item">' +
        '<div class="recap-q">' + esc(w.scene.name) + ' · ' + esc(w.label) + '</div>' +
        '<div class="recap-a">' + (String(val || '').trim() ? br(val) : '<i>промолчали</i>') + '</div>' +
        '</div>';
    });
    if (state.picksAt) {
      var t = totals(), p = picksForJudge();
      var byId = {};
      BACKLOG.forEach(function (it) { byId[it.id] = it; });
      var line = function (ids) {
        return ids.map(function (id) {
          return '<li><span class="bl-id">' + id + '</span> ' + esc((byId[id] || {}).title || '') +
            (p.reasons[String(id)] ? ' — <i>' + esc(p.reasons[String(id)]) + '</i>' : '') + '</li>';
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
    return out || '<p class="section-lead">Пока ничего не сказано.</p>';
  }

  // ---------- рендер ----------

  var body = null;

  function render() {
    body.innerHTML = '';
    var lastScene = -1;
    for (var i = 0; i < route.length; i++) {
      var st = route[i];
      if (!applies(st.act)) continue;
      var past = i < state.cursor;
      var current = i === state.cursor;
      if (!past && !current) break;

      if (st.sceneIx !== lastScene) {
        body.appendChild(sceneHead(st.scene, st.sceneIx));
        lastScene = st.sceneIx;
      }
      if (st.act.kind === 'speech') body.appendChild(speechBlock(st.act));
      else if (st.act.kind === 'recap') body.appendChild(recapBlock(st.act));
      else if (st.act.kind === 'window') body.appendChild(windowBlock(st.act, past));
      else if (st.act.kind === 'mechanic') body.appendChild(mechanicBlock(st.act, past));
    }

    if (state.cursor >= route.length && !state.finished) {
      var fin = document.createElement('div');
      fin.className = 's2-block';
      fin.innerHTML = '<button class="btn btn-primary" id="finishBtn">Закончить день →</button>';
      fin.querySelector('#finishBtn').addEventListener('click', finish);
      body.appendChild(fin);
    }

    if (window.imp && window.imp.typoDom) window.imp.typoDom(body);
    syncHeader();
    var last = body.lastElementChild;
    if (last && !state.finished) last.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function syncHeader() {
    var st = route[Math.min(state.cursor, route.length - 1)];
    var ix = st ? st.sceneIx : S.scenes.length - 1;
    var el = document.getElementById('hdrScene');
    if (el) el.textContent = (state.cursor >= route.length ? S.scenes.length : ix + 1) + ' / ' + S.scenes.length;
  }

  function showFinish() {
    document.getElementById('assessRoot').style.display = 'none';
    document.getElementById('finishOverlay').style.display = 'flex';
  }

  function finish() {
    state.finished = true;
    state.finishedAt = nowIso();
    saveState();
    clearTimeout(syncTimer);
    render();
    // Финиш-оверлей ждёт подтверждения записи: при сбое сети участник иначе
    // уходит уверенным, что ответы сохранены. Не дождались — оверлей всё равно
    // покажем (локально всё есть), а api.js повторит отправку сам.
    sync().then(showFinish, showFinish);
  }

  // ---------- панель «Мои ответы» ----------

  function initAnswersPanel() {
    var panel = document.getElementById('answersPanel');
    var host = document.getElementById('answersPanelContent');
    if (!panel || !host) return;
    function open() {
      host.innerHTML = answersHtml();
      if (window.imp && window.imp.typoDom) window.imp.typoDom(host);
      panel.style.display = 'flex';
      panel.setAttribute('aria-hidden', 'false');
      host.scrollTop = 0;
    }
    function close() {
      panel.style.display = 'none';
      panel.setAttribute('aria-hidden', 'true');
    }
    // .js-open-dossier — класс, который case-ref.js ставит кнопке, перенося её
    // в шапку. Панель v1 (dossier-panel.js) на этой странице не подключена,
    // поэтому конфликта обработчиков нет: тот рендер знал восемнадцать полей.
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.js-open-dossier, .js-open-answers')) { e.preventDefault(); open(); }
    });
    document.getElementById('closeAnswersBtn').addEventListener('click', close);
    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.style.display !== 'none') close();
    });
  }

  // ---------- установка дня ----------

  function initSetup() {
    var host = document.getElementById('setupBody');
    var sys = S.system;
    host.innerHTML =
      '<p class="kicker">' + esc(sys.title) + '</p>' +
      sys.lead.map(function (p) { return '<p>' + br(p) + '</p>'; }).join('') +
      '<ul class="setup-rules">' + sys.rules.map(function (r) { return '<li>' + br(r) + '</li>'; }).join('') + '</ul>' +
      '<p class="intro-note">' + br(sys.note) + '</p>';
    if (window.imp && window.imp.typoDom) window.imp.typoDom(host);
    document.getElementById('startDayBtn').addEventListener('click', function () {
      state.started = true;
      saveState();
      showRoot();
    });
  }

  function showRoot() {
    document.getElementById('setupGate').style.display = 'none';
    document.getElementById('assessRoot').style.display = '';
    render();
    if (state.finished) showFinish();
  }

  // ---------- старт ----------

  session = (function () { try { return window.imp.loadSession(); } catch (e) { return null; } })();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }

  // Сверка источников до первого рендера: если портфель в backlog.js разошёлся с
  // версией, объявленной в сценах, суммы в реплике Агеева («22 миллиарда»,
  // «около пятисот») больше не описывают экран — падаем громко, а не считаем
  // ресурс мимо, как это делал pr1FloorFree в v1.
  if (S.backlogVersion !== window.imp.backlogVersion) {
    document.getElementById('gate').style.display = 'flex';
    document.querySelector('#gate .gate-card').innerHTML =
      '<p class="kicker">Сборка маршрута</p><h2>Версии портфеля разошлись</h2>' +
      '<p class="section-lead">scenes.js ожидает портфель ' + esc(S.backlogVersion) +
      ', а backlog.js отдаёт ' + esc(window.imp.backlogVersion) +
      '. Пока это не сведено, разговор начинать нельзя: лимиты в репликах перестали описывать экран.</p>';
    return;
  }

  document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(6, '0');
  document.body.dataset.caseSrc = S.caseSrc;

  body = document.getElementById('assessBody');
  state = loadState(session.bib);
  route = S.route();
  normalizeCursor();

  window.imp.hydrateOnce('loadAnswers', session.bib, storageKey(session.bib));

  // Статус записи в шапке. Молчаливая потеря ответа — самое дорогое, что может
  // случиться на этом экране, поэтому состояние очереди видно всегда.
  (function initSaveStatus() {
    var el = document.getElementById('hdrSave');
    if (!el || !window.imp.onSyncStatus) return;
    window.imp.onSyncStatus(function (s) {
      if (s.failed > 0) {
        el.className = 'hdr-save is-failed';
        el.textContent = 'не сохранено';
        el.title = 'Ответы сохранены в этом браузере; отправка повторится, когда связь вернётся.';
      } else if (s.pending > 0) {
        el.className = 'hdr-save is-pending';
        el.textContent = 'сохраняю…';
        el.title = '';
      } else if (s.lastOkAt) {
        var d = new Date(s.lastOkAt);
        el.className = 'hdr-save';
        el.textContent = 'сохранено ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        el.title = 'Последнее подтверждение записи на сервере.';
      } else {
        el.className = 'hdr-save';
        el.textContent = '';
      }
    });
  })();

  initAnswersPanel();
  initSetup();

  if (state.started) showRoot();
  else document.getElementById('setupGate').style.display = 'flex';

  // отладочная поверхность для харнесса и для проверки тождественности маршрута
  window.imp.v2 = {
    state: function () { return state; },
    route: function () { return route; },
    payload: payload,
    totals: totals
  };
})();

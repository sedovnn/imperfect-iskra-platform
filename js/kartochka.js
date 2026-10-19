// i(m)perfect — карточка участника отдельным окном (kartochka.html#<номер>). Решение владельца 15.10, макет согласован 15.10:
// по порядку прохождения — свёрнутый вопрос платформы, развёрнутый ответ участника и рядом оценки поднавыков, которые
// меряются в этом ответе; раскрытый поднавык — пояснение судьи, границы с цитатами, правка уровня и пересуд. Генерация
// альтернатив читается по всему ассессменту — отдельным блоком в конце. Служебное (версии, время, действия с номером) —
// свёрнуто внизу.
//
// Откуда что берётся. Данные — doV2Detail (тот же ответ бэкенда, что читала прежняя карточка в кабинете) и v2List (имя,
// поток, перечень потоков для переноса). Этапы, шаги и реплики — scenes.js (S.windows, акты сцены), читаемый вид верстаков —
// answerHtml самих механик (mechanics.js), подстановки в репликах — backlog.js и mech-fields.js: своего списка шагов и
// своего уплощателя здесь нет, иначе один ответ выглядел бы в двух местах по-разному. Чтения судьи по этапам лежат на
// шагах через этапы судейства бэкенда (d.stations, V2_STATIONS) — тот же список, по которому судья их читал.
// Уровень у ответа — уровень этого этапа; итог поднавыка сводит платформа (больший уровень этапов, решение владельца
// 14.10), поэтому ручная правка меняет итог поднавыка, а не один этап.
// Карточка — только у администратора: ведущему её не открывают (у него своя страница, vedushchiy.html).
(function () {
  'use strict';

  var PW_KEY = 'imp_cabinet_pw';
  var S = window.imp.scenes;
  var M = window.imp.mechanics || {};
  var LIM = window.imp.backlogLimits || { people: 0, money: 0 };
  var el = function (id) { return document.getElementById(id); };
  var root = el('kcRoot');

  var ABS = ['ak1', 'ak2', 'pr1', 'pr2', 'mk1', 'mk2', 'pp1', 'pp2', 'ga1', 'ga2'];
  // Названия способностей — как в методологии (methodology/methodology_for_imp_v8.md, заголовки разделов; владелец 19.10:
  // «приводи»). До 19.10 здесь стояли короткие и прежние названия: «Горизонт», «Развилки будущего», «Выделение важного»…
  var AB = { ak1: 'Широта охвата факторов среды', ak2: 'Глубина анализа взаимосвязей', pr1: 'Выбор инициатив', pr2: 'Основание выбора',
             mk1: 'Амбициозность цели', mk2: 'Множественность образов будущего', pp1: 'Декомпозиция цели и выстраивание маршрута',
             pp2: 'Работа с ресурсами и ограничениями на пути к цели', ga1: 'Самостоятельная генерация альтернатив',
             ga2: 'Привлечение идей из разных областей' };
  var CODE = { ak1: 'АК-1', ak2: 'АК-2', pr1: 'ПР-1', pr2: 'ПР-2', mk1: 'МК-1', mk2: 'МК-2', pp1: 'ПП-1', pp2: 'ПП-2', ga1: 'ГА-1', ga2: 'ГА-2' };
  var OF_CODE = {};
  ABS.forEach(function (a) { OF_CODE[CODE[a]] = a; });
  var SKILLS = [
    { name: 'Анализ контекста', abs: ['ak1', 'ak2'] },
    { name: 'Приоритизация', abs: ['pr1', 'pr2'] },
    { name: 'Моделирование картины будущего', abs: ['mk1', 'mk2'] },
    { name: 'Построение пути к цели', abs: ['pp1', 'pp2'] },
    { name: 'Генерация стратегических альтернатив', abs: ['ga1', 'ga2'] }
  ];
  // Задания судьи по способностям — для пересуда одного чтения. Повторяет V2_JUDGE_TASKS в code.js: АК-1 и АК-2 судит одно
  // задание `ak`, ПР-1 и ПР-2 — одно задание `pr`, поэтому их пересуд идёт парой, и кнопка это называет.
  var TASK_OF = { ak1: 'ak', ak2: 'ak', mk1: 'mk1', mk2: 'mk2', pp1: 'pp1', pp2: 'pp2', pr1: 'pr', pr2: 'pr', ga1: 'ga1', ga2: 'ga2' };
  var PAIR = { ak1: 'ak2', ak2: 'ak1', pr1: 'pr2', pr2: 'pr1' };
  var CTRL_TASK_OF = { mk1: 'cross_mk1', ak1: 'cross_ak1', pr2: 'cross_pr2', ak2: 'cross_ak2' };
  // Доп. оценка по всему ответу (решение владельца 04.10): у каждой способности, кроме ГА-1 — она и так читает весь ответ.
  var EXTRA_OF = { ak1: 1, ak2: 1, pr1: 1, pr2: 1, mk1: 1, mk2: 1, pp1: 1, pp2: 1, ga2: 1 };
  var REPORT_ERR = { record_checks_failed: 'оценка неполная — сначала пересудите упавшие задания', not_judged: 'участника ещё не оценили',
                     no_answers: 'ответов нет', judge_failed: 'модель не ответила — нажмите ещё раз',
                     report_not_ready: 'отчёт ещё не собран', report_stale: 'отчёт собран по прежней оценке — сначала соберите заново',
                     report_in_progress: 'отчёт уже собирается', report_busy: 'таблица занята — попробуйте через минуту',
                     bad_fields: 'заполните все поля', bad_block: 'такого блока в отчёте нет' };

  // ── состояние ──────────────────────────────────────────────────────────────
  var pw = '';
  // Номер — в параметре адреса (kartochka.html?n=033010): решётка занята переходами по этапам (#kc-…).
  var bib = (function () {
    var m = /[?&]n=([^&#]+)/.exec(location.search || '');
    return m ? decodeURIComponent(m[1]).trim() : '';
  })();
  var d = null;          // ответ doV2Detail
  var person = null;     // строка участника из v2List (имя, поток, «не оценивать»)
  var waves = [];
  var ui = { open: null, focus: null, drafts: {}, menu: false, busy: false, stateText: '', svc: false, qOpen: {},
             // Панель правки текстов отчёта (владелец 17.10): перечень блоков грузится по кнопке, правки — по блоку.
             rep: { open: false, loading: false, blocks: null, dropped: [], err: '', openKeys: {}, busy: {} } };

  // ── мелочи ─────────────────────────────────────────────────────────────────
  function esc(s) { var x = document.createElement('div'); x.textContent = s == null ? '' : String(s); return x.innerHTML; }
  function br(s) { return esc(s).replace(/\n/g, '<br />'); }
  function num(n) { return String(Math.round(Number(n) * 10) / 10).replace('.', ','); }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  function bib6(b) {
    var s = String(b == null ? '' : b).trim();
    return '№ ' + (/^\d+$/.test(s) ? s.padStart(6, '0') : s.toUpperCase());
  }
  function bk(b) {
    var s = String(b == null ? '' : b).trim().toUpperCase();
    return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
  }
  function dt(iso) {
    if (!iso) return '';
    var x = new Date(iso);
    if (isNaN(x.getTime())) return String(iso);
    var p2 = function (n) { return String(n).padStart(2, '0'); };
    return p2(x.getDate()) + '.' + p2(x.getMonth() + 1) + ' ' + p2(x.getHours()) + ':' + p2(x.getMinutes());
  }
  function has(v) { return !(v === null || v === undefined || v === ''); }
  // Ключи границ из свободного текста судьи (g2…g5) — словами платформы: g4 → 3→4 (как в прежней карточке, kBounds).
  function kb(t) {
    var bn = function (k) { return (k - 1) + '→' + k; };
    var free = function (str, at) { return !/[A-Za-zЀ-ӿ.]/.test(str.charAt(at - 1) || ''); };
    return String(t || '')
      .replace(/\bg([2-5])\s*[-–—]\s*g([2-5])\b/g, function (m, a, b, at, str) { return free(str, at) ? bn(+a) + '…' + bn(+b) : m; })
      .replace(/\bg([2-5])\b(?![.:][A-Za-z])(\s*\((\d)→(\d)\))?/g, function (m, k, par, a, b, at, str) {
        if (!free(str, at)) return m;
        return bn(+k) + (par && !(+a === k - 1 && +b === +k) ? par : '');
      });
  }
  var CHEV_R = '<svg class="kc-chev" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3.5 2l3 3-3 3"></path></svg>';
  var CHEV_D = '<svg class="kc-chev" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3.5 5.5l3.5 3.5 3.5-3.5"></path></svg>';

  // ── маршрут: этапы и шаги из scenes.js ─────────────────────────────────────
  var T = window.imp.mechTitles || {};
  var STEPS = (S && S.windows ? S.windows() : []).map(function (w) {
    return { key: w.save, mech: w.mech, conditional: w.conditional, act: w.act, scene: w.scene,
             when: (w.act && w.act.when) || '', unless: (w.act && w.act.unless) || '',
             label: w.mech ? (T[w.mech] || w.label || w.mech) : (w.label || w.save) };
  });
  var SCENES = [];
  (S && S.scenes ? S.scenes : []).forEach(function (sc) {
    if (STEPS.some(function (s) { return s.scene === sc; })) SCENES.push(sc);
  });
  function stepByKey(k) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].key === k) return STEPS[i]; return null; }
  function sceneShort(sc) { return String((sc && sc.name) || '').replace(/^Кабинет /, '').replace(/^Переговорная, /, '').replace(/ «.*»$/, ''); }
  // Название этапа на экране: у двух сцен «Ваш офис» (наблюдения и письмо) — с первым шагом, иначе в навигации два одинаковых.
  function sceneName(sc) {
    var same = SCENES.filter(function (x) { return x.name === sc.name; }).length > 1;
    var first = STEPS.filter(function (x) { return x.scene === sc; })[0];
    return same && first ? sc.name + ' · ' + first.label : sc.name;
  }

  // ── факты разбора и условия шагов — то же правило, что у движка и в кабинете ─
  function listFacts() {
    var f = d && d.facts;
    if (!f) return null;
    var ids = function (a) { return (a || []).map(function (it) { return it.id; }); };
    return { fitsFrame: f.fitsFrame, taken: ids(f.taken), later: ids(f.later), never: ids(f.never),
             sums: { people: f.people, money: f.money }, limits: f.limits };
  }
  function condMet(name, lf) {
    if (!lf) return null;
    var sets = { taken: lf.taken, later: lf.later, never: lf.never };
    if (name === 'overspend') return lf.fitsFrame === false;
    if (name === 'refused') return (lf.later || []).concat(lf.never || []).length > 0;
    if (name === 'severova') return window.imp.refusedTalkIds(sets, lf.sums, lf.limits || LIM).length > 0;
    if (name === 'refusedLater') return !!window.imp.refusedOwnerIsLater(sets, lf.sums, lf.limits || LIM);
    return true;
  }
  function asked(step) {
    if (!step.conditional) return true;
    var lf = listFacts();
    if (!lf) return null;
    if (step.unless && condMet(step.unless, lf) === true) return false;
    return condMet(step.when, lf);
  }
  function answeredAt(step) {
    if (step.mech) return d.mech && d.mech[step.mech] !== undefined ? ((d.mechAt || {})[step.mech] || '') : null;
    var w = (d.windows || []).filter(function (x) { return x.key === step.key && !x.legacy; })[0];
    return w && String(w.text || '').trim() ? String(w.at || '') : null;
  }
  function mechCtx() {
    return { esc: esc, br: br, num: num, blNum: window.imp.backlogNum, BACKLOG: window.imp.backlog, LIM: LIM, isDemo: false,
             pname: function () { return personName(); } };
  }
  function personName() { return person ? String(person.firstName || person.fio || '').trim() : ''; }
  function listSums() {
    var lm = d && d.mech && d.mech.list;
    return (lm && M.list && M.list.sums) ? M.list.sums(lm, mechCtx()) : null;
  }
  function refusedSets() {
    var lm = d && d.mech && d.mech.list, out = { taken: [], later: [], never: [] };
    if (!lm || !lm.decided) return out;
    Object.keys(lm.decided).forEach(function (k) {
      var v = lm.decided[k], id = String(k).replace(/^a/, '');
      if (v === 'take') out.taken.push(id); else if (v === 'later') out.later.push(id); else if (v === 'never') out.never.push(id);
    });
    return out;
  }
  // Подстановки в репликах — те же, что у движка (engine.js) и харнесса: готовые формы из backlog.js и mech-fields.js.
  // Имя участника из реплик убираем: в кабинете обращение к нему ничего не говорит.
  function subst(t) {
    t = String(t == null ? '' : t);
    if (t.indexOf('{') < 0) return t;
    var sets = refusedSets(), sums = listSums();
    if (/\{(whoName|who|title|а)\}/.test(t)) {
      var pk = window.imp.refusedParts ? window.imp.refusedParts(sets, sums, LIM) : {};
      t = t.split('{whoName}').join(pk.whoName || 'собеседник').split('{who}').join(pk.who || '')
           .split('{title}').join(pk.title || '').split('{а}').join(pk.she ? 'а' : '');
    }
    if (sums) t = t.split('{people}').join(String(sums.people)).split('{money}').join(num(sums.money));
    var sf = window.imp.subFacts;
    if (sf && t.indexOf('{futureRef}') >= 0) t = t.split('{futureRef}').join(sf.futureRef(d.mech && d.mech.futures));
    if (sf && t.indexOf('{over}') >= 0 && sums) t = t.split('{over}').join(sf.over(sums, LIM, plural, num));
    if ((t.indexOf('{forcedTitle}') >= 0 || t.indexOf('{forcedCost}') >= 0) && window.imp.forcedParts) {
      var fp = window.imp.forcedParts(sets.later.concat(sets.never), sums, LIM, num, plural, false);
      t = t.split('{forcedTitle}').join(fp.title).split('{forcedCost}').join(fp.cost);
    }
    return t.replace(/\{name\},?\s*/g, '').replace(/^\s*[,.]\s*/, '').replace(/^./, function (c) { return c.toUpperCase(); });
  }
  // Вопрос шага — реплики сцены между прошлым шагом и этим (и собственные реплики шага), в том виде, в каком их видел участник.
  function questionOf(step) {
    if (!step.act) return { who: '', lines: [], short: '' };
    var acts = step.scene.acts || [], i = acts.indexOf(step.act), lines = [], who = '';
    var lf = listFacts();
    var bubbleOk = function (b) {
      if (b && b.unless && condMet(b.unless, lf) === true) return false;
      if (b && b.when && condMet(b.when, lf) === false) return false;
      return true;
    };
    var push = function (w, bubbles) {
      (bubbles || []).filter(bubbleOk).forEach(function (b) { var x = subst(b.text); if (x) lines.push(x); });
      if (w) who = subst(w);
    };
    var start = i - 1;
    while (start >= 0 && acts[start].kind !== 'window' && acts[start].kind !== 'mechanic') start--;
    for (var j = start + 1; j < i; j++) {
      var a = acts[j];
      if (a.kind !== 'speech') continue;
      if (a.unless && condMet(a.unless, lf) === true) continue;
      if (a.when && condMet(a.when, lf) === false) continue;
      push(a.who, a.bubbles);
    }
    ['before', 'ask'].forEach(function (f) {
      var v = step.act && step.act[f];
      if (v && v.bubbles) push(v.who || step.act.who, v.bubbles);
    });
    // Строка-вопрос — последняя реплика с «?»; если вопросительной нет (письмо, разбор заявок) — самая длинная: в ней просьба.
    var shortQ = '';
    for (var k = lines.length - 1; k >= 0 && !shortQ; k--) if (/\?/.test(lines[k])) shortQ = lines[k];
    if (!shortQ) lines.forEach(function (l) { if (l.length > shortQ.length) shortQ = l; });
    return { who: who.split(',')[0], lines: lines, short: shortQ };
  }

  // ── этапы судейства → сцены маршрута ──────────────────────────────────────
  var STAGE_OF = null;
  function stageMap() {
    if (STAGE_OF) return STAGE_OF;
    STAGE_OF = { byLabel: {}, list: [] };
    var st = (d && d.stations) || {};
    Object.keys(st).forEach(function (id) {
      var s = st[id], scId = '';
      if (id === 'st_all') scId = 'all';
      else (s.windows || []).some(function (k) { var x = stepByKey(k); if (x) { scId = x.scene.id; return true; } return false; });
      if (!scId) return;
      STAGE_OF.byLabel[String(s.label)] = scId;
      STAGE_OF.list.push({ label: String(s.label), head: String(s.label).split(' · ')[0], scene: scId });
    });
    return STAGE_OF;
  }
  // Подпись этапа в записи → сцена. Точное совпадение; у записей с прежней подписью этапа — по её началу («Агеев · …»).
  function sceneOfStage(label) {
    var m = stageMap(), l = String(label || '');
    if (m.byLabel[l]) return m.byLabel[l];
    var head = l.split(' · ')[0];
    for (var i = 0; i < m.list.length; i++) if (m.list[i].head === head) return m.list[i].scene;
    return '';
  }
  function windowKeyOfLabel(label) {
    var wl = (d && d.windowLabels) || {}, l = String(label || '');
    var keys = Object.keys(wl);
    for (var i = 0; i < keys.length; i++) if (wl[keys[i]] === l) return keys[i];
    for (var j = 0; j < STEPS.length; j++) if (STEPS[j].label === l) return STEPS[j].key;
    return '';
  }

  // ── оценка: итог, чтения, контроль ────────────────────────────────────────
  function sc() { return d && d.scores; }
  function outOf(a) { var s = sc(); return s && s.verdicts && s.verdicts[a] ? s.verdicts[a].out || null : null; }
  function ovOf(a) {
    var s = sc(), o = s && s.overrides && s.overrides[a];
    return (o && has(o.overrideLevel)) ? o : null;
  }
  function finalOf(a) {
    var s = sc();
    if (!s) return { lv: null, judge: null, status: '', flagged: false, ov: null, scene: '' };
    var out = outOf(a) || {}, ov = ovOf(a), cons = out['сведение'] || null;
    var st = out['статус_результата'] || (s.statuses || {})[a] || '';
    var consFlags = (cons && cons['флаги']) || [];
    var ct = s.controlTaken && s.controlTaken[a];
    var lv = has(s.levels && s.levels[a]) ? Number(s.levels[a]) : null;
    var jl = (s.judgeLevels || s.levels || {})[a];
    var chosen = sceneOfStage(out['этап_решения'] || (cons && cons['выбрано_окно']));
    if (ct) {
      var co = ctrlOut(a);
      chosen = co ? sceneOfStage(co['этап_решения'] || '') : chosen;
    }
    return { lv: lv, judge: has(jl) ? Number(jl) : null, status: st, ov: ov, ct: ct || null, scene: chosen || '',
             flagged: !ov && (st === 'needs_review' || (st === 'scored_with_review_flag' && consFlags.length > 0)) };
  }
  // Контрольные чтения: у АК-1, АК-2, МК-1 — в cross (<способность>Out), у ПР-2 — в control.out.
  function ctrlOut(a) {
    var s = sc();
    if (!s) return null;
    if (s.cross && s.cross[a + 'Out']) return s.cross[a + 'Out'];
    if (s.control && s.control.out && OF_CODE[s.control.out['код']] === a) return s.control.out;
    return null;
  }
  // Чтения этапа: основные способности, у которых есть окно этого этапа, и контрольные.
  function readingsOf(scId) {
    var rows = [], s = sc();
    var mainSet = {}, ctlSet = {};
    (scId === 'all' ? [] : STEPS.filter(function (x) { return x.scene.id === scId; })).forEach(function (step) {
      var m = (S.measures || {})[step.key];
      if (!m) return;
      (m.main || []).forEach(function (c) { if (OF_CODE[c] && OF_CODE[c] !== 'ga1') mainSet[OF_CODE[c]] = true; });
      (m.control || []).forEach(function (c) { if (OF_CODE[c]) ctlSet[OF_CODE[c]] = true; });
    });
    if (scId === 'all') mainSet.ga1 = true;
    ABS.forEach(function (a) {
      var out = outOf(a);
      var e = out ? (out['этапы'] || []).filter(function (x) { return sceneOfStage(x['этап']) === scId; })[0] : null;
      if (e || mainSet[a]) rows.push({ a: a, role: 'main', e: e || null, out: out });
    });
    ABS.forEach(function (a) {
      var co = ctrlOut(a);
      var e = co ? (co['этапы'] || []).filter(function (x) { return sceneOfStage(x['этап']) === scId; })[0] : null;
      if (e || (ctlSet[a] && co)) rows.push({ a: a, role: 'control', e: e || null, out: co });
    });
    if (!s) rows.forEach(function (r) { r.e = null; });
    return rows;
  }
  function winOf(out, e) {
    var cons = out && out['сведение'];
    if (!cons || !e) return null;
    return (cons['окна'] || []).filter(function (w) { return w['этап'] === e['этап']; })[0] || null;
  }
  function stageLevel(r) {
    if (!r.e) return null;
    if (has(r.e['уровень'])) return Number(r.e['уровень']);
    var w = winOf(r.out, r.e);
    return w && has(w['уровень']) ? Number(w['уровень']) : null;
  }
  function stageFlags(r) {
    var cons = r.out && r.out['сведение'];
    if (!cons || !r.e) return [];
    return (cons['флаги'] || []).filter(function (f) { return f['этап'] === r.e['этап']; });
  }

  // ── вид: шапка, профиль, этапы, весь ответ, служебное ─────────────────────
  function render() {
    STAGE_OF = null;
    var s = sc();
    var flagged = ABS.filter(function (a) { return finalOf(a).flagged; });
    var html = headerHtml(flagged) + warnHtml() +
      '<div class="kc-app"><aside class="kc-side" aria-label="Профиль и этапы">' + profileHtml() + navHtml() + '</aside>' +
      '<main class="kc-main">' + SCENES.map(stageHtml).join('') + wholeHtml() + editsHtml() + svcHtml() + '</main></div>';
    root.innerHTML = html;
    document.title = bib6(bib) + (personName() ? ' · ' + personName() : '') + ' — карточка участника';
    if (window.imp.typoDom) window.imp.typoDom(root);
    highlight();
    void s;
  }

  function headerHtml(flagged) {
    var s = sc(), q = (d && d.queue) || {}, qx = q.extra || {};
    var qLeft = (q.queued || 0) + (q.running || 0) + (qx.queued || 0) + (qx.running || 0);
    var failed = failedIds();
    var pt = s && s.prelimTotal;
    var total = !s ? '—' : has(s.total) ? s.total : (pt && has(pt.min) ? (pt.min === pt.max ? String(pt.min) : pt.min + '–' + pt.max) : '—');
    var rep = d && d.report, checked = reportFresh(), published = !!(rep && rep.publishedAt);
    return '<header class="kc-top"><div class="kc-top-in">' +
      '<div class="kc-who">' + backLink() + '<span class="kc-sep"></span>' +
        '<div class="kc-name kc-one">' + esc(bib6(bib)) + (personName() ? ' <span>· ' + esc(personName()) + '</span>' : '') +
          (person && person.noScore ? ' <span>· не оценивать</span>' : '') + '</div>' +
        (flagged.length ? '<button type="button" class="kc-attn" data-act="attn"><span class="kc-dot"></span>' +
          (flagged.length === 1 ? 'для проверки: ' + esc(AB[flagged[0]].toLowerCase()) : 'для проверки: ' + flagged.length) + '</button>' : '') +
      '</div>' +
      '<div class="kc-tools">' +
        (ui.stateText ? '<span class="kc-state" id="kcState">' + esc(ui.stateText) + '</span>' : '<span class="kc-state" id="kcState"></span>') +
        '<div class="kc-total" title="' + esc(s && s.profileLabel ? 'Уровень профиля: ' + s.profileLabel : 'Сумма десяти поднавыков') + '"><b>' + esc(total) + '</b><i>из 50</i></div>' +
        // Отчёт — три шага (владелец 17.10): собрать (платно), посмотреть и поправить тексты, выдать участнику.
        (s ? '<button type="button" class="kc-btn kc-w-check ' + (checked || published ? '' : 'kc-btn-p') + '" data-act="check"' + (ui.busy ? ' disabled' : '') +
          ' title="' + esc(reportTip()) + '">' + (checked ? 'Отчёт собран ✓' : (rep && rep.state === 'ready' ? 'Собрать отчёт заново' : 'Сгенерировать отчёт')) + '</button>' : '') +
        (s ? '<button type="button" class="kc-btn" data-act="report"' + (rep && rep.state === 'ready' ? '' : ' disabled') + ' title="Отчёт так, как его увидит участник">Отчёт</button>' : '') +
        (s ? '<button type="button" class="kc-btn" data-act="edits"' + (checked ? '' : ' disabled') +
          ' title="' + (checked ? 'Тексты модели в отчёте — посмотреть и поправить' : 'Сначала соберите отчёт по нынешней оценке') + '">Править тексты' +
          (rep && rep.edits ? ' · ' + rep.edits : '') + '</button>' : '') +
        (s ? '<button type="button" class="kc-btn ' + (checked && !published ? 'kc-btn-p' : '') + '" data-act="publish"' + (ui.busy || (!checked && !published) ? ' disabled' : '') +
          ' title="' + esc(publishTip()) + '">' + (published ? (checked ? 'Выдан участнику ✓' : 'Выдан · устарел') : 'Выдать участнику') + '</button>' : '') +
        '<div class="kc-menuwrap"><button type="button" class="kc-btn" data-act="menu" aria-expanded="' + (ui.menu ? 'true' : 'false') + '">Ещё ' +
          '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 4.5l3 3 3-3"></path></svg></button>' +
        (ui.menu ? '<div class="kc-menu">' +
          '<button type="button" class="kc-mi" data-act="judgeAll"' + (ui.busy ? ' disabled' : '') + '><b>' + (s ? 'Пересудить всё' : 'Оценить') + '</b><span>судья заново читает все ответы, платно</span></button>' +
          '<button type="button" class="kc-mi" data-act="drain"' + (qLeft && !ui.busy ? '' : ' disabled') + '><b>Продолжить оценку</b><span>' + (qLeft ? 'в очереди: ' + qLeft + ' — сделанное не оплачивается заново' : 'в очереди ничего нет') + '</span></button>' +
          '<button type="button" class="kc-mi" data-act="judgeFailed"' + (failed.length && !qLeft && !ui.busy ? '' : ' disabled') + '><b>Пересудить упавшие</b><span>' + (failed.length ? 'заданий с ошибкой: ' + failed.length : 'заданий с ошибкой нет') + '</span></button>' +
          '<div class="kc-msep"></div>' +
          '<button type="button" class="kc-mi" data-act="svc"><b>Номер участника</b><span>имя, перенос в поток, сброс, удаление</span></button>' +
          '<button type="button" class="kc-mi" data-act="svc"><b>Служебное</b><span>версии, время по этапам</span></button>' +
          // Удаление — прямо из меню (замечание владельца 19.10): раньше оно было только внизу карточки, за «Номер участника».
          '<div class="kc-msep"></div>' +
          '<button type="button" class="kc-mi kc-mi-del" data-act="del"><b>Удалить номер</b><span>вместе с ответами, оценками и отчётом</span></button>' +
        '</div>' : '') +
        '</div>' +
      '</div></div></header>';
  }
  // ⚠ ВОЗВРАТ В КАБИНЕТ — В ТУ ЖЕ ВКЛАДКУ КАБИНЕТА (замечание владельца 19.10). Карточку открывает кабинет отдельным окном
  // (cabinet.js, openCard). Раньше «← поток» и «← В кабинет» после удаления открывали кабинет заново прямо в окне карточки:
  // получался второй кабинет, и пока он входил по сохранённому паролю, на экране стояла форма входа. Теперь окно карточки
  // переключает свой кабинет на нужный список, говорит ему, что случилось, и закрывается. Кабинета-родителя нет (карточку
  // открыли по ссылке, кабинет закрыли) или браузер не дал закрыть окно — обычный переход по адресу.
  // Номер без потока возвращается в список «Без потока», а не на «Все потоки».
  function cabHash() {
    if (!person) return '';
    return !person.waveId || !waveNameOf(person.waveId) ? '#w=none' : '#w=' + encodeURIComponent(person.waveId);
  }
  function backLink() {
    var h = cabHash(), name = h === '#w=none' ? 'Без потока' : (person ? waveNameOf(person.waveId) : '');
    return '<a class="kc-back" href="administrator.html' + esc(h) + '" data-hash="' + esc(h) + '">← ' + esc(name || 'Кабинет') + '</a>';
  }
  function toCabinet(hash, note) {
    var op = null;
    try { if (window.opener && !window.opener.closed && /administrator\.html$/.test(window.opener.location.pathname)) op = window.opener; } catch (e) {}
    if (op) {
      try {
        if ((op.location.hash || '') !== hash) op.location.hash = hash;
        op.postMessage({ imp: 'kartochka', note: note || '' }, location.origin);
        op.focus();
      } catch (e) {}
      window.close();
    }
    setTimeout(function () { location.href = 'administrator.html' + hash; }, op ? 400 : 0);
  }
  function waveNameOf(id) {
    var w = waves.filter(function (x) { return String(x.id) === String(id); })[0];
    return w ? (w.name || w.label || ('Поток ' + (w.num || ''))) : '';
  }
  function failedIds() {
    var out = [];
    ((d && d.queue && d.queue.failed) || []).forEach(function (f) { if (!f.retired && out.indexOf(f.taskId) < 0) out.push(f.taskId); });
    return out;
  }
  // Отчёт собран по нынешней оценке и после него уровни не правили — «Проверено ✓»; иначе кнопка зовёт нажать.
  function reportFresh() {
    var r = d && d.report, s = sc();
    if (!r || r.state !== 'ready' || !s) return false;
    if (r.stale) return false;                 // бэкенд сверил отпечаток данных (17.10): правки уровня и пересуд
    if (r.judgedAt && s.judgedAt && String(r.judgedAt) !== String(s.judgedAt)) return false;
    var built = Date.parse(r.builtAt || '');
    return !ABS.some(function (a) { var o = ovOf(a); return o && o.at && !isNaN(built) && Date.parse(o.at) > built; });
  }
  function reportTip() {
    var r = d && d.report;
    if (!r || !r.state) return 'Собрать отчёт участника и тексты модели (платно, 1–3 минуты). Участник его не увидит до «Выдать участнику»';
    if (r.state === 'generating') return 'Отчёт собирается…';
    if (r.state === 'error') return 'Отчёт не собран: ' + (r.error || 'ошибка');
    return reportFresh() ? 'Отчёт собран ' + dt(r.builtAt) + ' по нынешней оценке. Нажать ещё раз — собрать заново (выдача участнику снимется)'
      : 'Отчёт собран ' + dt(r.builtAt) + ' по прежней оценке — нажмите, чтобы собрать по нынешней';
  }
  function publishTip() {
    var r = d && d.report;
    if (r && r.publishedAt) return reportFresh() ? 'Выдан участнику ' + dt(r.publishedAt) + ': открывается по номеру на странице отчёта. Нажать — закрыть'
      : 'Выдан ' + dt(r.publishedAt) + ', но собран по прежней оценке — участнику сейчас не показывается. Соберите заново и выдайте; нажать — закрыть выдачу';
    return reportFresh() ? 'Открыть участнику отчёт по его номеру на странице отчёта' : 'Сначала соберите отчёт по нынешней оценке';
  }
  function warnHtml() {
    var s = sc(), w = [];
    if (d && d.stale) w.push('Оценка вынесена по другому тексту ответа: участник менял ответы после судейства — пересудите.');
    var rp = d && d.report;
    if (rp && rp.publishedAt && rp.state === 'ready' && !reportFresh()) w.push('Отчёт был выдан участнику, но собран по прежней оценке — участнику он сейчас не показывается. Соберите заново и выдайте.');
    var rubNow = d && d.versions && d.versions.expectRubric;
    if (s && rubNow && s.rubricVersion && s.rubricVersion !== rubNow) w.push('Оценка по прежним правилам (' + s.rubricVersion + '): с новыми оценками не сравнивать.');
    if (!s) w.push('Ещё не судили: «Ещё» → «Оценить».');
    return w.length ? '<div class="kc-warn">' + w.map(esc).join(' ') + '</div>' : '';
  }

  function lvCls(lv, f, small) {
    return 'kc-lv' + (small ? ' kc-lv-sm' : '') + (lv === null ? ' kc-lv-none' : f.ov ? ' kc-lv-human' : f.flagged ? ' kc-lv-flag' : '');
  }
  function profileHtml() {
    return SKILLS.map(function (sk) {
      var vals = sk.abs.map(function (a) { return finalOf(a).lv; });
      var sum = vals.every(function (v) { return v !== null; }) ? vals[0] + vals[1] : '—';
      return '<div class="kc-sk"><div class="kc-sk-h"><span>' + esc(sk.name) + '</span><span>' + sum + '<i> / 10</i></span></div>' +
        sk.abs.map(function (a) {
          var f = finalOf(a), sceneId = f.scene || (a === 'ga1' ? 'all' : '');
          var tip = f.ov ? 'поставили вы' : f.flagged ? 'отмечено для проверки' : (sceneId ? 'итог взят: ' + sceneTitle(sceneId) : '');
          return '<a class="kc-ab" href="#' + esc(sceneId ? 'kc-' + sceneId : '') + '" data-act="go" data-ab="' + a + '" title="' + esc(tip) + '">' +
            '<span class="kc-ab-n">' + esc(AB[a]) + '</span><span class="' + lvCls(f.lv, f, true) + '">' + (f.lv === null ? '—' : f.lv) + '</span></a>';
        }).join('') + '</div>';
    }).join('');
  }
  function sceneTitle(id) {
    if (id === 'all') return 'весь ответ';
    var x = SCENES.filter(function (s) { return s.id === id; })[0];
    return x ? sceneShort(x) : '';
  }
  function navHtml() {
    var flagScene = {};
    ABS.forEach(function (a) { var f = finalOf(a); if (f.flagged && f.scene) flagScene[f.scene] = true; });
    return '<nav class="kc-nav" aria-label="Этапы"><div class="kc-lbl" style="margin-bottom:4px">Этапы</div>' +
      SCENES.map(function (s, i) {
        return '<a class="kc-nv" href="#kc-' + esc(s.id) + '"><span class="kc-n">' + (i + 1) + '</span><span class="kc-nm kc-one">' + esc(sceneName(s)) + '</span>' +
          (flagScene[s.id] ? '<span class="kc-dot"></span>' : '') + '</a>';
      }).join('') +
      '<a class="kc-nv" href="#kc-all"><span class="kc-n">∑</span><span class="kc-nm">Весь ответ</span>' + (flagScene.all ? '<span class="kc-dot"></span>' : '') + '</a></nav>';
  }

  // Окно с ответом, которого в нынешнем маршруте нет (mainfrom — «Как пришли к ней», маршруты до .96; судья его читает,
  // v2StageWindows_), — ставим после предыдущего окна записи, на тот же этап.
  function stepsOf(scene) {
    var steps = STEPS.filter(function (x) { return x.scene === scene; });
    var wins = (d && d.windows) || [];
    wins.forEach(function (w, i) {
      if (w.legacy || stepByKey(w.key) || !String(w.text || '').trim()) return;
      var prev = null;
      for (var j = i - 1; j >= 0 && !prev; j--) prev = stepByKey(wins[j].key);
      if (!prev || prev.scene !== scene) return;
      var at = steps.indexOf(prev);
      steps.splice(at + 1, 0, { key: w.key, mech: null, conditional: false, act: null, scene: scene, when: '', unless: '',
        label: (d.windowLabels || {})[w.key] || w.key });
    });
    return steps;
  }
  function stageHtml(scene, i) {
    var steps = stepsOf(scene);
    var tm = d && d.process && d.process.timing && d.process.timing.stages && d.process.timing.stages[scene.id];
    var rows = readingsOf(scene.id);
    return '<section class="kc-stage" id="kc-' + esc(scene.id) + '">' +
      '<div class="kc-st-h"><span class="kc-n">' + (i + 1) + '</span><h2>' + esc(sceneName(scene)) + '</h2>' +
        (scene.where ? '<span class="kc-s">' + esc(String(scene.where).replace(/^[А-ЯЁ]/, function (c) { return c.toLowerCase(); })) + '</span>' : '') +
        (tm && tm.timedOut ? '<span class="kc-tag-v" title="Ответ ушёл таким, каким был в момент обнуления таймера: участник мог не успеть дописать">закрыт по времени</span>' : '') +
      '</div><div class="kc-grid"><div class="kc-answers">' + steps.map(stepHtml).join('') + '</div>' +
      '<div class="kc-rail"><div class="kc-lbl">Оценки этапа</div>' + railHtml(rows, scene.id) + '</div></div></section>';
  }

  function stepHtml(step) {
    var at = answeredAt(step), ask = asked(step);
    var q = questionOf(step);
    if (at === null) {
      var why = ask === false ? 'не спрашивали: условие шага не сработало' : (d.process && d.process.finishedAt ? 'промолчал' : 'не дошёл');
      return '<div class="kc-step" id="kc-s-' + esc(step.key) + '"><p class="kc-none"><b>' + esc(step.label) + '</b> — ' + esc(why) + '</p></div>';
    }
    var open = !!ui.qOpen[step.key];
    var qHtml = q.lines.length ? '<details class="kc-q" data-q="' + esc(step.key) + '"' + (open ? ' open' : '') + '><summary>' + CHEV_R +
      '<span class="kc-one">' + (q.who ? esc(q.who) + ': ' : '') + '«' + esc(q.short) + '»</span></summary>' +
      '<div class="kc-q-full">' + q.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div></details>' : '';
    return '<div class="kc-step" id="kc-s-' + esc(step.key) + '">' +
      '<div class="kc-lbl">' + esc(step.label) + '</div>' + qHtml + cardHtml(step) +
      '<div class="kc-ans" data-step="' + esc(step.key) + '">' + answerBody(step) + '</div></div>';
  }
  function answerBody(step) {
    if (step.mech) {
      var spec = M[step.mech], obj = d.mech[step.mech];
      if (spec && spec.answerHtml) { try { return spec.answerHtml(obj, mechCtx()) + judgeSees(step.mech, obj); } catch (e) { /* форма сменилась — ниже сырой вид */ } }
      return '<pre style="white-space:pre-wrap;font-size:13px">' + esc(JSON.stringify(obj, null, 1)) + '</pre>';
    }
    var w = (d.windows || []).filter(function (x) { return x.key === step.key && !x.legacy; })[0];
    return '<p>' + br(w ? w.text : '') + '</p>';
  }
  // ⚠ ЧТО СУДЬЯ ЧИТАЕТ СВЕРХ ВИДА УЧАСТНИКА (найдено 15.10 на 033010). Вид верстака (answerHtml) — то, что участник видит во
  // вкладке «Мои ответы»; судья читает текст из записи (v2MechText_ в code.js), и в нём есть то, чего вкладка не печатает:
  // у наблюдений — «самое тревожное» и «почему именно это» (у прохождений до 29.09), у двух стратегий — что участник сделал
  // под давлением, у цели — срок (до 29.09). Без этих строк цитата судьи не находилась в ответе. Слова — те же, что у судьи.
  function judgeSees(mech, m) {
    var s = function (v) { return String(v == null ? '' : v).trim(); }, h = '';
    if (!m) return '';
    if (mech === 'theses') {
      var f = (m.cards || []).filter(function (c) { return c.id === m.first; })[0];
      if (f && s(f.text)) {
        h += '<p><b>Самое тревожное наблюдение:</b> ' + br(f.text) + '</p>';
        if (s(m.why)) h += '<p><b>Почему именно это:</b> ' + br(m.why) + '</p>';
      }
    }
    if (mech === 'seal') {
      h += '<p><b>' + esc(!m.returned ? 'К разбору не возвращался.' : m.changed === true ? 'Возвращался к разбору и изменил его после давления.'
        : m.changed === false ? 'Возвращался к разбору после давления, пересмотрел и оставил как есть.' : 'К разбору возвращался после давления.') + '</b></p>';
    }
    if (mech === 'goal' && m.years) h += '<p><b>Срок:</b> ' + esc(m.years) + ' ' + plural(Number(m.years), 'год', 'года', 'лет') + '</p>';
    return h;
  }
  // Карточка заявки на выходе — как на экране участника (решение владельца 26.08): из записи (exitTalk, с 15.10) или тем же
  // правилом выбора собеседника, что у движка (backlog.js), у прохождений до 15.10.
  function cardHtml(step) {
    if (!step.act || step.act.card !== 'refused') return '';
    var t = d.exitTalk, sets = refusedSets(), sums = listSums();
    if (!t || !t.title) {
      var r = window.imp.refusedOwner ? window.imp.refusedOwner(sets, sums, LIM) : null;
      if (!r) return '';
      t = { id: r.id, title: r.title, who: r.who, people: r.people, money: r.money,
            later: !!(window.imp.refusedOwnerIsLater && window.imp.refusedOwnerIsLater(sets, sums, LIM)) };
    }
    return '<div class="kc-box"><div class="kc-lbl">' + (t.later ? 'Заявка, которую участник отложил' : 'Заявка, которую участник решил не брать') + '</div>' +
      '<div class="kc-box-t">' + (t.id ? esc(window.imp.backlogNum(t.id)) + ' · ' : '') + esc(t.title) + '</div>' +
      '<div class="kc-s">' + esc(t.who || '') + ((t.people || t.money) ? ' · ' + (Number(t.people) || 0) + ' чел. · ' + num(t.money || 0) + ' млрд' : '') + '</div></div>';
  }

  // ── оценки этапа ───────────────────────────────────────────────────────────
  function railHtml(rows, scId) {
    if (!rows.length) return '<p class="kc-s">На этом этапе поднавыки не оцениваются.</p>';
    return rows.map(function (r, i) {
      var key = scId + ':' + r.role + ':' + r.a, open = ui.open === key;
      var f = finalOf(r.a), lv = stageLevel(r);
      var flaggedHere = r.role === 'main' && !f.ov && (stageFlags(r).length > 0 || (winOf(r.out, r.e) || {})['вид'] === 'doubt');
      var cls = 'kc-row' + (r.role === 'control' ? ' kc-row-ctl' : '') + (open ? ' kc-row-open' : '') + (i === rows.length - 1 ? ' kc-row-end' : '');
      var sub, subCls = 'kc-rs';
      if (r.role === 'control') sub = f.ct && f.scene === scId ? 'контроль · взят в итог: выше основного' : 'контроль · в итог не идёт';
      else if (!sc()) sub = 'ещё не судили';
      else if (!r.e) sub = 'на этом этапе не оценено' + (f.lv !== null ? ' · итог ' + f.lv : '');
      else if (f.ov) sub = 'итог ' + f.lv + ' — поставили вы';
      else if (f.ct && f.scene === scId) sub = 'итог ' + f.lv + ' — по контрольному чтению';
      else if (f.scene === scId) { sub = flaggedHere ? 'в итоге · отмечено для проверки' : 'в итоге'; if (flaggedHere) subCls += ' kc-rs-v'; }
      else sub = 'итог ' + (f.lv === null ? '—' : f.lv) + (f.scene ? ' — ' + sceneTitle(f.scene) : '');
      var lc = r.role === 'control' ? 'kc-lv kc-lv-sm kc-lv-ctl' : 'kc-lv' + (lv === null ? ' kc-lv-none' : flaggedHere ? ' kc-lv-flag' : '');
      return '<div class="' + cls + '">' +
        '<button type="button" class="kc-rh" data-act="row" data-key="' + esc(key) + '" aria-expanded="' + (open ? 'true' : 'false') + '"' + (r.e ? '' : ' disabled') + '>' +
          '<span class="' + lc + '">' + (lv === null ? '—' : lv) + '</span>' +
          '<span class="kc-rt"><span class="kc-rn kc-one">' + esc(AB[r.a]) + (r.role === 'control' ? ' · контроль' : '') + '</span><span class="' + subCls + '">' + esc(sub) + '</span></span>' +
          (r.e ? CHEV_D : '') +
        '</button>' + (open && r.e ? panelHtml(r, scId, key) : '') + '</div>';
    }).join('');
  }

  var B_STATUS = { passed: 'ok', not_passed: 'no', ambiguous: 'amb', insufficient_input: 'amb', invalid_output: 'amb' };
  var B_HEAD = { ambiguous: 'Неоднозначна:', insufficient_input: 'Нехватка данных:', invalid_output: 'Ошибка выдачи судьи:' };
  // Строки границ одного чтения (форма этапа из записи, v2KStageForm_): статус, первая цитата и пояснения. Чистая функция —
  // её проверяет scripts/checks/v2_levels.test.js на записях, собранных тем же путём, что у живого участника.
  //   выполнена — цитата (у АК-1 по счёту доменов — сколько доменов); неоднозначна / нехватка данных / ошибка выдачи — словами
  //   статуса и пояснением судьи, а не «не выполнена»; не выполнена — чего не хватило, основание отказа, решавшее границу
  //   (принятое — какое место сняло; не принятое — почему), снятие при исправлении (с объяснением судьи или «без основания»).
  //   Невыполненная граница без пояснений показывается одна — первая.
  function boundLines(e) {
    var lines = [], gapShown = false;
    ((e && e['границы']) || []).forEach(function (b, i) {
      var st = B_STATUS[b['статус']] || 'no', k = i + 2, notes = [];
      var q = (b['цитаты'] || [])[0] || null;
      if (st === 'ok') {
        if (!q && b['домены']) notes.push({ head: '', text: 'внешних доменов: ' + b['домены']['внешних'] });
      } else if (st === 'amb') {
        var dbt = b['сомнение'] || {};
        notes.push({ head: B_HEAD[b['статус']] || 'Неоднозначна:', text: kb(dbt['пояснение'] || '') || (b['дефекты_выдачи'] || []).join('; ') || 'решения нет' });
      } else {
        var miss = String(e['не_хватает_у'] || '') === b['граница'] ? String(e['не_хватает'] || '') : '';
        if (miss) notes.push({ head: 'Не хватило:', text: kb(miss) });
        else if (b['домены']) notes.push({ head: 'Не хватило:', text: 'внешних доменов ' + b['домены']['внешних'] + ' при пороге ' + b['домены']['нужно'] });
        (b['основание_отказа'] || []).forEach(function (t) {
          if (t['решало'] === false) return;
          if (t['решало'] === undefined && !t['принято']) return;
          notes.push(t['принято'] ? { head: (t['вид'] || 'основание') + ' сняла границу:', text: '«' + t['место'] + '»' + (t['как_применено'] ? ' — ' + kb(t['как_применено']) : '') }
                                 : { head: 'Основание отказа не принято:', text: String(t['почему_не_принято'] || '') + ' — «' + t['место'] + '»' });
        });
        if (b['снята_при_коррекции']) notes.push({ head: 'Граница ' + b['граница'] + ' снята при исправлении:', text: kb(b['снята_при_коррекции']) });
        if (b['снята_без_основания']) notes.push({ head: '', text: 'снята при исправлении без основания — отмечено для проверки' });
        if (!notes.length && !gapShown) notes.push({ head: '', text: 'не выполнена' });
        gapShown = true;
        if (notes.length) q = null;
      }
      if (!q && !notes.length) return;
      lines.push({ i: i, k: k, b: (k - 1) + '→' + k, st: st, quote: q ? String(q['цитата'] || '') : '', field: q ? String(q['поле'] || '') : '', notes: notes });
    });
    return lines;
  }
  // Что сказать о поднавыке целиком, сверх границ этапа: особые правила методологии, места с флагом, чья цитата не подтвердилась,
  // неисправленные ошибки выдачи судьи. Чистая функция, проверяется тем же тестом.
  function outNotes(out) {
    var n = [];
    if (!out) return n;
    if (out['статус_результата'] === 'not_observed') n.push('не наблюдалось — ответа для этого поднавыка нет');
    (out['особые_правила'] || []).forEach(function (x) { n.push('Особое правило методологии: ' + kb(x)); });
    (out['места_не_подтверждены'] || []).forEach(function (m) {
      n.push('место «' + m['место'] + '» — ' + m['что_меняет'] + '; цитата судьи не подтверждена' + (m['почему'] ? ' (' + m['почему'] + ')' : '') +
             (m['цитата_судьи'] ? ': «' + m['цитата_судьи'] + '»' : ''));
    });
    (out['технические_ошибки_судьи'] || []).forEach(function (t) {
      if (t['исправлено'] === false) n.push('Ошибка выдачи судьи не исправлена' + (t['граница'] ? ' (граница ' + t['граница'] + ')' : '') + ': ' + (t['что'] || t['вид'] || ''));
    });
    // Места, где методолог говорит о флаге (уровень с флагом, ручная проверка), и зелёный флаг — названием места, без цитаты.
    (out['флаги'] || []).forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      if (/^зелёный/.test(f['тип'] || '')) n.push('Сильная сторона: ' + (f['правило'] || f['основание'] || ''));
      else if (/^методология/.test(f['тип'] || '')) n.push('Место методологии: ' + (f['правило'] || f['тип']));
    });
    return n;
  }
  // Почему чтение этапа отмечено для проверки: флаги сведения этого окна и возможные уровни (с 17.10 выставлен верхний;
  // окно без флага — сомнение уровня не решает — строки не получает).
  function flagLine(out, e) {
    var cons = out && out['сведение'];
    if (!cons || !e) return '';
    var fl = (cons['флаги'] || []).filter(function (f) { return f['этап'] === e['этап']; });
    var w = (cons['окна'] || []).filter(function (x) { return x['этап'] === e['этап']; })[0];
    if (!fl.length) return '';
    var why = fl.map(function (x) { return (x['граница'] ? 'граница ' + x['граница'] + ': ' : '') + kb(x['причина'] || x['вид'] || ''); }).join(' ');
    var vars = w && (w['варианты'] || []).length > 1 ? ' Возможные уровни: ' + w['варианты'].join(', ') + ' — поставлен верхний.' : '';
    if (why && vars) { why = why.replace(/[\s;:,]+$/, ''); if (!/[.!?…]$/.test(why)) why += '.'; }
    return (why + vars).trim();
  }
  function boundsHtml(r, key, withWhere) {
    var lines = boundLines(r.e).map(function (l) {
      var where = '';
      if (l.quote && withWhere) {
        var wk = windowKeyOfLabel(l.field), stp = wk ? stepByKey(wk) : null;
        where = stp ? sceneShort(stp.scene) + ' · ' + stp.label : l.field;
      }
      return '<li class="kc-bd kc-bd-' + l.st + '"><span class="kc-ic" aria-hidden="true">' + (l.st === 'ok' ? '✓' : l.st === 'no' ? '✕' : '?') + '</span>' +
        '<span class="kc-bk" title="' + esc(boundQuestion(r.a, l.k)) + '">' + l.b + '</span><span class="kc-bt">' +
        (l.quote ? '<a class="kc-qt" data-act="quote" data-qid="' + esc(key + '#' + l.i) + '" title="' + esc(l.quote) + '">«' + esc(l.quote) + '»</a>' +
             (where ? '<span class="kc-s">' + esc(where) + '</span>' : '') : '') +
        l.notes.map(function (n) { return '<span style="display:block">' + (n.head ? '<b>' + esc(n.head) + '</b> ' : '') + esc(n.text) + '</span>'; }).join('') +
        '</span></li>';
    });
    return lines.length ? '<ul class="kc-bds">' + lines.join('') + '</ul>' : '';
  }
  // Вопрос границы — дословно из раздела методологии, как его читает судья (бэкенд отдаёт строки раздела, v2BoundaryQuestions_).
  function boundQuestion(a, k) {
    var L = d && d.boundaryQuestions && d.boundaryQuestions[a];
    return L && L[k] ? L[k] : 'граница ' + (k - 1) + '→' + k;
  }

  function panelHtml(r, scId, key) {
    var e = r.e, a = r.a, f = finalOf(a), h = '';
    if (r.role === 'main') {
      var fline = flagLine(r.out, e);
      if (!f.ov && fline) h += '<p class="kc-flag"><b>Отмечено для проверки.</b> ' + esc(fline) + '</p>';
    }
    if (e['причина']) h += '<p class="kc-why">' + esc(kb(e['причина'])) + '</p>';
    h += boundsHtml(r, key, scId === 'all');
    if (r.role === 'main' && f.scene === scId) outNotes(r.out).forEach(function (t) { h += '<p class="kc-s">' + esc(t) + '</p>'; });
    if (r.role === 'main') {
      h += fixHtml(a, f) + actsHtml(a, f);
    } else {
      var cl = stageLevel(r), mainLv = f.judge;
      h += '<p class="kc-s">Второе чтение того же поднавыка по другому ответу. В итог идёт, только если выше основного.</p>';
      var acts = [];
      if (!f.ov && cl !== null && f.lv !== null && cl !== f.lv && !f.ct) acts.push('<button type="button" class="kc-link" data-act="acceptCtl" data-ab="' + a + '" data-lv="' + cl + '" data-main="' + (mainLv === null ? '' : mainLv) + '">Принять контрольный ' + cl + '</button>');
      if (CTRL_TASK_OF[a]) acts.push('<button type="button" class="kc-link" data-act="rejudge" data-task="' + CTRL_TASK_OF[a] + '"' + (ui.busy ? ' disabled' : '') + ' title="Платно: заново только контрольное чтение">Пересудить контроль</button>');
      if (acts.length) h += '<div class="kc-acts">' + acts.join('') + '</div>';
    }
    return '<div class="kc-panel">' + h + '</div>';
  }
  function fixHtml(a, f) {
    var out = outOf(a), cons = out && out['сведение'], wins = (cons && cons['окна']) || [];
    var note = wins.length > 1 ? 'Итог — больший из этапов: ' + wins.map(function (w) { return sceneTitle(sceneOfStage(w['этап'])) + ' ' + (has(w['уровень']) ? w['уровень'] : '—'); }).join(', ') : 'Итог поднавыка';
    if (f.ct) note += '. Взят контроль: ' + f.ct.control + ' при основном ' + f.ct.main;
    var x = sc() && sc().extra && sc().extra[a], xl = x && has(x.level) ? Number(x.level) : null;
    var h = '<div class="kc-fix"><p class="kc-s">' + esc(note) + '</p>';
    if (xl !== null) {
      h += '<p class="kc-s">Доп. оценка по всему ответу: ' + xl + (x.at ? ' · ' + esc(dt(x.at)) : '') +
        (!f.ov && f.lv !== null && xl !== f.lv ? ' · <button type="button" class="kc-link" style="height:auto" data-act="acceptExtra" data-ab="' + a + '" data-lv="' + xl + '" data-main="' + (f.judge === null ? '' : f.judge) + '">принять ' + xl + '</button>' : '') + '</p>';
    }
    if (f.ov) {
      h += '<div class="kc-ovl"><span class="kc-lv kc-lv-sm kc-lv-human">' + f.lv + '</span><span>Поставили вы' + (f.judge !== null ? ' · судья давал ' + f.judge : '') +
        (f.ov.at ? ' · ' + esc(dt(f.ov.at)) : '') + (f.ov.reason ? '<br><span class="kc-s">«' + esc(f.ov.reason) + '»</span>' : '') + '</span></div>' +
        '<div><button type="button" class="kc-link" data-act="clearOv" data-ab="' + a + '">Вернуть уровень судьи</button></div>';
    } else if ((d.overrideAbilities || []).indexOf(a) >= 0) {
      var dr = ui.drafts[a] || {};
      h += '<div class="kc-segs" role="group" aria-label="Свой уровень">' + [1, 2, 3, 4, 5].map(function (n) {
        var cls = 'kc-sg' + (dr.level === n ? ' kc-sg-on' : (n === f.lv ? ' kc-sg-j' : ''));
        return '<button type="button" class="' + cls + '" data-act="pick" data-ab="' + a + '" data-lv="' + n + '" aria-pressed="' + (dr.level === n ? 'true' : 'false') + '"' +
          ' title="' + (n === f.lv ? 'уровень сейчас' : 'поставить ' + n) + '">' + n + '</button>';
      }).join('') + '</div>' +
        '<div class="kc-fix-row"><input class="kc-inp" type="text" data-reason="' + a + '" aria-label="Почему свой уровень" placeholder="Почему — обязательно" value="' + esc(dr.reason || '') + '" />' +
        '<button type="button" class="kc-btn kc-btn-d" data-act="save" data-ab="' + a + '"' + (dr.level && String(dr.reason || '').trim() ? '' : ' disabled') + '>Сохранить</button></div>';
    }
    return h + '</div>';
  }
  function actsHtml(a) {
    var pair = PAIR[a];
    var tip = 'Платно: судья заново читает ответы этого поднавыка' + (pair ? '; вместе с «' + AB[pair] + '» — их судит одно задание' : '');
    return '<div class="kc-acts"><button type="button" class="kc-link" data-act="rejudge" data-task="' + TASK_OF[a] + '"' + (ui.busy ? ' disabled' : '') + ' title="' + esc(tip) + '">Пересудить</button>' +
      (EXTRA_OF[a] ? '<button type="button" class="kc-link" data-act="rejudge" data-task="extra_' + a + '" data-extra="1"' + (ui.busy ? ' disabled' : '') +
        ' title="Судья этой способности читает весь ответ участника; в итог сама не идёт — её можно принять. Платно.">Доп. оценка</button>' : '') + '</div>';
  }

  function wholeHtml() {
    var rows = readingsOf('all').filter(function (r) { return r.role === 'main'; });
    var r = rows[0];
    if (!r) return '';
    var f = finalOf(r.a), lv = stageLevel(r);
    var key = 'all:main:' + r.a;
    return '<section class="kc-stage" id="kc-all"><div class="kc-st-h"><span class="kc-n">∑</span><h2>Весь ответ</h2>' +
      '<span class="kc-s">генерацию альтернатив судья читает по всему ассессменту</span></div>' +
      '<div class="kc-whole"><div class="kc-wh-h"><span class="' + lvCls(f.ov ? f.lv : lv, f, false) + '">' + (f.ov ? f.lv : (lv === null ? '—' : lv)) + '</span>' +
        '<span class="kc-rt"><span class="kc-rn">' + esc(AB[r.a]) + '</span><span class="kc-rs' + (f.flagged ? ' kc-rs-v' : '') + '">' +
          esc(!sc() ? 'ещё не судили' : f.ov ? 'итог — поставили вы' : f.flagged ? 'в итоге · отмечено для проверки' : 'в итоге') + '</span></span></div>' +
      (r.e ? panelHtml(r, 'all', key) : '') + '</div></section>';
  }

  function svcHtml() {
    var s = sc(), v = (d && d.versions) || {}, p = (d && d.process) || {};
    var tm = p.timing && p.timing.stages ? p.timing.stages : null;
    var timeRows = tm ? SCENES.map(function (scn) {
      var t = tm[scn.id];
      if (!t || !t.startedAt) return '';
      var a = Date.parse(t.startedAt), b = t.endedAt ? Date.parse(t.endedAt) : NaN;
      var m = !isNaN(a) && !isNaN(b) ? Math.round((b - a) / 60000) + ' мин' : 'не закончен';
      return '<dt>' + esc(sceneShort(scn)) + '</dt><dd>' + m + (t.timedOut ? ' · закрыт по времени' : '') + '</dd>';
    }).join('') : '';
    var to = waves.filter(function (w) { return !w.archived && person && String(w.id) !== String(person.waveId || ''); });
    var runner = p.runner;
    return '<details class="kc-svc" id="kc-svc"' + (ui.svc ? ' open' : '') + '><summary><span class="kc-lbl">Служебное и номер участника</span></summary>' +
      '<div class="kc-svc-g"><div><div class="kc-lbl">Версии</div><dl class="kc-kv">' +
        '<dt>Маршрут</dt><dd>' + esc(v.scenes || '—') + (v.expectScenes && v.scenes !== v.expectScenes ? ' (нынешний ' + esc(v.expectScenes) + ')' : '') + '</dd>' +
        '<dt>Кейс</dt><dd>' + esc(v.caseVer || '—') + '</dd>' +
        '<dt>Правила оценки</dt><dd>' + esc((s && s.rubricVersion) || '—') + '</dd>' +
        '<dt>Судья</dt><dd>' + esc((s && s.judgeModel) || '—') + (s && s.judgedAt ? ' · ' + esc(dt(s.judgedAt)) : '') + '</dd>' +
        (p.startedAt ? '<dt>Ассессмент</dt><dd>' + esc(dt(p.startedAt)) + (p.finishedAt ? ' — ' + esc(dt(p.finishedAt)) : '') + '</dd>' : '') +
        (runner ? '<dt>Прогон модели</dt><dd>' + esc(runner.tag || runner.harness || 'да') + '</dd>' : '') +
      '</dl></div>' +
      '<div><div class="kc-lbl">Время по этапам</div>' + (timeRows ? '<dl class="kc-kv">' + timeRows + '</dl>' : '<p class="kc-s" style="margin-top:8px">без таймера</p>') + '</div>' +
      '<div><div class="kc-lbl">Номер участника</div><div class="kc-fm">' +
        (person ? '<input class="kc-inp" id="kcName" type="text" aria-label="Имя" placeholder="Имя" value="' + esc(person.firstName || '') + '" />' +
          '<label class="kc-chk"><input type="checkbox" id="kcNoScore"' + (person.noScore ? ' checked' : '') + ' /> Не оценивать этот номер</label>' : '') +
        (to.length ? '<div class="kc-fix-row"><select class="kc-inp" id="kcWave" aria-label="Перенести в поток">' + to.map(function (w) {
          return '<option value="' + esc(w.id) + '">Перенести в «' + esc(w.name || w.label || w.num) + '»' + (w.isAi ? ' · ИИ' : '') + '</option>';
        }).join('') + '</select><button type="button" class="kc-btn" data-act="move">Перенести</button></div>' : '') +
        '<div class="kc-fix-row"><button type="button" class="kc-btn" data-act="reset">Сбросить ассессмент</button><button type="button" class="kc-btn" data-act="del">Удалить номер</button></div>' +
      '</div></div></div></details>';
  }

  // ── подсветка цитат в ответе: по тексту, без учёта пробелов и переносов строк ─
  function quoteById(qid) {
    var m = /^(.*)#(\d+)$/.exec(qid);
    if (!m) return null;
    var parts = m[1].split(':'), scId = parts[0], role = parts[1], a = parts[2];
    var r = readingsOf(scId).filter(function (x) { return x.role === role && x.a === a; })[0];
    var b = r && r.e && (r.e['границы'] || [])[Number(m[2])];
    var q = b && (b['цитаты'] || [])[0];
    return q ? { q: q, scId: scId } : null;
  }
  function quotesOfOpen() {
    if (!ui.open) return [];
    var parts = ui.open.split(':'), scId = parts[0], role = parts[1], a = parts[2];
    var r = readingsOf(scId).filter(function (x) { return x.role === role && x.a === a; })[0];
    if (!r || !r.e) return [];
    var out = [];
    (r.e['границы'] || []).forEach(function (b, i) {
      (b['цитаты'] || []).forEach(function (q, j) { out.push({ q: q, qid: ui.open + '#' + i, first: j === 0, scId: scId }); });
    });
    return out;
  }
  function stepElOf(q, scId) {
    var wk = windowKeyOfLabel(q['поле']);
    var node = wk ? root.querySelector('.kc-ans[data-step="' + wk + '"]') : null;
    if (node && markIn(node, q['цитата'], null, true)) return node;
    // Подпись поля не нашлась или цитата не в этом поле — ищем по тексту в ответах этапа, затем во всех.
    var pool = [].slice.call(root.querySelectorAll(scId && scId !== 'all' ? '#kc-' + scId + ' .kc-ans' : '.kc-ans'));
    if (scId && scId !== 'all') pool = pool.concat([].slice.call(root.querySelectorAll('.kc-ans')));
    for (var i = 0; i < pool.length; i++) if (markIn(pool[i], q['цитата'], null, true)) return pool[i];
    return null;
  }
  function highlight() {
    quotesOfOpen().forEach(function (x) {
      var node = stepElOf(x.q, x.scId);
      if (node) markIn(node, x.q['цитата'], x.qid === ui.focus && x.first ? 'kc-hl kc-hl-f' : 'kc-hl', false);
    });
  }
  // Находит цитату в тексте узла и оборачивает её в <mark>; dry — только проверить, есть ли. Терпимость — как у сверки цитат
  // в бэкенде (v2Norm_, v2QuoteFound_): регистр, ё/е, пробелы и переносы, кавычки, тире и маркеры списка, разметка не
  // учитываются; склейка многоточием — каждый кусок отдельно. Иначе цитату, которую платформа подтвердила (например, взятую
  // судьёй в «ёлочки»), карточка не нашла бы в ответе.
  var Q_SKIP = /[\s«»"“”„'*#`_\-–—•]/;
  function qChar(c) { c = c.toLowerCase(); return c === 'ё' ? 'е' : c; }
  function qParts(quote) {
    return String(quote || '').split(/\[\.\.\.\]|\.\.\.|…/).map(function (p) {
      var t = '';
      for (var i = 0; i < p.length; i++) if (!Q_SKIP.test(p[i])) t += qChar(p[i]);
      return t.replace(/^[.,;:!?]+|[.,;:!?]+$/g, '');
    }).filter(function (t) { return t.length >= 2; });
  }
  function markIn(node, quote, cls, dry) {
    var parts = qParts(quote);
    if (!parts.length) return null;
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false), map = [], flat = '', t;
    while ((t = walker.nextNode())) {
      var s = t.nodeValue;
      for (var i = 0; i < s.length; i++) if (!Q_SKIP.test(s[i])) { flat += qChar(s[i]); map.push([t, i]); }
    }
    var spans = [];
    parts.forEach(function (target) {
      var at = flat.indexOf(target);
      if (at >= 0) spans.push([map[at], map[at + target.length - 1]]);
    });
    if (!spans.length) return null;
    if (dry) return true;
    var first = null;
    // С конца: разрез текстового узла сдвигает позиции только правее места разреза.
    spans.reverse().forEach(function (sp) {
      var start = sp[0], end = sp[1], nodes = [], n = start[0];
      var w2 = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
      w2.currentNode = start[0];
      nodes.push(start[0]);
      while (n !== end[0] && (n = w2.nextNode())) nodes.push(n);
      nodes.reverse().forEach(function (tn) {
        var a = tn === start[0] ? start[1] : 0, b = tn === end[0] ? end[1] + 1 : tn.nodeValue.length;
        if (b <= a) return;
        var mid = tn.splitText(a);
        mid.splitText(b - a);
        var mk = document.createElement('mark');
        mk.className = cls;
        mid.parentNode.insertBefore(mk, mid);
        mk.appendChild(mid);
        first = mk;
      });
    });
    return first;
  }

  // ── действия ───────────────────────────────────────────────────────────────
  function call(action, extra) {
    var p = { password: pw };
    Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
    return window.imp.callApi(action, p);
  }
  function errText(res) { return res === null ? 'сервер не ответил' : String((res && (res.message || res.error)) || 'не получилось'); }
  function setState(t) { ui.stateText = t; var x = el('kcState'); if (x) x.textContent = t; }

  root.addEventListener('click', function (ev) {
    var bl = ev.target.closest('a.kc-back');
    if (bl && !(ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)) { ev.preventDefault(); toCabinet(bl.getAttribute('data-hash') || '', ''); return; }
    var t = ev.target.closest('[data-act]');
    if (!t || t.disabled) return;
    var act = t.getAttribute('data-act'), a = t.getAttribute('data-ab');
    if (act === 'quote' || act === 'go') ev.preventDefault();
    if (act === 'menu') { ui.menu = !ui.menu; render(); return; }
    if (ui.menu && act !== 'menu') ui.menu = false;
    if (act === 'row') {
      var key = t.getAttribute('data-key');
      ui.open = ui.open === key ? null : key; ui.focus = null; render();
      return;
    }
    if (act === 'quote') {
      ui.focus = t.getAttribute('data-qid');
      var x = quoteById(ui.focus);
      if (/^all:/.test(ui.focus)) ui.open = ui.focus.split('#')[0];
      render();
      var mk = root.querySelector('mark.kc-hl-f') || (x ? stepElOf(x.q, x.scId) : null);
      if (mk && mk.scrollIntoView) mk.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (act === 'go' || act === 'attn') {
      var ab = a || ABS.filter(function (z) { return finalOf(z).flagged; })[0];
      if (!ab) return;
      var f = finalOf(ab), scId = f.scene || (ab === 'ga1' ? 'all' : '');
      if (!scId) return;
      ui.open = scId + ':main:' + ab; ui.focus = null; render();
      var sec = el('kc-' + scId);
      if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (act === 'svc') { ui.svc = true; render(); var sv = el('kc-svc'); if (sv) sv.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (act === 'pick') {
      var dr = ui.drafts[a] = ui.drafts[a] || {};
      dr.level = Number(t.getAttribute('data-lv')); render(); return;
    }
    if (act === 'save') return saveOverride(a);
    if (act === 'clearOv') return clearOverride(a);
    if (act === 'acceptCtl' || act === 'acceptExtra') return acceptOther(a, act === 'acceptCtl' ? 'control' : 'extra', t.getAttribute('data-lv'), t.getAttribute('data-main'));
    if (act === 'rejudge') return rejudge(t.getAttribute('data-task'), !!t.getAttribute('data-extra'));
    if (act === 'judgeAll') return judgeAll();
    if (act === 'drain') { render(); return drain(); }
    if (act === 'judgeFailed') return judgeFailed();
    if (act === 'check') return reportCheck();
    if (act === 'report') return openReport();
    if (act === 'edits') return openEdits();
    if (act === 'publish') return publishToggle();
    if (act === 'edSave') return editSave(t.getAttribute('data-blk'));
    if (act === 'edClear') return editClear(t.getAttribute('data-blk'));
    if (act === 'move') return moveWave();
    if (act === 'reset') return resetNumber();
    if (act === 'del') return deleteNumber();
  });
  root.addEventListener('input', function (ev) {
    var a = ev.target.getAttribute && ev.target.getAttribute('data-reason');
    if (!a) return;
    var dr = ui.drafts[a] = ui.drafts[a] || {};
    dr.reason = ev.target.value;
    var btn = root.querySelector('[data-act="save"][data-ab="' + a + '"]');
    if (btn) btn.disabled = !(dr.level && String(dr.reason || '').trim());
  });
  root.addEventListener('keydown', function (ev) {
    var a = ev.target.getAttribute && ev.target.getAttribute('data-reason');
    if (a && ev.key === 'Enter') { ev.preventDefault(); saveOverride(a); }
  });
  root.addEventListener('toggle', function (ev) {
    var k = ev.target.getAttribute && ev.target.getAttribute('data-q');
    if (k) ui.qOpen[k] = ev.target.open;
    var bk = ev.target.getAttribute && ev.target.getAttribute('data-blk');
    if (bk) ui.rep.openKeys[bk] = ev.target.open;
    if (ev.target.id === 'kc-svc') ui.svc = ev.target.open;
  }, true);
  root.addEventListener('change', function (ev) {
    if (!person) return;
    if (ev.target.id === 'kcName') {
      var val = ev.target.value.trim();
      if (val === String(person.firstName || '')) return;
      call('setParticipantName', { bib: bib, firstName: val }).then(function (r) { after(r, 'имя сохранено'); });
    }
    if (ev.target.id === 'kcNoScore') {
      call('setNoScore', { bib: bib, value: ev.target.checked ? '1' : '' }).then(function (r) { after(r, 'отметка сохранена'); });
    }
  });
  document.addEventListener('click', function (ev) {
    if (ui.menu && !ev.target.closest('.kc-menuwrap')) { ui.menu = false; render(); }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ui.menu) { ui.menu = false; render(); } });

  function after(res, okMsg) {
    if (res && res.ok) { setState(okMsg || 'готово'); return reload(); }
    return window.imp.alert('Не вышло: ' + errText(res)).then(function () {});
  }
  function saveOverride(a) {
    var dr = ui.drafts[a] || {};
    if (!dr.level) return;
    if (!String(dr.reason || '').trim()) {
      window.imp.alert('Напишите, почему вы ставите свой уровень: без причины правка через месяц неотличима от опечатки.');
      return;
    }
    setState('сохраняю уровень…');
    call('setScoreOverride', { bib: bib, ability: a, level: dr.level, reason: String(dr.reason).trim() }).then(function (r) {
      if (r && r.ok) { delete ui.drafts[a]; }
      after(r, 'уровень поставлен вами');
    });
  }
  function clearOverride(a) {
    window.imp.confirm('Вернуть уровень судьи по поднавыку «' + AB[a] + '»? Ваша правка и причина будут стёрты.', { confirmLabel: 'Вернуть' }).then(function (yes) {
      if (!yes) return;
      call('clearScoreOverride', { bib: bib, ability: a }).then(function (r) { after(r, 'вернул уровень судьи'); });
    });
  }
  function acceptOther(a, via, lv, main) {
    var reason = via === 'control' ? 'принята контрольная оценка: контроль L' + lv + ', судья L' + main
      : 'принята доп. оценка по всему ответу: доп. L' + lv + ', судья L' + main;
    call('setScoreOverride', { bib: bib, ability: a, level: lv, via: via, reason: reason }).then(function (r) {
      after(r, via === 'control' ? 'принят контрольный уровень' : 'принята доп. оценка');
    });
  }

  // Очередь судьи — тем же путём, что в кабинете: постановка (judgeAnswers) и разбор по три задания (runJudgeQueue) с
  // номером участника; обрыв ожидания — не отказ: спрашиваем состояние очереди и идём дальше, пока она движется.
  function enqueue(ids) {
    var i = 0;
    var next = function () {
      var args = { bib: bib };
      if (ids[i]) { args.taskId = ids[i]; setState('ставлю в очередь: ' + ids[i] + (ids.length > 1 ? ' (' + (i + 1) + ' из ' + ids.length + ')' : '')); }
      return call('judgeAnswers', args).then(function (res) {
        if (res && res.ok && ++i < ids.length) return next();
        return res;
      });
    };
    ui.busy = true; render();
    return next().then(function (res) {
      if (!res || !res.ok) {
        ui.busy = false;
        var e = res && res.error ? res.error : 'не удалось поставить в очередь';
        setState(e === 'scenes_version_mismatch' ? 'версия сцен в ответах не совпадает с судейской — судейство отказано (это защита, а не сбой)'
          : e === 'no_score' ? 'участник помечен «не оценивать»' : String(e));
        render();
        return;
      }
      return drain();
    });
  }
  function drain() {
    ui.busy = true;
    var lastLeft = Infinity, stall = 0;
    var finish = function (text) { ui.busy = false; setState(text); return reload(); };
    var step = function (n) {
      setState('оцениваю… (сделано ' + n + ')');
      return call('runJudgeQueue', { max: 3, bib: bib }).then(function (r) {
        if (!r || !r.ok) {
          return call('v2Detail', { bib: bib }).then(function (dd) {
            var q = dd && dd.queue;
            if (!q) { ui.busy = false; setState('бэкенд не ответил — «Ещё» → «Продолжить оценку»'); render(); return; }
            var qe = q.extra || {};
            var left = (q.queued || 0) + (q.running || 0) + (qe.queued || 0) + (qe.running || 0);
            if (left <= 0) return finish('готово: заданий сделано ' + (q.done || 0));
            if (left < lastLeft) { lastLeft = left; stall = 0; }
            else if (++stall >= 3) { ui.busy = false; setState('очередь не двигается: осталось ' + left + ' — «Ещё» → «Продолжить оценку»'); render(); return; }
            setState('оцениваю… (в очереди осталось ' + left + ')');
            return step(n);
          });
        }
        var total = n + (r.done || 0);
        if (r.left > 0) { setState('оцениваю… (сделано ' + total + ', осталось ' + r.left + ')'); return step(total); }
        var errs = (r.errors || []).length ? ' · ошибки: ' + r.errors.map(function (x) { return x.taskId; }).join(', ') : '';
        return finish('готово: ' + total + ' ' + plural(total, 'задание', 'задания', 'заданий') + errs);
      }).catch(function (e) {
        ui.busy = false; setState('оценка прервана сбоем: ' + (e && e.message ? e.message : e) + ' — «Ещё» → «Продолжить оценку»'); render();
      });
    };
    return step(0);
  }
  function rejudge(task, isExtra) {
    var msg = isExtra
      ? 'Доп. оценка по всему ответу: судья этого поднавыка читает все ответы участника. Платный вызов. В итог сама не идёт — примете, если сочтёте верной.'
      : 'Пересудить только это задание? Остальные оценки не трогаются; платный вызов судьи.';
    window.imp.confirm(msg, { confirmLabel: 'Пересудить' }).then(function (yes) { if (yes) enqueue([task]); });
  }
  function judgeAll() {
    var s = sc();
    window.imp.confirm(s ? 'Пересудить всё? Судья заново читает все ответы — платно, за все задания. Ручные правки уровней, принятые из контроля или доп. оценки, снимутся.'
      : 'Оценить участника? Судья читает все ответы — платно.', { confirmLabel: s ? 'Пересудить всё' : 'Оценить' }).then(function (yes) { if (yes) enqueue([null]); });
  }
  function judgeFailed() {
    var ids = failedIds();
    window.imp.confirm('Пересудить упавшие задания (' + ids.length + ')? Остальные оценки не трогаются; по одному платному вызову на задание.', { confirmLabel: 'Пересудить' })
      .then(function (yes) { if (yes) enqueue(ids); });
  }

  function writeWin(w, html) { try { w.document.open(); w.document.write(html); w.document.close(); } catch (e) { /* вкладку закрыли */ } }
  function waitPage(text, isError) {
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + (isError ? 'Отчёт не открылся' : 'Отчёт загружается…') + '</title></head>' +
      '<body style="margin:0;font-family:Georgia,serif;background:#fff;color:#181818;display:flex;min-height:100vh;align-items:center;justify-content:center">' +
      '<p style="max-width:32em;padding:24px;font-size:18px;line-height:1.5">' + String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p></body></html>';
  }
  function openReport() {
    var w = window.open('', '_blank');
    if (w) writeWin(w, waitPage('Отчёт загружается — обычно это занимает до минуты.'));
    call('reportGet', { bib: bib }).then(function (res) {
      if (!w) { window.imp.alert('Браузер не дал открыть вкладку — разрешите всплывающие окна для этой страницы.'); return; }
      if (res && res.ok && res.html) { writeWin(w, res.html); return; }
      writeWin(w, waitPage('Отчёт не открылся: ' + errText(res) + '.', true));
    });
  }
  function reportCheck() {
    var s = sc() || {}, rp = d && d.report;
    var waiting = (s.pending || []).concat(s.notSeen || []);
    window.imp.confirm('Собрать отчёт участника? Платформа соберёт отчёт и напишет тексты (платный вызов модели, 1–3 минуты). ' +
      'Участник его не увидит, пока вы не нажмёте «Выдать участнику».' +
      (rp && rp.publishedAt ? ' Нынешняя выдача участнику снимется до новой.' : '') +
      (rp && rp.edits ? ' Ваши правки текстов переносятся, если уровни поднавыков не изменились.' : '') +
      (waiting.length ? ' Без окончательного уровня: ' + waiting.map(function (a) { return AB[a] || a; }).join(', ') +
        ' — в отчёте они будут предварительной оценкой или без оценки.' : ''), { confirmLabel: 'Собрать' }).then(function (yes) {
      if (!yes) return;
      ui.busy = true; render();
      setState('отчёт собирается… это 1–3 минуты, окно можно не закрывать');
      call('reportCheck', { bib: bib }).then(function (res) {
        ui.busy = false;
        if (res && res.ok) {
          ui.rep.blocks = null;
          var dropped = (res.editsDropped || []).length;
          setState('отчёт собран' + (dropped ? ' · сброшено правок: ' + dropped + ' (уровень изменился)' : '') + ' — проверьте и нажмите «Выдать участнику»');
          return reload();
        }
        setState(res === null ? 'сервер не ответил — обновите страницу: отчёт мог собраться'
          : 'отчёт не собран: ' + (REPORT_ERR[res.error] || res.error || 'ошибка') + (res.detail ? ' (' + res.detail + ')' : ''));
        render();
      });
    });
  }
  // ── выдача участнику и правка текстов отчёта (владелец 17.10) ─────────────────
  function publishToggle() {
    var rp = d && d.report;
    if (!rp || rp.state !== 'ready') return;
    var on = !rp.publishedAt;
    var q = on ? 'Выдать отчёт участнику? Он откроется по номеру ' + bib6(bib) + ' на странице отчёта' +
        (rp.edits ? ' — с вашими правками текстов (' + rp.edits + ')' : '') + '.'
      : 'Закрыть отчёт от участника? По номеру он перестанет открываться, пока вы не выдадите его снова.';
    window.imp.confirm(q, { confirmLabel: on ? 'Выдать' : 'Закрыть' }).then(function (yes) {
      if (!yes) return;
      ui.busy = true; render();
      call('reportPublish', { bib: bib, on: on ? '1' : '' }).then(function (res) {
        ui.busy = false;
        if (res && res.ok) { setState(on ? 'отчёт выдан участнику' : 'отчёт закрыт от участника'); return reload(); }
        setState('не вышло: ' + (res ? (REPORT_ERR[res.error] || res.error || 'ошибка') : 'сервер не ответил'));
        render();
      });
    });
  }
  function openEdits() {
    ui.rep.open = true;
    if (!ui.rep.blocks && !ui.rep.loading) loadBlocks();
    render();
    var sec = el('kc-edits');
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function loadBlocks() {
    ui.rep.loading = true; ui.rep.err = '';
    call('reportBlocks', { bib: bib }).then(function (res) {
      ui.rep.loading = false;
      if (res && res.ok) { ui.rep.blocks = res.blocks || []; ui.rep.dropped = res.dropped || []; }
      else ui.rep.err = res ? (REPORT_ERR[res.error] || res.error || 'ошибка') : 'сервер не ответил';
      render();
    });
  }
  function blockByKey(key) { return (ui.rep.blocks || []).filter(function (b) { return b.key === key; })[0] || null; }
  // Поля блока из формы: у списков «рядом с ИИ» — строка на навык.
  function editFields(key) {
    var b = blockByKey(key), box = root.querySelector('[data-blk="' + key + '"]');
    if (!b || !box) return null;
    if (b.list) {
      var items = [];
      [].forEach.call(box.querySelectorAll('textarea[data-item]'), function (ta) {
        if (String(ta.value || '').trim()) items.push({ 'навык': ta.getAttribute('data-item'), 'текст': ta.value });
      });
      return { items: items };
    }
    var f = {};
    b.fields.forEach(function (fd) { var ta = box.querySelector('textarea[data-f="' + fd[0] + '"]'); f[fd[0]] = ta ? ta.value : ''; });
    return f;
  }
  function afterEdit(key, res, okMsg) {
    ui.rep.busy[key] = false;
    if (res && res.ok) {
      if (res.block) ui.rep.blocks = (ui.rep.blocks || []).map(function (b) { return b.key === key ? res.block : b; });
      if (res.report && d) d.report = res.report;
      setState(okMsg + (res.block && res.block.check && res.block.check.length ? ' · есть замечания проверки' : ''));
      render();
      return;
    }
    setState('не вышло: ' + (res ? (REPORT_ERR[res.error] || res.error || 'ошибка') + (res.detail ? ' (' + res.detail + ')' : '') : 'сервер не ответил'));
    render();
  }
  function editSave(key) {
    var f = editFields(key);
    if (!f) return;
    ui.rep.busy[key] = true; render();
    setState('сохраняю правку и пересобираю отчёт…');
    call('reportEdit', { bib: bib, block: key, fields: JSON.stringify(f) }).then(function (res) { afterEdit(key, res, 'правка сохранена, отчёт пересобран'); });
  }
  function editClear(key) {
    window.imp.confirm('Вернуть в этот блок текст модели? Ваша правка будет стёрта.', { confirmLabel: 'Вернуть' }).then(function (yes) {
      if (!yes) return;
      ui.rep.busy[key] = true; render();
      call('reportEdit', { bib: bib, block: key, clear: '1' }).then(function (res) { afterEdit(key, res, 'текст модели возвращён'); });
    });
  }
  function fieldText(b, name) {
    var src = b.edit && b.edit.fields ? b.edit.fields : (b.model || {});
    return String(src[name] == null ? '' : src[name]);
  }
  function editBlockHtml(b) {
    var k = b.key, open = !!ui.rep.openKeys[k], busy = !!ui.rep.busy[k];
    var chips = (b.edit ? '<span class="kc-chip kc-chip-h">правлено' + (b.edit.at ? ' ' + dt(b.edit.at) : '') + '</span>' : '') +
      (b.check && b.check.length ? '<span class="kc-chip kc-chip-v">замечания: ' + b.check.length + '</span>' : '') +
      (!b.model && !b.edit ? '<span class="kc-chip">' + (b.modelState === 'rejected' ? 'текст модели не прошёл проверку — блока нет в отчёте'
        : b.modelState === 'missing' ? 'текст не сгенерирован — блока нет в отчёте' : 'текста нет') + '</span>' : '');
    var who = b.abilityName ? esc(b.abilityName) + (b.level ? ' · уровень ' + b.level : '') : (b.skills ? 'навыки: ' + esc(b.skills.join(', ')) : '');
    var form;
    if (b.list) {
      var items = (b.edit && b.edit.fields && b.edit.fields.items) || (b.model && b.model.items) || [];
      var names = b.skills || [];
      items.forEach(function (it) { if (names.indexOf(it['навык']) < 0) names.push(it['навык']); });
      form = names.map(function (n) {
        var it = items.filter(function (x) { return x['навык'] === n; })[0];
        return '<label class="kc-ed-f"><span class="kc-lbl">' + esc(n) + '</span><textarea class="kc-ta" data-item="' + esc(n) + '" rows="3">' + esc(it ? it['текст'] : '') + '</textarea></label>';
      }).join('');
    } else {
      form = b.fields.map(function (fd) {
        return '<label class="kc-ed-f"><span class="kc-lbl">' + esc(fd[1]) + '</span><textarea class="kc-ta" data-f="' + esc(fd[0]) + '" rows="' + (fd[0] === 'текст' ? 4 : 3) + '">' + esc(fieldText(b, fd[0])) + '</textarea></label>';
      }).join('');
    }
    var modelNote = b.edit && b.model ? '<div class="kc-ed-cur"><span class="kc-lbl">Текст модели</span>' +
      (b.list ? (b.model.items || []).map(function (x) { return '<p><b>' + esc(x['навык']) + '.</b> ' + esc(x['текст']) + '</p>'; }).join('')
        : b.fields.map(function (fd) { return '<p>' + (b.fields.length > 1 ? '<b>' + esc(fd[1]) + '.</b> ' : '') + esc(String(b.model[fd[0]] == null ? '' : b.model[fd[0]])) + '</p>'; }).join('')) + '</div>' : '';
    var check = b.check && b.check.length ? '<div class="kc-flag"><b>Проверка платформы:</b> ' + b.check.map(esc).join('; ') + '. Правка в отчёте остаётся — решать вам.</div>' : '';
    return '<details class="kc-q kc-eb" data-blk="' + esc(k) + '"' + (open ? ' open' : '') + '><summary>' + CHEV_R + '<span class="kc-eb-t">' + esc(b.label) + '</span>' +
        (who ? '<span class="kc-eb-w">' + who + '</span>' : '') + chips + '</summary>' +
      '<div class="kc-ed-body">' + modelNote + form + check +
        '<div class="kc-fix-row"><button type="button" class="kc-btn kc-btn-p" data-act="edSave" data-blk="' + esc(k) + '"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Сохраняю…' : 'Сохранить') + '</button>' +
          (b.edit ? '<button type="button" class="kc-btn" data-act="edClear" data-blk="' + esc(k) + '"' + (busy ? ' disabled' : '') + '>Вернуть текст модели</button>' : '') + '</div>' +
      '</div></details>';
  }
  function editsHtml() {
    if (!ui.rep.open) return '';
    var body;
    if (ui.rep.loading) body = '<p class="kc-s">Загружаю тексты отчёта…</p>';
    else if (ui.rep.err) body = '<p class="kc-s">Тексты не загрузились: ' + esc(ui.rep.err) + '.</p>';
    else if (!ui.rep.blocks || !ui.rep.blocks.length) body = '<p class="kc-s">Блоков модели в этом отчёте нет.</p>';
    else {
      var groups = [], byName = {};
      ui.rep.blocks.forEach(function (b) {
        var g = b.skill || 'Рядом с ИИ';
        if (!byName[g]) { byName[g] = []; groups.push(g); }
        byName[g].push(b);
      });
      body = groups.map(function (g) {
        return '<div class="kc-ed-g"><div class="kc-lbl">' + esc(g) + '</div>' + byName[g].map(editBlockHtml).join('') + '</div>';
      }).join('');
    }
    var dropped = ui.rep.dropped && ui.rep.dropped.length ? '<div class="kc-flag"><b>Сброшены при последней сборке:</b> ' +
      ui.rep.dropped.map(function (x) { var b = blockByKey(x.block); return esc((b ? b.label + (b.abilityName ? ' (' + b.abilityName + ')' : '') : x.block) + ' — ' + x.why); }).join('; ') + '.</div>' : '';
    return '<section class="kc-stage" id="kc-edits"><div class="kc-st-h"><span class="kc-n">✎</span><h2>Тексты отчёта</h2>' +
      '<span class="kc-s">правка заменяет текст модели в отчёте; проверка платформы только предупреждает. Тексты Кати и уровни здесь не правятся</span></div>' +
      dropped + body + '</section>';
  }
  function moveWave() {
    var sel = el('kcWave'), to = sel && waves.filter(function (w) { return String(w.id) === String(sel.value); })[0];
    if (!to) return;
    window.imp.confirm('Перенести ' + bib6(bib) + ' в поток «' + (to.name || to.num) + '»? Ответы, оценки и отчёт останутся за номером.', { confirmLabel: 'Перенести' })
      .then(function (yes) { if (yes) call('setParticipantWave', { bib: bib, wave: to.id }).then(function (r) { after(r, 'номер перенесён в «' + (to.name || to.num) + '»'); }); });
  }
  // Исход действия с номером неясен (сервер не ответил): сказать, что известно, и дать обновить карточку или вернуться.
  function notice(text) {
    root.innerHTML = '<div class="kc-msg"><p>' + esc(text) + '</p><p style="margin-top:12px;display:flex;gap:14px;align-items:center">' +
      '<button type="button" class="kc-btn" id="kcRetry">Обновить карточку</button>' + backLink() + '</p></div>';
    el('kcRetry').addEventListener('click', function () { root.innerHTML = '<p class="kc-msg">Загружаю карточку…</p>'; reload(); });
  }
  function resetNumber() {
    window.imp.confirm('Стереть ассессмент у ' + bib6(bib) + '? Ответы, оценки и ручные правки уровней по этому номеру исчезнут. Отменить это нельзя.',
      { confirmLabel: 'Стереть', danger: true }).then(function (yes) {
      if (!yes) return;
      call('resetProgress', { bib: bib, confirm: 'RESET' }).then(function (r) {
        // Номер остался — карточка остаётся открытой и показывает его без ассессмента (раньше — тупиковый экран, 19.10).
        if (r && r.ok) { ui.note = 'Ассессмент у ' + bib6(bib) + ' стёрт. Номер остался за участником.'; return reload(); }
        if (r === null) return notice('Сервер отвечает долго — сброс, скорее всего, прошёл. Обновите карточку через минуту.');
        return after(r);
      });
    });
  }
  // Номера больше нет — карточке нечего показывать: возвращаемся в кабинет, к списку, где он был, с отметкой об удалении.
  function removed() {
    var h = cabHash(), note = 'номер ' + bib6(bib) + ' удалён';
    root.innerHTML = '<div class="kc-msg"><p>Номер ' + esc(bib6(bib)) + ' удалён. Возвращаю в кабинет…</p><p style="margin-top:12px">' + backLink() + '</p></div>';
    toCabinet(h, note);
  }
  function deleteNumber() {
    window.imp.confirm('Удалить номер ' + bib6(bib) + ' вместе с ответами, оценками и отчётом? Отменить нельзя.', { confirmLabel: 'Удалить', danger: true }).then(function (yes) {
      if (!yes) return;
      call('deleteParticipant', { bib: bib }).then(function (r) {
        if (r && r.ok) return removed();
        // Нет ответа ≠ не удалено (06.10): удаление идёт после того, как браузер перестал ждать. Сверяем список.
        if (r === null) return call('v2List', {}).then(function (lst) {
          var still = lst && lst.ok && (lst.participants || []).concat(lst.roster || []).some(function (p) { return bk(p.bib) === bk(bib); });
          if (still) notice('Сервер не ответил, номер в списке ещё есть — попробуйте удалить ещё раз.'); else removed();
        });
        return after(r);
      });
    });
  }

  // Чистые функции вида — для scripts/checks/v2_levels.test.js (проверка без браузера на записях из кода судейства).
  window.imp.kartochkaView = { boundLines: boundLines, outNotes: outNotes, flagLine: flagLine, kb: kb };

  // ── загрузка ───────────────────────────────────────────────────────────────
  function reload() {
    return Promise.all([call('v2Detail', { bib: bib }), call('v2List', {})]).then(function (rs) {
      var det = rs[0], lst = rs[1];
      if (lst && lst.ok) {
        waves = lst.waves || [];
        // Строка ответов (поток, ход) и строка регистрации (имя, «не оценивать») — одна запись номера.
        var mine = function (arr) { return (arr || []).filter(function (p) { return bk(p.bib) === bk(bib); })[0] || null; };
        var pr = mine(lst.participants), rr = mine(lst.roster);
        if (pr || rr) person = Object.assign({}, pr || {}, rr || {});
      }
      if (det && det.error === 'not_found') {
        d = { windows: [], mech: {}, facts: null, scores: null, queue: {}, notFound: true };
        root.innerHTML = '';
        renderNotFound();
        return;
      }
      if (!det || !det.ok) {
        root.innerHTML = '<div class="kc-msg"><p>Карточка не загрузилась: ' + esc(det === null ? 'сервер не ответил' : (det.message || det.error || 'ошибка сервера')) + '.</p>' +
          '<p style="margin-top:12px"><button type="button" class="kc-btn" id="kcRetry">Повторить</button></p></div>';
        el('kcRetry').addEventListener('click', function () { root.innerHTML = '<p class="kc-msg">Загружаю карточку…</p>'; reload(); });
        return;
      }
      d = det;
      render();
    });
  }
  // Номер есть, ассессмента нет: карточка из одних действий с номером.
  function renderNotFound() {
    ui.svc = true;
    var note = ui.note || ''; ui.note = '';
    root.innerHTML = '<div class="kc-app" style="grid-template-columns:minmax(0,1fr)"><main class="kc-main"><div class="kc-stage">' +
      '<p style="margin:0 0 10px">' + backLink() + '</p>' +
      '<div class="kc-st-h"><h2>' + esc(bib6(bib)) + (personName() ? ' · ' + esc(personName()) : '') + '</h2></div>' +
      (note ? '<p class="kc-s" style="color:var(--ink)">' + esc(note) + '</p>' : '') +
      '<p class="kc-s">Ассессмент по этому номеру ещё не начат.</p></div>' + svcHtml() + '</main></div>';
  }

  function login(val, auto) {
    return window.imp.callApi('verifyPassword', { password: val }).then(function (res) {
      if (!res || !res.ok) {
        try { if (res && res.error === 'unauthorized') sessionStorage.removeItem(PW_KEY); } catch (e) {}
        showGate(!res ? 'Сервер не ответил — нажмите «Войти» ещё раз.' : res.error === 'unauthorized' ? (auto ? '' : 'Неверный пароль.') : 'Сервер ответил ошибкой: ' + (res.error || 'без кода') + '.');
        return;
      }
      if (res.role && String(res.role) !== 'full') { location.replace('vedushchiy.html'); return; }
      pw = val;
      try { sessionStorage.setItem(PW_KEY, val); } catch (e) {}
      el('kcGate').style.display = 'none';
      root.style.display = '';
      return reload();
    });
  }
  function showGate(err) {
    root.style.display = 'none';
    el('kcGate').style.display = '';
    var e = el('kcPassErr');
    if (err) { e.textContent = err; e.style.display = ''; } else e.style.display = 'none';
    el('kcPass').focus();
  }
  el('kcPassBtn').addEventListener('click', function () { var v = el('kcPass').value.trim(); if (v) login(v, false); });
  el('kcPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var v = el('kcPass').value.trim(); if (v) login(v, false); } });
  (function start() {
    if (!bib) { root.innerHTML = '<div class="kc-msg"><p>Номер участника не указан. Откройте карточку из кабинета.</p><p style="margin-top:12px"><a href="administrator.html">← В кабинет</a></p></div>'; return; }
    var saved = '';
    try { saved = sessionStorage.getItem(PW_KEY) || ''; } catch (e) {}
    if (saved) login(saved, true); else showGate('');
  })();
})();

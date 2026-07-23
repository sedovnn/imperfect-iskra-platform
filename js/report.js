// i(m)perfect — генератор отчёта участника (полная версия).
// Шкала ОДНА: уровни 1–5. Способность = уровень 1–5 (с названием). Навык = среднее
// двух способностей (1–5, с названием). ИИ = ОКНО на той же шкале 1–5 (от худшей
// модели к лучшей). Человек: ниже окна / в окне / выше. Никаких /10 и /50.
// Стиль — продуктовый DESIGN.md (FP: вермилион-акцент, окно ИИ — Jordy Blue, Inter Tight),
// структура — по спеке отчёта (15_report_frame / 17_report_example). Подпись futureproof в футере.
// Тексты — из window.IMP_REPORT_TEXTS (js/report-texts.js). Экспорт: window.impReport.build/.download.
(function () {
  'use strict';

  // РЕАЛЬНЫЕ прогоны эталонных моделей (кейс «Искра», пакет v4 «равные условия»,
  // судья @51, июль 2026): МЕДИАНА 3 прогонов, балл НАВЫКА = сумма двух способностей
  // (шкала 2–10). Источник — _ai_dispersion_report.md, ЕДИНСТВЕННОЕ место с числами.
  // Порядок массива = [Opus, Haiku, ChatGPT, Алиса, GigaChat]. Индекс 0 (Opus) —
  // ПЕРЕДОВАЯ модель: в полосу-окно НЕ входит, показывается отдельной точкой
  // «лучшая модель уже здесь». Полоса-окно = размах четырёх массовых моделей.
  var AI_SKILL = {
    ak: [9, 7, 8, 7, 8],
    pr: [7, 6, 7, 5, 5],
    mk: [6, 6, 6, 6, 6],
    ga: [9, 4, 4, 3, 3],
    pp: [10, 10, 9, 9, 9]
  };
  var FRONTIER = 0;            // индекс передовой модели (Opus)
  var MASS = [1, 2, 3, 4];     // массовые бизнес-модели: окно = их размах [min,max]
  var AI_META = {
    massN: 4, measuredAt: 'июль 2026', caseVersion: 'v1',
    massModels: 'Haiku, ChatGPT, Алиса (YandexGPT), GigaChat',
    frontier: 'Claude Opus 4.8', frontierShort: 'Opus'
  };

  var RESUME_ORDER = ['ak', 'pr', 'mk', 'ga', 'pp'];       // методология
  var DEEPDIVE_ORDER = ['mk', 'pp', 'ak', 'pr', 'ga'];     // как в 17_report_example
  var LEVEL_NAMES = ['', 'Базовый', 'Устойчивый', 'Развитый', 'Зрелый', 'Системный'];

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function rich(s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'); }
  function richP(s, cls) {
    if (!s) return '';
    var c = cls ? ' class="' + cls + '"' : '';
    return rich(s).split(/\n\n+/).map(function (p) { return '<p' + c + '>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function abilityKeys(sk) {
    return { ak: ['ak1', 'ak2'], pr: ['pr1', 'pr2'], mk: ['mk1', 'mk2'], ga: ['ga1', 'ga2'], pp: ['pp1', 'pp2'] }[sk];
  }
  function round1(x) { return Math.round(x * 10) / 10; }
  function num1(x) { var v = round1(x); return (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ','); }
  function levelName(v) { return LEVEL_NAMES[Math.max(1, Math.min(5, Math.round(v)))]; }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function clampPct(p) { return Math.max(0, Math.min(100, p)); }
  function pctSkill(v) { return clampPct(v / 10 * 100); }   // балл навыка 0..10 → 0..100%
  function pctTotal(v) { return clampPct(v / 50 * 100); }   // общий балл 0..50 → 0..100%
  function windowPos(you, w) { return you < w.lo ? 'below' : (you > w.hi ? 'above' : 'in'); }
  function posClass(p) { return p === 'above' ? 'up' : (p === 'below' ? 'dn' : 'eq'); }
  function posLabel(p) { return p === 'above' ? 'Выше окна ИИ' : (p === 'below' ? 'Ниже окна ИИ' : 'В окне ИИ'); }
  function skillWord(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'навык';
    if ([2, 3, 4].indexOf(m10) !== -1 && [12, 13, 14].indexOf(m100) === -1) return 'навыка';
    return 'навыков';
  }
  function formatLongDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Балл каждой модели по всему профилю (из 50) = сумма пяти навыков.
  function modelTotals() {
    var n = AI_SKILL.ak.length, sums = [];
    for (var i = 0; i < n; i++) { var s = 0; RESUME_ORDER.forEach(function (k) { s += AI_SKILL[k][i]; }); sums.push(s); }
    return sums;
  }
  // Окно ИИ навыка (из 10): полоса = размах МАССОВЫХ моделей [min,max]; top = балл
  // передовой модели (Opus), выносится отдельной точкой над/в полосе.
  function skillWindow(sk) {
    var a = AI_SKILL[sk], lo = Infinity, hi = -Infinity;
    MASS.forEach(function (i) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; });
    return { lo: round1(lo), hi: round1(hi), top: round1(a[FRONTIER]) };
  }
  // Окно ИИ по всему профилю (из 50): полоса = размах массовых, top = Opus.
  function overallWindow() {
    var sums = modelTotals(), lo = Infinity, hi = -Infinity;
    MASS.forEach(function (i) { if (sums[i] < lo) lo = sums[i]; if (sums[i] > hi) hi = sums[i]; });
    return { lo: round1(lo), hi: round1(hi), top: round1(sums[FRONTIER]) };
  }

  // Уровни способностей участника (целые 1–5) из facilitatorList; балл навыка = сумма двух.
  function skillData(p) {
    return {
      ak: { a1: p.station1.level, a2: p.station1.ak2Level },
      pr: { a1: p.station2.pr1Level, a2: p.station2.pr2Level },
      mk: { a1: p.roomFuture.level1, a2: p.roomFuture.level2 },
      ga: { a1: p.roomAlternatives.level1, a2: p.roomAlternatives.level2 },
      pp: { a1: p.roomPath.level1, a2: p.roomPath.level2 }
    };
  }

  var LOGO = 'futureproof<span class="logo-arrow"><svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg"><path d="M0 1 L13 7 L0 13 Z" fill="#FF4800"/></svg></span><span class="logo-prod">i(m)perfect</span>';

  var SKILL_DESC = {
    ak: 'Как широко вы сканируете внешнюю среду и как глубоко связываете обнаруженные факторы в единую картину.',
    pr: 'Как вы сужаете пространство действий до управляемого набора приоритетов — с осознанными отказами и обоснованием выбора.',
    mk: 'Как далеко в будущее и в скольких вариантах вы мыслите — от продления текущих трендов до принципиально иных сценариев.',
    ga: 'Насколько систематически вы порождаете разные по механизму варианты решения и из скольких разных областей берёте идеи.',
    pp: 'Как вы раскладываете цель на этапы и как удерживаете маршрут, когда план сталкивается с ограничениями.'
  };

  // Короткая сноска-формулировка «в чём разрыв с ИИ». Показывается только там, где
  // человек выше окна (you = ваша сильная сторона против машины) или ниже (ai = где
  // машина пока сильнее). Фикс-тексты, привязанные к сути навыка.
  var SKILL_EDGE = {
    ak: {
      you: 'Вы замечаете факторы, которых нет в кейсе в явном виде, и связываете их в живую картину — модель чаще опирается на то, что прямо написано.',
      ai: 'ИИ шире и ровнее прочёсывает контекст: реже пропускает целые секторы среды и удерживает больше факторов одновременно.'
    },
    pr: {
      you: 'Вы делаете более острый выбор и честнее отказываетесь от лишнего — модель склонна беречь всё сразу и раздувать список приоритетов.',
      ai: 'ИИ дисциплинированнее обосновывает выбор и удерживает его под давлением — реже плывёт, когда меняются вводные.'
    },
    mk: {
      you: 'Вы дальше заглядываете и допускаете, что сами правила игры сменятся — модель чаще просто продлевает сегодняшние тренды.',
      ai: 'ИИ ровно держит несколько горизонтов и сценариев сразу — реже застревает в одном варианте будущего.'
    },
    ga: {
      you: 'Вы приносите ходы из неожиданных областей и ставите под сомнение саму постановку задачи — модель чаще перебирает очевидное.',
      ai: 'ИИ методично порождает больше вариантов на разных механизмах — реже останавливается на первой же рабочей идее.'
    },
    pp: {
      you: 'Вы точнее чувствуете реальные барьеры и ресурсы на пути — модель строит гладкий план, недооценивая трение реальности.',
      ai: 'ИИ детальнее раскладывает маршрут и обосновывает последовательность шагов — реже оставляет разрывы в логике.'
    }
  };

  // ---- строка навыка в резюме (окно ИИ + точка «вы» на шкале 1–5) ----
  function resumeRow(r) {
    var tag = '';
    if (r.pos === 'above') tag = ' <span class="tag s">Сильная сторона</span>';
    else if (r.pos === 'below') tag = ' <span class="tag g">Зона роста</span>';
    var bandStyle = 'left:' + pctSkill(r.w.lo) + '%; right:' + (100 - pctSkill(r.w.hi)) + '%';
    return '<div class="srow">' +
      '<div class="srow-top">' +
        '<div class="sk">' + esc(r.name) + ' <span class="code">· ' + esc(r.code) + '</span>' + tag + '</div>' +
        '<div class="pos ' + posClass(r.pos) + '">' + posLabel(r.pos) + '</div>' +
      '</div>' +
      '<p class="skdesc">' + esc(r.desc) + '</p>' +
      '<div class="sbar"><span class="base"></span>' +
        '<span class="band" style="' + bandStyle + '"></span>' +
        '<span class="ai-top" style="left:' + pctSkill(r.w.top) + '%" title="передовая модель (' + esc(AI_META.frontierShort) + '): ' + num1(r.w.top) + ' / 10"></span>' +
        '<span class="you" style="left:' + pctSkill(r.you) + '%"></span>' +
      '</div>' +
      '<div class="srow-scale"><span class="ai-range">Окно ИИ: ' + num1(r.w.lo) + '–' + num1(r.w.hi) + ' / 10 · передовая ' + num1(r.w.top) + '</span>' +
        '<span class="you-val">вы: ' + r.you + ' / 10' +
        ' <span class="you-break">(' + esc(r.code1) + ' L' + r.a1 + ' + ' + esc(r.code2) + ' L' + r.a2 + ')</span></span></div>' +
      (r.pos === 'above' ? '<p class="edge up"><span class="ek">Здесь вы обходите ИИ.</span> ' + esc(SKILL_EDGE[r.key].you) + '</p>' :
       r.pos === 'below' ? '<p class="edge dn"><span class="ek">Здесь ИИ пока сильнее.</span> ' + esc(SKILL_EDGE[r.key].ai) + '</p>' : '') +
    '</div>';
  }

  // ---- детализация навыка (структура 17_report_example) ----
  function scaleRows(ab, lvl) {
    var h = '';
    for (var n = 1; n <= 5; n++) {
      var cur = n === lvl, lv = (ab.levels && ab.levels[n]) || {};
      var desc = cur ? (lv.full || lv.short || '') : (lv.short || '');
      h += '<div class="scale-row' + (cur ? ' current' : '') + '">' +
        '<div class="scale-num">' + n + '</div>' +
        '<div class="scale-label">' + esc(LEVEL_NAMES[n]) + '</div>' +
        '<div class="scale-desc">' + esc(desc) + '</div></div>';
    }
    return h;
  }
  function abilityBlock(ab, lvl) {
    if (!ab) return '';
    var sw = (ab.strengthWeakness && ab.strengthWeakness[lvl]) || {};
    var dev = (ab.development && ab.development[lvl]) || '';
    return '<div class="ability-block">' +
      '<div class="ability-header"><div class="ability-full-name">' + esc(ab.name) + '</div>' +
        '<div class="ability-code">' + esc(ab.code) + ' · Уровень ' + lvl + ' · ' + esc(LEVEL_NAMES[lvl]) + '</div></div>' +
      '<div class="scale">' + scaleRows(ab, lvl) + '</div>' +
      ((sw.strength || sw.weakness) ? '<div class="sw-grid">' +
        (sw.strength ? '<div class="sw-block"><div class="sw-label">Сильная сторона</div><p>' + esc(sw.strength) + '</p></div>' : '') +
        (sw.weakness ? '<div class="sw-block"><div class="sw-label">На что обратить внимание</div><p>' + esc(sw.weakness) + '</p></div>' : '') +
      '</div>' : '') +
      (dev ? '<div class="devbox"><div class="dev-k">Следующий шаг</div><p>' + esc(dev) + '</p></div>' : '') +
    '</div>';
  }
  function deepDive(sk, idx, total, sd, T, role) {
    var skill = T.skills[sk]; if (!skill) return '';
    var ks = abilityKeys(sk), d = sd[sk], score = d.a1 + d.a2;
    return '<section class="page">' +
      '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Детализация · навык ' + pad2(idx) + ' / ' + pad2(total) + '</span></div>' +
      '<div class="skill-intro">' +
        '<div class="skill-intro-left"><div class="skill-num">Навык ' + pad2(idx) + ' / ' + pad2(total) + '</div>' +
          '<h2 class="skill-title">' + esc(skill.name) + ' <span>(' + esc(skill.code) + ')</span></h2></div>' +
        '<div class="skill-level-block"><div class="skill-level-num">' + score + '<small> / 10</small></div>' +
          '<div class="skill-level-name">' + esc(skill.abilities[ks[0]].code) + ' L' + d.a1 + ' + ' + esc(skill.abilities[ks[1]].code) + ' L' + d.a2 + '</div>' +
          (role ? '<div class="skill-role">' + esc(role) + '</div>' : '') + '</div>' +
      '</div>' +
      '<div class="skill-text">' + richP(skill.about) + '</div>' +
      abilityBlock(skill.abilities[ks[0]], d.a1) +
      abilityBlock(skill.abilities[ks[1]], d.a2) +
    '</section>';
  }

  function build(p, registration) {
    var T = window.IMP_REPORT_TEXTS;
    if (!T) throw new Error('Не загружены тексты отчёта (js/report-texts.js)');
    var sd = skillData(p);

    var rows = RESUME_ORDER.map(function (key) {
      var skill = T.skills[key], ks = abilityKeys(key), d = sd[key];
      var you = d.a1 + d.a2, w = skillWindow(key);
      return {
        key: key, code: skill.code, name: skill.name, desc: SKILL_DESC[key],
        a1: d.a1, a2: d.a2, code1: skill.abilities[ks[0]].code, code2: skill.abilities[ks[1]].code,
        you: you, w: w, pos: windowPos(you, w)
      };
    });

    // общий балл: сумма всех 10 способностей (из 50)
    var hSum = 0; RESUME_ORDER.forEach(function (k) { hSum += sd[k].a1 + sd[k].a2; });
    var oW = overallWindow(), oPos = windowPos(hSum, oW);
    var above = rows.filter(function (r) { return r.pos === 'above'; }).length;
    var inWin = rows.filter(function (r) { return r.pos === 'in'; }).length;
    var below = rows.filter(function (r) { return r.pos === 'below'; }).length;

    var rank = { above: 0, below: 1, in: 2 };
    var ordered = rows.slice().sort(function (a, b) {
      return rank[a.pos] !== rank[b.pos] ? rank[a.pos] - rank[b.pos] : RESUME_ORDER.indexOf(a.key) - RESUME_ORDER.indexOf(b.key);
    });

    // роли детализации: самый развитый / наибольший потенциал
    var byLevel = rows.slice().sort(function (a, b) { return b.you - a.you; });
    var topSkill = byLevel[0].key, lowSkill = byLevel[byLevel.length - 1].key;

    var name = (((registration && registration.firstName) || p.firstName || '') + ' ' + ((registration && registration.lastName) || p.lastName || '')).trim();
    var dateIso = (p.station3 && p.station3.finishedAt) || (registration && registration.registeredAt) || '';

    var miniScale = (T.miniScale || []).map(function (m) {
      return '<div class="ms"><span class="ms-n">' + m.level + ' · ' + esc(LEVEL_NAMES[m.level] || '') + '</span><span class="ms-t">' + esc(m.anchor) + '</span></div>';
    }).join('');
    var chips = [
      'кейс «Искра» · ' + AI_META.caseVersion,
      AI_META.massN + ' массовые модели + передовая · вслепую',
      'замер: ' + AI_META.measuredAt
    ].map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('');

    var about = T.about || {}, meth = T.methodology || {};
    var methList = DEEPDIVE_ORDER.map(function (sk) {
      var s = T.skills[sk], ks = abilityKeys(sk);
      return '<div class="ml"><div class="ml-skill">' + esc(s.name) + ' <span class="code">' + esc(s.code) + '</span></div>' +
        '<div class="ml-ab">' + esc(s.abilities[ks[0]].name) + ' <span class="code">' + esc(s.abilities[ks[0]].code) + '</span></div>' +
        '<div class="ml-ab">' + esc(s.abilities[ks[1]].name) + ' <span class="code">' + esc(s.abilities[ks[1]].code) + '</span></div></div>';
    }).join('');

    var deep = DEEPDIVE_ORDER.map(function (sk, i) {
      var role = sk === topSkill ? 'Ваш самый развитый навык' : (sk === lowSkill ? 'Наибольший потенциал роста' : '');
      return deepDive(sk, i + 1, DEEPDIVE_ORDER.length, sd, T, role);
    }).join('');

    // «с чего начать» — способность с наименьшим уровнем в навыке роста
    var gKeys = abilityKeys(lowSkill);
    var startKey = sd[lowSkill].a1 <= sd[lowSkill].a2 ? gKeys[0] : gKeys[1];
    var startLvl = sd[lowSkill].a1 <= sd[lowSkill].a2 ? sd[lowSkill].a1 : sd[lowSkill].a2;
    var startAb = T.skills[lowSkill].abilities[startKey];
    var startDev = startAb && startAb.development && startAb.development[startLvl];

    return '<!doctype html>\n<html lang="ru">\n<head>\n' +
'<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>i(m)perfect · Отчёт · ' + esc(name || '—') + '</title>\n' +
'<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&display=swap">\n' +
'<style>' + REPORT_CSS + '</style>\n</head>\n<body>\n<div class="frame"><div class="sheet">\n' +

// ОБЛОЖКА
'<section class="page cover">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Ассессмент «Искра» · Раунд 1</span></div>' +
  '<p class="eyebrow">Диагностический отчёт · превью · сравнение с ИИ</p>' +
  '<h1 class="cover-h1">Стратегическое<br>мышление</h1>' +
  '<p class="lede">Ваш профиль по пяти навыкам стратегического мышления — и его положение относительно окна ИИ: диапазона уровней, который на этом же кейсе показывают эталонные нейросети.</p>' +
  '<div class="cmeta">' +
    '<div class="m"><p class="k">Участник</p><div class="val">' + esc(name || '—') + '</div></div>' +
    '<div class="m"><p class="k">Дата прохождения</p><div class="val">' + esc(formatLongDate(dateIso)) + '</div></div>' +
    '<div class="m"><p class="k">Модуль</p><div class="val">Кейс «Искра» · ' + esc(AI_META.caseVersion) + '</div></div>' +
    '<div class="m"><p class="k">Ваш балл · окно ИИ</p><div class="val">' + hSum + ' <span class="val-s">· ИИ ' + num1(oW.lo) + '–' + num1(oW.hi) + ' из 50</span></div></div>' +
  '</div>' +
  '<div class="notice"><p><b>Тестовый прогон · этап разработки.</b> Это предварительное превью отчёта. Оценка ещё не прошла фасилитацию — если после разбора результаты уточнятся, мы сообщим вам отдельно. Пока это демонстрация того, что вы получите в полной версии.</p></div>' +
'</section>' +

// РЕЗЮМЕ
'<section class="page">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Резюме</span></div>' +
  '<h2 class="sec-h">Ваш профиль относительно ИИ</h2>' +
  '<p class="lede">Окно ИИ — диапазон уровней от слабейшей до сильнейшей из четырёх массовых моделей автоматизации на этом кейсе. Передовая модель (' + esc(AI_META.frontierShort) + ') показана отдельной голубой точкой — «лучшая модель уже здесь». По каждому навыку видно, попадаете ли вы ниже окна, внутрь него наравне с ИИ или выше.</p>' +
  '<div class="overall">' +
    '<div class="ov-head">' +
      '<div class="ov-cell"><div class="ovk"><span class="d"></span>Ваш общий балл</div><div class="ovn">' + hSum + '<span class="ovs"> / 50</span></div></div>' +
      '<div class="ov-cell"><div class="ovk"><span class="band-sw"></span>Окно ИИ</div><div class="ovn">' + num1(oW.lo) + '–' + num1(oW.hi) + '<span class="ovs"> / 50</span></div></div>' +
      '<div class="ov-cell"><div class="ovk"><span class="top-sw"></span>Передовая · ' + esc(AI_META.frontierShort) + '</div><div class="ovn">' + num1(oW.top) + '<span class="ovs"> / 50</span></div></div>' +
      '<div class="ov-pos ' + posClass(oPos) + '">' + posLabel(oPos) + '</div>' +
    '</div>' +
    '<div class="ov-track"><span class="base"></span><span class="band" style="left:' + pctTotal(oW.lo) + '%; right:' + (100 - pctTotal(oW.hi)) + '%"></span><span class="ai-top" style="left:' + pctTotal(oW.top) + '%" title="передовая модель (' + esc(AI_META.frontierShort) + ')"></span><span class="you" style="left:' + pctTotal(hSum) + '%"></span></div>' +
    '<div class="ov-ticks"><span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span></div>' +
  '</div>' +
  '<div class="hsum-row"><span class="hs-item up"><b>' + above + '</b> ' + skillWord(above) + ' выше ИИ</span>' +
    '<span class="hs-item eq"><b>' + inWin + '</b> ' + skillWord(inWin) + ' в окне</span>' +
    '<span class="hs-item dn"><b>' + below + '</b> ' + skillWord(below) + ' ниже ИИ</span></div>' +
  '<div class="srows">' + ordered.map(resumeRow).join('') + '</div>' +
  '<div class="axis"><div class="ticks"><span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span></div></div>' +
  '<p class="caption"><b style="color:#ff4800;">●</b> — ваш балл навыка (сумма двух способностей, шкала 0–10); закрашенная полоса — окно ИИ, размах четырёх массовых моделей; <b style="color:#2f6bb0;">●</b> — передовая модель (' + esc(AI_META.frontierShort) + '). Каждая способность — на одном из пяти уровней; балл навыка — их сумма, поэтому 0–10, общий — сумма десяти, поэтому /50. Полный разбор — дальше в отчёте.</p>' +
  (miniScale ? '<div class="miniscale"><p class="k">Пять уровней каждой способности</p><p class="ms-lead">На этих пяти уровнях оценивается каждая из десяти способностей. Балл навыка — сумма двух его способностей (2–10), общий балл — сумма всех десяти (10–50).</p><div class="ms-grid">' + miniScale + '</div></div>' : '') +
'</section>' +

// ЧТО ТАКОЕ ОКНО ИИ
'<section class="page">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Как читать сравнение</span></div>' +
  '<h2 class="sec-h">Что такое окно ИИ</h2>' +
  '<p class="lede">Тот же кейс, те же вопросы, тот же оценщик — но проходят эталонные нейросети. Четыре массовые модели автоматизации задают полосу-окно (от слабейшей к сильнейшей) — внутри неё сегодня живёт машинное стратегическое мышление. Отдельная голубая точка — передовая модель (' + esc(AI_META.frontierShort) + '): куда шагнул фронтир.</p>' +
  '<p class="lede sub">Это не соревнование и не вердикт. Окно отвечает на один практический вопрос: <b>где ваше мышление в одной зоне с машиной, где вы её превосходите, а где пока не дотягиваете.</b> Смысл не в том, чтобы обогнать лучшую модель, а в том, чтобы понять свою позицию рядом с инструментом.</p>' +
  '<div class="cols3">' +
    '<div class="c3 up"><div class="c3-h">Выше окна</div><p>Ваш уровень выше сильнейшей из массовых моделей. На этом навыке вы делаете то, чего они не показали. Это опора профиля и аргумент вашей роли рядом с ИИ.</p></div>' +
    '<div class="c3 eq"><div class="c3-h">В окне</div><p>Ваш уровень внутри диапазона моделей — вы в одной зоне с ИИ. Нормальная, рабочая позиция: где именно внутри окна, видно на шкале навыка.</p></div>' +
    '<div class="c3 dn"><div class="c3-h">Ниже окна</div><p>Ваш уровень ниже даже слабейшей из массовых моделей. Не приговор, а карта: именно здесь шаг развития даёт наибольший прирост относительной ценности.</p></div>' +
  '</div>' +
  '<div class="measure"><p class="k">Как измерено окно ИИ<span class="ast">*</span></p>' +
    '<p>Эталонные модели проходят кейс тем же маршрутом, что и вы, без подсказок и без ограничения интерфейсом. Ответы оценивает тот же оценщик, что и ваши, по тем же уровням. Границы окна — слабейший и сильнейший результат среди четырёх массовых моделей; передовая модель (' + esc(AI_META.frontierShort) + ') вынесена отдельной точкой. Окно перемеряется при каждом обновлении кейса или оценщика.</p>' +
    '<div class="chips">' + chips + '</div>' +
    '<p class="foot-note"><span class="ast">*</span> Массовые модели (полоса-окно): ' + esc(AI_META.massModels) + '. Передовая модель (точка): ' + esc(AI_META.frontier) + '. Набор моделей уточняется по мере прогона новых.</p>' +
  '</div>' +
'</section>' +

deep +

// С ЧЕГО НАЧАТЬ
'<section class="page">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">С чего начать</span></div>' +
  '<h2 class="sec-h">Один шаг, который сдвинет профиль</h2>' +
  '<p class="lede">Стратегическое мышление тренируется. Наибольший прирост относительной ценности сейчас — в навыке «' + esc(T.skills[lowSkill].name) + '».</p>' +
  (startDev ? '<div class="devbox big"><div class="dev-k">Ваш следующий шаг</div><p>' + esc(startDev) + '</p></div>' : '') +
'</section>' +

// ОБ ОЦЕНКЕ
'<section class="page">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Об оценке</span></div>' +
  '<h2 class="sec-h">Об этой оценке</h2>' +
  (about.shows ? '<div class="abt"><p class="k">Что показывает отчёт</p>' + richP(about.shows, 'lede') + '</div>' : '') +
  (about.howMeasured ? '<div class="abt"><p class="k">Как проходила оценка</p>' + richP(about.howMeasured, 'lede') + '</div>' : '') +
  (about.placeInAssessment ? '<div class="abt"><p class="k">Место модуля в оценке</p>' + richP(about.placeInAssessment, 'lede') + '</div>' : '') +
'</section>' +

// МЕТОДОЛОГИЯ
'<section class="page">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Методология</span></div>' +
  '<h2 class="sec-h">Как устроена оценка</h2>' +
  (meth.intro ? richP(meth.intro, 'lede') : '') +
  '<div class="methlist">' + methList + '</div>' +
  (meth.levelsMeaning ? '<div class="abt"><p class="k">Что означают уровни</p>' + richP(meth.levelsMeaning, 'lede') + '</div>' : '') +
  (meth.scaleNote ? '<div class="abt"><p class="k">Примечание о шкале</p>' + richP(meth.scaleNote, 'lede') + '</div>' : '') +
'</section>' +

// ФУТЕР
'<footer class="foot"><div class="foot-in"><span class="fp">futureproof <span class="ar"><svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg"><path d="M0 1 L13 7 L0 13 Z" fill="#FF4800"/></svg></span></span>' +
  '<span class="foot-meta">i(m)perfect · ассессмент «Искра» · тестовый прогон</span></div></footer>' +

'\n</div></div>\n</body>\n</html>';
  }

  function download(p, registration) {
    var html = build(p, registration);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'imperfect-otchet-' + String(p.bib).padStart(3, '0') + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  var REPORT_CSS = [
    ":root{--lime:#ff4800;--lime-tint:#fff2ec;--lime-line:#ffd7c7;--accent:#ff4800;--ink:#181818;--paper:#fff;--muted:#6b6e73;--muted-soft:#9a9da2;--hair:#e7e7e7;--bandbg:#eaf3fb;--bandln:#bcd9f2;--jb:#89bbf1;--jb-ink:#2f6bb0;--radius:6px;--ff-d:'Inter Tight',sans-serif;--ff-b:'Inter Tight',sans-serif;}",
    "*{box-sizing:border-box;}",
    "body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--ff-b);line-height:1.55;-webkit-font-smoothing:antialiased;}",
    ".frame{padding:clamp(10px,2vw,22px);}",
    ".sheet{max-width:1180px;margin:0 auto;background:var(--paper);border-radius:var(--radius);overflow:hidden;}",
    ".page{padding:56px 72px;border-bottom:1px solid var(--hair);}",
    ".phead{display:flex;justify-content:space-between;align-items:center;margin-bottom:40px;}",
    ".brand{font-family:var(--ff-b);font-weight:700;font-size:18px;letter-spacing:-0.01em;display:inline-flex;align-items:center;gap:4px;color:var(--ink);}",
    ".brand .logo-arrow{display:inline-block;width:12px;height:12px;position:relative;top:1px;}.brand .logo-arrow svg{display:block;width:100%;height:100%;}",
    ".brand .logo-prod{margin-left:3px;font-weight:600;color:var(--muted-soft);}",
    ".phead .meta{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-soft);}",
    ".eyebrow{font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted-soft);margin:0 0 16px;}",
    ".cover-h1{font-family:var(--ff-d);font-weight:900;font-size:clamp(44px,6vw,76px);line-height:1.0;letter-spacing:-0.02em;text-transform:uppercase;margin:0 0 22px;text-wrap:balance;}",
    ".sec-h{font-family:var(--ff-d);font-weight:800;font-size:clamp(30px,3.4vw,42px);line-height:1.06;letter-spacing:-0.01em;text-transform:uppercase;margin:0 0 18px;text-wrap:balance;}",
    ".lede{font-size:17px;line-height:1.5;max-width:64ch;margin:0;color:var(--ink);text-wrap:pretty;}",
    ".lede.sub{margin-top:14px;color:var(--muted);font-size:16px;}",
    ".lede + .lede{margin-top:14px;}",
    ".lede b{font-weight:600;}",
    ".cmeta{display:flex;gap:48px;flex-wrap:wrap;margin-top:44px;}",
    ".cmeta .k,.abt .k,.miniscale .k,.measure .k{font-size:11px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:var(--muted-soft);margin:0 0 7px;}",
    ".cmeta .val{font-size:20px;font-weight:600;}",
    ".cmeta .val-s{color:var(--muted-soft);font-weight:400;font-size:14px;}",
    ".notice{margin-top:40px;background:var(--lime-tint);border:1px solid var(--lime-line);border-radius:var(--radius);padding:20px 22px;max-width:820px;}",
    ".notice b{font-weight:700;}.notice p{margin:0;font-size:14px;color:var(--ink);line-height:1.55;}",
    // overall graph
    ".overall{margin-top:30px;padding-bottom:24px;border-bottom:1px solid var(--hair);}",
    ".ov-head{display:flex;align-items:flex-end;gap:44px;flex-wrap:wrap;margin-bottom:18px;}",
    ".ov-cell .ovk{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted-soft);display:flex;align-items:center;gap:7px;margin-bottom:6px;}",
    ".ov-cell .ovk .d{width:10px;height:10px;border-radius:50%;background:var(--lime);border:1px solid var(--ink);}",
    ".ov-cell .ovk .band-sw{width:16px;height:10px;border-radius:3px;background:var(--bandbg);border:1px solid var(--bandln);}",
    ".ov-cell .ovn{font-family:var(--ff-d);font-weight:900;font-size:46px;line-height:.9;letter-spacing:-0.02em;}",
    ".ov-cell .ovn .ovs{font-family:var(--ff-b);font-size:16px;color:var(--muted-soft);font-weight:400;letter-spacing:0;}",
    ".ov-pos{margin-left:auto;align-self:center;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:6px 12px;border-radius:8px;border:1.5px solid var(--ink);}",
    ".ov-pos.up{background:var(--lime);}.ov-pos.eq{background:var(--paper);}.ov-pos.dn{background:var(--ink);color:var(--paper);}",
    ".ov-track{position:relative;height:24px;}",
    ".ov-track .base{position:absolute;left:0;right:0;top:50%;height:2px;background:var(--hair);transform:translateY(-50%);border-radius:2px;}",
    ".ov-track .band{position:absolute;top:50%;transform:translateY(-50%);height:20px;background:var(--bandbg);border:1px solid var(--bandln);border-radius:7px;}",
    ".ov-track .you{position:absolute;top:50%;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;background:var(--lime);border:2px solid var(--ink);z-index:3;}",
    ".ov-track .ai-top{position:absolute;top:50%;transform:translate(-50%,-50%);width:15px;height:15px;border-radius:50%;background:var(--jb);border:2px solid var(--jb-ink);z-index:2;}",
    ".ov-cell .ovk .top-sw{width:12px;height:12px;border-radius:50%;background:var(--jb);border:1.5px solid var(--jb-ink);}",
    ".ov-ticks{display:flex;justify-content:space-between;margin-top:7px;font-size:10px;color:var(--muted-soft);}",
    ".hsum-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;}",
    ".hs-item{font-size:13px;color:var(--muted);border:1px solid var(--hair);border-radius:8px;padding:8px 14px;}",
    ".hs-item b{font-family:var(--ff-d);font-weight:800;color:var(--ink);margin-right:2px;}",
    ".hs-item.up{border-color:var(--lime);}.hs-item.dn{border-color:var(--ink);}",
    // skill rows
    ".srows{margin-top:26px;}",
    ".srow{padding:20px 0;border-bottom:1px solid var(--hair);}",
    ".srow-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;}",
    ".sk{font-size:16px;font-weight:600;}.sk .code{color:var(--muted-soft);font-weight:600;font-size:12px;}",
    ".tag{display:inline-block;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;padding:2px 8px;border-radius:6px;margin-left:8px;vertical-align:2px;}",
    ".tag.s{background:var(--lime);color:var(--ink);}.tag.g{background:var(--ink);color:var(--paper);}",
    ".skdesc{font-size:13px;color:var(--muted);line-height:1.5;margin:7px 0 14px;max-width:74ch;}",
    ".sbar{position:relative;height:18px;}",
    ".sbar .base{position:absolute;left:0;right:0;top:50%;height:2px;background:var(--hair);transform:translateY(-50%);border-radius:2px;}",
    ".sbar .band{position:absolute;top:50%;transform:translateY(-50%);height:16px;background:var(--bandbg);border:1px solid var(--bandln);border-radius:8px;z-index:1;}",
    ".sbar .you{position:absolute;top:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:var(--lime);border:1.5px solid var(--ink);z-index:3;}",
    ".sbar .ai-top{position:absolute;top:50%;transform:translate(-50%,-50%);width:12px;height:12px;border-radius:50%;background:var(--jb);border:1.5px solid var(--jb-ink);z-index:2;}",
    ".pos{flex:none;text-align:right;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;line-height:1.2;white-space:nowrap;}",
    ".pos.up{color:var(--ink);}.pos.dn{color:var(--muted);}.pos.eq{color:var(--muted-soft);}",
    ".srow-scale{display:flex;justify-content:space-between;gap:16px;margin-top:8px;font-size:11.5px;color:var(--muted-soft);}",
    ".srow-scale .you-val{color:var(--ink);font-weight:600;text-align:right;}",
    ".srow-scale .you-break{color:var(--muted-soft);font-weight:400;}",
    ".edge{margin:12px 0 0;font-size:12.5px;line-height:1.5;padding:11px 14px;border-radius:12px;}",
    ".edge .ek{font-weight:700;}",
    ".edge.up{background:var(--lime-tint);border:1px solid var(--lime-line);color:var(--muted);}",
    ".edge.up .ek{color:var(--ink);}",
    ".edge.dn{background:var(--ink);border:1px solid var(--ink);color:#e6e6e3;}",
    ".edge.dn .ek{color:var(--lime);}",
    ".axis{margin-top:8px;}.axis .ticks{display:flex;justify-content:space-between;font-size:9.5px;color:var(--muted-soft);}",
    ".caption{font-size:12px;color:var(--muted-soft);margin-top:18px;line-height:1.5;}.caption b{color:var(--muted);font-weight:600;}",
    ".miniscale{margin-top:34px;}",
    ".miniscale .ms-lead{font-size:12.5px;color:var(--muted);margin:0 0 16px;max-width:72ch;line-height:1.5;}",
    ".ms-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;}",
    ".ms{border-top:2px solid var(--ink);padding-top:8px;}",
    ".ms-n{display:block;font-family:var(--ff-d);font-weight:700;font-size:12px;margin-bottom:5px;}",
    ".ms-t{font-size:11.5px;color:var(--muted);line-height:1.35;}",
    // explainer
    ".cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:32px;}",
    ".c3{border-top:3px solid var(--hair);padding-top:14px;}",
    ".c3.up{border-top-color:var(--lime);}.c3.eq{border-top-color:var(--muted-soft);}.c3.dn{border-top-color:var(--ink);}",
    ".c3-h{font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;margin:0 0 10px;}",
    ".c3 p{margin:0;font-size:13.5px;color:var(--muted);line-height:1.55;}",
    ".measure{margin-top:32px;background:var(--paper);border:1px solid var(--hair);border-radius:var(--radius);padding:20px 22px;}",
    ".measure p{margin:0 0 14px;font-size:13.5px;color:var(--muted);line-height:1.55;max-width:78ch;}",
    ".chips{display:flex;flex-wrap:wrap;gap:8px;}",
    ".chip{font-size:11.5px;color:var(--muted);background:var(--paper);border:1px solid var(--hair);border-radius:8px;padding:5px 11px;}",
    ".ast{color:var(--muted-soft);}",
    ".measure .foot-note{margin:16px 0 0;font-size:11.5px;color:var(--muted-soft);line-height:1.5;}",
    // deep dive (структура спеки)
    ".skill-intro{display:flex;justify-content:space-between;align-items:flex-start;gap:32px;}",
    ".skill-num{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-soft);margin-bottom:16px;}",
    ".skill-title{font-family:var(--ff-d);font-weight:800;font-size:clamp(32px,4.2vw,54px);line-height:1.0;letter-spacing:-0.02em;text-transform:uppercase;margin:0;}",
    ".skill-title span{color:var(--muted-soft);font-size:.38em;font-weight:600;}",
    ".skill-level-block{flex:none;text-align:right;}",
    ".skill-level-num{font-family:var(--ff-d);font-weight:900;font-size:60px;line-height:.8;letter-spacing:-0.03em;}",
    ".skill-level-num small{font-family:var(--ff-b);font-size:24px;color:var(--muted-soft);font-weight:400;}",
    ".skill-level-name{font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-top:4px;}",
    ".skill-role{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--muted-soft);margin-top:8px;}",
    ".skill-text{margin-top:32px;max-width:70ch;}",
    ".skill-text p{margin:0 0 14px;font-size:15.5px;line-height:1.55;color:var(--muted);}",
    ".skill-text p:first-child{color:var(--ink);font-size:17px;}",
    ".skill-text b{color:var(--ink);font-weight:600;}",
    ".ability-block{margin-top:42px;}",
    ".ability-header{border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:14px;}",
    ".ability-full-name{font-size:19px;font-weight:700;}",
    ".ability-code{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted-soft);margin-top:4px;}",
    ".scale{display:flex;flex-direction:column;}",
    ".scale-row{display:grid;grid-template-columns:34px 120px 1fr;gap:16px;align-items:start;padding:11px 0;border-bottom:1px solid var(--hair);}",
    ".scale-num{font-family:var(--ff-d);font-weight:700;font-size:15px;color:var(--muted-soft);}",
    ".scale-label{font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;}",
    ".scale-desc{font-size:13.5px;color:var(--muted-soft);line-height:1.5;}",
    ".scale-row.current{background:var(--lime-tint);border:1px solid var(--lime-line);border-radius:6px;padding:16px;margin:6px -16px;box-shadow:inset 3px 0 0 var(--accent);border-bottom:1px solid var(--lime-line);}",
    ".scale-row.current .scale-num,.scale-row.current .scale-label{color:var(--ink);}",
    ".scale-row.current .scale-desc{color:var(--ink);font-size:15px;}",
    ".sw-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:24px;}",
    ".sw-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin-bottom:6px;}",
    ".sw-block p{margin:0;font-size:13.5px;color:var(--muted);line-height:1.5;}",
    ".devbox{margin-top:22px;background:var(--ink);color:var(--paper);border-radius:var(--radius);padding:18px 22px;}",
    ".devbox .dev-k{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--lime);margin-bottom:8px;}",
    ".devbox p{margin:0;font-size:14px;line-height:1.55;}",
    ".devbox.big{margin-top:26px;padding:26px 28px;}.devbox.big p{font-size:16px;}",
    ".abt{margin-top:24px;}.abt .lede{margin-top:2px;}.abt .lede + .lede{margin-top:14px;}",
    ".methlist{margin-top:24px;display:flex;flex-direction:column;gap:2px;}",
    ".ml{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:16px;padding:12px 0;border-bottom:1px solid var(--hair);align-items:baseline;}",
    ".ml-skill{font-weight:600;font-size:15px;}.ml-ab{font-size:13px;color:var(--muted);}.ml .code{color:var(--muted-soft);font-size:11px;font-weight:600;}",
    // footer
    ".foot{background:var(--ink);}",
    ".foot-in{max-width:1180px;margin:0 auto;padding:26px 72px;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;}",
    ".fp{font-family:var(--ff-b);font-weight:700;font-size:18px;letter-spacing:-0.01em;color:var(--paper);display:inline-flex;align-items:center;gap:4px;}.fp .ar{display:inline-block;width:12px;height:12px;position:relative;top:1px;}.fp .ar svg{display:block;width:100%;height:100%;}",
    ".foot-meta{color:var(--muted-soft);font-size:11px;letter-spacing:.13em;text-transform:uppercase;}",
    "@media(max-width:720px){.page{padding:34px 24px;}.ov-head{gap:24px;}.cols3,.sw-grid,.ms-grid,.ml{grid-template-columns:1fr;}.skill-intro{flex-direction:column;}.skill-level-block{text-align:left;}.scale-row{grid-template-columns:1fr;gap:4px;}.foot-in{padding:22px 24px;}}",
    "@media print{body{background:#fff;}.frame{padding:0;}.sheet{max-width:none;border-radius:0;}.page{break-after:page;border-bottom:none;}.devbox,.foot,.tag.s,.tag.g,.scale-row.current,.notice,.ov-pos,.edge.up,.edge.dn{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}"
  ].join('');

  window.impReport = { build: build, download: download, SKILL: AI_SKILL };
})();

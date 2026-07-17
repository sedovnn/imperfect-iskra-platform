// i(m)perfect — генератор отчёта участника «сравнение с ИИ» (полная версия).
// Собирает standalone-HTML из уже посчитанных баллов участника + фиксированных
// текстов методологии (window.IMP_REPORT_TEXTS, файл js/report-texts.js).
// Стиль — продуктовый DESIGN.md: сигнальный лайм #a6ff00 на почти-чёрном/бумаге,
// Unbounded + Inter, жёсткие офсет-тени, один лаймовый сигнал. Подпись futureproof — в футере.
// Экспорт: window.impReport.build(participant, registration) → html; .download(...) → скачивание.
(function () {
  'use strict';

  // ИИ-паритет: медианные уровни навыков (из 10) эталонной модели на текущей
  // версии кейса. ЕДИНСТВЕННОЕ место с этими числами — обновлять после серии
  // референс-прогонов. Сумма пяти = общий ИИ-паритет /50.
  // Каждый навык — ДИАПАЗОН «от–до» (из 10): разброс эталонных моделей от худшего
  // до лучшего прогона. Человек попадает ниже коридора / в коридор / выше него.
  var AI_BAND = {
    ak: { lo: 8, hi: 10 },
    pr: { lo: 6, hi: 9 },
    mk: { lo: 7, hi: 9 },
    ga: { lo: 7, hi: 10 },
    pp: { lo: 5, hi: 8 }
  };
  var AI_PARITY_META = {
    n: 5, measuredAt: 'июль 2026', caseVersion: 'v1',
    // Эталонные модели, чьими прогонами задан коридор. Обновлять вместе с AI_BAND.
    models: 'Claude Opus 4.8, Claude Haiku 4.5, GigaChat, YandexGPT (Алиса), ChatGPT'
  };

  // Порядок резюме — методология (АК, ПР, МК, ГА, ПП).
  var RESUME_ORDER = ['ak', 'pr', 'mk', 'ga', 'pp'];
  // Порядок детализации — как во фрейме отчёта (МК → ПП → АК → ПР → ГА).
  var DEEPDIVE_ORDER = ['mk', 'pp', 'ak', 'pr', 'ga'];

  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Тексты §2/§6/§7 несут markdown-lite: **жирный** и абзацы через \n\n.
  // Рендерим в набор <p class="cls"> с <b> внутри; без класса — вернём inline-html.
  function rich(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }
  function richP(s, cls) {
    if (!s) return '';
    var c = cls ? ' class="' + cls + '"' : '';
    return rich(s).split(/\n\n+/).map(function (par) {
      return '<p' + c + '>' + par.replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  // Уровни способностей и балл навыка из объекта участника (facilitatorList).
  function skillData(p) {
    return {
      ak: { a1: p.station1.level, a2: p.station1.ak2Level, you: numOrSum(p.station1.akSkill, p.station1.level, p.station1.ak2Level) },
      pr: { a1: p.station2.pr1Level, a2: p.station2.pr2Level, you: numOrSum(p.station2.prSkill, p.station2.pr1Level, p.station2.pr2Level) },
      mk: { a1: p.roomFuture.level1, a2: p.roomFuture.level2, you: numOrSum(p.roomFuture.skill, p.roomFuture.level1, p.roomFuture.level2) },
      ga: { a1: p.roomAlternatives.level1, a2: p.roomAlternatives.level2, you: numOrSum(p.roomAlternatives.skill, p.roomAlternatives.level1, p.roomAlternatives.level2) },
      pp: { a1: p.roomPath.level1, a2: p.roomPath.level2, you: numOrSum(p.roomPath.skill, p.roomPath.level1, p.roomPath.level2) }
    };
  }
  function numOrSum(skill, a, b) {
    if (typeof skill === 'number') return skill;
    if (typeof a === 'number' && typeof b === 'number') return a + b;
    return null;
  }

  function abilityKeys(sk) {
    return { ak: ['ak1', 'ak2'], pr: ['pr1', 'pr2'], mk: ['mk1', 'mk2'], ga: ['ga1', 'ga2'], pp: ['pp1', 'pp2'] }[sk];
  }

  // Позиция человека относительно диапазона ИИ «от–до».
  function bandPos(you, b) { return you < b.lo ? 'below' : (you > b.hi ? 'above' : 'in'); }
  function posClass(pos) { return pos === 'above' ? 'up' : (pos === 'below' ? 'dn' : 'eq'); }
  function posLabel(pos) { return pos === 'above' ? 'Выше ИИ' : (pos === 'below' ? 'Ниже ИИ' : 'В диапазоне ИИ'); }

  function skillWord(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'навык';
    if ([2, 3, 4].indexOf(m10) !== -1 && [12, 13, 14].indexOf(m100) === -1) return 'навыка';
    return 'навыков';
  }
  function skillLevel5(you) {  // навык из 10 → уровень из 5 (среднее двух способностей)
    var v = you / 2;
    return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
  }
  function formatLongDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  var LOGO = 'i<span class="mark">m</span>perfect';

  // ---- страница резюме: строки навыков (одна полоса на навык) ----
  function resumeRowsHtml(ordered) {
    return ordered.map(function (r) {
      var tag = '';
      if (r.pos === 'above') tag = ' <span class="tag s">Сильная сторона</span>';
      else if (r.pos === 'below') tag = ' <span class="tag g">Зона роста</span>';
      // коридор ИИ = сегмент lo→hi; точка «вы» поверх; шкала 0–10.
      var bandStyle = 'left:' + (r.lo * 10) + '%; right:' + (100 - r.hi * 10) + '%';
      return '<div class="srow">' +
        '<div class="srow-top">' +
          '<div class="sk">' + esc(r.name) + ' <span class="code">· ' + esc(r.code) + '</span>' + tag + '</div>' +
          '<div class="pos ' + posClass(r.pos) + '">' + posLabel(r.pos) + '</div>' +
        '</div>' +
        '<p class="skdesc">' + esc(r.desc) + '</p>' +
        '<div class="sbar"><span class="base"></span>' +
          '<span class="band" style="' + bandStyle + '"></span>' +
          '<span class="mk you" style="left:' + (r.you * 10) + '%"></span>' +
        '</div>' +
        '<div class="srow-scale"><span class="ai-range">Коридор ИИ: ' + r.lo + '–' + r.hi + '</span><span class="you-val">вы: ' + r.you + ' <span class="you-break">· ' + esc(r.code1) + ' L' + r.a1 + ' + ' + esc(r.code2) + ' L' + r.a2 + '</span></span></div>' +
      '</div>';
    }).join('');
  }

  // ---- страница детализации навыка ----
  function abilityBlockHtml(ab, level) {
    if (!ab) return '';
    var head = '<div class="ab-head"><h3>' + esc(ab.name) + ' <span class="code">' + esc(ab.code) + '</span></h3>' +
      '<span class="ab-level">' + (level ? 'L' + level : '—') + '</span></div>';

    var scale = '<div class="scale">';
    for (var L = 1; L <= 5; L++) {
      var lv = (ab.levels && ab.levels[L]) || {};
      if (L === level) {
        scale += '<div class="lvl lvl-you">' +
          '<div class="lvl-n">L' + L + ' · ваш уровень</div>' +
          '<p class="lvl-text">' + esc(lv.full || lv.short || '') + '</p></div>';
      } else {
        scale += '<div class="lvl">' +
          '<div class="lvl-n">L' + L + '</div>' +
          '<p class="lvl-text">' + esc(lv.short || '') + '</p></div>';
      }
    }
    scale += '</div>';

    var sw = (ab.strengthWeakness && ab.strengthWeakness[level]) || null;
    var swHtml = '';
    if (sw && (sw.strength || sw.weakness)) {
      swHtml = '<div class="sw">' +
        (sw.strength ? '<div class="sw-col"><p class="sw-k">Сильная сторона этого уровня</p><p>' + esc(sw.strength) + '</p></div>' : '') +
        (sw.weakness ? '<div class="sw-col"><p class="sw-k">На что обратить внимание</p><p>' + esc(sw.weakness) + '</p></div>' : '') +
      '</div>';
    }

    var dev = (ab.development && ab.development[level]) || '';
    var devHtml = dev ? '<div class="devbox"><p class="dev-k">Следующий шаг</p><p>' + esc(dev) + '</p></div>' : '';

    return '<div class="ability">' + head + scale + swHtml + devHtml + '</div>';
  }

  function deepDiveHtml(sk, idx, total, sd, T, roleLabel) {
    var skill = T.skills[sk];
    if (!skill) return '';
    var d = sd[sk];
    var keys = abilityKeys(sk);
    return '<section class="page deep">' +
      '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Навык ' + pad2(idx) + ' / ' + pad2(total) + '</span></div>' +
      '<p class="eyebrow">Детализация навыка</p>' +
      '<div class="deep-title-row">' +
        '<h1 class="deep-h1">' + esc(skill.name) + '</h1>' +
        '<div class="deep-score"><div class="ds-n">' + d.you + '<span class="ds-s"> / 10</span></div>' +
          '<div class="ds-sub">' + esc(skill.abilities[keys[0]].code) + ' L' + d.a1 + ' + ' + esc(skill.abilities[keys[1]].code) + ' L' + d.a2 + '</div>' +
          (roleLabel ? '<div class="ds-role">' + esc(roleLabel) + '</div>' : '') + '</div>' +
      '</div>' +
      richP(skill.about, 'lede about') +
      abilityBlockHtml(skill.abilities[keys[0]], d.a1) +
      abilityBlockHtml(skill.abilities[keys[1]], d.a2) +
    '</section>';
  }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  // ---- сборка всего документа ----
  function build(p, registration) {
    var T = window.IMP_REPORT_TEXTS;
    if (!T) throw new Error('Не загружены тексты отчёта (js/report-texts.js)');
    var sd = skillData(p);

    // строки резюме (навык из 10; коридор ИИ lo–hi; позиция человека)
    var rows = RESUME_ORDER.map(function (key) {
      var skill = T.skills[key];
      var b = AI_BAND[key];
      var you = sd[key].you;
      var aks = abilityKeys(key);
      return {
        key: key, code: skill.code, name: skill.name, desc: SKILL_DESC[key],
        you: you, lo: b.lo, hi: b.hi, pos: bandPos(you, b),
        a1: sd[key].a1, a2: sd[key].a2,
        code1: skill.abilities[aks[0]].code, code2: skill.abilities[aks[1]].code
      };
    });
    var youTotal = 0, aiLo = 0, aiHi = 0;
    rows.forEach(function (r) { youTotal += r.you; aiLo += r.lo; aiHi += r.hi; });

    var above = rows.filter(function (r) { return r.pos === 'above'; }).length;
    var inBand = rows.filter(function (r) { return r.pos === 'in'; }).length;
    var below = rows.filter(function (r) { return r.pos === 'below'; }).length;
    var totalPos = youTotal < aiLo ? 'below' : (youTotal > aiHi ? 'above' : 'in');

    // порядок вывода: сначала где вы выше коридора, затем ниже, затем внутри
    var rank = { above: 0, below: 1, in: 2 };
    var ordered = rows.slice().sort(function (a, b) {
      if (rank[a.pos] !== rank[b.pos]) return rank[a.pos] - rank[b.pos];
      return RESUME_ORDER.indexOf(a.key) - RESUME_ORDER.indexOf(b.key);
    });

    // абсолютные роли для детализации (самый развитый / наибольший потенциал)
    var byLevel = rows.slice().sort(function (a, b) { return b.you - a.you; });
    var topSkill = byLevel[0].key, lowSkill = byLevel[byLevel.length - 1].key;

    var name = ((registration && registration.firstName) || p.firstName || '') + ' ' + ((registration && registration.lastName) || p.lastName || '');
    name = name.trim();
    var dateIso = (p.station3 && p.station3.finishedAt) || (registration && registration.registeredAt) || '';

    var miniScale = (T.miniScale || []).map(function (m) {
      return '<div class="ms"><span class="ms-n">L' + m.level + '</span><span class="ms-t">' + esc(m.anchor) + '</span></div>';
    }).join('');

    var chips = [
      'кейс «Искра» · ' + AI_PARITY_META.caseVersion,
      'n = ' + AI_PARITY_META.n + ' прогонов · коридор от–до',
      'замер: ' + AI_PARITY_META.measuredAt
    ].map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('');

    var about = T.about || {};
    var meth = T.methodology || {};

    // список навыков/способностей для методологии
    var methList = DEEPDIVE_ORDER.map(function (sk) {
      var s = T.skills[sk], ks = abilityKeys(sk);
      return '<div class="ml"><div class="ml-skill">' + esc(s.name) + ' <span class="code">' + esc(s.code) + '</span></div>' +
        '<div class="ml-ab">' + esc(s.abilities[ks[0]].name) + ' <span class="code">' + esc(s.abilities[ks[0]].code) + '</span></div>' +
        '<div class="ml-ab">' + esc(s.abilities[ks[1]].name) + ' <span class="code">' + esc(s.abilities[ks[1]].code) + '</span></div>' +
      '</div>';
    }).join('');

    // детализация
    var deep = DEEPDIVE_ORDER.map(function (sk, i) {
      var role = sk === topSkill ? 'Ваш самый развитый навык' : (sk === lowSkill ? 'Наибольший потенциал роста' : '');
      return deepDiveHtml(sk, i + 1, DEEPDIVE_ORDER.length, sd, T, role);
    }).join('');

    // закрывающий «С чего начать» — по способности с наименьшим уровнем в навыке роста
    var growthSk = lowSkill;
    var gKeys = abilityKeys(growthSk);
    var gAb1 = { key: gKeys[0], lvl: sd[growthSk].a1 }, gAb2 = { key: gKeys[1], lvl: sd[growthSk].a2 };
    var startAb = gAb1.lvl <= gAb2.lvl ? gAb1 : gAb2;
    var startAbObj = T.skills[growthSk].abilities[startAb.key];
    var startDev = startAbObj && startAbObj.development && startAbObj.development[startAb.lvl];

    return '<!doctype html>\n<html lang="ru">\n<head>\n' +
'<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>i(m)perfect · Отчёт · ' + esc(name || '—') + '</title>\n' +
'<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800;900&family=Inter:wght@400;500;600;700&display=swap">\n' +
'<style>' + REPORT_CSS + '</style>\n</head>\n<body>\n<div class="frame"><div class="sheet">\n' +

// ---- ОБЛОЖКА ----
'<section class="page cover">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Ассессмент «Искра» · Раунд 1</span></div>' +
  '<p class="eyebrow">Диагностический отчёт · превью · сравнение с ИИ</p>' +
  '<h1 class="cover-h1">Стратегическое<br>мышление</h1>' +
  '<p class="lede">Ваш профиль по пяти навыкам стратегического мышления — и его положение относительно коридора ИИ: диапазона от худшего до лучшего результата, который на этом же кейсе показывает эталонная нейросеть.</p>' +
  '<div class="cmeta">' +
    '<div class="m"><p class="k">Участник</p><div class="val">' + esc(name || '—') + '</div></div>' +
    '<div class="m"><p class="k">Дата прохождения</p><div class="val">' + esc(formatLongDate(dateIso)) + '</div></div>' +
    '<div class="m"><p class="k">Модуль</p><div class="val">Кейс «Искра» · ' + esc(AI_PARITY_META.caseVersion) + '</div></div>' +
    '<div class="m"><p class="k">Вы · коридор ИИ</p><div class="val">' + youTotal + ' <span class="val-s">· ИИ ' + aiLo + '–' + aiHi + ' из 50</span></div></div>' +
  '</div>' +
  '<div class="notice"><p><b>Тестовый прогон · этап разработки.</b> Это предварительное превью отчёта. Оценка ещё не прошла фасилитацию — если после разбора результаты уточнятся, мы сообщим вам отдельно. Пока это демонстрация того, что вы получите в полной версии.</p></div>' +
'</section>' +

// ---- РЕЗЮМЕ ----
'<section class="page">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Резюме</span></div>' +
  '<h2 class="sec-h">Ваш профиль относительно ИИ</h2>' +
  '<p class="lede">Коридор ИИ — диапазон от худшего до лучшего результата эталонной модели на этом кейсе. По каждому навыку видно, попадаете ли вы ниже коридора, внутрь него наравне с ИИ или выше.</p>' +
  // общий балл /50 на шкале коридора ИИ
  '<div class="totalgraph">' +
    '<div class="tg-head">' +
      '<div class="tg-cell"><div class="hk"><span class="d"></span>Ваш общий балл</div><div class="hn">' + youTotal + '<span class="hs"> / 50</span></div></div>' +
      '<div class="tg-cell"><div class="hk"><span class="band-sw"></span>Коридор ИИ</div><div class="hn">' + aiLo + '–' + aiHi + '<span class="hs"> / 50</span></div></div>' +
      '<div class="tg-pos ' + posClass(totalPos) + '">' + posLabel(totalPos) + '</div>' +
    '</div>' +
    '<div class="tg-track"><span class="tg-base"></span>' +
      '<span class="tg-band" style="left:' + (aiLo / 50 * 100) + '%; right:' + (100 - aiHi / 50 * 100) + '%"></span>' +
      '<span class="tg-you" style="left:' + (youTotal / 50 * 100) + '%"></span>' +
    '</div>' +
    '<div class="tg-ticks"><span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span></div>' +
  '</div>' +
  '<div class="hsum-row"><span class="hs-item up"><b>' + above + '</b> ' + skillWord(above) + ' выше ИИ</span>' +
    '<span class="hs-item eq"><b>' + inBand + '</b> ' + skillWord(inBand) + ' в коридоре</span>' +
    '<span class="hs-item dn"><b>' + below + '</b> ' + skillWord(below) + ' ниже ИИ</span></div>' +
  '<div class="srows">' + resumeRowsHtml(ordered) + '</div>' +
  '<div class="axis"><div class="ticks"><span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span></div></div>' +
  '<p class="caption"><b>●</b> — ваш балл навыка; закрашенная полоса — коридор ИИ, от худшего до лучшего прогона. Каждый навык складывается из <b>двух способностей</b>, и каждая способность — на одном из <b>пяти уровней</b> (L1–L5, описаны ниже). Балл навыка — сумма двух, поэтому шкала 0–10; общий балл — сумма десяти способностей, поэтому /50. Полный разбор по обеим способностям — дальше в отчёте.</p>' +
  (miniScale ? '<div class="miniscale"><p class="k">Пять уровней каждой способности</p><p class="ms-lead">На этих пяти уровнях оценивается каждая из десяти способностей. Балл навыка — сумма его двух способностей.</p><div class="ms-grid">' + miniScale + '</div></div>' : '') +
'</section>' +

// ---- ЧТО ТАКОЕ ИИ-ПАРИТЕТ ----
'<section class="page">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Как читать сравнение</span></div>' +
  '<h2 class="sec-h">Что такое коридор ИИ</h2>' +
  '<p class="lede">Тот же кейс, те же вопросы, тот же оценщик — но отвечает эталонная нейросеть, и не один раз. Её результаты от прогона к прогону расходятся, и этот разброс — от худшего до лучшего — образует коридор ИИ: полосу, внутри которой сегодня живёт машинное стратегическое мышление.</p>' +
  '<p class="lede sub">Это не соревнование и не вердикт. Коридор отвечает на один практический вопрос: <b>в чём ваше мышление устойчиво сильнее машины, где вы с ней вровень, а где пока не дотягиваете.</b> Первое — ваша незаменимая зона. Последнее — где стоит либо расти, либо сознательно опираться на инструменты.</p>' +
  '<div class="cols3">' +
    '<div class="c3 up"><div class="c3-h">Выше ИИ</div><p>Ваш уровень выше верхней границы коридора. На этом навыке вы делаете то, чего эталонная модель не показала даже в лучшем прогоне. Это опора профиля — и аргумент вашей роли рядом с ИИ-инструментами.</p></div>' +
    '<div class="c3 eq"><div class="c3-h">В коридоре</div><p>Ваш уровень внутри диапазона ИИ. Вы и машина на этом навыке сегодня в одной зоне — где именно внутри коридора, видно на шкале. Хороший результат и повод решить, где хочется оторваться.</p></div>' +
    '<div class="c3 dn"><div class="c3-h">Ниже ИИ</div><p>Ваш уровень ниже нижней границы коридора — пока не дотягиваете даже до худшего прогона машины. Это не приговор, а карта: именно здесь шаг развития даёт наибольший прирост относительной ценности.</p></div>' +
  '</div>' +
  '<div class="measure"><p class="k">Как измерен коридор ИИ<span class="ast">*</span></p>' +
    '<p>Эталонные модели проходят кейс тем же маршрутом, что и вы, без подсказок и без ограничения интерфейсом. Ответы оценивает тот же оценщик, что и ваши. Границы коридора — худший и лучший результат серии прогонов; коридор перемеряется при каждом обновлении кейса или оценщика.</p>' +
    '<div class="chips">' + chips + '</div>' +
    (AI_PARITY_META.models ? '<p class="foot-note"><span class="ast">*</span> В сравнении участвуют: ' + esc(AI_PARITY_META.models) + '. Набор моделей уточняется по мере прогона новых.</p>' : '') +
  '</div>' +
'</section>' +

// ---- ДЕТАЛИЗАЦИЯ ПО НАВЫКАМ ----
deep +

// ---- ЗАКРЫВАЮЩАЯ «С ЧЕГО НАЧАТЬ» ----
'<section class="page">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">С чего начать</span></div>' +
  '<h2 class="sec-h">Один шаг, который сдвинет профиль</h2>' +
  '<p class="lede">Стратегическое мышление тренируется. Наибольший прирост относительной ценности сейчас — в навыке «' + esc(T.skills[growthSk].name) + '».</p>' +
  (startDev ? '<div class="devbox big"><p class="dev-k">Ваш следующий шаг</p><p>' + esc(startDev) + '</p></div>' : '') +
'</section>' +

// ---- ОБ ОЦЕНКЕ ----
'<section class="page">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Об оценке</span></div>' +
  '<h2 class="sec-h">Об этой оценке</h2>' +
  (about.shows ? '<div class="abt"><p class="k">Что показывает отчёт</p>' + richP(about.shows, 'lede') + '</div>' : '') +
  (about.howMeasured ? '<div class="abt"><p class="k">Как проходила оценка</p>' + richP(about.howMeasured, 'lede') + '</div>' : '') +
  (about.placeInAssessment ? '<div class="abt"><p class="k">Место модуля в оценке</p>' + richP(about.placeInAssessment, 'lede') + '</div>' : '') +
'</section>' +

// ---- МЕТОДОЛОГИЯ ----
'<section class="page">' +
  '<div class="phead"><span class="brand">' + LOGO + '</span><span class="meta">Методология</span></div>' +
  '<h2 class="sec-h">Как устроена оценка</h2>' +
  (meth.intro ? richP(meth.intro, 'lede') : '') +
  '<div class="methlist">' + methList + '</div>' +
  (meth.levelsMeaning ? '<div class="abt"><p class="k">Что означают уровни</p>' + richP(meth.levelsMeaning, 'lede') + '</div>' : '') +
  (meth.scaleNote ? '<div class="abt"><p class="k">Примечание о шкале</p>' + richP(meth.scaleNote, 'lede') + '</div>' : '') +
  '<div class="abt"><p class="k">Балл навыка и общий балл</p><p class="lede">Уровень — это качественная характеристика способности (L1–L5, пять уровней). Баллы в этом отчёте — суммы уровней: <b>балл навыка</b> = сумма его двух способностей (2–10), <b>общий балл</b> = сумма всех десяти (10–50). Это удобная метрика для сравнения с коридором ИИ, а не отдельная 10-балльная шкала уровней.</p></div>' +
'</section>' +

// ---- ФУТЕР (подпись futureproof) ----
'<footer class="foot"><div class="foot-in">' +
  '<span class="fp">futureproof <span class="ar">▸</span></span>' +
  '<span class="foot-meta">i(m)perfect · ассессмент «Искра» · тестовый прогон</span>' +
'</div></footer>' +

'\n</div></div>\n</body>\n</html>';
  }

  // однострочные описания навыков для резюме (сжатые из §2, покрывают обе способности)
  var SKILL_DESC = {
    ak: 'Как широко вы сканируете внешнюю среду и как глубоко связываете обнаруженные факторы в единую картину.',
    pr: 'Как вы сужаете пространство действий до управляемого набора приоритетов — с осознанными отказами и обоснованием выбора.',
    mk: 'Как далеко в будущее и в скольких вариантах вы мыслите — от продления текущих трендов до принципиально иных сценариев.',
    ga: 'Насколько систематически вы порождаете разные по механизму варианты решения и из скольких разных областей берёте идеи.',
    pp: 'Как вы раскладываете цель на этапы и как удерживаете маршрут, когда план сталкивается с ограничениями.'
  };

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
    ":root{--lime:#a6ff00;--lime-dim:#8fe600;--lime-tint:#f7ffe8;--lime-line:#cdeaa0;--ink:#0a0a0a;--paper:#fff;--muted:#56585c;--muted-soft:#8a8d92;--line:#16171a;--hair:#ececec;--radius:18px;--ff-d:'Unbounded',sans-serif;--ff-b:'Inter',sans-serif;}",
    "*{box-sizing:border-box;}",
    "body{margin:0;background:var(--lime);color:var(--ink);font-family:var(--ff-b);line-height:1.55;-webkit-font-smoothing:antialiased;}",
    ".frame{padding:clamp(10px,2vw,22px);}",
    ".sheet{max-width:1180px;margin:0 auto;background:var(--paper);border-radius:var(--radius);overflow:hidden;}",
    ".page{padding:56px 72px;border-bottom:1px solid var(--hair);}",
    ".phead{display:flex;justify-content:space-between;align-items:center;margin-bottom:40px;}",
    ".brand{font-family:var(--ff-d);font-weight:900;font-size:20px;letter-spacing:-0.02em;display:inline-flex;align-items:baseline;gap:7px;}",
    ".brand .mark{background:var(--ink);color:var(--lime);padding:1px 7px;border-radius:6px;}",
    ".fp{font-family:var(--ff-d);font-weight:900;font-size:20px;letter-spacing:-0.02em;color:var(--paper);}",
    ".fp .ar{color:var(--lime);}",
    ".phead .meta{font-family:var(--ff-b);font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-soft);}",
    ".eyebrow{font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted-soft);margin:0 0 16px;}",
    ".cover-h1{font-family:var(--ff-d);font-weight:900;font-size:clamp(44px,6vw,76px);line-height:1.0;letter-spacing:-0.02em;text-transform:uppercase;margin:0 0 22px;text-wrap:balance;}",
    ".sec-h{font-family:var(--ff-d);font-weight:800;font-size:clamp(30px,3.4vw,42px);line-height:1.06;letter-spacing:-0.01em;text-transform:uppercase;margin:0 0 18px;text-wrap:balance;}",
    ".lede{font-size:17px;line-height:1.5;max-width:64ch;margin:0;color:var(--ink);text-wrap:pretty;}",
    ".lede.sub{margin-top:14px;color:var(--muted);font-size:16px;}",
    ".lede + .lede{margin-top:14px;}",
    ".lede b{font-weight:600;}",
    ".cmeta{display:flex;gap:48px;flex-wrap:wrap;margin-top:44px;}",
    ".cmeta .k,.abt .k,.miniscale .k,.measure .k{font-size:11px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:var(--muted-soft);margin:0 0 7px;}",
    ".cmeta .val{font-size:20px;font-weight:600;font-family:var(--ff-b);}",
    ".cmeta .val-s{color:var(--muted-soft);font-weight:400;font-size:14px;}",
    ".notice{margin-top:40px;background:var(--lime-tint);border:1px solid var(--lime-line);border-radius:var(--radius);padding:20px 22px;max-width:820px;}",
    ".notice b{font-weight:700;}.notice p{margin:0;font-size:14px;color:var(--ink);line-height:1.55;}",
    // hero
    ".hero{display:flex;align-items:flex-end;gap:52px;margin-top:32px;padding-bottom:28px;border-bottom:1px solid var(--hair);flex-wrap:wrap;}",
    ".hnum .hk{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted-soft);display:flex;align-items:center;gap:7px;margin-bottom:6px;}",
    ".hnum .hk .d{width:10px;height:10px;border-radius:50%;background:var(--lime);border:1px solid var(--ink);}",
    ".hnum .hk .o{width:10px;height:10px;border-radius:50%;border:2px solid var(--ink);box-sizing:border-box;}",
    ".hnum .hn{font-family:var(--ff-d);font-weight:900;font-size:60px;line-height:.9;letter-spacing:-0.02em;}",
    ".hnum .hn .hs{font-family:var(--ff-b);font-size:19px;color:var(--muted-soft);font-weight:400;letter-spacing:0;}",
    ".hsum{margin-left:auto;font-size:14px;color:var(--muted);line-height:1.7;text-align:right;}",
    ".hsum b{color:var(--ink);font-weight:600;}",
    // skill rows
    ".srows{margin-top:24px;}",
    ".srow{padding:20px 0;border-bottom:1px solid var(--hair);}",
    ".srow-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;}",
    ".sk{font-size:16px;font-weight:600;}",
    ".sk .code{color:var(--muted-soft);font-weight:600;font-size:12px;}",
    ".tag{display:inline-block;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;padding:2px 8px;border-radius:6px;margin-left:8px;vertical-align:2px;}",
    ".tag.s{background:var(--lime);color:var(--ink);}",
    ".tag.g{background:var(--ink);color:var(--paper);}",
    ".skdesc{font-size:13px;color:var(--muted);line-height:1.5;margin:7px 0 14px;max-width:74ch;}",
    ".sbar{position:relative;height:18px;}",
    ".sbar .base{position:absolute;left:0;right:0;top:50%;height:2px;background:var(--hair);transform:translateY(-50%);border-radius:2px;}",
    ".sbar .band{position:absolute;top:50%;transform:translateY(-50%);height:16px;background:#f0f0ee;border:1px solid #cfcfca;border-radius:8px;z-index:1;}",
    ".sbar .mk{position:absolute;top:50%;transform:translate(-50%,-50%);}",
    ".sbar .you{width:14px;height:14px;border-radius:50%;background:var(--lime);border:1.5px solid var(--ink);z-index:3;}",
    ".pos{flex:none;text-align:right;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;line-height:1.2;white-space:nowrap;}",
    ".pos.up{color:var(--ink);}.pos.dn{color:var(--muted);}.pos.eq{color:var(--muted-soft);}",
    ".srow-scale{display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--muted-soft);font-variant-numeric:tabular-nums;}",
    ".srow-scale .you-val{color:var(--ink);font-weight:600;}",
    ".srow-scale .you-break{color:var(--muted-soft);font-weight:400;}",
    // общий график 0–50
    ".totalgraph{margin-top:28px;padding-bottom:26px;border-bottom:1px solid var(--hair);}",
    ".tg-head{display:flex;align-items:flex-end;gap:44px;flex-wrap:wrap;margin-bottom:20px;}",
    ".tg-cell .hk{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted-soft);display:flex;align-items:center;gap:7px;margin-bottom:6px;}",
    ".tg-cell .hk .d{width:10px;height:10px;border-radius:50%;background:var(--lime);border:1px solid var(--ink);}",
    ".tg-cell .hk .band-sw{width:16px;height:10px;border-radius:3px;background:#f0f0ee;border:1px solid #cfcfca;}",
    ".tg-cell .hn{font-family:var(--ff-d);font-weight:900;font-size:52px;line-height:.9;letter-spacing:-0.02em;}",
    ".tg-cell .hn .hs{font-family:var(--ff-b);font-size:17px;color:var(--muted-soft);font-weight:400;letter-spacing:0;}",
    ".tg-pos{margin-left:auto;align-self:center;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border-radius:8px;border:1.5px solid var(--ink);}",
    ".tg-pos.up{background:var(--lime);}.tg-pos.eq{background:var(--paper);}.tg-pos.dn{background:var(--ink);color:var(--paper);}",
    ".tg-track{position:relative;height:26px;}",
    ".tg-base{position:absolute;left:0;right:0;top:50%;height:2px;background:var(--hair);transform:translateY(-50%);border-radius:2px;}",
    ".tg-band{position:absolute;top:50%;transform:translateY(-50%);height:22px;background:#f0f0ee;border:1px solid #cfcfca;border-radius:8px;z-index:1;}",
    ".tg-you{position:absolute;top:50%;transform:translate(-50%,-50%);width:20px;height:20px;border-radius:50%;background:var(--lime);border:2px solid var(--ink);z-index:3;}",
    ".tg-ticks{display:flex;justify-content:space-between;margin-top:8px;font-size:10px;color:var(--muted-soft);font-variant-numeric:tabular-nums;}",
    ".hsum-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px;}",
    ".hs-item{font-size:13px;color:var(--muted);border:1px solid var(--hair);border-radius:8px;padding:8px 14px;}",
    ".hs-item b{font-family:var(--ff-d);font-weight:800;color:var(--ink);margin-right:2px;}",
    ".hs-item.up{border-color:var(--lime);}.hs-item.dn{border-color:var(--ink);}",
    ".axis{margin-top:8px;}",
    ".axis .ticks{display:flex;justify-content:space-between;font-size:9.5px;color:var(--muted-soft);font-variant-numeric:tabular-nums;}",
    ".caption{font-size:12px;color:var(--muted-soft);margin-top:18px;line-height:1.5;}.caption b{color:var(--muted);font-weight:600;}",
    // mini scale
    ".miniscale{margin-top:34px;}",
    ".miniscale .ms-lead{font-size:12.5px;color:var(--muted);margin:0 0 16px;max-width:72ch;line-height:1.5;}",
    ".ms-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;}",
    ".ms{border-top:2px solid var(--ink);padding-top:8px;}",
    ".ms-n{display:block;font-family:var(--ff-d);font-weight:800;font-size:13px;margin-bottom:4px;}",
    ".ms-t{font-size:12px;color:var(--muted);line-height:1.4;}",
    // ai-parity columns
    ".cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:32px;}",
    ".c3{border-top:3px solid var(--hair);padding-top:14px;}",
    ".c3.up{border-top-color:var(--lime);}.c3.eq{border-top-color:var(--muted-soft);}.c3.dn{border-top-color:var(--ink);}",
    ".c3-h{font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;margin:0 0 10px;}",
    ".c3 p{margin:0;font-size:13.5px;color:var(--muted);line-height:1.55;}",
    ".measure{margin-top:32px;background:var(--paper);border:1px solid var(--hair);border-radius:var(--radius);padding:20px 22px;}",
    ".measure p{margin:0 0 14px;font-size:13.5px;color:var(--muted);line-height:1.55;max-width:76ch;}",
    ".chips{display:flex;flex-wrap:wrap;gap:8px;}",
    ".chip{font-size:11.5px;color:var(--muted);background:var(--paper);border:1px solid var(--hair);border-radius:8px;padding:5px 11px;}",
    ".ast{color:var(--muted-soft);}",
    ".measure .foot-note{margin:16px 0 0;font-size:11.5px;color:var(--muted-soft);line-height:1.5;max-width:78ch;}",
    // deep dive
    ".deep-title-row{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;}",
    ".deep-h1{font-family:var(--ff-d);font-weight:800;font-size:clamp(28px,3.2vw,40px);line-height:1.05;letter-spacing:-0.01em;text-transform:uppercase;margin:0;max-width:16ch;text-wrap:balance;}",
    ".deep-score{text-align:right;flex:none;}",
    ".ds-n{font-family:var(--ff-d);font-weight:900;font-size:46px;line-height:.9;}",
    ".ds-n .ds-s{font-family:var(--ff-b);font-size:16px;color:var(--muted-soft);font-weight:400;}",
    ".ds-sub{font-size:11px;color:var(--muted-soft);font-weight:600;letter-spacing:.03em;margin-top:6px;}",
    ".ds-role{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--muted);margin-top:8px;}",
    ".about{margin-top:18px;color:var(--muted);}",
    ".ability{margin-top:34px;}",
    ".ab-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-bottom:2px solid var(--ink);padding-bottom:8px;}",
    ".ab-head h3{font-size:19px;font-weight:700;margin:0;}",
    ".ab-head .code{color:var(--muted-soft);font-weight:600;font-size:13px;}",
    ".ab-head .ab-level{font-family:var(--ff-d);font-weight:800;font-size:18px;flex:none;}",
    ".scale{margin-top:16px;display:flex;flex-direction:column;gap:8px;}",
    ".lvl{display:grid;grid-template-columns:44px 1fr;gap:14px;padding:10px 0;border-bottom:1px solid var(--hair);}",
    ".lvl .lvl-n{font-family:var(--ff-d);font-weight:700;font-size:13px;color:var(--muted-soft);}",
    ".lvl .lvl-text{margin:0;font-size:13.5px;color:var(--muted);line-height:1.5;}",
    ".lvl.lvl-you{display:block;background:var(--lime-tint);border:1px solid var(--lime-line);border-radius:var(--radius);padding:16px 18px;box-shadow:5px 5px 0 var(--lime);}",
    ".lvl.lvl-you .lvl-n{color:var(--ink);font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px;}",
    ".lvl.lvl-you .lvl-text{color:var(--ink);font-size:15px;line-height:1.55;}",
    ".sw{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;}",
    ".sw-col p{margin:0;font-size:13.5px;color:var(--muted);line-height:1.5;}",
    ".sw-col .sw-k{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin-bottom:6px;}",
    ".devbox{margin-top:20px;background:var(--ink);color:var(--paper);border-radius:var(--radius);padding:18px 20px;}",
    ".devbox .dev-k{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--lime);margin:0 0 8px;}",
    ".devbox p{margin:0;font-size:14px;line-height:1.55;color:var(--paper);}",
    ".devbox.big{margin-top:26px;padding:26px 28px;}.devbox.big p{font-size:16px;}",
    ".abt{margin-top:24px;}.abt .lede{margin-top:2px;}.abt .lede + .lede{margin-top:14px;}",
    ".methlist{margin-top:24px;display:flex;flex-direction:column;gap:2px;}",
    ".ml{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:16px;padding:12px 0;border-bottom:1px solid var(--hair);align-items:baseline;}",
    ".ml-skill{font-weight:600;font-size:15px;}",
    ".ml-ab{font-size:13px;color:var(--muted);}",
    ".ml .code{color:var(--muted-soft);font-size:11px;font-weight:600;}",
    // footer
    ".foot{background:var(--ink);}",
    ".foot-in{max-width:1180px;margin:0 auto;padding:26px 72px;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;}",
    ".foot-meta{color:var(--muted-soft);font-size:11px;letter-spacing:.13em;text-transform:uppercase;}",
    // responsive + print
    "@media(max-width:720px){.page{padding:34px 24px;}.hero{gap:24px;}.hsum{margin-left:0;text-align:left;}.cols3,.sw,.ms-grid,.ml{grid-template-columns:1fr;}.deep-title-row{flex-direction:column;}.deep-score{text-align:left;}.foot-in{padding:22px 24px;}}",
    "@media print{body{background:#fff;}.frame{padding:0;}.sheet{max-width:none;border-radius:0;}.page{break-after:page;border-bottom:none;}.devbox,.foot,.tag.s,.tag.g,.lvl.lvl-you,.notice{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}"
  ].join('');

  window.impReport = { build: build, download: download, BAND: AI_BAND };
})();

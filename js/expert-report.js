// i(m)perfect — СВОДКА ЭКСПЕРТНОЙ ВАЛИДАЦИИ.
//
// Экран отвечает на один вопрос: КАКИЕ ФОРМУЛИРОВКИ ПЕРЕПИСАТЬ. Не «хорошая ли
// у нас методология» — на это ответа в цифрах нет, — а поимённый список
// описаний, которые читаются не так, как задумано, отсортированный по тому,
// насколько сильно расходятся эксперты.
//
// ЧТО СЧИТАЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО.
//
// psa (proportion of substantive agreement) — доля экспертов, положивших
//   карточку к её собственной способности. Порог 0.75 взят как принятый в
//   процедуре Андерсона—Гербинга; ниже него описание считается неопознаваемым.
// csv (substantive validity coefficient) = (свои − лучший чужой) / N.
//   Отличает «все промахнулись вразнобой» (описание мутное) от «все ушли в
//   одну и ту же соседнюю способность» (границы между двумя стёрты). Это два
//   разных диагноза и два разных лечения, и одна psa их не различает.
// Матрица путаницы — куда именно уезжает каждая способность. Пара, стабильно
//   слипающаяся в обе стороны, — кандидат на объединение или на разведение
//   определений.
// ρ Спирмена — совпадение порядка уровней с истинным, по каждому эксперту.
// W Кендалла — согласие ЭКСПЕРТОВ МЕЖДУ СОБОЙ. Ортогонально предыдущему:
//   эксперты могут дружно выстроить лестницу не так, как мы, — это сообщение
//   о методологии, а низкое W — о том, что описания не задают порядка вовсе.
//
// ⚠ ПОРОГ ПО ДЛИНЕ. В §10 верхние уровни описаны подробнее нижних: средняя
// карточка L4–L5 в полтора раза длиннее L1–L3. Значит часть порядка угадывается
// вообще без чтения. Поэтому рядом с точностью экспертов всегда стоит цифра,
// которую набрал бы тот, кто сортирует карточки ОДНОЙ ТОЛЬКО ДЛИНОЙ. Сравнивать
// экспертов надо с ней, а не с нулём: превышение над случайностью тут не
// достижение, достижение — превышение над длиной.

(function () {
  var $ = function (id) { return document.getElementById(id); };

  // Корпус приходит расшифрованным из js/expert-lock.js: сводка знает те же
  // пятьдесят описаний, что и эксперт, и запирается тем же паролем.
  var C = null, ABILITIES = null, CODES = null, ABILITY_BY_CODE = null, CARD_BY_ID = null;

  function indexCorpus(corpus) {
    C = corpus;
    ABILITIES = [];
    C.skills.forEach(function (s) { s.abilities.forEach(function (a) { ABILITIES.push(a); }); });
    CODES = ABILITIES.map(function (a) { return a.code; });
    ABILITY_BY_CODE = {};
    ABILITIES.forEach(function (a) { ABILITY_BY_CODE[a.code] = a; });
    CARD_BY_ID = {};
    C.cards.forEach(function (c) { CARD_BY_ID[c.id] = c; });
  }

  var PSA_MIN = 0.75;
  var experts = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pct(x) { return (x * 100).toFixed(0) + '%'; }
  function num(x, d) { return x == null || isNaN(x) ? '—' : x.toFixed(d == null ? 2 : d); }
  // «4 раз» в таблице читается как опечатка и отвлекает от цифры рядом.
  function times(n) {
    var t = n % 10, h = n % 100;
    return n + (t === 1 && h !== 11 ? ' раз' : (t >= 2 && t <= 4 && (h < 12 || h > 14) ? ' раза' : ' раз'));
  }

  // ------------------------------------------------------------- статистика

  // ρ Спирмена для пяти элементов без связок.
  function spearman(order) {
    var d2 = 0;
    order.forEach(function (id, i) {
      var trueLevel = CARD_BY_ID[id] ? CARD_BY_ID[id].level : 0;
      var d = (i + 1) - trueLevel;
      d2 += d * d;
    });
    return 1 - (6 * d2) / (5 * (25 - 1));
  }

  // W Кендалла: согласие m экспертов о порядке n=5 карточек.
  function kendallW(orders) {
    var m = orders.length;
    if (m < 2) return null;
    var n = 5;
    var sums = {};
    orders.forEach(function (o) {
      o.forEach(function (id, i) { sums[id] = (sums[id] || 0) + (i + 1); });
    });
    var vals = Object.keys(sums).map(function (k) { return sums[k]; });
    if (vals.length !== n) return null;
    var mean = vals.reduce(function (a, b) { return a + b; }, 0) / n;
    var S = vals.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0);
    return (12 * S) / (m * m * (n * n * n - n));
  }

  // Порог по длине: как разложил бы карточки тот, кто их не читал.
  //
  // Считается по ВИДИМОЙ длине — той, что эксперт видит в блоке Б на первом
  // взгляде (ярлык + «суть»; признаки там убраны под раскрытие). Полная длина
  // карточки давала бы другую, более пугающую цифру, но эксперт её не видит,
  // и порог получился бы завышенным.
  function visibleLen(c) {
    return (c.lead ? c.lead.length + 1 : 0) + (c.gist ? c.gist.length : (c.does ? c.does.length : 0));
  }
  function lengthBaseline(code) {
    var cards = C.cards.filter(function (c) { return c.ability === code; });
    var byLen = cards.slice().sort(function (a, b) { return visibleLen(a) - visibleLen(b); });
    var order = byLen.map(function (c) { return c.id; });
    var exact = order.filter(function (id, i) { return CARD_BY_ID[id].level === i + 1; }).length;
    return { rho: spearman(order), exact: exact / 5 };
  }

  // ---------------------------------------------------------------- разбор

  function analyse() {
    var N = experts.length;

    // --- блок А
    var perCard = C.cards.map(function (card) {
      var votes = {}, unsure = 0, answered = 0, notes = [], seconds = {};
      experts.forEach(function (e) {
        var a = (e.attr || {})[card.id];
        if (!a) return;
        answered++;
        if (a.note && a.note.trim()) notes.push({ who: e.who, text: a.note.trim() });
        if (a.unsure || !a.ability) { unsure++; return; }
        votes[a.ability] = (votes[a.ability] || 0) + 1;
        if (a.second) seconds[a.second] = (seconds[a.second] || 0) + 1;
      });
      var right = votes[card.ability] || 0;
      var otherMax = 0, otherCode = '';
      Object.keys(votes).forEach(function (k) {
        if (k !== card.ability && votes[k] > otherMax) { otherMax = votes[k]; otherCode = k; }
      });
      var skillRight = 0;
      Object.keys(votes).forEach(function (k) {
        if (k.slice(0, 2) === card.skill) skillRight += votes[k];
      });
      return {
        card: card, answered: answered, votes: votes, seconds: seconds, notes: notes,
        unsure: unsure,
        psa: answered ? right / answered : null,
        csv: answered ? (right - otherMax) / answered : null,
        skillPsa: answered ? skillRight / answered : null,
        otherCode: otherCode, otherMax: otherMax
      };
    });

    // --- матрица путаницы
    var matrix = {};
    CODES.forEach(function (r) { matrix[r] = {}; CODES.forEach(function (c) { matrix[r][c] = 0; }); });
    var unsureByAbility = {};
    perCard.forEach(function (p) {
      Object.keys(p.votes).forEach(function (k) { matrix[p.card.ability][k] += p.votes[k]; });
      unsureByAbility[p.card.ability] = (unsureByAbility[p.card.ability] || 0) + p.unsure;
    });

    // --- блок Б
    var perAbility = ABILITIES.map(function (ab) {
      var orders = [], rhos = [], exacts = [], notes = [];
      experts.forEach(function (e) {
        var o = (e.order || {})[ab.code];
        if (!o || o.length !== 5) return;
        if (e.touched && e.touched[ab.code] === undefined) return;
        orders.push(o);
        rhos.push(spearman(o));
        exacts.push(o.filter(function (id, i) { return CARD_BY_ID[id].level === i + 1; }).length / 5);
        var n = (e.orderNote || {})[ab.code];
        if (n && n.trim()) notes.push({ who: e.who, text: n.trim() });
      });
      var mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
      // Какая пара уровней путается чаще всего внутри способности.
      var swaps = {};
      orders.forEach(function (o) {
        o.forEach(function (id, i) {
          var lvl = CARD_BY_ID[id].level;
          if (lvl !== i + 1) {
            var k = Math.min(lvl, i + 1) + '↔' + Math.max(lvl, i + 1);
            swaps[k] = (swaps[k] || 0) + 1;
          }
        });
      });
      var worst = Object.keys(swaps).sort(function (a, b) { return swaps[b] - swaps[a]; })[0] || '';
      return {
        ability: ab, n: orders.length, rho: mean(rhos), exact: mean(exacts),
        w: kendallW(orders), base: lengthBaseline(ab.code), worst: worst,
        worstN: swaps[worst] || 0, notes: notes
      };
    });

    // --- блок В
    var mapStats = C.skills.map(function (s) {
      var rels = [], yes = 0, pairN = 0, pairNotes = [];
      experts.forEach(function (e) {
        var m = e.map || {};
        if (m.rel && m.rel[s.code]) rels.push(m.rel[s.code]);
        var p = (m.pair || {})[s.code];
        if (p && p.verdict) {
          pairN++;
          if (p.verdict === 'yes') yes++;
          if (p.note && p.note.trim()) pairNotes.push({ who: e.who, text: p.note.trim() });
        }
      });
      // I-CVI — доля оценок «скорее да» и «определённо да».
      var icvi = rels.length ? rels.filter(function (v) { return v >= 3; }).length / rels.length : null;
      return {
        skill: s, n: rels.length, icvi: icvi,
        mean: rels.length ? rels.reduce(function (a, b) { return a + b; }, 0) / rels.length : null,
        pairYes: pairN ? yes / pairN : null, pairN: pairN, pairNotes: pairNotes
      };
    });

    var extraVotes = {};
    var missing = [], freeLists = [], metaDis = [], toolsDis = [];
    experts.forEach(function (e) {
      var m = e.map || {};
      (m.extra || []).forEach(function (c) { extraVotes[c] = (extraVotes[c] || 0) + 1; });
      (m.missing || []).forEach(function (t) {
        if (t && t.trim()) missing.push({ who: e.who, text: t.trim() });
      });
      freeLists.push({ who: e.who, items: (e.free || []).filter(function (t) { return t && t.trim(); }) });
      if (m.meta && m.meta.verdict === 'disagree') metaDis.push({ who: e.who, text: (m.meta.note || '').trim() });
      if (m.tools && m.tools.verdict === 'disagree') toolsDis.push({ who: e.who, text: (m.tools.note || '').trim() });
    });

    return {
      N: N, perCard: perCard, matrix: matrix, unsureByAbility: unsureByAbility,
      perAbility: perAbility, mapStats: mapStats, extraVotes: extraVotes,
      missing: missing, freeLists: freeLists, metaDis: metaDis, toolsDis: toolsDis
    };
  }

  // ----------------------------------------------------------------- вывод

  function who(w) {
    if (!w) return 'эксперт';
    return ((w.first || '') + ' ' + (w.last || '')).trim() || 'эксперт';
  }

  function render() {
    var host = $('rHost');
    if (!experts.length) {
      host.innerHTML = '<div class="xnarrow"><p class="section-lead">Ответов пока нет. ' +
        'Загрузите файлы экспертов кнопкой выше.</p></div>';
      return;
    }
    var R = analyse();
    var h = '<div class="xwide-report">';

    // --- шапка панели
    var versions = {};
    experts.forEach(function (e) { versions[e.corpus] = (versions[e.corpus] || 0) + 1; });
    var vKeys = Object.keys(versions);
    if (vKeys.length > 1 || vKeys[0] !== C.version) {
      h += '<p class="xwarn">Ответы собраны по разным версиям корпуса: ' +
        esc(vKeys.map(function (k) { return k + ' — ' + versions[k]; }).join(', ')) +
        '. Текущая — ' + esc(C.version) + '. Сводить их в одну цифру нельзя: ' +
        'это ответы про разные тексты.</p>';
    }
    if (R.N < 8) {
      h += '<p class="xwarn">Экспертов: ' + R.N + '. Доля согласия на такой выборке ' +
        'шумит: один человек двигает psa на ' + pct(1 / R.N) + '. Ниже цифры показаны, ' +
        'но решения по ним принимать рано — ориентир восемь–двенадцать.</p>';
    }

    // --- плитки
    var m = function (arr, f) {
      var v = arr.map(f).filter(function (x) { return x != null && !isNaN(x); });
      return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
    };
    var psaMean = m(R.perCard, function (p) { return p.psa; });
    var skillMean = m(R.perCard, function (p) { return p.skillPsa; });
    var rhoMean = m(R.perAbility, function (p) { return p.rho; });
    var baseMean = m(R.perAbility, function (p) { return p.base.rho; });
    var bad = R.perCard.filter(function (p) { return p.psa != null && p.psa < PSA_MIN; });

    h += '<div class="xr-kpi">' +
      '<div class="xr-tile"><b>' + R.N + '</b><span>экспертов</span></div>' +
      '<div class="xr-tile"><b>' + pct(psaMean) + '</b><span>попаданий в способность (psa)</span></div>' +
      '<div class="xr-tile"><b>' + pct(skillMean) + '</b><span>попаданий в навык</span></div>' +
      '<div class="xr-tile"><b>' + bad.length + '</b><span>описаний ниже порога ' + PSA_MIN + '</span></div>' +
      '</div>';

    h += '<p class="section-lead">Разрыв между попаданием в навык и в способность — ' +
      'мера того, насколько различимы две способности внутри пары. Сейчас он ' +
      pct(skillMean - psaMean) + ': столько экспертов узнают навык, но не угадывают, ' +
      'какая из двух его способностей описана.</p>';

    // --- проблемные описания
    h += '<h2>Что переписать</h2>' +
      '<p class="section-lead">Описания, у которых согласие ниже порога, сверху — самые спорные. ' +
      '«Уезжает в» показывает, куда именно ушли ответы: если туда же и постоянно — ' +
      'стёрта граница между двумя способностями, а не испорчено одно описание.</p>' +
      '<table class="xr-table"><thead><tr>' +
      '<th>описание</th><th class="num">psa</th><th class="num">csv</th>' +
      '<th class="num">не могу</th><th>уезжает в</th></tr></thead><tbody>';
    R.perCard.slice().sort(function (a, b) {
      return (a.psa == null ? 2 : a.psa) - (b.psa == null ? 2 : b.psa);
    }).forEach(function (p) {
      var low = p.psa != null && p.psa < PSA_MIN;
      h += '<tr' + (low ? ' class="xr-bad"' : '') + '>' +
        '<td><b>' + esc(ABILITY_BY_CODE[p.card.ability].name) + '</b> · уровень ' + p.card.level + '</td>' +
        '<td class="num">' + (p.psa == null ? '—' : num(p.psa)) + '</td>' +
        '<td class="num">' + (p.csv == null ? '—' : num(p.csv)) + '</td>' +
        '<td class="num">' + (p.answered ? pct(p.unsure / p.answered) : '—') + '</td>' +
        '<td>' + (p.otherMax
          ? esc(ABILITY_BY_CODE[p.otherCode].name) + ' — ' + p.otherMax
          : '<span class="xr-dim">—</span>') + '</td></tr>';
    });
    h += '</tbody></table>';

    // --- матрица
    h += '<h2>Куда уезжают ответы</h2>' +
      '<p class="section-lead">Строка — способность, которую описывали. Столбец — куда её отнесли. ' +
      'По диагонали — попадания.</p><div class="xr-scroll"><table class="xr-matrix"><thead><tr><th></th>';
    CODES.forEach(function (c) { h += '<th>' + esc(c) + '</th>'; });
    h += '<th>не могу</th></tr></thead><tbody>';
    CODES.forEach(function (r) {
      h += '<tr><th>' + esc(r) + '</th>';
      CODES.forEach(function (c) {
        var v = R.matrix[r][c];
        h += '<td class="' + (r === c ? 'hit' : (v ? '' : 'zero')) + '">' + (v || '·') + '</td>';
      });
      h += '<td class="' + (R.unsureByAbility[r] ? '' : 'zero') + '">' +
        (R.unsureByAbility[r] || '·') + '</td></tr>';
    });
    h += '</tbody></table></div>';

    // --- порядок
    var dead = R.perAbility.filter(function (p) { return p.base.rho > 0.999; });
    h += '<h2>Лестница уровней</h2>' +
      '<p class="section-lead">ρ — совпадение с нашим порядком, W — согласие экспертов между собой. ' +
      'Низкое ρ при высоком W значит, что лестница читается, но не та, которую мы задумали. ' +
      'Столбец «по длине» — сколько набрал бы тот, кто расставил карточки, не читая, ' +
      'от короткой к длинной: в §10 верхние уровни описаны подробнее, и часть порядка ' +
      'выдаётся объёмом текста. Сравнивать надо с ним, а не с нулём.</p>' +
      (dead.length
        ? '<p class="xwarn">У этих способностей одна длина даёт идеальный порядок: ' +
          esc(dead.map(function (p) { return p.ability.name; }).join(', ')) +
          '. Побить такой порог нельзя, и блок Б о них не сообщает ничего. ' +
          'Чинится это не здесь, а в §10 — описания уровней надо выровнять по объёму.</p>'
        : '') +
      '<table class="xr-table"><thead><tr><th>способность</th>' +
      '<th class="num">точно</th><th class="num">ρ</th><th class="num">по длине ρ</th>' +
      '<th class="num">W</th><th>путается</th></tr></thead><tbody>';
    R.perAbility.forEach(function (p) {
      var weak = p.rho != null && p.base.rho != null && p.rho <= p.base.rho;
      h += '<tr' + (weak ? ' class="xr-bad"' : '') + '><td><b>' + esc(p.ability.name) + '</b></td>' +
        '<td class="num">' + (p.exact == null ? '—' : pct(p.exact)) + '</td>' +
        '<td class="num">' + num(p.rho) + '</td>' +
        '<td class="num">' + num(p.base.rho) + '</td>' +
        '<td class="num">' + num(p.w) + '</td>' +
        '<td>' + (p.worst ? 'уровни ' + esc(p.worst) + ' — ' + times(p.worstN) : '—') + '</td></tr>';
    });
    h += '</tbody></table>';

    // --- полнота карты
    h += '<h2>Полнота карты</h2>' +
      '<p class="section-lead">I-CVI — доля экспертов, ответивших «скорее да» или «определённо да» ' +
      'на вопрос, относится ли навык к стратегическому мышлению. Принятый порог — 0.78.</p>' +
      '<table class="xr-table"><thead><tr><th>навык</th><th class="num">I-CVI</th>' +
      '<th class="num">средняя</th><th class="num">пара исчерпывает</th></tr></thead><tbody>';
    var icviAll = [];
    R.mapStats.forEach(function (p) {
      if (p.icvi != null) icviAll.push(p.icvi);
      var low = p.icvi != null && p.icvi < 0.78;
      h += '<tr' + (low ? ' class="xr-bad"' : '') + '><td><b>' + esc(p.skill.name) + '</b></td>' +
        '<td class="num">' + num(p.icvi) + '</td>' +
        '<td class="num">' + num(p.mean, 1) + '</td>' +
        '<td class="num">' + (p.pairYes == null ? '—' : pct(p.pairYes)) + '</td></tr>';
    });
    h += '</tbody></table>';
    if (icviAll.length) {
      h += '<p class="section-lead">S-CVI/Ave — ' +
        num(icviAll.reduce(function (a, b) { return a + b; }, 0) / icviAll.length) +
        ' (принятый порог 0.90).</p>';
    }

    // «Лишнее» и несогласие с границами модели
    var extraKeys = Object.keys(R.extraVotes).sort(function (a, b) { return R.extraVotes[b] - R.extraVotes[a]; });
    if (extraKeys.length) {
      h += '<h3>Названо лишним</h3><ul class="xr-list">';
      extraKeys.forEach(function (k) {
        h += '<li>' + esc(ABILITY_BY_CODE[k].name) + ' — ' + R.extraVotes[k] + ' из ' + R.N + '</li>';
      });
      h += '</ul>';
    }
    if (R.metaDis.length || R.toolsDis.length) {
      h += '<h3>Несогласие с границами модели</h3><ul class="xr-list">';
      R.metaDis.forEach(function (d) {
        h += '<li><b>метанавыки надо оценивать</b> — ' + esc(who(d.who)) +
          (d.text ? ': ' + esc(d.text) : '') + '</li>';
      });
      R.toolsDis.forEach(function (d) {
        h += '<li><b>инструменты надо оценивать</b> — ' + esc(who(d.who)) +
          (d.text ? ': ' + esc(d.text) : '') + '</li>';
      });
      h += '</ul>';
    }

    // --- В-0 против В-1
    h += '<h2>Своими словами — до карты и после</h2>' +
      '<p class="section-lead">Слева — что эксперт назвал ДО того, как увидел модель; ' +
      'справа — чего, по его мнению, не хватило ПОСЛЕ. Совпадение здесь не считается ' +
      'машиной: разложить эти формулировки по нашим десяти способностям — ручная работа, ' +
      'и именно она отвечает на вопрос о полноте. Пункт, который назвали трое и который ' +
      'никуда не ложится, — дыра в карте.</p>' +
      '<table class="xr-table"><thead><tr><th>эксперт</th><th>до карты</th>' +
      '<th>не хватило после</th></tr></thead><tbody>';
    R.freeLists.forEach(function (f) {
      var after = R.missing.filter(function (x) { return who(x.who) === who(f.who); });
      h += '<tr><td>' + esc(who(f.who)) + '</td><td>' +
        (f.items.length ? f.items.map(esc).join('<br>') : '<span class="xr-dim">—</span>') + '</td><td>' +
        (after.length ? after.map(function (x) { return esc(x.text); }).join('<br>') : '<span class="xr-dim">—</span>') +
        '</td></tr>';
    });
    h += '</tbody></table>';

    // --- заметки
    var notes = [];
    R.perCard.forEach(function (p) {
      p.notes.forEach(function (n) {
        notes.push({ where: ABILITY_BY_CODE[p.card.ability].name + ' · уровень ' + p.card.level, n: n });
      });
    });
    R.perAbility.forEach(function (p) {
      p.notes.forEach(function (n) { notes.push({ where: p.ability.name + ' · порядок', n: n }); });
    });
    R.mapStats.forEach(function (p) {
      p.pairNotes.forEach(function (n) { notes.push({ where: p.skill.name + ' · пара неполна', n: n }); });
    });
    h += '<h2>Что писали эксперты своими словами</h2>';
    if (!notes.length) h += '<p class="section-lead">Заметок нет.</p>';
    notes.forEach(function (x) {
      h += '<p class="xr-quote"><b>' + esc(x.where) + '</b> · ' + esc(who(x.n.who)) + '<br>' +
        esc(x.n.text) + '</p>';
    });

    host.innerHTML = h + '</div>';
  }

  // ------------------------------------------------------------- загрузка

  function absorb(list) {
    list.forEach(function (e) {
      if (!e || !e.id) return;
      // Один эксперт — одна строка: повторная загрузка того же файла не должна
      // удваивать его голос и тянуть psa к своему ответу.
      var i = experts.findIndex(function (x) { return x.id === e.id; });
      if (i >= 0) experts[i] = e; else experts.push(e);
    });
    $('rCount').textContent = experts.length ? experts.length + ' загружено' : '';
    render();
  }

  function readFiles(files) {
    var left = files.length, got = [];
    if (!left) return;
    Array.prototype.forEach.call(files, function (f) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var j = JSON.parse(fr.result);
          (Array.isArray(j) ? j : [j]).forEach(function (x) { got.push(x); });
        } catch (e) {
          $('rErr').textContent = 'Не разобрался: ' + f.name;
          $('rErr').style.display = '';
        }
        if (--left === 0) absorb(got);
      };
      fr.readAsText(f);
    });
  }

  function boot(corpus) {
    indexCorpus(corpus);
    document.getElementById('rGate').style.display = 'none';
    document.getElementById('rBody').style.display = '';

    $('rFiles').addEventListener('change', function () { readFiles(this.files); });

    var drop = $('rDrop');
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) { readFiles(e.dataTransfer.files); });

    // Ответы, оставшиеся в этом браузере, — путь для прогона на себе, пока
    // бэкенд не отвечает. Своих ответов может не быть; это не ошибка.
    $('rLocal').addEventListener('click', function () {
      var got = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('imp_expert_') === 0 && k !== 'imp_expert_last') {
          try { got.push(JSON.parse(localStorage.getItem(k))); } catch (e) {}
        }
      }
      absorb(got);
    });

    // Бэкенд — тем же паролем, что кабинет: пароль уходит на сервер, и ответы
    // приходят, только если он принят. Клиентская проверка тут была бы
    // театром — файл всё равно отдаётся статикой целиком.
    $('rPull').addEventListener('click', function () {
      var pw = ($('rPass').value || '').trim();
      if (!pw || !window.imp || !window.imp.listExperts) return;
      var btn = $('rPull');
      btn.disabled = true; btn.textContent = 'Читаю…';
      window.imp.listExperts(pw, C.version).then(function (res) {
        btn.disabled = false; btn.textContent = 'Забрать с сервера';
        if (!res || !res.ok || !res.experts) {
          $('rErr').textContent = res && res.error ? res.error : 'Сервер не ответил или пароль не принят.';
          $('rErr').style.display = '';
          return;
        }
        $('rErr').style.display = 'none';
        absorb(res.experts);
      });
    });

    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.imp.expertLock($('rGate'), {
      title: 'Сводка валидации',
      lead: 'Тот же пароль, что у экспертов: им зашифрованы описания, а без них ' +
        'сводка не знает, какой ответ верный.',
      onOpen: boot
    });
  });
})();

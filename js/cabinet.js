// i(m)perfect — кабинет фасилитатора. ЕДИНСТВЕННЫЙ.
//
// facilitator.html (кабинет v1, 1861 строка на станционных листах Round1…Round5)
// удалён с платформы 10.08. До этого экранов было два, и функции фасилитатора между
// ними разорваны: администрация — волны, выдача номеров, пароли, сброс — жила только
// в v1, а живой день только здесь. Хуже того, ручную правку оценки читал только v1,
// и два экрана говорили про одного человека разное. Станционные листы остались в
// таблице, файлы — в истории git; если прежние потоки понадобятся, смотреть их там.
//
// Что здесь есть: список с ходом по двенадцати шагам маршрута v4.4.f, колонкой
// «Сейчас» словами и колонкой «Нужен человек» с причиной, карточка из четырёх
// блоков (ответы · оценка · флаги · процесс), кнопки «оценить» и «пересудить».
// Чего здесь нет: признака, кто отвечал, доступного судье, — принадлежность
// прогона видна из волны и живёт только тут.
//
// Правка 10.08: до неё кабинет спрашивал у бэкенда ход по q1…q8 — окнам ПРЕЖНЕГО
// маршрута, в которые нынешний фронт не пишет ничего. Двенадцать точек были пусты
// у каждого участника, семь верстаков (основной измеряемый материал) не показывались
// вовсе, а готовый factsHtml ждал форму, которая никогда не приезжала. Теперь
// названия и порядок шагов приходят из scenes.js, вид верстаков — из mechanics.js,
// а doV2List/doV2Detail отдают шаги, верстаки и факты разбора.

(function () {
  var PW_KEY = 'imp_cabinet_pw';
  var ABILITY_NAMES = {
    ak1: 'АК-1 · широта охвата среды', ak2: 'АК-2 · глубина взаимосвязей',
    pr1: 'ПР-1 · выделение важного', pr2: 'ПР-2 · обоснование выбора',
    mk1: 'МК-1 · горизонт', mk2: 'МК-2 · развилки будущего',
    pp1: 'ПП-1 · декомпозиция пути', pp2: 'ПП-2 · барьеры и ресурсы',
    ga1: 'ГА-1 · генерация альтернатив', ga2: 'ГА-2 · источники идей'
  };
  var SKILL_NAMES = { ak: 'АК', pr: 'ПР', mk: 'МК', pp: 'ПП', ga: 'ГА' };
  // Человеческим языком: на какой границе участник остановился. Без этого уровень
  // — просто число, и перечитывать ответ незачем.
  var BOUNDARY_NAMES = {
    '1to2': 'граница 1→2', '2to3': 'граница 2→3', '3to4': 'граница 3→4', '4to5': 'граница 4→5'
  };

  // ── МАРШРУТ ДНЯ: ОДИН ИСТОЧНИК ───────────────────────────────────────────────
  // Порядок и названия двенадцати шагов кабинет читает из scenes.js (S.windows())
  // и реестра механик (window.imp.mechTitles) — тех же файлов, что рисуют день
  // участнику. Своего списка здесь НЕТ и быть не может: он стал бы вторым, и
  // расхождение с маршрутом мы бы увидели не проверкой, а глазами на разборе.
  // До 10.08 кабинет рисовал двенадцать безымянных точек по числу заполненных
  // окон q1…q8 — окон ПРЕЖНЕГО маршрута, в которые нынешний фронт не пишет
  // ничего. Точек было двенадцать пустых у каждого, независимо от того, где человек.
  var STEPS = (function () {
    var S = window.imp.scenes;
    if (!S || !S.windows) return [];
    var T = window.imp.mechTitles || {};
    return S.windows().map(function (w) {
      return { key: w.save, mech: w.mech, conditional: w.conditional,
               label: w.mech ? (T[w.mech] || w.mech) : (w.label || w.save),
               scene: (w.scene && w.scene.name) ? w.scene.name : '' };
    });
  })();

  function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
  // Бэкенд отдаёт поток как «020 · Тест по ссылке»: номер до разделителя.
  function waveNumOf(w) { return String(w || '').split(' · ')[0]; }
  function num(n) { return String(Math.round(Number(n) * 10) / 10).replace('.', ','); }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  // Спрашивали ли условный шаг. Правило ровно то же, что у движка в applies():
  // перебор — если разбор не уложился в рамку года; Северова — если «Миру»
  // отложена или отклонена. Считаем по фактам верстака, которые отдаёт бэкенд, и
  // по window.imp.severovaId — тому же значению, по которому ветвится день.
  // Возвращает null, когда судить не о чем: верстак ещё не заполнен.
  function conditionalAsked(key, lf) {
    if (!lf) return null;
    if (key === 'overspend') return lf.fitsFrame === false;
    if (key === 'severova') {
      var id = window.imp.severovaId;
      return (lf.deferred || []).some(function (x) { return String(x) === String(id); });
    }
    return true;
  }

  // Состояние шага. Четыре, и «не спрашивали» отличается от «не дошёл» намеренно:
  // условный шаг, который не сработал, читался бы как пропуск, и фасилитатор шёл
  // бы искать несуществующую проблему.
  function stepState(step, at, lf) {
    if (at && at[step.key] !== undefined) return { state: 'done', at: at[step.key] };
    if (step.conditional) {
      var asked = conditionalAsked(step.key, lf);
      if (asked === false) return { state: 'skipped', at: '' };
      if (asked === null) return { state: 'wait', at: '' };
    }
    return { state: 'wait', at: '' };
  }

  var STATE_WORDS = { done: 'зафиксирован', skipped: 'не спрашивали', wait: 'не дошёл' };

  var pw = '';
  var rows = [];
  var roster = [];
  var waves = [];
  var gate = document.getElementById('cabGate');
  var content = document.getElementById('cabContent');
  var listHost = document.getElementById('cabList');
  var detail = document.getElementById('cabDetail');
  var detailBody = document.getElementById('cabDetailBody');
  var statusEl = document.getElementById('cabStatus');
  var filterEl = document.getElementById('cabOnlyNeed');
  var filterCount = document.getElementById('cabNeedCount');

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function br(s) { return esc(s).replace(/\n/g, '<br />'); }
  function bib6(b) { return '№ ' + String(b).replace(/\D/g, '').padStart(6, '0'); }
  function dt(iso) {
    if (!iso) return '';
    try { var d = new Date(iso); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' +
      ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); } catch (e) { return String(iso); }
  }
  function say(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'cab-status' + (kind ? ' is-' + kind : '');
  }

  // ---------- вход ----------

  function login() {
    var val = (document.getElementById('cabPass').value || '').trim();
    if (!val) return;
    var btn = document.getElementById('cabPassBtn');
    btn.disabled = true; btn.textContent = 'Проверяю…';
    window.imp.callApi('v2List', { password: val }).then(function (res) {
      btn.disabled = false; btn.textContent = 'Войти →';
      if (!res || !res.ok) {
        document.getElementById('cabPassErr').style.display = '';
        return;
      }
      pw = val;
      try { sessionStorage.setItem(PW_KEY, val); } catch (e) {}
      gate.style.display = 'none';
      content.style.display = '';
      absorb(res);
    });
  }

  // Один ответ v2List кормит все три вида: день, волны, ростер. Второго запроса
  // нет — иначе экраны показывали бы состояние на разные моменты.
  function absorb(res) {
    rows = res.participants || [];
    roster = res.roster || [];
    waves = res.waves || [];
    render();
    renderWaves();
    renderRoster();
  }

  function refresh() {
    if (!pw) return Promise.resolve();
    say('обновляю…');
    return window.imp.callApi('v2List', { password: pw }).then(function (res) {
      if (res && res.ok) { absorb(res); say(''); }
      else say('не удалось обновить список', 'bad');
    });
  }

  // ---------- список ----------

  function skillsCell(p) {
    if (!p.skills) return '<span class="cab-dim">—</span>';
    return Object.keys(SKILL_NAMES).map(function (k) {
      var v = p.skills[k];
      return '<span class="cab-skill" title="' + SKILL_NAMES[k] + ' — сумма двух способностей, от 2 до 10">' +
        SKILL_NAMES[k] + '<b>' + (v === null || v === undefined ? '—' : v) + '</b></span>';
    }).join('');
  }

  function totalCell(p) {
    if (p.noScore) return '<span class="cab-dim" title="Помечен «не оценивать»">не оценивается</span>';
    if (p.queue && (p.queue.queued || p.queue.running)) {
      return '<span class="cab-dim">оценивается (' + p.queue.done + '/' + p.queue.total + ')</span>';
    }
    if (p.total === null || p.total === undefined) {
      return '<span class="cab-dim">' + (p.judged ? '… (' + p.judged + '/10)' : '—') + '</span>';
    }
    // Итог показываем только когда оценены все десять — иначе это не балл.
    // Флажок ⚑ убран: о флагах словом говорит колонка «Нужен человек», а два
    // языка для одного и того же заставляли сверять значок с колонкой.
    return '<b class="cab-total">' + p.total + '</b><span class="cab-dim"> / 50</span>' +
      (p.stale ? ' <span class="cab-stale" title="Оценка вынесена по другому тексту ответа">устарело</span>' : '') +
      // Правка человека — не повод для внимания, а его след: в колонку «Нужен
      // человек» она не идёт, иначе фильтр показывал бы уже решённое.
      (p.overridden ? ' <span class="cab-ovmark" title="Уровней поставлено вами: ' + p.overridden +
        '">правил человек</span>' : '');
  }

  // Ход: клетка на шаг, по маршруту. Двенадцать шагов, из них два условных — у
  // участника, которого не спросили про перебор и про Северову, клеток честно
  // десять, а не «двух не хватает». Название и время — в подсказке клетки, словами
  // — в колонке «Сейчас»: полоска показывает форму дня, слова говорят, где человек.
  function progressCell(p) {
    if (!STEPS.length) return '<span class="cab-dim">маршрут не загружен</span>';
    // Историческая строка: шагов нынешнего маршрута у неё нет ни одного, и полоска
    // из двенадцати пустых клеток врала бы — читалась бы как «человек не начинал».
    if (!p.answered && p.legacyAnswered) {
      return '<span class="cab-dim" title="Прогон прежнего маршрута: шагов v4.4.f в строке нет">не тот маршрут</span>';
    }
    var at = p.stepsAt || {};
    var out = STEPS.map(function (s) {
      var st = stepState(s, at, p.listFacts);
      var tip = cap(s.label) + ' · ' + STATE_WORDS[st.state] + (st.at ? ' ' + dt(st.at) : '');
      return '<span class="cab-step is-' + st.state + '" title="' + esc(tip) + '"></span>';
    }).join('');
    if (p.finished) out += ' <span class="cab-fin" title="День закончен">✓</span>';
    return out;
  }

  // «Сейчас» словами: что зафиксировано последним и что следующее. Без этого
  // полоска требует навести курсор на каждую клетку, чтобы понять одну вещь —
  // где человек стоит.
  function nowCell(p) {
    if (!p.answered && p.legacyAnswered) {
      return '<span class="cab-dim">прежний маршрут · ' + p.legacyAnswered + ' из 8</span>';
    }
    var at = p.stepsAt || {}, lastDone = null, next = null;
    STEPS.forEach(function (s) {
      var st = stepState(s, at, p.listFacts);
      if (st.state === 'done') lastDone = s;
      else if (!next && st.state === 'wait') next = s;
    });
    if (p.finished) return '<b>день закончен</b>';
    if (!lastDone) return '<span class="cab-dim">не начинал</span>';
    return esc(cap(lastDone.label)) +
      (next ? ' <span class="cab-dim">→ ' + esc(next.label) + '</span>' : '');
  }

  // ── НУЖЕН ЧЕЛОВЕК ────────────────────────────────────────────────────────────
  // Причины, по которым строку нельзя оставить машине. Каждая считается по данным,
  // а не по чутью, и называется словами, а не значком: значок ⚑ сообщал, что
  // что-то есть, но не что именно, и открывать карточку приходилось у всех подряд.
  function attention(p) {
    // Помечен «не оценивать» — вопрос закрыт решением, а не ждёт решения.
    if (p.noScore) return [];
    var out = [];
    var hasWork = !!(p.answered || p.legacyAnswered);
    var busy = !!(p.queue && (p.queue.queued || p.queue.running));
    var versionsApart = !!(p.scenesVersion && p.expectScenes && p.scenesVersion !== p.expectScenes);
    if (hasWork && versionsApart) {
      out.push({ code: 'версии', text: 'судейство закрыто: сцены ' + p.scenesVersion +
        ' против судейских ' + p.expectScenes });
    }
    if (p.stale) out.push({ code: 'устарело', text: 'оценка по другому тексту: ответы менялись после суда' });
    if (p.queue && p.queue.error) out.push({ code: 'очередь', text: 'заданий с ошибкой: ' + p.queue.error });
    if (p.flags) {
      out.push({ code: 'флаги', text: p.flags + ' ' + plural(p.flags, 'флаг', 'флага', 'флагов') + ' — перечитать ответ' });
    }
    if (p.listFacts && p.listFacts.fitsFrame === false) {
      out.push({ code: 'рамка', text: 'разбор вышел за рамку года' });
    }
    if (p.finished && !busy && !versionsApart && (p.total === null || p.total === undefined)) {
      out.push({ code: 'не оценён', text: 'день закончен, оценки нет' });
    }
    return out;
  }

  function attentionCell(p) {
    var a = attention(p);
    if (!a.length) return '<span class="cab-dim">—</span>';
    return a.map(function (x) {
      return '<span class="cab-need" title="' + esc(x.text) + '">' + esc(x.code) + '</span>';
    }).join(' ');
  }

  function render(participants) {
    if (participants) rows = participants;
    document.getElementById('cabCount').textContent = rows.length + ' в листе Answers';
    if (!rows.length) {
      listHost.innerHTML = '<p class="section-lead">Пока никто не проходил день на новой платформе. Как только появится первая строка в листе Answers, она будет здесь.</p>';
      return;
    }
    // Фильтр не выбрасывает строки из rows: карточка открывается по индексу в
    // полном списке, и пересчёт индексов при каждом переключении был бы ровно тем
    // местом, где кабинет однажды покажет чужую карточку.
    var onlyNeed = !!(filterEl && filterEl.checked);
    // Прежние прогоны и номера архивных волн по умолчанию не показываем: это
    // история, а кабинет открывают, чтобы увидеть идущий день. Скрытое считаем и
    // называем — молча пропасть строки не должны.
    var oldEl = document.getElementById('cabShowOld');
    var withOld = !!(oldEl && oldEl.checked);
    var isOld = function (p) { return !!p.waveArchived || (!p.answered && !!p.legacyAnswered); };
    var hiddenOld = withOld ? 0 : rows.filter(isOld).length;
    var shown = 0;
    var html = '<table class="cab-table"><thead><tr>' +
      '<th>Номер</th><th>ФИО</th><th>Поток</th><th>Ход</th><th>Сейчас</th>' +
      '<th>Нужен человек</th><th>Навыки</th><th>Итог</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (p, i) {
      if (!withOld && isOld(p)) return;
      if (onlyNeed && !attention(p).length) return;
      shown++;
      html += '<tr data-ix="' + i + '"' + (p.isAi ? ' class="cab-row-ai"' : '') + (p.noScore ? ' style="opacity:.5"' : '') + '>' +
        // Значок ⚙ убран: он сообщал, что с этим номером что-то не так, но не что
        // именно, — та же беда, что была у флажка ⚑ в «Итоге». Слово вместо значка.
        '<td>' + esc(bib6(p.bib)) +
          (p.isRunner ? ' <span class="cab-tag" title="День прошёл харнесс модели, а не человек: в строке заполнен runnerJson">модель</span>' : '') + '</td>' +
        '<td>' + (esc(p.fio) || '<span class="cab-dim">—</span>') + '</td>' +
        // В «Оценке участников» поток — это контекст, а не содержание: показываем
        // номер, полное название держим в подсказке. Целиком оно занимало столько,
        // что «Итог» уезжал за край экрана, а он тут главное.
        '<td class="cab-col-tight"' + (p.wave ? ' title="' + esc(p.wave) + '"' : '') + '>' +
          (esc(waveNumOf(p.wave)) || '<span class="cab-dim">—</span>') +
          (p.isAi ? ' <span class="cab-ai">ИИ</span>' : '') + '</td>' +
        '<td class="cab-progress">' + progressCell(p) + '</td>' +
        '<td>' + nowCell(p) + '</td>' +
        '<td>' + attentionCell(p) + '</td>' +
        '<td>' + skillsCell(p) + '</td>' +
        '<td>' + totalCell(p) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    if (!shown) {
      html += '<p class="cab-dim">' + (onlyNeed
        ? 'Ни одной строки, которая ждёт человека.'
        : 'Показывать нечего: все строки — прежние прогоны.') + '</p>';
    }
    if (hiddenOld) {
      html += '<p class="cab-dim">Скрыто прежних прогонов: ' + hiddenOld +
        '. Это история прошлых потоков и архивных волн.</p>';
    }
    if (filterCount) {
      var need = rows.filter(function (p) { return attention(p).length; }).length;
      filterCount.textContent = need ? String(need) : '0';
    }
    listHost.innerHTML = html;
    listHost.querySelectorAll('tr[data-ix]').forEach(function (tr) {
      tr.tabIndex = 0;
      tr.addEventListener('click', function () { openCard(rows[Number(tr.getAttribute('data-ix'))]); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(rows[Number(tr.getAttribute('data-ix'))]); }
      });
    });
  }

  // ── РОСТЕР, ВОЛНЫ, ПАРОЛИ ────────────────────────────────────────────────────
  // Переехали из facilitator.html (кабинет v1). Держать их там было ловушкой: тот
  // экран показывает ход по станционным листам прежнего маршрута, поэтому человек,
  // проходящий день сейчас, виден в ростере с пустым ходом — и это читается как
  // «ничего не делает». Данные администрации при этом живые: лист Registrations
  // один и тот же. Поэтому переносим сюда, а v1 остаётся смотрелкой прежних прогонов.

  function call(action, extra) {
    var p = { password: pw };
    Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
    return window.imp.callApi(action, p);
  }

  // Ответ действия: либо ok, либо ошибка словами. Молчаливый провал в кабинете
  // страшнее шумного: фасилитатор решит, что сделано, и пойдёт дальше.
  function after(res, okMsg) {
    if (res && res.ok) { say(okMsg || 'готово'); return refresh(); }
    var msg = res && (res.message || res.error) ? String(res.message || res.error) : 'не получилось';
    return window.imp.alert('Не вышло: ' + msg).then(function () {});
  }

  // ── ВОЛНЫ ────────────────────────────────────────────────────────────────────
  // Волна — единица дня, а не строка справочника. Поэтому в её строке стоит всё,
  // что с ней делают: сколько номеров выдано и докуда дошли люди, выдача новых
  // номеров, ссылка самозаписи, уход в архив. Прежде выдача жила отдельной формой
  // с выпадающим списком волн — волну приходилось выбирать второй раз и вслепую,
  // глядя не на ту таблицу, в которой только что смотрел числа.
  //
  // Поля правятся без кнопки «Сохранить»: значение уезжает по уходу из поля, если
  // оно изменилось. Кнопка на каждую строку делала ряд действий рваным — у одних
  // строк её было четыре, у других три, и колонка действий не выравнивалась ни по
  // одной границе.
  function showArchived() {
    var el = document.getElementById('cabShowArchived');
    return !!(el && el.checked);
  }

  function bibKey(b) { return String(parseInt(String(b).replace(/\D/g, ''), 10) || 0); }

  // Сколько людей в волне и докуда дошли. Считаем по ростеру и листу Answers:
  // выдано — сколько номеров, начали — у кого есть работа, закончили — кто закрыл день.
  function waveStats(w) {
    var mine = {}, issued = 0, started = 0, finished = 0;
    roster.forEach(function (r) {
      if (String(r.waveId) !== String(w.id)) return;
      issued++; mine[bibKey(r.bib)] = true;
      if (r.started) started++;
    });
    rows.forEach(function (p) { if (mine[bibKey(p.bib)] && p.finished) finished++; });
    return { issued: issued, started: started, finished: finished };
  }

  function selfEnrollLink(num) {
    try { return new URL('index.html?w=' + encodeURIComponent(num), location.href).href; }
    catch (e) { return 'index.html?w=' + num; }
  }

  // Копирование с отходным путём: на file:// и без защищённого протокола
  // navigator.clipboard недоступен, и молчаливый отказ выглядел бы как «нажал и
  // ничего». Тогда показываем текст, чтобы его можно было выделить руками.
  function copyText(text, okMsg) {
    var done = function () { say(okMsg || 'скопировано'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(done, function () {
        window.imp.alert('Скопировать не дал браузер. Вот текст:\n\n' + text);
      });
    }
    window.imp.alert('Скопировать не дал браузер. Вот текст:\n\n' + text);
    return Promise.resolve();
  }

  // Правка поля по уходу из него. Пустое значение и значение без изменений на
  // сервер не уезжают: лишний вызов на каждый случайный клик — это тоже правка.
  function onCommit(input, was, fn) {
    var send = function () {
      var val = input.value.trim();
      if (val === String(was == null ? '' : was).trim()) return;
      fn(val);
    };
    input.addEventListener('blur', send);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });
  }

  function renderWaves() {
    var host = document.getElementById('cabWaves');
    if (!host) return;
    if (!waves.length) {
      host.innerHTML = '<p class="cab-empty">Ни одной волны. Волна — это один день с одной группой: ' +
        'номер волны становится первыми тремя цифрами номеров участников. Добавьте волну ниже, ' +
        'потом выдайте в неё номера.</p>';
      return;
    }
    var vis = waves.filter(function (w) { return showArchived() || !w.archived; });
    var hidden = waves.length - vis.length;
    if (!vis.length) {
      host.innerHTML = '<p class="cab-empty">Все волны в архиве. Поставьте отметку «показать архивные», чтобы увидеть их.</p>';
      return;
    }
    host.innerHTML = '<table class="cab-table cab-table-tight cab-waves">' +
      '<thead><tr>' +
        '<th class="cab-col-num">Номер</th><th>Название</th>' +
        '<th class="cab-col-tight">Прогон ИИ</th>' +
        '<th class="cab-col-tight">Люди</th>' +
        '<th class="cab-col-tight">Вход по ссылке</th>' +
        '<th class="cab-col-acts">Действия</th>' +
      '</tr></thead><tbody>' +
      vis.map(function (w, i) {
        var s = waveStats(w);
        return '<tr data-wix="' + i + '"' + (w.archived ? ' class="is-archived"' : '') + '>' +
          '<td class="cab-col-num"><input type="text" class="cab-inp cab-inp-num cab-w-num" maxlength="3" value="' + esc(w.num) + '" aria-label="Номер волны" /></td>' +
          '<td><input type="text" class="cab-inp cab-inp-wide cab-w-name" value="' + esc(w.name) + '" placeholder="без названия" aria-label="Название волны" />' +
            (w.archived ? ' <span class="cab-tag">в архиве</span>' : '') + '</td>' +
          '<td class="cab-col-tight cab-center"><input type="checkbox" class="cab-w-ai"' + (w.isAi ? ' checked' : '') + ' aria-label="Прогон модели" /></td>' +
          '<td class="cab-col-tight cab-nums">' +
            (s.issued
              ? '<b>' + s.issued + '</b> выдано<br /><span class="cab-dim">' + s.started + ' начали · ' + s.finished + ' закончили</span>'
              : '<span class="cab-dim">никого</span>') +
          '</td>' +
          '<td class="cab-col-tight">' +
            '<label class="cab-inline-check"><input type="checkbox" class="cab-w-se"' + (w.selfEnroll ? ' checked' : '') + ' />' +
              (w.selfEnroll ? 'открыт' : 'закрыт') + '</label>' +
            (w.selfEnroll && w.num ? ' <button type="button" class="btn btn-ghost btn-xs cab-w-link">Ссылка</button>' : '') +
          '</td>' +
          '<td class="cab-col-acts">' +
            '<span class="cab-issue">' +
              '<input type="number" class="cab-inp cab-inp-num cab-w-count" min="1" max="300" value="1" aria-label="Сколько номеров выдать" />' +
              '<button type="button" class="btn btn-ghost btn-xs cab-w-issue"' + (w.archived ? ' disabled' : '') + '>Выдать</button>' +
            '</span>' +
            '<button type="button" class="btn btn-ghost btn-xs cab-w-arch">' + (w.archived ? 'Из архива' : 'В архив') + '</button>' +
            '<button type="button" class="btn btn-ghost btn-xs cab-w-del">Удалить</button>' +
          '</td></tr>';
      }).join('') + '</tbody></table>' +
      (hidden ? '<p class="cab-dim">Скрыто в архиве: ' + hidden + '</p>' : '');

    host.querySelectorAll('tr[data-wix]').forEach(function (tr) {
      var w = vis[Number(tr.getAttribute('data-wix'))];
      var q = function (c) { return tr.querySelector(c); };

      onCommit(q('.cab-w-num'), w.num, function (val) {
        if (!/^\d{3}$/.test(val)) { window.imp.alert('Номер волны — ровно три цифры, например 021.'); return; }
        call('setWaveMeta', { id: w.id, num: val }).then(function (r) { return after(r, 'номер волны сохранён'); });
      });
      onCommit(q('.cab-w-name'), w.name, function (val) {
        call('setWaveMeta', { id: w.id, name: val }).then(function (r) { return after(r, 'название сохранено'); });
      });
      q('.cab-w-ai').addEventListener('change', function () {
        call('setWaveMeta', { id: w.id, isAi: this.checked ? '1' : '' })
          .then(function (r) { return after(r, 'отметка сохранена'); });
      });
      q('.cab-w-se').addEventListener('change', function () {
        var on = this.checked;
        call('setWaveMeta', { id: w.id, selfEnroll: on ? '1' : '' })
          .then(function (r) { return after(r, on ? 'вход по ссылке открыт' : 'вход по ссылке закрыт'); });
      });
      if (q('.cab-w-link')) {
        q('.cab-w-link').addEventListener('click', function () {
          copyText(selfEnrollLink(w.num), 'ссылка на волну ' + w.num + ' скопирована');
        });
      }
      q('.cab-w-issue').addEventListener('click', function () {
        var count = Number(q('.cab-w-count').value);
        if (!(count > 0 && count <= 300)) { window.imp.alert('Количество — от 1 до 300.'); return; }
        issue(w, count);
      });
      q('.cab-w-arch').addEventListener('click', function () {
        call('setWaveMeta', { id: w.id, archived: w.archived ? '' : '1' })
          .then(function (r) { return after(r, w.archived ? 'волна вернулась из архива' : 'волна убрана в архив'); });
      });
      q('.cab-w-del').addEventListener('click', function () {
        var s = waveStats(w);
        window.imp.confirm('Удалить волну ' + (w.num || w.id) + '?' +
          (s.issued ? ' Выданные в ней номера (' + s.issued + ') останутся в ростере без волны.' : ''),
          { confirmLabel: 'Удалить', danger: true }).then(function (yes) {
            if (yes) call('removeWave', { id: w.id }).then(function (r) { return after(r, 'волна удалена'); });
          });
      });
    });
  }

  // Выдача номеров прямо из строки волны. Выданное показываем сразу и списком:
  // это единственный момент, когда номер и пароль нужны вместе, чтобы их раздать.
  function issue(w, count) {
    var out = document.getElementById('cabIssueOut');
    say('выдаю…');
    call('createParticipants', { wave: w.id, count: count }).then(function (r) {
      if (!r || !r.ok) return after(r);
      var made = r.created || [];
      var text = made.map(function (c) { return c.bib + '\t' + c.password; }).join('\n');
      out.innerHTML = '<div class="cab-issued">' +
        '<div class="cab-issued-head"><b>Выдано в волну ' + esc(w.num || w.id) + ': ' + made.length + '</b>' +
          '<button type="button" class="btn btn-ghost btn-xs" id="cabIssuedCopy">Скопировать</button></div>' +
        '<table class="cab-table cab-table-tight"><thead><tr><th>Номер</th><th>Пароль</th></tr></thead><tbody>' +
        made.map(function (c) {
          return '<tr><td>' + esc(bib6(c.bib)) + '</td><td class="cab-pw">' + esc(c.password) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      document.getElementById('cabIssuedCopy').addEventListener('click', function () {
        copyText(text, 'номера и пароли скопированы');
      });
      return refresh();
    });
  }

  // ── НОМЕРА И ПАРОЛИ ──────────────────────────────────────────────────────────
  // Список людей, а не список полей. Слово «ростер» из подписи убрано: оно пришло из
  // прежнего экрана и ничего не объясняет тому, кто открыл кабинет впервые. Имена
  // элементов (cabRoster*, renderRoster) оставлены как есть — они не видны глазу, а
  // переименование ради переименования только рвёт историю правок.
  // Что с этим списком делают: находят человека по номеру
  // или имени, отбирают одну волну, раздают номера с паролями, правят имя, гасят
  // «без оценки», сбрасывают день. Ряд действий у всех строк ОДИН И ТОТ ЖЕ: там,
  // где действие невозможно, кнопка выключена, а не убрана — иначе колонка
  // действий скачет от строки к строке.
  function rosterFind() {
    var el = document.getElementById('cabRosterFind');
    return el ? el.value.trim().toLowerCase() : '';
  }

  function rosterWave() {
    var el = document.getElementById('cabRosterWave');
    return el ? el.value : '';
  }

  function fillRosterWaveSelect() {
    var sel = document.getElementById('cabRosterWave');
    if (!sel) return;
    var keep = sel.value;
    var list = waves.filter(function (w) { return showArchived() || !w.archived; });
    sel.innerHTML = '<option value="">все волны</option>' + list.map(function (w) {
      return '<option value="' + esc(w.id) + '">' + esc((w.num || '—') + ' · ' + (w.name || 'без названия')) + '</option>';
    }).join('');
    if (keep) sel.value = keep;
  }

  function rosterVisible() {
    var find = rosterFind(), wave = rosterWave();
    return roster.filter(function (r) {
      if (!showArchived() && r.waveArchived) return false;
      if (wave && String(r.waveId) !== String(wave)) return false;
      if (find) {
        var hay = (String(r.bib) + ' ' + (r.fio || '') + ' ' + (r.firstName || '')).toLowerCase();
        if (hay.indexOf(find) < 0) return false;
      }
      return true;
    });
  }

  function renderRoster() {
    var host = document.getElementById('cabRoster');
    if (!host) return;
    fillRosterWaveSelect();
    if (!roster.length) {
      host.innerHTML = '<p class="cab-empty">Ни одного номера. Номера выдаются в волне: ' +
        'откройте «Волны» и нажмите «Выдать» в её строке.</p>';
      return;
    }
    var vis = rosterVisible();
    var hidden = roster.length - vis.length;
    if (!vis.length) {
      host.innerHTML = '<p class="cab-empty">Под этот отбор никто не подходит. Снимите поиск или выберите другую волну.</p>';
      return;
    }
    var showPw = !!(document.getElementById('cabRosterShowPw') || {}).checked;
    host.innerHTML = '<table class="cab-table cab-table-tight cab-roster">' +
      '<thead><tr>' +
        '<th class="cab-col-num">Номер</th><th>Имя</th><th>Волна</th>' +
        '<th class="cab-col-tight">Пароль</th>' +
        '<th class="cab-col-tight">День</th>' +
        '<th class="cab-col-tight cab-center">Без оценки</th>' +
        '<th class="cab-col-acts">Действия</th>' +
      '</tr></thead><tbody>' +
      vis.map(function (r, i) {
        return '<tr data-rix="' + i + '"' + (r.noScore ? ' class="is-off"' : '') + '>' +
          '<td class="cab-col-num">' + esc(bib6(r.bib)) + '</td>' +
          '<td><input type="text" class="cab-inp cab-inp-wide cab-r-name" value="' + esc(r.firstName) + '" placeholder="без имени" aria-label="Имя участника" /></td>' +
          '<td>' + (esc(r.wave) || '<span class="cab-dim">—</span>') +
            (r.waveArchived ? ' <span class="cab-tag">архив</span>' : '') + '</td>' +
          '<td class="cab-col-tight cab-pw">' + (showPw ? esc(r.password) : '<span class="cab-dim">скрыт</span>') + '</td>' +
          '<td class="cab-col-tight">' + (r.started ? 'начат' : '<span class="cab-dim">не начинал</span>') + '</td>' +
          '<td class="cab-col-tight cab-center"><input type="checkbox" class="cab-r-nos"' + (r.noScore ? ' checked' : '') + ' aria-label="Не оценивать" /></td>' +
          '<td class="cab-col-acts">' +
            '<button type="button" class="btn btn-ghost btn-xs cab-r-pw">Новый пароль</button>' +
            '<button type="button" class="btn btn-ghost btn-xs cab-r-reset"' + (r.started ? '' : ' disabled title="День не начат — сбрасывать нечего"') + '>Сбросить день</button>' +
            '<button type="button" class="btn btn-ghost btn-xs cab-r-del">Удалить</button>' +
          '</td></tr>';
      }).join('') + '</tbody></table>' +
      (hidden ? '<p class="cab-dim">Не попало под отбор: ' + hidden + '</p>' : '');

    host.querySelectorAll('tr[data-rix]').forEach(function (tr) {
      var r = vis[Number(tr.getAttribute('data-rix'))];
      var q = function (c) { return tr.querySelector(c); };
      onCommit(q('.cab-r-name'), r.firstName, function (val) {
        call('setParticipantName', { bib: r.bib, firstName: val })
          .then(function (res) { return after(res, 'имя сохранено'); });
      });
      q('.cab-r-nos').addEventListener('change', function () {
        call('setNoScore', { bib: r.bib, value: this.checked ? '1' : '' })
          .then(function (res) { return after(res, 'отметка сохранена'); });
      });
      q('.cab-r-pw').addEventListener('click', function () {
        window.imp.confirm('Выдать номеру ' + bib6(r.bib) + ' новый пароль? Старый перестанет работать.',
          { confirmLabel: 'Выдать' }).then(function (yes) {
            if (!yes) return;
            call('regeneratePassword', { bib: r.bib }).then(function (res) {
              if (res && res.ok) {
                var pwEl = document.getElementById('cabRosterShowPw');
                if (pwEl) pwEl.checked = true;
                return after(res, 'пароль заменён');
              }
              return after(res);
            });
          });
      });
      q('.cab-r-reset').addEventListener('click', function () {
        if (this.disabled) return;
        window.imp.confirm('Стереть день у ' + bib6(r.bib) + '? Ответы, оценки и ручные правки уровней ' +
          'по этому номеру исчезнут. Отменить это нельзя.',
          { confirmLabel: 'Стереть', danger: true }).then(function (yes) {
            if (yes) call('resetProgress', { bib: r.bib, confirm: 'RESET' })
              .then(function (res) { return after(res, 'день стёрт'); });
          });
      });
      q('.cab-r-del').addEventListener('click', function () {
        window.imp.confirm('Удалить номер ' + bib6(r.bib) + ' вместе с ответами и оценками? Отменить нельзя.',
          { confirmLabel: 'Удалить', danger: true }).then(function (yes) {
            if (yes) call('deleteParticipant', { bib: r.bib })
              .then(function (res) { return after(res, 'номер удалён'); });
          });
      });
    });
  }

  // ---------- карточка ----------

  function block(title, inner, note) {
    return '<section class="cab-block"><h3>' + esc(title) + '</h3>' +
      (note ? '<p class="cab-note">' + esc(note) + '</p>' : '') + inner + '</section>';
  }

  function mechCtx() {
    return { esc: esc, br: br, num: num, blNum: window.imp.backlogNum,
             BACKLOG: window.imp.backlog, LIM: window.imp.backlogLimits, isDemo: false };
  }

  // Читаемый вид верстака — его собственным answerHtml, тем же кодом, что рисует
  // участнику вкладку «мои ответы». Своего уплощателя у кабинета нет: два вида
  // одного ответа однажды разошлись бы, и спорить пришлось бы на разборе.
  // Если форма верстака изменилась после того, как строка была записана, показываем
  // сырой объект, а не пустоту: материал участника важнее опрятности.
  function mechHtml(key, obj) {
    var spec = window.imp.mechanics ? window.imp.mechanics[key] : null;
    if (obj == null) return '<i>не заполнено</i>';
    if (spec && spec.answerHtml) {
      try { return spec.answerHtml(obj, mechCtx()); } catch (e) {}
    }
    return '<pre class="cab-raw">' + esc(JSON.stringify(obj, null, 1)) + '</pre>';
  }

  function answersBlock(d) {
    var el = d.elicited || {};
    var byKey = {};
    (d.windows || []).forEach(function (w) { byKey[w.key] = w; });
    var mech = d.mech || {}, mechAt = d.mechAt || {};
    // Карта «шаг → когда» — та же, что в списке: у верстаков время из mechAt, у
    // окон из самого окна. Ключ присутствует ровно тогда, когда шаг пройден.
    var at = {};
    Object.keys(mech).forEach(function (k) { at[k] = mechAt[k] || ''; });
    (d.windows || []).forEach(function (w) {
      if (!w.legacy && String(w.text || '').trim()) at[w.key] = w.at || '';
    });
    var f = d.facts;
    var lf = f ? { fitsFrame: f.fitsFrame,
                   deferred: (f.later || []).concat(f.never || []).map(function (it) { return it.id; }) } : null;

    var html = STEPS.map(function (s) {
      var st = stepState(s, at, lf);
      var flags = el[s.key] || [];
      var w = byKey[s.key];
      var body;
      if (st.state !== 'done') {
        body = '<div class="cab-answer-text cab-dim">' +
          (st.state === 'skipped' ? 'не спрашивали: условие шага не сработало' : 'не дошёл') +
          '</div>';
      } else if (s.mech) {
        body = '<div class="cab-answer-text">' + mechHtml(s.mech, mech[s.mech]) + '</div>';
      } else {
        body = '<div class="cab-answer-text">' +
          (String((w && w.text) || '').trim() ? br(w.text) : '<i>промолчал</i>') + '</div>';
      }
      return '<div class="cab-answer is-' + st.state + '">' +
        '<div class="cab-answer-head">' +
          '<span class="cab-answer-label">' + esc(cap(s.label)) + '</span>' +
          '<span class="cab-dim">' + esc(s.scene) + (st.at ? ' · ' + dt(st.at) : '') +
            (!s.mech && w && w.len ? ' · ' + w.len + ' знаков' : '') + '</span>' +
        '</div>' +
        (flags.length ? '<div class="cab-elicit" title="О чём спросили прямо — судья получает это машинно">спрошено прямо: ' + esc(flags.join(', ')) + '</div>' : '') +
        body + '</div>';
    }).join('');

    // Окна ПРЕЖНЕГО маршрута — только у исторических строк и только заполненные.
    var legacy = (d.windows || []).filter(function (w) { return w.legacy; });
    if (legacy.length) {
      html += '<p class="cab-note">Ниже — прежний маршрут, ' + legacy.length + ' ' +
        plural(legacy.length, 'окно', 'окна', 'окон') +
        '. Этих окон в дне больше нет: строка записана до перехода на v4.4.f.</p>' +
        legacy.map(function (w) {
          return '<div class="cab-answer is-legacy"><div class="cab-answer-head">' +
            '<span class="cab-answer-label">' + esc(w.label || w.key) + '</span>' +
            '<span class="cab-dim">' + (w.at ? dt(w.at) + ' · ' : '') + w.len + ' знаков</span></div>' +
            '<div class="cab-answer-text">' + (String(w.text).trim() ? br(w.text) : '<i>промолчал</i>') +
            '</div></div>';
        }).join('');
    }

    return block('Ход дня и ответы', html + factsHtml(d.facts) + picksHtml(d.picks),
      'Двенадцать шагов в порядке маршрута. Названия и порядок взяты из scenes.js, вид верстаков собран их собственным кодом — то же самое, что видел участник.');
  }

  // Факты разбора заявок — ровно тем же составом, что уходит судье
  // (v2PortfolioFacts_ в backend/code.js): три решения названиями, ресурс взятого
  // против рамки года, пол ПР-1 по поступку.
  function factsHtml(f) {
    if (!f) return '';
    var lim = f.limits || {};
    var zone = function (title, arr, withCost) {
      return '<p><span class="cab-k">' + title + ' (' + arr.length + '):</span></p>' +
        (arr.length ? '<ul>' + arr.map(function (r) {
          return '<li><span class="bl-num">' + window.imp.backlogNum(r.id) + '</span> ' + esc(r.title) +
            (withCost ? ' <span class="cab-dim">' + r.people + ' чел. · ' + num(r.money) + ' млрд</span>' : '') +
            '</li>';
        }).join('') + '</ul>' : '<p class="cab-dim">ни одной</p>');
    };
    return '<div class="cab-answer"><div class="cab-answer-head">' +
      '<span class="cab-answer-label">Разбор заявок — факты</span>' +
      '<span class="cab-dim">то же, что уходит судье</span></div>' +
      '<div class="cab-answer-text">' +
        '<p><b>' + f.taken.length + '</b> берём · <b>' + f.later.length + '</b> не сейчас · ' +
        '<b>' + f.never.length + '</b> не делаем · ' +
        f.people + ' человек из ' + lim.people + ' · ' + num(f.money) + ' млрд из ' + lim.money +
        (f.fitsFrame === false ? ' — <b>вне рамки года</b>' : ' — в рамке') + '</p>' +
        (f.undecided ? '<p><b>не решено: ' + f.undecided + '</b> — разбор неполный</p>' : '') +
        (f.criteria ? '<p><span class="cab-k">Почему именно так:</span> ' + br(f.criteria) + '</p>' : '') +
        zone('Берём', f.taken, true) + zone('Не сейчас', f.later, false) + zone('Не делаем', f.never, false) +
        (f.floor ? '<p class="cab-dim">Пол ПР-1 по поступку: L' + f.floor.level +
          (f.floor.technical ? ' — состояние, которого гейт верстака не допускает: сбой или демо, а не поведение человека' : '') +
          '. Выше пола поднимает только судья.</p>' : '') +
      '</div></div>';
  }

  // Портфель прежней схемы — только у исторических строк; у прогонов маршрута
  // v4.4.f этого блока нет вовсе (picksJson там пустой).
  function picksHtml(p) {
    if (!p || !p.taken || !p.taken.length) return '';
    var lim = p.limits || {};
    return '<div class="cab-answer"><div class="cab-answer-head"><span class="cab-answer-label">Портфель решений — прежняя схема</span></div>' +
      '<div class="cab-answer-text">' +
        '<p><b>' + (p.taken || []).length + '</b> берём · <b>' + (p.dropped || []).length + '</b> не сейчас · ' +
        p.people + ' человек из ' + lim.people + ' · ' + p.money + ' млрд из ' + lim.money +
        (p.fitsFrame === false ? ' — <b>вне бюджета</b>' : ' — в бюджете') + '</p>' +
        '<p><span class="cab-k">Взято:</span> ' + esc((p.taken || []).join(', ')) + '</p>' +
        '<p><span class="cab-k">Отложено:</span> ' + esc((p.dropped || []).join(', ')) + '</p>' +
      '</div></div>';
  }

  // Блокирующая граница — то, из-за чего уровень не выше. Достаём из вердикта:
  // по четырём булевым видно, где участник остановился.
  function blockingOf(v) {
    if (!v || !v.verdict) return null;
    var j = v.verdict, keys = Object.keys(j);
    var order = ['1to2', '2to3', '3to4', '4to5'];
    for (var i = 0; i < order.length; i++) {
      var hit = keys.filter(function (k) { return k.indexOf('_' + order[i]) > 0 || k === order[i]; })[0];
      if (hit && j[hit] === false) return order[i];
    }
    return null;
  }

  function scoresBlock(d) {
    var s = d.scores;
    if (!s) return block('Оценка', '<p class="section-lead">Ещё не судили. Кнопка «Оценить» ниже поставит восемь заданий в очередь.</p>');
    var inner = '<div class="cab-skills-row">' + Object.keys(SKILL_NAMES).map(function (k) {
      var v = s.skills[k];
      return '<div class="cab-skill-box" title="' + SKILL_NAMES[k] +
        ' — сумма двух способностей, от 2 до 10"><span>' + SKILL_NAMES[k] + '</span><b>' +
        (v === null ? '—' : v) + '</b></div>';
    }).join('') + '<div class="cab-skill-box is-total" title="Сумма всех десяти способностей">' +
      '<span>Итог</span><b>' + (s.total === null ? '—' : s.total) + '</b><i>/50</i></div></div>';

    if (s.total === null) {
      inner += '<p class="cab-note">Итог не показан: оценено ' + s.judged + ' способностей из десяти. Сумма по неполному набору выглядит как балл, но им не является.</p>';
    }
    if (d.stale) {
      inner += '<p class="cab-warn">Оценка вынесена по другому тексту ответа: участник менял ответы после судейства. Цифры ниже устарели — пересудите.</p>';
    }
    // Правка по способности, у которой больше нет второго чтения, перестала
    // применяться. Молча этого не делаем: решение человека называем и объясняем.
    (s.ignoredOverrides || []).forEach(function (o) {
      inner += '<p class="cab-warn">Ваш уровень L' + o.level + ' по ' + (ABILITY_NAMES[o.ability] || o.ability) +
        ' больше не применяется: у этой способности нет второго чтения, а правка задумана как разрешение спора двух судей. ' +
        'В балле стоит уровень судьи.' + (o.reason ? ' Ваша причина была: «' + esc(o.reason) + '».' : '') + '</p>';
    });

    var canOverride = {};
    (d.overrideAbilities || []).forEach(function (a) { canOverride[a] = true; });
    var ovs = s.overrides || {};
    var jl = s.judgeLevels || s.levels;

    inner += '<div class="cab-abilities">' + Object.keys(ABILITY_NAMES).map(function (a) {
      var lv = s.levels[a], v = s.verdicts[a] || {};
      var bnd = blockingOf(v);
      var reasoning = v.verdict && v.verdict.reasoning ? v.verdict.reasoning : '';
      var o = ovs[a];
      var isOv = !!(o && o.overrideLevel !== null && o.overrideLevel !== undefined && o.overrideLevel !== '');
      // Решение человека и мнение судьи стоят рядом, а не вместо друг друга:
      // §8 методологии требует, чтобы расхождение разбирал человек, и оригинал
      // судьи должен остаться видимым, иначе правка перестаёт быть проверяемой.
      var line = isOv
        ? 'уровень поставил человек' + (jl[a] === null || jl[a] === undefined ? '' : ' · судья давал L' + jl[a]) +
          (o.by ? ' · ' + esc(o.by) : '') + (o.at ? ' · ' + dt(o.at) : '')
        : (v.source === 'deterministic' ? 'посчитано кодом (ответа нет)' : 'ИИ-судья') +
          (bnd ? ' · остановился на ' + BOUNDARY_NAMES[bnd] : (lv === 5 ? ' · все границы пройдены' : '')) +
          (v.stable === false ? ' · <b class="cab-jitter">граница дрожит</b>' : '');

      var ctl = '';
      if (canOverride[a]) {
        ctl = '<div class="cab-ov" data-ab="' + a + '">' +
          (isOv
            ? '<button type="button" class="btn btn-ghost btn-xs cab-ov-clear">Вернуть уровень судьи</button>'
            : '<span class="cab-dim">поставить свой:</span> ' +
              [1, 2, 3, 4, 5].map(function (n) {
                return '<button type="button" class="btn btn-ghost btn-xs cab-ov-set" data-lv="' + n + '">L' + n + '</button>';
              }).join(' ') +
              // Причина обязательна: в листе ScoreOverrides для неё есть колонка, и
              // без неё правка через месяц неотличима от опечатки.
              '<input type="text" class="cab-inp cab-ov-reason" placeholder="почему — без этого не поставлю" />') +
          '</div>';
      }

      return '<div class="cab-ability' + (isOv ? ' is-overridden' : '') + '">' +
        '<div class="cab-ability-head"><span class="cab-ability-name">' + esc(ABILITY_NAMES[a]) + '</span>' +
          '<span class="cab-level">' + (lv === null ? '—' : 'L' + lv) + '</span></div>' +
        '<div class="cab-dim">' + line + '</div>' +
        (isOv && o.reason ? '<div class="cab-ov-why">Почему: ' + br(o.reason) + '</div>' : '') +
        (reasoning ? '<details class="cab-reasoning"><summary>обоснование судьи</summary><div>' + br(reasoning) + '</div></details>' : '') +
        ctl + '</div>';
    }).join('') + '</div>';

    var ctl = [];
    if (s.control && s.control.pr2Level !== undefined) {
      ctl.push('<p><span class="cab-k">Контроль ПР-2 по письму правлению:</span> L' + s.control.pr2Level +
        ' (основная — ' + (s.levels.pr2 === null ? '—' : 'L' + s.levels.pr2) + ')' +
        (s.control.reasoning ? '<br /><span class="cab-dim">' + br(s.control.reasoning) + '</span>' : '') + '</p>');
    }
    // Кросс-судей ДВА: ГА-1 по тезисам и АК-2 по письму правлению. Второго здесь не
    // было — его уровень считался и не показывался нигде (правка 11.08). Обоснование
    // читаем из ключа с именем способности, со сносом на старое плоское `reasoning`:
    // прогоны до 11.08 писали его без имени.
    if (s.cross && s.cross.ga1Level !== undefined) {
      var gaWhy = s.cross.ga1Reasoning || s.cross.reasoning || '';
      ctl.push('<p><span class="cab-k">Кросс-судья ГА-1 по ответу на развилку:</span> L' + s.cross.ga1Level +
        ' (основная — ' + (s.levels.ga1 === null ? '—' : 'L' + s.levels.ga1) + ')' +
        (gaWhy ? '<br /><span class="cab-dim">' + br(gaWhy) + '</span>' : '') + '</p>');
    }
    if (s.cross && s.cross.ak2Level !== undefined) {
      ctl.push('<p><span class="cab-k">Кросс-судья АК-2 по письму правлению:</span> L' + s.cross.ak2Level +
        ' (основная — ' + (s.levels.ak2 === null ? '—' : 'L' + s.levels.ak2) + ')' +
        (s.cross.ak2Reasoning ? '<br /><span class="cab-dim">' + br(s.cross.ak2Reasoning) + '</span>' : '') + '</p>');
    }
    if (ctl.length) inner += '<div class="cab-control">' + ctl.join('') + '</div>';

    inner += '<p class="cab-dim">Судья: ' + esc(s.judgeModel || '—') + ' · ' + dt(s.judgedAt) +
      ' · сцены ' + esc(s.scenesVersion) + ' · кейс ' + esc(s.caseVersion) + '</p>';
    return block('Оценка', inner, 'Балл не правится автоматически никогда — ни флагом, ни контролем. Уровень собирается лестницей: непройденная нижняя граница обнуляет всё выше.');
  }

  function flagsBlock(d) {
    var f = (d.scores && d.scores.flags) || [];
    if (!f.length) return block('Флаги', '<p class="section-lead">Ни одного. Зависимости §9 и расхождения с контролем в пределах нормы.</p>');
    return block('Флаги', '<ul class="cab-flags">' + f.map(function (x) {
      return '<li><b>' + esc(x.code) + '</b> — ' + esc(x.text) + '</li>';
    }).join('') + '</ul>', 'Флаг — приглашение перечитать ответ, а не ошибка участника и не поправка к баллу.');
  }

  function processBlock(d) {
    var p = d.process || {};
    var t = p.telemetry && p.telemetry.totals;
    var inner = '<p><span class="cab-k">Маркер ИИ-помощи:</span> ' + (p.aiMarkerLevel ? esc(p.aiMarkerLevel) : 'не выставлен') +
      (p.aiMarkerNote ? ' <span class="cab-dim">' + esc(p.aiMarkerNote) + '</span>' : '') + '</p>';
    if (t) {
      inner += '<p><span class="cab-k">Ввод:</span> ' + t.finalChars + ' знаков, вставлено ' + t.pastedChars +
        ' (макс. вставка ' + t.maxPasteChars + '), нажатий ' + t.keystrokes + ', активно ' +
        Math.round((t.activeMs || 0) / 60000) + ' мин, уходов со вкладки ' + t.tabBlur + '</p>';
    }
    if (p.runner) inner += '<p><span class="cab-k">Прогон модели:</span> ' + esc(JSON.stringify(p.runner)) + '</p>';
    inner += '<p><span class="cab-k">Начал:</span> ' + dt(p.startedAt) + ' · <span class="cab-k">закончил:</span> ' + (dt(p.finishedAt) || '—') + '</p>';
    inner += '<p><span class="cab-k">Версии:</span> сцены ' + esc(d.versions.scenes) + ', кейс ' + esc(d.versions.caseVer) +
      ', портфель ' + esc(d.versions.backlog) +
      (d.versions.scenes !== d.versions.expectScenes || d.versions.caseVer !== d.versions.expectCase
        ? ' <b class="cab-warn-inline">— расходятся с судейскими (' + esc(d.versions.expectScenes) + ' / ' + esc(d.versions.expectCase) + '): судейство откажет</b>'
        : '') + '</p>';
    return block('Процесс', inner, 'Ничто из этого блока в уровень не входит.');
  }

  function openCard(p) {
    detail.style.display = 'flex';
    detail.setAttribute('aria-hidden', 'false');
    detailBody.innerHTML = '<p class="fac-detail-loading">Загружаю карточку…</p>';
    document.getElementById('cabDetailTitle').textContent = bib6(p.bib) + (p.fio ? ' · ' + p.fio : '');
    window.imp.callApi('v2Detail', { password: pw, bib: p.bib }).then(function (d) {
      if (!d || !d.ok) { detailBody.innerHTML = '<p class="fac-detail-loading">Не удалось загрузить карточку.</p>'; return; }
      var q = d.queue || {};
      detailBody.innerHTML =
        '<div class="cab-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" id="cabJudge">' +
            (d.scores ? 'Пересудить всё' : 'Оценить') + '</button>' +
          '<span class="cab-dim" id="cabJudgeState">' +
            (q.queued || q.running ? 'в очереди: ' + (q.queued + q.running) + ' из ' + q.total
              : q.error ? 'заданий с ошибкой: ' + q.error : '') + '</span>' +
        '</div>' +
        // Порядок: сначала что человек сделал, потом что об этом сказано. Код
        // рисовал оценку первой, хотя шапка файла обещает «ответы · оценка · флаги
        // · процесс», и у неоценённого участника карточка открывалась строкой
        // «ещё не судили» — то есть отсутствием вердикта вместо содержания дня.
        answersBlock(d) + scoresBlock(d) + flagsBlock(d) + processBlock(d);
      document.getElementById('cabJudge').addEventListener('click', function () { judge(p.bib, this); });
      wireOverrides(p.bib);
      if (window.imp && window.imp.typoDom) window.imp.typoDom(detailBody);
      detailBody.scrollTop = 0;
    });
  }

  // Решение человека по уровню. Балл судьи не стирается — он лежит в том же листе
  // рядом, и «вернуть уровень судьи» отменяет правку целиком.
  function wireOverrides(bib) {
    detailBody.querySelectorAll('.cab-ov').forEach(function (box) {
      var ability = box.getAttribute('data-ab');
      var reopen = function () { openCard({ bib: bib, fio: '' }); };
      box.querySelectorAll('.cab-ov-set').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var inp = box.querySelector('.cab-ov-reason');
          var reason = inp ? inp.value.trim() : '';
          if (!reason) {
            window.imp.alert('Напишите, почему вы ставите свой уровень: без причины правка через месяц неотличима от опечатки.');
            if (inp) inp.focus();
            return;
          }
          call('setScoreOverride', { bib: bib, ability: ability, level: btn.getAttribute('data-lv'), reason: reason })
            .then(function (r) {
              if (r && r.ok) { say('уровень поставлен вами'); return refresh().then(reopen); }
              return after(r);
            });
        });
      });
      var clr = box.querySelector('.cab-ov-clear');
      if (clr) {
        clr.addEventListener('click', function () {
          window.imp.confirm('Вернуть уровень судьи по этой способности? Ваша правка и причина будут стёрты.',
            { confirmLabel: 'Вернуть' }).then(function (yes) {
              if (!yes) return;
              call('clearScoreOverride', { bib: bib, ability: ability }).then(function (r) {
                if (r && r.ok) { say('вернул уровень судьи'); return refresh().then(reopen); }
                return after(r);
              });
            });
        });
      }
    });
  }

  // Судейство: ставим восемь заданий в очередь и разбираем её вызовами по пять.
  // Триггер по времени в живом деплое недоступен (нет права script.scriptapp),
  // поэтому цикл здесь — не костыль, а рабочий путь: каждый вызов укладывается
  // в шесть минут исполнения Apps Script с запасом.
  function judge(bib, btn) {
    btn.disabled = true;
    var state = document.getElementById('cabJudgeState');
    var step = function (n) {
      state.textContent = 'оцениваю… (заданий обработано: ' + n + ')';
      return window.imp.callApi('runJudgeQueue', { password: pw, max: 3 }).then(function (r) {
        if (!r || !r.ok) { state.textContent = 'сбой очереди — попробуйте ещё раз'; btn.disabled = false; return; }
        var total = n + (r.done || 0);
        if (r.errors && r.errors.length) {
          state.textContent = 'ошибки в заданиях: ' + r.errors.map(function (e) { return e.taskId + ' (' + e.error + ')'; }).join(', ');
        }
        if (r.left > 0) return step(total);
        btn.disabled = false;
        state.textContent = 'готово: ' + total + ' заданий';
        return refresh().then(function () { openCard({ bib: bib, fio: '' }); });
      });
    };
    window.imp.callApi('judgeAnswers', { password: pw, bib: bib }).then(function (res) {
      if (!res || !res.ok) {
        btn.disabled = false;
        var e = res && res.error ? res.error : 'не удалось поставить в очередь';
        state.textContent = e === 'scenes_version_mismatch'
          ? 'версия сцен в ответах не совпадает с судейской — судейство отказано (это защита, а не сбой)'
          : e === 'no_score' ? 'участник помечен «не оценивать»' : String(e);
        return;
      }
      return step(0);
    });
  }

  function closeCard() {
    detail.style.display = 'none';
    detail.setAttribute('aria-hidden', 'true');
  }

  // ---------- запуск ----------

  document.getElementById('cabPassBtn').addEventListener('click', login);
  document.getElementById('cabPass').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); login(); }
  });
  document.getElementById('cabRefresh').addEventListener('click', refresh);
  // Фильтр перерисовывает уже полученный список, не дёргая сервер: решение
  // «показать только ждущих» — про глаза, а не про данные.
  if (filterEl) filterEl.addEventListener('change', function () { render(); });
  var oldEl = document.getElementById('cabShowOld');
  if (oldEl) oldEl.addEventListener('change', function () { render(); });
  var archEl = document.getElementById('cabShowArchived');
  if (archEl) archEl.addEventListener('change', function () { renderWaves(); renderRoster(); });

  // ── вкладки ──
  (function () {
    var tabs = [].slice.call(document.querySelectorAll('.cab-tab[data-view]'));
    var views = { day: 'cabViewDay', waves: 'cabViewWaves', roster: 'cabViewRoster' };
    if (!tabs.length) return;
    var show = function (name) {
      Object.keys(views).forEach(function (k) {
        var el = document.getElementById(views[k]);
        if (el) el.style.display = (k === name) ? '' : 'none';
      });
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-view') === name;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    };
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { show(t.getAttribute('data-view')); });
    });
  })();

  // ── новая волна, пароли, раздача ──
  (function () {
    var add = document.getElementById('cabWaveAdd');
    if (add) add.addEventListener('click', function () {
      var numEl = document.getElementById('cabWaveNum');
      var num = (numEl.value || '').trim();
      if (!/^\d{3}$/.test(num)) {
        window.imp.alert('Номер волны — ровно три цифры, например 021. Он становится первыми тремя цифрами номеров участников.');
        numEl.focus();
        return;
      }
      call('addWave', { num: num, name: (document.getElementById('cabWaveName').value || '').trim(),
                        isAi: document.getElementById('cabWaveAi').checked ? '1' : '' })
        .then(function (r) {
          if (r && r.ok) {
            numEl.value = '';
            document.getElementById('cabWaveName').value = '';
            document.getElementById('cabWaveAi').checked = false;
          }
          return after(r, 'волна добавлена');
        });
    });

    var gen = document.getElementById('cabGenPass');
    if (gen) gen.addEventListener('click', function () {
      call('generatePasswords', {}).then(function (r) {
        if (!r || !r.ok) return after(r);
        return after(r, r.generated ? 'дописано паролей: ' + r.generated : 'все пароли уже на месте');
      });
    });

    // Раздача: номер и пароль по строке на человека, ровно по текущему отбору —
    // то, что видишь на экране, то и уедет в буфер.
    var copy = document.getElementById('cabRosterCopy');
    if (copy) copy.addEventListener('click', function () {
      var vis = rosterVisible();
      if (!vis.length) { window.imp.alert('Копировать нечего: под текущий отбор никто не подходит.'); return; }
      copyText(vis.map(function (r) { return r.bib + '\t' + r.password; }).join('\n'),
        'скопировано строк: ' + vis.length);
    });

    var showPw = document.getElementById('cabRosterShowPw');
    if (showPw) showPw.addEventListener('change', renderRoster);
    var find = document.getElementById('cabRosterFind');
    if (find) find.addEventListener('input', renderRoster);
    var wsel = document.getElementById('cabRosterWave');
    if (wsel) wsel.addEventListener('change', renderRoster);
  })();
  document.getElementById('cabDetailClose').addEventListener('click', closeCard);
  detail.addEventListener('click', function (e) { if (e.target === detail) closeCard(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && detail.style.display !== 'none') closeCard();
  });

  (function auto() {
    var saved = '';
    try { saved = sessionStorage.getItem(PW_KEY) || ''; } catch (e) {}
    if (!saved) return;
    document.getElementById('cabPass').value = saved;
    login();
  })();
})();

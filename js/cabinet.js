// i(m)perfect — кабинет администратора (administrator.html). С 03.10 у ведущего своя страница
// и свой скрипт (vedushchiy.html, js/vedushchiy.js); этот файл обслуживает только владельца.
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
    '1to2': 'границе 1→2', '2to3': 'границе 2→3', '3to4': 'границе 3→4', '4to5': 'границе 4→5'
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
               scene: (w.scene && w.scene.name) ? w.scene.name : '',
               sceneId: (w.scene && w.scene.id) || '' };
    });
  })();

  // ── СПОСОБНОСТЬ → ШАГИ, ПО КОТОРЫМ ЕЁ СУДИЛИ ────────────────────────────────
  // Инверсия S.measures из scenes.js, а та в свою очередь сверяется с таблицей заданий
  // судьи проверкой eval/lint_measures.js. Своего списка «что где меряется» у кабинета
  // нет: он стал бы третьим по счёту и разошёлся бы молча.
  var RU_OF = (function () {
    var m = {};
    Object.keys(ABILITY_NAMES).forEach(function (a) { m[a] = String(ABILITY_NAMES[a]).split(' · ')[0]; });
    return m;
  })();
  var ABILITY_STEPS = (function () {
    var S = window.imp.scenes, out = {};
    Object.keys(ABILITY_NAMES).forEach(function (a) { out[a] = { main: [], control: [] }; });
    if (!S || !S.measures) return out;
    Object.keys(S.measures).forEach(function (key) {
      var m = S.measures[key];
      Object.keys(ABILITY_NAMES).forEach(function (a) {
        if ((m.main || []).indexOf(RU_OF[a]) >= 0) out[a].main.push(key);
        if ((m.control || []).indexOf(RU_OF[a]) >= 0) out[a].control.push(key);
      });
    });
    return out;
  })();
  // Флаг относится к способности, если бэкенд назвал адресата полем ability. Разбор имени
  // остаётся для записей, сделанных до 31.08: тогда адресата не передавали, и способность
  // читалась из кода флага (control_above/below относился к ПР-2 без префикса). С переходом
  // на закрытый список Приложения Б имена стали русскими и общими — «перепрыгнутая_граница»
  // у любой из десяти, — и по имени адресата больше не вычислить.
  function flagsOf(all, a) {
    return (all || []).filter(function (f) {
      if (f.ability) return f.ability === a;
      var c = String(f.code || '');
      if (c.indexOf(a + '_') === 0 || c.indexOf('_' + a + '_') > 0 || c.indexOf('_' + a) === c.length - a.length - 1) return true;
      return a === 'pr2' && c.indexOf('control_') === 0;
    });
  }

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
  // по window.imp.refusedOwner — тому же правилу, по которому ветвится день.
  // Возвращает null, когда судить не о чем: верстак ещё не заполнен.
  // Факты верстака из полной раскладки, которую кабинет получает вместе с ответами.
  // Одна функция на оба места, где они собирались, — иначе при следующей правке условий
  // разъедутся две копии.
  function listFactsOf(f) {
    if (!f) return null;
    var ids = function (a) { return (a || []).map(function (it) { return it.id; }); };
    return { fitsFrame: f.fitsFrame,
             deferred: ids(f.later).concat(ids(f.never)),
             taken: ids(f.taken), later: ids(f.later), never: ids(f.never),
             sums: { people: f.people, money: f.money },
             limits: f.limits };
  }

  // Раскладка портфеля в том виде, в каком её ждёт js/backlog.js. Поля taken/later/never
  // приходят с бэкенда с правки 13.1; у payload'ов до неё есть только плоский `deferred`,
  // и тогда читаем его — правило само разберёт такую форму как «не сейчас».
  function setsOf(lf) {
    if (lf && (lf.taken || lf.later || lf.never)) {
      return { taken: lf.taken || [], later: lf.later || [], never: lf.never || [] };
    }
    return (lf && lf.deferred) || [];
  }
  function sumsOf(lf) { return (lf && lf.sums) || null; }
  function limsOf(lf) { return (lf && lf.limits) || window.imp.backlogLimits || null; }
  function refusedAllOf(lf) {
    var s = setsOf(lf);
    return Array.isArray(s) ? s : (s.later || []).concat(s.never || []);
  }

  function conditionalAsked(key, lf) {
    if (!lf) return null;
    if (key === 'overspend') return lf.fitsFrame === false;
    // ⚠ ОБМЕН СТАЛ УСЛОВНЫМ (правка 5.1). Без этой строки шаг попадал бы в «остальное»,
    // то есть считался безусловным, и непрозвучавший вопрос показывался фасилитатору как
    // «не дошёл» — а пустой ответ рисовался бы словом «промолчали» (см. 6.7). Правило то
    // же, что в движке: есть хотя бы один отказ.
    if (key === 'forced') return refusedAllOf(lf).length > 0;
    if (key === 'severova') {
      // Правило одно на всех — js/backlog.js. С 14.08 встреча срабатывает на ЛЮБОЙ
      // отказ, а не только на заявку №6. С правки 13.1 из кандидатов исключена заявка,
      // на которой настояло правление, — поэтому условие спрашивается тем же вызовом,
      // что в движке, а не через выбор собеседника.
      return window.imp.refusedTalkIds(setsOf(lf), sumsOf(lf), limsOf(lf)).length > 0;
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


  // ── КАБИНЕТ АДМИНИСТРАТОРА ЧЕРЕЗ ПОТОКИ (решение владельца 03.10) ─────────────
  // Было четыре плоских вкладки: оценка всех участников разом, номера, потоки, ведущие.
  // Стало, как у ведущего: «Все потоки» → поток (участники с оценкой и настройки) и
  // «Ведущие»; поиск участника по всем потокам — в шапке. Вкладки «Номера участников»
  // нет: имя, «не оценивать», сброс и удаление номера — в карточке участника, внизу.
  // Карточка, оценка и правки уровней — прежние, ниже по файлу, не тронуты.
  // Ведущий на этой странице не работает: у него своя (vedushchiy.html, js/vedushchiy.js).

  var pw = '';
  // Роль приходит со списком. Здесь работает только владелец ('full'); ведущего
  // отправляем на его страницу. ⚠ Это место, а не защита: права держит ACTION_ROLE.
  var role = 'full';
  var isFull = function () { return role === 'full'; };
  var rows = [];      // лист Answers: ход и оценка
  var roster = [];    // регистрации: все номера, включая тех, кто ещё не начал
  var waves = [];
  var facs = [];
  // ⚠ ТЁЗКИ В ПОТОКЕ (решение владельца 03.10). Самозапись имён не сверяет: один человек,
  // потерявший номер, может записаться второй раз, а двое настоящих тёзок — тоже. Отличить
  // их код не берётся: строки с одинаковыми именем и фамилией в одном потоке помечаются,
  // и ведущий после ассессмента сам просит этих людей подойти. Ключ — поток + ФИО.
  var nameTwins = {};
  function twinKey(p) {
    var f = String(p.fio || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    return f ? String(p.waveId || '') + '|' + f : '';
  }
  var POLL_MS = 20000;   // сервер присылать сам не умеет — спрашиваем, пока открыт поток
  var pollTimer = null;
  var judging = false;   // идёт оценка: список обновляет сама оценка, опрос молчит
  var tab = 'people';    // вкладка потока: 'people' | 'set'
  var shareOpen = false;
  var TIMES = [[90, '1,5 часа'], [120, '2 часа'], [150, '2,5 часа'], [180, '3 часа'], [0, 'без таймера']];
  var S = window.imp.scenes;
  var ROUTE = S && S.route ? S.route() : [];

  var el = function (id) { return document.getElementById(id); };
  var gate = el('cabGate');
  var content = el('cabContent');
  var main = el('admMain');
  var detail = el('cabDetail');
  var detailBody = el('cabDetailBody');
  var statusEl = el('cabStatus');
  var findEl = el('admFind');

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function br(s) { return esc(s).replace(/\n/g, '<br />'); }
  // ⚠ БУКВЫ ИЗ НОМЕРА НЕ ВЫРЕЗАЮТСЯ (правка 28.09): номер — шесть букв и цифр. Нули
  // дописываем только там, где номер из одних цифр, то есть у прогонов прежних потоков.
  function bib6(b) {
    var s = String(b == null ? '' : b).trim();
    return '№ ' + (/^\d+$/.test(s) ? s.padStart(6, '0') : s.toUpperCase());
  }
  // Ключ номера для сверки строк двух листов. Прежний bibKey вырезал буквы и у
  // шестизначных номеров вида HK7RQ4 давал «74» — разные люди сливались в одного.
  function bk(b) {
    var s = String(b == null ? '' : b).trim().toUpperCase();
    return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
  }
  function dt(iso) {
    if (!iso) return '';
    try { var d = new Date(iso); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' +
      ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); } catch (e) { return String(iso); }
  }
  function say(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'cab-status' + (kind ? ' is-' + kind : '');
  }
  function timeWord(min) {
    for (var i = 0; i < TIMES.length; i++) if (TIMES[i][0] === (Number(min) || 0)) return TIMES[i][1];
    return 'без таймера';
  }
  function timeOptions(cur) {
    return TIMES.map(function (t) {
      return '<option value="' + t[0] + '"' + ((Number(cur) || 0) === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
    }).join('');
  }
  function facName(id) {
    if (!id) return '';
    var f = facs.filter(function (x) { return String(x.id) === String(id); })[0];
    return f ? (f.name || 'без имени') : 'ведущий';
  }
  function ownerOptions(cur) {
    return '<option value=""' + (!cur ? ' selected' : '') + '>только вы</option>' +
      facs.filter(function (f) { return !f.archived || f.id === cur; }).map(function (f) {
        return '<option value="' + esc(f.id) + '"' + (cur === f.id ? ' selected' : '') + '>' +
          esc(f.name || 'без имени') + (f.archived ? ' (доступ снят)' : '') + '</option>';
      }).join('');
  }

  // ---------- вход ----------

  function login() {
    var val = (el('cabPass').value || '').trim();
    if (!val) return;
    var btn = el('cabPassBtn');
    btn.disabled = true; btn.textContent = 'Проверяю…';
    window.imp.callApi('v2List', { password: val }).then(function (res) {
      btn.disabled = false; btn.textContent = 'Войти →';
      if (!res || !res.ok) {
        // ⚠ «НЕВЕРНЫЙ ПАРОЛЬ» СТОЯЛО НА ЛЮБОЙ НЕУДАЧЕ (правка 31.08): первый вызов после
        // обновления бэкенда бывает дольше тридцати секунд, и кабинет объявлял, что пароль
        // не тот. Три случая различаются: пароль, молчание бэкенда и всё остальное.
        var err = el('cabPassErr');
        err.textContent = !res
          ? 'Бэкенд не ответил. Первый вызов после обновления бывает долгим — нажмите «Войти» ещё раз.'
          : (res.error === 'unauthorized' ? 'Неверный пароль.'
                                          : 'Бэкенд ответил ошибкой: ' + String(res.error || 'без кода') + '.');
        err.style.display = '';
        return;
      }
      el('cabPassErr').style.display = 'none';
      pw = val;
      try { sessionStorage.setItem(PW_KEY, val); } catch (e) {}
      if (res.role && String(res.role) !== 'full') { location.replace('vedushchiy.html'); return; }
      gate.style.display = 'none';
      content.style.display = '';
      loadFacs().then(function () { absorb(res); });
      startPoll();
    });
  }

  // Один ответ v2List кормит все экраны: второго запроса нет — иначе экраны
  // показывали бы состояние на разные моменты.
  function absorb(res) {
    if (res && res.role) role = String(res.role);
    if (!isFull()) { location.replace('vedushchiy.html'); return; }
    rows = res.participants || [];
    roster = res.roster || [];
    waves = res.waves || [];
    // Тёзок считаем по всем номерам, а не по видимым. Считаются разные НОМЕРА.
    nameTwins = {};
    var bibsOf = {};
    people().forEach(function (p) {
      var k = twinKey(p);
      if (k) (bibsOf[k] = bibsOf[k] || {})[bk(p.bib)] = true;
    });
    Object.keys(bibsOf).forEach(function (k) { if (Object.keys(bibsOf[k]).length > 1) nameTwins[k] = true; });
    render();
  }

  // silent — не трогать строку состояния: во время оценки там идёт её счёт.
  function refresh(silent) {
    if (!pw) return Promise.resolve();
    if (!silent) say('обновляю…');
    return window.imp.callApi('v2List', { password: pw }).then(function (res) {
      if (res && res.ok) { absorb(res); if (!silent) say(''); }
      else if (!silent) say('не удалось обновить', 'bad');
    });
  }
  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.hidden || judging || detail.style.display !== 'none') return;
      if (route().view !== 'wave' || tab !== 'people' || findQ()) return;
      refresh(true);
    }, POLL_MS);
  }

  function call(action, extra) {
    var p = { password: pw };
    Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
    return window.imp.callApi(action, p);
  }
  // Ответ действия: либо ok, либо ошибка словами. Молчаливый провал страшнее шумного.
  function after(res, okMsg) {
    if (res && res.ok) { say(okMsg || 'готово'); return refresh(true); }
    var msg = res && (res.message || res.error) ? String(res.message || res.error) : 'не получилось';
    return window.imp.alert('Не вышло: ' + msg).then(function () {});
  }
  // Копирование с отходным путём: без защищённого протокола clipboard недоступен.
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
  // Правка поля по уходу из него; пустое и неизменённое не уезжает.
  function onCommit(input, was, fn) {
    var send = function () {
      var val = input.value.trim();
      if (val === String(was == null ? '' : was).trim()) return;
      fn(val);
    };
    input.addEventListener('blur', send);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  }

  // ---------- участники ----------

  // Человек — это номер из регистраций плюс, если начал, его строка из листа Answers.
  // Строка Answers без регистрации (прежние прогоны) тоже человек: её не теряем.
  function people() {
    var ans = {}, seen = {}, out = [];
    rows.forEach(function (p) { ans[bk(p.bib)] = p; });
    roster.forEach(function (r) {
      var k = bk(r.bib), p = ans[k];
      seen[k] = true;
      out.push(p ? Object.assign({}, r, p, { firstName: r.firstName, registeredAt: r.registeredAt,
                                              noScore: !!(p.noScore || r.noScore) })
                 : Object.assign({ registeredOnly: true }, r));
    });
    rows.forEach(function (p) { if (!seen[bk(p.bib)]) out.push(p); });
    return out;
  }
  function personByBib(bib) {
    return people().filter(function (p) { return bk(p.bib) === bk(bib); })[0] || { bib: bib };
  }
  // Без потока: поток удалён, а номер остался, или номер выдан мимо потока.
  function orphan(p) { return !p.waveId || !!p.waveMissing; }
  function inWave(w) {
    return people().filter(function (p) { return w === 'none' ? orphan(p) : String(p.waveId) === String(w.id); })
      .sort(function (a, b) { return String(a.registeredAt || a.startedAt || '').localeCompare(String(b.registeredAt || b.startedAt || '')); });
  }
  function busy(p) { return !!(p.queue && (p.queue.queued || p.queue.running)); }
  function versionsApart(p) { return !!(p.scenesVersion && p.expectScenes && p.scenesVersion !== p.expectScenes); }
  function scored(p) { return !(p.total === null || p.total === undefined); }
  // Ждёт оценки: закончил, оценки нет, не стоит в очереди, судейство ему не закрыто.
  function needsJudge(p) {
    return !!p.finished && !p.noScore && !scored(p) && !busy(p) && !versionsApart(p) && !!p.answered;
  }

  // Причины, по которым строку нельзя оставить машине. Словом, а не значком.
  // Ошибки очереди без снятых из судейства заданий (retired, бэкенд @318): такую строку не
  // пересудить, на балл она не влияет — это след в листе, а не дело для человека (04.10).
  function liveErrors(q) {
    if (!q) return 0;
    if (!Array.isArray(q.failed)) return q.error || 0;
    return q.failed.filter(function (f) { return !f.retired; }).length;
  }
  function attention(p) {
    if (p.noScore) return [];
    var out = [];
    var hasWork = !!(p.answered || p.legacyAnswered);
    if (hasWork && versionsApart(p)) {
      out.push({ code: 'версии', text: 'судейство закрыто: сцены ' + p.scenesVersion + ' против судейских ' + p.expectScenes });
    }
    if (nameTwins[twinKey(p)]) {
      out.push({ code: 'тёзки', text: 'в этом потоке есть другой номер с теми же именем и фамилией. ' +
        'Это могут быть тёзки или один человек, записавшийся дважды. Попросите их подойти после ассессмента' });
    }
    if (p.stale) out.push({ code: 'устарело', text: 'оценка по другому тексту: ответы менялись после оценки' });
    if (liveErrors(p.queue)) out.push({ code: 'очередь', text: 'заданий с ошибкой: ' + liveErrors(p.queue) });
    if (p.flags) out.push({ code: 'флаги', text: p.flags + ' ' + plural(p.flags, 'флаг', 'флага', 'флагов') + ' — перечитать ответ' });
    if (p.listFacts && p.listFacts.fitsFrame === false) out.push({ code: 'рамка', text: 'разбор вышел за рамку года' });
    return out;
  }
  function attentionCell(p) {
    var a = attention(p);
    if (!a.length) return '<span class="cab-dim">—</span>';
    return a.map(function (x) { return '<span class="cab-need" title="' + esc(x.text) + '">' + esc(x.code) + '</span>'; }).join(' ');
  }

  // Где человек сейчас: этап по курсору маршрута — то же, что видит ведущий.
  function whereOf(p) {
    if (p.registeredOnly) return { cls: '', text: 'Зарегистрировался' };
    if (!p.answered && p.legacyAnswered) return { cls: '', text: 'Прежний маршрут' };
    if (p.finished) return { cls: 'is-done', text: 'Закончено' };
    if (!p.started || p.cursor == null) return { cls: '', text: 'Читает инструкцию' };
    var st = ROUTE[Math.min(p.cursor, ROUTE.length - 1)];
    if (!st || !S.stageNo) return { cls: 'is-run', text: 'Проходит' };
    var n = S.stageNo(st.sceneIx), name = (S.stageShort || [])[n - 1] || st.scene.name;
    return { cls: 'is-run', text: 'Этап ' + n + ' из ' + S.stageCount() + ' · ' + name };
  }

  function skillsCell(p) {
    if (p.noScore) return '<span class="cab-dim">не оценивается</span>';
    if (busy(p)) return '<span class="adm-wait is-run">оценивается (' + p.queue.done + ' из ' + p.queue.total + ')</span>';
    if (!p.skills) {
      if (needsJudge(p)) return '<span class="adm-wait">ждёт оценки</span>';
      if (p.judged) return '<span class="cab-dim">оценено ' + p.judged + ' из 10</span>';
      return '<span class="cab-dim">—</span>';
    }
    return Object.keys(SKILL_NAMES).map(function (k) {
      var v = p.skills[k];
      return '<span class="cab-skill" title="' + SKILL_NAMES[k] + ' — сумма двух способностей, от 2 до 10">' +
        SKILL_NAMES[k] + '<b>' + (v === null || v === undefined ? '—' : v) + '</b></span>';
    }).join('');
  }
  // Итог — сумма десяти способностей, до 50; показываем, только когда оценены все десять.
  function totalCell(p) {
    if (!scored(p) || p.noScore) return '<span class="cab-dim">—</span>';
    return '<b class="cab-total">' + p.total + '</b><span class="cab-dim"> из 50</span>' +
      (p.stale ? ' <span class="cab-stale" title="Оценка вынесена по другому тексту ответа">устарело</span>' : '') +
      (p.overridden ? ' <span class="cab-ovmark" title="Уровней поставлено вами: ' + p.overridden + '">правил человек</span>' : '');
  }

  function waveStat(w) {
    var ps = inWave(w), c = { joined: ps.length, run: 0, done: 0, wait: 0, scored: 0 };
    ps.forEach(function (p) {
      if (p.finished) c.done++; else if (p.started && !p.registeredOnly) c.run++;
      if (needsJudge(p)) c.wait++;
      if (scored(p)) c.scored++;
    });
    return c;
  }

  // ---------- маршрут страницы ----------

  function route() {
    var h = location.hash || '', m;
    if ((m = /^#w=([^&]+)(&new=1)?/.exec(h))) return { view: 'wave', wave: decodeURIComponent(m[1]), fresh: !!m[2] };
    if (h === '#fac') return { view: 'fac' };
    return { view: 'home', arch: h === '#arch' };
  }
  function findQ() { return findEl ? findEl.value.trim().toLowerCase() : ''; }
  function waveById(id) { return waves.filter(function (w) { return String(w.id) === String(id); })[0]; }

  function render() {
    // Поле в фокусе (печатают название, имя) — перерисовка его бы стёрла.
    var a = document.activeElement;
    if (a && main.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    var r = route();
    [].forEach.call(document.querySelectorAll('.adm-nav a'), function (x) {
      x.classList.toggle('is-on', !findQ() && (x.getAttribute('data-go') === 'fac') === (r.view === 'fac'));
    });
    if (findQ()) return renderFind();
    if (r.view === 'fac') return renderFacs();
    if (r.view === 'wave') {
      if (r.wave === 'none') return renderWave('none');
      var w = waveById(r.wave);
      if (!w) { main.innerHTML = '<p class="ved-empty">Такого потока нет. <a href="#">Все потоки</a></p>'; return; }
      if (r.fresh) return renderShare(w);
      return renderWave(w);
    }
    renderHome(r.arch);
  }

  // ---------- все потоки ----------

  function renderHome(arch) {
    var list = waves.filter(function (w) { return arch ? w.archived : !w.archived; }).slice().reverse();
    var nArch = waves.filter(function (w) { return w.archived; }).length;
    var orphans = people().filter(orphan);
    main.innerHTML =
      '<p class="ved-k">Потоки</p><h1 class="ved-h1">' + (arch ? 'Потоки в архиве' : 'Все потоки') + '</h1>' +
      (arch ? '' :
      '<form class="ved-card ved-row adm-new" id="admNew">' +
        '<label class="ved-f"><span>Название</span><input id="admNewName" placeholder="например, «Сбер, группа 2 — 14 октября»" required /></label>' +
        '<label class="ved-f adm-f-s"><span>Время</span><select id="admNewTime">' + timeOptions(120) + '</select></label>' +
        '<label class="ved-f adm-f-s"><span>Ведёт</span><select id="admNewOwner">' + ownerOptions('') + '</select></label>' +
        '<label class="ved-check adm-new-ai"><input type="checkbox" id="admNewAi" /> прогон модели</label>' +
        '<button class="btn btn-primary" type="submit" id="admNewBtn">Создать поток →</button>' +
      '</form>') +
      (list.length
        ? '<div class="adm-cols adm-cols-hd"><span>Поток</span><span>Ведёт</span><span>Участники</span><span>Закончили</span><span>Ждут оценки</span><span>Время</span></div>' +
          '<div class="ved-list adm-list">' + list.map(function (w) { return waveLine(w); }).join('') +
            (!arch && orphans.length ? waveLine('none') : '') + '</div>'
        : '<p class="ved-empty">' + (arch ? 'В архиве пусто.' : 'Ни одного потока. Создайте первый — получите ссылку и QR для участников.') + '</p>') +
      '<p class="ved-dim">' + (arch ? '<a href="#">← все потоки</a>'
        : (nArch ? '<a href="#arch">Показать архивные (' + nArch + ')</a>' : '')) + '</p>';
    var form = el('admNew');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (el('admNewName').value || '').trim();
      if (!name) return;
      var ai = el('admNewAi').checked;
      var btn = el('admNewBtn'); btn.disabled = true; btn.textContent = 'Создаю…';
      // Поток сразу открыт по ссылке, как у ведущего; прогон модели — закрыт.
      call('addWave', { name: name, timerMin: el('admNewTime').value, owner: el('admNewOwner').value,
                        isAi: ai ? '1' : '', selfEnroll: ai ? '' : '1' }).then(function (res) {
        btn.disabled = false; btn.textContent = 'Создать поток →';
        if (!res || !res.ok || !res.wave) { window.imp.alert('Поток не создан: ' + ((res && (res.message || res.error)) || 'сервер не ответил') + '.'); return; }
        waves.push({ id: res.wave.id, num: res.wave.num, name: res.wave.name, isAi: !!res.wave.isAi, selfEnroll: !!res.wave.selfEnroll,
                     timerMin: res.wave.timerMin, owner: res.wave.owner || '', archived: false });
        location.hash = '#w=' + encodeURIComponent(res.wave.id) + (ai ? '' : '&new=1');
      });
    });
  }
  function waveLine(w) {
    var none = w === 'none', c = waveStat(w);
    return '<a href="#w=' + (none ? 'none' : encodeURIComponent(w.id)) + '"><div class="adm-cols">' +
      '<b>' + (none ? 'Без потока' : esc(w.name || w.num)) + (!none && w.isAi ? '<span class="adm-ai">ИИ</span>' : '') + '</b>' +
      '<span>' + (none ? '—' : esc(facName(w.owner) || 'только вы')) + '</span>' +
      '<span>' + c.joined + (c.run ? ' · ' + c.run + ' ' + plural(c.run, 'проходит', 'проходят', 'проходят') : '') + '</span>' +
      '<span>' + c.done + '</span>' +
      '<span>' + (c.wait ? '<span class="adm-wait">' + c.wait + ' ' + plural(c.wait, 'ждёт', 'ждут', 'ждут') + '</span>'
                         : (c.done && c.scored >= c.done ? '<span class="cab-dim">все оценены</span>' : '<span class="cab-dim">—</span>')) + '</span>' +
      '<span>' + (none ? '—' : (w.timerMin ? timeWord(w.timerMin).replace(' часа', ' ч') : '—')) + '</span>' +
      '</div></a>';
  }

  // ---------- ссылка и QR ----------

  function link(w) {
    try { return new URL('index.html?w=' + encodeURIComponent(w.num), location.href).href; }
    catch (e) { return 'index.html?w=' + w.num; }
  }
  function shareHtml(w, fresh) {
    return '<div class="ved-card ved-share">' +
      '<button type="button" class="ved-qr" id="vedQr" title="QR на весь экран">' + window.imp.qrSvg(link(w)) + '</button>' +
      '<div><p class="ved-k">Ссылка для участников</p>' +
        '<div class="ved-link">' + esc(link(w)) + '</div>' +
        '<div class="ved-row">' +
          '<button type="button" class="btn btn-ghost" id="vedCopy">Скопировать ссылку</button>' +
          '<button type="button" class="btn btn-ghost" id="vedQrBig">QR на весь экран</button>' +
          (fresh ? '<a class="btn btn-primary" href="#w=' + encodeURIComponent(w.id) + '">Перейти к потоку →</a>' : '') +
        '</div>' +
        '<p class="ved-dim">Покажите QR на экране или отправьте ссылку в чат группы. Время на ассессмент — ' + timeWord(w.timerMin) + '.' +
          (!w.selfEnroll ? ' <b>Вход по ссылке закрыт</b> — откройте его в настройках потока.' : '') + '</p>' +
      '</div></div>';
  }
  function wireShare(w) {
    var full = function () {
      el('vedQrFullImg').innerHTML = window.imp.qrSvg(link(w));
      el('vedQrFullLink').textContent = link(w);
      el('vedQrFull').style.display = 'flex';
    };
    if (el('vedQr')) el('vedQr').addEventListener('click', full);
    if (el('vedQrBig')) el('vedQrBig').addEventListener('click', full);
    if (el('vedCopy')) el('vedCopy').addEventListener('click', function () {
      var b = this;
      copyText(link(w), 'ссылка скопирована').then(function () {
        b.textContent = 'Скопировано ✓'; setTimeout(function () { b.textContent = 'Скопировать ссылку'; }, 1600);
      });
    });
  }
  function renderShare(w) {
    main.innerHTML = '<p class="ved-k">Поток создан</p><h1 class="ved-h1">' + esc(w.name || w.num) + '</h1>' + shareHtml(w, true);
    wireShare(w);
  }

  // ---------- поток ----------

  function peopleTable(list, withWave) {
    return '<table class="ved-table adm-table"><thead><tr><th>Участник</th>' + (withWave ? '<th>Поток</th>' : '') +
      '<th>Где сейчас</th><th>Оценка по навыкам</th><th>Итог</th><th>Внимание</th></tr></thead><tbody>' +
      list.map(function (p) {
        var where = whereOf(p), wv = withWave ? waveById(p.waveId) : null;
        return '<tr data-bib="' + esc(p.bib) + '" tabindex="0"' + (p.noScore ? ' class="is-off"' : '') + '>' +
          '<td><b>' + (esc(p.fio) || '<span class="cab-dim">без имени</span>') + '</b> <span class="ved-num">' + esc(bib6(p.bib)) + '</span>' +
            (p.isRunner ? ' <span class="adm-ai" title="Ассессмент прошла модель, а не человек">модель</span>' : '') + '</td>' +
          (withWave ? '<td>' + (wv ? esc(wv.name || wv.num) : '<span class="cab-dim">без потока</span>') + '</td>' : '') +
          '<td><span class="ved-st ' + where.cls + '">' + esc(where.text) + '</span></td>' +
          '<td>' + skillsCell(p) + '</td><td>' + totalCell(p) + '</td><td>' + attentionCell(p) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function wireRows() {
    [].forEach.call(main.querySelectorAll('tr[data-bib]'), function (tr) {
      var open = function () { openCard(personByBib(tr.getAttribute('data-bib'))); };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  function renderWave(w) {
    var none = w === 'none', c = waveStat(w), list = inWave(w);
    var waiting = list.filter(needsJudge);
    if (none) tab = 'people';
    var head =
      '<p class="ved-k">' + (none ? 'Номера без потока'
        : 'Поток · ' + timeWord(w.timerMin) + ' · ' + (w.owner ? 'ведёт ' + esc(facName(w.owner)) : 'ведёте вы') +
          (w.isAi ? ' · прогон модели' : '') + (w.archived ? ' · в архиве' : '')) + '</p>' +
      '<h1 class="ved-h1">' + (none ? 'Без потока' : esc(w.name || w.num)) + '</h1>' +
      '<div class="ved-meta"><span class="ved-live">обновляется само</span>' +
        '<span>' + c.joined + ' вошли · ' + c.run + ' ' + plural(c.run, 'проходит', 'проходят', 'проходят') + ' · ' + c.done + ' закончили' +
          (c.wait ? ' · ' + c.wait + ' ' + plural(c.wait, 'ждёт', 'ждут', 'ждут') + ' оценки' : '') + '</span>' +
        (none || !w.num ? '' : '<a href="#" id="admShowShare">ссылка и QR</a>') +
        '<a href="#">все потоки</a></div>' +
      (none ? '' : '<div id="admShareBox"' + (shareOpen ? '' : ' style="display:none;"') + '>' + shareHtml(w) + '</div>') +
      (none ? '' : '<nav class="ved-tabs"><button type="button" data-t="people"' + (tab === 'people' ? ' class="is-on"' : '') + '>Участники</button>' +
        '<button type="button" data-t="set"' + (tab === 'set' ? ' class="is-on"' : '') + '>Настройки потока</button></nav>');
    var body;
    if (tab === 'people') {
      body = list.length
        ? '<div class="adm-bar"><span class="ved-dim">Нажмите на строку — откроется карточка участника.</span>' +
            '<span class="adm-bar-acts">' +
            // ⚠ ЗАГЛУШКИ (решение владельца 03.10): видны, но не работают — генератор отчёта
            // ещё не подключён к оценкам (стрим 05). Показывают, где будут отчёты потока.
            '<button type="button" class="btn btn-ghost btn-sm adm-soon" disabled title="Скоро: отчёты всех участников потока одним архивом">Отчёты участников · скоро</button>' +
            '<button type="button" class="btn btn-ghost btn-sm adm-soon" disabled title="Скоро: сводный отчёт по потоку">Отчёт по потоку · скоро</button>' +
            (waiting.length || judging ? '<button type="button" class="btn btn-primary btn-sm" id="admJudgeAll"' + (judging ? ' disabled' : '') + '>' +
              (judging ? 'Оцениваю…' : 'Оценить закончивших (' + waiting.length + ')') + '</button>' : '') + '</span></div>' +
          peopleTable(list)
        : '<p class="ved-empty">Пока никого. Участники появятся здесь сами, как только зарегистрируются по ссылке.</p>';
    } else {
      body = settingsHtml(w);
    }
    main.innerHTML = head + body;
    if (!none) {
      wireShare(w);
      el('admShowShare') && el('admShowShare').addEventListener('click', function (e) {
        e.preventDefault(); shareOpen = !shareOpen; el('admShareBox').style.display = shareOpen ? '' : 'none';
      });
      [].forEach.call(main.querySelectorAll('.ved-tabs button'), function (b) {
        b.addEventListener('click', function () { tab = b.getAttribute('data-t'); renderWave(w); });
      });
    }
    if (tab === 'people') {
      wireRows();
      el('admJudgeAll') && el('admJudgeAll').addEventListener('click', function () { judgeMany(waiting); });
    } else wireSettings(w);
  }

  // ---------- настройки потока ----------

  function settingsHtml(w) {
    return '<div class="ved-card ved-set">' +
      '<label class="ved-f"><span>Название</span><input id="admSetName" value="' + esc(w.name || '') + '" /></label>' +
      '<label class="ved-f"><span>Время на ассессмент</span><select id="admSetTime">' + timeOptions(w.timerMin) + '</select>' +
        '<em>Меняется только у тех, кто ещё не вошёл: вошедшим время пришло при входе.</em></label>' +
      '<label class="ved-f"><span>Ведёт</span><select id="admSetOwner">' + ownerOptions(w.owner || '') + '</select></label>' +
      '<label class="ved-check"><input type="checkbox" id="admSetOpen"' + (w.selfEnroll ? ' checked' : '') + ' /> Вход по ссылке открыт</label>' +
      '<label class="ved-check"><input type="checkbox" id="admSetAi"' + (w.isAi ? ' checked' : '') + ' /> Прогон модели</label>' +
      '<div class="ved-row"><button type="button" class="btn btn-primary" id="admSetSave">Сохранить</button></div>' +
    '</div>' +
    // Ручная выдача — запасной путь: участники записываются сами по ссылке (решение владельца 03.10).
    '<details class="ved-card adm-more"><summary>Выдать номера вручную</summary>' +
      '<p class="ved-dim">Нужно, только если человек не может записаться по ссылке. Номер он вводит на странице входа.</p>' +
      '<div class="ved-row"><label class="ved-f adm-f-xs"><span>Сколько</span><input type="number" id="admIssueN" min="1" max="300" value="1" /></label>' +
      '<button type="button" class="btn btn-ghost" id="admIssue"' + (w.archived ? ' disabled' : '') + '>Выдать</button></div>' +
      '<div id="admIssueOut" aria-live="polite"></div>' +
    '</details>' +
    '<div class="ved-row adm-danger">' +
      '<button type="button" class="btn btn-ghost" id="admSetArch">' + (w.archived ? 'Вернуть из архива' : 'Убрать поток в архив') + '</button>' +
      '<button type="button" class="btn btn-ghost" id="admSetDel">Удалить поток</button>' +
    '</div>';
  }
  function wireSettings(w) {
    el('admSetSave').addEventListener('click', function () {
      var b = this; b.disabled = true; b.textContent = 'Сохраняю…';
      var nm = (el('admSetName').value || '').trim(), tm = Number(el('admSetTime').value) || 0;
      var own = el('admSetOwner').value, open = el('admSetOpen').checked, ai = el('admSetAi').checked;
      var p = { id: w.id, name: nm, timerMin: tm ? String(tm) : '', selfEnroll: open ? '1' : '', isAi: ai ? '1' : '' };
      if (own !== (w.owner || '')) p.owner = own;
      call('setWaveMeta', p).then(function (res) {
        b.disabled = false; b.textContent = 'Сохранить';
        if (!res || !res.ok) { window.imp.alert('Не сохранилось: ' + ((res && (res.message || res.error)) || 'сервер не ответил') + '.'); return; }
        w.name = nm; w.timerMin = tm; w.owner = own; w.selfEnroll = open; w.isAi = ai;
        b.textContent = 'Сохранено ✓'; setTimeout(function () { b.textContent = 'Сохранить'; }, 1600);
        say('настройки потока сохранены');
      });
    });
    el('admIssue').addEventListener('click', function () {
      var n = Number(el('admIssueN').value);
      if (!(n > 0 && n <= 300)) { window.imp.alert('Количество — от 1 до 300.'); return; }
      var b = this; b.disabled = true;
      call('createParticipants', { wave: w.id, count: n }).then(function (r) {
        b.disabled = false;
        if (!r || !r.ok) return after(r);
        var made = (r.created || []).map(function (c) { return c.bib; });
        el('admIssueOut').innerHTML = '<p class="ved-dim"><b>Выдано: ' + made.length + '</b> · <a href="#" id="admIssueCopy">скопировать</a></p>' +
          '<p class="adm-issued">' + made.map(function (x) { return esc(bib6(x)); }).join('<br />') + '</p>';
        el('admIssueCopy').addEventListener('click', function (e) { e.preventDefault(); copyText(made.join('\n'), 'номера скопированы'); });
        // Список обновляем без перерисовки: выданные номера должны остаться на экране.
        window.imp.callApi('v2List', { password: pw }).then(function (res) {
          if (res && res.ok) { rows = res.participants || []; roster = res.roster || []; waves = res.waves || []; }
        });
      });
    });
    el('admSetArch').addEventListener('click', function () {
      var to = !w.archived;
      call('setWaveMeta', to ? { id: w.id, archived: '1', selfEnroll: '' } : { id: w.id, archived: '' }).then(function (r) {
        if (!r || !r.ok) return after(r);
        w.archived = to; if (to) w.selfEnroll = false;
        say(to ? 'поток убран в архив' : 'поток вернулся из архива');
        location.hash = to ? '' : '#w=' + encodeURIComponent(w.id);
        render();
      });
    });
    el('admSetDel').addEventListener('click', function () {
      var c = waveStat(w);
      window.imp.confirm('Удалить поток «' + (w.name || w.num) + '»?' +
        (c.joined ? ' Номера участников (' + c.joined + ') останутся — в разделе «Без потока».' : ''),
        { confirmLabel: 'Удалить', danger: true }).then(function (yes) {
        if (!yes) return;
        call('removeWave', { id: w.id }).then(function (r) {
          if (!r || !r.ok) return after(r);
          location.hash = '';
          after(r, 'поток удалён');
        });
      });
    });
  }

  // ---------- поиск ----------

  function renderFind() {
    var q = findQ();
    var list = people().filter(function (p) {
      return (String(p.bib) + ' ' + (p.fio || '') + ' ' + (p.firstName || '')).toLowerCase().indexOf(q) >= 0;
    });
    main.innerHTML = '<p class="ved-k">Поиск</p><h1 class="ved-h1">«' + esc(findEl.value.trim()) + '»</h1>' +
      (list.length ? peopleTable(list, true)
                   : '<p class="ved-empty">Никого не нашлось. Ищется номер, имя и фамилия во всех потоках, включая архивные.</p>');
    wireRows();
  }

  // ---------- ведущие ----------
  // Завести, переименовать, перевыдать ключ, снять доступ (29.09). Ключ показан открыто —
  // решение владельца. Снятие доступа — архив, а не удаление: иначе потеряется, кто вёл
  // прошлые потоки.

  function renderFacs() {
    main.innerHTML = '<p class="ved-k">Ведущие</p><h1 class="ved-h1">Кто ведёт потоки</h1>' +
      '<form class="ved-card ved-row adm-new" id="admFacNew">' +
        '<label class="ved-f"><span>Имя и фамилия</span><input id="admFacName" placeholder="Мария Белова" required /></label>' +
        '<button class="btn btn-primary" type="submit">Завести ведущего →</button></form>' +
      (facs.length
        ? '<table class="ved-table adm-table"><thead><tr><th>Ведущий</th><th>Ключ для входа</th><th>Потоки</th><th></th></tr></thead><tbody>' +
          facs.map(function (f, i) {
            var ws = waves.filter(function (w) { return String(w.owner) === String(f.id) && !w.archived; });
            return '<tr data-fix="' + i + '"' + (f.archived ? ' class="is-off"' : '') + '>' +
              '<td><input class="adm-inline" value="' + esc(f.name) + '" aria-label="Имя ведущего" />' +
                (f.archived ? ' <span class="cab-dim">доступ снят</span>' : '') + '</td>' +
              '<td><span class="adm-key">' + esc(f.key) + '</span> <a href="#" class="adm-copy">скопировать</a></td>' +
              '<td>' + (ws.length ? ws.map(function (w) { return '<a href="#w=' + encodeURIComponent(w.id) + '">' + esc(w.name || w.num) + '</a>'; }).join(', ')
                                  : '<span class="cab-dim">—</span>') + '</td>' +
              '<td class="adm-acts"><button type="button" class="btn btn-ghost btn-sm adm-f-key">Новый ключ</button>' +
                '<button type="button" class="btn btn-ghost btn-sm adm-f-arch">' + (f.archived ? 'Вернуть доступ' : 'Снять доступ') + '</button></td></tr>';
          }).join('') + '</tbody></table>'
        : '<p class="ved-empty">Ни одного ведущего. Заведите — он получит ключ и сможет сам создавать потоки.</p>') +
      '<p class="ved-dim">Ведущий входит на страницу «Ведущий» своим ключом, создаёт потоки и видит прохождение — без оценок и карточек.</p>';
    el('admFacNew').addEventListener('submit', function (e) {
      e.preventDefault();
      var nm = (el('admFacName').value || '').trim();
      if (!nm) return;
      call('addFacilitator', { name: nm }).then(function (r) {
        if (!r || !r.ok) return after(r);
        say('ведущий заведён, ключ ' + ((r.facilitator || {}).key || ''));
        loadFacs().then(function () { el('admFacName') && (el('admFacName').value = ''); render(); });
      });
    });
    [].forEach.call(main.querySelectorAll('tr[data-fix]'), function (tr) {
      var f = facs[Number(tr.getAttribute('data-fix'))];
      onCommit(tr.querySelector('.adm-inline'), f.name, function (val) {
        call('setFacilitator', { id: f.id, name: val }).then(function (r) {
          if (!r || !r.ok) return after(r);
          f.name = val; say('имя сохранено');
        });
      });
      tr.querySelector('.adm-copy').addEventListener('click', function (e) { e.preventDefault(); copyText(f.key, 'ключ скопирован'); });
      tr.querySelector('.adm-f-key').addEventListener('click', function () {
        window.imp.confirm('Выдать ' + (f.name || 'ведущему') + ' новый ключ? Прежний перестанет пускать.', { confirmLabel: 'Выдать' })
          .then(function (yes) {
            if (yes) call('setFacilitator', { id: f.id, newKey: '1' }).then(function (r) {
              if (!r || !r.ok) return after(r);
              say(r.key ? 'новый ключ: ' + r.key : 'ключ заменён');
              loadFacs().then(render);
            });
          });
      });
      tr.querySelector('.adm-f-arch').addEventListener('click', function () {
        var on = !f.archived;
        call('setFacilitator', { id: f.id, archived: on ? '1' : '' }).then(function (r) {
          if (!r || !r.ok) return after(r);
          say(on ? 'доступ снят' : 'доступ возвращён');
          loadFacs().then(render);
        });
      });
    });
  }

  function loadFacs() {
    return call('listFacilitators', {}).then(function (r) {
      if (r && r.ok) facs = r.facilitators || [];
      return r;
    });
  }

  // ---------- оценка закончивших ----------
  // По одному участнику, подряд: та же постановка в очередь и тот же разбор, что у
  // кнопки «Оценить» в карточке. Каждая оценка — платные вызовы судьи, поэтому сначала
  // вопрос с числом. Счёт идёт в строке состояния в шапке: список под ней перерисовывается.
  function judgeMany(list) {
    if (!list.length || judging) return;
    window.imp.confirm('Оценить ' + list.length + ' ' + plural(list.length, 'участника', 'участников', 'участников') +
      '? Оценка каждого — платные вызовы судьи. Идёт по одному; не закрывайте страницу, пока не закончится.',
      { confirmLabel: 'Оценить' }).then(function (yes) {
      if (!yes) return;
      judging = true;
      var i = 0, failed = [];
      var next = function () {
        if (i >= list.length) {
          judging = false;
          return refresh(true).then(function () {
            say('оценено: ' + (list.length - failed.length) + ' из ' + list.length +
              (failed.length ? ' · не удалось: ' + failed.join(', ') : ''), failed.length ? 'bad' : '');
          });
        }
        var p = list[i++];
        say('оцениваю ' + i + ' из ' + list.length + ' · ' + (p.fio || bib6(p.bib)));
        render();
        return window.imp.callApi('judgeAnswers', { password: pw, bib: p.bib }).then(function (res) {
          if (!res || !res.ok) { failed.push(p.fio || bib6(p.bib)); return next(); }
          return drainQueue(p.bib, [], statusEl, true).then(next);
        });
      };
      next();
    });
  }

  // ---------- действия с номером (в карточке) ----------
  // Переехали из вкладки «Номера участников» (решение владельца 03.10). Сброс и удаление
  // необратимы — у обоих вопрос с последствиями словами.
  function numberActionsHtml(p) {
    return '<section class="cab-block adm-num"><h3>Номер участника</h3>' +
      '<div class="ved-row">' +
        '<label class="ved-f"><span>Имя</span><input id="admPName" value="' + esc(p.firstName || '') + '" placeholder="без имени" /></label>' +
        '<label class="ved-check"><input type="checkbox" id="admPNo"' + (p.noScore ? ' checked' : '') + ' /> Не оценивать этот номер</label>' +
      '</div>' +
      '<div class="ved-row" style="margin-top:14px">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="admPReset"' + (p.registeredOnly ? ' disabled title="Ассессмент не начат — сбрасывать нечего"' : '') + '>Сбросить ассессмент</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="admPDel">Удалить номер</button>' +
      '</div></section>';
  }
  function wireNumberActions(p) {
    var nm = el('admPName');
    if (!nm) return;
    onCommit(nm, p.firstName, function (val) {
      call('setParticipantName', { bib: p.bib, firstName: val }).then(function (r) { return after(r, 'имя сохранено'); });
    });
    el('admPNo').addEventListener('change', function () {
      call('setNoScore', { bib: p.bib, value: this.checked ? '1' : '' }).then(function (r) { return after(r, 'отметка сохранена'); });
    });
    el('admPReset').addEventListener('click', function () {
      if (this.disabled) return;
      window.imp.confirm('Стереть ассессмент у ' + bib6(p.bib) + '? Ответы, оценки и ручные правки уровней ' +
        'по этому номеру исчезнут. Отменить это нельзя.', { confirmLabel: 'Стереть', danger: true }).then(function (yes) {
        if (yes) call('resetProgress', { bib: p.bib, confirm: 'RESET' }).then(function (r) {
          if (r && r.ok) closeCard();
          return after(r, 'ассессмент стёрт');
        });
      });
    });
    el('admPDel').addEventListener('click', function () {
      window.imp.confirm('Удалить номер ' + bib6(p.bib) + ' вместе с ответами и оценками? Отменить нельзя.',
        { confirmLabel: 'Удалить', danger: true }).then(function (yes) {
        if (yes) call('deleteParticipant', { bib: p.bib }).then(function (r) {
          if (r && r.ok) closeCard();
          return after(r, 'номер удалён');
        });
      });
    });
  }

  // ---------- карточка ----------

  // Свёрнутый блок: карточка не должна открываться полотном. Заголовок остаётся
  // видимым, чтобы было понятно, что внутри.
  function foldBlock(title, inner) {
    if (!inner) return '';
    return '<details class="cab-fold"><summary>' + esc(title) + '</summary>' + inner + '</details>';
  }

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

  // ОДИН ШАГ: заголовок, время, что спросили прямо, сам ответ. Отдельной функцией,
  // потому что рисуется в двух местах — под способностью, которую по нему судили, и в
  // полном ходе дня. Две отрисовки одного ответа однажды разошлись бы.
  function answerCard(d, s) {
    var el = d.elicited || {};
    var byKey = {};
    (d.windows || []).forEach(function (w) { byKey[w.key] = w; });
    var mech = d.mech || {}, mechAt = d.mechAt || {};
    var at = {};
    Object.keys(mech).forEach(function (k) { at[k] = mechAt[k] || ''; });
    (d.windows || []).forEach(function (w) {
      if (!w.legacy && String(w.text || '').trim()) at[w.key] = w.at || '';
    });
    var lf = listFactsOf(d.facts);
    var st = stepState(s, at, lf);
    var flags = el[s.key] || [];
    var w = byKey[s.key];
    var body;
    if (st.state !== 'done') {
      body = '<div class="cab-answer-text cab-dim">' +
        (st.state === 'skipped' ? 'не спрашивали: условие шага не сработало' : 'не дошёл') + '</div>';
    } else if (s.mech) {
      body = '<div class="cab-answer-text">' + mechHtml(s.mech, mech[s.mech]) + '</div>';
    } else {
      body = '<div class="cab-answer-text">' +
        (String((w && w.text) || '').trim() ? br(w.text) : '<i>промолчал</i>') + '</div>';
    }
    // ⚠ ЭТАП ЗАКРЫТ ПО ВРЕМЕНИ (решение владельца 03.10): ответ ушёл таким, каким был в
    // момент обнуления таймера. Отличить «не успел» от «дописал, но не нажал» нельзя,
    // поэтому пометка стоит на любом ответе этого этапа, записанном в момент закрытия.
    var tm = (d.process && d.process.timing && d.process.timing.stages) || {};
    var stT = s.sceneId && tm[s.sceneId];
    if (st.state === 'done' && stT && stT.timedOut) {
      body += '<p class="cab-dim">⏱ Этап закрыт по времени: участник мог не успеть дописать ответ, ' +
        'поэтому оценка может быть неточной.</p>';
    }
    return '<div class="cab-answer is-' + st.state + '">' +
      '<div class="cab-answer-head">' +
        '<span class="cab-answer-label">' + esc(cap(s.label)) + '</span>' +
        '<span class="cab-dim">' + esc(s.scene) + (st.at ? ' · ' + dt(st.at) : '') +
          (!s.mech && w && w.len ? ' · ' + w.len + ' знаков' : '') + '</span>' +
      '</div>' +
      (flags.length ? '<div class="cab-elicit" title="О чём спросили прямо — судья получает это машинно">спрошено прямо: ' + esc(flags.join(', ')) + '</div>' : '') +
      body + '</div>';
  }

  function stepByKey(k) {
    var out = null;
    STEPS.forEach(function (s) { if (s.key === k) out = s; });
    return out;
  }

  function answersBlock(d, bare) {
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
    var lf = listFactsOf(d.facts);

    var html = STEPS.map(function (s) { return answerCard(d, s); }).join('');

    // Окна ПРЕЖНЕГО маршрута — только у исторических строк и только заполненные.
    var legacy = (d.windows || []).filter(function (w) { return w.legacy; });
    if (legacy.length) {
      html += '<p class="cab-note">Ниже — прежний маршрут, ' + legacy.length + ' ' +
        plural(legacy.length, 'окно', 'окна', 'окон') +
        '. Этих окон в ассессменте больше нет: строка записана до перехода на v4.4.f.</p>' +
        legacy.map(function (w) {
          return '<div class="cab-answer is-legacy"><div class="cab-answer-head">' +
            '<span class="cab-answer-label">' + esc(w.label || w.key) + '</span>' +
            '<span class="cab-dim">' + (w.at ? dt(w.at) + ' · ' : '') + w.len + ' знаков</span></div>' +
            '<div class="cab-answer-text">' + (String(w.text).trim() ? br(w.text) : '<i>промолчал</i>') +
            '</div></div>';
        }).join('');
    }

    var body = '<p class="cab-note">Шаги в порядке маршрута — в том виде, в каком их видел участник.</p>' +
      html + factsHtml(d.facts) + picksHtml(d.picks);
    return bare ? body : block('Ход ассессмента и ответы', body);
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
        // Строка «Пол ПР-1 по поступку… выше пола поднимает только судья» снята 04.10: с 03.10
        // нижние гейты ПР-1 судья ставит по цитате (priorityReal, refusalReal), уровень
        // берётся по гейтам (v2Evidence_), пол его не держит.
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

  // Гейт в границу: G4 — это граница 3→4. Судья с 31.08 сам называет ближайший
  // непройденный гейт и чего в нём не хватило (Приложение Б, правило заполнения 2),
  // и говорить об этом нужно его словами, а не нашей догадкой по булевым.
  function bndOfGate(g) {
    var k = Number(String(g || '').replace(/[^0-9]/g, ''));
    return (k >= 2 && k <= 5) ? (k - 1) + 'to' + k : null;
  }
  // BOUNDARY_NAMES стоит в дательном падеже — он собран под фразу «остановился на границе
  // 3→4». В списке свидетельств граница это подпись, и падеж нужен другой.
  function bndWord(g) {
    var k = Number(String(g || '').replace(/[^0-9]/g, ''));
    return (k >= 2 && k <= 5) ? 'граница ' + (k - 1) + '→' + k : '';
  }

  // Блокирующая граница — то, из-за чего уровень не выше. Достаём из вердикта:
  // по четырём булевым видно, где участник остановился.
  // ⚠ ТОЛЬКО ДЛЯ ЗАПИСЕЙ ДО 31.08. С ревизии судейства ближайший непройденный гейт
  // приходит от судьи вместе с цитатами (v.out); догадка остаётся для прежних оценок,
  // где этого поля в записи нет.
  // ⚠ ГРАНИЦЫ ТОЛЬКО СВОЕЙ СПОСОБНОСТИ. Один судья возвращает по восемь булевых —
  // четыре на каждую способность навыка (mk1_* и mk2_*, ga1_* и ga2_*). Разбор брал
  // первый ключ, где встречалась граница, поэтому у МК-2 с уровнем L5 в карточке стояло
  // «остановился на границе 2→3» — это была непройденная граница МК-1 (поймано на живой
  // карточке 001003). Теперь ключ обязан начинаться с кода этой способности.
  function blockingOf(v, ability) {
    if (!v || !v.verdict) return null;
    var j = v.verdict, order = ['1to2', '2to3', '3to4', '4to5'];
    for (var i = 0; i < order.length; i++) {
      var k = ability ? (ability + '_' + order[i]) : null;
      if (k && k in j) { if (j[k] === false) return order[i]; continue; }
      // Судьи с одной способностью на задание кладут границу без префикса.
      if (!ability && j[order[i]] === false) return order[i];
    }
    return null;
  }

  // ── СВИДЕТЕЛЬСТВА ПО ГЕЙТАМ (Приложение Б, правка 31.08) ────────────────────
  // Главное, что дала ревизия судейства, и до этой правки оно не доезжало до экрана:
  // гейт считается пройденным только при ДОСЛОВНОЙ цитате из ответа (§10.1 шаг 3), и
  // цитаты лежат в записи по каждому пройденному гейту. Оценщик видел уровень и
  // обоснование в свободной форме — то есть должен был верить судье на слово и искать
  // основание в тексте ответа сам. Теперь основание стоит рядом с уровнем, а ниже —
  // ближайший непройденный гейт словами судьи: чего именно не хватило.
  // Станция названа тоже: уровень собирается из нескольких чтений, и цитаты обязаны
  // относиться к тому ответу, по которому уровень и поставлен.
  function evidHtml(out) {
    if (!out) return '';
    var ev = out['свидетельства'] || [];
    var unp = out['непройденный_гейт'];
    // ⚠ ПОЛЕ ПЕРЕИМЕНОВАНО (11.09, методология v7: «станция» → «этап»). Старые карточки
    // записаны прежним ключом, поэтому читаем оба: переименование не должно ослеплять
    // кабинет на уже собранных прогонах.
    var st = out['этап_решения'] || out['станция_решения'];
    if (!ev.length && !unp) return '';
    var h = '<div class="cab-ab-h">Свидетельства по гейтам' +
            (st ? ' <span class="cab-dim">— чтение: ' + esc(st) + '</span>' : '') + '</div>';
    h += ev.length
      ? '<ul class="cab-evid">' + ev.map(function (e) {
          return '<li><b>' + esc(e['гейт']) + '</b> <span class="cab-dim">' +
                 bndWord(e['гейт']) + '</span><br>«' + esc(e['цитата']) + '»</li>';
        }).join('') + '</ul>'
      : '<p class="cab-dim">Ни одного гейта с дословной цитатой: по протоколу это первый уровень.</p>';
    if (unp) {
      h += '<p class="cab-evid-un"><b>' + esc(unp['гейт']) + '</b> <span class="cab-dim">' +
           bndWord(unp['гейт']) + '</span> не пройден' +
           (unp['чего_не_хватило'] ? ': ' + esc(unp['чего_не_хватило']) : '') + '</p>';
    } else if (out['уровень'] === 5) {
      h += '<p class="cab-dim">Выше границ нет: взят верхний уровень.</p>';
    }
    return h;
  }

  // Контроль рядом с той способностью, которую он пере-судит, а не отдельным списком
  // в конце карточки: расхождение читается только в паре с основной оценкой.
  // Откуда читает контроль — подпись для человека. Способности, которой здесь нет,
  // достанется общая подпись: пропасть из карточки она уже не может.
  // Карта чтения по v8 (решение владельца 04.10, запрос 04→03): контроль МК-1 — у Агеева,
  // АК-1 — у Лемеха, в кофейне и в письме, ПР-2 и АК-2 — в письме. Контроля ГА-1 нет
  // (ГА-1 читает весь ответ), ПП-1 в письме стала вторым основным чтением.
  var CTRL_TITLE = {
    mk1: 'Контроль по этапу Агеева',
    ak1: 'Контроль по Лемеху, кофейне и письму (высшее из трёх)',
    pr2: 'Контроль по письму правлению',
    ak2: 'Контроль по письму правлению'
  };
  // ⚠ ЗАДАНИЯ СУДЬИ ПО СПОСОБНОСТЯМ — ДЛЯ ПЕРЕСУДА ОДНОГО ЧТЕНИЯ (запрос 04→03, решение
  // владельца 04.10). Повторяет V2_JUDGE_TASKS в code.js: АК-1 и АК-2 судит одно задание
  // `ak`, ПР-1 и ПР-2 — одно задание `pr`, поэтому их пересуд идёт парой, и кнопка это
  // называет. Бэкенд принимает taskId в judgeAnswers и ставит в очередь только его.
  var TASK_OF = { ak1: 'ak', ak2: 'ak', mk1: 'mk1', mk2: 'mk2', pp1: 'pp1', pp2: 'pp2',
                  pr1: 'pr', pr2: 'pr', ga1: 'ga1', ga2: 'ga2' };
  var CTRL_TASK_OF = { mk1: 'cross_mk1', ak1: 'cross_ak1', pr2: 'cross_pr2', ak2: 'cross_ak2' };
  var TASK_PAIR = { ak: 'АК-1 и АК-2', pr: 'ПР-1 и ПР-2' };
  function rejudgeHtml(a, hasCtrl) {
    var t = TASK_OF[a];
    if (!t) return '';
    return '<div class="cab-actions cab-rejudge-row">' +
      '<button type="button" class="btn btn-ghost btn-xs cab-rejudge" data-task="' + t + '"' +
        ' title="Поставить в очередь заново только это чтение. Платно: один вызов судьи">' +
        'Пересудить это чтение' + (TASK_PAIR[t] ? ' (' + TASK_PAIR[t] + ' вместе)' : '') + '</button>' +
      (hasCtrl && CTRL_TASK_OF[a] ? '<button type="button" class="btn btn-ghost btn-xs cab-rejudge" data-task="' + CTRL_TASK_OF[a] + '"' +
        ' title="Поставить в очередь заново только контрольное чтение этой способности">Пересудить контроль</button>' : '') +
    '</div>';
  }
  // Маркер устойчивости ПР-2 по этапам (запрос 04→03, решение владельца 04.10): в балл не
  // входит. Есть только у оценок на рубрике m-imp-v8.3 и новее; у старых записей поля нет —
  // строки нет. Прежнее булево heldUnderPressure на экран не выводится: оно сливало
  // «удержал» и «сменил, объяснив».
  function pressureHtml(v) {
    var m = (v && v.verdict && Array.isArray(v.verdict.pressureMarks)) ? v.verdict.pressureMarks
          : (v && v.out && Array.isArray(v.out['маркер_устойчивости'])) ? v.out['маркер_устойчивости'] : null;
    if (!m || !m.length) return '';
    return '<p class="cab-dim"><b>Устойчивость под давлением</b> (в балл не входит): ' + m.map(function (x) {
      return esc(x['этап'] || '—') + ' — ' + esc(String(x['значение'] || '—').replace(/_/g, ' '));
    }).join(' · ') + '</p>';
  }
  // Уровень второго чтения лежит в двух местах: у ПР-2 исторически в control, у
  // остальных в cross. Спрашиваем оба, чтобы не зависеть от этой развилки.
  function ctrlLevelOf(s, a) {
    var v = (s.cross && s.cross[a + 'Level'] !== undefined) ? s.cross[a + 'Level']
          : (s.control && s.control[a + 'Level'] !== undefined) ? s.control[a + 'Level'] : null;
    return (v === null || v === undefined || v === '') ? null : Number(v);
  }
  function ctrlWhyOf(s, a) {
    if (s.cross && s.cross[a + 'Reasoning']) return s.cross[a + 'Reasoning'];
    if (!s.control) return '';
    if (s.control[a + 'Reasoning']) return s.control[a + 'Reasoning'];
    // Блок control несёт ОДНО чтение, и чьё оно — видно по ключу «<способность>Level».
    // Общий reasoning принадлежит именно ему, а не любой способности, которую спросят.
    // Имени способности здесь нет намеренно: именно перечисление руками и стоило нам
    // двух невидимых контролей.
    if (s.control.reasoning && s.control[a + 'Level'] !== undefined) return s.control.reasoning;
    return '';
  }

  function ctrlPara(title, ctrlLv, mainLv, why) {
    var d2 = (ctrlLv != null && mainLv != null) ? (Number(ctrlLv) - Number(mainLv)) : null;
    var mark = (d2 !== null && Math.abs(d2) >= 2) ? ' <b class="cab-jitter">расхождение на ' + Math.abs(d2) + '</b>' : '';
    return '<div class="cab-ab-h">' + esc(title) + '</div>' +
      '<p>L' + ctrlLv + ' против основной ' + (mainLv === null ? '—' : 'L' + mainLv) + mark + '</p>' +
      (why ? '<div class="cab-ab-why">' + br(why) + '</div>' : '');
  }

  function scoresBlock(d) {
    var s = d.scores;
    // ⚠ БЕЗ ЧИСЛА ЗАДАНИЙ (правка 21.08). Здесь стояло «восемь», а заданий давно
    // одиннадцать: АК разделили на два, добавились кроссы. Число живёт в бэкенде
    // (V2_JUDGE_TASKS) и меняется, а строка на экране за ним не ходила — и обещала
    // фасилитатору не то. Сколько заданий поставилось, кабинет и так скажет по факту:
    // строка состояния под кнопкой считает обработанные.
    if (!s) return block('Оценка', '<p class="section-lead">Ещё не судили. Кнопка «Оценить» вверху карточки ставит в очередь все задания судьи.</p>');
    // ⚠ ЯРЛЫК, ИНДЕКС И АСИММЕТРИЯ (правка 31.08). Бэкенд считал их с ревизии судейства,
    // а кабинет показывал только числа: методология требует рядом с баллом ярлык (§9.4),
    // а разрыв внутри пары — отдельным показателем (§9.5), «в справке и в отчёте называются
    // ведущая и отстающая способности; рекомендация адресуется отстающей». Числа приходят
    // из бэкенда (s.labels, s.asym, s.index, s.profileLabel); кто в паре ведущий, кабинет
    // берёт из тех же уровней — это не второе правило, а подпись к присланному разрыву.
    var pairOf = function (k) {
      var ab = Object.keys(ABILITY_NAMES).filter(function (a) { return a.indexOf(k) === 0; });
      return ab.sort(function (x, y) { return (s.levels[y] || 0) - (s.levels[x] || 0); });
    };
    var inner = '<div class="cab-skills-row">' + Object.keys(SKILL_NAMES).map(function (k) {
      var v = s.skills[k];
      var lab = (s.labels || {})[k];
      var gap = (s.asym || {})[k];
      var pair = pairOf(k), tip = SKILL_NAMES[k] + ' — сумма двух способностей, от 2 до 10';
      if (gap >= 2 && pair.length === 2) {
        tip += '. Развит неровно: разрыв ' + gap + '. Ведущая — ' + ABILITY_NAMES[pair[0]] +
               ' (L' + s.levels[pair[0]] + '), отстающая — ' + ABILITY_NAMES[pair[1]] +
               ' (L' + s.levels[pair[1]] + '). Рекомендация адресуется отстающей';
      }
      return '<div class="cab-skill-box' + (gap >= 2 ? ' is-asym' : '') + '" title="' + esc(tip) + '">' +
        '<span>' + SKILL_NAMES[k] + '</span><b>' + (v === null ? '—' : v) + '</b>' +
        '<i>' + (lab || '—') + (gap >= 2 ? ' · разрыв ' + gap : '') + '</i></div>';
    }).join('') + '<div class="cab-skill-box is-total" title="Сумма всех десяти способностей' +
      '">' +
      '<span>Итог</span><b>' + (s.total === null ? '—' : s.total) + '</b><i>/50' +
      // ⚠ ИНДЕКС УБРАН ИЗ КАРТОЧКИ (решение владельца 11.09): надстройка над итогом,
      // та же величина в другой шкале. Итог и ярлык профиля остаются.

      (s.profileLabel ? ' · ' + s.profileLabel : '') + '</i></div></div>';

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

    // ── ДЕСЯТЬ СПОСОБНОСТЕЙ, КАЖДАЯ СВЁРНУТА ────────────────────────────────
    // Порядок внутри один и тот же (решение владельца 12.08): поднавык и уровень в
    // заголовке, а под ним — обоснование судьи и ТОТ ОТВЕТ, по которому оно дано.
    // Раньше обоснование лежало отдельно, а ответы — другим блоком выше, и чтобы
    // понять, за что поставлен уровень, приходилось листать карточку целиком.
    // Свёрнуто по умолчанию: развёрнутые десять способностей с текстами ответов
    // превращали карточку в километровое полотно.
    var allFlags = (s.flags || []);
    inner += '<div class="cab-abilities">' + Object.keys(ABILITY_NAMES).map(function (a) {
      var lv = s.levels[a], v = s.verdicts[a] || {};
      var out = v.out || null;
      var unp = out && out['непройденный_гейт'];
      // Граница — из слов судьи, если он их сказал; иначе прежняя догадка по булевым.
      var bnd = (unp && bndOfGate(unp['гейт'])) || blockingOf(v, a);
      var missing = unp ? String(unp['чего_не_хватило'] || '').trim() : '';
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
          // Немонотонные случаи v10: верх бывает пройден в обход границы 3→4, и писать
          // «все границы пройдены» тогда неправда.
          (bnd
            ? (lv === 5 ? ' · верх пройден в обход ' + BOUNDARY_NAMES[bnd]
                        : ' · остановился на ' + BOUNDARY_NAMES[bnd] +
                          (missing ? ': ' + esc(missing) : ''))
            : (lv === 5 ? ' · все границы пройдены' : '')) +
          (v.stable === false ? ' · <b class="cab-jitter">граница дрожит</b>' : '');

      var ctl = '';
      if (canOverride[a]) {
        // ⚠ ПРИНЯТЬ КОНТРОЛЬНЫЙ УРОВЕНЬ — ОДНОЙ КНОПКОЙ (правка 21.09). Такая кнопка
        // была и пропала при какой-то переделке карточки: в листе правок остались строки
        // с пометкой via=control и причиной «принята контрольная оценка», а прислать эту
        // пометку кабинету стало нечем. Бэкенд её принимает по-прежнему (doSetScoreOverride,
        // поле via), поэтому возвращаем ровно её, а не новый механизм. Причину пишем сами:
        // она называет оба уровня, и через месяц видно, что это не ручная правка.
        var cLv = ctrlLevelOf(s, a);
        var acceptBtn = (!isOv && cLv !== null && lv !== null && cLv !== lv)
          ? '<button type="button" class="btn btn-ghost btn-xs cab-ov-ctrl" data-lv="' + cLv +
            '" data-main="' + lv + '">Принять контрольный L' + cLv + '</button> '
          : '';
        ctl = '<div class="cab-ov" data-ab="' + a + '">' +
          (isOv
            ? '<button type="button" class="btn btn-ghost btn-xs cab-ov-clear">Вернуть уровень судьи</button>'
            : acceptBtn + '<span class="cab-dim">поставить свой:</span> ' +
              [1, 2, 3, 4, 5].map(function (n) {
                return '<button type="button" class="btn btn-ghost btn-xs cab-ov-set" data-lv="' + n + '">L' + n + '</button>';
              }).join(' ') +
              // Причина обязательна: в листе ScoreOverrides для неё есть колонка, и
              // без неё правка через месяц неотличима от опечатки.
              '<input type="text" class="cab-inp cab-ov-reason" placeholder="почему — без этого не поставлю" />') +
          '</div>';
      }

      // У ПР-1 судья отвечает не границами, а названными маркерами, поэтому строка «где
      // остановился» у него пустая. Объясняем потолок словами: на живых прогонах ПР-1
      // упирался в 3 у всех пяти, и без этой строки причина в карточке не видна.
      // ⚠ ТОЛЬКО КОГДА СУДЬЯ САМ НЕ СКАЗАЛ (правка 31.08). С ревизии он называет
      // непройденный гейт и чего не хватило; два ответа на один вопрос рядом — это
      // ровно тот класс расхождения, который мы ловим весь проект.
      if (a === 'pr1' && !isOv && !missing && v.verdict && lv !== null && lv < 4) {
        var vp = v.verdict;
        // Ветка «перебор рамки не оплачен» снята 04.10: потолок ПР-1 по рамке снят 13.08,
        // fitsFrame уходит флагом и уровня не ограничивает.
        if (vp.ruleReal === false) line += ' · выше L3 не поднялся: принцип отсечения не сформулирован';
      }
      if (a === 'pr1' && !isOv && !missing && v.verdict && lv === 5 && v.verdict.ruleReal === false) {
        line += ' · верх пройден в обход границы 3→4: ресурс перераспределён без правила';
      }

      var mineAll = flagsOf(allFlags, a);
      // ⚠ ЗЕЛЁНЫЙ ФЛАГ НЕ ЗОВЁТ ЧЕЛОВЕКА (11.09). Он отмечает сильную сторону ответа, а не
      // сомнение судьи: «приоритет назван вместе с метрикой». Считать его вместе с прочими
      // значило бы звать оценщика туда, где перечитывать нечего.
      var green = mineAll.filter(function (f) { return f.kind === 'green'; });
      var mine = mineAll.filter(function (f) { return f.kind !== 'green'; });
      var steps = ABILITY_STEPS[a] || { main: [], control: [] };
      var stepsHtml = steps.main.map(function (k) {
        var st = stepByKey(k);
        return st ? answerCard(d, st) : '';
      }).join('');
      // ⚠ У ГА-1 судья читает ВЕСЬ ДЕНЬ, а не только окна ниже (v10 стр. 1257, правка
      // 13.08). Без этой строки карточка утверждала бы, что материала два окна, — и
      // оценщик не понимал бы, откуда взялось обоснование про письмо правления.
      // Список приходит из scenes.js, чтобы у кабинета не было своего мнения.
      var scopeNote = '';
      if (((window.imp.scenes || {}).abilityScope || {})[RU_OF[a]] === 'day') {
        scopeNote = '<p class="cab-dim">Область оценки по методологии — весь ответ участника, ' +
          'все поля всех сцен. Ниже раскрыты основные окна; остальные ответы ассессмента судья тоже читал ' +
          'и мог опереться на любой из них.</p>';
      }
      var ctrlHtml = steps.control.map(function (k) {
        var st = stepByKey(k);
        return st ? '<p class="cab-dim">Контрольное чтение — по этому же ответу судили другим заданием:</p>' + answerCard(d, st) : '';
      }).join('');

      // ⚠ ВТОРЫЕ ЧТЕНИЯ ПОКАЗЫВАЮТСЯ ВСЕ (правка 21.09, замечание владельца «не понимаю,
      // где оценка контрольной проверки»). Здесь стояли три ветки — pr2, ga1, ak2, — и
      // каждая была написана руками под свою способность. Контрольных заданий пять:
      // cross_ga1, cross_pp1, cross_pr2, cross_ak1, cross_ak2. Два чтения — АК-1 и ПП-1 —
      // считались, оплачивались, ложились в запись и не показывались никому. У 033011
      // контроль ПП-1 стоял на уровень выше основной, и этого не видел никто.
      // Теперь блок не перечисляет способности, а спрашивает данные: есть второе чтение —
      // показываем. Новая способность появится сама, без правки кабинета.
      var ctrlLv = ctrlLevelOf(s, a), ctrlWhy = ctrlWhyOf(s, a);
      var ctrlLine = (ctrlLv === null) ? ''
        : ctrlPara(CTRL_TITLE[a] || 'Контрольное чтение по другому ответу', ctrlLv, lv, ctrlWhy);

      return '<details class="cab-ab' + (isOv ? ' is-overridden' : '') + (mine.length ? ' has-flag' : '') + '">' +
        '<summary>' +
          '<span class="cab-ab-name">' + esc(ABILITY_NAMES[a]) + '</span>' +
          // Пустой ответ судья не оценивает (уровня нет); называем это словами (решение
          // владельца 03.10): «—» читалось как «ещё не судили».
          '<span class="cab-level">' + ((lv === null || lv === '' || lv === undefined)
            ? ((v.empty || (v.verdict && v.verdict.empty) || v.source === 'deterministic') ? 'не удалось оценить' : '—')
            : 'L' + lv) + '</span>' +
          (mine.length ? '<span class="cab-ab-flag">нужен человек</span>' : '') +
          '<span class="cab-ab-line">' + line + '</span>' +
        '</summary>' +
        '<div class="cab-ab-body">' +
          (isOv && o.reason ? '<div class="cab-ov-why">Почему вы поставили свой: ' + br(o.reason) + '</div>' : '') +
          (mine.length ? '<ul class="cab-flags">' + mine.map(function (x) {
            return '<li><b>' + esc(x.code) + '</b> — ' + esc(x.text) + '</li>';
          }).join('') + '</ul>' : '') +
          (green.length ? '<ul class="cab-flags cab-flags-green">' + green.map(function (x) {
            return '<li><b>' + esc(x.code) + '</b> — ' + esc(x.text) + '</li>';
          }).join('') + '</ul>' : '') +
          evidHtml(out) +
          (reasoning ? '<div class="cab-ab-h">Обоснование судьи</div><div class="cab-ab-why">' + br(reasoning) + '</div>'
                     : '<p class="cab-dim">Обоснования нет: уровень посчитан кодом или задание не отработало.</p>') +
          ctrlLine +
          (a === 'pr2' ? pressureHtml(v) : '') +
          rejudgeHtml(a, ctrlLv !== null || !!CTRL_TASK_OF[a]) +
          (stepsHtml ? '<div class="cab-ab-h">Ответ, по которому это сказано</div>' + scopeNote + stepsHtml : '') +
          ctrlHtml +
          ctl +
        '</div></details>';
    }).join('') + '</div>';

    // ⚠ ОБЩЕГО СПИСКА КОНТРОЛЕЙ ВНИЗУ БОЛЬШЕ НЕТ: каждое второе чтение стоит внутри
    // своей способности, рядом с основной оценкой. Прежде три абзаца лежали в конце
    // карточки, и чтобы понять, к чему относится «L5 против основной L3», надо было
    // возвращаться наверх.

    // ⚠ РУБРИКА НАЗЫВАЕТСЯ ВСЛУХ (правка владельца 23.08). Версия правил оценки в
    // записи хранилась всегда, а кабинет её не показывал: после подъёма правил в
    // таблице рядом оказывались баллы двух разных рубрик, и на экране про это не
    // говорилось ничего. Отказа по версии правил в судействе нет и не нужно — ответы
    // остаются судимыми, — но сравнивать такие баллы между собой нельзя.
    // Пусто = оценка получена до 23.08, когда версию правил в лист не писали.
    var rubNow = (d.versions && d.versions.expectRubric) || s.expectRubric || '';
    var rubOld = rubNow && s.rubricVersion !== rubNow;
    inner += '<p class="cab-dim">Судья: ' + esc(s.judgeModel || '—') + ' · ' + dt(s.judgedAt) +
      ' · правила ' + esc(s.rubricVersion || 'не записаны') +
      (rubOld ? ' <b class="cab-warn-inline">— не нынешние (' + esc(rubNow) + '), с новыми оценками не сравнивать</b>' : '') +
      ' · сцены ' + esc(s.scenesVersion) + ' · кейс ' + esc(s.caseVersion) + '</p>';
    // Подпись «Балл не правится автоматически… непройденная нижняя граница обнуляет всё
    // выше» снята 04.10 (решение владельца): вторая её половина противоречила v8 §10.1 шаг 6
    // (v8:369) — уровень по самому высокому пройденному гейту, пропуск ниже даёт флаг.
    return block('Оценка', inner);
  }

  function flagsBlock(d, bare) {
    var f = (d.scores && d.scores.flags) || [];
    var body = f.length
      ? '<p class="cab-note">Флаг — приглашение перечитать ответ, а не ошибка участника и не поправка к баллу. Каждый флаг стоит и внутри своей способности.</p>' +
        '<ul class="cab-flags">' + f.map(function (x) {
          return '<li><b>' + esc(x.code) + '</b> — ' + esc(x.text) + '</li>';
        }).join('') + '</ul>'
      : '<p class="section-lead">Ни одного. Зависимости §9 и расхождения с контролем в пределах нормы.</p>';
    return bare ? body : block('Флаги', body);
  }

  function processBlock(d, bare) {
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
    // Таймер (03.10): время потока и этапы, закрытые по времени.
    if (p.timing && p.timing.totalMin) {
      var SS = (window.imp.scenes && window.imp.scenes.scenes) || [];
      var shortOf = function (id) {
        var ix = -1, n = 0;
        SS.forEach(function (sc) { if (!sc.hidden) { if (sc.id === id) ix = n; n++; } });
        var nm = ((window.imp.scenes || {}).stageShort || [])[ix];
        return ix >= 0 ? (ix + 1) + '. ' + (nm || id) : id;
      };
      var out = Object.keys(p.timing.stages || {}).filter(function (id) { return p.timing.stages[id].timedOut; });
      inner += '<p><span class="cab-k">Таймер:</span> ' + (p.timing.totalMin / 60).toString().replace('.', ',') + ' ч · ' +
        (out.length ? '<b>закрыты по времени:</b> ' + out.map(function (id) { return esc(shortOf(id)); }).join(', ')
                    : 'все этапы закончены до конца времени') + '</p>';
    }
    inner += '<p><span class="cab-k">Версии:</span> сцены ' + esc(d.versions.scenes) + ', кейс ' + esc(d.versions.caseVer) +
      ', портфель ' + esc(d.versions.backlog) +
      (d.versions.scenes !== d.versions.expectScenes || d.versions.caseVer !== d.versions.expectCase
        ? ' <b class="cab-warn-inline">— расходятся с судейскими (' + esc(d.versions.expectScenes) + ' / ' + esc(d.versions.expectCase) + '): судейство откажет</b>'
        : '') + '</p>';
    inner = '<p class="cab-note">Ничто из этого блока в уровень не входит.</p>' + inner;
    return bare ? inner : block('Процесс', inner);
  }

  function openCard(p) {
    detail.style.display = 'flex';
    detail.setAttribute('aria-hidden', 'false');
    detailBody.innerHTML = '<p class="fac-detail-loading">Загружаю карточку…</p>';
    document.getElementById('cabDetailTitle').textContent = bib6(p.bib) + ((p.fio || personByBib(p.bib).fio) ? ' · ' + (p.fio || personByBib(p.bib).fio) : '');
    window.imp.callApi('v2Detail', { password: pw, bib: p.bib }).then(function (d) {
      var who = personByBib(p.bib);
      // Номер есть, а ассессмента нет: карточка из одних действий с номером.
      if (d && d.error === 'not_found') {
        detailBody.innerHTML = '<p class="section-lead">Ассессмент по этому номеру ещё не начат.</p>' + numberActionsHtml(who);
        wireNumberActions(who);
        return;
      }
      if (!d || !d.ok) { detailBody.innerHTML = '<p class="fac-detail-loading">Не удалось загрузить карточку.</p>'; return; }
      var q = d.queue || {};
      // Недобранная очередь: задания уже стоят в листе и ждут разбора. Её отдельная
      // кнопка не ставит ничего заново, а доедает оставшееся (решение владельца 03.10).
      // Без неё единственным способом дооценить человека было заплатить за весь набор
      // ещё раз (033011, 20.09: доехали 2 из 13).
      var qLeft = (q.queued || 0) + (q.running || 0);
      // Упавшие задания (запрос 04→03, список — бэкенд @318): имена без повторов, снятые
      // задания (retired, например прежний контроль ПП-1) не пересуживаются — их в списке
      // судьи больше нет, judgeAnswers ничего бы не поставил.
      var failedIds = [];
      (q.failed || []).forEach(function (f) {
        if (f.retired) return;
        if (failedIds.indexOf(f.taskId) < 0) failedIds.push(f.taskId);
      });
      detailBody.innerHTML =
        '<div class="cab-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" id="cabJudge">' +
            (d.scores ? 'Пересудить всё' : 'Оценить') + '</button>' +
          (qLeft ? '<button type="button" class="btn btn-ghost btn-sm" id="cabJudgeResume" ' +
            'title="Разобрать то, что уже стоит в очереди. Сделанные задания заново не считаются и не оплачиваются">' +
            'Продолжить оценку (' + qLeft + ')</button>' : '') +
          (failedIds.length && !qLeft ? '<button type="button" class="btn btn-ghost btn-sm" id="cabJudgeFailed" ' +
            'title="Поставить заново только задания в ошибке: ' + esc(failedIds.join(', ')) + '. Остальные оценки не трогаются">' +
            'Пересудить упавшие (' + failedIds.length + ')</button>' : '') +
          // ⚠ ЗАГЛУШКА (решение владельца 03.10): кнопка видна, но не работает — генератор
          // отчёта ещё не подключён к оценкам (см. стрим 05). Показывает, где будет отчёт.
          '<button type="button" class="btn btn-ghost btn-sm adm-soon" disabled title="Скоро: генератор отчёта ещё не подключён к оценкам">Отчёт участника · скоро</button>' +
          '<span class="cab-dim" id="cabJudgeState">' +
            (qLeft ? 'в очереди: ' + qLeft + ' из ' + q.total
              : failedIds.length ? 'заданий с ошибкой: ' + failedIds.length : '') + '</span>' +
        '</div>' +
        // ⚠ ПОРЯДОК: ОЦЕНКА ПЕРВОЙ (решение владельца 12.08). Главное, с чем работает
        // фасилитатор, — оценка, и внутри каждой способности лежит всё, что нужно для
        // решения: обоснование судьи, ответ, по которому оно дано, контроль и флаги.
        // Ход дня целиком остался, но ниже и свёрнутым: он нужен, когда смотришь не
        // «за что этот уровень», а «как прошёл день». Прежде порядок был обратный, и
        // оценка оказывалась за экраном ответов.
        scoresBlock(d) + foldBlock('Ход ассессмента и все ответы', answersBlock(d, true)) +
        foldBlock('Флаги целиком', flagsBlock(d, true)) +
        foldBlock('Процесс и версии', processBlock(d, true)) +
        numberActionsHtml(who);
      // Обе кнопки гасим на время работы вместе: пока цикл идёт, вторая привела бы
      // к двум разборам одной очереди с одного экрана.
      var judgeBtn = document.getElementById('cabJudge');
      var resumeBtn = document.getElementById('cabJudgeResume');
      var failedBtn = document.getElementById('cabJudgeFailed');
      var btns = [judgeBtn, resumeBtn, failedBtn];
      if (failedBtn) {
        failedBtn.addEventListener('click', function () {
          window.imp.confirm('Пересудить упавшие задания (' + failedIds.length + ')? Остальные оценки не трогаются; ' +
            'по одному платному вызову судьи на задание.', { confirmLabel: 'Пересудить' })
            .then(function (yes) { if (yes) judge(p.bib, btns, failedIds); });
        });
      }
      judgeBtn.addEventListener('click', function () { judge(p.bib, btns); });
      if (resumeBtn) {
        resumeBtn.addEventListener('click', function () {
          drainQueue(p.bib, btns, document.getElementById('cabJudgeState'));
        });
      }
      detailBody.querySelectorAll('.cab-rejudge').forEach(function (b) { btns.push(b); });
      detailBody.querySelectorAll('.cab-rejudge').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          var t = b.getAttribute('data-task');
          window.imp.confirm('Пересудить только это задание? Остальные оценки не трогаются; один платный вызов судьи.',
            { confirmLabel: 'Пересудить' }).then(function (yes) { if (yes) judge(p.bib, btns, t); });
        });
      });
      wireOverrides(p.bib);
      wireNumberActions(who);
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
      // Принять контрольный уровень: причина пишется сама, пометка via=control.
      var acc = box.querySelector('.cab-ov-ctrl');
      if (acc) {
        acc.addEventListener('click', function () {
          var lvC = acc.getAttribute('data-lv'), lvM = acc.getAttribute('data-main');
          call('setScoreOverride', { bib: bib, ability: ability, level: lvC, via: 'control',
            reason: 'принята контрольная оценка: контроль L' + lvC + ', судья L' + lvM })
            .then(function (r) {
              if (r && r.ok) { say('принят контрольный уровень'); return refresh().then(reopen); }
              return after(r);
            });
        });
      }
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

  // Разбор очереди: берём по три задания за вызов, пока свои не кончатся. Числа
  // заданий здесь нет намеренно: состав живёт в бэкенде (V2_JUDGE_TASKS), и прежнее
  // «восемь» разошлось с ним молча.
  // Триггер по времени в живом деплое недоступен (нет права script.scriptapp),
  // поэтому цикл здесь — не костыль, а рабочий путь: каждый вызов укладывается
  // в шесть минут исполнения Apps Script с запасом.
  //
  // ⚠ ВЫДЕЛЕНО ИЗ judge() 03.10 (перенос из ветки 20.09, решение владельца 03.10).
  // Постановка в очередь и её разбор — разные действия с разной ценой, а кнопка была
  // одна. judgeAnswers переписывает в `queued` ВСЕ задания, то есть любая пауза стоила
  // полного пересуда. «Продолжить оценку» зовёт только этот разбор.
  // noOpen — оценка нескольких подряд (judgeMany): карточку в конце не открывать.
  function drainQueue(bib, btns, state, noOpen) {
    var lock = function (on) { (btns || []).forEach(function (b) { if (b) b.disabled = on; }); };
    lock(true);
    // Сколько заданий оставалось на прошлом круге и сколько кругов подряд без движения:
    // по этим двум числам цикл решает, ждать дальше или сдаться (см. ветку обрыва ниже).
    var lastLeft = Infinity, stall = 0;
    var step = function (n) {
      state.textContent = 'оцениваю… (заданий обработано: ' + n + ')';
      // ⚠ bib ОБЯЗАТЕЛЕН (правка владельца 21.08). Без него бэкенд разбирал очередь
      // подряд, кто бы в ней ни лежал: нажимаешь «Оценить» у 001002, а судится 001001 —
      // чужими деньгами и в чужой отчёт, — а кабинет считает эти задания сделанными для
      // 1002 и в конце открывает его карточку, где баллов по-прежнему нет.
      return window.imp.callApi('runJudgeQueue', { password: pw, max: 3, bib: bib }).then(function (r) {
        if (!r || !r.ok) {
          // ⚠ ОБРЫВ ОЖИДАНИЯ — НЕ ОТКАЗ (починка 01.09). Здесь цикл прекращался словами
          // «сбой очереди», и участник оставался с недобранной очередью: карточка висит
          // неоценённой, а в листе десять заданий ждут. Apps Script при этом продолжает
          // работу — браузер лишь перестал ждать ответа. Поэтому спрашиваем состояние
          // очереди и продолжаем, пока она движется; сдаёмся только если три круга подряд
          // без движения.
          return window.imp.callApi('v2Detail', { password: pw, bib: bib }).then(function (d) {
            var q = d && d.queue;
            if (!q) { state.textContent = 'бэкенд не ответил — нажмите «Продолжить оценку»'; lock(false); return; }
            var left = (q.queued || 0) + (q.running || 0);
            if (left <= 0) {
              lock(false);
              state.textContent = 'готово: заданий сделано ' + (q.done || 0) +
                (liveErrors(q) ? ' · с ошибками: ' + liveErrors(q) : '');
              return refresh(!!noOpen).then(function () { if (!noOpen) openCard({ bib: bib, fio: '' }); });
            }
            if (left < lastLeft) { lastLeft = left; stall = 0; }
            else if (++stall >= 3) {
              lock(false);
              // ⚠ ЗОВЁМ ИМЕННО «ПРОДОЛЖИТЬ», А НЕ «ОЦЕНИТЬ»: задания уже стоят в листе,
              // и «Оценить» поставило бы их заново — вместе с теми, что сделаны.
              state.textContent = 'очередь не двигается: осталось ' + left +
                ' заданий · нажмите «Продолжить оценку» или посмотрите ошибки в листе JudgeQueue';
              return;
            }
            state.textContent = 'оцениваю… (в очереди осталось ' + left + ')';
            return step(n);
          });
        }
        var total = n + (r.done || 0);
        if (r.errors && r.errors.length) {
          state.textContent = 'ошибки в заданиях: ' + r.errors.map(function (e) { return e.taskId + ' (' + e.error + ')'; }).join(', ');
        }
        // ⚠ СПИСОК ОБНОВЛЯЕТСЯ ПО ХОДУ, А НЕ ОДИН РАЗ В КОНЦЕ (правка 18.09, замечание
        // владельца «кабинет обновляется плохо когда оно идет»). Цикл судейства живёт до
        // десяти минут, и всё это время строка участника в списке показывала состояние на
        // момент нажатия: ни счётчика заданий, ни появляющихся баллов. refresh молчаливый —
        // общую строку состояния он не трогает, чтобы не перебивать «оцениваю…».
        if (r.left > 0) {
          state.textContent = 'оцениваю… (сделано ' + total + ', осталось ' + r.left + ')';
          return refresh(true).then(function () { return step(total); });
        }
        lock(false);
        // Чужие недобранные строки называем вслух: они в листе есть, но этой кнопкой
        // не разбираются — иначе фасилитатор решит, что очередь пуста.
        var alien = Math.max(0, (r.leftAll || 0) - (r.left || 0));
        // Подобранные застрявшие строки называем: фасилитатор должен понимать, почему
        // заданий сделано больше или меньше, чем он ожидал.
        var re = (r.reclaimed || []).length
          ? ' · подобрано зависших: ' + r.reclaimed.length : '';
        state.textContent = 'готово: ' + total + ' заданий' + re +
          (alien ? ' · в очереди осталось ' + alien + ' у других участников' : '');
        return refresh(!!noOpen).then(function () { if (!noOpen) openCard({ bib: bib, fio: '' }); });
      });
    };
    return step(0);
  }

  // Судейство с нуля: ставим все задания в очередь и разбираем её. Кнопка платная —
  // judgeAnswers переписывает в `queued` и те строки, что уже сделаны, то есть счёт
  // идёт заново за все задания. Поэтому у того, у кого оценка уже есть, она
  // называется «Пересудить всё».
  // taskId — пересуд одного задания (04.10): бэкенд ставит в очередь только его.
  function judge(bib, btns, taskId) {
    var state = document.getElementById('cabJudgeState');
    var lock = function (on) { (btns || []).forEach(function (b) { if (b) b.disabled = on; }); };
    lock(true);
    // Несколько заданий (упавшие) ставятся по одному вызову на каждое, затем общий разбор.
    var ids = Array.isArray(taskId) ? taskId.slice() : (taskId ? [taskId] : [null]);
    var enqueue = function (i) {
      var args = { password: pw, bib: bib };
      if (ids[i]) { args.taskId = ids[i]; state.textContent = 'ставлю в очередь: ' + ids[i] + (ids.length > 1 ? ' (' + (i + 1) + ' из ' + ids.length + ')' : ''); }
      return window.imp.callApi('judgeAnswers', args).then(function (res) {
        if (res && res.ok && i + 1 < ids.length) return enqueue(i + 1);
        return res;
      });
    };
    enqueue(0).then(function (res) {
      if (!res || !res.ok) {
        lock(false);
        var e = res && res.error ? res.error : 'не удалось поставить в очередь';
        state.textContent = e === 'scenes_version_mismatch'
          ? 'версия сцен в ответах не совпадает с судейской — судейство отказано (это защита, а не сбой)'
          : e === 'no_score' ? 'участник помечен «не оценивать»' : String(e);
        return;
      }
      return drainQueue(bib, btns, state);
    });
  }

  function closeCard() {
    detail.style.display = 'none';
    detail.setAttribute('aria-hidden', 'true');
  }

  // ---------- запуск ----------

  el('cabPassBtn').addEventListener('click', login);
  el('cabPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); login(); } });
  window.addEventListener('hashchange', function () {
    tab = 'people'; shareOpen = false;
    if (findEl && findEl.value) findEl.value = '';
    if (pw) render();
  });
  if (findEl) findEl.addEventListener('input', function () { if (pw) render(); });
  el('admOut').addEventListener('click', function (e) {
    e.preventDefault();
    try { sessionStorage.removeItem(PW_KEY); } catch (x) {}
    location.href = 'administrator.html';
  });
  el('vedQrFull').addEventListener('click', function () { el('vedQrFull').style.display = 'none'; });
  el('cabDetailClose').addEventListener('click', closeCard);
  detail.addEventListener('click', function (e) { if (e.target === detail) closeCard(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && detail.style.display !== 'none') closeCard();
  });

  (function auto() {
    var saved = '';
    try { saved = sessionStorage.getItem(PW_KEY) || ''; } catch (e) {}
    if (!saved) return;
    el('cabPass').value = saved;
    login();
  })();
})();

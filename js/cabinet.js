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
// «Сейчас» словами и колонкой «Нужен человек» с причиной, кнопки «оценить» и «пересудить».
// Карточка участника с 15.10 — отдельная страница (kartochka.html, js/kartochka.js): строка открывает её в новой вкладке.
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


  function num(n) { return String(Math.round(Number(n) * 10) / 10).replace('.', ','); }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }


  // ── КАБИНЕТ АДМИНИСТРАТОРА ЧЕРЕЗ ПОТОКИ (решение владельца 03.10) ─────────────
  // Было четыре плоских вкладки: оценка всех участников разом, номера, потоки, ведущие.
  // Стало, как у ведущего: «Все потоки» → поток (участники с оценкой и настройки) и
  // «Ведущие»; поиск участника по всем потокам — в шапке. Вкладки «Номера участников»
  // нет: имя, «не оценивать», сброс и удаление номера — в карточке участника, внизу (с 15.10 — страница kartochka.html).
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

  // ⚠ ВХОД — ЛЁГКОЙ ПРОВЕРКОЙ ПАРОЛЯ, СПИСОК — УЖЕ ВНУТРИ (замечание владельца 06.10: при
  // перезагрузке «Проверяю…» висело десятки секунд и могло кончиться «бэкенд не ответил»).
  // Пароль проверялся загрузкой всего списка (v2List) — самым тяжёлым вызовом кабинета, с
  // пределом ожидания 30 с. Теперь verifyPassword (только роль), кабинет открывается сразу,
  // список догружается с одним повтором. Пароль по-прежнему живёт в sessionStorage этой
  // вкладки: перезагрузка входит сама, закрытая вкладка его забывает, «Выйти» стирает.
  function login(auto) {
    var val = (el('cabPass').value || '').trim();
    if (!val) return;
    var btn = el('cabPassBtn'), err = el('cabPassErr');
    btn.disabled = true; btn.textContent = auto ? 'Вхожу…' : 'Проверяю…';
    window.imp.callApi('verifyPassword', { password: val }).then(function (res) {
      btn.disabled = false; btn.textContent = 'Войти →';
      gate.classList.remove('is-auto');
      if (!res || !res.ok) {
        err.textContent = !res
          ? 'Сервер не ответил. Первый вызов после паузы бывает долгим — нажмите «Войти» ещё раз.'
          : (res.error === 'unauthorized' ? 'Неверный пароль.'
                                          : 'Сервер ответил ошибкой: ' + String(res.error || 'без кода') + '.');
        err.style.display = '';
        // Сохранённый пароль, который сервер отверг, больше не подставляем.
        if (res && res.error === 'unauthorized') { try { sessionStorage.removeItem(PW_KEY); } catch (e) {} el('cabPass').value = ''; }
        return;
      }
      err.style.display = 'none';
      pw = val;
      try { sessionStorage.setItem(PW_KEY, val); } catch (e) {}
      if (res.role && String(res.role) !== 'full') { location.replace('vedushchiy.html'); return; }
      role = String(res.role || 'full');
      gate.style.display = 'none';
      content.style.display = '';
      main.innerHTML = '<p class="cab-dim">Загружаю потоки и участников…</p>';
      var loadList = function (n) {
        return window.imp.callApi('v2List', { password: pw }).then(function (r) {
          if (r && r.ok) return r;
          if (r === null && n < 1) { say('сервер отвечает долго — загружаю ещё раз…'); return loadList(n + 1); }
          return r;
        });
      };
      loadFacs().then(function () { return loadList(0); }).then(function (r) {
        if (r && r.ok) { say(''); absorb(r); }
        else {
          main.innerHTML = '<p class="cab-dim">Список не загрузился: ' + (r === null ? 'сервер не ответил' : esc((r && r.error) || 'ошибка сервера')) +
            '.</p><p><button type="button" class="btn btn-ghost btn-sm" id="admReload">Загрузить ещё раз</button></p>';
          el('admReload').addEventListener('click', function () { main.innerHTML = '<p class="cab-dim">Загружаю…</p>'; refresh(); });
        }
        startPoll();
      });
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
      if (document.hidden || judging) return;
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
  // Доп. оценка в работе — тоже «занят» (её строки с 15.10 считаются отдельно, queue.extra).
  function busy(p) { var q = p.queue, x = q && q.extra; return !!(q && (q.queued || q.running || (x && (x.queued || x.running)))); }
  // Судейство закрыто версией маршрута. Решает сервер (scenesJudgeable: нынешняя или
  // равнозначная версия, 06.10): строгое сравнение здесь прятало пересуд у прогонов .87,
  // которые судейство принимает. Старый сервер поля не шлёт — тогда прежнее сравнение.
  function versionsApart(p) {
    if (p.scenesJudgeable !== undefined) return !p.scenesJudgeable;
    return !!(p.scenesVersion && p.expectScenes && p.scenesVersion !== p.expectScenes);
  }
  // ⚠ ЖДЁТ РУЧНОЙ ПРОВЕРКИ — НЕ «ЖДЁТ ОЦЕНКИ» (рубрика m-imp-k1.0, запрос 04→03 от 09.10). У участника, у которого хоть
  // одна способность ждёт ручной проверки, итог пуст (сервер не выдаёт сумму по неполному набору), но он оценён:
  // пересуд проверку не снимет, а заплатит заново. Сервер отдаёт эти способности в pending; старый сервер поля не шлёт.
  function pendingOf(p) { return Array.isArray(p.pending) ? p.pending : []; }
  function scored(p) { return !(p.total === null || p.total === undefined) || pendingOf(p).length > 0; }
  // Ждёт оценки: закончил, оценки нет, не стоит в очереди, судейство ему не закрыто.
  function needsJudge(p) {
    return !!p.finished && !p.noScore && !scored(p) && !busy(p) && !versionsApart(p) && !!p.answered;
  }
  function pendingNames(list) {
    return list.map(function (a) { return String(ABILITY_NAMES[a] || a).split(' · ')[0]; }).join(', ');
  }

  // Причины, по которым строку нельзя оставить машине. Словом, а не значком.
  // Ошибки очереди без снятых из судейства заданий (retired, бэкенд @318): такую строку не
  // пересудить, на балл она не влияет — это след в листе, а не дело для человека (04.10).
  function liveErrors(q) {
    if (!q) return 0;
    if (!Array.isArray(q.failed)) return q.error || 0;
    return q.failed.filter(function (f) { return !f.retired && !f.extra; }).length;
  }
  // ⚠ ОЦЕНКА НЕ ЗАВЕРШЕНА (запрос 04→03 от 07.10, «делай» владельца 11.10). Задания с ошибкой есть, в работе — нет:
  // уровни в строке остались от прошлой оценки или неполные, и показывать человека «оценённым» нельзя (06.10 EF6F2A
  // показывался оценённым со старыми уровнями, пока его задания лежали с ошибкой «credit balance is too low»).
  function unfinished(p) { return !p.noScore && !busy(p) && liveErrors(p.queue) > 0; }
  function unfinishedWhy(p) {
    var f = ((p.queue && p.queue.failed) || []).filter(function (x) { return !x.retired && !x.extra; });
    return f.map(function (x) { return x.taskId + (x.error ? ': ' + x.error : ''); }).join('; ');
  }
  function unfinishedTag(p) {
    return '<span class="adm-wait" title="Задания судьи с ошибкой — ' + esc(unfinishedWhy(p)) +
      '. Откройте карточку: «Пересудить упавшие» ставит заново только их">оценка не завершена</span> ';
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
    if (liveErrors(p.queue)) out.push({ code: 'очередь', text: 'оценка не завершена — заданий с ошибкой: ' + liveErrors(p.queue) +
      ' (' + unfinishedWhy(p) + ')' });
    if (pendingOf(p).length) out.push({ code: 'проверка', text: 'ждут ручной проверки: ' + pendingNames(pendingOf(p)) +
      ' — итог не выведен, пока оценщик их не решит' });
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
    if (unfinished(p) && !p.skills) return unfinishedTag(p);
    if (!p.skills) {
      if (needsJudge(p)) return '<span class="adm-wait">ждёт оценки</span>';
      if (p.judged) return '<span class="cab-dim">оценено ' + p.judged + ' из 10</span>';
      return '<span class="cab-dim">—</span>';
    }
    return (unfinished(p) ? unfinishedTag(p) : '') + Object.keys(SKILL_NAMES).map(function (k) {
      var v = p.skills[k];
      return '<span class="cab-skill" title="' + SKILL_NAMES[k] + ' — сумма двух способностей, от 2 до 10">' +
        SKILL_NAMES[k] + '<b>' + (v === null || v === undefined ? '—' : v) + '</b></span>';
    }).join('');
  }
  // Предварительный итог (решение владельца 09.10): диапазон, пока способности ждут ручной проверки. Прежний бэкенд поля
  // не отдаёт — тогда как раньше: «на проверке» и сумма оценённых.
  function prelimText(pt) {
    if (!pt || pt.min === null || pt.min === undefined) return '';
    return pt.min === pt.max ? String(pt.min) : pt.min + '–' + pt.max;
  }
  // Итог — сумма десяти способностей, до 50; окончательный — когда оценены все, пока ждут проверки — предварительный.
  function totalCell(p) {
    if (!scored(p) || p.noScore) return '<span class="cab-dim">—</span>';
    // Итог при упавших заданиях — не итог этой оценки: пишем словами, цифру не показываем.
    if (unfinished(p)) return unfinishedTag(p);
    if (pendingOf(p).length) {
      var pr = prelimText(p.prelimTotal);
      return (pr ? '<b class="cab-total">' + pr + '</b><span class="cab-dim"> из 50 · предварительно</span> ' : '') +
        '<span class="adm-wait" title="Ждут ручной проверки: ' + esc(pendingNames(pendingOf(p))) +
        '. Итог станет окончательным, когда оценщик их решит">на проверке · ' + pendingOf(p).length + '</span>' +
        (!pr && p.confirmedSum !== null && p.confirmedSum !== undefined
          ? '<span class="cab-dim"> · оценено ' + p.confirmedSum + ', не итог</span>' : '');
    }
    return '<b class="cab-total">' + p.total + '</b><span class="cab-dim"> из 50</span>' +
      (p.stale ? ' <span class="cab-stale" title="Оценка вынесена по другому тексту ответа">устарело</span>' : '') +
      (p.overridden ? ' <span class="cab-ovmark" title="Уровней поставлено вами: ' + p.overridden + '">правил человек</span>' : '');
  }

  function waveStat(w) {
    var ps = inWave(w), c = { joined: ps.length, run: 0, done: 0, wait: 0, scored: 0, review: 0 };
    ps.forEach(function (p) {
      if (p.finished) c.done++; else if (p.started && !p.registeredOnly) c.run++;
      if (needsJudge(p)) c.wait++;
      if (scored(p)) c.scored++;
      if (pendingOf(p).length) c.review++;
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
        ? (arch ? '' : '<div class="adm-bar"><span class="ved-dim">Результаты всех потоков, включая архивные, — одним файлом.</span>' +
            '<span class="adm-bar-acts">' + exportControlHtml('all') + '</span></div>') +
          '<div class="adm-cols adm-cols-hd"><span>Поток</span><span>Ведёт</span><span>Участники</span><span>Закончили</span><span>Ждут оценки</span><span>Время</span></div>' +
          '<div class="ved-list adm-list">' + list.map(function (w) { return waveLine(w); }).join('') +
            (!arch && orphans.length ? waveLine('none') : '') + '</div>'
        : '<p class="ved-empty">' + (arch ? 'В архиве пусто.' : 'Ни одного потока. Создайте первый — получите ссылку и QR для участников.') + '</p>') +
      '<p class="ved-dim">' + (arch ? '<a href="#">← все потоки</a>'
        : (nArch ? '<a href="#arch">Показать архивные (' + nArch + ')</a>' : '')) + '</p>';
    wireExport('');
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
                         : (c.review ? '<span class="adm-wait">' + c.review + ' на проверке</span>'
                         : (c.done && c.scored >= c.done ? '<span class="cab-dim">все оценены</span>' : '<span class="cab-dim">—</span>'))) + '</span>' +
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
    main.innerHTML = '<p class="ved-k">Поток создан</p><h1 class="ved-h1 no-lc">' + esc(w.name || w.num) + '</h1>' + shareHtml(w, true);
    wireShare(w);
  }

  // ---------- поток ----------

  function peopleTable(list, withWave) {
    return '<table class="ved-table adm-table"><thead><tr><th>Участник</th>' + (withWave ? '<th>Поток</th>' : '') +
      '<th>Где сейчас</th><th>Оценка по навыкам</th><th>Итог</th><th>Внимание</th><th></th></tr></thead><tbody>' +
      list.map(function (p) {
        var where = whereOf(p), wv = withWave ? waveById(p.waveId) : null;
        return '<tr data-bib="' + esc(p.bib) + '" tabindex="0"' + (p.noScore ? ' class="is-off"' : '') + '>' +
          '<td><b>' + (esc(p.fio) || '<span class="cab-dim">без имени</span>') + '</b> <span class="ved-num">' + esc(bib6(p.bib)) + '</span>' +
            (p.isRunner ? ' <span class="adm-ai" title="Ассессмент прошла модель, а не человек">модель</span>' : '') + '</td>' +
          (withWave ? '<td>' + (wv ? esc(wv.name || wv.num) : '<span class="cab-dim">без потока</span>') + '</td>' : '') +
          '<td><span class="ved-st ' + where.cls + '">' + esc(where.text) + '</span></td>' +
          '<td>' + skillsCell(p) + '</td><td>' + totalCell(p) + '</td><td>' + attentionCell(p) + '</td>' +
          '<td class="ved-acts">' + rowJudgeBtn(p) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  // ⚠ ОЦЕНКА ИЗ СПИСКА, БЕЗ КАРТОЧКИ (запрос 04→03, решение владельца 06.10): тот же вызов, что
  // «Оценить» / «Пересудить всё» в карточке — judgeAnswers по номеру, затем разбор очереди. Только
  // у тех, у кого есть ответы, кто не помечен «не оценивать», не стоит в очереди и кому судейство
  // не закрыто версией сцен.
  // ⚠ ОЧЕРЕДЬ ОЦЕНОК ИЗ СПИСКА (замечание владельца 06.10: второе «Пересудить», пока идёт
  // первое, молчало — отказ писался только в строку вверху). Теперь нажатие ставит человека
  // в очередь кабинета, кнопка сразу говорит «в очереди» / «оценивается», и оценки идут одна
  // за другой. Очередь живёт в этой вкладке: закрыли страницу — недоставленные не начнутся.
  var rowQueue = [], rowActive = null;
  // ⚠ ЗАКРЫТИЕ ВКЛАДКИ С НЕПУСТОЙ ОЧЕРЕДЬЮ (запрос 04→03 от 07.10, «делай» владельца 11.10). Очередь живёт только
  // здесь: закрыли страницу — оставшиеся оценки не начнутся (пересуд Y4RUUC 06.10 так и не дошёл до сервера).
  // Браузер покажет свой вопрос «Покинуть сайт?»; текст свой задать нельзя.
  window.addEventListener('beforeunload', function (e) {
    if (!rowActive && !rowQueue.length) return;
    e.preventDefault();
    e.returnValue = '';
  });
  function rowState(bib) {
    if (rowActive && bk(rowActive) === bk(bib)) return 'оценивается…';
    return rowQueue.some(function (x) { return bk(x.bib) === bk(bib); }) ? 'в очереди' : '';
  }
  function rowJudgeBtn(p) {
    var st = rowState(p.bib);
    if (st) return '<span class="ved-st is-run">' + st + '</span>';
    if (!p.answered || p.noScore || busy(p) || versionsApart(p)) return '';
    return '<button type="button" class="btn btn-ghost btn-xs adm-row-judge" data-bib="' + esc(p.bib) + '">' +
      (scored(p) ? 'Пересудить' : 'Оценить') + '</button>';
  }
  function runRowQueue() {
    if (rowActive || !rowQueue.length) return;
    if (judging) { setTimeout(runRowQueue, 3000); return; }   // идёт оценка из карточки
    var p = rowQueue.shift(), who = p.fio || bib6(p.bib);
    rowActive = p.bib; judging = true;
    render();
    say('оцениваю · ' + who + (rowQueue.length ? ' · в очереди ещё ' + rowQueue.length : ''));
    var next = function (msg, kind) {
      rowActive = null; judging = false;
      return refresh(true).then(function () { if (msg) say(msg, kind); runRowQueue(); });
    };
    window.imp.callApi('judgeAnswers', { password: pw, bib: p.bib }).then(function (res) {
      if (!res || !res.ok) {
        var e = res && res.error ? res.error : 'не удалось поставить в очередь';
        return next(who + ': ' + (e === 'scenes_version_mismatch' ? 'версия сцен не совпадает с судейской — судейство отказано' : String(e)), 'bad');
      }
      return drainQueue(p.bib, [], statusEl, true).then(function () { return next(); });
    }).catch(function (e) {
      if (window.console) console.error('cabinet: оценка из списка прервана', e);
      return next(who + ': оценка прервана сбоем — откройте карточку и нажмите «Продолжить оценку»', 'bad');
    });
  }
  function judgeOne(p) {
    if (rowState(p.bib)) return;
    var who = p.fio || bib6(p.bib), again = scored(p);
    var waitN = rowQueue.length + (rowActive ? 1 : 0);
    window.imp.confirm((again ? 'Пересудить ' : 'Оценить ') + who + '? ' +
      (again ? 'Все задания судьи будут поставлены заново и оплачены заново.' : 'Оценка — платные вызовы судьи.') +
      (pendingOf(p).length ? ' Способности на ручной проверке (' + pendingNames(pendingOf(p)) + ') ждут оценщика — пересуд это не заменяет.' : '') +
      (waitN ? ' Сейчас оценивается другой участник — встанет в очередь за ним.' : '') +
      ' Ход оценки — в строке вверху страницы.', { confirmLabel: again ? 'Пересудить' : 'Оценить' }).then(function (yes) {
      if (!yes) return;
      rowQueue.push(p);
      if (rowActive) { render(); say(who + ' — в очереди, ' + rowQueue.length + '-й'); }
      runRowQueue();
    });
  }
  function wireRows() {
    [].forEach.call(main.querySelectorAll('.adm-row-judge'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        judgeOne(personByBib(b.getAttribute('data-bib')));
      });
      b.addEventListener('keydown', function (e) { e.stopPropagation(); });
    });
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
      '<h1 class="ved-h1' + (none ? '' : ' no-lc') + '">' + (none ? 'Без потока' : esc(w.name || w.num)) + '</h1>' +
      '<div class="ved-meta"><span class="ved-live">обновляется само</span>' +
        '<span>' + c.joined + ' вошли · ' + c.run + ' ' + plural(c.run, 'проходит', 'проходят', 'проходят') + ' · ' + c.done + ' закончили' +
          (c.wait ? ' · ' + c.wait + ' ' + plural(c.wait, 'ждёт', 'ждут', 'ждут') + ' оценки' : '') +
          (c.review ? ' · ' + c.review + ' на ручной проверке' : '') + '</span>' +
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
            // Выгрузка результатов потока (владелец 17.10, вместо всех отчётов одной страницей) и отчёт по потоку (03.10, 14.10) —
            // предварительный по нынешним оценкам и окончательный, когда проверены все оценённые.
            (none ? '' : teamButtonsHtml(list)) +
            (waiting.length || judging ? '<button type="button" class="btn btn-primary btn-sm" id="admJudgeAll"' + (judging ? ' disabled' : '') + '>' +
              (judging ? 'Оцениваю…' : 'Оценить закончивших (' + waiting.length + ')') + '</button>' : '') + '</span></div>' +
          peopleTable(list)
        : (none ? '<p class="ved-empty">Номеров без потока нет. <a href="#">← все потоки</a></p>'
                : '<p class="ved-empty">Пока никого. Участники появятся здесь сами, как только зарегистрируются по ссылке.</p>');
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
      if (!none) { wireTeamButtons(w); wireExport(w.id); }
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
      // Ответное письмо Агеева после ассессмента (решение владельца 15.10).
      '<label class="ved-check"><input type="checkbox" id="admSetLetter"' + (w.letterOn ? ' checked' : '') + ' /> Показать участникам ответное письмо Агеева после ассессмента</label>' +
        '<label class="ved-f" id="admSetLetterBox"' + (w.letterOn ? '' : ' style="display:none;"') + '><span>Текст письма Агеева</span>' +
          '<textarea id="admSetLetterText" rows="8" maxlength="4000" style="width:100%;box-sizing:border-box;font:inherit;">' + esc(w.letterText || '') + '</textarea>' +
          '<em>Участник увидит письмо после «Закончить ассессмент» — белым листом, как «Введение в роль». Абзацы — через пустую строку. ' +
          '{name} в тексте заменится именем участника. Можно вписать и во время потока: текст берётся в момент окончания.</em></label>' +
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
    el('admSetLetter').addEventListener('change', function () { el('admSetLetterBox').style.display = this.checked ? '' : 'none'; });
    el('admSetSave').addEventListener('click', function () {
      var b = this; b.disabled = true; b.textContent = 'Сохраняю…';
      var nm = (el('admSetName').value || '').trim(), tm = Number(el('admSetTime').value) || 0;
      var own = el('admSetOwner').value, open = el('admSetOpen').checked, ai = el('admSetAi').checked;
      var lOn = el('admSetLetter').checked, lText = el('admSetLetterText').value || '';
      var p = { id: w.id, name: nm, timerMin: tm ? String(tm) : '', selfEnroll: open ? '1' : '', isAi: ai ? '1' : '',
                letterOn: lOn ? '1' : '', letterText: lText };
      if (own !== (w.owner || '')) p.owner = own;
      call('setWaveMeta', p).then(function (res) {
        b.disabled = false; b.textContent = 'Сохранить';
        if (!res || !res.ok) { window.imp.alert('Не сохранилось: ' + ((res && (res.message || res.error)) || 'сервер не ответил') + '.'); return; }
        w.name = nm; w.timerMin = tm; w.owner = own; w.selfEnroll = open; w.isAi = ai; w.letterOn = lOn; w.letterText = lText.trim();
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
    main.innerHTML = '<p class="ved-k">Поиск</p><h1 class="ved-h1 no-lc">«' + esc(findEl.value.trim()) + '»</h1>' +
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
        }).catch(function (e) {
          // Сбой на одном участнике не должен оставить judging=true навсегда (06→03, 04.10).
          if (window.console) console.error('cabinet: оценка участника прервана', e);
          failed.push(p.fio || bib6(p.bib));
          return next();
        });
      };
      next();
    });
  }


  // ── /КОМПАКТНЫЙ РЕЗУЛЬТАТ ──────────────────────────────────────────────────────


  // Готовый HTML — в новое окно: окно открывается сразу в обработчике нажатия (открытое после ответа сервера браузер
  // заблокировал бы), содержимое приходит потом.
  // Пока сервер собирает или читает отчёт (до минуты), новая вкладка не пустая: в ней сказано, что идёт загрузка; ошибка —
  // там же, словами (15.10: вкладка висела пустой, и было непонятно, что происходит).
  function waitPage(text, isError) {
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + (isError ? 'Отчёт не открылся' : 'Отчёт загружается…') + '</title></head>' +
      '<body style="margin:0;font-family:Georgia,serif;background:#fff;color:#181818;display:flex;min-height:100vh;align-items:center;justify-content:center">' +
      '<p style="max-width:32em;padding:24px;font-size:18px;line-height:1.5">' + String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p></body></html>';
  }
  function writeWin(w, html) { try { w.document.open(); w.document.write(html); w.document.close(); } catch (e) { /* вкладку закрыли */ } }
  function openHtml(action, payload, fail) {
    var w = window.open('', '_blank');
    if (w) writeWin(w, waitPage('Отчёт загружается — обычно это занимает до минуты.'));
    window.imp.callApi(action, Object.assign({ password: pw }, payload)).then(function (res) {
      if (!w) { window.imp.alert(res && res.ok ? 'Браузер не дал открыть вкладку — разрешите всплывающие окна для этой страницы.' : fail(res)); return; }
      if (res && res.ok && res.html) { writeWin(w, res.html); return; }
      writeWin(w, waitPage(fail(res), true));
    });
  }
  // Отчёты потока. Оценённый — у кого есть оценка (полная или с ручной проверкой); проверенный — «Проверено» по нынешней
  // оценке (report === 'ready' в списке). Окончательный открыт, когда проверены все оценённые; запрет держит сервер.
  function teamCounts(list) {
    var ev = 0, ok = 0;
    list.forEach(function (p) {
      if (!(p.judged > 0 || (p.pending || []).length)) return;
      ev++;
      // Проверен — отчёт собран по нынешней оценке и способностей на ручной проверке нет: с 14.10 «Проверено» собирает отчёт и
      // при предварительной оценке (решение владельца), а окончательный отчёт по потоку — только когда решено всё.
      if (p.report === 'ready' && !(p.pending || []).length) ok++;
    });
    return { evaluated: ev, checked: ok };
  }
  // Выгрузка результатов (решение владельца 17.10) заменила «Отчёты участников» — все отчёты потока одной страницей
  // («открываются одним полотном, и в этом нет смысла»): формат — выпадающим выбором, файл сохраняется на диск.
  function exportControlHtml(scope) {
    return '<select class="btn btn-ghost btn-sm adm-exp-fmt" data-exp-fmt="' + scope + '" aria-label="Формат выгрузки" title="Формат файла">' +
        '<option value="csv">CSV</option><option value="json">JSON</option></select>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-exp="' + scope + '" title="' +
        (scope === 'all' ? 'Все потоки одним файлом: ответы по окнам маршрута, уровни и статусы поднавыков, итог' : 'Участники потока: ответы по окнам маршрута, уровни и статусы поднавыков, итог') + '">' +
        'Выгрузить результаты' + (scope === 'all' ? ' · все потоки' : '') + '</button>';
  }
  var EXPORT_ERR = { wave_not_found: 'поток не найден', forbidden_for_session_role: 'выгрузка доступна только администратору' };
  function saveFile(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function wireExport(waveId) {
    [].forEach.call(main.querySelectorAll('[data-exp]'), function (btn) {
      btn.addEventListener('click', function () {
        var scope = btn.getAttribute('data-exp');
        var wave = scope === 'all' ? 'all' : waveId;
        var sel = main.querySelector('[data-exp-fmt="' + scope + '"]');
        var fmt = sel ? sel.value : 'csv';
        var was = btn.textContent;
        btn.disabled = true; btn.textContent = 'Собираю…';
        call('exportResults', { wave: wave, format: fmt }).then(function (res) {
          btn.disabled = false; btn.textContent = was;
          if (!res || !res.ok || typeof res.text !== 'string') {
            window.imp.alert('Выгрузка не собралась: ' + (res ? (EXPORT_ERR[res.error] || res.message || res.error || 'ошибка') : 'сервер не ответил') + '.');
            return;
          }
          saveFile(res.filename || ('imperfect-результаты.' + fmt), res.text, fmt === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8');
        });
      });
    });
  }
  function teamButtonsHtml(list) {
    var c = teamCounts(list), fin = c.evaluated > 0 && c.checked === c.evaluated;
    return exportControlHtml('wave') +
      '<button type="button" class="btn btn-ghost btn-sm" id="admTeamPre"' + (c.evaluated ? '' : ' disabled') +
        ' title="По нынешним оценкам; проверены ' + c.checked + ' из ' + c.evaluated + '">Отчёт по потоку · предварительный</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="admTeamFin"' + (fin ? '' : ' disabled') +
        ' title="' + (fin ? 'Все оценённые проверены' : 'Откроется, когда проверены все оценённые: ' + c.checked + ' из ' + c.evaluated) + '">Отчёт по потоку · окончательный</button>';
  }
  var TEAM_ERR = { not_all_checked: 'проверены не все оценённые', wave_not_found: 'поток не найден',
                   forbidden_wave: 'это не ваш поток' };
  function wireTeamButtons(w) {
    var why = function (res) { return 'Отчёт не открылся: ' + (res ? (TEAM_ERR[res.error] || res.error || 'ошибка') : 'сервер не ответил') + '.'; };
    el('admTeamPre') && el('admTeamPre').addEventListener('click', function () { openHtml('teamReport', { wave: w.id, variant: 'prelim' }, why); });
    el('admTeamFin') && el('admTeamFin').addEventListener('click', function () { openHtml('teamReport', { wave: w.id, variant: 'final' }, why); });
  }


  // ⚠ КАРТОЧКА УЧАСТНИКА — ОТДЕЛЬНЫМ ОКНОМ (решение владельца 15.10, макет согласован 15.10): kartochka.html?n=<номер>,
  // js/kartochka.js. Прежняя всплывающая карточка (блоки «Оценка», «Ход ассессмента», «Флаги», «Процесс», действия с номером)
  // и её код отсюда сняты: всё это — на странице карточки. Окно на номер одно (имя окна по номеру): второй щелчок по той
  // же строке возвращает к нему, а не открывает копию. Пароль новое окно берёт из sessionStorage вкладки кабинета
  // (окно, открытое из неё, получает её копию); если копии нет — карточка спросит пароль сама.
  function openCard(p) {
    if (!p || !p.bib) return;
    var w = window.open('kartochka.html?n=' + encodeURIComponent(String(p.bib)), 'kc-' + bk(p.bib));
    if (!w) window.imp.alert('Браузер не дал открыть карточку в новой вкладке — разрешите всплывающие окна для этой страницы.');
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
    // ⚠ ЦИКЛ НЕ ОБРЫВАЕТСЯ МОЛЧА (запрос 06→03, 04.10). У цепочки не было обработчика
    // ошибки: исключение в перерисовке списка между кругами (refresh → absorb → render)
    // или в самом вызове останавливало цикл без слова, кнопки оставались погашенными.
    // Вероятная причина остановки очереди после первого круга 20.09 (дважды, чат 5).
    // Теперь сбой перерисовки называется и цикл идёт дальше; сбой вызова называется
    // и отпускает кнопки — очередь в листе остаётся, «Продолжить оценку» её доест.
    var errText = function (e) { return (e && e.message) ? e.message : String(e); };
    var refreshSafe = function (silent) {
      return Promise.resolve().then(function () { return refresh(silent); }).catch(function (e) {
        if (window.console) console.error('cabinet: список не обновился', e);
        state.textContent += ' · список не обновился (' + errText(e) + '), оценка идёт дальше';
      });
    };
    // Оценка уже закончена: сбой при открытии карточки называем отдельно, не «прервана».
    var reopenSafe = function () {
      if (noOpen) return;
      try { openCard({ bib: bib, fio: '' }); }
      catch (e) {
        if (window.console) console.error('cabinet: карточка не открылась', e);
        state.textContent += ' · карточка не открылась (' + errText(e) + ') — обновите страницу';
      }
    };
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
            var qe = q.extra || {};
            var left = (q.queued || 0) + (q.running || 0) + (qe.queued || 0) + (qe.running || 0);
            if (left <= 0) {
              lock(false);
              state.textContent = 'готово: заданий сделано ' + (q.done || 0) +
                (liveErrors(q) ? ' · с ошибками: ' + liveErrors(q) : '');
              return refreshSafe(!!noOpen).then(reopenSafe);
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
          return refreshSafe(true).then(function () { return step(total); });
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
        return refreshSafe(!!noOpen).then(reopenSafe);
      }).catch(function (e) {
        if (window.console) console.error('cabinet: цикл оценки прерван', e);
        lock(false);
        state.textContent = 'оценка прервана сбоем: ' + errText(e) + ' · нажмите «Продолжить оценку»';
      });
    };
    return step(0);
  }


  // ---------- запуск ----------

  el('cabPassBtn').addEventListener('click', function () { login(false); });
  el('cabPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); login(); } });
  window.addEventListener('hashchange', function () {
    tab = 'people'; shareOpen = false;
    if (findEl && findEl.value) findEl.value = '';
    if (pw) render();
  });
  if (findEl) findEl.addEventListener('input', function () { if (pw) render(); });
  // «Выйти» оставляет на экране входа и говорит, что выход случился (вариант Б, владелец 19.10): одноразовый
  // признак во вкладке, его снимает первая же загрузка страницы — повторное обновление плашку не покажет.
  el('admOut').addEventListener('click', function (e) {
    e.preventDefault();
    try { sessionStorage.removeItem(PW_KEY); sessionStorage.setItem('imp_cab_out', '1'); } catch (x) {}
    location.href = 'administrator.html';
  });
  try {
    if (sessionStorage.getItem('imp_cab_out')) { sessionStorage.removeItem('imp_cab_out'); el('cabOutNote').style.display = ''; }
  } catch (x) {}
  el('vedQrFull').addEventListener('click', function () { el('vedQrFull').style.display = 'none'; });
  // Вернулись из карточки (она в другой вкладке) — список догоняет то, что там поменяли: оценку, правку уровня, перенос,
  // удаление. С 19.10 — в любом разделе: прежде догонял только список потока, а поиск и «Все потоки» показывали удалённый
  // номер и старые счётчики. Карточка, закрываясь сама (удаление, «← поток»), ещё и говорит, что случилось (kartochka.js).
  window.addEventListener('focus', function () { if (pw && !judging) refresh(true); });
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.imp !== 'kartochka') return;
    if (e.data.note) say(e.data.note);
    if (pw) refresh(true);
  });

  (function auto() {
    var saved = '';
    try { saved = sessionStorage.getItem(PW_KEY) || ''; } catch (e) {}
    if (!saved) return;
    el('cabPass').value = saved;
    // Вход по сохранённому паролю — без формы (замечание владельца 19.10): прежде форма с подставленным паролем стояла на
    // экране, пока сервер проверял пароль, и выглядело это как «выкинуло на вход». Форма вернётся, только если пароль не подошёл.
    gate.classList.add('is-auto');
    login(true);
  })();
})();

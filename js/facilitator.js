// i(m)perfect — кабинет фасилитатора. Смотрит на тот же бэкенд (js/api.js),
// что и register.js/station1.js. Пароль хранится только в sessionStorage
// вкладки — не в localStorage и никуда не логируется.

(function () {
  var PASSWORD_KEY = 'imp_facilitator_password';

  // Заполняется из бэкенда (лист Waves) через loadWaves() — эти три записи
  // только временный фолбэк, пока первый запрос не отработал.
  var waves = [];
  var waveLabelMap = {
    w1: '15 июля, 11:00',
    w2: '18 июля, 15:00',
    w3: '22 июля, 11:00'
  };
  var waveFilterValue = '';
  var currentView = [];

  var gate = document.getElementById('gatePassword');
  var facRoot = document.getElementById('facRoot');
  var passwordInput = document.getElementById('facPassword');
  var authError = document.getElementById('facAuthError');
  var apiHint = document.getElementById('facApiHint');
  var loginBtn = document.getElementById('facLoginBtn');
  var refreshBtn = document.getElementById('facRefreshBtn');
  var tableBody = document.getElementById('facTableBody');
  var table = document.getElementById('facTable');
  var empty = document.getElementById('facEmpty');
  var countEl = document.getElementById('facCount');
  var rosterTableBody = document.getElementById('facRosterTableBody');
  var rosterTable = document.getElementById('facRosterTable');
  var rosterEmpty = document.getElementById('facRosterEmpty');
  var tabButtons = document.querySelectorAll('.fac-tab-btn');
  var tabPanels = { progress: document.getElementById('facTabProgress'), roster: document.getElementById('facTabRoster') };

  var detail = document.getElementById('facDetail');
  var detailBib = document.getElementById('facDetailBib');
  var detailName = document.getElementById('facDetailName');
  var detailBody = document.getElementById('facDetailBody');
  var detailClose = document.getElementById('facDetailClose');
  var sortTotalHeader = document.getElementById('facSortTotal');
  var wavesListEl = document.getElementById('facWavesList');
  var waveAddForm = document.getElementById('facWaveAddForm');
  var waveLabelInput = document.getElementById('facWaveLabelInput');
  var waveFilterSelect = document.getElementById('facWaveFilter');
  var exportBtn = document.getElementById('facExportBtn');

  var sortState = { key: 'bib', dir: 1 };
  var lastParticipants = [];
  var currentDetailParticipant = null;

  // «Ход раунда» — живой мониторинг во время игры (кто где, компактно).
  // «Регистрации и потоки» — админ-задачи другого темпа (волны, контакты,
  // удаление): разнесены, чтобы не раздувать строку мониторинга вширь.
  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tab = btn.getAttribute('data-tab');
      tabButtons.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      Object.keys(tabPanels).forEach(function (key) {
        tabPanels[key].style.display = key === tab ? '' : 'none';
      });
    });
  });

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function formatBib(n) {
    return '№ ' + String(n).padStart(3, '0');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  if (!window.imp.isApiConfigured()) {
    apiHint.textContent = 'Бэкенд ещё не подключён — вставьте URL в platform/js/api.js (см. backend/README.md).';
  }

  function showGateError(message) {
    authError.textContent = message;
    authError.classList.add('show');
  }

  function attemptLogin(password) {
    authError.classList.remove('show');
    return window.imp.callApi('facilitatorList', { password: password }).then(function (res) {
      if (res && res.ok) {
        sessionStorage.setItem(PASSWORD_KEY, password);
        gate.style.display = 'none';
        facRoot.style.display = '';
        renderParticipants(res.participants);
        loadWaves();
        return true;
      }
      var msg = !window.imp.isApiConfigured()
        ? 'Бэкенд не настроен — см. подсказку ниже.'
        : (res && res.error === 'unauthorized' ? 'Неверный пароль.' : 'Не удалось связаться с бэкендом.');
      showGateError(msg);
      return false;
    });
  }

  loginBtn.addEventListener('click', function () {
    var pw = passwordInput.value;
    if (!pw) { showGateError('Введите пароль.'); return; }
    attemptLogin(pw);
  });

  passwordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') loginBtn.click();
  });

  function currentPassword() {
    return sessionStorage.getItem(PASSWORD_KEY) || '';
  }

  function refresh() {
    var pw = currentPassword();
    if (!pw) return;
    window.imp.callApi('facilitatorList', { password: pw }).then(function (res) {
      if (res && res.ok) {
        renderParticipants(res.participants);
      } else if (res && res.error === 'unauthorized') {
        // password changed server-side since login — bounce back to the gate
        sessionStorage.removeItem(PASSWORD_KEY);
        facRoot.style.display = 'none';
        gate.style.display = 'flex';
        showGateError('Пароль больше не подходит — введите заново.');
      }
    });
  }

  refreshBtn.addEventListener('click', function () {
    refresh();
    loadWaves();
  });

  function stationStatusLabel(p, key) {
    var s = p[key];
    if (!s) return { text: 'не начата', cls: 'is-none' };
    if (s.finished) return { text: 'завершена', cls: 'is-done' };
    if (s.started) return { text: 'в процессе', cls: 'is-progress' };
    return { text: 'не начата', cls: 'is-none' };
  }

  // ⚑ — нарушено ограничение зависимостей методологии (глубина ≤ широты /
  // защита ≤ выбор+1) — нужна ручная проверка. Полная расшифровка по
  // способностям — в карточке участника (renderAK2Html/renderPRHtml); здесь
  // только флаг, чтобы не открывать карточку каждого просто ради проверки.
  function hasFlags(p) {
    return !!(p.station1.akFlag || p.station2.prFlag);
  }

  // «Итого» = сумма баллов посчитанных навыков (§9): пять навыков, максимум 25.
  function skillScores(p) {
    return [
      { label: 'контекст', value: typeof p.station1.akSkill === 'number' ? p.station1.akSkill : null },
      { label: 'приоритизация', value: typeof p.station2.prSkill === 'number' ? p.station2.prSkill : null },
      { label: 'образ будущего', value: typeof p.roomFuture.skill === 'number' ? p.roomFuture.skill : null },
      { label: 'альтернативы', value: typeof p.roomAlternatives.skill === 'number' ? p.roomAlternatives.skill : null },
      { label: 'путь к цели', value: typeof p.roomPath.skill === 'number' ? p.roomPath.skill : null }
    ];
  }

  function totalScore(p) {
    var scores = skillScores(p).filter(function (s) { return s.value !== null; });
    if (!scores.length) return null;
    return scores.reduce(function (sum, s) { return sum + s.value; }, 0);
  }

  // Главная таблица — только итоговое число (быстрый скан по всем участникам).
  // Разбивка по навыкам и объяснение по способностям — в карточке участника
  // (formatTotal ниже), не здесь.
  function formatTotalCompact(p) {
    var t = totalScore(p);
    return t === null ? '—' : t + '/25';
  }

  function formatTotal(p) {
    var scores = skillScores(p);
    var known = scores.filter(function (s) { return s.value !== null; });
    if (!known.length) return '—';
    var parts = scores.map(function (s) { return s.label + ' ' + (s.value === null ? '?' : s.value); });
    var total = known.reduce(function (sum, s) { return sum + s.value; }, 0);
    return (known.length === scores.length ? total + '/25' : '…') + ' (' + parts.join(' + ') + ')';
  }

  function sortParticipants(participants) {
    var dir = sortState.dir;
    return participants.slice().sort(function (a, b) {
      if (sortState.key === 'total') {
        var at = totalScore(a), bt = totalScore(b);
        return ((at === null ? -1 : at) - (bt === null ? -1 : bt)) * dir;
      }
      return (Number(a.bib) - Number(b.bib)) * dir;
    });
  }

  // ---------- waves ----------

  function loadWaves() {
    window.imp.callApi('listWaves', {}).then(function (res) {
      if (!res || !res.ok || !res.waves) return;
      waves = res.waves;
      waveLabelMap = {};
      waves.forEach(function (w) { waveLabelMap[w.id] = w.label; });
      renderWavesPanel();
      renderParticipants(lastParticipants);
    });
  }

  function renderWavesPanel() {
    if (!wavesListEl) return;
    wavesListEl.innerHTML = '';
    waves.forEach(function (w) {
      var chip = document.createElement('span');
      chip.className = 'fac-wave-chip';
      chip.innerHTML = escapeHtml(w.label) + ' <button class="fac-wave-remove" title="Убрать поток">✕</button>';
      chip.querySelector('.fac-wave-remove').addEventListener('click', function () {
        if (!window.confirm('Убрать поток «' + w.label + '»? Уже зарегистрированные на него участники сохранят запись — поток просто исчезнет из выбора для новых регистраций.')) return;
        window.imp.callApi('removeWave', { password: currentPassword(), id: w.id }).then(function (res) {
          if (res && res.ok) {
            loadWaves();
          } else {
            window.alert('Не удалось убрать поток: ' + (res && res.error ? res.error : 'нет ответа от бэкенда'));
          }
        });
      });
      wavesListEl.appendChild(chip);
    });
  }

  function renderWaveFilterOptions() {
    if (!waveFilterSelect) return;
    var current = waveFilterSelect.value;
    var ids = waves.map(function (w) { return w.id; });
    lastParticipants.forEach(function (p) {
      if (ids.indexOf(p.wave) === -1) ids.push(p.wave);
    });
    waveFilterSelect.innerHTML = '<option value="">Все потоки</option>';
    ids.forEach(function (id) {
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = waveLabelMap[id] || id;
      waveFilterSelect.appendChild(opt);
    });
    if (ids.indexOf(current) !== -1) waveFilterSelect.value = current;
  }

  // Элементы волн — самые новые в разметке; если у кого-то в браузере закешировалась
  // старая версия facilitator.html без них, эти проверки не дают упавшему обращению
  // к null сломать вообще всю страницу (включая рендер таблицы участников ниже).
  if (waveAddForm) {
    waveAddForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var label = waveLabelInput.value.trim();
      if (!label) return;
      window.imp.callApi('addWave', { password: currentPassword(), label: label }).then(function (res) {
        if (res && res.ok) {
          waveLabelInput.value = '';
          loadWaves();
        } else {
          window.alert('Не удалось добавить поток: ' + (res && res.error ? res.error : 'нет ответа от бэкенда'));
        }
      });
    });
  }

  if (waveFilterSelect) {
    waveFilterSelect.addEventListener('change', function () {
      waveFilterValue = waveFilterSelect.value;
      renderParticipants(lastParticipants);
    });
  }

  // ---------- participants table ----------

  function renderParticipants(participants) {
    lastParticipants = participants || [];
    renderWaveFilterOptions();

    var filtered = waveFilterValue
      ? lastParticipants.filter(function (p) { return String(p.wave) === String(waveFilterValue); })
      : lastParticipants;
    var view = sortParticipants(filtered);
    currentView = view;

    countEl.textContent = view.length + ' ' + pluralParticipants(view.length) +
      (waveFilterValue && view.length !== lastParticipants.length ? ' из ' + lastParticipants.length : '');
    tableBody.innerHTML = '';
    empty.style.display = view.length ? 'none' : '';
    table.style.display = view.length ? '' : 'none';
    renderRoster();

    view.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(formatBib(p.bib)) + '</td>' +
        '<td>' + escapeHtml(p.firstName + ' ' + p.lastName) + '</td>' +
        '<td>' + escapeHtml(waveLabelMap[p.wave] || p.wave) + '</td>' +
        '<td>' + progressPillsHtml(p) + '</td>' +
        '<td>' + escapeHtml(formatTotalCompact(p)) +
          (hasFlags(p) ? ' <span class="fac-card-warn" title="Нарушено ограничение зависимостей способностей — см. карточку участника">⚑</span>' : '') + '</td>';
      tr.addEventListener('click', function () { openDetail(p); });
      tableBody.appendChild(tr);
    });
  }

  // Компактный «Ход»: точка на станцию (не начата/в процессе/завершена),
  // подпись — в title. Полная расшифровка по способностям — в карточке участника.
  // Комнаты финального отрезка — свободный порядок, поэтому подписаны буквами
  // названия комнаты, а не номером станции (как С1/С2).
  function progressPillsHtml(p) {
    var stages = [
      { key: 'station1', label: 'С1', title: 'Станция 1 · Вычитка и карта проблем' },
      { key: 'station2', label: 'С2', title: 'Станция 2 · Встреча с Агеевым' },
      { key: 'roomFuture', label: 'КЛ', title: '«Коридор Лемеха»' },
      { key: 'roomAlternatives', label: 'ОП', title: '«Очередь в „Прожектор"»' },
      { key: 'roomPath', label: 'ЧК', title: '«Черновик к мартовскому комитету»' },
      { key: 'station3', label: 'Ф', title: 'Финализация стратегии (холл)' }
    ];
    return '<span class="fac-progress-pills">' + stages.map(function (st) {
      var s = stationStatusLabel(p, st.key);
      return '<span class="fac-progress-dot ' + s.cls + '" title="' + escapeHtml(st.title + ' — ' + s.text) + '">' + st.label + '</span>';
    }).join('') + '</span>';
  }

  // ---------- roster tab (регистрации, контакты, удаление) ----------

  function renderRoster() {
    rosterTableBody.innerHTML = '';
    rosterEmpty.style.display = lastParticipants.length ? 'none' : '';
    rosterTable.style.display = lastParticipants.length ? '' : 'none';

    lastParticipants.slice().sort(function (a, b) { return Number(a.bib) - Number(b.bib); }).forEach(function (p) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(formatBib(p.bib)) + '</td>' +
        '<td>' + escapeHtml(p.firstName + ' ' + p.lastName) + '</td>' +
        '<td>' + escapeHtml(p.email) + '</td>' +
        '<td>' + escapeHtml(waveLabelMap[p.wave] || p.wave) + '</td>' +
        '<td>' + escapeHtml(formatDate(p.registeredAt)) + '</td>' +
        '<td><button class="fac-delete-btn" title="Удалить участника">✕</button></td>';
      tr.querySelector('.fac-delete-btn').addEventListener('click', function () {
        deleteParticipant(p, tr.querySelector('.fac-delete-btn'));
      });
      rosterTableBody.appendChild(tr);
    });
  }

  function deleteParticipant(p, btn) {
    var confirmed = window.confirm(
      'Удалить участника ' + formatBib(p.bib) + ' (' + p.firstName + ' ' + p.lastName + ')?\n' +
      'Это удалит регистрацию и весь прогресс по станциям 1, 2 и 3. Действие необратимо.'
    );
    if (!confirmed) return;
    btn.disabled = true;
    window.imp.callApi('deleteParticipant', { password: currentPassword(), bib: p.bib }).then(function (res) {
      if (res && res.ok) {
        refresh();
      } else {
        btn.disabled = false;
        window.alert('Не удалось удалить участника: ' + (res && res.error ? res.error : 'нет ответа от бэкенда'));
      }
    });
  }

  function csvEscape(v) {
    var s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function roomCsvCols(p, key, level1Key, level2Key) {
    var r = p[key];
    return [
      stationStatusLabel(p, key).text,
      typeof r[level1Key] === 'number' ? r[level1Key] : '',
      r[level1Key + 'Source'] || '',
      typeof r[level2Key] === 'number' ? r[level2Key] : '',
      r[level2Key + 'Source'] || '',
      typeof r.skill === 'number' ? r.skill : ''
    ];
  }

  if (exportBtn) exportBtn.addEventListener('click', function () {
    var rows = [
      ['№', 'Имя', 'Фамилия', 'Email', 'Волна', 'Дата регистрации',
        'Статус станции 1', 'Карточек', 'Приложений изучено', 'Широта (АК-1)', 'Источник широты', 'Глубина (АК-2)', 'Источник глубины', 'Флаг: глубина>широты', 'Контекст, балл',
        'Статус станции 2', 'Выбор (ПР-1)', 'Источник выбора', 'Защита (ПР-2)', 'Источник защиты', 'Флаг: защита>выбор+1', 'Приоритизация, балл',
        'Статус «Коридор Лемеха»', 'Горизонт (МК-1)', 'Источник горизонта', 'Развилки будущего (МК-2)', 'Источник развилок', 'Образ будущего, балл',
        'Статус «Очередь в Прожектор»', 'Альтернативы (ГА-1)', 'Источник альтернатив', 'Идеи из областей (ГА-2)', 'Источник идей', 'Альтернативы, балл',
        'Статус «Черновик к комитету»', 'Декомпозиция пути (ПП-1)', 'Источник декомпозиции', 'Барьеры/ресурсы (ПП-2)', 'Источник барьеров', 'Путь к цели, балл',
        'Итого (из 25)', 'Стратегия финализирована', 'Дата финализации']
    ];
    currentView.forEach(function (p) {
      rows.push([
        p.bib,
        p.firstName,
        p.lastName,
        p.email,
        waveLabelMap[p.wave] || p.wave,
        formatDate(p.registeredAt),
        stationStatusLabel(p, 'station1').text,
        p.station1.cardCount,
        p.station1.appxReviewedCount,
        typeof p.station1.level === 'number' ? p.station1.level : '',
        p.station1.levelSource || '',
        typeof p.station1.ak2Level === 'number' ? p.station1.ak2Level : '',
        p.station1.ak2LevelSource || '',
        p.station1.akFlag ? 'да' : '',
        typeof p.station1.akSkill === 'number' ? p.station1.akSkill : '',
        stationStatusLabel(p, 'station2').text,
        typeof p.station2.pr1Level === 'number' ? p.station2.pr1Level : '',
        p.station2.pr1LevelSource || '',
        typeof p.station2.pr2Level === 'number' ? p.station2.pr2Level : '',
        p.station2.pr2LevelSource || '',
        p.station2.prFlag ? 'да' : '',
        typeof p.station2.prSkill === 'number' ? p.station2.prSkill : ''
      ].concat(
        roomCsvCols(p, 'roomFuture', 'level1', 'level2'),
        roomCsvCols(p, 'roomAlternatives', 'level1', 'level2'),
        roomCsvCols(p, 'roomPath', 'level1', 'level2'),
        [
          totalScore(p) === null ? '' : totalScore(p),
          p.station3.finished ? 'да' : 'нет',
          p.station3.finished ? formatDate(p.station3.finishedAt) : ''
        ]
      ));
    });
    // BOM — иначе Excel показывает кириллицу в CSV как кашу
    var csv = '﻿' + rows.map(function (row) { return row.map(csvEscape).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'imperfect-uchastniki-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  var RECALC_ACTIONS = {
    1: 'judgeStation1',
    2: 'judgeStation2',
    3: 'judgeRoomFuture',
    4: 'judgeRoomAlternatives',
    5: 'judgeRoomPath'
  };

  function recalcScore(bib, btn, station, onSuccess) {
    var action = RECALC_ACTIONS[station];
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';
    window.imp.callApi(action, { password: currentPassword(), bib: bib }).then(function (res) {
      if (res && res.ok) {
        refresh();
        if (onSuccess) onSuccess();
      } else {
        btn.disabled = false;
        btn.textContent = originalText;
        window.alert('Не удалось пересчитать балл: ' + (res && res.error ? res.error : 'нет ответа от бэкенда'));
      }
    });
  }

  function bindSortHeader(headerEl, key, defaultDir) {
    if (!headerEl) return;
    headerEl.addEventListener('click', function () {
      if (sortState.key === key) {
        sortState.dir = sortState.dir * -1;
      } else {
        sortState.key = key;
        sortState.dir = defaultDir;
      }
      renderParticipants(lastParticipants);
    });
  }

  bindSortHeader(sortTotalHeader, 'total', -1);

  function pluralParticipants(n) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'участник';
    if ([2, 3, 4].indexOf(mod10) !== -1 && [12, 13, 14].indexOf(mod100) === -1) return 'участника';
    return 'участников';
  }

  function openDetail(participant) {
    currentDetailParticipant = participant;
    detailBib.textContent = formatBib(participant.bib);
    detailName.textContent = participant.firstName + ' ' + participant.lastName;
    detailBody.innerHTML = '<p class="fac-detail-loading">Загружаю карту участника…</p>';
    detail.classList.add('show');

    window.imp.callApi('facilitatorDetail', { password: currentPassword(), bib: participant.bib }).then(function (res) {
      if (!res || !res.ok) {
        detailBody.innerHTML = '<p class="fac-detail-loading">Не удалось загрузить — попробуйте «Обновить» и открыть снова.</p>';
        return;
      }
      detailBody.innerHTML = renderDetailHtml(res.registration, res.station1, res.station2, res.roomFuture, res.roomAlternatives, res.roomPath, res.station3, participant);
      detailBody.querySelectorAll('[data-recalc]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          recalcScore(participant.bib, btn, Number(btn.getAttribute('data-recalc')), function () {
            if (currentDetailParticipant && currentDetailParticipant.bib === participant.bib) openDetail(participant);
          });
        });
      });
    });
  }

  var AK1_DOMAIN_LABELS = {
    competitors: 'конкуренты',
    techShift: 'технологический/продуктовый сдвиг',
    marketStructure: 'структура рынка',
    ownership: 'смена собственника/корпоративный центр',
    talent: 'рынок труда/отток специалистов'
  };

  // Одна кнопка пересчёта на станцию (judgeStation1/2 всегда считают обе
  // способности своей станции сразу) — раньше жила в главной таблице,
  // теперь только здесь: пересчёт — задача глубокого разбора, не мониторинга.
  function recalcButtonHtml(station, label) {
    return '<button class="fac-recalc-btn fac-recalc-btn-labeled" data-recalc="' + station + '">↻ ' + escapeHtml(label) + '</button>';
  }

  function renderScoreHtml(s1) {
    if (typeof s1.level !== 'number') {
      return '<h4>Широта охвата <span class="fac-code-hint">(АК-1)</span></h4><p class="fac-detail-text">Не оценено.</p>' + recalcButtonHtml(1, 'Пересчитать навык АК');
    }
    var html = '<h4>Широта охвата <span class="fac-code-hint">(АК-1)</span> — L' + s1.level + '</h4>';
    html += recalcButtonHtml(1, 'пересчитать навык АК');
    html += '<p class="fac-detail-text">Источник: ' + (s1.levelSource === 'ai' ? 'подтверждено ИИ' : 'детерминировано кодом') + '</p>';
    var domains = s1.domainsCovered || [];
    html += '<p class="fac-detail-text">Охваченные домены (' + domains.length + '/5): ' +
      (domains.length ? domains.map(function (d) { return AK1_DOMAIN_LABELS[d] || d; }).join(', ') : 'нет') + '</p>';
    if (s1.levelSource === 'ai') {
      html += '<p class="fac-detail-text">Выходит за пределы явного в кейсе: ' + (s1.beyondCase ? 'да' : 'нет') +
        ' · Видит взаимное влияние факторов: ' + (s1.seesInterdependency ? 'да' : 'нет') +
        ' · Называет фактор второго порядка: ' + (s1.namesSecondOrder ? 'да' : 'нет') + '</p>';
    }
    if (s1.judgeReasoning && s1.judgeReasoning.reasoning) {
      html += '<details class="fac-judge-reasoning"><summary>Обоснование судьи</summary>' +
        '<p class="fac-card-warn">' + escapeHtml(s1.judgeReasoning.reasoning) + '</p></details>';
    }
    return html;
  }

  var TAG_LABELS = { threat: 'угроза', opportunity: 'возможность' };

  function renderAK2Html(s1) {
    var html = '<h4>Глубина взаимосвязей <span class="fac-code-hint">(АК-2)</span>' + (typeof s1.ak2Level === 'number' ? ' — L' + s1.ak2Level : '') + '</h4>';
    if (typeof s1.ak2Level !== 'number') {
      html += '<p class="fac-detail-text">Не оценено — см. кнопку «пересчитать» в разделе «Широта охвата» выше.</p>';
    } else {
      html += '<p class="fac-detail-text">Источник: ' + (s1.ak2LevelSource === 'ai' ? 'подтверждено ИИ' : 'детерминировано кодом') + '</p>';
      if (typeof s1.level === 'number' && s1.ak2Level > s1.level) {
        html += '<p class="fac-detail-text fac-card-warn">⚑ Глубина выше широты — нельзя глубоко анализировать то, чего не заметил, нужна ручная проверка.</p>';
      }
    }

    var cardById = {};
    (s1.cards || []).forEach(function (c) { cardById[c.id] = c; });

    var tagged = (s1.cards || []).filter(function (c) { return c.tag === 'threat' || c.tag === 'opportunity'; });
    if (tagged.length) {
      html += '<div class="fac-cards">';
      tagged.forEach(function (c) {
        html += '<div class="fac-card"><p>' + escapeHtml(c.text || '(без формулировки)') + '</p>' +
          '<div class="fac-card-meta"><span>' + (TAG_LABELS[c.tag] || c.tag) + '</span></div>' +
          (c.influence ? '<p class="fac-detail-text">' + escapeHtml(c.influence) + '</p>' : '') +
          '</div>';
      });
      html += '</div>';
    }

    if ((s1.connections || []).length) {
      html += '<h4 style="margin-top:16px;">Корневые связки (' + s1.connections.length + ')</h4><div class="fac-cards">';
      s1.connections.forEach(function (conn) {
        var cardTexts = (conn.cardIds || []).map(function (id) {
          var c = cardById[id];
          return c ? '«' + (c.text || '').slice(0, 60) + '»' : '(карточка удалена)';
        }).join(' + ');
        html += '<div class="fac-card">' +
          '<p>' + escapeHtml(cardTexts || '(карточки не выбраны)') + '</p>' +
          (conn.mechanism ? '<div class="fac-card-meta"><span>механизм: ' + escapeHtml(conn.mechanism) + '</span></div>' : '') +
          (conn.conclusion ? '<div class="fac-card-meta"><span>вывод: ' + escapeHtml(conn.conclusion) + '</span></div>' : '') +
          (conn.isLoop ? '<div class="fac-card-meta"><span>заявлена петля</span></div>' : '') +
          '</div>';
      });
      html += '</div>';
    }

    if (s1.ak2JudgeReasoning && s1.ak2JudgeReasoning.reasoning) {
      html += '<details class="fac-judge-reasoning"><summary>Обоснование судьи АК-2</summary>' +
        '<p class="fac-card-warn">' + escapeHtml(s1.ak2JudgeReasoning.reasoning) + '</p></details>';
    }
    return html;
  }

  // Станция 2 «Встреча с Агеевым» — навык ПР: приоритеты/отказы (ПР-1),
  // обоснование + стресс-тест + проактивность (ПР-2).
  function renderPRHtml(s2) {
    if (!s2) {
      return '<h4>Станция 2 · встреча с Агеевым</h4><p class="fac-detail-text">Ещё не начата.</p>';
    }
    var cardById = {};
    (s2.cardsSnapshot || []).forEach(function (c) { cardById[c.id] = c; });
    function textOf(id) { var c = cardById[id]; return c ? c.text : '(карточка не найдена)'; }

    var html = '<h4>Станция 2 · встреча с Агеевым — ' + (s2.finished ? 'завершена ' + escapeHtml(formatDate(s2.finishedAt)) : 'в процессе') + '</h4>';

    html += '<h4 style="margin-top:14px;">Выбор приоритетов <span class="fac-code-hint">(ПР-1)</span>' + (typeof s2.pr1Level === 'number' ? ' — L' + s2.pr1Level : '') + '</h4>';
    if (s2.finished) html += recalcButtonHtml(2, 'пересчитать навык ПР');
    if (typeof s2.pr1Level === 'number') {
      html += '<p class="fac-detail-text">Источник: ' + (s2.pr1LevelSource === 'ai' ? 'подтверждено ИИ' : 'детерминировано кодом') + '</p>';
    } else {
      html += '<p class="fac-detail-text">' + (s2.finished ? 'Не оценено — нажмите «пересчитать» выше.' : 'Уровень появится после завершения.') + '</p>';
    }

    if ((s2.priorities || []).length) {
      html += '<div class="fac-cards">';
      s2.priorities.forEach(function (p, i) {
        html += '<div class="fac-card"><p><b>' + (i + 1) + '.</b> ' + escapeHtml(textOf(p.cardId)) + '</p>' +
          (p.target ? '<div class="fac-card-meta"><span>ориентир: ' + escapeHtml(p.target) + '</span></div>' : '') +
          '</div>';
      });
      html += '</div>';
    }
    if ((s2.rejected || []).length) {
      html += '<p class="fac-detail-text"><b>Не сейчас (явные отказы):</b></p><div class="fac-cards">';
      s2.rejected.forEach(function (r) {
        html += '<div class="fac-card"><p>' + escapeHtml(textOf(r.cardId)) + '</p>' +
          (r.freed ? '<div class="fac-card-meta"><span>освобождает: ' + escapeHtml(r.freed) + '</span></div>' : '') +
          '</div>';
      });
      html += '</div>';
    }
    if (s2.rejectionRule) {
      html += '<p class="fac-detail-text">Правило отказа: ' + escapeHtml(s2.rejectionRule) + '</p>';
    }
    if (s2.pr1JudgeReasoning && s2.pr1JudgeReasoning.reasoning) {
      html += '<details class="fac-judge-reasoning"><summary>Обоснование судьи ПР-1</summary>' +
        '<p class="fac-card-warn">' + escapeHtml(s2.pr1JudgeReasoning.reasoning) + '</p></details>';
    }

    html += '<h4 style="margin-top:16px;">Защита выбора <span class="fac-code-hint">(ПР-2)</span>' + (typeof s2.pr2Level === 'number' ? ' — L' + s2.pr2Level : '') + '</h4>';
    if (typeof s2.pr2Level === 'number') {
      html += '<p class="fac-detail-text">Источник: ' + (s2.pr2LevelSource === 'ai' ? 'подтверждено ИИ' : 'детерминировано кодом') + '</p>';
      if (typeof s2.pr1Level === 'number' && s2.pr2Level > s2.pr1Level + 1) {
        html += '<p class="fac-detail-text fac-card-warn">⚑ Защита выше выбора больше чем на 1 уровень — так не должно быть, нужна ручная проверка.</p>';
      }
    }
    if (s2.rationale) {
      html += '<p class="fac-detail-text"><b>Почему №1 первым:</b> ' + escapeHtml(s2.rationale) + '</p>';
    }
    if (s2.stressChoice) {
      html += '<p class="fac-detail-text"><b>Стресс-тест «отложим на полгода»:</b> <span class="fac-pill ' +
        (s2.stressChoice === 'hold' ? 'is-done' : 'is-progress') + '">' +
        (s2.stressChoice === 'hold' ? 'настоял на своём' : 'согласился пересобрать') + '</span></p>';
      if (s2.stressComment) {
        html += '<p class="fac-detail-text">' + escapeHtml(s2.stressComment) + '</p>';
      }
    }
    if (s2.proactiveText) {
      html += '<p class="fac-detail-text"><b>Условия пересмотра выбора:</b> ' + escapeHtml(s2.proactiveText) + '</p>';
    }
    if (s2.pr2JudgeReasoning && s2.pr2JudgeReasoning.reasoning) {
      html += '<details class="fac-judge-reasoning"><summary>Обоснование судьи ПР-2</summary>' +
        '<p class="fac-card-warn">' + escapeHtml(s2.pr2JudgeReasoning.reasoning) + '</p></details>';
    }
    return html;
  }

  // МК/ГА/ПП живут в комнатах финального отрезка — все три структурно одинаковы
  // (два открытых ответа, один общий вызов ИИ на обе способности сразу), поэтому
  // один рендер-хелпер вместо трёх copy-paste функций (см. renderScoreHtml/
  // renderAK2Html/renderPRHtml выше — те устроены иначе, там не было смысла обобщать).
  var GA2_SOURCE_LABELS = {
    own: 'мои собственные суждения на месте',
    practice: 'то, что обычно делают в таких ситуациях',
    example: 'конкретный пример откуда-то ещё',
    pattern: 'что-то более общее, что видно за разными примерами'
  };

  function roomAnswersFuture(state) {
    var html = '';
    if (state.answer1) html += '<p class="fac-detail-text" style="margin-top:10px;"><b>Про горизонт:</b> ' + escapeHtml(state.answer1) + '</p>';
    if (state.answer2) html += '<p class="fac-detail-text"><b>Если пойдёт не так:</b> ' + escapeHtml(state.answer2) + '</p>';
    return html;
  }

  function roomAnswersAlternatives(state) {
    var html = '';
    if (state.answer1) html += '<p class="fac-detail-text" style="margin-top:10px;"><b>На месте Агеева:</b> ' + escapeHtml(state.answer1) + '</p>';
    if (state.source) {
      html += '<p class="fac-detail-text"><b>Источник идей (самооценка):</b> ' + escapeHtml(GA2_SOURCE_LABELS[state.source] || state.source) + '</p>';
    }
    if (state.sourceElaboration) {
      html += '<p class="fac-detail-text"><b>Элаборация:</b> ' + escapeHtml(state.sourceElaboration) + '</p>';
    }
    return html;
  }

  function roomAnswersPath(state) {
    var html = '';
    if (state.currentState || state.targetState) {
      html += '<p class="fac-detail-text" style="margin-top:10px;"><b>Текущее → целевое:</b> ' +
        escapeHtml(state.currentState || '—') + ' → ' + escapeHtml(state.targetState || '—') + '</p>';
    }
    if ((state.stages || []).length) {
      html += '<div class="fac-cards">';
      state.stages.forEach(function (st, i) {
        html += '<div class="fac-card"><p><b>Этап ' + (i + 1) + '.</b> ' + escapeHtml(st.description || '(не описан)') + '</p>' +
          (st.rationale ? '<div class="fac-card-meta"><span>почему здесь: ' + escapeHtml(st.rationale) + '</span></div>' : '') +
          '</div>';
      });
      html += '</div>';
    }
    var barriers = (state.barriers || []).filter(function (b) { return b.text; });
    var enablers = (state.enablers || []).filter(function (e) { return e.text; });
    if (barriers.length) {
      html += '<p class="fac-detail-text" style="margin-top:10px;"><b>Барьеры:</b></p><div class="fac-cards">';
      barriers.forEach(function (b) { html += '<div class="fac-card"><p>' + escapeHtml(b.text) + '</p></div>'; });
      html += '</div>';
    }
    if (enablers.length) {
      html += '<p class="fac-detail-text" style="margin-top:10px;"><b>Опора / ресурсы:</b></p><div class="fac-cards">';
      enablers.forEach(function (e) { html += '<div class="fac-card"><p>' + escapeHtml(e.text) + '</p></div>'; });
      html += '</div>';
    }
    return html;
  }

  var ROOM_CONFIGS = {
    roomFuture: {
      title: '«Коридор Лемеха»',
      recalcStation: 3,
      recalcLabel: 'пересчитать навык МК',
      answersHtml: roomAnswersFuture,
      ability1: { label: 'Горизонт рассуждения', code: 'МК-1', levelKey: 'mk1Level', sourceKey: 'mk1LevelSource' },
      ability2: { label: 'Работа с развилками будущего', code: 'МК-2', levelKey: 'mk2Level', sourceKey: 'mk2LevelSource', reasoningKey: 'mk2JudgeReasoning' }
    },
    roomAlternatives: {
      title: '«Очередь в „Прожектор"»',
      recalcStation: 4,
      recalcLabel: 'пересчитать навык ГА',
      answersHtml: roomAnswersAlternatives,
      ability1: { label: 'Генерация альтернатив', code: 'ГА-1', levelKey: 'ga1Level', sourceKey: 'ga1LevelSource' },
      ability2: { label: 'Идеи из разных областей', code: 'ГА-2', levelKey: 'ga2Level', sourceKey: 'ga2LevelSource', reasoningKey: 'ga2JudgeReasoning' }
    },
    roomPath: {
      title: '«Черновик к мартовскому комитету»',
      recalcStation: 5,
      recalcLabel: 'пересчитать навык ПП',
      answersHtml: roomAnswersPath,
      ability1: { label: 'Декомпозиция цели и маршрута', code: 'ПП-1', levelKey: 'pp1Level', sourceKey: 'pp1LevelSource' },
      ability2: { label: 'Работа с барьерами и ресурсами', code: 'ПП-2', levelKey: 'pp2Level', sourceKey: 'pp2LevelSource', reasoningKey: 'pp2JudgeReasoning' }
    }
  };

  function renderRoomAbilityHtml(ability, state, extraTop) {
    var level = typeof state[ability.levelKey] === 'number' ? state[ability.levelKey] : null;
    var html = '<h4 style="margin-top:16px;">' + escapeHtml(ability.label) + ' <span class="fac-code-hint">(' + ability.code + ')</span>' +
      (level !== null ? ' — L' + level : '') + '</h4>';
    if (extraTop) html += extraTop;
    if (level !== null) {
      html += '<p class="fac-detail-text">Источник: ' + (state[ability.sourceKey] === 'ai' ? 'подтверждено ИИ' : 'детерминировано кодом') + '</p>';
    } else {
      html += '<p class="fac-detail-text">' + (state.finished ? 'Не оценено.' : 'Уровень появится после завершения.') + '</p>';
    }
    var reasoning = ability.reasoningKey && state[ability.reasoningKey];
    if (reasoning && reasoning.reasoning) {
      html += '<details class="fac-judge-reasoning"><summary>Обоснование судьи (' + ability.code + ')</summary>' +
        '<p class="fac-card-warn">' + escapeHtml(reasoning.reasoning) + '</p></details>';
    }
    return html;
  }

  function renderRoomHtml(configKey, state) {
    var config = ROOM_CONFIGS[configKey];
    if (!state) {
      return '<h4>' + config.title + '</h4><p class="fac-detail-text">Ещё не начата.</p>';
    }
    var html = '<h4>' + config.title + ' — ' + (state.finished ? 'завершена ' + escapeHtml(formatDate(state.finishedAt)) : 'в процессе') + '</h4>';
    html += renderRoomAbilityHtml(config.ability1, state, state.finished ? recalcButtonHtml(config.recalcStation, config.recalcLabel) : '');
    html += renderRoomAbilityHtml(config.ability2, state, '');
    html += config.answersHtml(state);
    return html;
  }

  function renderDetailHtml(registration, s1, s2, roomFuture, roomAlternatives, roomPath, station3, participant) {
    if (!s1) {
      return '<p class="fac-detail-loading">Станция 1 ещё не начата.</p>';
    }
    var groupNames = {};
    (s1.groups || []).forEach(function (g) { groupNames[g.id] = g.name; });

    var html = '';
    html += '<div class="fac-detail-meta">' +
      '<span>' + escapeHtml(registration.email) + '</span>' +
      '<span>волна ' + escapeHtml(waveLabelMap[registration.wave] || registration.wave) + '</span>' +
      '<span>регистрация ' + escapeHtml(formatDate(registration.registeredAt)) + '</span>' +
      '<span>' + (s1.finished ? 'завершена ' + escapeHtml(formatDate(s1.finishedAt)) : 'в процессе') + '</span>' +
      '</div>';
    if (participant) {
      html += '<p class="fac-detail-text" style="margin-top:10px;"><b>Итого: ' + escapeHtml(formatTotal(participant)) + '</b></p>';
    }
    // хаб без содержания — только факт финализации; непосещённая комната не штраф,
    // единственное реальное ограничение раунда — время участника, а не полнота
    html += '<p class="fac-detail-text">' + (station3 && station3.finished
      ? 'Стратегия финализирована ' + escapeHtml(formatDate(station3.finishedAt))
      : 'Стратегия ещё не финализирована') + '</p>';

    html += renderScoreHtml(s1);
    html += renderAK2Html(s1);

    if (s1.rationale) {
      html += '<h4>Как структурировал карту</h4><p class="fac-detail-text">' + escapeHtml(s1.rationale) + '</p>';
    }

    html += '<h4>Карточки проблем (' + (s1.cards || []).length + ')</h4>';
    if (!s1.cards || !s1.cards.length) {
      html += '<p class="fac-detail-text">Пока пусто.</p>';
    } else {
      html += '<div class="fac-cards">';
      s1.cards.forEach(function (c) {
        html += '<div class="fac-card">' +
          '<p>' + escapeHtml(c.text || '(без формулировки)') + '</p>' +
          '<div class="fac-card-meta">' +
            (c.anchor ? '<span>якорь: ' + escapeHtml(c.anchor) + '</span>' : '<span class="fac-card-warn">якорь не указан</span>') +
            (c.group && groupNames[c.group] ? '<span>' + escapeHtml(groupNames[c.group]) + '</span>' : '') +
          '</div></div>';
      });
      html += '</div>';
    }

    var reviewedCount = Object.keys(s1.appxReviewed || {}).length;
    html += '<h4>Приложения — изучено ' + reviewedCount + '/8</h4>';

    html += '<h4>Заметки и выделения (' + (s1.highlights || []).length + ')</h4>';
    if (!s1.highlights || !s1.highlights.length) {
      html += '<p class="fac-detail-text">Нет отметок.</p>';
    } else {
      html += '<div class="fac-cards">';
      s1.highlights.forEach(function (h) {
        html += '<div class="fac-card">' +
          '<p>«' + escapeHtml(h.snippet) + '»</p>' +
          (h.note ? '<div class="fac-card-meta"><span>' + escapeHtml(h.note) + '</span></div>' : '') +
          '</div>';
      });
      html += '</div>';
    }

    html += renderPRHtml(s2);
    html += renderRoomHtml('roomFuture', roomFuture);
    html += renderRoomHtml('roomAlternatives', roomAlternatives);
    html += renderRoomHtml('roomPath', roomPath);

    return html;
  }

  detailClose.addEventListener('click', function () { detail.classList.remove('show'); });
  detail.addEventListener('click', function (e) { if (e.target === detail) detail.classList.remove('show'); });

  // silent auto-login if a password from earlier this tab session still works
  var cached = currentPassword();
  if (cached) attemptLogin(cached);
})();

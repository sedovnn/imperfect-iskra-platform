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

  var detail = document.getElementById('facDetail');
  var detailBib = document.getElementById('facDetailBib');
  var detailName = document.getElementById('facDetailName');
  var detailBody = document.getElementById('facDetailBody');
  var detailClose = document.getElementById('facDetailClose');
  var sortScoreHeader = document.getElementById('facSortScore');
  var sortScore2Header = document.getElementById('facSortScore2');
  var sortTotalHeader = document.getElementById('facSortTotal');
  var wavesListEl = document.getElementById('facWavesList');
  var waveAddForm = document.getElementById('facWaveAddForm');
  var waveLabelInput = document.getElementById('facWaveLabelInput');
  var waveFilterSelect = document.getElementById('facWaveFilter');
  var exportBtn = document.getElementById('facExportBtn');

  var sortState = { key: 'bib', dir: 1 };
  var lastParticipants = [];

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

  function abilityBadge(level, source) {
    if (typeof level !== 'number') return '—';
    return 'L' + level + (source === 'ai' ? '·ИИ' : '·дет.');
  }

  // Станция 1 = навык АК (АК-1 широта + АК-2 глубина), станция 2 = навык ПР
  // (ПР-1 приоритизация + ПР-2 обоснование). ⚑ — нарушено ограничение
  // зависимостей методологии (АК-2 ≤ АК-1 / ПР-2 ≤ ПР-1+1), нужна ручная проверка.
  function formatLevel(p, key) {
    var s = p[key];
    if (key === 'station1') {
      var a1 = abilityBadge(s.level, s.levelSource);
      var a2 = abilityBadge(s.ak2Level, s.ak2LevelSource);
      if (a1 === '—' && a2 === '—') return s.finished ? 'не оценено' : '—';
      return a1 + ' / ' + a2 + (s.akFlag ? ' ⚑' : '');
    }
    var p1 = abilityBadge(s.pr1Level, s.pr1LevelSource);
    var p2 = abilityBadge(s.pr2Level, s.pr2LevelSource);
    if (p1 === '—' && p2 === '—') return s.finished ? 'не оценено' : '—';
    return p1 + ' / ' + p2 + (s.prFlag ? ' ⚑' : '');
  }

  // «Итого» = сумма баллов посчитанных навыков (§9): пока АК + ПР, максимум 10.
  // Пять навыков (max 25) появятся, когда соберутся остальные станции.
  function totalScore(p) {
    var ak = typeof p.station1.akSkill === 'number' ? p.station1.akSkill : null;
    var pr = typeof p.station2.prSkill === 'number' ? p.station2.prSkill : null;
    if (ak === null && pr === null) return null;
    return (ak || 0) + (pr || 0);
  }

  function formatTotal(p) {
    var ak = typeof p.station1.akSkill === 'number' ? p.station1.akSkill : null;
    var pr = typeof p.station2.prSkill === 'number' ? p.station2.prSkill : null;
    if (ak === null && pr === null) return '—';
    var parts = [];
    parts.push('АК ' + (ak === null ? '?' : ak));
    parts.push('ПР ' + (pr === null ? '?' : pr));
    return (ak !== null && pr !== null ? (ak + pr) + '/10' : '…') + ' (' + parts.join(' + ') + ')';
  }

  function sortParticipants(participants) {
    var dir = sortState.dir;
    return participants.slice().sort(function (a, b) {
      if (sortState.key === 'score') {
        var av1 = typeof a.station1.level === 'number' ? a.station1.level : -1;
        var bv1 = typeof b.station1.level === 'number' ? b.station1.level : -1;
        return (av1 - bv1) * dir;
      }
      if (sortState.key === 'score2') {
        var av2 = typeof a.station2.pr1Level === 'number' ? a.station2.pr1Level : -1;
        var bv2 = typeof b.station2.pr1Level === 'number' ? b.station2.pr1Level : -1;
        return (av2 - bv2) * dir;
      }
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

    view.forEach(function (p) {
      var status1 = stationStatusLabel(p, 'station1');
      var status2 = stationStatusLabel(p, 'station2');
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(formatBib(p.bib)) + '</td>' +
        '<td>' + escapeHtml(p.firstName + ' ' + p.lastName) + '</td>' +
        '<td>' + escapeHtml(p.email) + '</td>' +
        '<td>' + escapeHtml(waveLabelMap[p.wave] || p.wave) + '</td>' +
        '<td>' + escapeHtml(formatDate(p.registeredAt)) + '</td>' +
        '<td><span class="fac-pill ' + status1.cls + '">' + status1.text + '</span></td>' +
        '<td><span class="fac-pill ' + status2.cls + '">' + status2.text + '</span></td>' +
        '<td>' + p.station1.appxReviewedCount + '/8 · ' + p.station1.cardCount + ' карт.</td>' +
        '<td>' + escapeHtml(formatDate(p.station1.updatedAt)) + '</td>' +
        '<td class="fac-score-cell">' + escapeHtml(formatLevel(p, 'station1')) +
          ' <button class="fac-recalc-btn" data-station="1" title="Пересчитать навык АК">↻</button></td>' +
        '<td class="fac-score-cell">' + escapeHtml(formatLevel(p, 'station2')) +
          ' <button class="fac-recalc-btn" data-station="2" title="Пересчитать навык ПР">↻</button></td>' +
        '<td>' + escapeHtml(formatTotal(p)) + '</td>' +
        '<td><button class="fac-delete-btn" title="Удалить участника">✕</button></td>';
      tr.addEventListener('click', function () { openDetail(p); });
      tr.querySelectorAll('.fac-recalc-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          recalcScore(p.bib, e.currentTarget, Number(e.currentTarget.getAttribute('data-station')));
        });
      });
      tr.querySelector('.fac-delete-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        deleteParticipant(p, e.currentTarget);
      });
      tableBody.appendChild(tr);
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

  if (exportBtn) exportBtn.addEventListener('click', function () {
    var rows = [
      ['№', 'Имя', 'Фамилия', 'Email', 'Волна', 'Дата регистрации', 'Статус станции 1', 'Карточек', 'Приложений изучено', 'АК-1', 'Источник АК-1', 'АК-2', 'Источник АК-2', 'Флаг АК-2>АК-1', 'Навык АК (балл)', 'Статус станции 2', 'ПР-1', 'Источник ПР-1', 'ПР-2', 'Источник ПР-2', 'Флаг ПР-2>ПР-1+1', 'Навык ПР (балл)', 'Итого (из 10)']
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
        typeof p.station2.prSkill === 'number' ? p.station2.prSkill : '',
        totalScore(p) === null ? '' : totalScore(p)
      ]);
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

  function recalcScore(bib, btn, station) {
    var action = station === 2 ? 'judgeStation2' : 'judgeStation1';
    btn.disabled = true;
    btn.textContent = '…';
    window.imp.callApi(action, { password: currentPassword(), bib: bib }).then(function (res) {
      if (res && res.ok) {
        refresh();
      } else {
        btn.disabled = false;
        btn.textContent = '↻';
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

  bindSortHeader(sortScoreHeader, 'score', -1);
  bindSortHeader(sortScore2Header, 'score2', -1);
  bindSortHeader(sortTotalHeader, 'total', -1);

  function pluralParticipants(n) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'участник';
    if ([2, 3, 4].indexOf(mod10) !== -1 && [12, 13, 14].indexOf(mod100) === -1) return 'участника';
    return 'участников';
  }

  function openDetail(participant) {
    detailBib.textContent = formatBib(participant.bib);
    detailName.textContent = participant.firstName + ' ' + participant.lastName;
    detailBody.innerHTML = '<p class="fac-detail-loading">Загружаю карту участника…</p>';
    detail.classList.add('show');

    window.imp.callApi('facilitatorDetail', { password: currentPassword(), bib: participant.bib }).then(function (res) {
      if (!res || !res.ok) {
        detailBody.innerHTML = '<p class="fac-detail-loading">Не удалось загрузить — попробуйте «Обновить» и открыть снова.</p>';
        return;
      }
      detailBody.innerHTML = renderDetailHtml(res.registration, res.station1, res.station2);
    });
  }

  var AK1_DOMAIN_LABELS = {
    competitors: 'конкуренты',
    techShift: 'технологический/продуктовый сдвиг',
    marketStructure: 'структура рынка',
    ownership: 'смена собственника/корпоративный центр',
    talent: 'рынок труда/отток специалистов'
  };

  function renderScoreHtml(s1) {
    if (typeof s1.level !== 'number') {
      return '<h4>АК-1 · широта охвата</h4><p class="fac-detail-text">Не оценено — используйте «↻» в таблице.</p>';
    }
    var html = '<h4>АК-1 · широта охвата — L' + s1.level + '</h4>';
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
    var html = '<h4>АК-2 · глубина взаимосвязей' + (typeof s1.ak2Level === 'number' ? ' — L' + s1.ak2Level : '') + '</h4>';
    if (typeof s1.ak2Level !== 'number') {
      html += '<p class="fac-detail-text">Не оценено — используйте «↻» в таблице.</p>';
    } else {
      html += '<p class="fac-detail-text">Источник: ' + (s1.ak2LevelSource === 'ai' ? 'подтверждено ИИ' : 'детерминировано кодом') + '</p>';
      if (typeof s1.level === 'number' && s1.ak2Level > s1.level) {
        html += '<p class="fac-detail-text fac-card-warn">⚑ АК-2 выше АК-1 — по методологии нельзя глубоко анализировать незамеченное, нужна ручная проверка.</p>';
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

    html += '<h4 style="margin-top:14px;">ПР-1 · приоритизация' + (typeof s2.pr1Level === 'number' ? ' — L' + s2.pr1Level : '') + '</h4>';
    if (typeof s2.pr1Level === 'number') {
      html += '<p class="fac-detail-text">Источник: ' + (s2.pr1LevelSource === 'ai' ? 'подтверждено ИИ' : 'детерминировано кодом') + '</p>';
    } else {
      html += '<p class="fac-detail-text">' + (s2.finished ? 'Не оценено — используйте «↻» в таблице.' : 'Уровень появится после завершения.') + '</p>';
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

    html += '<h4 style="margin-top:16px;">ПР-2 · обоснование выбора' + (typeof s2.pr2Level === 'number' ? ' — L' + s2.pr2Level : '') + '</h4>';
    if (typeof s2.pr2Level === 'number') {
      html += '<p class="fac-detail-text">Источник: ' + (s2.pr2LevelSource === 'ai' ? 'подтверждено ИИ' : 'детерминировано кодом') + '</p>';
      if (typeof s2.pr1Level === 'number' && s2.pr2Level > s2.pr1Level + 1) {
        html += '<p class="fac-detail-text fac-card-warn">⚑ ПР-2 выше ПР-1 более чем на 1 — нарушено ограничение зависимостей, нужна ручная проверка.</p>';
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

  function renderDetailHtml(registration, s1, s2) {
    if (!s1) {
      return '<p class="fac-detail-loading">Станция 1 ещё не начата.</p>';
    }
    var groupNames = {};
    (s1.groups || []).forEach(function (g) { groupNames[g.id] = g.name; });

    var html = '';
    html += '<div class="fac-detail-meta">' +
      '<span>' + escapeHtml(registration.email) + '</span>' +
      '<span>волна ' + escapeHtml(waveLabelMap[registration.wave] || registration.wave) + '</span>' +
      '<span>' + (s1.finished ? 'завершена ' + escapeHtml(formatDate(s1.finishedAt)) : 'в процессе') + '</span>' +
      '</div>';

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

    return html;
  }

  detailClose.addEventListener('click', function () { detail.classList.remove('show'); });
  detail.addEventListener('click', function (e) { if (e.target === detail) detail.classList.remove('show'); });

  // silent auto-login if a password from earlier this tab session still works
  var cached = currentPassword();
  if (cached) attemptLogin(cached);
})();

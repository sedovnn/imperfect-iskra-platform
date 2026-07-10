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

  function formatScore(p, key, max) {
    var s = p[key];
    if (typeof s.score === 'number') return s.score + '/' + max;
    return s.finished ? 'не оценено' : '—';
  }

  function totalScore(p) {
    var s1 = p.station1.score, s2 = p.station2.score;
    return (typeof s1 === 'number' && typeof s2 === 'number') ? s1 + s2 : null;
  }

  function formatTotal(p) {
    var t = totalScore(p);
    return typeof t === 'number' ? t + '/20' : '—';
  }

  var VERDICT_LABELS = {
    held: { text: 'удержал', cls: 'is-done' },
    recovered_recall: { text: 'вернулся', cls: 'is-progress' },
    not_defended: { text: 'не защитил', cls: 'is-none' }
  };

  function verdictLabel(p) {
    var v = p.station3 && p.station3.verdict;
    if (v && VERDICT_LABELS[v]) return VERDICT_LABELS[v];
    return { text: p.station3 && p.station3.finished ? 'не оценено' : '—', cls: 'is-none' };
  }

  function sortParticipants(participants) {
    var dir = sortState.dir;
    return participants.slice().sort(function (a, b) {
      if (sortState.key === 'score' || sortState.key === 'score2') {
        var stationKey = sortState.key === 'score' ? 'station1' : 'station2';
        var av = typeof a[stationKey].score === 'number' ? a[stationKey].score : -1;
        var bv = typeof b[stationKey].score === 'number' ? b[stationKey].score : -1;
        return (av - bv) * dir;
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
      var status3 = stationStatusLabel(p, 'station3');
      var verdict = verdictLabel(p);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(formatBib(p.bib)) + '</td>' +
        '<td>' + escapeHtml(p.firstName + ' ' + p.lastName) + '</td>' +
        '<td>' + escapeHtml(p.email) + '</td>' +
        '<td>' + escapeHtml(waveLabelMap[p.wave] || p.wave) + '</td>' +
        '<td>' + escapeHtml(formatDate(p.registeredAt)) + '</td>' +
        '<td><span class="fac-pill ' + status1.cls + '">' + status1.text + '</span></td>' +
        '<td><span class="fac-pill ' + status2.cls + '">' + status2.text + '</span></td>' +
        '<td><span class="fac-pill ' + status3.cls + '">' + status3.text + '</span></td>' +
        '<td class="fac-score-cell"><span class="fac-pill ' + verdict.cls + '">' + escapeHtml(verdict.text) + '</span>' +
          ' <button class="fac-recalc-btn" data-station="3" title="Пересчитать вердикт станции 3">↻</button></td>' +
        '<td>' + p.station1.appxReviewedCount + '/8 · ' + p.station1.cardCount + ' карт.</td>' +
        '<td>' + escapeHtml(formatDate(p.station1.updatedAt)) + '</td>' +
        '<td class="fac-score-cell">' + escapeHtml(formatScore(p, 'station1', 16)) +
          ' <button class="fac-recalc-btn" data-station="1" title="Пересчитать балл станции 1">↻</button></td>' +
        '<td class="fac-score-cell">' + escapeHtml(formatScore(p, 'station2', 4)) +
          ' <button class="fac-recalc-btn" data-station="2" title="Пересчитать балл станции 2">↻</button></td>' +
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
      ['№', 'Имя', 'Фамилия', 'Email', 'Волна', 'Дата регистрации', 'Статус станции 1', 'Карточек', 'Приложений изучено', 'Балл 1', 'Статус станции 2', 'Балл 2', 'Итого', 'Статус станции 3', 'Вердикт']
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
        typeof p.station1.score === 'number' ? p.station1.score : '',
        stationStatusLabel(p, 'station2').text,
        typeof p.station2.score === 'number' ? p.station2.score : '',
        totalScore(p) === null ? '' : totalScore(p),
        stationStatusLabel(p, 'station3').text,
        verdictLabel(p).text
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
    var action = station === 3 ? 'judgeStation3' : station === 2 ? 'judgeStation2' : 'judgeStation1';
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
      detailBody.innerHTML = renderDetailHtml(res.registration, res.station1, res.station2, res.station3);
    });
  }

  function renderScoreHtml(s1) {
    if (typeof s1.score !== 'number') {
      return '<h4>Оценка судьи</h4><p class="fac-detail-text">Не оценено — используйте «↻» в таблице.</p>';
    }
    var html = '<h4>Оценка судьи — ' + s1.score + '/16</h4>';
    var matched = s1.matchedProblems || {};
    var problemIds = Object.keys(matched);
    html += '<p class="fac-detail-text">Совпавшие проблемы: ' +
      (problemIds.length
        ? problemIds.map(function (id) { return '№' + id + ' (' + (matched[id] === 1 ? 'точно' : 'неточно') + ')'; }).join(', ')
        : 'нет') + '</p>';
    html += '<p class="fac-detail-text">Ложные следы, принятые за проблему: ' +
      ((s1.falseLeadsCaught || []).length ? (s1.falseLeadsCaught || []).join(', ') : 'нет') + '</p>';
    html += '<p class="fac-detail-text">Бонус за структуру: ' + (s1.structureBonusAwarded ? 'да' : 'нет') + '</p>';
    if (s1.judgeReasoning && s1.judgeReasoning.cardJudgments) {
      html += '<details class="fac-judge-reasoning"><summary>Обоснование судьи по карточкам</summary>';
      s1.judgeReasoning.cardJudgments.forEach(function (cj) {
        var card = (s1.cards || [])[cj.cardIndex - 1];
        html += '<div class="fac-card">' +
          '<p>' + (card ? escapeHtml(card.text || '(без формулировки)') : 'карточка #' + cj.cardIndex) + '</p>' +
          '<div class="fac-card-meta"><span>' +
            (cj.problemId ? '№' + cj.problemId + ' · ' + escapeHtml(cj.quality) : (cj.falseLeadId !== 'none' ? 'ложный след ' + escapeHtml(cj.falseLeadId) : 'не по ключу')) +
          '</span></div>' +
          '<p class="fac-card-warn">' + escapeHtml(cj.reasoning || '') + '</p>' +
          '</div>';
      });
      if (s1.judgeReasoning.structureBonus) {
        html += '<p class="fac-detail-text">Структура: ' + escapeHtml(s1.judgeReasoning.structureBonus.reasoning || '') + '</p>';
      }
      html += '</details>';
    }
    return html;
  }

  var FORK_LABELS = { fortress: '«Крепость»', second_curve: '«Вторая кривая»', both_incomplete: 'обе позиции неполны' };

  function renderScore2Html(s2) {
    if (!s2) {
      return '<h4>Станция 2</h4><p class="fac-detail-text">Ещё не начата.</p>';
    }
    var html = '<h4>Станция 2 — ' + (s2.finished ? 'завершена ' + escapeHtml(formatDate(s2.finishedAt)) : 'в процессе') + '</h4>';
    if (typeof s2.score !== 'number') {
      html += '<p class="fac-detail-text">Не оценено' + (s2.finished ? ' — используйте «↻» в таблице.' : '.') + '</p>';
    } else {
      var matched = s2.matchedConnections || {};
      var connIds = Object.keys(matched);
      html += '<p class="fac-detail-text"><b>Оценка судьи — ' + s2.score + '/4</b></p>';
      html += '<p class="fac-detail-text">Совпавшие связки: ' +
        (connIds.length
          ? connIds.map(function (id) { return '№' + id + ' (' + (matched[id] === 1 ? 'точно' : 'неточно') + ')'; }).join(', ')
          : 'нет') + '</p>';
      html += '<p class="fac-detail-text">Бонус за развилку (рекомендация + честная цена): ' + (s2.forkBonusAwarded ? 'да' : 'нет') + '</p>';
    }
    html += '<p class="fac-detail-text">Развилка: <b>' + (FORK_LABELS[s2.forkChoice] || s2.forkChoice || 'не выбрана') + '</b></p>';
    if (s2.forkRationale) {
      html += '<p class="fac-detail-text">' + escapeHtml(s2.forkRationale) + '</p>';
    }
    if (s2.forkCriteria1 || s2.forkCriteria2) {
      html += '<p class="fac-detail-text">Критерии: ' + escapeHtml(s2.forkCriteria1 || '—') + ' · ' + escapeHtml(s2.forkCriteria2 || '—') + '</p>';
    }
    if ((s2.rootConnections || []).length) {
      html += '<div class="fac-cards">';
      s2.rootConnections.forEach(function (c) {
        html += '<div class="fac-card"><p>' + escapeHtml(c.problems || '(не указано)') + '</p>' +
          (c.mechanism ? '<div class="fac-card-meta"><span>' + escapeHtml(c.mechanism) + '</span></div>' : '') +
          '</div>';
      });
      html += '</div>';
    }
    if (s2.judgeReasoning && s2.judgeReasoning.connectionJudgments) {
      html += '<details class="fac-judge-reasoning"><summary>Обоснование судьи по связкам и развилке</summary>';
      s2.judgeReasoning.connectionJudgments.forEach(function (cj) {
        html += '<div class="fac-card"><div class="fac-card-meta"><span>' +
          (cj.matchedConnectionId ? '№' + cj.matchedConnectionId + ' · ' + escapeHtml(cj.quality) : 'не по ключу') +
          '</span></div><p class="fac-card-warn">' + escapeHtml(cj.reasoning || '') + '</p></div>';
      });
      if (s2.judgeReasoning.forkJudgment) {
        html += '<p class="fac-detail-text">Развилка: ' + escapeHtml(s2.judgeReasoning.forkJudgment.reasoning || '') + '</p>';
      }
      html += '</details>';
    }
    return html;
  }

  var AGEEV_LINES = [
    'Заходите, присаживайтесь. Я прочитал то, что вы прислали — карту, связки, рекомендацию. Прежде чем перейдём к делу — короткий вопрос на разогрев: что из вашей карты вы бы назвали первым, если бы у вас было тридцать секунд перед лифтом?',
    'Хорошо. По развилке я примерно понял вашу позицию. Меня смущает вот что: правление скажет, что решение можно принять и через полгода, когда будет больше данных. Зачем спешить?',
    'И раз заговорили о данных — отдельный вопрос по одному из пунктов карты. Вы написали что-то про отсутствие мониторинга рынка и конкурентов. Честно, не вижу тут проблемы: у нас одиннадцать статей на топовых конференциях в 2025-м — больше, чем у всех остальных на рынке вместе. Ресерч в курсе всего, что происходит в индустрии. Loop выйдет не раньше 2027-го — время есть. По-моему, это не корневая проблема, а частность, которую можно снять с карты.',
    'Понял вас. На сегодня достаточно — коллеги ждут вас на восьмом этаже, обсудите детали. Прежде чем вы уйдёте — что-нибудь ещё, о чём мы не поговорили?'
  ];

  function renderStation3Html(s3) {
    if (!s3) {
      return '<h4>Станция 3</h4><p class="fac-detail-text">Ещё не начата.</p>';
    }
    var verdictInfo = VERDICT_LABELS[s3.verdict] || { text: s3.finished ? 'не оценено' : '—', cls: 'is-none' };
    var html = '<h4>Станция 3 — ' + (s3.finished ? 'завершена ' + escapeHtml(formatDate(s3.finishedAt)) : 'в процессе') + '</h4>';
    html += '<p class="fac-detail-text">Вердикт: <span class="fac-pill ' + verdictInfo.cls + '">' + escapeHtml(verdictInfo.text) + '</span></p>';
    if (s3.verdictReasoning) {
      html += '<p class="fac-detail-text">' + escapeHtml(s3.verdictReasoning) + '</p>';
    }
    if ((s3.responses || []).some(function (r) { return r; })) {
      html += '<div class="fac-cards">';
      AGEEV_LINES.forEach(function (line, i) {
        var resp = (s3.responses || [])[i];
        if (!resp) return;
        html += '<div class="fac-card">' +
          '<p><b>Агеев:</b> «' + escapeHtml(line) + '»</p>' +
          '<div class="fac-card-meta"><span>ответ участника</span></div>' +
          '<p class="fac-card-warn">' + escapeHtml(resp) + '</p>' +
          '</div>';
      });
      html += '</div>';
    }
    return html;
  }

  function renderDetailHtml(registration, s1, s2, s3) {
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

    html += renderScore2Html(s2);
    html += renderStation3Html(s3);

    return html;
  }

  detailClose.addEventListener('click', function () { detail.classList.remove('show'); });
  detail.addEventListener('click', function (e) { if (e.target === detail) detail.classList.remove('show'); });

  // silent auto-login if a password from earlier this tab session still works
  var cached = currentPassword();
  if (cached) attemptLogin(cached);
})();

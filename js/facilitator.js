// i(m)perfect — кабинет фасилитатора. Смотрит на тот же бэкенд (js/api.js).
// Пароль хранится только в sessionStorage вкладки — не в localStorage и никуда не логируется.
// Модель Strat OS: колонка на каждую способность (уровень 1–5 + признак ai/детерминировано),
// вместо станций с баллами/вердиктами. Полная агрегация в навыки/общий балл — отдельный шаг
// (фаза 3), когда все 10 способностей будут собраны — здесь только 3 пилотные (AK1/PP1/PR2).

(function () {
  var PASSWORD_KEY = 'imp_facilitator_password';
  var ABILITY_CODES = ['AK1', 'PP1', 'PR2'];
  var ABILITY_LABELS = { AK1: 'АК-1', PP1: 'ПП-1', PR2: 'ПР-2' };

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
  var wavesListEl = document.getElementById('facWavesList');
  var waveAddForm = document.getElementById('facWaveAddForm');
  var waveLabelInput = document.getElementById('facWaveLabelInput');
  var waveFilterSelect = document.getElementById('facWaveFilter');
  var exportBtn = document.getElementById('facExportBtn');

  var sortState = { dir: 1 };
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

  function abilityInfo(p, code) {
    var a = (p.abilities && p.abilities[code]) || null;
    if (!a || !a.started) return { text: 'не начата', cls: 'is-none', level: null };
    if (typeof a.level === 'number') {
      return { text: 'L' + a.level + (a.levelSource === 'ai' ? ' · ИИ' : ' · дет.'), cls: 'is-done', level: a.level };
    }
    if (a.finished) return { text: 'не оценено', cls: 'is-progress', level: null };
    return { text: 'в процессе', cls: 'is-progress', level: null };
  }

  function sortParticipants(participants) {
    var dir = sortState.dir;
    return participants.slice().sort(function (a, b) { return (Number(a.bib) - Number(b.bib)) * dir; });
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
      var tr = document.createElement('tr');
      var cells =
        '<td>' + escapeHtml(formatBib(p.bib)) + '</td>' +
        '<td>' + escapeHtml(p.firstName + ' ' + p.lastName) + '</td>' +
        '<td>' + escapeHtml(p.email) + '</td>' +
        '<td>' + escapeHtml(waveLabelMap[p.wave] || p.wave) + '</td>' +
        '<td>' + escapeHtml(formatDate(p.registeredAt)) + '</td>';

      ABILITY_CODES.forEach(function (code) {
        var info = abilityInfo(p, code);
        cells += '<td class="fac-score-cell"><span class="fac-pill ' + info.cls + '">' + escapeHtml(info.text) + '</span>' +
          ' <button class="fac-recalc-btn" data-ability="' + code + '" title="Пересчитать ' + ABILITY_LABELS[code] + '">↻</button></td>';
      });

      cells += '<td><button class="fac-delete-btn" title="Удалить участника">✕</button></td>';
      tr.innerHTML = cells;
      tr.addEventListener('click', function () { openDetail(p); });
      tr.querySelectorAll('.fac-recalc-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          recalcAbility(p.bib, e.currentTarget.getAttribute('data-ability'), e.currentTarget);
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
      'Это удалит регистрацию и весь прогресс по всем способностям. Действие необратимо.'
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
    var header = ['№', 'Имя', 'Фамилия', 'Email', 'Волна', 'Дата регистрации'].concat(
      ABILITY_CODES.map(function (code) { return ABILITY_LABELS[code]; })
    );
    var rows = [header];
    currentView.forEach(function (p) {
      var row = [p.bib, p.firstName, p.lastName, p.email, waveLabelMap[p.wave] || p.wave, formatDate(p.registeredAt)];
      ABILITY_CODES.forEach(function (code) {
        var info = abilityInfo(p, code);
        row.push(info.level !== null ? 'L' + info.level : info.text);
      });
      rows.push(row);
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

  function recalcAbility(bib, abilityCode, btn) {
    btn.disabled = true;
    btn.textContent = '…';
    window.imp.callApi('judgeAbility', { password: currentPassword(), bib: bib, abilityCode: abilityCode }).then(function (res) {
      if (res && res.ok) {
        refresh();
      } else {
        btn.disabled = false;
        btn.textContent = '↻';
        window.alert('Не удалось пересчитать: ' + (res && res.error ? res.error : 'нет ответа от бэкенда'));
      }
    });
  }

  function pluralParticipants(n) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'участник';
    if ([2, 3, 4].indexOf(mod10) !== -1 && [12, 13, 14].indexOf(mod100) === -1) return 'участника';
    return 'участников';
  }

  function openDetail(participant) {
    detailBib.textContent = formatBib(participant.bib);
    detailName.textContent = participant.firstName + ' ' + participant.lastName;
    detailBody.innerHTML = '<p class="fac-detail-loading">Загружаю…</p>';
    detail.classList.add('show');

    window.imp.callApi('facilitatorDetail', { password: currentPassword(), bib: participant.bib }).then(function (res) {
      if (!res || !res.ok) {
        detailBody.innerHTML = '<p class="fac-detail-loading">Не удалось загрузить — попробуйте «Обновить» и открыть снова.</p>';
        return;
      }
      detailBody.innerHTML = renderDetailHtml(res.registration, res.abilities);
    });
  }

  function renderAbilityDetailHtml(code, record) {
    var html = '<h4>' + escapeHtml(ABILITY_LABELS[code]) + '</h4>';
    if (!record) {
      html += '<p class="fac-detail-text">Ещё не начата.</p>';
      return html;
    }
    html += '<p class="fac-detail-text">' + (record.finished ? 'Завершена ' + escapeHtml(formatDate(record.finishedAt)) : 'В процессе') + '</p>';
    if (typeof record.level === 'number') {
      html += '<p class="fac-detail-text"><b>Уровень: L' + record.level + '</b> (' +
        (record.levelSource === 'ai' ? 'подтверждено ИИ' : 'детерминировано кодом') + ')</p>';
    } else {
      html += '<p class="fac-detail-text">' + (record.finished ? 'Не оценено — используйте «↻» в таблице.' : 'Уровень появится после завершения.') + '</p>';
    }
    if (record.judgeReasoning) {
      html += '<details class="fac-judge-reasoning"><summary>Обоснование судьи</summary>' +
        '<pre style="white-space:pre-wrap; font-size:12.5px; margin:0;">' + escapeHtml(JSON.stringify(record.judgeReasoning, null, 2)) + '</pre></details>';
    }
    if (record.stages && Object.keys(record.stages).length) {
      html += '<details class="fac-judge-reasoning"><summary>Ответ участника (сырые данные)</summary>' +
        '<pre style="white-space:pre-wrap; font-size:12.5px; margin:0;">' + escapeHtml(JSON.stringify(record.stages, null, 2)) + '</pre></details>';
    }
    return html;
  }

  function renderDetailHtml(registration, abilities) {
    var html = '<div class="fac-detail-meta">' +
      '<span>' + escapeHtml(registration.email) + '</span>' +
      '<span>волна ' + escapeHtml(waveLabelMap[registration.wave] || registration.wave) + '</span>' +
      '</div>';

    ABILITY_CODES.forEach(function (code) {
      html += renderAbilityDetailHtml(code, abilities ? abilities[code] : null);
    });

    return html;
  }

  detailClose.addEventListener('click', function () { detail.classList.remove('show'); });
  detail.addEventListener('click', function (e) { if (e.target === detail) detail.classList.remove('show'); });

  // silent auto-login if a password from earlier this tab session still works
  var cached = currentPassword();
  if (cached) attemptLogin(cached);
})();

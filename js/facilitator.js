// i(m)perfect — кабинет фасилитатора. Смотрит на тот же бэкенд (js/api.js),
// что и register.js/station1.js. Пароль хранится только в sessionStorage
// вкладки — не в localStorage и никуда не логируется.

(function () {
  var PASSWORD_KEY = 'imp_facilitator_password';

  var WAVE_LABELS = {
    w1: '15 июля, 11:00',
    w2: '18 июля, 15:00',
    w3: '22 июля, 11:00'
  };

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

  refreshBtn.addEventListener('click', refresh);

  function stationStatusLabel(p) {
    if (p.station1.finished) return { text: 'завершена', cls: 'is-done' };
    if (p.station1.started) return { text: 'в процессе', cls: 'is-progress' };
    return { text: 'не начата', cls: 'is-none' };
  }

  function formatScore(p) {
    if (typeof p.station1.score === 'number') return p.station1.score + '/16';
    return p.station1.finished ? 'не оценено' : '—';
  }

  function sortParticipants(participants) {
    var dir = sortState.dir;
    return participants.slice().sort(function (a, b) {
      if (sortState.key === 'score') {
        var av = typeof a.station1.score === 'number' ? a.station1.score : -1;
        var bv = typeof b.station1.score === 'number' ? b.station1.score : -1;
        return (av - bv) * dir;
      }
      return (Number(a.bib) - Number(b.bib)) * dir;
    });
  }

  function renderParticipants(participants) {
    lastParticipants = participants || [];
    participants = sortParticipants(lastParticipants);
    countEl.textContent = participants.length + ' ' + pluralParticipants(participants.length);
    tableBody.innerHTML = '';
    empty.style.display = participants.length ? 'none' : '';
    table.style.display = participants.length ? '' : 'none';

    participants.forEach(function (p) {
      var status = stationStatusLabel(p);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(formatBib(p.bib)) + '</td>' +
        '<td>' + escapeHtml(p.firstName + ' ' + p.lastName) + '</td>' +
        '<td>' + escapeHtml(p.email) + '</td>' +
        '<td>' + escapeHtml(WAVE_LABELS[p.wave] || p.wave) + '</td>' +
        '<td>' + escapeHtml(formatDate(p.registeredAt)) + '</td>' +
        '<td><span class="fac-pill ' + status.cls + '">' + status.text + '</span></td>' +
        '<td>' + p.station1.appxReviewedCount + '/8 · ' + p.station1.cardCount + ' карт.</td>' +
        '<td>' + escapeHtml(formatDate(p.station1.updatedAt)) + '</td>' +
        '<td class="fac-score-cell">' + escapeHtml(formatScore(p)) +
          ' <button class="fac-recalc-btn" data-bib="' + escapeHtml(String(p.bib)) + '" title="Пересчитать балл">↻</button></td>';
      tr.addEventListener('click', function () { openDetail(p); });
      tr.querySelector('.fac-recalc-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        recalcScore(p.bib, e.currentTarget);
      });
      tableBody.appendChild(tr);
    });
  }

  function recalcScore(bib, btn) {
    btn.disabled = true;
    btn.textContent = '…';
    window.imp.callApi('judgeStation1', { password: currentPassword(), bib: bib }).then(function (res) {
      if (res && res.ok) {
        refresh();
      } else {
        btn.disabled = false;
        btn.textContent = '↻';
        window.alert('Не удалось пересчитать балл: ' + (res && res.error ? res.error : 'нет ответа от бэкенда'));
      }
    });
  }

  sortScoreHeader.addEventListener('click', function () {
    if (sortState.key === 'score') {
      sortState.dir = sortState.dir * -1;
    } else {
      sortState.key = 'score';
      sortState.dir = -1;
    }
    renderParticipants(lastParticipants);
  });

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
      detailBody.innerHTML = renderDetailHtml(res.registration, res.station1);
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

  function renderDetailHtml(registration, s1) {
    if (!s1) {
      return '<p class="fac-detail-loading">Станция 1 ещё не начата.</p>';
    }
    var groupNames = {};
    (s1.groups || []).forEach(function (g) { groupNames[g.id] = g.name; });

    var html = '';
    html += '<div class="fac-detail-meta">' +
      '<span>' + escapeHtml(registration.email) + '</span>' +
      '<span>волна ' + escapeHtml(WAVE_LABELS[registration.wave] || registration.wave) + '</span>' +
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

    return html;
  }

  detailClose.addEventListener('click', function () { detail.classList.remove('show'); });
  detail.addEventListener('click', function (e) { if (e.target === detail) detail.classList.remove('show'); });

  // silent auto-login if a password from earlier this tab session still works
  var cached = currentPassword();
  if (cached) attemptLogin(cached);
})();

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
  var searchInput = document.getElementById('facSearch');
  var sortBibHeader = document.getElementById('facSortBib');
  var sortNameHeader = document.getElementById('facSortName');

  var sortState = { key: 'bib', dir: 1 };
  var searchValue = '';
  var lastParticipants = [];
  var currentDetailParticipant = null;
  var detailLastFocus = null; // куда вернуть фокус после закрытия карточки участника

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

  // Внутрисистемный тост вместо native alert (по токенам бренда).
  function impToast(message, kind) {
    var t = document.createElement('div');
    t.className = 'imp-toast' + (kind === 'error' ? ' is-error' : '');
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    t.textContent = message;
    document.body.appendChild(t);
    // двойной rAF, чтобы стартовое opacity:0 успело примениться до перехода
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { t.classList.add('is-in'); });
    });
    setTimeout(function () {
      t.classList.remove('is-in');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }, kind === 'error' ? 5200 : 3600);
  }

  // Внутрисистемный диалог подтверждения вместо native confirm. Возвращает Promise<boolean>.
  function impConfirm(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'imp-confirm';
      var msgHtml = escapeHtml(message).replace(/\n/g, '<br>');
      ov.innerHTML =
        '<div class="imp-confirm-card" role="alertdialog" aria-modal="true">' +
          '<p class="imp-confirm-msg">' + msgHtml + '</p>' +
          '<div class="imp-confirm-actions">' +
            '<button type="button" class="btn btn-ghost" data-act="cancel">' + escapeHtml(opts.cancelLabel || 'Отмена') + '</button>' +
            '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok">' + escapeHtml(opts.confirmLabel || 'Подтвердить') + '</button>' +
          '</div>' +
        '</div>';
      function close(val) {
        document.removeEventListener('keydown', onKey);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        resolve(val);
      }
      function onKey(e) { if (e.key === 'Escape') close(false); }
      ov.addEventListener('click', function (e) { if (e.target === ov) close(false); });
      ov.querySelector('[data-act="cancel"]').addEventListener('click', function () { close(false); });
      ov.querySelector('[data-act="ok"]').addEventListener('click', function () { close(true); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(ov);
      var okBtn = ov.querySelector('[data-act="ok"]');
      if (okBtn) okBtn.focus();
    });
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
    // отдача на нажатие: вход ждёт ответа бэкенда (холодный старт — секунды),
    // без этого кажется, что клик не сработал (тот же паттерн, что «Обновить»)
    var t = loginBtn.textContent;
    loginBtn.disabled = true;
    loginBtn.textContent = 'Вхожу…';
    attemptLogin(pw).then(function (ok) {
      if (!ok) { loginBtn.disabled = false; loginBtn.textContent = t; }
      // при успехе гейт скрывается — восстанавливать кнопку не нужно
    });
  });

  passwordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') loginBtn.click();
  });

  function currentPassword() {
    return sessionStorage.getItem(PASSWORD_KEY) || '';
  }

  function refresh() {
    var pw = currentPassword();
    if (!pw) return Promise.resolve();
    return window.imp.callApi('facilitatorList', { password: pw }).then(function (res) {
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

  // Раньше клик не давал никакой отдачи — нажал и будто ничего не произошло.
  // Теперь кнопка реально показывает состояние: идёт запрос → секунда
  // подтверждения → обратно, тем же паттерном, что и кнопки пересчёта.
  refreshBtn.addEventListener('click', function () {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Обновляю…';
    Promise.all([refresh(), loadWaves()]).then(function () {
      refreshBtn.textContent = 'Обновлено ✓';
      setTimeout(function () {
        refreshBtn.textContent = 'Обновить';
        refreshBtn.disabled = false;
      }, 900);
    });
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

  // «Итого» = сумма посчитанных навыков (§9). Навык = сумма двух его способностей
  // (2–10); итог = сумма пяти навыков = сумма 10 способностей, максимум 50.
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

  // Компактная разбивка по пяти навыкам прямо в строке списка (детали — в карточке).
  var SKILL_CODES = ['АК', 'ПР', 'МК', 'ГА', 'ПП'];
  function skillMiniHtml(p) {
    var scores = skillScores(p);
    var chips = scores.map(function (s, i) {
      var scored = s.value !== null;
      var title = SKILL_CODES[i] + ' · ' + s.label + (scored ? ': ' + s.value : ' — не оценено');
      return '<span class="fac-skill-chip' + (scored ? '' : ' is-empty') + '" title="' + escapeHtml(title) + '">' +
        '<span class="fac-skill-code">' + SKILL_CODES[i] + '</span>' +
        '<span class="fac-skill-val">' + (scored ? s.value : '·') + '</span></span>';
    }).join('');
    return '<span class="fac-skill-mini">' + chips + '</span>';
  }

  // Сколько из 10 способностей реально оценено (по одному уровню на способность).
  function countAbilitiesJudged(p) {
    var vals = [
      p.station1.level, p.station1.ak2Level,
      p.station2.pr1Level, p.station2.pr2Level,
      p.roomFuture.level1, p.roomFuture.level2,
      p.roomAlternatives.level1, p.roomAlternatives.level2,
      p.roomPath.level1, p.roomPath.level2
    ];
    return vals.filter(function (v) { return typeof v === 'number'; }).length;
  }

  // Главная таблица — только итоговое число (быстрый скан по всем участникам).
  // Балл /50 корректен лишь когда оценены ВСЕ 10 способностей (п.10): при частичном
  // прохождении показываем «…» + сколько оценено, чтобы неполный балл не читался
  // как финальный. Разбивка по навыкам — в карточке участника (formatTotal).
  function formatTotalCompact(p) {
    var judged = countAbilitiesJudged(p);
    if (judged === 0) return '—';
    var t = totalScore(p);
    if (judged < 10 || t === null) return '… (' + judged + '/10)';
    return t + '/50';
  }

  function formatTotal(p) {
    var scores = skillScores(p);
    var known = scores.filter(function (s) { return s.value !== null; });
    if (!known.length) return '—';
    var parts = scores.map(function (s) { return s.label + ' ' + (s.value === null ? '?' : s.value); });
    var total = known.reduce(function (sum, s) { return sum + s.value; }, 0);
    return (known.length === scores.length ? total + '/50' : '…') + ' (' + parts.join(' + ') + ')';
  }

  function sortParticipants(participants) {
    var dir = sortState.dir;
    return participants.slice().sort(function (a, b) {
      if (sortState.key === 'total') {
        var at = totalScore(a), bt = totalScore(b);
        return ((at === null ? -1 : at) - (bt === null ? -1 : bt)) * dir;
      }
      if (sortState.key === 'name') {
        var an = (a.firstName + ' ' + a.lastName).trim().toLowerCase();
        var bn = (b.firstName + ' ' + b.lastName).trim().toLowerCase();
        return an.localeCompare(bn, 'ru') * dir;
      }
      return (Number(a.bib) - Number(b.bib)) * dir;
    });
  }

  // ---------- waves ----------

  function loadWaves() {
    return window.imp.callApi('listWaves', {}).then(function (res) {
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
        impConfirm('Убрать поток «' + w.label + '»? Уже зарегистрированные на него участники сохранят запись — поток просто исчезнет из выбора для новых регистраций.', { confirmLabel: 'Убрать поток', danger: true }).then(function (ok) {
          if (!ok) return;
          window.imp.callApi('removeWave', { password: currentPassword(), id: w.id }).then(function (res) {
            if (res && res.ok) {
              loadWaves();
            } else {
              impToast('Не удалось убрать поток: ' + (res && res.error ? res.error : 'нет ответа от бэкенда'), 'error');
            }
          });
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
          impToast('Не удалось добавить поток: ' + (res && res.error ? res.error : 'нет ответа от бэкенда'), 'error');
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

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchValue = searchInput.value;
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

    var q = searchValue.trim().toLowerCase();
    if (q) {
      var qNum = q.replace(/^№?\s*/, ''); // «№ 111» и «111» ищут одинаково
      filtered = filtered.filter(function (p) {
        var name = (p.firstName + ' ' + p.lastName).toLowerCase();
        return name.indexOf(q) !== -1 || String(p.bib).indexOf(qNum) !== -1;
      });
    }

    var view = sortParticipants(filtered);
    currentView = view;
    updateSortIndicators();

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
        '<td>' + skillMiniHtml(p) + '</td>' +
        '<td>' + escapeHtml(formatTotalCompact(p)) +
          (hasFlags(p) ? ' <span class="fac-card-warn" title="Нарушено ограничение зависимостей способностей — см. карточку участника">⚑</span>' : '') + '</td>';
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', 'Открыть карточку участника ' + formatBib(p.bib) + ', ' + p.firstName + ' ' + p.lastName);
      tr.addEventListener('click', function () { openDetail(p); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(p); }
      });
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
    impConfirm(
      'Удалить участника ' + formatBib(p.bib) + ' (' + p.firstName + ' ' + p.lastName + ')?\n' +
      'Это удалит регистрацию и весь прогресс по станциям 1, 2 и 3. Действие необратимо.',
      { confirmLabel: 'Удалить', danger: true }
    ).then(function (confirmed) {
      if (!confirmed) return;
      btn.disabled = true;
      window.imp.callApi('deleteParticipant', { password: currentPassword(), bib: p.bib }).then(function (res) {
        if (res && res.ok) {
          refresh();
        } else {
          btn.disabled = false;
          impToast('Не удалось удалить участника: ' + (res && res.error ? res.error : 'нет ответа от бэкенда'), 'error');
        }
      });
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
        'Итого (из 50)', 'Оценено способностей (из 10)', 'Стратегия финализирована', 'Дата финализации']
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
          countAbilitiesJudged(p),
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
    5: 'judgeRoomPath',
    '3c': 'judgeStation3Control'
  };

  // ---- ручная корректировка балла по контролю (§7-8): ПР-2/МК-2/ГА-1 ----
  // Балл судьи сохраняется, правка обратима. Показываем в карточке контроля.
  function overrideControlsHtml(ability, controlLevel, ovInfo) {
    var html = '<div class="fac-ov">';
    if (ovInfo && ovInfo.overrideLevel !== null && ovInfo.overrideLevel !== undefined) {
      html += '<p class="fac-detail-text"><b>Скорректировано вручную:</b> судья ' +
        (ovInfo.judgeLevel === null || ovInfo.judgeLevel === undefined ? '—' : 'L' + ovInfo.judgeLevel) +
        ' → <b>L' + ovInfo.overrideLevel + '</b>' +
        (ovInfo.via === 'control' ? ' (принята контрольная)' : '') +
        (ovInfo.reason ? ' · «' + escapeHtml(ovInfo.reason) + '»' : '') + '</p>' +
        '<button class="fac-ov-btn" data-ovclear="' + ability + '">Сбросить к оценке судьи</button>';
    } else {
      html += '<button class="fac-ov-btn" data-ovaccept="' + ability + '" data-level="' + controlLevel + '">Принять контрольную (L' + controlLevel + ')</button>' +
        '<div class="fac-ov-manual">' +
        '<select data-ovlevel="' + ability + '"><option value="">уровень…</option>' +
        [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '">L' + n + '</option>'; }).join('') + '</select>' +
        '<input type="text" data-ovreason="' + ability + '" placeholder="причина корректировки" />' +
        '<button class="fac-ov-btn" data-ovset="' + ability + '">Сохранить</button>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  function refreshAfterOverride(participant) {
    if (currentDetailParticipant && currentDetailParticipant.bib === participant.bib) openDetail(participant);
    if (typeof refresh === 'function') refresh(); // обновить итог в списке
  }

  function applyOverride(participant, ability, level, reason, via, btn) {
    if (btn) btn.disabled = true;
    window.imp.callApi('setScoreOverride', {
      password: currentPassword(), bib: participant.bib, ability: ability, level: level, reason: reason, via: via
    }).then(function (res) {
      if (res && res.ok) { impToast('Оценка скорректирована: L' + level); refreshAfterOverride(participant); }
      else { if (btn) btn.disabled = false; impToast('Не удалось сохранить корректировку', 'error'); }
    });
  }

  function wireScoreOverrides(root, participant) {
    root.querySelectorAll('[data-ovaccept]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyOverride(participant, btn.getAttribute('data-ovaccept'), Number(btn.getAttribute('data-level')), 'принята контрольная оценка', 'control', btn);
      });
    });
    root.querySelectorAll('[data-ovset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-ovset');
        var sel = root.querySelector('[data-ovlevel="' + k + '"]');
        var reasonEl = root.querySelector('[data-ovreason="' + k + '"]');
        var lvl = sel ? Number(sel.value) : 0;
        if (!(lvl >= 1 && lvl <= 5)) { impToast('Выберите уровень L1–L5', 'error'); return; }
        applyOverride(participant, k, lvl, reasonEl ? reasonEl.value : '', 'manual', btn);
      });
    });
    root.querySelectorAll('[data-ovclear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-ovclear');
        btn.disabled = true;
        window.imp.callApi('clearScoreOverride', { password: currentPassword(), bib: participant.bib, ability: k }).then(function (res) {
          if (res && res.ok) { impToast('Корректировка сброшена'); refreshAfterOverride(participant); }
          else { btn.disabled = false; impToast('Не удалось сбросить', 'error'); }
        });
      });
    });
  }

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
        impToast('Не удалось пересчитать балл: ' + (res && res.error ? res.error : 'нет ответа от бэкенда'), 'error');
      }
    });
  }

  var SORT_HEADERS = []; // {el, key} — для обновления индикаторов сортировки

  function bindSortHeader(headerEl, key, defaultDir) {
    if (!headerEl) return;
    headerEl.tabIndex = 0;
    headerEl.setAttribute('role', 'button');
    headerEl.setAttribute('aria-sort', 'none');
    SORT_HEADERS.push({ el: headerEl, key: key });
    function toggle() {
      if (sortState.key === key) {
        sortState.dir = sortState.dir * -1;
      } else {
        sortState.key = key;
        sortState.dir = defaultDir;
      }
      renderParticipants(lastParticipants); // renderParticipants → updateSortIndicators
    }
    headerEl.addEventListener('click', toggle);
    headerEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }

  // Живой индикатор: активный столбец получает стрелку направления, остальные — ↕.
  function updateSortIndicators() {
    SORT_HEADERS.forEach(function (h) {
      var active = sortState.key === h.key;
      var arrow = h.el.querySelector('.fac-sort-arrow');
      if (arrow) arrow.textContent = active ? (sortState.dir === 1 ? '▲' : '▼') : '↕';
      h.el.classList.toggle('is-sorted', active);
      h.el.setAttribute('aria-sort', active ? (sortState.dir === 1 ? 'ascending' : 'descending') : 'none');
    });
  }

  bindSortHeader(sortBibHeader, 'bib', 1);
  bindSortHeader(sortNameHeader, 'name', 1);
  bindSortHeader(sortTotalHeader, 'total', -1);
  updateSortIndicators();

  function pluralParticipants(n) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'участник';
    if ([2, 3, 4].indexOf(mod10) !== -1 && [12, 13, 14].indexOf(mod100) === -1) return 'участника';
    return 'участников';
  }

  function openDetail(participant) {
    var wasOpen = detail.classList.contains('show');
    currentDetailParticipant = participant;
    detailBib.textContent = formatBib(participant.bib);
    detailName.textContent = participant.firstName + ' ' + participant.lastName;
    detailBody.innerHTML = '<p class="fac-detail-loading">Загружаю карту участника…</p>';
    detail.classList.add('show');
    // Фокус-менеджмент только при первом открытии (openDetail зовётся повторно
    // для перерисовки после пересчёта — тогда фокус и обработчик не трогаем).
    if (!wasOpen) {
      detailLastFocus = document.activeElement;
      detail.setAttribute('aria-hidden', 'false');
      document.addEventListener('keydown', onDetailKeydown);
      // Прямой focus() (не requestAnimationFrame — тот заморожен в скрытой вкладке).
      if (detailClose) detailClose.focus();
    }

    window.imp.callApi('facilitatorDetail', { password: currentPassword(), bib: participant.bib }).then(function (res) {
      if (!res || !res.ok) {
        detailBody.innerHTML = '<p class="fac-detail-loading">Не удалось загрузить — попробуйте «Обновить» и открыть снова.</p>';
        return;
      }
      detailBody.innerHTML = renderDetailHtml(res.registration, res.station1, res.station2, res.roomFuture, res.roomAlternatives, res.roomPath, res.station3, participant, res.overrides || {});
      detailBody.querySelectorAll('[data-recalc]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          recalcScore(participant.bib, btn, btn.getAttribute('data-recalc'), function () {
            if (currentDetailParticipant && currentDetailParticipant.bib === participant.bib) openDetail(participant);
          });
        });
      });
      wireScoreOverrides(detailBody, participant);
      var reportBtn = detailBody.querySelector('[data-report]');
      if (reportBtn) {
        reportBtn.addEventListener('click', function () {
          if (reportBtn.disabled) return;
          try {
            window.impReport.download(participant, res.registration);
            impToast('Отчёт сформирован — файл скачивается.');
          } catch (e) {
            impToast('Не удалось сформировать отчёт: ' + (e && e.message ? e.message : 'ошибка'), 'error');
          }
        });
      }
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

  // ——— общие примитивы тела задания: единый вид способности во всех станциях ———
  // Способность = свой блок (имя+код, уровень справа, пояснение оценки). Сырой
  // материал участника выносится отдельными .fac-datasec, чтобы оценка и данные
  // не сливались в одно плоское полотно. Пересчёт — в подвале задания (recalcFooter).
  function abilityBlock(label, code, level, inner) {
    var scored = typeof level === 'number';
    return '<div class="fac-ability">' +
      '<div class="fac-ability-head">' +
        '<h4 class="fac-ability-name">' + escapeHtml(label) + ' <span class="fac-ability-code">' + escapeHtml(code) + '</span></h4>' +
        '<span class="fac-ability-level' + (scored ? '' : ' is-empty') + '">' + (scored ? 'L' + level : '—') + '</span>' +
      '</div>' + (inner || '') + '</div>';
  }
  function srcLine(source) {
    return '<p class="fac-ability-src">' + (source === 'ai' ? 'подтверждено ИИ' : 'определено кодом') + '</p>';
  }
  // Вердикт судьи — самое важное в способности: выделен цветом, но свёрнут
  // (длинный; раскрывают, только если результат смутил). Отдельный от контроля.
  function judgeBlock(reasoning) {
    if (!reasoning || !reasoning.reasoning) return '';
    return '<details class="fac-verdict"><summary class="fac-verdict-sum">Вердикт судьи</summary>' +
      '<p class="fac-verdict-text">' + escapeHtml(reasoning.reasoning) + '</p></details>';
  }
  // Всё, что участник написал/ответил — вторично, нужно только при сомнении в
  // вердикте. Сворачиваем в один тихий блок под способностями.
  function materialsBlock(inner) {
    if (!inner) return '';
    return '<details class="fac-materials"><summary class="fac-materials-sum">Материалы участника</summary>' +
      '<div class="fac-materials-body">' + inner + '</div></details>';
  }
  function warnLine(text) {
    return '<p class="fac-flag">⚑ ' + escapeHtml(text) + '</p>';
  }
  function factChecks(items) {  // [{label, on}] → чек-лист вместо «·»-строки признаков
    return '<ul class="fac-checks">' + items.map(function (it) {
      return '<li class="' + (it.on ? 'is-on' : 'is-off') + '">' + escapeHtml(it.label) + '</li>';
    }).join('') + '</ul>';
  }
  function dataSection(title, inner) {  // сырой материал участника (не оценка)
    return '<div class="fac-datasec"><h5 class="fac-datasec-title">' + escapeHtml(title) + '</h5>' + inner + '</div>';
  }
  function recalcFooter(station, label) {
    return '<div class="fac-task-foot">' + recalcButtonHtml(station, label) + '</div>';
  }

  function renderScoreHtml(s1) {
    var inner = '';
    if (typeof s1.level !== 'number') {
      inner = '<p class="fac-detail-text">Не оценено.</p>';
    } else {
      inner += judgeBlock(s1.judgeReasoning) + srcLine(s1.levelSource);
      var domains = s1.domainsCovered || [];
      inner += '<p class="fac-detail-text"><span class="fac-k">Домены (' + domains.length + '/5):</span> ' +
        (domains.length ? domains.map(function (d) { return AK1_DOMAIN_LABELS[d] || d; }).join(', ') : 'нет') + '</p>';
      if (s1.levelSource === 'ai') {
        inner += factChecks([
          { label: 'выходит за пределы явного в кейсе', on: s1.beyondCase },
          { label: 'видит взаимное влияние факторов', on: s1.seesInterdependency },
          { label: 'называет фактор второго порядка', on: s1.namesSecondOrder }
        ]);
      }
    }
    return abilityBlock('Широта охвата', 'АК-1', s1.level, inner);
  }

  var TAG_LABELS = { threat: 'угроза', opportunity: 'возможность' };

  function renderAK2Html(s1) {
    var inner = '';
    if (typeof s1.ak2Level !== 'number') {
      inner = '<p class="fac-detail-text">Не оценено.</p>';
    } else {
      if (typeof s1.level === 'number' && s1.ak2Level > s1.level) {
        inner += warnLine('Глубина выше широты — нельзя глубоко анализировать незамеченное, нужна ручная проверка.');
      }
      inner += judgeBlock(s1.ak2JudgeReasoning) + srcLine(s1.ak2LevelSource);
    }
    return abilityBlock('Глубина взаимосвязей', 'АК-2', s1.ak2Level, inner);
  }

  // Все сырые материалы станции 1 (помеченные факторы, связки, проблемы,
  // приложения) — под сворачиваемым «Материалы участника».
  function renderS1Materials(s1) {
    var cardById = {};
    (s1.cards || []).forEach(function (c) { cardById[c.id] = c; });
    var out = '';

    var tagged = (s1.cards || []).filter(function (c) { return c.tag === 'threat' || c.tag === 'opportunity'; });
    if (tagged.length) {
      var t = '<div class="fac-cards">';
      tagged.forEach(function (c) {
        t += '<div class="fac-card"><p>' + escapeHtml(c.text || '(без формулировки)') + '</p>' +
          '<div class="fac-card-meta"><span class="fac-tag">' + (TAG_LABELS[c.tag] || c.tag) + '</span></div>' +
          (c.influence ? '<p class="fac-card-note">' + escapeHtml(c.influence) + '</p>' : '') +
          '</div>';
      });
      t += '</div>';
      out += dataSection('Помеченные факторы', t);
    }

    if ((s1.connections || []).length) {
      var cc = '<div class="fac-cards">';
      s1.connections.forEach(function (conn) {
        var cardTexts = (conn.cardIds || []).map(function (id) {
          var c = cardById[id];
          return c ? '«' + (c.text || '').slice(0, 60) + '»' : '(карточка удалена)';
        }).join(' + ');
        cc += '<div class="fac-card">' +
          '<p>' + escapeHtml(cardTexts || '(карточки не выбраны)') + '</p>' +
          '<div class="fac-card-meta">' +
            (conn.mechanism ? '<span>механизм: ' + escapeHtml(conn.mechanism) + '</span>' : '') +
            (conn.conclusion ? '<span>вывод: ' + escapeHtml(conn.conclusion) + '</span>' : '') +
            (conn.isLoop ? '<span>заявлена петля</span>' : '') +
          '</div></div>';
      });
      cc += '</div>';
      out += dataSection('Корневые связки (' + s1.connections.length + ')', cc);
    }

    var s1cards = (s1.cards || []).filter(function (c) { return c.text && String(c.text).trim(); });
    var problemsInner = '';
    if (!s1cards.length) {
      problemsInner += '<p class="fac-detail-text">Пока пусто.</p>';
    } else {
      problemsInner += '<div class="fac-cards">';
      s1cards.forEach(function (c) {
        problemsInner += '<div class="fac-card">' +
          '<p>' + escapeHtml(c.text) + '</p>' +
          (c.anchor ? '<div class="fac-card-meta"><span>из цитаты: «' + escapeHtml(c.anchor) + '»</span></div>' : '') +
          (c.influence ? '<p class="fac-card-note">' + escapeHtml(c.influence) + '</p>' : '') +
          '</div>';
      });
      problemsInner += '</div>';
    }
    if (s1.mainProblemId) {
      var mp = s1cards.filter(function (c) { return c.id === s1.mainProblemId; })[0];
      if (mp) problemsInner += '<p class="fac-detail-text"><span class="fac-k">Основная, по участнику:</span> ' + escapeHtml(mp.text) + (s1.mainProblemWhy ? ' — ' + escapeHtml(s1.mainProblemWhy) : '') + '</p>';
    }
    out += dataSection('Проблемы (' + s1cards.length + ')', problemsInner);

    var reviewedCount = Object.keys(s1.appxReviewed || {}).length;
    out += dataSection('Приложения', '<p class="fac-detail-text">Изучено ' + reviewedCount + ' из 8</p>');
    return out;
  }

  // Станция 2 «Встреча с Агеевым» — навык ПР: приоритеты/отказы (ПР-1),
  // обоснование + стресс-тест + проактивность (ПР-2).
  function renderPRHtml(s2) {
    if (!s2) {
      return '<p class="fac-detail-text">Ещё не начата.</p>';
    }
    var cardById = {};
    (s2.cardsSnapshot || []).forEach(function (c) { cardById[c.id] = c; });
    function textOf(id) { var c = cardById[id]; return c ? c.text : '(карточка не найдена)'; }

    // ——— ПР-1 · выбор приоритетов ———
    var pr1Inner = typeof s2.pr1Level === 'number'
      ? judgeBlock(s2.pr1JudgeReasoning) + srcLine(s2.pr1LevelSource)
      : '<p class="fac-detail-text">' + (s2.finished ? 'Не оценено.' : 'Уровень появится после завершения.') + '</p>';
    var ab = abilityBlock('Выбор приоритетов', 'ПР-1', s2.pr1Level, pr1Inner);

    // ——— ПР-2 · защита выбора ———
    var pr2Inner = '';
    if (typeof s2.pr2Level === 'number' && typeof s2.pr1Level === 'number' && s2.pr2Level > s2.pr1Level + 1) {
      pr2Inner += warnLine('Защита выше выбора больше чем на 1 уровень — так не должно быть, нужна ручная проверка.');
    }
    pr2Inner += judgeBlock(s2.pr2JudgeReasoning);
    if (typeof s2.pr2Level === 'number') pr2Inner += srcLine(s2.pr2LevelSource);
    ab += abilityBlock('Защита выбора', 'ПР-2', s2.pr2Level, pr2Inner);

    // ——— материалы участника ———
    var mat = '';
    if ((s2.priorities || []).length) {
      var pr = '<div class="fac-cards">';
      s2.priorities.forEach(function (p, i) {
        pr += '<div class="fac-card"><p><b>' + (i + 1) + '.</b> ' + escapeHtml(textOf(p.cardId)) + '</p>' +
          (p.target ? '<div class="fac-card-meta"><span>ориентир: ' + escapeHtml(p.target) + '</span></div>' : '') +
          '</div>';
      });
      pr += '</div>';
      mat += dataSection('Приоритеты', pr);
    }
    if ((s2.rejected || []).length) {
      var rj = '<div class="fac-cards">';
      s2.rejected.forEach(function (r) {
        rj += '<div class="fac-card"><p>' + escapeHtml(textOf(r.cardId)) + '</p>' +
          (r.freed ? '<div class="fac-card-meta"><span>освобождает: ' + escapeHtml(r.freed) + '</span></div>' : '') +
          '</div>';
      });
      rj += '</div>';
      if (s2.rejectionRule) rj += '<p class="fac-detail-text"><span class="fac-k">Правило отказа:</span> ' + escapeHtml(s2.rejectionRule) + '</p>';
      mat += dataSection('Явные отказы («не сейчас»)', rj);
    } else if (s2.rejectionRule) {
      mat += dataSection('Правило отказа', '<p class="fac-detail-text">' + escapeHtml(s2.rejectionRule) + '</p>');
    }

    var defend = '';
    if (s2.firstAction) defend += '<p class="fac-detail-text"><span class="fac-k">Первый ход по приоритету №1:</span> ' + escapeHtml(s2.firstAction) + '</p>';
    if (s2.rationale) defend += '<p class="fac-detail-text"><span class="fac-k">Почему №1 первым:</span> ' + escapeHtml(s2.rationale) + '</p>';
    if (s2.stressChoice) {
      defend += '<p class="fac-detail-text"><span class="fac-k">Стресс-тест «отложим на полгода»:</span> <span class="fac-pill ' +
        (s2.stressChoice === 'hold' ? 'is-done' : 'is-progress') + '">' +
        (s2.stressChoice === 'hold' ? 'настоял на своём' : (s2.stressChoice === 'calibrate' ? 'пересобрал частично' : 'согласился пересобрать')) + '</span></p>';
      if (s2.stressComment) defend += '<p class="fac-detail-text">' + escapeHtml(s2.stressComment) + '</p>';
    }
    if (s2.proactiveText) defend += '<p class="fac-detail-text"><span class="fac-k">Условия пересмотра выбора:</span> ' + escapeHtml(s2.proactiveText) + '</p>';
    if (s2.stance) {
      var stanceLabel = s2.stance === 'fortress' ? '«Крепость»'
        : s2.stance === 'secondCurve' ? '«Вторая кривая»'
        : (s2.stanceOther ? '«' + s2.stanceOther + '» (своя)' : 'обе неверны (своя не сформулирована)');
      defend += '<p class="fac-detail-text"><span class="fac-k">Рекомендация по развилке:</span> ' + escapeHtml(stanceLabel) + '</p>';
      if (s2.stanceCriteria) defend += '<p class="fac-detail-text"><span class="fac-k">Критерии:</span> ' + escapeHtml(s2.stanceCriteria) + '</p>';
    }
    if (defend) mat += dataSection('Защита стратегии', defend);

    var statusLine = '<p class="fac-detail-text fac-status-line">' + (s2.finished ? 'Завершена ' + escapeHtml(formatDate(s2.finishedAt)) : 'В процессе') + '</p>';
    return { abilities: statusLine + ab, materials: mat };
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
    if (state.answer1) html += '<p class="fac-detail-text"><span class="fac-k">Про горизонт:</span> ' + escapeHtml(state.answer1) + '</p>';
    if (state.answer2) html += '<p class="fac-detail-text"><span class="fac-k">Если пойдёт не так:</span> ' + escapeHtml(state.answer2) + '</p>';
    return html;
  }

  function roomAnswersAlternatives(state) {
    var html = '';
    if (state.answer1) html += '<p class="fac-detail-text"><span class="fac-k">Почему это сработает:</span> ' + escapeHtml(state.answer1) + '</p>';
    if (state.subdecisions) {
      html += '<p class="fac-detail-text"><span class="fac-k">Под-решения / что отбросил:</span> ' + escapeHtml(state.subdecisions) + '</p>';
    }
    var srcs = state.sources || (state.source ? String(state.source).split(',') : []);
    srcs = srcs.map(function (s) { return String(s).trim(); }).filter(function (s) { return s; });
    if (srcs.length) {
      html += '<p class="fac-detail-text"><span class="fac-k">Источники идей (самооценка):</span> ' +
        escapeHtml(srcs.map(function (s) { return GA2_SOURCE_LABELS[s] || s; }).join('; ')) + '</p>';
    }
    if (state.sourceElaboration) {
      html += '<p class="fac-detail-text"><span class="fac-k">Элаборация:</span> ' + escapeHtml(state.sourceElaboration) + '</p>';
    }
    return html;
  }

  function roomAnswersPath(state) {
    var html = '';
    if (state.currentState || state.targetState) {
      html += '<p class="fac-detail-text"><span class="fac-k">Текущее → целевое:</span> ' +
        escapeHtml(state.currentState || '—') + ' → ' + escapeHtml(state.targetState || '—') + '</p>';
    }
    if ((state.stages || []).length) {
      html += '<div class="fac-cards">';
      state.stages.forEach(function (st, i) {
        html += '<div class="fac-card"><p><b>Этап ' + (i + 1) + '.</b> ' + escapeHtml(st.description || '(не описан)') + '</p>' +
          (st.rationale ? '<div class="fac-card-meta"><span>почему здесь: ' + escapeHtml(st.rationale) + '</span></div>' : '') +
          (st.doneWhen ? '<div class="fac-card-meta"><span>завершён, когда: ' + escapeHtml(st.doneWhen) + '</span></div>' : '') +
          '</div>';
      });
      html += '</div>';
    }
    if (state.contingency) {
      html += '<p class="fac-detail-text"><span class="fac-k">Что меняет маршрут:</span> ' + escapeHtml(state.contingency) + '</p>';
    }
    var barriers = (state.barriers || []).filter(function (b) { return b.text; });
    var enablers = (state.enablers || []).filter(function (e) { return e.text; });
    if (barriers.length) {
      var BTYPE = { fixed: 'стена', surmountable: 'можно обойти' };
      html += '<p class="fac-detail-text fac-subk"><span class="fac-k">Барьеры:</span></p><div class="fac-cards">';
      barriers.forEach(function (b) {
        html += '<div class="fac-card"><p>' + escapeHtml(b.text) + '</p>' +
          (b.type ? '<div class="fac-card-meta"><span>' + (BTYPE[b.type] || b.type) + '</span></div>' : '') +
          (b.counter ? '<div class="fac-card-meta"><span>чем закрываем: ' + escapeHtml(b.counter) + '</span></div>' : '') +
          '</div>';
      });
      html += '</div>';
    }
    if (enablers.length) {
      html += '<p class="fac-detail-text fac-subk"><span class="fac-k">Опора / ресурсы:</span></p><div class="fac-cards">';
      enablers.forEach(function (e) { html += '<div class="fac-card"><p>' + escapeHtml(e.text) + '</p></div>'; });
      html += '</div>';
    }
    return html;
  }

  var ROOM_CONFIGS = {
    roomFuture: {
      title: '«Коридор Лемеха»',
      recalcStation: 3,
      recalcLabel: 'Пересчитать навык МК',
      answersHtml: roomAnswersFuture,
      ability1: { label: 'Горизонт рассуждения', code: 'МК-1', levelKey: 'mk1Level', sourceKey: 'mk1LevelSource' },
      ability2: { label: 'Работа с развилками будущего', code: 'МК-2', levelKey: 'mk2Level', sourceKey: 'mk2LevelSource', reasoningKey: 'mk2JudgeReasoning' }
    },
    roomAlternatives: {
      title: '«Очередь в „Прожектор"»',
      recalcStation: 4,
      recalcLabel: 'Пересчитать навык ГА',
      answersHtml: roomAnswersAlternatives,
      ability1: { label: 'Генерация альтернатив', code: 'ГА-1', levelKey: 'ga1Level', sourceKey: 'ga1LevelSource' },
      ability2: { label: 'Идеи из разных областей', code: 'ГА-2', levelKey: 'ga2Level', sourceKey: 'ga2LevelSource', reasoningKey: 'ga2JudgeReasoning' }
    },
    roomPath: {
      title: '«Черновик к мартовскому комитету»',
      recalcStation: 5,
      recalcLabel: 'Пересчитать навык ПП',
      answersHtml: roomAnswersPath,
      ability1: { label: 'Декомпозиция цели и маршрута', code: 'ПП-1', levelKey: 'pp1Level', sourceKey: 'pp1LevelSource' },
      ability2: { label: 'Работа с барьерами и ресурсами', code: 'ПП-2', levelKey: 'pp2Level', sourceKey: 'pp2LevelSource', reasoningKey: 'pp2JudgeReasoning' }
    }
  };

  function renderRoomAbilityHtml(ability, state) {
    var level = typeof state[ability.levelKey] === 'number' ? state[ability.levelKey] : null;
    var inner;
    if (level !== null) {
      inner = judgeBlock(ability.reasoningKey && state[ability.reasoningKey]) + srcLine(state[ability.sourceKey]);
    } else {
      inner = '<p class="fac-detail-text">' + (state.finished ? 'Не оценено.' : 'Уровень появится после завершения.') + '</p>';
    }
    return abilityBlock(ability.label, ability.code, level, inner);
  }

  function renderRoomHtml(configKey, state) {
    var config = ROOM_CONFIGS[configKey];
    if (!state) {
      return { abilities: '<p class="fac-detail-text">Ещё не начата.</p>', materials: '' };
    }
    var ab = '<p class="fac-detail-text fac-status-line">' + (state.finished ? 'Завершена ' + escapeHtml(formatDate(state.finishedAt)) : 'В процессе') + '</p>';
    ab += renderRoomAbilityHtml(config.ability1, state);
    ab += renderRoomAbilityHtml(config.ability2, state);
    var ans = config.answersHtml(state);
    return { abilities: ab, materials: ans ? dataSection('Ответы участника', ans) : '' };
  }

  // Карточка участника раньше была одним длинным полотном — все шесть заданий
  // подряд, с сырыми карточками/заметками/обоснованиями судьи целиком видны сразу.
  // Теперь каждое задание — свой <details>: заголовок + баллы видны без раскрытия
  // (это и нужно фасилитатору для быстрого скана), сырой материал — по клику.
  function abilityBadgeHtml(code, level) {
    return typeof level === 'number'
      ? '<span class="fac-pill is-done">' + escapeHtml(code) + ' L' + level + '</span>'
      : '<span class="fac-pill">' + escapeHtml(code) + ' —</span>';
  }

  function skillBadgeHtml(label, value) {
    return typeof value === 'number'
      ? '<span class="fac-pill is-done">' + escapeHtml(label) + ' ' + value + '/10</span>'
      : '<span class="fac-pill">' + escapeHtml(label) + ' —</span>';
  }

  // Чип маркера ИИ-помощи (процессный сигнал: вставка/скорость ввода). НЕ влияет на
  // балл — только подсказывает, как трактовать. Данные приходят в state.aiMarkerLevel/Note.
  function aiMarkerChipHtml(state) {
    if (!state || (state.aiMarkerLevel !== 'soft' && state.aiMarkerLevel !== 'strong')) return '';
    var strong = state.aiMarkerLevel === 'strong';
    var note = state.aiMarkerNote || (strong ? 'Похоже, ответ вставлен извне.' : 'Возможны признаки ИИ-помощи.');
    return '<span class="fac-pill fac-ai-chip ' + (strong ? 'is-ai-strong' : 'is-ai-soft') + '" title="' + escapeHtml(note) + '">⚡ ' + (strong ? 'ИИ-помощь' : 'ИИ?') + '</span>';
  }

  function taskSectionHtml(title, statusKey, participant, badgesHtml, bodyHtml, warn) {
    var status = statusKey ? stationStatusLabel(participant, statusKey) : null;
    var statusPill = status ? '<span class="fac-pill ' + status.cls + '">' + escapeHtml(status.text) + '</span>' : '';
    return '<details class="fac-task' + (warn ? ' fac-task--attn' : '') + '">' +
      '<summary class="fac-task-summary">' +
        '<div class="fac-task-head">' +
          '<span class="fac-task-title">' + escapeHtml(title) + (warn ? ' <span class="fac-card-warn" title="' + escapeHtml(warn) + '">⚑</span>' : '') + '</span>' +
          statusPill +
        '</div>' +
        (badgesHtml ? '<div class="fac-task-badges">' + badgesHtml + '</div>' : '') +
      '</summary>' +
      '<div class="fac-task-body">' + bodyHtml + '</div>' +
      '</details>';
  }

  // ---- кросс-комнатный контроль: показываем в карточке комнаты, где навык проявился ----
  // (ГА-1 — в Станции 1 по выводам связок; ПП-1 — в «Будущем»). Данные в
  // station3.control.crossRoom; флаг = здесь выше, чем в своей комнате.
  function crossRoomBadgeHtml(cr, key) {
    if (!cr || !cr[key]) return '';
    var c = cr[key];
    return '<span class="fac-pill ' + (c.flag ? 'is-attn' : 'is-done') + '">' + escapeHtml(c.code) +
      ' контроль L' + c.cross + (c.home === null || c.home === undefined ? '' : ' / дома L' + c.home) +
      (c.flag ? ' ⚑' : '') + '</span>';
  }
  function crossAcceptHtml(ability, level, code, ovInfo) {
    if (ovInfo && ovInfo.overrideLevel !== null && ovInfo.overrideLevel !== undefined) {
      return '<div class="fac-ov"><p class="fac-detail-text"><b>Скорректировано:</b> судья ' +
        (ovInfo.judgeLevel === null || ovInfo.judgeLevel === undefined ? '—' : 'L' + ovInfo.judgeLevel) +
        ' → <b>L' + ovInfo.overrideLevel + '</b>' + (ovInfo.reason ? ' · «' + escapeHtml(ovInfo.reason) + '»' : '') + '</p>' +
        '<button class="fac-ov-btn" data-ovclear="' + ability + '">Сбросить к оценке судьи</button></div>';
    }
    return '<div class="fac-ov"><button class="fac-ov-btn" data-ovaccept="' + ability + '" data-level="' + level +
      '">Зачесть как ' + escapeHtml(code) + ' (L' + level + ')</button>' +
      '<p class="fac-detail-text">Ручной уровень для ' + escapeHtml(code) + ' — в секции «Финальная защита и контроль».</p></div>';
  }
  function crossRoomBlockHtml(cr, key, ovInfo) {
    if (!cr || !cr[key]) return '';
    var c = cr[key];
    // ГА-1: только «зачесть/сбросить» (data-ключ дублирует §7-8, но эти хендлеры читают
    // свой атрибут — безопасно; ручной ввод ГА-1 остаётся в секции контроля). ПП-1 —
    // полный виджет (ключ уникален).
    var ov = '';
    if (c.flag) ov = (key === 'ga1') ? crossAcceptHtml('ga1', c.cross, c.code, ovInfo) : overrideControlsHtml('pp1', c.cross, ovInfo);
    return '<div class="fac-card" style="margin-top:12px;"><p>' + escapeHtml(c.code + ' · контроль (навык проявился здесь)') +
      (c.flag ? ' <span class="fac-card-warn">⚑ выше, чем в своей комнате</span>' : '') + '</p>' +
      '<p class="fac-detail-text">Оценка по чужому тексту (не оптимизирован под способность), по карте утечек. Балл автоматически не меняется — сверьте и решите вручную.</p>' +
      '<div class="fac-card-meta"><span>здесь: L' + c.cross + '</span>' +
      '<span>в своей комнате: ' + (c.home === null || c.home === undefined ? '—' : 'L' + c.home) + '</span></div>' +
      ov +
      (c.reasoning ? '<details class="fac-judge-reasoning"><summary>Обоснование судьи</summary><p class="fac-card-warn">' + escapeHtml(c.reasoning) + '</p></details>' : '') +
      '</div>';
  }

  function renderDetailHtml(registration, s1, s2, roomFuture, roomAlternatives, roomPath, station3, participant, overrides) {
    if (!s1) {
      return '<p class="fac-detail-loading">Станция 1 ещё не начата.</p>';
    }
    var crossRoom = station3 && station3.control && station3.control.crossRoom ? station3.control.crossRoom : {};
    var html = '';
    html += '<div class="fac-detail-meta">' +
      '<span>' + escapeHtml(registration.email) + '</span>' +
      '<span>волна ' + escapeHtml(waveLabelMap[registration.wave] || registration.wave) + '</span>' +
      '<span>регистрация ' + escapeHtml(formatDate(registration.registeredAt)) + '</span>' +
      '<span>' + (s1.finished ? 'завершена ' + escapeHtml(formatDate(s1.finishedAt)) : 'в процессе') + '</span>' +
      '</div>';
    // сводный маркер ИИ-помощи: если хоть на одной станции есть признак — плашка сверху
    var aiStates = [s1, s2, roomFuture, roomAlternatives, roomPath, station3];
    var aiStrong = aiStates.some(function (x) { return x && x.aiMarkerLevel === 'strong'; });
    var aiSoft = aiStates.some(function (x) { return x && x.aiMarkerLevel === 'soft'; });
    if (aiStrong || aiSoft) {
      html += '<p class="fac-ai-banner ' + (aiStrong ? 'is-ai-strong' : 'is-ai-soft') + '">⚡ ' +
        (aiStrong
          ? 'Есть признаки использования ИИ (вставка/скорость ввода). Балл стоит читать как оценку отбора и редактуры, а не самостоятельного порождения.'
          : 'Возможны признаки ИИ-помощи на отдельных заданиях — см. отметки ⚡ ниже. На балл не влияет, только трактовка.') +
        '</p>';
    }
    if (participant) {
      html += '<p class="fac-detail-text" style="margin-top:10px;"><b>Итого: ' + escapeHtml(formatTotal(participant)) + '</b></p>';
    }
    // хаб без содержания — только факт финализации; непосещённая комната не штраф,
    // единственное реальное ограничение раунда — время участника, а не полнота
    html += '<p class="fac-detail-text">' + (station3 && station3.finished
      ? 'Стратегия финализирована ' + escapeHtml(formatDate(station3.finishedAt))
      : 'Стратегия ещё не финализирована') + '</p>';

    // ---- Отчёт участника «сравнение с ИИ» (скачать → в личку) ----
    // Собирается на клиенте из уже посчитанных баллов; кнопка активна только когда
    // оценены все 10 способностей (иначе балл /50 и дельты неполны).
    if (participant) {
      var ready = countAbilitiesJudged(participant) === 10;
      html += '<div class="fac-report-block">' +
        '<button class="btn btn-primary btn-sm" data-report="1"' + (ready ? '' : ' disabled') + '>Сформировать отчёт (сравнение с ИИ) →</button>' +
        '<span class="fac-detail-text" style="margin:0;">' + (ready
          ? 'Скачает готовый HTML-отчёт — превью для участника, можно отправить в личку.'
          : 'Отчёт можно сформировать, когда оценены все 10 способностей (сейчас ' + countAbilitiesJudged(participant) + '/10).') +
        '</span></div>';
    }

    // ---- Станция 1 · Вычитка и карта проблем (АК-1 + АК-2) ----
    // Порядок тела: способности (уровень + вердикт) → «Материалы участника»
    // (свёрнуто) → пересчёт. Балл навыка берём из participant (сырые записи его не несут).
    var s1Body = renderScoreHtml(s1) + renderAK2Html(s1) +
      crossRoomBlockHtml(crossRoom, 'ga1', overrides && overrides.ga1) +
      materialsBlock(renderS1Materials(s1)) + recalcFooter(1, 'Пересчитать навык АК');
    html += taskSectionHtml(
      'Станция 1 · Вычитка и карта проблем', 'station1', participant,
      abilityBadgeHtml('АК-1', s1.level) + abilityBadgeHtml('АК-2', s1.ak2Level) + skillBadgeHtml('навык АК', participant.station1 && participant.station1.akSkill) + crossRoomBadgeHtml(crossRoom, 'ga1') + aiMarkerChipHtml(s1),
      s1Body,
      (participant.station1 && participant.station1.akFlag) ? 'Нарушено ограничение зависимостей способностей'
        : ((crossRoom.ga1 && crossRoom.ga1.flag) ? 'ГА-1 проявлен здесь выше, чем в своей комнате — контроль' : null)
    );

    // ---- Станция 2 · Встреча с Агеевым (ПР-1 + ПР-2) ----
    var pr = renderPRHtml(s2);
    html += taskSectionHtml(
      'Станция 2 · Встреча с Агеевым', 'station2', participant,
      abilityBadgeHtml('ПР-1', s2 && s2.pr1Level) + abilityBadgeHtml('ПР-2', s2 && s2.pr2Level) + skillBadgeHtml('навык ПР', participant.station2 && participant.station2.prSkill) + aiMarkerChipHtml(s2),
      pr.abilities + materialsBlock(pr.materials) + (s2 ? recalcFooter(2, 'Пересчитать навык ПР') : ''),
      participant.station2 && participant.station2.prFlag ? 'Нарушено ограничение зависимостей способностей' : null
    );

    // ---- Три комнаты финального отрезка ----
    ['roomFuture', 'roomAlternatives', 'roomPath'].forEach(function (key) {
      var config = ROOM_CONFIGS[key];
      var state = key === 'roomFuture' ? roomFuture : (key === 'roomAlternatives' ? roomAlternatives : roomPath);
      var room = renderRoomHtml(key, state);
      // ПП-1 всплывает в «Будущем» — кросс-контроль показываем в этой карточке
      var crBadge = key === 'roomFuture' ? crossRoomBadgeHtml(crossRoom, 'pp1') : '';
      var crBlock = key === 'roomFuture' ? crossRoomBlockHtml(crossRoom, 'pp1', overrides && overrides.pp1) : '';
      var crWarn = (key === 'roomFuture' && crossRoom.pp1 && crossRoom.pp1.flag) ? 'ПП-1 проявлен здесь выше, чем в своей комнате — контроль' : null;
      html += taskSectionHtml(
        config.title, key, participant,
        abilityBadgeHtml(config.ability1.code, state && state[config.ability1.levelKey]) +
          abilityBadgeHtml(config.ability2.code, state && state[config.ability2.levelKey]) +
          skillBadgeHtml('навык', participant[key] && participant[key].skill) + crBadge + aiMarkerChipHtml(state),
        room.abilities + crBlock + materialsBlock(room.materials) + (state ? recalcFooter(config.recalcStation, config.recalcLabel) : ''),
        crWarn
      );
    });

    // ---- Финальная защита + контроль (§7-8) ----
    // «основную» берём из ЖИВЫХ записей станций/комнат, а не из снимка в controlJson:
    // снимок морозится в момент прогона контроля и показывает '—', если тогда база
    // ещё не была оценена (падение судьи / пересчёт позже / тестовый bib).
    html += renderControlHtml(station3, {
      pr2: s2 ? s2.pr2Level : null,
      mk2: roomFuture ? roomFuture.mk2Level : null,
      ga1: roomAlternatives ? roomAlternatives.ga1Level : null
    }, overrides || {});

    return html;
  }

  // Контроль: финальная защита + сравнение основной/контрольной оценки по ПР-2/МК-2/ГА-1.
  // Флаг ⚑ ставит арбитр-ИИ только на реальные расхождения (не на артефакт недо-вызова).
  var CONTROL_LABELS = { pr2: 'ПР-2 · обоснование выбора', mk2: 'МК-2 · развилки будущего', ga1: 'ГА-1 · генерация альтернатив' };

  function renderControlHtml(station3, livePrimary, overrides) {
    livePrimary = livePrimary || {};
    overrides = overrides || {};
    // живой уровень способности приоритетнее замороженного снимка контроля
    function primOf(k, c) {
      var lv = livePrimary[k];
      return (lv !== undefined && lv !== null) ? lv : c.primary;
    }
    // снимок устарел, если контроль заморозил пусто, а живая оценка уже есть
    function isStale(k, c) {
      return c.primary === null && livePrimary[k] !== undefined && livePrimary[k] !== null;
    }
    var hasDefense = station3 && station3.finalDefense && String(station3.finalDefense).trim();
    var control = station3 && station3.control;
    var anyFlag = false, anyStale = false;
    if (control && control.comparisons) {
      Object.keys(control.comparisons).forEach(function (k) {
        if (control.comparisons[k].flag) anyFlag = true;
        if (isStale(k, control.comparisons[k])) anyStale = true;
      });
    }
    var badges = '';
    if (control && control.comparisons) {
      ['pr2', 'mk2', 'ga1'].forEach(function (k) {
        var c = control.comparisons[k];
        if (!c) return;
        var cls = c.flag ? 'is-attn' : 'is-done';
        var prim = primOf(k, c);
        badges += '<span class="fac-pill ' + cls + '">' + escapeHtml(c.code) + ' контр.L' + c.control +
          (prim === null || prim === undefined ? '' : ' / осн.L' + prim) + (c.flag ? ' ⚑' : '') + '</span>';
      });
    }

    var body = '';
    body += recalcButtonHtml('3c', 'Пересчитать контроль');
    if (!hasDefense) {
      body += '<p class="fac-detail-text">Финальная защита не заполнена — контроль не считался.</p>';
      return taskSectionHtml('Финальная защита и контроль', null, null, badges, body, anyFlag ? 'Есть расхождение основной и контрольной оценки' : null);
    }
    body += '<p class="fac-detail-text" style="margin-top:10px;"><b>Защита стратегии:</b> ' + escapeHtml(station3.finalDefense) + '</p>';
    if (control && control.comparisons) {
      body += '<div class="fac-cards" style="margin-top:12px;">';
      ['pr2', 'mk2', 'ga1'].forEach(function (k) {
        var c = control.comparisons[k];
        if (!c) return;
        var prim = primOf(k, c);
        var gap = (prim === null || prim === undefined) ? null : Math.abs(prim - c.control);
        var stale = isStale(k, c);
        body += '<div class="fac-card"><p>' + escapeHtml(CONTROL_LABELS[k] || k) +
          (c.flag ? ' <span class="fac-card-warn">⚑ расхождение</span>' : '') + '</p>' +
          '<div class="fac-card-meta"><span>контрольная: L' + c.control + '</span>' +
          '<span>основная: ' + (prim === null || prim === undefined ? '—' : 'L' + prim) + '</span>' +
          (gap === null ? '' : '<span>разница: ' + gap + '</span>') + '</div>' +
          (stale ? '<p class="fac-card-warn">Снимок контроля устарел (считался до оценки базы) — нажмите «Пересчитать контроль», чтобы обновить флаг.</p>' : '') +
          (c.arbiterNote ? '<p class="fac-detail-text">Арбитр: ' + escapeHtml(c.arbiterNote) + '</p>' : '') +
          overrideControlsHtml(k, c.control, overrides[k]) +
          '</div>';
      });
      body += '</div>';
      if (control.judgment && control.judgment.reasoning) {
        body += '<details class="fac-judge-reasoning"><summary>Обоснование контрольного судьи</summary>' +
          '<p class="fac-card-warn">' + escapeHtml(control.judgment.reasoning) + '</p></details>';
      }
    } else {
      body += '<p class="fac-detail-text">Контроль ещё не считался — нажмите «пересчитать контроль».</p>';
    }
    return taskSectionHtml('Финальная защита и контроль', null, null, badges, body, anyFlag ? 'Есть расхождение основной и контрольной оценки' : null);
  }

  function closeDetail() {
    if (!detail.classList.contains('show')) return;
    detail.classList.remove('show');
    detail.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', onDetailKeydown);
    currentDetailParticipant = null;
    if (detailLastFocus && detailLastFocus.focus) {
      try { detailLastFocus.focus(); } catch (e) {}
    }
    detailLastFocus = null;
  }

  function onDetailKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeDetail(); }
    else if (e.key === 'Tab') { trapTab(e, detail.querySelector('.fac-detail-panel')); }
  }

  // Удержание фокуса внутри открытой карточки (WCAG 2.4.3).
  function trapTab(e, container) {
    if (!container) return;
    var nodes = container.querySelectorAll('a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
    var list = Array.prototype.filter.call(nodes, function (el) { return el.offsetParent !== null; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  detailClose.addEventListener('click', closeDetail);
  detail.addEventListener('click', function (e) { if (e.target === detail) closeDetail(); });

  // silent auto-login if a password from earlier this tab session still works
  var cached = currentPassword();
  if (cached) attemptLogin(cached);
})();

// i(m)perfect — регистрация на раунд 1 (кейс «Искра»).
// localStorage остаётся источником мгновенного отклика и офлайн-устойчивости
// (см. js/api.js): каждое действие сразу пишется локально, а бэкенд на
// Google Apps Script синхронизируется в фоне, если API_URL настроен —
// см. backend/README.md. Без бэкенда всё работает ровно как раньше.

(function () {
  var form = document.getElementById('regForm');
  var formError = document.getElementById('formError');
  var deviceWarning = document.getElementById('deviceWarning');
  var confirmPanel = document.getElementById('confirmPanel');
  var confirmBib = document.getElementById('confirmBib');
  var confirmHeading = document.getElementById('confirmHeading');
  var confirmText = document.getElementById('confirmText');
  var beginBtn = document.getElementById('beginBtn');

  var showRecoverWrap = document.getElementById('showRecoverWrap');
  var recoverForm = document.getElementById('recoverForm');
  var recoverError = document.getElementById('recoverError');
  var regSyncError = document.getElementById('regSyncError');

  // Пока бэкенд настроен, но ещё не подтвердил регистрацию, участника нельзя
  // пускать дальше — иначе прогресс станций запишется под номером, которого
  // нет в Registrations, и фасилитатор никогда его не увидит (реальный баг,
  // который это чинит: registerOnBackend() ошибался молча, кнопка «Начать»
  // включалась в любом случае, и участник уходил на station1.html как ни в
  // чём не бывало). Если бэкенд не настроен вовсе — оффлайн-режим легален,
  // backendConfirmed остаётся неважным (см. проверку isApiConfigured() ниже).
  var backendConfirmed = false;
  var awaitingRetry = false;
  var currentRecord = null;

  function updateDeviceWarning() {
    deviceWarning.classList.toggle('show', window.imp.isHandheld());
  }
  updateDeviceWarning();
  window.addEventListener('resize', updateDeviceWarning);

  // Список волн живёт на бэкенде (лист Waves) — фасилитатор управляет им из
  // кабинета. Раньше в HTML стояли захардкоженные даты как фолбэк, и пока/если
  // бэкенд не отвечал, они молча показывались как настоящие — это сбивало.
  // Теперь селект по умолчанию заблокирован с плашкой «Загружаю…»; реальные
  // даты появляются только из ответа сервера, а на сбой показывается честная
  // ошибка, а не устаревшие слоты. Фолбэк-даты — только для офлайна/без бэкенда.
  var FALLBACK_WAVES = [
    { id: 'w1', label: '15 июля, 11:00' },
    { id: 'w2', label: '18 июля, 15:00' },
    { id: 'w3', label: '22 июля, 11:00' }
  ];

  function setWavePlaceholder(textStr) {
    var select = form.wave;
    select.innerHTML = '';
    var opt = document.createElement('option');
    opt.value = ''; opt.disabled = true; opt.selected = true;
    opt.textContent = textStr;
    select.appendChild(opt);
    select.disabled = true;
  }

  function fillWaves(waves) {
    var select = form.wave;
    select.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = ''; ph.disabled = true; ph.selected = true;
    ph.textContent = 'Выберите дату и время';
    select.appendChild(ph);
    waves.forEach(function (w) {
      var opt = document.createElement('option');
      opt.value = w.id; opt.textContent = w.label;
      select.appendChild(opt);
    });
    select.disabled = false;
  }

  function loadWaves() {
    if (!window.imp.isApiConfigured()) {
      // офлайн/без бэкенда — локальный фолбэк, чтобы форма работала
      fillWaves(FALLBACK_WAVES);
      return;
    }
    setWavePlaceholder('Загружаю доступные даты…');
    window.imp.callApi('listWaves', {}).then(function (res) {
      if (res && res.ok && res.waves && res.waves.length) {
        fillWaves(res.waves);
      } else {
        // не показываем устаревшие даты как настоящие — честная ошибка
        setWavePlaceholder('Не удалось загрузить даты — обновите страницу');
      }
    });
  }
  loadWaves();

  function isValid(data) {
    return Boolean(data.firstName && data.lastName && data.email && data.wave && data.consent);
  }

  // Локальная догадка о номере — как стартовый номер на марафоне, 3 цифры.
  // Показывается мгновенно; если бэкенд настроен, сервер следом присваивает
  // авторитетный номер (без риска коллизии между разными устройствами —
  // локальная генерация такой гарантии дать не может).
  function nextLocalBib() {
    var all = JSON.parse(localStorage.getItem('imp_registrations') || '[]');
    var used = all.map(function (r) { return r.bib; });
    var n;
    do {
      n = Math.floor(Math.random() * 899) + 100;
    } while (used.indexOf(n) !== -1);
    return n;
  }

  function persistRegistration(record) {
    var all = JSON.parse(localStorage.getItem('imp_registrations') || '[]');
    var replaced = false;
    all = all.map(function (r) {
      if (r.id === record.id) { replaced = true; return record; }
      return r;
    });
    if (!replaced) all.push(record);
    localStorage.setItem('imp_registrations', JSON.stringify(all));
    localStorage.setItem('imp_current_session', JSON.stringify(record));
  }

  function buildLocalRecord(data) {
    return Object.assign({}, data, {
      id: 'imp_' + Date.now().toString(36),
      case: 'iskra',
      bib: nextLocalBib(),
      round1StartedAt: null,
      round2AssignedRole: null,
      registeredAt: new Date().toISOString()
    });
  }

  function formatBib(n) {
    return '№ ' + String(n).padStart(3, '0');
  }

  var beginBtnDefaultText = null;

  function setBeginPending(pending) {
    if (beginBtnDefaultText === null) beginBtnDefaultText = beginBtn.textContent;
    beginBtn.textContent = pending ? 'Получаем номер участника…' : beginBtnDefaultText;
    beginBtn.style.pointerEvents = pending ? 'none' : '';
    beginBtn.style.opacity = pending ? '0.5' : '';
  }

  function registerOnBackend(record) {
    return window.imp.callApi('register', {
      firstName: record.firstName,
      lastName: record.lastName,
      email: record.email,
      company: record.company,
      role: record.role,
      wave: record.wave,
      cohort: record.cohort,
      showName: record.showName,
      consent: record.consent
    }).then(function (res) {
      if (!res || !res.ok || !res.record) return null;
      var authoritative = Object.assign({}, record, {
        bib: res.record.bib,
        registeredAt: res.record.registeredAt
      });
      persistRegistration(authoritative);
      return authoritative;
    });
  }

  // Один автоматический повтор — частая причина первого сбоя это холодный
  // старт Apps Script, а не настоящая недоступность бэкенда.
  function registerOnBackendWithRetry(record) {
    return registerOnBackend(record).then(function (authoritative) {
      if (authoritative) return authoritative;
      return registerOnBackend(record);
    });
  }

  function showSyncError(record) {
    confirmBib.textContent = formatBib(record.bib);
    regSyncError.classList.add('show');
    beginBtn.textContent = 'Повторить попытку →';
    awaitingRetry = true;
    beginBtn.style.pointerEvents = '';
    beginBtn.style.opacity = '';
  }

  function trySync(record) {
    currentRecord = record;
    confirmBib.textContent = '№ …';
    regSyncError.classList.remove('show');
    setBeginPending(true);
    registerOnBackendWithRetry(record).then(function (authoritative) {
      if (authoritative) {
        confirmBib.textContent = formatBib(authoritative.bib);
        backendConfirmed = true;
        setBeginPending(false);
      } else {
        showSyncError(record);
      }
    });
  }

  function showConfirm(record, isRecovery) {
    form.style.display = 'none';
    recoverForm.style.display = 'none';
    showRecoverWrap.style.display = 'none';
    confirmBib.textContent = formatBib(record.bib);
    confirmBib.dataset.recordId = record.id || '';
    if (isRecovery) {
      confirmHeading.textContent = 'С возвращением. Вы на дистанции.';
      confirmText.textContent = 'Сессия восстановлена по номеру и фамилии. Прогресс на месте.';
    } else {
      confirmHeading.textContent = 'Готово. Вы на дистанции.';
      confirmText.textContent = 'Это ваш стартовый номер, если не включили показ имени. Дальше — раунд 1: кейс, встреча с клиентом и три разговора в холле.';
    }
    confirmPanel.classList.add('show');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var data = {
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      email: form.email.value.trim(),
      company: form.company.value.trim(),
      role: form.role.value.trim(),
      wave: form.wave.value,
      cohort: form.cohort.value.trim(),
      showName: form.showName.checked,
      consent: form.consent.checked
    };

    if (!isValid(data)) {
      formError.classList.add('show');
      return;
    }
    formError.classList.remove('show');

    var record = buildLocalRecord(data);
    persistRegistration(record);
    showConfirm(record, false);
    backendConfirmed = !window.imp.isApiConfigured(); // без бэкенда легален чистый оффлайн-номер

    if (window.imp.isApiConfigured()) {
      // номер на экране — предварительный; переход на станцию заблокирован
      // (см. обработчик клика на beginBtn ниже), пока сервер не подтвердит
      // регистрацию по-настоящему
      trySync(record);
    }
  });

  // Пока backendConfirmed не true (и бэкенд настроен), клик либо запускает
  // повторную попытку синхронизации, либо просто ничего не делает —
  // не даёт уйти на станцию с незарегистрированным на сервере номером.
  beginBtn.addEventListener('click', function (e) {
    if (!window.imp.isApiConfigured() || backendConfirmed) return;
    e.preventDefault();
    if (awaitingRetry && currentRecord) {
      awaitingRetry = false;
      trySync(currentRecord);
    }
  });

  // Восстановление: сначала бэкенд (работает с любого устройства, если настроен),
  // при неудаче — локальный поиск среди регистраций этого браузера.

  document.getElementById('showRecoverLink').addEventListener('click', function (e) {
    e.preventDefault();
    form.style.display = 'none';
    showRecoverWrap.style.display = 'none';
    recoverForm.style.display = '';
  });

  document.getElementById('backToRegisterLink').addEventListener('click', function (e) {
    e.preventDefault();
    recoverForm.style.display = 'none';
    recoverError.classList.remove('show');
    form.style.display = '';
    showRecoverWrap.style.display = '';
  });

  // Кнопка «Войти →» на главной ведёт сюда с ?recover=1 — сразу открываем
  // форму восстановления, а не прячем её за мелкой ссылкой под регистрацией.
  if (new URLSearchParams(window.location.search).get('recover')) {
    form.style.display = 'none';
    showRecoverWrap.style.display = 'none';
    recoverForm.style.display = '';
  }

  function recoverLocal(bib, lastNameLower) {
    var all = JSON.parse(localStorage.getItem('imp_registrations') || '[]');
    var record = all.filter(function (r) {
      return r.bib === bib && r.lastName.trim().toLowerCase() === lastNameLower;
    })[0];
    if (!record) {
      recoverError.classList.add('show');
      return;
    }
    localStorage.setItem('imp_current_session', JSON.stringify(record));
    backendConfirmed = true; // уже была настоящая регистрация — просто нашли её локально
    showConfirm(record, true);
  }

  recoverForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var enteredBib = parseInt(document.getElementById('recoverBib').value.trim(), 10);
    var enteredLastName = document.getElementById('recoverLastName').value.trim();

    if (!enteredLastName || isNaN(enteredBib)) {
      recoverError.classList.add('show');
      return;
    }
    recoverError.classList.remove('show');

    if (window.imp.isApiConfigured()) {
      window.imp.callApi('recover', { bib: enteredBib, lastName: enteredLastName }).then(function (res) {
        if (res && res.ok && res.record) {
          localStorage.setItem('imp_current_session', JSON.stringify(res.record));
          backendConfirmed = true; // подтверждено самим бэкендом
          showConfirm(res.record, true);
        } else {
          recoverLocal(enteredBib, enteredLastName.toLowerCase());
        }
      });
    } else {
      recoverLocal(enteredBib, enteredLastName.toLowerCase());
    }
  });

  beginBtn.setAttribute('href', 'station1.html');
})();

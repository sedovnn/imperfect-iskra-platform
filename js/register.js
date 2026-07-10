// i(m)perfect — регистрация на «Hyrox для мозгов» (кейс «Искра»).
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

  function updateDeviceWarning() {
    deviceWarning.classList.toggle('show', window.imp.isHandheld());
  }
  updateDeviceWarning();
  window.addEventListener('resize', updateDeviceWarning);

  // Список волн переехал в бэкенд (лист Waves) — фасилитатор управляет им
  // из кабинета. Если бэкенд недоступен/не настроен, остаются 3 опции,
  // зашитые прямо в register.html — страница не должна ломаться без сети.
  function loadWaves() {
    if (!window.imp.isApiConfigured()) return;
    window.imp.callApi('listWaves', {}).then(function (res) {
      if (!res || !res.ok || !res.waves || !res.waves.length) return;
      var select = form.wave;
      Array.prototype.slice.call(select.options).forEach(function (opt) {
        if (opt.value) select.removeChild(opt);
      });
      res.waves.forEach(function (w) {
        var opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = w.label + ' — раунд 1 + раунд 2';
        select.appendChild(opt);
      });
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

  function syncRegistrationToBackend(record) {
    if (!window.imp.isApiConfigured()) return;
    window.imp.callApi('register', {
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
      if (!res || !res.ok || !res.record) return;
      var authoritative = Object.assign({}, record, {
        bib: res.record.bib,
        registeredAt: res.record.registeredAt
      });
      persistRegistration(authoritative);
      if (confirmBib.dataset.recordId === record.id) {
        confirmBib.textContent = formatBib(authoritative.bib);
      }
    });
  }

  function submitRegistration(data) {
    var record = Object.assign({}, data, {
      id: 'imp_' + Date.now().toString(36),
      case: 'iskra',
      bib: nextLocalBib(),
      round1StartedAt: null,
      round2AssignedRole: null,
      registeredAt: new Date().toISOString()
    });
    persistRegistration(record);
    syncRegistrationToBackend(record);
    return record;
  }

  function formatBib(n) {
    return '№ ' + String(n).padStart(3, '0');
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
      confirmText.textContent = 'Это ваш стартовый номер — под ним вы идёте по табло, если не включили показ имени. На почту придёт ссылка на раунд 1 и время сбора команды для раунда 2.';
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

    var record = submitRegistration(data);
    showConfirm(record, false);
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

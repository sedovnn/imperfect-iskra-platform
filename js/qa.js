// i(m)perfect — служебная развилка (за незаметной иконкой на лендинге).
// Второй вариант («быстрый тестовый прогон») — упрощённая регистрация:
// только имя/фамилия, поток «test» подставляется автоматически, остальные
// поля (email/компания/согласие) заполняются синтетически — это внутренний
// QA-инструмент, а не публичная форма участника.

(function () {
  // Возврат в служебный вход = выход из любого прошлого демо: снимаем флаг
  // экскурсии, чтобы demo.js не перехватил обычный «быстрый прогон» или вход
  // по фамилии (иначе он пере-сеял бы демо-профиль поверх реальной сессии).
  // Кнопка экскурсии ниже выставляет флаг заново непосредственно перед запуском.
  sessionStorage.removeItem('imp_demo'); localStorage.removeItem('imp_demo');

  var optionsEl = document.getElementById('qaOptions');
  var formEl = document.getElementById('quickTestForm');
  var waveHint = document.getElementById('quickTestWaveHint');
  var errorEl = document.getElementById('quickTestError');
  var submitBtn = document.getElementById('quickTestSubmit');

  var FALLBACK_WAVE = { id: 'w-test-quick', label: 'test' };
  var testWave = FALLBACK_WAVE;

  function setWaveHint() {
    waveHint.textContent = 'Поток: ' + testWave.label;
  }
  setWaveHint();

  if (window.imp.isApiConfigured()) {
    window.imp.callApi('listWaves', {}).then(function (res) {
      if (!res || !res.ok || !res.waves || !res.waves.length) return;
      var match = res.waves.filter(function (w) { return String(w.label).trim().toLowerCase() === 'test'; })[0];
      testWave = match || res.waves[0];
      setWaveHint();
    });
  }

  document.getElementById('btnQuickTest').addEventListener('click', function () {
    optionsEl.style.display = 'none';
    formEl.style.display = '';
    document.getElementById('qtFirstName').focus();
  });

  // ---------- экскурсия (демо-прохождение) ----------
  // Гейт паролем — как у кабинета: пароль не хранится во фронте, проверяется на
  // бэкенде (action 'verifyPassword'). Сначала экран пароля, потом выбор профиля.
  var demoPicker = document.getElementById('demoPicker');
  var demoPassForm = document.getElementById('demoPassForm');
  var demoPassInput = document.getElementById('demoPass');
  var demoPassError = document.getElementById('demoPassError');
  var demoPassSubmit = document.getElementById('demoPassSubmit');

  document.getElementById('btnDemoTour').addEventListener('click', function () {
    optionsEl.style.display = 'none';
    demoPassError.classList.remove('show');
    demoPassInput.value = '';
    demoPassForm.style.display = '';
    demoPassInput.focus();
  });
  document.getElementById('demoPassBack').addEventListener('click', function (e) {
    e.preventDefault();
    demoPassForm.style.display = 'none';
    demoPassError.classList.remove('show');
    optionsEl.style.display = '';
  });
  function openDemoPicker() {
    demoPassForm.style.display = 'none';
    demoPicker.style.display = '';
  }
  demoPassForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = demoPassInput.value.trim();
    if (!pw) { demoPassError.classList.add('show'); return; }
    demoPassError.classList.remove('show');
    // локально без бэкенда проверять негде — пропускаем (демо всё равно клиентское)
    if (!window.imp.isApiConfigured()) { openDemoPicker(); return; }
    demoPassSubmit.disabled = true;
    demoPassSubmit.textContent = 'Проверяю…';
    window.imp.callApi('verifyPassword', { password: pw }).then(function (res) {
      demoPassSubmit.disabled = false;
      demoPassSubmit.textContent = 'Далее →';
      if (res && res.ok) { openDemoPicker(); }
      else { demoPassError.classList.add('show'); demoPassInput.focus(); }
    });
  });
  document.getElementById('demoBack').addEventListener('click', function (e) {
    e.preventDefault();
    demoPicker.style.display = 'none';
    optionsEl.style.display = '';
  });
  document.querySelectorAll('.demo-profile-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      // флаг экскурсии — в sessionStorage: изолирован по вкладке, не протекает в
      // другие вкладки/реальные сессии (см. demo.js / main.js loadSession)
      sessionStorage.setItem('imp_demo', JSON.stringify({ active: true, profile: btn.getAttribute('data-profile'), seededFor: null }));
      window.location.href = 'station1.html';
    });
  });

  document.getElementById('quickTestBack').addEventListener('click', function (e) {
    e.preventDefault();
    formEl.style.display = 'none';
    errorEl.classList.remove('show');
    optionsEl.style.display = '';
  });

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-zа-я0-9]+/gi, '').slice(0, 20) || 'x';
  }

  function nextLocalBib() {
    var all = JSON.parse(localStorage.getItem('imp_registrations') || '[]');
    var used = all.map(function (r) { return r.bib; });
    var n;
    do { n = Math.floor(Math.random() * 899) + 100; } while (used.indexOf(n) !== -1);
    return n;
  }

  function persistRegistration(record) {
    var all = JSON.parse(localStorage.getItem('imp_registrations') || '[]');
    all.push(record);
    localStorage.setItem('imp_registrations', JSON.stringify(all));
    localStorage.setItem('imp_current_session', JSON.stringify(record));
  }

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    // на случай bfcache/возврата «назад»: скрипт загрузки мог не отработать —
    // снимаем флаг экскурсии прямо при запуске быстрого теста, иначе demo.js
    // перехватил бы реальную сессию
    sessionStorage.removeItem('imp_demo'); localStorage.removeItem('imp_demo');
    var firstName = document.getElementById('qtFirstName').value.trim();
    var lastName = document.getElementById('qtLastName').value.trim();
    if (!firstName || !lastName) {
      errorEl.classList.add('show');
      return;
    }
    errorEl.classList.remove('show');

    var data = {
      firstName: firstName,
      lastName: lastName,
      email: 'test.' + slug(firstName) + '.' + slug(lastName) + '.' + Date.now() + '@example.com',
      company: '', role: '', cohort: '',
      wave: testWave.id,
      showName: false,
      consent: true
    };

    var localRecord = Object.assign({}, data, {
      id: 'imp_' + Date.now().toString(36),
      case: 'iskra',
      bib: nextLocalBib(),
      registeredAt: new Date().toISOString()
    });

    if (!window.imp.isApiConfigured()) {
      persistRegistration(localRecord);
      window.location.href = 'station1.html';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Регистрирую…';
    window.imp.callApi('register', data).then(function (res) {
      var record = (res && res.ok && res.record) ? Object.assign({}, data, res.record) : localRecord;
      persistRegistration(record);
      window.location.href = 'station1.html';
    });
  });
})();

// i(m)perfect — служебная развилка (за незаметной иконкой на лендинге).
// Второй вариант («быстрый тестовый прогон») — упрощённая регистрация:
// только имя/фамилия, поток «test» подставляется автоматически, остальные
// поля (email/компания/согласие) заполняются синтетически — это внутренний
// QA-инструмент, а не публичная форма участника.

(function () {
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

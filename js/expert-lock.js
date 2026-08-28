// i(m)perfect — ЗАМОК ЭКСПЕРТНОГО ЭКРАНА.
//
// Пароль здесь не пропуск, а КЛЮЧ. Разница принципиальная и стоит того, чтобы
// её назвать: сверять введённое со строкой в коде бессмысленно — исходник
// страницы открывается в два клика, а файл корпуса скачивается по прямому
// адресу мимо всякой проверки. Поэтому корпус лежит зашифрованным
// (tools/build-expert-corpus.js), пароля в коде нет вообще, и без него
// пятьдесят описаний уровней — просто шум.
//
// Зачем вообще запирать: это рубрика, по которой ставится уровень. Участник
// ассессмента, прочитавший её до кейса, ломает замер — а ссылка на экран
// эксперта живёт рядом с ссылкой на ассессмент.
//
// Побочный, но важный эффект: зашифрованный корпус можно класть в публичный
// репозиторий и публиковать обычным способом, без ручного копирования файлов
// мимо git.

(function () {
  window.imp = window.imp || {};

  var PASS_KEY = 'imp_expert_pass';   // чтобы не спрашивать на каждой перезагрузке

  function b64(s) {
    var raw = atob(s), a = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
    return a;
  }

  // Расшифровка. Неверный пароль даёт ошибку проверки целостности GCM, а не
  // мусор: страница не может случайно показать эксперту испорченный текст.
  function unseal(sealed, password) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: b64(sealed.salt), iterations: sealed.iter, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      })
      .then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(sealed.iv) }, key, b64(sealed.ct));
      })
      .then(function (buf) {
        var corpus = JSON.parse(new TextDecoder().decode(buf));
        if (!corpus.cards || corpus.cards.length !== 50) throw new Error('в корпусе не 50 карточек');
        return corpus;
      });
  }

  // ⚠ crypto.subtle живёт только в защищённом контексте. Это https, localhost
  // и — проверено — file:// в Chrome. Обычный http на домене защищённым НЕ
  // считается, и там страница молча не открылась бы: поэтому случай назван
  // вслух, с готовым ответом что делать.
  function unsupported() {
    return !(window.crypto && window.crypto.subtle && window.isSecureContext);
  }

  // opts: { title, lead, hint, onOpen(corpus, password) }
  window.imp.expertLock = function (host, opts) {
    var sealed = window.IMP_EXPERT_SEALED;

    function fail(html) { host.innerHTML = '<div class="xnarrow">' + html + '</div>'; }

    if (!sealed) {
      fail('<h2>Корпус не загружен</h2><p class="section-lead">Нет <code>js/expert-corpus.js</code>. ' +
        'Собрать: <code>node tools/build-expert-corpus.js &lt;методология.md&gt; &lt;пароль&gt;</code>.</p>');
      return;
    }
    if (unsupported()) {
      fail('<h2>Страница открыта небезопасно</h2><p class="section-lead">Расшифровка работает по ' +
        'адресу на <b>https</b>, на <b>localhost</b> или у файла, открытого с диска. По обычному ' +
        '<b>http</b> браузер её запрещает. Откройте ту же ссылку через https.</p>');
      return;
    }

    function draw(err) {
      host.innerHTML = '<div class="xnarrow xgate">' +
        '<p class="kicker">Валидация методологии</p>' +
        '<h1>' + (opts.title || 'Разбор описаний уровней') + '</h1>' +
        '<p class="section-lead">' + (opts.lead || '') + '</p>' +
        '<div class="field"><label for="xPass">Пароль</label>' +
        '<input type="password" id="xPass" autocomplete="current-password" /></div>' +
        (err ? '<p class="field-err" id="xPassErr">' + err + '</p>' : '') +
        '<button class="btn btn-primary" id="xPassGo">Войти →</button>' +
        (opts.hint ? '<p class="xnote">' + opts.hint + '</p>' : '') +
        '</div>';

      var input = document.getElementById('xPass');
      var btn = document.getElementById('xPassGo');

      function go() {
        var pw = (input.value || '').trim();
        if (!pw) return;
        btn.disabled = true;
        btn.textContent = 'Открываю…';
        unseal(sealed, pw).then(function (corpus) {
          try { localStorage.setItem(PASS_KEY, pw); } catch (e) {}
          opts.onOpen(corpus, pw);
        }).catch(function () {
          try { localStorage.removeItem(PASS_KEY); } catch (e) {}
          draw('Пароль не подошёл.');
          document.getElementById('xPass').focus();
        });
      }
      btn.onclick = go;
      input.onkeydown = function (e) { if (e.key === 'Enter') go(); };
      input.focus();
    }

    // Уже входили в этом браузере — не спрашиваем снова. Эксперт возвращается
    // к работе несколько раз за неделю, и требовать пароль каждый раз значит
    // требовать его найти: письмо к тому моменту уже потерялось.
    var saved = '';
    try { saved = localStorage.getItem(PASS_KEY) || ''; } catch (e) {}
    if (saved) {
      unseal(sealed, saved).then(function (corpus) { opts.onOpen(corpus, saved); })
        .catch(function () {
          // Пароль сменили и корпус пересобрали — старый больше не открывает.
          try { localStorage.removeItem(PASS_KEY); } catch (e) {}
          draw('');
        });
      return;
    }
    draw('');
  };
})();

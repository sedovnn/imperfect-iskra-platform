// i(m)perfect — общие мелочи фронта, без зависимостей.

(function () {
  // плавный скролл для якорей на лендинге
  // Голое «#» — не якорь, а кнопка-ссылка («выйти» и «Потоки» в кабинетах): querySelector('#') бросал ошибку
  // на каждом нажатии (поймано 19.10 при выходе из кабинета администратора). Такие ссылки пропускаем.
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = link.getAttribute('href');
      if (!href || href.length < 2) return;
      var target = null;
      try { target = document.querySelector(href); } catch (x) {}
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  window.imp = window.imp || {};

  // ---- Телеметрия ввода: маркер ИИ-помощи. Копим ТОЛЬКО агрегаты (как вводили:
  // вставки, темп набора, правки), НЕ содержание нажатий. Делегированные слушатели
  // на document — устойчивы к динамически добавляемым полям (карточки, шаги комнат).
  // snapshot() отдаёт суммарную картину по странице; api.js цепляет её к save*.
  (function initTelemetry() {
    var stats = new Map();
    var IDLE = 5000; // паузы длиннее — не «активный набор», в activeMs не идут
    // ТОЛЬКО ПОЛЯ ОТВЕТА, и это не оптимизация. Раньше считался любой textarea на
    // странице, а totals складывались по всем полям сразу: участник, копирующий
    // цифры из кейса в свою пометку, раздувал pastedChars и получал флаг ИИ за
    // совершенно легитимное действие. Из-за этого пришлось убрать поле заметок —
    // лечили следствие. Теперь причина: поле ответа помечено data-answer="1",
    // всё остальное (пометки, поиск, служебные поля кабинета) в замер не идёт.
    function isTracked(el) {
      return !!(el && el.dataset && el.dataset.answer === '1');
    }
    function statFor(el) {
      var s = stats.get(el);
      if (!s) {
        var step = '';
        try { step = window.imp.currentStepId ? String(window.imp.currentStepId() || '') : ''; } catch (_) {}
        s = { pasted: 0, maxPaste: 0, keys: 0, back: 0, activeMs: 0, lastKey: 0, tabBlur: 0, step: step }; stats.set(el, s);
      }
      return s;
    }
    document.addEventListener('paste', function (e) {
      if (!isTracked(e.target)) return;
      var s = statFor(e.target), txt = '';
      try { txt = (e.clipboardData || window.clipboardData).getData('text') || ''; } catch (_) {}
      s.pasted += txt.length; if (txt.length > s.maxPaste) s.maxPaste = txt.length;
    }, true);
    document.addEventListener('keydown', function (e) {
      if (!isTracked(e.target)) return;
      var s = statFor(e.target), now = Date.now();
      if (s.lastKey) { var d = now - s.lastKey; if (d > 0 && d < IDLE) s.activeMs += d; }
      s.lastKey = now; s.keys++;
      if (e.key === 'Backspace' || e.key === 'Delete') s.back++;
    }, true);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && isTracked(document.activeElement)) statFor(document.activeElement).tabBlur++;
    }, true);

    // Итог и по шагам (steps, владелец 28.10: телеметрия для лаборатории): маркер ИИ читает только totals.
    function blank() { return { pastedChars: 0, finalChars: 0, keystrokes: 0, backspaces: 0, activeMs: 0, maxPasteChars: 0, tabBlur: 0, fieldCount: 0 }; }
    window.imp.telemetry = {
      snapshot: function () {
        var t = blank(), steps = {};
        stats.forEach(function (s, el) {
          var len = 0;
          try { len = (el.isContentEditable ? (el.textContent || '') : (el.value || '')).length; } catch (_) {}
          if (len === 0 && s.keys === 0 && s.pasted === 0) return;
          [t, s.step ? (steps[s.step] = steps[s.step] || blank()) : null].forEach(function (x) {
            if (!x) return;
            x.finalChars += len; x.pastedChars += s.pasted; x.keystrokes += s.keys;
            x.backspaces += s.back; x.activeMs += s.activeMs; x.tabBlur += s.tabBlur;
            if (s.maxPaste > x.maxPasteChars) x.maxPasteChars = s.maxPaste;
            x.fieldCount++;
          });
        });
        var c = withCarry(t, steps);
        return { v: 2, totals: c.t, steps: c.steps };
      }
    };

    // ⚠ ЗАМЕР НЕ ОБНУЛЯЕТСЯ ПРИ ПЕРЕЗАГРУЗКЕ (владелец 27.10). Счётчики живут в памяти страницы, а сервер при каждом сохранении
    // заменяет прежний замер новым (applyTelemetry) — вставки до перезагрузки пропадали, и маркер ИИ их не видел. Теперь каждая
    // загрузка страницы оставляет свой итог в браузере по номеру участника; следующая загрузка прибавляет его к своему.
    // Знаки уже сданных полей прошлой загрузки входят в итог как есть; поле, правленное в двух загрузках, посчитается дважды —
    // это огрубление в сторону меньшей доли вставки, то есть против ложного флага.
    var pageToken = String(Date.now()) + Math.random();
    var SUM = ['pastedChars', 'finalChars', 'keystrokes', 'backspaces', 'activeMs', 'tabBlur', 'fieldCount'];
    function withCarry(t, steps) {
      var bib = '';
      try { var ss = window.imp.loadSession && window.imp.loadSession(); bib = ss && ss.bib ? String(ss.bib) : ''; } catch (_) {}
      if (!bib) return { t: t, steps: steps };
      var key = 'imp_tel_' + bib, o = null;
      try { o = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { o = null; }
      o = o || { carry: null, page: null };
      if (o.page && o.page.token !== pageToken) {   // прошлая загрузка — в перенос
        o.carry = add(o.carry, o.page.t);
        o.carrySteps = addSteps(o.carrySteps, o.page.steps);
      }
      o.page = { token: pageToken, t: t, steps: steps };
      try { localStorage.setItem(key, JSON.stringify(o)); } catch (_) {}
      return { t: add(o.carry, t), steps: addSteps(o.carrySteps, steps) };
    }
    function addSteps(a, b) {
      var r = {};
      [a, b].forEach(function (m) { if (m) Object.keys(m).forEach(function (k) { r[k] = r[k] ? add(r[k], m[k]) : m[k]; }); });
      return r;
    }
    function add(a, b) {
      if (!a) return b; if (!b) return a;
      var r = {};
      SUM.forEach(function (k) { r[k] = (Number(a[k]) || 0) + (Number(b[k]) || 0); });
      r.maxPasteChars = Math.max(Number(a.maxPasteChars) || 0, Number(b.maxPasteChars) || 0);
      return r;
    }
  })();

  // ── ТЕЛЕФОН: вход запрещён, всегда ───────────────────────────────────────────
  // Решение владельца 2026-08-03: не «рекомендуем компьютер», а запрет. Причина
  // про замер, а не про удобство: шесть открытых вопросов с телефона меряют
  // терпение и большие пальцы, а участник с телефона несопоставим с участником с
  // ноутбука — при том что на сравнении и стоит весь продукт.
  //
  // Планшет РАЗРЕШЁН, поэтому одной ширины окна недостаточно: iPad в портрете —
  // 744–834 логических пикселя, iPhone Pro Max — 430. Отсюда две проверки:
  //   1) короткая сторона ЭКРАНА УСТРОЙСТВА (не окна) меньше 700 — это телефон;
  //   2) навигатор сам сообщает mobile:true (Chromium; в Safari поля нет).
  // Узкое окно на компьютере телефоном НЕ считается: там остаётся предупреждение,
  // а не запрет — человек может просто растянуть окно.
  window.imp.isPhone = function () {
    try {
      if (navigator.userAgentData && navigator.userAgentData.mobile === true) return true;
      var w = (window.screen && window.screen.width) || window.innerWidth;
      var h = (window.screen && window.screen.height) || window.innerHeight;
      var shortSide = Math.min(w, h);
      var coarse = window.matchMedia('(pointer: coarse)').matches;
      return shortSide < 700 && coarse;
    } catch (e) { return false; }
  };

  // Требование к прохождению — текст экрана «Не с телефона». С 29.09 он виден только
  // там: с экрана входа плашку убрали (index.html). Один текст на все страницы, где
  // стоит запрет (вход, настройка, роль, ассессмент), — две копии разъехались бы.
  // ⚠ ВРЕМЕНИ ЗДЕСЬ НЕТ (решение владельца 03.10). Было «…и 1,5–2 часа свободного
  // времени», но с таймером время задаёт ведущий потоку, а на этом экране поток ещё
  // не известен. Оставлено только устройство; планшет пускают (см. imp.isPhone).
  window.imp.deviceReq = {
    head: 'Нужен компьютер',
    lead: 'Для прохождения нужен ноутбук, компьютер или планшет.',
    tail: 'С телефона ассессмент пройти нельзя.'
  };

  // Показать запрет вместо содержимого. Возвращает true, если запрет показан.
  window.imp.blockIfPhone = function (hostId) {
    if (!window.imp.isPhone()) return false;
    var host = document.getElementById(hostId);
    if (!host) return true;
    var R = window.imp.deviceReq;
    host.innerHTML =
      '<div class="phone-block">' +
        '<p class="kicker">Не с телефона</p>' +
        '<h1>' + R.head + '</h1>' +
        '<p class="phone-lead">' + R.lead + '</p>' +
        '<p class="phone-tail">' + R.tail + '</p>' +
      '</div>';
    return true;
  };

  // Сессию читаем sessionStorage → localStorage. sessionStorage изолирован по
  // ВКЛАДКЕ: режим «Экскурсия» держит свою демо-сессию (bib 900) только там, где
  // запущен, и не перезаписывает общую (localStorage) реальную сессию в других
  // вкладках. Реальный участник живёт в localStorage (общий между его вкладками —
  // это ожидаемо). Все экраны читают сессию через этот хелпер.
  window.imp.loadSession = function () {
    try {
      var s = sessionStorage.getItem('imp_current_session');
      if (s) return JSON.parse(s);
    } catch (e) {}
    try {
      var real = JSON.parse(localStorage.getItem('imp_current_session') || 'null');
      // самолечение старой протечки: до фикса экскурсия писала демо-сессию (bib 900)
      // в общий localStorage. Если демо в этой вкладке не активно, а в localStorage
      // лежит демо-биб — это протечка, а не реальная сессия: игнорируем и вычищаем.
      if (real && real.bib === 900 && !sessionStorage.getItem('imp_demo')) {
        localStorage.removeItem('imp_current_session');
        return null;
      }
      return real;
    } catch (e) { return null; }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ДЕМО БЕЗ ИМЕНИ ВОЗВРАЩАЕМ НА РЕГИСТРАЦИЮ (правка 29.09)
  //
  // Демо обязано идти тем же путём, что участник: сначала имя и фамилия, потом
  // настройка. demo.html раздаётся наружу короткой ссылкой без ключа версии, и у
  // того, кто открывал её раньше, браузер держит ПРЕЖНЮЮ копию — она вела прямо на
  // экран настройки, минуя регистрацию.
  //
  // ⚠ ПОЧЕМУ ПРОВЕРКА ЗДЕСЬ, А НЕ В intro.html. Сначала я поставил её именно туда — и
  // она не сработала: intro.html кэшируется ровно так же, браузер отдал старую копию
  // вместе со старой логикой. Починка, живущая в кэшируемом файле, не чинит проблему
  // кэша. В этом файле есть ключ версии в адресе (`main.js?v=N`), его подъём заставляет
  // браузер взять новую копию на ВСЕХ страницах разом — тот самый механизм, ради
  // которого ключи и заведены (см. scripts/checks/lint_cache_keys.js).
  //
  // Живого участника это не трогает: флага демо у него нет вовсе.
  // На самой регистрации не срабатывает — иначе получилась бы петля.
  (function demoNeedsName() {
    try {
      if (!sessionStorage.getItem('imp_demo')) return;
      var here = (location.pathname || '').split('/').pop() || 'index.html';
      // ⚠ СПИСОК РАЗРЕШЁННЫХ, А НЕ ЗАПРЕЩЁННЫХ (правка 29.09, в тот же день, что и сам
      // сторож). Сначала было «возвращать отовсюду, кроме входа и демо» — и под
      // «отовсюду» попали кабинет, витрина, харнесс и стенд эксперта: у владельца в
      // браузере оставался флаг демо от просмотра, он жал «Кабинет фасилитатора», и
      // страница молча возвращалась на вход. Выглядело как «просто обновляется».
      // Сторож касается ТОЛЬКО пути участника, и пути перечислены поимённо: любая
      // новая служебная страница по умолчанию его не касается.
      var DAY = { 'intro.html': 1, 'role.html': 1, 'assessment.html': 1 };
      if (!DAY[here]) return;
      var s = JSON.parse(sessionStorage.getItem('imp_current_session')
        || localStorage.getItem('imp_current_session') || 'null');
      var nm = s ? String(s.name || '').trim() : '';
      // ⚠ «Демо» — ПОДПИСЬ СТАРОГО ПУТИ, А НЕ ИМЯ. До правки 29.09 demo.html сама
      // ставила это служебное имя и вела мимо регистрации. У кого в браузере лежит
      // прежняя копия, состояние выглядит «имя есть» — хотя человек его не называл.
      // Считаем такое состояние непройденной регистрацией. Признак самоистечёт: новый
      // путь этого имени не ставит нигде.
      if (nm && nm !== 'Демо') return;
      // С меткой ?demo=1: без неё главная завершает демо и показывает обычный вход (19.10, index.html).
      location.replace('index.html?demo=1');
    } catch (e) {}
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // ИМЯ ИЗВЕСТНО — ВОПРОС ПРО ИМЯ УБИРАЕМ (правка 29.09)
  //
  // Живёт здесь, а не в role.html, по той же причине, что и проверка выше: страница
  // кэшируется, и та же логика внутри неё не доезжает до того, у кого лежит прежняя
  // копия. У этого файла есть ключ версии — его подъём обновляет копию на всех
  // страницах разом.
  //
  // ⚠ ОДНОГО АТРИБУТА hidden ПОЛЮ МАЛО. Браузерное правило [hidden]{display:none}
  // имеет минимальную специфичность, и правило таблицы стилей его перебивает: 29.09
  // блок с вопросом скрывался, а пустая рамка поля оставалась на экране. Ставим ещё
  // и инлайновый стиль.
  (function hideNameAsk() {
    function run() {
      try {
        var inp = document.getElementById('introName');
        if (!inp) return;
        var s = JSON.parse(sessionStorage.getItem('imp_current_session')
          || localStorage.getItem('imp_current_session') || 'null');
        if (!s || !String(s.name || '').trim()) return;
        var ask = document.getElementById('nameAsk');
        if (ask) { ask.hidden = true; ask.style.display = 'none'; }
        else {
          // Обёртки #nameAsk нет — значит страница прежней сборки, из кэша. Прячем
          // абзацы блока имени поштучно; строку с кнопкой не трогаем, иначе исчезнет
          // сама кнопка «Приступить».
          var box = inp.closest ? inp.closest('.intro-name') : null;
          if (box) {
            Array.prototype.forEach.call(box.children, function (el) {
              if (el.tagName === 'P' && el.id !== 'nameWarn') el.style.display = 'none';
            });
          }
        }
        inp.hidden = true;
        inp.style.display = 'none';
      } catch (e) {}
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else { run(); }
  })();
})();

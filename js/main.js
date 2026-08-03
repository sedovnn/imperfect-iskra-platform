// i(m)perfect — общие мелочи фронта, без зависимостей.

(function () {
  // плавный скролл для якорей на лендинге
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  window.imp = window.imp || {};

  // ---- Разовая миграция ключей localStorage station*/room-* → round*/map (рефактор
  // «раунды внутри ассессмента»). Прогресс на машине участника, начатый ДО переименования,
  // лежит под старыми ключами; копируем его на новые, чтобы ничего не потерять. Копируем
  // (не переносим) — старые ключи остаются как страховка на случай отката. Идемпотентно:
  // новый ключ не перезаписываем, если он уже есть. Флаг не даёт гонять на каждый рендер.
  (function migrateStorageKeys() {
    try {
      if (localStorage.getItem('imp_keymigr_round_v1')) return;
      var MAP = [
        ['imp_station1_', 'imp_round1_'],
        ['imp_station2_', 'imp_round2_'],
        ['imp_room_future_', 'imp_round3_'],
        ['imp_room_path_', 'imp_round4_'],
        ['imp_room_alternatives_', 'imp_round5_'],
        ['imp_station3_', 'imp_map_'] // покрывает и imp_station3_intro_seen_
      ];
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(function (k) {
        if (!k) return;
        for (var j = 0; j < MAP.length; j++) {
          var oldP = MAP[j][0], newP = MAP[j][1];
          if (k.indexOf(oldP) === 0) {
            var nk = newP + k.slice(oldP.length);
            if (localStorage.getItem(nk) === null) {
              try { localStorage.setItem(nk, localStorage.getItem(k)); } catch (e) {}
            }
            break;
          }
        }
      });
      localStorage.setItem('imp_keymigr_round_v1', '1');
    } catch (e) {}
  })();

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
      if (!s) { s = { pasted: 0, maxPaste: 0, keys: 0, back: 0, activeMs: 0, lastKey: 0, tabBlur: 0 }; stats.set(el, s); }
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

    window.imp.telemetry = {
      snapshot: function () {
        var t = { pastedChars: 0, finalChars: 0, keystrokes: 0, backspaces: 0, activeMs: 0, maxPasteChars: 0, tabBlur: 0, fieldCount: 0 };
        stats.forEach(function (s, el) {
          var len = 0;
          try { len = (el.isContentEditable ? (el.textContent || '') : (el.value || '')).length; } catch (_) {}
          if (len === 0 && s.keys === 0 && s.pasted === 0) return;
          t.finalChars += len; t.pastedChars += s.pasted; t.keystrokes += s.keys;
          t.backspaces += s.back; t.activeMs += s.activeMs; t.tabBlur += s.tabBlur;
          if (s.maxPaste > t.maxPasteChars) t.maxPasteChars = s.maxPaste;
          t.fieldCount++;
        });
        return { v: 1, totals: t };
      }
    };
  })();

  // грубая проверка формата устройства — предупреждение, не блокировка
  window.imp.isHandheld = function () {
    var narrow = window.matchMedia('(max-width: 820px)').matches;
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    var touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return narrow && (coarse || touch);
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

  // Позиция по развилке Агеева («Крепость» / «Вторая кривая» / своя) выбирается на
  // станции 2 и служит спиной всего финала: холл ссылается на неё, три разговора
  // раскрывают её грани, финал собирает из неё документ стратегии. Подпись держим
  // в одном месте, чтобы формулировка не разъехалась между экранами.
  // Аргумент — стейт станции 2 (объект). Возвращает {code, label} или null.
  // Отдаёт ТРИ вещи, потому что позицию показывают в очень разных местах:
  //   label — короткая подпись для инлайна (реплики персонажей, чип полосы, плашка);
  //   full  — то, что участник написал целиком: только туда, где есть место
  //           (многострочные карточки документа стратегии);
  //   isOwn — своя позиция. У неё НЕТ названия, поэтому фразы вокруг строятся
  //           отдельной веткой, а не подстановкой метки в готовый шаблон.
  // ⚠ Раньше label своей позиции был всем текстом участника. Поле развилки
  // просит «опишите вашу позицию», и на прогоне 005001 там оказалось 4536
  // символов — они уезжали в реплику Лемеха, в чип «Позиция», в плашку холла и
  // сразу в два поля документа («БАЦ» и «Ценностное предложение»), раздувая их
  // и дублируя друг друга слово в слово.
  window.imp.stanceOf = function (s2state) {
    if (!s2state || !s2state.stance) return null;
    var code = s2state.stance;
    if (code === 'fortress') return { code: code, label: '«Крепость»', full: '«Крепость»', isOwn: false };
    if (code === 'secondCurve') return { code: code, label: '«Вторая кривая»', full: '«Вторая кривая»', isOwn: false };
    if (code === 'other') {
      var own = (s2state.stanceOther || '').trim();
      // named — своя позиция, которую участник УМЕСТИЛ в название: её показываем
      // как обычную метку. Порог 130 знаков и без переносов строк: замер живых
      // прогонов дал здесь 63 · 86 · 121 · 123 · 144 · 270 — то есть четверо из
      // шести вписывают именно название, и прятать его за нейтральной подписью
      // незачем. Всё, что длиннее, — уже описание: в реплику персонажа или в чип
      // такое не вставить (у ИИ-прогона тут было 4536 знаков).
      var named = !!own && own.length <= 130 && own.indexOf('\n') === -1;
      return { code: code, label: named ? '«' + own + '»' : 'своя позиция',
               full: own, isOwn: true, named: named };
    }
    return null;
  };
})();

// i(m)perfect — общий клиент к бэкенду на Google Apps Script.
// Пока API_URL пуст, callApi() тихо возвращает null — вызывающий код
// сам решает, откатываться ли на localStorage. Никогда не бросает наверх
// фатально: сеть/бэкенд — best-effort слой поверх уже рабочего локального.

(function () {
  window.imp = window.imp || {};

  // Вставьте сюда URL из backend/README.md (Deploy > Web app), когда задеплоите.
  var API_URL = 'https://script.google.com/macros/s/AKfycbxLVJJpoMSewMgilTZEyO8h8wJPhIg-WhfJgwUBZ9RtRt4lufzB2kjwunwbMH3oXm4s1w/exec';

  window.imp.isApiConfigured = function () {
    return Boolean(API_URL);
  };

  // Адрес нужен снаружи ровно одному месту: js/edits.js шлёт маячок (sendBeacon)
  // на уходе со страницы, а маячок принимает только URL, не наш callApi().
  window.imp.apiUrl = function () { return API_URL; };

  // ---------- статус синхронизации + очередь повторной отправки ----------
  // Раньше сбой сети уходил в console.warn: участник видел финиш-оверлей и был
  // уверен, что ответ записан, а на бэкенд он не доходил (на этом устройстве
  // данные живы в localStorage, но при пересадке за другой компьютер — потеряны,
  // и фасилитатор видел пустой раунд). Теперь: (1) статус наблюдаем в UI
  // (шапка экрана ассессмента показывает его через window.imp.onSyncStatus), (2) неотправленные
  // сохранения складываются в очередь в localStorage и повторяются сами.

  var QUEUE_KEY = 'imp_sync_queue';
  var state = { pending: 0, failed: 0, lastOkAt: null, offline: false };
  var listeners = [];

  function notify() {
    var snap = {
      pending: state.pending, failed: state.failed,
      lastOkAt: state.lastOkAt, offline: state.offline
    };
    listeners.forEach(function (fn) { try { fn(snap); } catch (e) {} });
  }

  window.imp.onSyncStatus = function (fn) {
    if (typeof fn !== 'function') return;
    listeners.push(fn);
    notify();
  };

  function readQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
  }
  function writeQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-40))); } catch (e) {}
    state.failed = q.length;
    notify();
  }

  // В очередь попадают только сохранения (save*): повторить их безопасно —
  // бэкенд пишет строку по bib (upsert), дубликата не возникнет. Чтения (load*)
  // не копим: они и так повторятся при следующей загрузке страницы.
  function enqueue(action, payload) {
    if (!/^save/.test(action)) return;
    var q = readQueue();
    // на один action+bib держим только последнее состояние — очередь не растёт
    // при каждом нажатии клавиши, а хранит актуальный снимок
    var bib = payload && payload.bib;
    q = q.filter(function (it) { return !(it.action === action && it.payload && it.payload.bib === bib); });
    q.push({ action: action, payload: payload, at: Date.now() });
    writeQueue(q);
  }
  // Новый снимок того же действия и участника записан — снимок в очереди устарел (долг ревизии 17.10). Прежде он оставался
  // в очереди: при следующем повторе бэкенд принимал его и затирал более новые ответы старыми, а при отказе статус
  // «не сохранено» висел до конца дня, хотя актуальный снимок уже лежал в листе.
  function dropSuperseded(action, payload) {
    var bib = payload && payload.bib;
    var q = readQueue();
    var rest = q.filter(function (it) { return !(it.action === action && it.payload && it.payload.bib === bib); });
    if (rest.length !== q.length) writeQueue(rest);
  }

  function post(action, payload) {
    var body = Object.assign({ action: action }, payload || {});
    if (/^save/.test(action) && window.imp.telemetry && typeof window.imp.telemetry.snapshot === 'function') {
      try { body.telemetry = window.imp.telemetry.snapshot(); } catch (e) {}
    }
    // ⚠ ПРЕДЕЛ ОЖИДАНИЯ (правка владельца 28.08). Без него сорванное соединение оставляло
    // обещание вечно неразрешённым: на завершении дня finish() ждёт именно его, и экран
    // замирал навсегда. Тридцать секунд — с запасом на холодный старт Apps Script (там
    // бывает 5–10 с на первый вызов); по истечении срабатывает обычная ветка отказа, то
    // есть снимок уходит в очередь и повторяется сам, а не теряется.
    // ⚠ СУДЕЙСТВУ ТРИДЦАТИ СЕКУНД МАЛО (починка 01.09). Одно судейское задание — это
    // вызов модели на 30–90 секунд, а кабинет просит по три за раз. Каждый вызов
    // обрывался по этому пределу, цикл в кабинете видел null и говорил «сбой очереди»,
    // хотя Apps Script в это время спокойно доделывал работу. Внешне это выглядело так:
    // карточка висит неоценённой, а очередь стоит на десяти заданиях (поймано владельцем
    // на 001010 и 001011). Судейским действиям даём предел исполнения Apps Script —
    // шесть минут плюс запас; остальным остаются тридцать секунд, ради которых предел и
    // заводили: сорванный снимок ответа должен быстро уйти в очередь повтора.
    // «Проверено» (14.10) — сборка отчёта и тексты модели, 1–3 минуты: тот же предел, что у судейства.
    // Судейские действия прежнего маршрута (этапы, комнаты, калибровка) сняты 15.10 вместе с ним.
    var LONG = { runJudgeQueue: 1, judgeAnswers: 1, reportCheck: 1 };
    var waitMs = LONG[action] ? 400000 : 30000;
    var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, waitMs) : null;
    return fetch(API_URL, {
      method: 'POST',
      // text/plain — намеренно не application/json: иначе браузер шлёт CORS-preflight,
      // который Apps Script Web App не умеет обрабатывать (см. backend/README.md).
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  var flushing = false;
  // ⚠ ОТКАЗ ОДНОГО СНИМКА НЕ ДЕРЖИТ ОСТАЛЬНЫЕ (долг ревизии 17.10). Прежде отказ бэкенда по первому снимку останавливал
  // разбор: он стоял в голове очереди навсегда, и снимки за ним (другое действие, другой участник на том же устройстве) не
  // уходили. Теперь за один проход каждый снимок пробуется по разу: подтверждённый вынимается, отказанный остаётся и
  // повторится через 20 секунд. Обрыв связи останавливает проход — без сети пробовать остальные незачем.
  function flushQueue() {
    if (flushing || !API_URL) return Promise.resolve();
    var batch = readQueue();
    if (!batch.length) return Promise.resolve();
    flushing = true;
    var i = 0;
    var same = function (a) { return function (it) { return it.action === a.action && it.at === a.at; }; };
    function next() {
      if (i >= batch.length) { flushing = false; notify(); return Promise.resolve(); }
      var item = batch[i++];
      if (!readQueue().some(same(item))) return next();   // уже вынут: заменён новым снимком или записан напрямую
      return post(item.action, item.payload)
        .then(function (json) {
          // Как и в sendSave: из очереди вынимаем только подтверждённое.
          if (json && json.ok) {
            writeQueue(readQueue().filter(function (it) { return !same(item)(it); }));
            state.lastOkAt = Date.now();
            state.offline = false;
            notify();
          }
          return next();
        })
        .catch(function () {
          state.offline = true;
          notify();
          flushing = false;
        });
    }
    return next();
  }

  // Для проверки (scripts/checks/v2_levels.test.js): тот же разбор очереди, что по таймеру.
  window.imp.flushQueueForTest = flushQueue;

  // повторяем: при возврате связи, при возврате на вкладку и раз в 20 секунд
  window.addEventListener('online', flushQueue);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) flushQueue();
  });
  setInterval(flushQueue, 20000);
  // предупредить, если участник закрывает вкладку с неотправленным
  window.addEventListener('beforeunload', function (e) {
    if (readQueue().length) { e.preventDefault(); e.returnValue = ''; return ''; }
  });

  // action: строка ('saveAnswers' | 'loadAnswers' | 'v2List' | ...), payload: обычный объект.
  // Возвращает Promise<object|null> — null при любой сетевой/конфигурационной
  // проблеме (вызывающий код не ломается). Сохранения при сбое уходят в очередь.
  //
  // ⚠ Сохранения одного раунда одного участника выстроены в цепочку, а не летят
  // параллельно. Гонка, которая это потребовала (поймана на прогоне 005001,
  // раунд 5): debounce-автосейв уже в полёте, участник жмёт «Завершить раунд» —
  // clearTimeout запрос не отзывает, и два POST-а пишут одну строку листа. Apps
  // Script порядок не гарантирует, поэтому записанным последним оказался
  // автосейв со СТАРЫМ снимком (finished: false) и затёр флаг: участник видел
  // «✓ раунд завершён», а кабинет — незавершённый раунд. payload держим по
  // ссылке специально: отложенный автосейв уйдёт с уже актуальным состоянием.
  var saveChains = {};

  function sendSave(action, payload) {
    state.pending++;
    notify();
    return post(action, payload)
      .then(function (json) {
        state.pending--;
        // ⚠ Доехавший запрос — ещё не записанный ответ. Раньше здесь стояло
        // state.lastOkAt = Date.now() сразу после fetch, и статус показывал
        // «сохранено» даже когда бэкенд ответил {ok:false} — неизвестное
        // действие, отказ по паролю, ошибка листа. Это ровно тот запрещённый
        // исход «тихо сохранить и пойти дальше»: участник видит подтверждение,
        // а в листе ничего нет. Теперь отказ бэкенда = сбой: снимок уходит в
        // очередь, статус показывает «не сохранено», callApiConfirmed возвращает
        // false и финиш-оверлей знает правду.
        if (!(json && json.ok)) {
          enqueue(action, payload);
          notify();
          return json;
        }
        dropSuperseded(action, payload);
        state.lastOkAt = Date.now();
        state.offline = false;
        notify();
        flushQueue(); // связь есть — доотправим то, что залежалось
        return json;
      })
      .catch(function (err) {
        console.warn('[imp.callApi] ' + action + ' failed:', err);
        state.pending--;
        state.offline = true;
        enqueue(action, payload); // не теряем: повторим сами
        notify();
        return null;
      });
  }

  // ⚠ ПОТЕРЯННЫЙ БОЛЬШОЙ ОТВЕТ — ПОВТОР (владелец 19.10, «делай»). Ответ Apps Script отдаётся через переадресацию на
  // googleusercontent; у карточки участника он 0,6–0,9 МБ, и примерно каждый третий Google теряет: вторая переадресация
  // ведёт обратно на /exec, браузер приходит туда уже GET без тела, и бэкенд отвечает «unauthorized» на верный пароль
  // (замер на живом бэкенде 19.10: 3 из 10; проверка пароля и список потока — 16 из 16 без потерь). Карточка показывала
  // «Карточка не загрузилась: unauthorized». Повторяем только читающие действия: повтор оценки оплатил бы её дважды.
  var LOST_RETRY = { v2Detail: 2 };

  window.imp.callApi = function (action, payload) {
    if (!API_URL) return Promise.resolve(null);

    if (!/^save/.test(action)) {
      var tries = 0;
      var once = function () {
        return post(action, payload).then(function (json) {
          if (json && json.error === 'unauthorized' && payload && payload.password && tries < (LOST_RETRY[action] || 0)) {
            tries++;
            return once();
          }
          return json;
        });
      };
      return once().catch(function (err) {
        console.warn('[imp.callApi] ' + action + ' failed:', err);
        return null;
      });
    }

    var key = action + '|' + (payload && payload.bib);
    var run = function () { return sendSave(action, payload); };
    // и на успехе, и на ошибке предыдущего — следующий всё равно отправляем
    var chained = (saveChains[key] || Promise.resolve()).then(run, run);
    saveChains[key] = chained.catch(function () {});
    return chained;
  };

  // Сохранить и ДОЖДАТЬСЯ подтверждения: используется на завершении раунда,
  // чтобы финиш-оверлей не показывался, пока ответ не принят бэкендом.
  // Возвращает Promise<boolean> — true, если бэкенд подтвердил запись.
  window.imp.callApiConfirmed = function (action, payload) {
    if (!API_URL) return Promise.resolve(true); // бэкенд не настроен — локального достаточно
    return window.imp.callApi(action, payload).then(function (res) {
      return !!(res && res.ok);
    });
  };

  // Восстановление доступа на новом устройстве иначе оставляет
  // localStorage для этой станции/комнаты пустым, скрипт тихо открывает
  // пустое состояние — и первое же автосохранение затирает на бэкенде
  // реальный прогресс, записанный с исходного устройства. Пробуем
  // подтянуть его один раз в фоне; флаг не даёт повторять проверку при
  // каждой загрузке страницы.
  //
  // Намеренно НЕ блокирует вызывающий код и НЕ перезагружает страницу,
  // если на бэкенде ничего не нашлось (обычный новый участник, самый частый
  // случай) — иначе каждый первый визит на станцию/комнату ждал бы сетевой
  // ответ и перезагружался вслепую, рискуя гонкой с быстрым вводом участника.
  // Страница продолжает рендериться синхронно как обычно; перезагрузка
  // происходит только если реально нашлось что подтягивать.
  window.imp.hydrateOnce = function (action, bib, storageKey) {
    if (!window.imp.isApiConfigured()) return;
    if (localStorage.getItem(storageKey)) return;
    var flagKey = storageKey + '_hydrate_tried';
    if (localStorage.getItem(flagKey)) return;
    localStorage.setItem(flagKey, '1');
    window.imp.callApi(action, { bib: bib }).then(function (res) {
      if (res && res.ok && res.state) {
        localStorage.setItem(storageKey, JSON.stringify(res.state));
        window.location.reload();
      }
    });
  };
  // ---------- отчёт участника файлом и архивом (владелец 28.10) ----------
  // Отчёт с сервера ссылается на шрифт относительным адресом (fonts/fonts.css): с диска или из письма он не загрузится.
  // Скачанный файл получает шрифт внутрь (data:, около 190 КБ), маскоты в отчёте уже нарисованы внутри страницы.
  // Архив — по файлу на участника, без сжатия и без сторонних библиотек (одинаково в Google и на сервере компании).
  var FONT_LINK = '<link rel="stylesheet" href="fonts/fonts.css">';
  var fontCss = null;
  function b64(buf) {
    var u = new Uint8Array(buf), s = '';
    for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function inlineFontCss() {
    if (fontCss) return fontCss;
    var ok = function (r) { if (!r.ok) throw new Error('font ' + r.status); return r; };
    fontCss = fetch('fonts/fonts.css').then(ok).then(function (r) { return r.text(); }).then(function (css) {
      var names = [];
      css.replace(/url\(\.\/([^)]+)\)/g, function (m, f) { if (names.indexOf(f) < 0) names.push(f); return m; });
      return Promise.all(names.map(function (f) {
        return fetch('fonts/' + f).then(ok).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return [f, b64(b)]; });
      })).then(function (list) {
        list.forEach(function (x) { css = css.split('url(./' + x[0] + ')').join('url(data:font/woff2;base64,' + x[1] + ')'); });
        return css;
      });
    }).catch(function () { fontCss = null; return ''; });
    return fontCss;
  }
  // HTML отчёта → самостоятельный файл. Шрифт не загрузился — ссылка на него полным адресом сайта (нужен интернет).
  window.imp.reportFileHtml = function (html) {
    return inlineFontCss().then(function (css) {
      var to = css ? '<style>' + css + '</style>' : '<link rel="stylesheet" href="' + new URL('fonts/fonts.css', location.href).href + '">';
      return String(html).split(FONT_LINK).join(to);
    });
  };
  // Имя файла без знаков, которые запрещают Windows и macOS.
  window.imp.fileName = function (s) {
    return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'файл';
  };
  var CRC = null;
  function crc32(u) {
    if (!CRC) {
      CRC = new Uint32Array(256);
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
    }
    var x = 0xFFFFFFFF;
    for (var i = 0; i < u.length; i++) x = CRC[(x ^ u[i]) & 0xFF] ^ (x >>> 8);
    return (x ^ 0xFFFFFFFF) >>> 0;
  }
  // files: [{ name, text }] → ZIP (хранение без сжатия, имена в UTF-8 — флаг 0x0800).
  window.imp.zipBlob = function (files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0, d = new Date();
    var tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(10, tm, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(h.buffer, name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(12, tm, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, off, true);
      central.push(c.buffer, name);
      off += 30 + name.length + data.length;
    });
    var size = central.reduce(function (s, x) { return s + x.byteLength; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
  };
  window.imp.saveBlob = function (blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
})();

// i(m)perfect — КЛИЕНТ ЭКСПЕРТНОГО ЭКРАНА К СВОЕМУ БЭКЕНДУ.
//
// ⚠ ОТДЕЛЬНЫЙ СКРИПТ, А НЕ ОБЩИЙ С АССЕССМЕНТОМ. Скрипт участника уже несёт
// прогоны, ответы, судейство и правки — а здесь совсем другие данные, другой
// объём и другой срок жизни: разбор нужен на несколько недель, пока идёт
// валидация, и потом лист можно закрыть. Смешать их значило бы утяжелить
// работающий бэкенд ради временной задачи и связать их отказы: сломался бы
// один лист — встали бы оба экрана.
//
// Поэтому здесь свой URL, свой лист и свой пароль. js/api.js эта страница не
// подключает вовсе.
//
// Пока EXPERT_API_URL пуст, всё работает на localStorage: экран эксперта
// самодостаточен, а на финише есть выгрузка файлом. Бэкенд — удобство
// (ответы не зависят от того, не почистил ли эксперт браузер), а не условие.

(function () {
  window.imp = window.imp || {};

  // Отдельное веб-приложение валидации (backend/expert.gs). НЕ адрес
  // ассессмента: там другой скрипт, другой лист и другие данные.
  // ⚠ При каждом НОВОМ развёртывании Apps Script выдаёт новый идентификатор —
  // адрес здесь придётся заменить. Если же обновлять существующее развёртывание
  // («Управление развёртываниями → карандаш → Версия: новая»), адрес остаётся
  // прежним; так и надо делать при правках скрипта.
  var EXPERT_API_URL = 'https://script.google.com/macros/s/AKfycbx32-1CGYxVpqHrCCpLuKYmOOLQpDHvseorpzAoo3j3vhxbEt2G7vY-fXe4s9-bOXKi/exec';

  var QUEUE_KEY = 'imp_expert_queue';
  var state = { pending: 0, failed: 0, lastOkAt: null };
  var listeners = [];

  function notify() {
    var snap = { pending: state.pending, failed: state.failed, lastOkAt: state.lastOkAt,
      configured: Boolean(EXPERT_API_URL) };
    listeners.forEach(function (fn) { try { fn(snap); } catch (e) {} });
  }
  window.imp.onExpertSync = function (fn) {
    if (typeof fn === 'function') { listeners.push(fn); notify(); }
  };
  window.imp.expertApiConfigured = function () { return Boolean(EXPERT_API_URL); };

  function readQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
  }
  function writeQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-10))); } catch (e) {}
    state.failed = q.length;
    notify();
  }

  function post(action, payload) {
    // text/plain — иначе браузер шлёт предварительный OPTIONS, а Apps Script
    // на него не отвечает: запрос падал бы на CORS, не дойдя до скрипта.
    return fetch(EXPERT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    }).then(function (r) { return r.json(); });
  }

  // На одного эксперта в очереди держится ОДИН снимок — последний. Снимок
  // приходит целиком и каждый раз новый, копить их незачем: доехать должен
  // актуальный, а не все промежуточные.
  function enqueue(key, expert) {
    var q = readQueue().filter(function (it) { return it.key !== key; });
    q.push({ key: key, expert: expert, at: Date.now() });
    writeQueue(q);
  }

  function flush() {
    if (!EXPERT_API_URL) return;
    var q = readQueue();
    if (!q.length) return;
    var item = q[0];
    post('saveExpert', { key: item.key, expert: item.expert }).then(function (json) {
      if (json && json.ok) {
        writeQueue(readQueue().filter(function (it) { return it.at !== item.at; }));
        state.lastOkAt = Date.now();
        notify();
        flush();
      }
    }).catch(function () { /* сеть вернётся — повторим по таймеру */ });
  }

  var chain = Promise.resolve();

  // Сохранения выстроены в цепочку, а не летят параллельно: Apps Script не
  // гарантирует порядок, и два POST-а по одной строке могли бы записаться так,
  // что последним лёг СТАРЫЙ снимок и затёр свежий.
  window.imp.saveExpert = function (key, expert) {
    try { localStorage.setItem('imp_expert_' + key, JSON.stringify(expert)); } catch (e) {}
    if (!EXPERT_API_URL) return Promise.resolve(null);

    var run = function () {
      state.pending++;
      notify();
      return post('saveExpert', { key: key, expert: expert }).then(function (json) {
        state.pending--;
        // Доехавший запрос — ещё не записанный ответ: отказ бэкенда это тоже
        // сбой, и снимок обязан уйти в очередь, а не считаться сохранённым.
        if (!(json && json.ok)) { enqueue(key, expert); notify(); return json; }
        state.lastOkAt = Date.now();
        notify();
        flush();
        return json;
      }).catch(function (err) {
        console.warn('[expertApi] saveExpert:', err);
        state.pending--;
        enqueue(key, expert);
        notify();
        return null;
      });
    };
    chain = chain.then(run, run);
    return chain;
  };

  // Возврат с другого устройства: по номеру достаём снимок с сервера.
  window.imp.loadExpert = function (key) {
    if (!EXPERT_API_URL) return Promise.resolve(null);
    return post('loadExpert', { key: key })
      .then(function (json) { return (json && json.ok && json.expert) ? json.expert : null; })
      .catch(function () { return null; });
  };

  // Сводка: пароль проверяется НА СЕРВЕРЕ. Это не тот пароль, что открывает
  // корпус эксперту, — этот знает только команда.
  window.imp.listExperts = function (password, corpus) {
    if (!EXPERT_API_URL) {
      return Promise.resolve({ ok: false, error: 'Бэкенд не настроен: EXPERT_API_URL пуст в js/expert-api.js.' });
    }
    return post('loadExperts', { password: password, corpus: corpus })
      .catch(function () { return { ok: false, error: 'Сервер не ответил.' }; });
  };

  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) flush(); });
  setInterval(flush, 20000);
  window.addEventListener('beforeunload', function (e) {
    if (readQueue().length) { e.preventDefault(); e.returnValue = ''; return ''; }
  });
})();

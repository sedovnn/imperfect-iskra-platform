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

  // action: строка ('register' | 'recover' | 'saveStation1' | ...), payload: обычный объект.
  // Возвращает Promise<object|null> — null при любой сетевой/конфигурационной проблеме.
  window.imp.callApi = function (action, payload) {
    if (!API_URL) return Promise.resolve(null);

    var body = Object.assign({ action: action }, payload || {});

    return fetch(API_URL, {
      method: 'POST',
      // text/plain — намеренно не application/json: иначе браузер шлёт CORS-preflight,
      // который Apps Script Web App не умеет обрабатывать (см. backend/README.md).
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    })
      .then(function (res) { return res.json(); })
      .catch(function (err) {
        console.warn('[imp.callApi] ' + action + ' failed:', err);
        return null;
      });
  };

  // Восстановление доступа на новом устройстве иначе оставляет
  // localStorage для этой станции/комнаты пустым, скрипт тихо открывает
  // пустое состояние — и первое же автосохранение затирает на бэкенде
  // реальный прогресс, записанный с исходного устройства. Пробуем
  // подтянуть его один раз; флаг не даёт зациклить reload, если на
  // бэкенде и правда ничего нет (обычный новый участник).
  // Возвращает true, если запустила восстановление — вызывающий код должен
  // сразу return, дальше работает уже перезагруженная страница.
  window.imp.hydrateOnce = function (action, bib, storageKey) {
    if (!window.imp.isApiConfigured()) return false;
    if (localStorage.getItem(storageKey)) return false;
    var flagKey = storageKey + '_hydrate_tried';
    if (localStorage.getItem(flagKey)) return false;
    localStorage.setItem(flagKey, '1');
    window.imp.callApi(action, { bib: bib }).then(function (res) {
      if (res && res.ok && res.state) {
        localStorage.setItem(storageKey, JSON.stringify(res.state));
      }
      window.location.reload();
    });
    return true;
  };
})();

/* Сервис-воркер «Искры». Задача одна: чтобы день можно было пройти при
   пропавшей сети. Всё остальное он делать НЕ должен, потому что это
   измерительный инструмент, а не сайт.

   Три решения и причины, почему именно так:

   1) Кэша-списка (precache) нет. У платформы правка = публикация, и версии
      висят на ?v= в каждом теге (styles.css?v=98, engine.js?v=2). Список
      пришлось бы синхронно править при каждом бампе — рано или поздно он
      разойдётся с разметкой, и воркер начнёт держать не то, что грузит
      страница. Поэтому кэш наполняется тем, что реально запрошено.

   2) Сеть первая, кэш — запас. Не наоборот. Cache-first быстрее, но после
      деплоя отдавал бы старый js участнику, который уже сидит в новом дне;
      для ассессмента расхождение версии сцен и версии судей дороже, чем
      сотня миллисекунд.

   3) skipWaiting НЕ вызываем. Новый воркер ждёт закрытия страницы. Иначе
      обновление, пришедшее посреди разговора, подменило бы css и js под
      работающим экраном.

   Отдельно: запросы к бэкенду не трогаются вообще (см. isBackend). Ответы
   Apps Script кэшировать нельзя ни секунды — это чужое состояние. */

var VERSION = 'iskra-v1';
var SHELL = 'shell-' + VERSION;   // свои html/css/js/картинки
var FONTS = 'fonts-' + VERSION;   // Inter Tight с Google Fonts

self.addEventListener('install', function () {
  // Ничего не предзагружаем — см. решение (1).
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        if (n !== SHELL && n !== FONTS) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isBackend(url) {
  // Живой бэкенд и всё, что может им стать. Мимо кэша, всегда.
  return url.hostname.indexOf('script.google.com') === 0 ||
         url.hostname.indexOf('script.googleusercontent.com') >= 0 ||
         url.hostname === 'api.fproof.ru';
}

function isFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;              // POST к бэкенду — не наше дело

  var url = new URL(req.url);
  if (isBackend(url)) return;                    // см. шапку

  if (isFont(url)) {
    // Шрифты неизменяемы по своему url — здесь кэш первым уместен.
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(FONTS).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;   // прочее чужое не наше

  e.respondWith(
    fetch(req).then(function (res) {
      // В кэш кладём только удавшееся: 404 и 500 запасом быть не могут.
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(SHELL).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        // Навигация без запаса — честная страница, а не белый экран.
        if (req.mode === 'navigate') {
          return new Response(
            '<!doctype html><html lang="ru"><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<body style="font:16px/1.5 -apple-system,system-ui,sans-serif;padding:40px;color:#181818">' +
            '<p style="color:#ff4800;font-weight:600">Нет сети</p>' +
            '<p>Эта страница ещё не открывалась на этом устройстве, поэтому запаса нет. ' +
            'Ответы, которые вы уже зафиксировали, сохранены и уйдут на сервер, когда сеть вернётся.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
          );
        }
        return Response.error();
      });
    })
  );
});

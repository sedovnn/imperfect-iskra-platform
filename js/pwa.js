/* Регистрация сервис-воркера. Отдельным файлом, а не инлайном, по двум причинам:
   подключается одной строкой в конце любой страницы и не участвует в порядке
   загрузки js (см. CLAUDE.md: порядок case-ref.js → engine.js обязателен).

   Провал регистрации намеренно тихий: офлайн-запас — удобство, а не условие
   работы. Если воркер не встал, день проходится как обычно, по сети. */
(function () {
  if (!('serviceWorker' in navigator)) return;

  /* Прогрев кэша дня. Без него офлайн — обещание на словах: воркер кэширует
     только то, что уже запрашивали, а `assessment.html` участник открывает
     ПОСЛЕ входа — то есть ровно тогда, когда сеть уже может пропасть.

     Список файлов не хардкожу: беру `assessment.html` и вычитываю её же
     теги script/link. Иначе список пришлось бы править при каждом бампе ?v=
     и он бы разошёлся с разметкой — та же причина, по которой в sw.js нет
     precache-списка. */
  // Страницы дня. Иконки и манифест — отдельно: на первом визите их запросила
  // страница, которой воркер ещё не управлял, поэтому в кэш они не попали.
  var PAGES = ['index.html', 'assessment.html'];
  var EXTRA = ['case-v6.html',                              // адрес из case-ref.js
               'manifest.json', 'icon-192.png', 'icon-512.png',
               'icon-maskable-512.png', 'apple-touch-icon.png'];

  function get(url, opts) { return fetch(url, opts || { credentials: 'same-origin' }); }

  // Последовательно, а не пачкой: прогрев не должен конкурировать с тем,
  // что грузит открытая страница.
  function chain(urls) {
    return urls.reduce(function (p, u) {
      return p.then(function () { return get(u).catch(function () {}); });
    }, Promise.resolve());
  }

  // Шрифты живут на CDN, и woff2-адреса известны только из их css.
  // Без этого офлайн-страница откатилась бы на системный шрифт.
  function warmFonts(cssHrefs) {
    return chain(cssHrefs).then(function () {
      return cssHrefs.reduce(function (p, href) {
        return p.then(function () {
          return get(href, { mode: 'cors' }).then(function (r) { return r.text(); })
            .then(function (css) {
              var files = (css.match(/https:\/\/[^)"']+\.woff2?/g) || []);
              return chain(files.filter(function (u, i) { return files.indexOf(u) === i; }));
            }).catch(function () {});
        });
      }, Promise.resolve());
    });
  }

  function warmDay() {
    if (navigator.connection && navigator.connection.saveData) return;  // экономия трафика — уважаем
    var own = [], cdnCss = [];
    // Страницы кэшируются самим этим обходом: воркер кладёт в запас каждый
    // удавшийся GET, а мы их и так читаем, чтобы вынуть списки ассетов.
    PAGES.reduce(function (prev, page) {
      return prev.then(function () {
        return get(page).then(function (r) { return r.ok ? r.text() : Promise.reject(); })
          .then(function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            doc.querySelectorAll('script[src]').forEach(function (s) { own.push(s.getAttribute('src')); });
            doc.querySelectorAll('link[rel=stylesheet][href]').forEach(function (l) {
              var h = l.getAttribute('href');
              (h.indexOf('http') === 0 ? cdnCss : own).push(h);
            });
          }).catch(function () {});
      });
    }, Promise.resolve())
      .then(function () {
        var uniq = own.concat(EXTRA).filter(function (u, i, a) { return u && a.indexOf(u) === i; });
        return chain(uniq);
      })
      .then(function () {
        var u = cdnCss.filter(function (x, i, a) { return a.indexOf(x) === i; });
        return u.length ? warmFonts(u) : null;
      })
      .catch(function () { /* нет сети — просто не прогрелись */ });
  }

  /* Прогрев только когда воркер РЕАЛЬНО управляет страницей. На первом визите
     между register() и контролем есть зазор, и запросы в нём проходят мимо
     воркера — то есть у участника, зашедшего впервые (самый частый случай),
     день бы не прогрелся вовсе. Проверено: без этого ожидания assessment.html
     и case-v6.html в кэш не попадали. */
  function whenControlled(cb) {
    if (navigator.serviceWorker.controller) return cb();
    var sw = navigator.serviceWorker;
    var once = function () { sw.removeEventListener('controllerchange', once); cb(); };
    sw.addEventListener('controllerchange', once);
  }

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function () {
      whenControlled(function () {
        var idle = window.requestIdleCallback || function (f) { setTimeout(f, 2500); };
        idle(warmDay);
      });
    }).catch(function (e) {
      if (window.console && console.info) console.info('sw: не зарегистрирован —', e && e.message);
    });
  });
})();

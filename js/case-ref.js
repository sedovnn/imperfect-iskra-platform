// i(m)perfect — «Полный текст кейса»: второй докнутый язычок рядом с «Мои
// ответы» на станциях 2/3 и в комнатах. Read-only: пакет материалов «Искры»
// нужен для сверки с данными («играем по данным кейса»), а карту проблем
// участник уже собрал на станции 1 — менять её здесь нельзя.
//
// Единственный источник текста — #caseContent из round1.html: тянется fetch'ем
// один раз и кэшируется. Копии кейса в других файлах нет (правка кейса — в одном
// месте). Оверлей и второй язычок создаются здесь же, без разметки в 5 страницах.

(function () {
  var existingDock = document.querySelector('.dossier-dock');
  if (!existingDock) return; // только там, где есть докнутое «Мои ответы»

  // ---- две справочные кнопки — В ШАПКУ, а не плавающим рельсом ----
  // Рельс из вертикальных язычков висел у правого края в пустоте: на диалоговых
  // раундах справа от колонки ответов ничего нет, и он читался как случайный
  // элемент вне композиции, плюс на него наезжал скроллбар. Теперь это обычные
  // кнопки шапки рядом с «?», «ⓘ», номером и «К карте» — все контролы экрана в
  // одном месте (ревизия 2026-07-27). Подписи короткие: на узкой рамке (1120)
  // длинные не помещались, а заголовки самих панелей их раскрывают.
  //
  // Пара создаётся в КАЖДОЙ шапке страницы: в раунде 1 их две (фаза чтения и
  // фаза связок), и одна пара обслуживала бы только первую. Клик по «Мои ответы»
  // ловит делегирование в dossier-panel.js по классу .js-open-dossier.
  var headers = document.querySelectorAll('.station-header .station-header-right');
  var caseButtons = [];

  function buildGroup(headerRight, dossierBtn) {
    var group = document.createElement('span');
    group.className = 'hdr-ref-group';
    dossierBtn.textContent = 'Мои ответы';
    dossierBtn.className = 'dossier-dock js-open-dossier btn btn-ghost btn-sm';
    group.appendChild(dossierBtn);

    var cb = document.createElement('button');
    cb.type = 'button';
    cb.className = 'case-ref-dock btn btn-ghost btn-sm';
    cb.setAttribute('aria-label', 'Открыть полный текст кейса');
    cb.textContent = 'Кейс';
    group.appendChild(cb);
    caseButtons.push(cb);

    headerRight.insertBefore(group, headerRight.firstChild);
  }

  if (headers.length) {
    for (var h = 0; h < headers.length; h++) {
      // в первую шапку переносим существующую кнопку (сохраняет разметку страницы),
      // в остальные — свежие копии
      buildGroup(headers[h], h === 0 ? existingDock : (function () {
        var b = document.createElement('button');
        b.type = 'button';
        return b;
      })());
    }
  } else {
    // фолбэк (страница без шапки станции): прежний плавающий рельс
    var rail = document.createElement('div');
    rail.className = 'dock-rail';
    existingDock.parentNode.insertBefore(rail, existingDock);
    rail.appendChild(existingDock);
    var cbFallback = document.createElement('button');
    cbFallback.type = 'button';
    cbFallback.className = 'case-ref-dock';
    cbFallback.setAttribute('aria-label', 'Открыть полный текст кейса');
    cbFallback.textContent = 'Полный текст кейса';
    rail.appendChild(cbFallback);
    caseButtons.push(cbFallback);
  }

  // ---- оверлей ----
  var panel = document.createElement('div');
  panel.className = 'dossier-overlay';
  panel.id = 'caseRefPanel';
  panel.setAttribute('aria-hidden', 'true');
  panel.style.display = 'none';
  panel.innerHTML =
    '<div class="gate-card dossier-card case-ref-card" role="dialog" aria-modal="true" aria-label="Полный текст кейса «Искра»">' +
      '<div class="dossier-card-header">' +
        '<div><p class="kicker">Пакет материалов</p><h2 style="margin:0;">Кейс «Искра»</h2></div>' +
        '<button type="button" class="btn btn-ghost btn-xs" id="caseRefClose">Закрыть ✕</button>' +
      '</div>' +
      '<p class="section-lead" style="margin:14px 0 4px;">Только для чтения — карту проблем вы уже собрали в раунде 1.</p>' +
      '<div class="case-content" id="caseRefContent"><p class="fac-detail-loading">Загружаю материалы…</p></div>' +
    '</div>';
  document.body.appendChild(panel);

  var contentEl = panel.querySelector('#caseRefContent');
  var closeBtn = panel.querySelector('#caseRefClose');
  var cache = null;
  var lastFocus = null;

  function show() {
    lastFocus = document.activeElement;
    panel.style.display = 'flex';
    panel.setAttribute('aria-hidden', 'false');
    // пока ящик открыт, язычки спрятаны (см. body.imp-drawer-open в styles.css)
    document.body.classList.add('imp-drawer-open');
    document.addEventListener('keydown', onKey);
    if (closeBtn) closeBtn.focus();
  }
  function close() {
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('imp-drawer-open');
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  // клик по затемнённой подложке закрывает так же, как Escape и кнопка «Закрыть»
  panel.addEventListener('click', function (e) { if (e.target === panel) close(); });

  function open() {
    if (cache !== null) { contentEl.innerHTML = cache; show(); return; }
    show(); // показываем сразу с «Загружаю…», чтобы не было пустой паузы
    // без force-cache: не хотим показать устаревший кейс после деплоя; в рамках
    // сессии повторных запросов нет — результат кэшируется в переменной cache.
    fetch('round1.html')
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var content = doc.getElementById('caseContent');
        cache = content ? content.innerHTML : '<p class="fac-detail-text">Не удалось найти текст кейса.</p>';
        contentEl.innerHTML = cache;
        contentEl.scrollTop = 0;
      })
      .catch(function () {
        contentEl.innerHTML = '<p class="fac-detail-text">Не удалось загрузить текст кейса — проверьте соединение и попробуйте ещё раз.</p>';
      });
  }

  caseButtons.forEach(function (b) { b.addEventListener('click', open); });
  closeBtn.addEventListener('click', close);
  panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
})();

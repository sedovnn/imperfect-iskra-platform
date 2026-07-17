// i(m)perfect — «Полный текст кейса»: второй докнутый язычок рядом с «Мои
// ответы» на станциях 2/3 и в комнатах. Read-only: пакет материалов «Искры»
// нужен для сверки с данными («играем по данным кейса»), а карту проблем
// участник уже собрал на станции 1 — менять её здесь нельзя.
//
// Единственный источник текста — #caseContent из station1.html: тянется fetch'ем
// один раз и кэшируется. Копии кейса в других файлах нет (правка кейса — в одном
// месте). Оверлей и второй язычок создаются здесь же, без разметки в 5 страницах.

(function () {
  var existingDock = document.querySelector('.dossier-dock');
  if (!existingDock) return; // только там, где есть докнутое «Мои ответы»

  // ---- правый рельс из двух язычков ----
  var rail = document.createElement('div');
  rail.className = 'dock-rail';
  existingDock.parentNode.insertBefore(rail, existingDock);
  rail.appendChild(existingDock); // перенос сохраняет навешенный обработчик

  var caseDock = document.createElement('button');
  caseDock.type = 'button';
  caseDock.className = 'case-ref-dock';
  caseDock.setAttribute('aria-label', 'Открыть полный текст кейса');
  caseDock.textContent = 'Полный текст кейса';
  rail.appendChild(caseDock);

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
      '<p class="section-lead" style="margin:14px 0 4px;">Только для чтения — карту проблем вы уже собрали на станции 1.</p>' +
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
    document.addEventListener('keydown', onKey);
    if (closeBtn) closeBtn.focus();
  }
  function close() {
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

  function open() {
    if (cache !== null) { contentEl.innerHTML = cache; show(); return; }
    show(); // показываем сразу с «Загружаю…», чтобы не было пустой паузы
    // без force-cache: не хотим показать устаревший кейс после деплоя; в рамках
    // сессии повторных запросов нет — результат кэшируется в переменной cache.
    fetch('station1.html')
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

  caseDock.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
})();

// i(m)perfect — «Кейс»: вторая справочная кнопка шапки рядом с «Мои ответы»,
// на всех экранах разговора. Read-only: пакет материалов «Искры» нужен для
// сверки с данными («играем по данным кейса»). Пакет участник читает первым
// шагом дня на отдельном экране; эта панель — чтобы вернуться к нему потом.
//
// Единственный источник текста — #caseContent из case-v6.html (адрес задаёт
// страница через data-case-src): тянется fetch'ем один раз и кэшируется. Копии
// кейса в других файлах нет. Тем же загрузчиком (window.imp.loadCaseHtml) движок
// наполняет экран чтения пакета в начале дня. Оверлей создаётся здесь же.

(function () {
  window.imp = window.imp || {};

  // ── Загрузчик пакета: ОДИН на всю платформу ──────────────────────────────
  // Вынесен выше всякой разметки сознательно. Экран участника v2 докнутой кнопки
  // «Мои ответы» не содержит (опора встроена в раскладку), а загрузчик ему нужен —
  // при прежнем порядке весь файл выходил по гейту ниже, и window.imp.loadCaseHtml
  // не определялся вовсе.
  var cache = null;
  window.imp.loadCaseHtml = function () {
    if (cache !== null) return Promise.resolve(cache);
    return fetch(document.body.dataset.caseSrc || 'case-v6.html')
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var content = doc.getElementById('caseContent');
        cache = content ? content.innerHTML : null;
        if (cache === null) throw new Error('caseContent not found');
        return cache;
      });
  };

  // Справочник «кто есть кто». Память на имена не меряет ни одна из десяти
  // способностей, поэтому это опора, а не подсказка. Денежных рамок здесь нет и не
  // будет: они называют развилку правления, которую кейс скрывает до второго
  // разговора (снятая утечка, 2026-08-02).
  window.imp.caseCheatsheet = {
    people: [
      ['Кирилл Агеев', 'гендиректор бизнеса «Поиск и реклама» — он вас позвал'],
      ['Григорий Штерн', 'финансовый директор группы, пришёл из «Меридиана», программа «Дисциплина-26»'],
      ['Виктор Лемех', 'вице-президент «Меридиана» по спецпроектам, дирекция специальных проектов'],
      ['Марина Северова', 'директор направления «Устройства и подписка» — «Мира»'],
      ['Олег Брагин', 'руководитель платформенной разработки, 3000 инженеров, из первой сотни'],
      ['Даниил Кацман', 'руководил группой «Периметр» — локальный ИИ на устройстве'],
      ['Тимур Гареев', 'тимлид релиза «Мира 3.0»'],
      ['Аня Ковач', 'продакт-менеджер релиза «Мира 3.0»']
    ],
    things: [
      ['«Искра»', 'компания: поиск и реклама — 88% выручки группы и вся её прибыль'],
      ['«Меридиан»', 'холдинг-владелец; консорциум, задающий инвестиционную рамку'],
      ['«Маяк»', 'флагманский спецпроект консорциума с государством, с апреля 2025'],
      ['«Мира»', 'голосовой ассистент с 2018, колонка «Мира Дом» с 2019'],
      ['«Искра Ответ»', 'нейросетевой ответ прямо в выдаче, с 2024; NPS +57'],
      ['«Искра Пэй»', 'финтех: свой P&L с 2023, вырос без рекламных денег'],
      ['«Периметр»', 'группа локального ИИ, 20 человек — распалась'],
      ['Nord Labs', 'конкурент с 2022, строят в том числе бывшие сотрудники «Искры»'],
      ['Omnia', 'глобальный игрок, трижды заходил на домашний рынок'],
      ['Loop', 'локальный сервис, ~3% рынка, в отчётах — «прочие»'],
      ['«Юнимарт» · «Атлант»', 'ритейл-медиа (+64% за год) и суперапп (95 млн) — конкуренты за бюджеты']
    ]
  };

  // ── Дальше — легаси-оверлей для страниц с докнутой кнопкой ───────────────
  var existingDock = document.querySelector('.dossier-dock');
  if (!existingDock) return;

  // ---- две справочные кнопки — В ШАПКУ, а не плавающим рельсом ----
  // Рельс из вертикальных язычков висел у правого края в пустоте: на диалоговых
  // раундах справа от колонки ответов ничего нет, и он читался как случайный
  // элемент вне композиции, плюс на него наезжал скроллбар. Теперь это обычные
  // кнопки шапки рядом с «?», «ⓘ», номером и «К карте» — все контролы экрана в
  // одном месте (ревизия 2026-07-27). Подписи короткие: на узкой рамке (1120)
  // длинные не помещались, а заголовки самих панелей их раскрывают.
  //
  // Пара создаётся в КАЖДОЙ подходящей шапке страницы. Клик по «Мои ответы»
  // ловит делегирование по классу .js-open-dossier — в платформе v2 его слушает
  // js/engine.js (панель знает восемь ответов и факты портфеля).
  // data-no-refs — шапка, куда пару кнопок ставить не надо. Такая одна: экран
  // чтения пакета в начале дня. Кнопка «Кейс» там предлагала бы открыть поверх
  // кейса тот же кейс, а «Мои ответы» — панель, в которой пока ничего нет.
  var headers = document.querySelectorAll(
    '.station-header .station-header-right:not([data-no-refs]), .finalize-top .station-header-right:not([data-no-refs])');
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

  // ---- шпаргалка: кто есть кто и две денежные рамки ----
  //
  // Кейс держит около двадцати именованных сущностей и ДВЕ несообщающиеся
  // денежные рамки. Ни одна из десяти способностей не измеряет память на имена,
  // поэтому путаница здесь — чистый шум в замере: слабая модель с кейсом в
  // контексте дословно рамки всё равно смешала, а человек читал кейс два часа
  // назад. Полный текст кнопка отдавала и раньше, но это 22 тысячи знаков —
  // чтобы вспомнить, кто такая Северова, приходилось листать.
  //
  // Только факты из кейса, без интерпретаций: подсказать «что это значит» здесь
  // нельзя — это работа участника и предмет оценки.
  // Данные — из window.imp.caseCheatsheet выше: две копии одного справочника
  // разъехались бы при первой же правке (в прошлой редакции так и вышло с блоком
  // «Деньги», который остался утечкой в одной из копий).
  var CHEATSHEET = window.imp.caseCheatsheet;

  function rows(list) {
    return list.map(function (r) {
      return '<div class="cheat-row"><b>' + r[0] + '</b><span>' + r[1] + '</span></div>';
    }).join('');
  }
  var CHEATSHEET_HTML =
    '<details class="cheat-block">' +
      '<summary>Кто есть кто</summary>' +
      '<div class="cheat-body">' +
        '<p class="cheat-h">Люди</p>' + rows(CHEATSHEET.people) +
        '<p class="cheat-h">Компании и продукты</p>' + rows(CHEATSHEET.things) +
      '</div>' +
    '</details>';

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
      '<p class="section-lead" style="margin:14px 0 4px;">Тот же пакет, что вы читали в начале дня, целиком. Только для чтения; обращения сюда никуда не пишутся.</p>' +
      CHEATSHEET_HTML +
      '<div class="case-content" id="caseRefContent"><p class="fac-detail-loading">Загружаю материалы…</p></div>' +
    '</div>';
  document.body.appendChild(panel);

  var contentEl = panel.querySelector('#caseRefContent');
  var closeBtn = panel.querySelector('#caseRefClose');
  var lastFocus = null;

  function show() {
    lastFocus = document.activeElement;
    panel.style.display = 'flex';
    panel.setAttribute('aria-hidden', 'false');
    // пока ящик открыт, прячем фолбэк-рельс (кнопки шапки остаются — см. styles.css)
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
    window.imp.loadCaseHtml()
      .then(function (html) {
        contentEl.innerHTML = html;
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

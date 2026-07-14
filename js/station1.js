// i(m)perfect — станция 1 «Вычитка и карта проблем» (кейс «Искра»).
// Полностью фронтовая заглушка: судейство против ключа (LLM-судья) не подключено —
// экран честно показывает это на финише вместо баллов.

(function () {
  var APPX_TOTAL = 8;
  var session = null;
  var state = null; // { cards, groups, rationale, appxOpened, highlights, finished, startedAt }

  function storageKey(bib) { return 'imp_station1_' + bib; }
  function htmlKey(bib) { return 'imp_station1_html_' + bib; }

  function loadSession() {
    try {
      return JSON.parse(localStorage.getItem('imp_current_session') || 'null');
    } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (!parsed.highlights) parsed.highlights = [];
        if (!parsed.appxOpened) parsed.appxOpened = {};
        if (!parsed.appxReviewed) parsed.appxReviewed = {};
        if (!parsed.connections) parsed.connections = [];
        if (!parsed.phase) parsed.phase = 'map';
        return parsed;
      }
    } catch (e) {}
    return {
      cards: [],
      groups: [],
      rationale: '',
      appxOpened: {},   // explicitly clicked open at least once
      appxReviewed: {}, // opened AND scrolled through to the end — the real "read it" signal
      highlights: [],
      connections: [],  // корневые связки (АК-2): { id, cardIds, mechanism, conclusion, isLoop }
      phase: 'map',     // 'map' (карта, кейс слева) | 'links' (фаза 2: только карточки)
      finished: false,
      startedAt: new Date().toISOString()
    };
  }

  var backendSyncTimer = null;

  function saveState() {
    localStorage.setItem(storageKey(session.bib), JSON.stringify(state));
    scheduleBackendSync();
  }

  // localStorage stays the instant, synchronous source of truth for the UI;
  // the backend sync is a best-effort background mirror for the facilitator
  // dashboard, debounced so we're not firing a request on every keystroke.
  function scheduleBackendSync() {
    if (!window.imp.isApiConfigured()) return;
    clearTimeout(backendSyncTimer);
    backendSyncTimer = setTimeout(syncStateToBackend, 3000);
  }

  function syncStateToBackend() {
    if (!window.imp.isApiConfigured()) return;
    window.imp.callApi('saveStation1', { bib: session.bib, state: state });
  }

  function saveCaseHtml() {
    localStorage.setItem(htmlKey(session.bib), document.getElementById('caseContent').innerHTML);
  }

  function uid() { return 'id_' + Math.random().toString(36).slice(2, 10); }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ---------- gate ----------

  session = loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }

  // восстановление доступа на новом устройстве: локально для этой станции пусто —
  // сначала подтягиваем реальный прогресс с бэкенда, иначе следующий же автосейв
  // затрёт его пустым стейтом (см. api.js hydrateOnce) — фоновая проверка,
  // не блокирует рендер; если найдётся реальный прогресс, страница перезагрузится сама
  window.imp.hydrateOnce('loadStation1', session.bib, storageKey(session.bib));

  document.getElementById('gate').style.display = 'none';
  document.getElementById('stationRoot').style.display = '';
  document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(3, '0');
  document.getElementById('hdrBib2').textContent = '№ ' + String(session.bib).padStart(3, '0');

  state = loadState(session.bib);

  var caseContent = document.getElementById('caseContent');

  // restore reading panel (highlights/notes survive reload)
  (function restoreCaseHtml() {
    var saved = localStorage.getItem(htmlKey(session.bib));
    if (saved) caseContent.innerHTML = saved;
  })();

  // rebuild state.highlights from marks already in the DOM if they predate this field,
  // or if a mark and its record ever drift apart
  (function reconcileHighlights() {
    var known = state.highlights.map(function (h) { return h.id; });
    caseContent.querySelectorAll('mark.hl').forEach(function (markEl) {
      var id = markEl.dataset.hlId;
      if (!id) { id = uid(); markEl.dataset.hlId = id; }
      if (known.indexOf(id) === -1) {
        var article = markEl.closest('article[id]');
        state.highlights.push({
          id: id,
          note: markEl.title || '',
          sectionId: article ? article.id : '',
          domains: domainsFor(markEl),
          snippet: markEl.textContent.slice(0, 140)
        });
        known.push(id);
      }
      // отметки восстановлены из сохранённого HTML — заново навешиваем drag,
      // ни один обработчик не переживает сериализацию в innerHTML
      attachMarkDragHandlers(markEl, id);
    });
  })();

  // ---------- intro dismiss ----------

  var introKey = 'imp_station1_intro_seen_' + session.bib;
  var introEl = document.getElementById('stationIntro');
  if (localStorage.getItem(introKey)) introEl.style.display = 'none';
  document.getElementById('dismissIntro').addEventListener('click', function () {
    introEl.style.display = 'none';
    localStorage.setItem(introKey, '1');
  });
  document.getElementById('reopenIntroBtn').addEventListener('click', function () {
    introEl.style.display = 'flex';
  });

  // ---------- appendix tracking: must be explicitly opened AND scrolled to the end ----------
  // Appendices are collapsed <details> by default. A stray scroll-past can no longer
  // "read" one for you — opening takes a click, and "изучено" only lands once the
  // sentinel at the bottom of that appendix's body has actually been seen while it's open.

  // "справка по терминам" is a glossary, not one of the 8 numbered appendices —
  // it still gets tracked and checked off in the nav, just excluded from the /8 count.
  var countableAppxIds = ['1', '2', '3', '4', '5', '6', '7', '8'];
  var trackedAppxIds = ['terms'].concat(countableAppxIds);

  var appxLinks = {};
  document.querySelectorAll('.case-nav-link[data-appx]').forEach(function (link) {
    appxLinks[link.dataset.appx] = link;
  });

  var appxDetails = {};
  trackedAppxIds.forEach(function (id) {
    var article = document.getElementById('appx-' + id);
    if (article) appxDetails[id] = article.querySelector('details.appx-doc');
  });

  function updateAppxProgress() {
    var n = countableAppxIds.filter(function (id) { return state.appxReviewed[id]; }).length;
    document.getElementById('appxProgress').textContent = n + '/' + APPX_TOTAL + ' приложений изучено';
  }

  function refreshAppxUi(id) {
    var badge = document.querySelector('.appx-doc-badge[data-badge-for="' + id + '"]');
    var link = appxLinks[id];
    if (state.appxReviewed[id]) {
      if (badge) { badge.textContent = '✓ изучено'; badge.className = 'appx-doc-badge is-reviewed'; }
      if (link) { link.classList.add('is-opened'); link.classList.remove('is-partial'); }
    } else if (state.appxOpened[id]) {
      if (badge) { badge.textContent = 'открыто · дочитайте до конца'; badge.className = 'appx-doc-badge is-opened'; }
      if (link) { link.classList.add('is-partial'); link.classList.remove('is-opened'); }
    } else {
      if (badge) { badge.textContent = 'не открыто'; badge.className = 'appx-doc-badge'; }
      if (link) { link.classList.remove('is-opened', 'is-partial'); }
    }
  }

  trackedAppxIds.forEach(refreshAppxUi);
  updateAppxProgress();

  var sentinelObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var id = entry.target.dataset.sentinelFor;
      var details = appxDetails[id];
      if (!details || !details.open || state.appxReviewed[id]) return;
      state.appxReviewed[id] = true;
      refreshAppxUi(id);
      updateAppxProgress();
      saveState();
      sentinelObserver.unobserve(entry.target);
    });
  }, { root: caseContent, threshold: 0 });

  trackedAppxIds.forEach(function (id) {
    var details = appxDetails[id];
    if (!details) return;

    if (details.open) requestAnimationFrame(function () {
      sentinelObserver.observe(document.querySelector('.appx-sentinel[data-sentinel-for="' + id + '"]'));
    });

    details.addEventListener('toggle', function () {
      if (!details.open) return;
      if (!state.appxOpened[id]) {
        state.appxOpened[id] = true;
        refreshAppxUi(id);
        saveState();
      }
      if (!state.appxReviewed[id]) {
        requestAnimationFrame(function () {
          var sentinel = document.querySelector('.appx-sentinel[data-sentinel-for="' + id + '"]');
          if (sentinel) sentinelObserver.observe(sentinel);
        });
      }
    });
  });

  // clicking a nav link for an appendix also opens it — jumping to a closed card
  // without opening it would be a dead end
  document.querySelectorAll('.case-nav-link[data-appx]').forEach(function (link) {
    link.addEventListener('click', function () {
      var details = appxDetails[link.dataset.appx];
      if (details) details.open = true;
    });
  });

  // ---------- section labels (used as anchor tokens dragged onto cards) ----------

  function articleIdFor(node) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    var article = el && el.closest ? el.closest('article[id]') : null;
    return article ? article.id : '';
  }

  // АК-1 (широта охвата внешних факторов): домен выводится из разметки самого кейса
  // (data-domain на конкретных абзацах — см. station1.html), а не из того, что участник
  // сам о себе заявляет. Так карточка не может «попасть» в домен без реальной ссылки
  // на соответствующий фрагмент текста.
  function domainsFor(node) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    var tagged = el && el.closest ? el.closest('[data-domain]') : null;
    return tagged ? tagged.getAttribute('data-domain').split(/\s+/).filter(Boolean) : [];
  }

  function shortAnchorLabel(articleId) {
    if (!articleId) return '';
    if (articleId.indexOf('appx-') === 0) {
      var key = articleId.replace('appx-', '');
      return key === 'terms' ? 'справка по терминам' : 'П' + key;
    }
    if (articleId === 'sec-intro') return 'перед чтением';
    if (articleId === 'sec-7') return 'письмо Агеева';
    if (articleId === 'sec-8') return 'задание';
    if (articleId.indexOf('sec-') === 0) return 'раздел ' + articleId.replace('sec-', '');
    return articleId;
  }

  // ---------- highlight + note: one action, optional note, click to edit/remove ----------

  var toolbar = document.getElementById('selToolbar');
  var popover = document.getElementById('hlPopover');
  var noteInput = document.getElementById('hlNoteInput');
  var activeRange = null;
  var popoverHlId = null;

  function hideToolbar() { toolbar.classList.remove('show'); activeRange = null; }
  function closePopover() { popover.classList.remove('show'); popoverHlId = null; }

  document.addEventListener('mouseup', function (e) {
    if (state.finished) return; // отметки — доказательная база АК-1, после финиша не редактируются
    if (toolbar.contains(e.target) || popover.contains(e.target)) return;
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hideToolbar(); return; }
    var range = sel.getRangeAt(0);
    if (!caseContent.contains(range.commonAncestorContainer)) { hideToolbar(); return; }
    if (range.toString().trim().length === 0) { hideToolbar(); return; }
    activeRange = range;
    var rect = range.getBoundingClientRect();
    toolbar.style.top = Math.max(8, rect.top - 46) + 'px';
    toolbar.style.left = Math.max(8, rect.left) + 'px';
    toolbar.classList.add('show');
  });

  document.addEventListener('mousedown', function (e) {
    if (popover.classList.contains('show') && !popover.contains(e.target) && !(e.target.closest && e.target.closest('mark.hl'))) {
      closePopover();
    }
  });

  window.addEventListener('scroll', function () { hideToolbar(); closePopover(); }, true);

  // Оборачивает выделение в <mark>. Возвращает МАССИВ марок (обычно один элемент).
  // range.surroundContents() бросает исключение, если выделение пересекает границу
  // блочного элемента (абзац, ячейка таблицы, <br>) — раньше это "чинилось" через
  // extractContents()+insertNode(), который в таком случае вытаскивает и переставляет
  // сами блочные элементы (целые <p>/<td>) внутрь инлайнового <mark>. Браузер не
  // умеет корректно рендерить блок внутри инлайна: ячейка таблицы съезжает, а на
  // абзацах видны только тонкие цветные полосы по краям вместо подсветки текста,
  // с "прыгающей" красной строкой — оба бага, о которых сообщил пользователь.
  // Настоящее исправление — никогда не трогать блочные элементы: оборачивать КАЖДЫЙ
  // затронутый текстовый узел в свой собственный <mark> с одним и тем же data-hl-id.
  function wrapRange(range, id) {
    try {
      var mark = document.createElement('mark');
      mark.className = 'hl';
      mark.dataset.hlId = id;
      range.surroundContents(mark);
      return [mark];
    } catch (e) {
      return wrapRangeAcrossNodes(range, id);
    }
  }

  function wrapRangeAcrossNodes(range, id) {
    var walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) {
      // пропускаем чисто-пробельные текстовые узлы (переносы строк/отступы между
      // тегами разметки) — оборачивать их в <mark> рискованно, если их родитель —
      // структурный элемент вроде <tr>, куда инлайновый элемент вставлять нельзя
      if (range.intersectsNode(n) && n.textContent.replace(/\s+/g, '').length) nodes.push(n);
    }
    var marks = [];
    nodes.forEach(function (node) {
      var start = (node === range.startContainer) ? range.startOffset : 0;
      var end = (node === range.endContainer) ? range.endOffset : node.length;
      if (start >= end) return;
      var target = node;
      if (end < target.length) target.splitText(end);
      if (start > 0) target = target.splitText(start);
      var m = document.createElement('mark');
      m.className = 'hl';
      m.dataset.hlId = id;
      target.parentNode.insertBefore(m, target);
      m.appendChild(target);
      marks.push(m);
    });
    return marks;
  }

  // Тащить можно прямо из подсветки в тексте, без похода в панель заметок —
  // заметки остаются вторым, не единственным путём. Якорь — сам выделенный
  // текст (доказательство), а не ссылка на раздел: "П1" ничего не доказывает,
  // а цитата — доказывает, что карточка реально на чём-то основана.
  function anchorTextFor(id) {
    var h = state.highlights.filter(function (x) { return x.id === id; })[0];
    return h ? '«' + h.snippet + '»' : '';
  }

  function attachMarkDragHandlers(markEl, id) {
    markEl.draggable = true;
    markEl.addEventListener('dragstart', function (ev) {
      ev.dataTransfer.setData('text/plain', anchorTextFor(id));
      ev.dataTransfer.setData('application/x-imp-highlight-id', id);
      ev.dataTransfer.effectAllowed = 'copy';
    });
  }

  function openPopover(markEl, id, currentNote) {
    popoverHlId = id;
    noteInput.value = currentNote || '';
    var rect = markEl.getBoundingClientRect();
    popover.style.top = Math.min(window.innerHeight - 160, rect.bottom + 8) + 'px';
    popover.style.left = Math.max(8, Math.min(window.innerWidth - 280, rect.left)) + 'px';
    popover.classList.add('show');
    noteInput.focus();
  }

  document.getElementById('hlBtn').addEventListener('click', function () {
    if (!activeRange) return;
    var sectionId = articleIdFor(activeRange.commonAncestorContainer);
    var domains = domainsFor(activeRange.commonAncestorContainer);
    var id = uid();
    var marks = wrapRange(activeRange, id);
    if (!marks.length) { hideToolbar(); return; }
    marks.forEach(function (m) { attachMarkDragHandlers(m, id); });
    var snippet = marks.map(function (m) { return m.textContent; }).join(' ').slice(0, 140);
    window.getSelection().removeAllRanges();
    hideToolbar();
    state.highlights.push({ id: id, note: '', sectionId: sectionId, domains: domains, snippet: snippet });
    saveState();
    saveCaseHtml();
    renderNotesList();
    openPopover(marks[0], id, '');
  });

  caseContent.addEventListener('click', function (e) {
    if (state.finished) return; // после финиша отметки только читаются, попап не открываем
    var markEl = e.target.closest ? e.target.closest('mark.hl') : null;
    if (!markEl) return;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
    var h = state.highlights.filter(function (x) { return x.id === markEl.dataset.hlId; })[0];
    openPopover(markEl, markEl.dataset.hlId, h ? h.note : (markEl.title || ''));
  });

  function removeHighlight(id) {
    // выделение могло лечь на несколько текстовых узлов (см. wrapRangeAcrossNodes) —
    // одному id может соответствовать несколько <mark>, снимаем все разом
    caseContent.querySelectorAll('mark[data-hl-id="' + id + '"]').forEach(function (markEl) {
      var parent = markEl.parentNode;
      while (markEl.firstChild) parent.insertBefore(markEl.firstChild, markEl);
      parent.removeChild(markEl);
      parent.normalize();
    });
    state.highlights = state.highlights.filter(function (x) { return x.id !== id; });
    saveState();
    saveCaseHtml();
    renderNotesList();
  }

  document.getElementById('hlSaveBtn').addEventListener('click', function () {
    if (!popoverHlId) return;
    var note = noteInput.value.trim();
    var h = state.highlights.filter(function (x) { return x.id === popoverHlId; })[0];
    if (h) h.note = note;
    caseContent.querySelectorAll('mark[data-hl-id="' + popoverHlId + '"]').forEach(function (markEl) {
      markEl.className = note ? 'hl has-note' : 'hl';
      markEl.title = note || '';
    });
    saveState();
    saveCaseHtml();
    renderNotesList();
    closePopover();
  });

  document.getElementById('hlDeleteBtn').addEventListener('click', function () {
    if (!popoverHlId) return;
    removeHighlight(popoverHlId);
    closePopover();
  });

  // ---------- вкладки «Весь текст / Мои заметки» ----------
  // Вкладка заметок — режим фокусировки: только заголовки разделов и ваши отметки,
  // без остального текста. Заменяет прежнюю выпадающую панель.

  var tabText = document.getElementById('tabText');
  var tabNotes = document.getElementById('tabNotes');
  var notesView = document.getElementById('notesView');

  function showCaseTab(which) {
    var isText = which === 'text';
    tabText.classList.toggle('is-active', isText);
    tabNotes.classList.toggle('is-active', !isText);
    caseContent.style.display = isText ? '' : 'none';
    notesView.style.display = isText ? 'none' : '';
    if (!isText) renderNotesList();
  }

  tabText.addEventListener('click', function () { showCaseTab('text'); });
  tabNotes.addEventListener('click', function () { showCaseTab('notes'); });

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function sectionTitleFor(articleId) {
    var article = document.getElementById(articleId);
    var h = article ? article.querySelector('h4') : null;
    return h ? h.textContent : shortAnchorLabel(articleId);
  }

  function buildNoteItem(h) {
    var label = shortAnchorLabel(h.sectionId);
    var item = document.createElement('div');
    item.className = 'note-item';
    item.draggable = true;
    item.innerHTML =
      '<div class="note-item-top">' +
        '<span class="note-item-label">' + escapeHtml(label) + '</span>' +
        (state.finished ? '' : '<button class="note-item-del" title="Удалить">✕</button>') +
      '</div>' +
      '<div class="note-item-snippet">«' + escapeHtml(h.snippet) + '»</div>' +
      (h.note ? '<div class="note-item-note">' + escapeHtml(h.note) + '</div>' : '') +
      '<button class="note-item-copy">скопировать якорь</button>';

    var del = item.querySelector('.note-item-del');
    if (del) del.addEventListener('click', function (ev) {
      ev.stopPropagation();
      removeHighlight(h.id);
    });
    item.querySelector('.note-item-copy').addEventListener('click', function (ev) {
      ev.stopPropagation();
      copyToClipboard(anchorTextFor(h.id));
      var btn = ev.target;
      var old = btn.textContent;
      btn.textContent = 'скопировано';
      setTimeout(function () { btn.textContent = old; }, 1200);
    });
    item.addEventListener('dragstart', function (ev) {
      ev.dataTransfer.setData('text/plain', anchorTextFor(h.id));
      ev.dataTransfer.setData('application/x-imp-highlight-id', h.id);
      ev.dataTransfer.effectAllowed = 'copy';
    });
    // клик по заметке — назад в полный текст, к самой отметке
    item.addEventListener('click', function () {
      var markEls = caseContent.querySelectorAll('mark[data-hl-id="' + h.id + '"]');
      if (!markEls.length) return;
      showCaseTab('text');
      markEls[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      markEls.forEach(function (markEl) { markEl.classList.add('flash'); });
      setTimeout(function () { markEls.forEach(function (markEl) { markEl.classList.remove('flash'); }); }, 900);
    });
    return item;
  }

  function renderNotesList() {
    document.getElementById('notesCount').textContent = state.highlights.length;
    notesView.innerHTML = '';
    if (state.highlights.length === 0) {
      notesView.innerHTML = '<div class="notes-empty">Пока нет отметок. Выделите текст во вкладке «Весь текст» и нажмите «отметить».</div>';
      return;
    }
    // группируем по разделам в порядке документа — видно, по каким разделам уже прошлись
    var order = [];
    caseContent.querySelectorAll('article[id]').forEach(function (a) { order.push(a.id); });
    var bySection = {};
    state.highlights.forEach(function (h) {
      var key = h.sectionId || '';
      if (!bySection[key]) bySection[key] = [];
      bySection[key].push(h);
    });
    Object.keys(bySection).sort(function (a, b) {
      return order.indexOf(a) - order.indexOf(b);
    }).forEach(function (secId) {
      var head = document.createElement('div');
      head.className = 'notes-view-section';
      head.textContent = sectionTitleFor(secId);
      notesView.appendChild(head);
      bySection[secId].forEach(function (h) {
        notesView.appendChild(buildNoteItem(h));
      });
    });
  }

  // ---------- groups ----------

  function renderGroups() {
    var row = document.getElementById('groupsRow');
    row.innerHTML = '';
    state.groups.forEach(function (g) {
      var chip = document.createElement('span');
      chip.className = 'group-chip';
      chip.textContent = g.name;
      if (!state.finished) {
        var del = document.createElement('button');
        del.textContent = '×';
        del.title = 'Удалить группу';
        del.addEventListener('click', function () {
          state.groups = state.groups.filter(function (x) { return x.id !== g.id; });
          state.cards.forEach(function (c) { if (c.group === g.id) c.group = ''; });
          saveState();
          renderGroups();
          renderCards();
        });
        chip.appendChild(del);
      }
      row.appendChild(chip);
    });
  }

  document.getElementById('addGroupBtn').addEventListener('click', function () {
    var name = window.prompt('Название группы (например: «стратегия», «до 1 года», «культура»):', '');
    if (!name) return;
    state.groups.push({ id: uid(), name: name.trim() });
    saveState();
    renderGroups();
    renderCards();
  });

  // ---------- cards ----------

  function groupOptionsHtml(selected) {
    var html = '<option value="">без группы</option>';
    state.groups.forEach(function (g) {
      html += '<option value="' + g.id + '"' + (g.id === selected ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>';
    });
    return html;
  }

  // Показывает участнику честно, что именно засчитывается — не балл, а факт
  // «этот якорь подтверждён реальной подсветкой», ровно то же правило игры,
  // что и так было заявлено («аргумент без якоря в тексте не засчитывается»).
  function refreshAnchorStatus(el, card) {
    var statusEl = el.querySelector('.anchor-status');
    if (!statusEl) return;
    if (card.linkedHighlightIds && card.linkedHighlightIds.length) {
      statusEl.textContent = '✓ подтверждено отметкой в тексте';
      statusEl.className = 'anchor-status is-linked';
    } else if (card.anchor) {
      statusEl.textContent = 'не подтверждено — перетащите сюда отметку из заметок';
      statusEl.className = 'anchor-status is-unlinked';
    } else {
      statusEl.textContent = '';
      statusEl.className = 'anchor-status';
    }
  }

  function renderCards() {
    var list = document.getElementById('cardsList');
    list.innerHTML = '';
    state.cards.forEach(function (card) {
      var el = document.createElement('div');
      el.className = 'card' + (state.finished ? ' is-locked' : '');
      el.innerHTML =
        '<label>Формулировка проблемы (одно предложение)</label>' +
        '<textarea rows="2" data-field="text" placeholder="например: юнит-экономика «Миры+» отрицательная пять лет подряд">' + escapeHtml(card.text) + '</textarea>' +
        '<div class="card-row">' +
          '<div><label>Якорь в материалах</label><input type="text" data-field="anchor" value="' + escapeHtml(card.anchor) + '" placeholder="перетащите сюда отметку из заметок" />' +
            '<div class="anchor-status"></div></div>' +
          '<div><label>Группа</label><select data-field="group">' + groupOptionsHtml(card.group) + '</select></div>' +
        '</div>';
      if (!state.finished) {
        var rm = document.createElement('button');
        rm.className = 'card-remove';
        rm.textContent = '✕';
        rm.title = 'Удалить';
        rm.addEventListener('click', function () {
          state.cards = state.cards.filter(function (c) { return c.id !== card.id; });
          saveState();
          renderCards();
          updateCardCount();
        });
        el.appendChild(rm);
      }
      el.querySelector('[data-field="text"]').addEventListener('input', function (e) {
        card.text = e.target.value; saveState();
      });
      refreshAnchorStatus(el, card);
      var anchorInput = el.querySelector('[data-field="anchor"]');
      anchorInput.addEventListener('input', function (e) {
        card.anchor = e.target.value; saveState();
        refreshAnchorStatus(el, card);
      });
      if (!state.finished) {
        anchorInput.addEventListener('dragover', function (e) {
          e.preventDefault();
          anchorInput.classList.add('is-drop-target');
        });
        anchorInput.addEventListener('dragleave', function () {
          anchorInput.classList.remove('is-drop-target');
        });
        anchorInput.addEventListener('drop', function (e) {
          e.preventDefault();
          anchorInput.classList.remove('is-drop-target');
          var text = e.dataTransfer.getData('text/plain');
          if (!text) return;
          card.anchor = card.anchor ? card.anchor + ' · ' + text : text;
          anchorInput.value = card.anchor;
          // домен АК-1 засчитывается только за перетащенную (реальную) отметку —
          // вписанный вручную текст якоря остаётся справочным, в охват не идёт.
          var hlId = e.dataTransfer.getData('application/x-imp-highlight-id');
          if (hlId) {
            if (!card.linkedHighlightIds) card.linkedHighlightIds = [];
            if (card.linkedHighlightIds.indexOf(hlId) === -1) card.linkedHighlightIds.push(hlId);
          }
          refreshAnchorStatus(el, card);
          saveState();
        });
      }
      el.querySelector('[data-field="group"]').addEventListener('change', function (e) {
        card.group = e.target.value; saveState();
      });
      list.appendChild(el);
    });
  }

  function updateCardCount() {
    document.getElementById('cardCount').textContent = state.cards.length + ' карточ' + pluralCards(state.cards.length);
  }

  function pluralCards(n) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'ка';
    if ([2, 3, 4].indexOf(mod10) !== -1 && [12, 13, 14].indexOf(mod100) === -1) return 'ки';
    return 'ек';
  }

  document.getElementById('addCardBtn').addEventListener('click', function () {
    state.cards.push({ id: uid(), text: '', anchor: '', group: '', linkedHighlightIds: [] });
    saveState();
    renderCards();
    updateCardCount();
    var textareas = document.querySelectorAll('#cardsList textarea');
    if (textareas.length) textareas[textareas.length - 1].focus();
  });

  document.getElementById('rationale').value = state.rationale || '';
  document.getElementById('rationale').addEventListener('input', function (e) {
    state.rationale = e.target.value; saveState();
  });

  // ---------- фаза 2: связки (АК-2) — режим фокусировки ----------

  var linksRoot = document.getElementById('linksRoot');
  // Раньше здесь был жёсткий потолок в 3 связки — не от методологии (АК-2 не
  // называет число, L5 требует "хотя бы одну" петлю/точку нестабильности) и не от
  // судьи (AK2_ESCALATION_PROMPT/computeAK2Deterministic верхней границы не знают).
  // Похоже на неотрефлексированный осколок старой станции 2 (где Агеев просил
  // "2-3 корневые проблемы" в другом, давно упразднённом скоринге). Живой лимит
  // формы участник обнаруживает так же легко, как это сделал тестовый прогон —
  // потыкав кнопку "+" — и считывает как подсказку "здесь нужно ровно 3", что и
  // есть подталкивание, которого мы стараемся избегать. Убран.

  function cardShortLabel(card) {
    var t = (card.text || '').trim();
    return t.length > 70 ? t.slice(0, 70) + '…' : (t || '(без формулировки)');
  }

  function realCards() {
    return state.cards.filter(function (c) { return c.text && c.text.trim(); });
  }

  // Оценка карточек: необязательный тег угроза/возможность; при поставленном
  // теге раскрывается необязательное поле влияния. Необязательность принципиальна —
  // обязательный тег сделал бы L1/L2 (АК-2) ненаблюдаемыми: форма думала бы за участника.
  function renderTagCards() {
    var list = document.getElementById('tagCardsList');
    list.innerHTML = '';
    realCards().forEach(function (card) {
      var el = document.createElement('div');
      el.className = 'card' + (state.finished ? ' is-locked' : '');
      var html = '<p style="margin:0 0 4px; font-size:14px; line-height:1.55;">' + escapeHtml(card.text) + '</p>';
      if (card.anchor) html += '<div class="fac-card-meta" style="margin-bottom:6px;"><span>якорь: ' + escapeHtml(card.anchor) + '</span></div>';
      html += '<div class="tag-pills">' +
        '<button class="tag-pill' + (card.tag === 'threat' ? ' is-active' : '') + '" data-tag="threat">угроза</button>' +
        '<button class="tag-pill' + (card.tag === 'opportunity' ? ' is-active' : '') + '" data-tag="opportunity">возможность</button>' +
        '</div>' +
        '<textarea class="card-influence" rows="2" placeholder="что это означает для компании — если хотите раскрыть" style="display:' + (card.tag ? '' : 'none') + ';">' + escapeHtml(card.influence || '') + '</textarea>';
      el.innerHTML = html;

      el.querySelectorAll('.tag-pill').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (state.finished) return;
          var tag = btn.getAttribute('data-tag');
          card.tag = card.tag === tag ? '' : tag; // повторный клик снимает тег
          saveState();
          renderTagCards();
        });
      });
      el.querySelector('.card-influence').addEventListener('input', function (e) {
        card.influence = e.target.value; saveState();
      });
      // замок должен переживать любую перерисовку — ставим disabled прямо здесь,
      // а не только в lockEverything(), иначе «Ещё раз посмотреть» снимает его
      if (state.finished) el.querySelectorAll('textarea, input, .tag-pill').forEach(function (x) {
        x.setAttribute('disabled', 'disabled');
      });
      list.appendChild(el);
    });
    if (!realCards().length) {
      list.innerHTML = '<p class="links-hint">Карточек с текстом нет — вернитесь к карте.</p>';
    }
  }

  // Связки: карточки выбираются кликом по чипам (не печатаются) — тот же принцип,
  // что и с доменами АК-1: нельзя сослаться на то, чего у тебя нет.
  function renderConnections() {
    var list = document.getElementById('connectionsList');
    var addBtn = document.getElementById('addConnectionBtn');
    list.innerHTML = '';
    state.connections.forEach(function (conn) {
      var el = document.createElement('div');
      el.className = 'card' + (state.finished ? ' is-locked' : '');
      var chipsHtml = realCards().map(function (card) {
        var selected = (conn.cardIds || []).indexOf(card.id) !== -1;
        return '<button class="conn-chip' + (selected ? ' is-selected' : '') + '" data-card-id="' + card.id + '">' + escapeHtml(cardShortLabel(card)) + '</button>';
      }).join('');
      el.innerHTML =
        '<label>Какие проблемы связаны — выберите из ваших карточек</label>' +
        '<div class="conn-chips">' + chipsHtml + '</div>' +
        '<label>В чём механизм: почему одно порождает другое</label>' +
        '<textarea class="conn-mechanism" rows="2">' + escapeHtml(conn.mechanism || '') + '</textarea>' +
        '<label>Что из этого следует для Агеева</label>' +
        '<textarea class="conn-conclusion" rows="2">' + escapeHtml(conn.conclusion || '') + '</textarea>' +
        '<div class="conn-loop"><input type="checkbox" id="loop_' + conn.id + '"' + (conn.isLoop ? ' checked' : '') + ' />' +
          '<label for="loop_' + conn.id + '" style="text-transform:none; letter-spacing:0; font-weight:400;">Цепочка замыкается обратно — конец усиливает (или гасит) начало</label></div>';

      if (!state.finished) {
        var rm = document.createElement('button');
        rm.className = 'card-remove';
        rm.textContent = '✕';
        rm.title = 'Убрать связку';
        rm.addEventListener('click', function () {
          state.connections = state.connections.filter(function (x) { return x.id !== conn.id; });
          saveState();
          renderConnections();
        });
        el.appendChild(rm);
      }

      el.querySelectorAll('.conn-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          if (state.finished) return;
          var id = chip.getAttribute('data-card-id');
          if (!conn.cardIds) conn.cardIds = [];
          var idx = conn.cardIds.indexOf(id);
          if (idx === -1) conn.cardIds.push(id); else conn.cardIds.splice(idx, 1);
          saveState();
          renderConnections();
        });
      });
      el.querySelector('.conn-mechanism').addEventListener('input', function (e) {
        conn.mechanism = e.target.value; saveState();
      });
      el.querySelector('.conn-conclusion').addEventListener('input', function (e) {
        conn.conclusion = e.target.value; saveState();
      });
      el.querySelector('input[type="checkbox"]').addEventListener('change', function (e) {
        conn.isLoop = e.target.checked; saveState();
      });

      if (state.finished) el.querySelectorAll('textarea, input, .conn-chip').forEach(function (x) {
        x.setAttribute('disabled', 'disabled');
      });

      list.appendChild(el);
    });
    addBtn.style.display = state.finished ? 'none' : '';
  }

  document.getElementById('addConnectionBtn').addEventListener('click', function () {
    state.connections.push({ id: uid(), cardIds: [], mechanism: '', conclusion: '', isLoop: false });
    saveState();
    renderConnections();
  });

  function showMapPhase() {
    linksRoot.style.display = 'none';
    document.getElementById('stationRoot').style.display = '';
    if (!state.finished) { state.phase = 'map'; saveState(); }
  }

  function showLinksPhase() {
    renderTagCards();
    renderConnections();
    document.getElementById('stationRoot').style.display = 'none';
    linksRoot.style.display = '';
    if (!state.finished) { state.phase = 'links'; saveState(); }
  }

  document.getElementById('backToMapBtn').addEventListener('click', showMapPhase);

  // ---------- finish ----------

  function showFinishOverlay() {
    document.getElementById('stationRoot').style.display = 'none';
    linksRoot.style.display = 'none';
    document.getElementById('finishOverlay').style.display = 'flex';
  }

  function goToLinksPhase() {
    if (state.cards.length === 0) {
      if (!window.confirm('Карта пуста — ни одной карточки. Перейти к связкам всё равно?')) return;
    }
    showLinksPhase();
  }

  function lockEverything() {
    document.getElementById('addCardBtn').style.display = 'none';
    document.getElementById('addGroupBtn').style.display = 'none';
    document.getElementById('rationale').setAttribute('readonly', 'readonly');
    document.getElementById('finishBtn').setAttribute('disabled', 'disabled');
    document.getElementById('finishBtn').textContent = 'Станция завершена';
    document.getElementById('finishBtn2').setAttribute('disabled', 'disabled');
    document.getElementById('finishBtn2').textContent = 'Станция завершена';
    document.querySelectorAll('.links-body textarea, .links-body input').forEach(function (el) {
      el.setAttribute('disabled', 'disabled');
    });
    renderGroups();
    renderCards();
    renderNotesList(); // убирает кнопки удаления отметок во вкладке заметок
  }

  function finishStation() {
    var hasTags = state.cards.some(function (c) { return c.tag; });
    if (!hasTags && state.connections.length === 0) {
      if (!window.confirm('Вы не оценили ни одной карточки и не собрали ни одной связки. Завершить станцию всё равно?')) return;
    }
    state.finished = true;
    state.finishedAt = new Date().toISOString();
    saveState();
    clearTimeout(backendSyncTimer);
    syncStateToBackend(); // finish shouldn't wait out the debounce — facilitator should see it now

    renderTagCards();
    renderConnections();
    lockEverything();
    showFinishOverlay();
  }

  document.getElementById('finishBtn').addEventListener('click', goToLinksPhase);
  document.getElementById('finishBtn2').addEventListener('click', finishStation);
  document.getElementById('finishOverlayReview').addEventListener('click', function () {
    document.getElementById('finishOverlay').style.display = 'none';
    showLinksPhase();
  });

  // ---------- init render ----------

  renderGroups();
  renderCards();
  updateCardCount();
  renderNotesList();
  saveState(); // persist any reconciled highlights right away

  if (state.finished) {
    // после перезагрузки просто восстанавливаем замок и оверлей — без повторных confirm
    renderTagCards();
    renderConnections();
    lockEverything();
    showFinishOverlay();
  } else if (state.phase === 'links') {
    showLinksPhase();
  }
})();

// i(m)perfect — станция 1 «Вычитка и карта проблем» (кейс «Искра»).
//
// Модель взаимодействия: рабочая область = ВАШИ отметки. Выделяете фрагмент в
// тексте → он появляется справа карточкой (цитата + поле «опишите проблему
// своими словами»). Так каждая проблема по построению привязана к тексту — без
// отдельного «якоря» и статуса «подтверждено». В конце — рефлексивный вопрос
// «какая из них основная». Фаза 2 — связки (АК-2). Оценка: АК-1 судит ИИ по
// тексту описаний (state.cards), АК-2 — по связкам; и то и другое считает бэкенд,
// участнику не показывается.

(function () {
  var APPX_TOTAL = 8;
  var session = null;
  var state = null;

  function storageKey(bib) { return 'imp_round1_' + bib; }
  function htmlKey(bib) { return 'imp_round1_html_' + bib; }

  function loadSession() {
    try {
      return window.imp.loadSession();
    } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (!parsed.highlights) parsed.highlights = [];
        // каждая отметка — проблема: описание своими словами + оценка (АК-2)
        parsed.highlights.forEach(function (h) {
          if (h.problem === undefined) h.problem = '';
          if (h.tag === undefined) h.tag = '';
          if (h.influence === undefined) h.influence = '';
        });
        if (!parsed.cards) parsed.cards = [];
        if (!parsed.appxOpened) parsed.appxOpened = {};
        if (!parsed.appxReviewed) parsed.appxReviewed = {};
        if (!parsed.connections) parsed.connections = [];
        if (!Array.isArray(parsed.deepProblems)) parsed.deepProblems = [];
        if (parsed.mainProblemId === undefined) parsed.mainProblemId = '';
        if (parsed.mainProblemWhy === undefined) parsed.mainProblemWhy = '';
        if (!parsed.phase) parsed.phase = 'map';
        return parsed;
      }
    } catch (e) {}
    return {
      cards: [],          // ПРОИЗВОДНОЕ от highlights (для бэкенда/связок) — см. deriveCards
      highlights: [],     // источник правды: { id, sectionId, domains, snippet, problem, tag, influence }
      connections: [],    // корневые связки (АК-2): { id, cardIds, mechanism, conclusion, isLoop }
      mainProblemId: '',  // legacy: прежний выбор «основной» проблемы, больше не спрашивается
      mainProblemWhy: '',
      deepProblems: [], // [{id, text, props:[{hlId, mechanism}]}] — формулируется участником
      appxOpened: {},
      appxReviewed: {},
      phase: 'map',       // 'map' | 'links'
      finished: false,
      startedAt: new Date().toISOString()
    };
  }

  var backendSyncTimer = null;

  function saveState() {
    deriveCards(); // state.cards всегда зеркалит описанные проблемы — их читает бэкенд и фаза связок
    localStorage.setItem(storageKey(session.bib), JSON.stringify(state));
    scheduleBackendSync();
  }

  function scheduleBackendSync() {
    if (!window.imp.isApiConfigured()) return;
    clearTimeout(backendSyncTimer);
    backendSyncTimer = setTimeout(syncStateToBackend, 3000);
  }

  function syncStateToBackend() {
    // возвращает Promise<boolean>: подтвердил ли бэкенд запись. Нужно на завершении
    // раунда — финиш-оверлей не показываем, пока ответ не принят (см. finishRoom)
    if (!window.imp.isApiConfigured()) return Promise.resolve(true);
    // name — имя из окна Агеева; бэкенд кладёт его в псевдоним (если пусто)
    return window.imp.callApiConfirmed('saveStation1', { bib: session.bib, state: state, name: session.name || '' });
  }

  function saveCaseHtml() {
    localStorage.setItem(htmlKey(session.bib), document.getElementById('caseContent').innerHTML);
  }

  function uid() { return 'id_' + Math.random().toString(36).slice(2, 10); }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  // ---------- gate ----------

  session = loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }

  // восстановление доступа на новом устройстве — см. api.js hydrateOnce
  window.imp.hydrateOnce('loadStation1', session.bib, storageKey(session.bib));

  document.getElementById('gate').style.display = 'none';
  document.getElementById('stationRoot').style.display = '';
  document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(6, '0');

  state = loadState(session.bib);

  var caseContent = document.getElementById('caseContent');

  // restore reading panel (marks survive reload)
  (function restoreCaseHtml() {
    var saved = localStorage.getItem(htmlKey(session.bib));
    if (saved) caseContent.innerHTML = saved;
  })();

  // rebuild state.highlights from marks already in the DOM if a mark and its record drift apart
  (function reconcileHighlights() {
    var known = state.highlights.map(function (h) { return h.id; });
    caseContent.querySelectorAll('mark.hl').forEach(function (markEl) {
      var id = markEl.dataset.hlId;
      if (!id) { id = uid(); markEl.dataset.hlId = id; }
      if (known.indexOf(id) === -1) {
        var article = markEl.closest('article[id]');
        state.highlights.push({
          id: id,
          sectionId: article ? article.id : '',
          domains: domainsFor(markEl),
          snippet: markEl.textContent.slice(0, 140),
          problem: '', tag: '', influence: ''
        });
        known.push(id);
      }
    });
  })();

  // ---------- intro dismiss ----------

  var introKey = 'imp_round1_intro_seen_' + session.bib;
  var introEl = document.getElementById('stationIntro');
  var introNameEl = document.getElementById('introName');
  // диегетический ввод имени (Агеев спрашивает): префилл, если имя уже есть,
  // и сохранение в сессию — им Агеев обращается к участнику дальше.
  if (introNameEl && session.name) introNameEl.value = session.name;
  // живой отклик Агеева: как только участник вписывает имя, оно тут же
  // подставляется в подтверждающую реплику под полем.
  var introNameEchoEl = document.getElementById('introNameEcho');
  function updateNameEcho() {
    if (!introNameEl || !introNameEchoEl) return;
    var nm = (introNameEl.value || '').trim();
    if (nm) {
      introNameEchoEl.innerHTML = '<b>Агеев</b>: «Приятно познакомиться, ' + escapeHtml(nm) + '. До встречи в понедельник».';
      introNameEchoEl.style.display = '';
    } else {
      introNameEchoEl.style.display = 'none';
    }
  }
  if (introNameEl) introNameEl.addEventListener('input', updateNameEcho);
  updateNameEcho();
  function persistName() {
    if (!introNameEl) return;
    var nm = (introNameEl.value || '').trim();
    if (!nm) return;
    session.name = nm;
    try {
      sessionStorage.setItem('imp_current_session', JSON.stringify(session));
      localStorage.setItem('imp_current_session', JSON.stringify(session));
    } catch (e) {}
  }
  if (localStorage.getItem(introKey)) introEl.style.display = 'none';
  document.getElementById('dismissIntro').addEventListener('click', function () {
    persistName();
    introEl.style.display = 'none';
    localStorage.setItem(introKey, '1');
  });
  document.getElementById('reopenIntroBtn').addEventListener('click', function () {
    introEl.style.display = 'flex';
  });

  // ---------- appendix tracking (открыть + долистать до конца) ----------

  // Список НЕ зашиваем: приложения меняются вместе с версией кейса (в v4 их стало
  // одиннадцать вместо восьми), и жёсткий перечень тихо оставлял новые без счётчика
  // «прочитано» — участник видел «не открыто» у уже прочитанного приложения.
  var countableAppxIds = Array.prototype.slice
    .call(document.querySelectorAll('.case-nav-link[data-appx]'))
    .map(function (a) { return a.dataset.appx; })
    .filter(function (id) { return id !== 'terms'; });
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
    // счётчик «N/8» для участника убран (давил, не мотивировал); сам факт
    // «изучено» по-прежнему трекается для кабинета фасилитатора. Если элемента нет — выходим.
    var el = document.getElementById('appxProgress');
    if (!el) return;
    var n = countableAppxIds.filter(function (id) { return state.appxReviewed[id]; }).length;
    el.textContent = n + '/' + APPX_TOTAL + ' приложений изучено';
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

  document.querySelectorAll('.case-nav-link[data-appx]').forEach(function (link) {
    link.addEventListener('click', function () {
      var details = appxDetails[link.dataset.appx];
      if (details) details.open = true;
    });
  });

  // Ссылки на приложения прямо в тексте кейса (п.10): «Пn» → кликабельная ссылка,
  // клик открывает и прокручивает к приложению. Даёт причину открыть приложение
  // в контексте, вместо давящего счётчика «0/8».
  (function wrapAppxRefs() {
    var walker = document.createTreeWalker(caseContent, NodeFilter.SHOW_TEXT, null);
    var targets = [];
    var node;
    while ((node = walker.nextNode())) {
      if (node.parentElement && node.parentElement.closest('a, mark, h4')) continue;
      if (/П[1-8](?![0-9])/.test(node.textContent)) targets.push(node);
    }
    targets.forEach(function (tn) {
      var text = tn.textContent;
      var frag = document.createDocumentFragment();
      var re = /П([1-8])(?![0-9])/g;
      var last = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var a = document.createElement('a');
        a.className = 'appx-ref';
        a.setAttribute('data-appx', m[1]);
        a.setAttribute('href', '#appx-' + m[1]);
        a.textContent = 'П' + m[1];
        frag.appendChild(a);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    });
  })();

  // возврат к ссылке, с которой ушли в приложение
  var appxReturnBtn = document.getElementById('appxReturnBtn');
  var appxReturnFrom = null;
  var appxReturnObs = null;

  function showAppxReturn(originEl) {
    appxReturnFrom = originEl;
    if (!appxReturnBtn) return;
    appxReturnBtn.style.display = '';
    if (appxReturnObs) appxReturnObs.disconnect();
    if ('IntersectionObserver' in window) {
      var hasLeft = false;
      appxReturnObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) hasLeft = true;       // ушли к приложению
          else if (hasLeft) hideAppxReturn();           // сами вернулись — прячем
        });
      }, { threshold: 0.5 });
      appxReturnObs.observe(originEl);
    }
  }
  function hideAppxReturn() {
    if (appxReturnBtn) appxReturnBtn.style.display = 'none';
    if (appxReturnObs) { appxReturnObs.disconnect(); appxReturnObs = null; }
  }
  if (appxReturnBtn) {
    appxReturnBtn.addEventListener('click', function () {
      if (!appxReturnFrom) { hideAppxReturn(); return; }
      var el = appxReturnFrom;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('appx-ref-flash');
      setTimeout(function () { el.classList.remove('appx-ref-flash'); }, 1200);
      hideAppxReturn();
    });
  }

  caseContent.addEventListener('click', function (e) {
    var ref = e.target.closest ? e.target.closest('.appx-ref') : null;
    if (!ref) return;
    e.preventDefault();
    var n = ref.getAttribute('data-appx');
    var details = appxDetails[n];
    if (details) details.open = true;
    var article = document.getElementById('appx-' + n);
    if (article) requestAnimationFrame(function () { article.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    showAppxReturn(ref);
  });

  // ---------- домены/разделы кейса ----------

  function articleIdFor(node) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    var article = el && el.closest ? el.closest('article[id]') : null;
    return article ? article.id : '';
  }

  // АК-1: домен выводится из разметки самого кейса (data-domain), не из заявления участника.
  function domainsFor(node) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    var tagged = el && el.closest ? el.closest('[data-domain]') : null;
    return tagged ? tagged.getAttribute('data-domain').split(/\s+/).filter(Boolean) : [];
  }

  // ---------- выделение фрагмента → отметка ----------

  var toolbar = document.getElementById('selToolbar');
  var activeRange = null;

  function hideToolbar() { toolbar.classList.remove('show'); activeRange = null; }

  document.addEventListener('mouseup', function (e) {
    if (state.finished) return; // после финиша отметки не добавляются
    if (toolbar.contains(e.target)) return;
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

  window.addEventListener('scroll', function () { hideToolbar(); }, true);

  // Оборачивает выделение в <mark>. Возвращает МАССИВ марок (обычно один).
  // surroundContents() бросает исключение на пересечении границ блочных элементов —
  // тогда оборачиваем каждый затронутый текстовый узел в свой <mark> с общим id.
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

  document.getElementById('hlBtn').addEventListener('click', function () {
    if (!activeRange) return;
    var sectionId = articleIdFor(activeRange.commonAncestorContainer);
    var domains = domainsFor(activeRange.commonAncestorContainer);
    var id = uid();
    var marks = wrapRange(activeRange, id);
    if (!marks.length) { hideToolbar(); return; }
    var snippet = marks.map(function (m) { return m.textContent; }).join(' ').slice(0, 140);
    window.getSelection().removeAllRanges();
    hideToolbar();
    state.highlights.push({ id: id, sectionId: sectionId, domains: domains, snippet: snippet, problem: '', tag: '', influence: '' });
    saveState();
    saveCaseHtml();
    renderProblems();
    var nc = document.querySelector('#cardsList .problem-card[data-hl-id="' + id + '"] [data-field="problem"]');
    if (nc) nc.focus();
  });

  // клик по отметке в тексте → подсветить её карточку-проблему справа
  caseContent.addEventListener('click', function (e) {
    var markEl = e.target.closest ? e.target.closest('mark.hl') : null;
    if (!markEl) return;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
    var id = markEl.dataset.hlId;
    var card = document.querySelector('#cardsList .problem-card[data-hl-id="' + id + '"]');
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.add('flash');
    setTimeout(function () { card.classList.remove('flash'); }, 900);
    var ta = card.querySelector('[data-field="problem"]');
    if (ta && !state.finished) ta.focus();
  });

  function removeHighlight(id) {
    caseContent.querySelectorAll('mark[data-hl-id="' + id + '"]').forEach(function (markEl) {
      var parent = markEl.parentNode;
      while (markEl.firstChild) parent.insertBefore(markEl.firstChild, markEl);
      parent.removeChild(markEl);
      parent.normalize();
    });
    state.highlights = state.highlights.filter(function (x) { return x.id !== id; });
    detachPropSilent(id);
    saveState();
    saveCaseHtml();
    renderProblems();
  }

  function scrollToMark(id) {
    var marks = caseContent.querySelectorAll('mark[data-hl-id="' + id + '"]');
    if (!marks.length) return;
    marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    marks.forEach(function (m) { m.classList.add('flash'); });
    setTimeout(function () { marks.forEach(function (m) { m.classList.remove('flash'); }); }, 900);
  }

  // ---------- рабочая область: проблемы = отметки ----------

  // отметки в порядке их появления в тексте — карта читается сверху вниз
  function orderedHighlights() {
    var order = [];
    caseContent.querySelectorAll('mark.hl').forEach(function (m) {
      var id = m.dataset.hlId;
      if (id && order.indexOf(id) === -1) order.push(id);
    });
    var byId = {};
    state.highlights.forEach(function (h) { byId[h.id] = h; });
    var out = [];
    order.forEach(function (id) { if (byId[id]) { out.push(byId[id]); delete byId[id]; } });
    state.highlights.forEach(function (h) { if (byId[h.id]) out.push(h); });
    return out;
  }

  function problemsWithText() {
    return orderedHighlights().filter(function (h) { return (h.problem || '').trim(); });
  }

  // state.cards — производное: то, что читает бэкенд (АК-1 по тексту) и фаза связок
  function deriveCards() {
    if (!state.highlights) { state.cards = []; return; }
    state.cards = orderedHighlights()
      .filter(function (h) { return (h.problem || '').trim(); })
      .map(function (h) {
        return { id: h.id, text: h.problem, anchor: h.snippet, tag: h.tag || '', influence: h.influence || '' };
      });
  }

  function pluralProblems(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'а';
    if ([2, 3, 4].indexOf(m10) !== -1 && [12, 13, 14].indexOf(m100) === -1) return 'ы';
    return '';
  }

  function updateProblemCount() {
    // пустой черновик «вывод без цитаты» (без цитаты и без текста) — ещё не проблема
    var n = orderedHighlights().filter(function (h) {
      return (h.snippet && h.snippet.trim()) || (h.problem && h.problem.trim());
    }).length;
    document.getElementById('cardCount').textContent = n + ' проблем' + pluralProblems(n);
  }

  // Поля в карточках растут под содержимое. При rows="2" третья строка уходила во
  // внутренний скролл — участник не видел целиком то, что сам написал, а короткая
  // цитата над полем при этом занимала больше места, чем его собственный ответ.
  function growTextarea(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    // box-sizing: border-box, а scrollHeight рамки НЕ включает — без этой поправки
    // поле остаётся ниже содержимого на толщину рамок (2×1.5px) и всё равно скроллится.
    var borders = ta.offsetHeight - ta.clientHeight;
    ta.style.height = (ta.scrollHeight + borders) + 'px';
  }

  function growCardTextareas(scope) {
    (scope || document).querySelectorAll('.card textarea').forEach(growTextarea);
  }

  // делегированно: покрывает и уже отрисованные карточки, и все будущие
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.tagName === 'TEXTAREA' && t.closest && t.closest('.card')) growTextarea(t);
  });

  // Ряд действий карточки обновляем ТОЧЕЧНО, без перерисовки списка: кнопка
  // «подпереть» должна появиться сразу, как участник описал наблюдение, а полный
  // ре-рендер на каждый ввод отнимал бы фокус прямо во время набора.
  function syncCardActions(el, h) {
    var row = el.querySelector('.card-actions');
    var usedBy = propUsedBy(h.id);
    el.classList.toggle('is-prop', !!usedBy);
    // Кнопка нужна только тому, кто взялся за главную проблему: иначе она висела
    // у каждого наблюдения и предлагала действие, которому некуда вести.
    var show = !state.finished && !!(h.problem || '').trim() && deepList().length > 0;
    if (!show) { if (row) row.remove(); return; }
    if (!row) {
      row = document.createElement('div');
      row.className = 'card-actions';
      row.style.cssText = 'display:flex; justify-content:flex-end; margin-top:6px;';
      el.appendChild(row);
    }
    var want = usedBy
      ? '<span class="prop-mark">опора ✓</span>'
      : '<button type="button" class="btn btn-ghost btn-xs" data-prop="' + h.id + '">↑ в обоснование</button>';
    if (row.innerHTML !== want) row.innerHTML = want;
  }

  function renderProblems() {
    var list = document.getElementById('cardsList');
    list.innerHTML = '';
    var hs = orderedHighlights();
    var empty = document.getElementById('problemsEmpty');
    if (empty) empty.style.display = hs.length ? 'none' : '';
    hs.forEach(function (h) {
      var el = document.createElement('div');
      el.className = 'card problem-card' + (state.finished ? ' is-locked' : '');
      el.dataset.hlId = h.id;
      var head = h.snippet
        ? '<blockquote class="problem-quote">«' + escapeHtml(h.snippet) + '»</blockquote>'
        : '<div class="problem-quote-none" style="font-size:12.5px; color:var(--muted-soft); font-style:italic; margin:0 0 6px;">вывод из прочитанного — прямой цитаты нет</div>';
      el.innerHTML =
        head +
        // Подписи у первого поля нет: плейсхолдер объясняет то же самое, а строка
        // занимала место в и без того тесной колонке.
        '<textarea rows="2" data-field="problem"' + (state.finished ? ' disabled' : '') +
          ' placeholder="в чём здесь проблема для компании — одним предложением">' + escapeHtml(h.problem || '') + '</textarea>' +
        // Пометка «угроза/возможность» убрана 2026-07-31. Ни один маркер АК-2 её не
        // использует, а методология называет ярлык сквозным дисквалификатором:
        // «ярлык („угроза“/„возможность“) — это не анализ». Техническая роль у неё
        // тоже кончилась: поле влияния раньше открывалось только после пометки,
        // теперь оно обязательное и видно сразу. Поле h.tag в записях остаётся —
        // в старых прогонах оно заполнено, и терять его незачем.
        '<label>Что это означает для компании</label>' +
        '<textarea rows="2" data-field="influence"' + (state.finished ? ' disabled' : '') +
          ' placeholder="к чему это ведёт — следствие, а не повтор проблемы другими словами">' + escapeHtml(h.influence || '') + '</textarea>';
      syncCardActions(el, h);
      if (!state.finished) {
        var rm = document.createElement('button');
        rm.className = 'card-remove';
        rm.textContent = '✕';
        rm.title = 'Убрать';
        rm.addEventListener('click', function () { removeHighlight(h.id); });
        el.appendChild(rm);
      }
      var infl = el.querySelector('[data-field="influence"]');
      infl.addEventListener('input', function (e) { h.influence = e.target.value; saveState(); updateGate(); });
      var ta = el.querySelector('[data-field="problem"]');
      ta.addEventListener('input', function (e) {
        h.problem = e.target.value; saveState(); updateGate(); updateProblemCount();
        syncCardActions(el, h);
      });
      if (h.snippet) el.querySelector('.problem-quote').addEventListener('click', function () { scrollToMark(h.id); });
      list.appendChild(el);
    });
    var addBtn = document.getElementById('addNoQuoteBtn');
    if (addBtn) addBtn.style.display = state.finished ? 'none' : '';
    growCardTextareas(list);
    updateProblemCount();
    renderDeep();
    updateGate();
  }

  // «Дальше: связки →» активна только после первой описанной проблемы (п.8):
  // до этого кнопка выглядела как «пропустить экран».
  function updateGate() {
    var btn = document.getElementById('finishBtn');
    if (!btn || state.finished) return;
    // По решению 31.07 поле «что это означает» обязательно хотя бы у одного
    // наблюдения: это первый маркер АК-2 (influenceReal), и раньше он был
    // необязательным — его почти не заполняли, отсюда часть низких оценок глубины.
    var ps = problemsWithText();
    var hasInfluence = ps.some(function (h) { return (h.influence || '').trim(); });
    var ok = ps.length > 0 && hasInfluence;
    btn.disabled = !ok;
    btn.title = ps.length === 0
      ? 'Опишите хотя бы одну проблему'
      : (hasInfluence ? '' : 'Раскройте хотя бы у одной проблемы, что это означает для компании');
  }

  // «+ проблема без прямой цитаты» (п.7): для вывода, которого в тексте нет
  // дословно (следует из ситуации) — не режет верх АК-1 (L4 «за пределами явно сказанного»).
  (function () {
    var addNoQuoteBtn = document.getElementById('addNoQuoteBtn');
    if (!addNoQuoteBtn) return;
    addNoQuoteBtn.addEventListener('click', function () {
      if (state.finished) return;
      var id = uid();
      state.highlights.push({ id: id, sectionId: '', domains: [], snippet: '', problem: '', tag: '', influence: '' });
      saveState();
      renderProblems();
      var nc = document.querySelector('#cardsList .problem-card[data-hl-id="' + id + '"] [data-field="problem"]');
      if (nc) nc.focus();
    });
  })();

  // ---------- глубинная проблема ----------
  //
  // Заменила прежний рефлексивный шаг «выберите одну из своих проблем как главную».
  // Разница принципиальная: там участник ВЫБИРАЛ из уже написанного, здесь —
  // ФОРМУЛИРУЕТ сам то, чего в его списке может не быть вовсе. Замер показал, зачем
  // это нужно: из 21 прогона на слой предпосылок вышла одна участница, и её балл
  // оказался в хвосте — оси, на которой она работала, в оценке просто не было.
  //
  // Три решения 2026-07-31, все видны здесь:
  //   * необязательна — не сформулировал, и это не штраф, а сигнал сам по себе;
  //   * их может быть несколько (в кейсе v4 зашито три);
  //   * связка засчитывается от ДВУХ опор — одна опора это не обоснование.
  //
  // Опора — наблюдение из списка ниже плюс объяснение, как одно следует из другого.
  // Это та же конструкция, что просит АК-2 (влияние → цепочка → вывод), только
  // собранная сверху вниз, без отдельного экрана и лишних механических действий.

  var MIN_PROPS = 2;

  function deepList() {
    if (!Array.isArray(state.deepProblems)) state.deepProblems = [];
    return state.deepProblems;
  }

  function propUsedBy(hlId) {
    var found = null;
    deepList().forEach(function (d) {
      (d.props || []).forEach(function (p) { if (p.hlId === hlId) found = d; });
    });
    return found;
  }

  function addDeep() {
    deepList().push({ id: uid(), text: '', props: [] });
    saveState(); renderDeep(); renderProblems();
  }

  function attachProp(hlId) {
    var list = deepList();
    if (!list.length) list.push({ id: uid(), text: '', props: [] });
    // при нескольких глубинных подпираем последнюю открытую — выбор целевой
    // проблемы делается кликом по ней (см. data-deep-target ниже)
    var target = list[list.length - 1];
    if (window.__deepTarget) {
      var t = list.filter(function (d) { return d.id === window.__deepTarget; })[0];
      if (t) target = t;
    }
    if (!target.props) target.props = [];
    if (!target.props.some(function (p) { return p.hlId === hlId; })) {
      target.props.push({ hlId: hlId, mechanism: '' });
    }
    saveState(); renderDeep(); renderProblems();
  }

  // тихий вариант: наблюдение удаляют, ре-рендер сделает вызывающий
  function detachPropSilent(hlId) {
    deepList().forEach(function (d) {
      d.props = (d.props || []).filter(function (p) { return p.hlId !== hlId; });
    });
  }

  function detachProp(hlId) {
    deepList().forEach(function (d) {
      d.props = (d.props || []).filter(function (p) { return p.hlId !== hlId; });
    });
    saveState(); renderDeep(); renderProblems();
  }

  function problemTextById(hlId) {
    var h = (state.highlights || []).filter(function (x) { return x.id === hlId; })[0];
    return h ? (h.problem || '').trim() : '';
  }

  function renderDeep() {
    var wrap = document.getElementById('deepList');
    var empty = document.getElementById('deepEmpty');
    var addBtn = document.getElementById('deepAdd');
    var chip = document.getElementById('deepChip');
    if (!wrap) return;
    var list = deepList();
    var locked = !!state.finished;

    if (empty) empty.style.display = list.length ? 'none' : '';
    if (addBtn) addBtn.style.display = (list.length && !locked) ? '' : 'none';
    var tgl = document.getElementById('deepToggle');
    if (tgl) tgl.style.display = list.length ? '' : 'none';
    if (collapsed) renderDeepSummary();

    wrap.innerHTML = '';
    list.forEach(function (d, idx) {
      var el = document.createElement('div');
      el.className = 'deep';
      el.dataset.deepId = d.id;
      var props = d.props || [];
      var left = Math.max(0, MIN_PROPS - props.length);

      el.innerHTML =
        '<textarea data-deep-text rows="3"' + (locked ? ' disabled' : '') +
          ' placeholder="одним предложением">' + escapeHtml(d.text || '') + '</textarea>' +
        '<div class="deep-sub"><span>На чём основано</span>' +
          '<span class="deep-need' + (left ? '' : ' is-ok') + '">' +
          (left ? ('нужно ещё ' + left) : 'связка собрана') + '</span></div>' +
        props.map(function (p) {
          return '<div class="deep-prop">' +
            '<div class="deep-prop-top">' +
              '<div class="deep-prop-text">' + escapeHtml(problemTextById(p.hlId) || '(наблюдение без текста)') + '</div>' +
              (locked ? '' : '<button type="button" class="btn btn-ghost btn-xs" data-unprop="' + p.hlId + '">убрать</button>') +
            '</div>' +
            '<textarea data-mech="' + p.hlId + '" rows="2"' + (locked ? ' disabled' : '') +
              ' placeholder="как одно следует из другого — механизм, а не повтор">' + escapeHtml(p.mechanism || '') + '</textarea>' +
          '</div>';
        }).join('') +
        (props.length >= MIN_PROPS || locked ? '' :
          '<div class="deep-slot">Нажмите «↑ в обоснование» у наблюдения ниже — оно встанет сюда, и вы объясните связь.</div>') +
        (locked || list.length < 2 ? '' :
          '<button type="button" class="btn btn-ghost btn-xs deep-remove" data-deep-remove="' + d.id + '">убрать</button>');

      wrap.appendChild(el);
    });

    // чип состояния: сколько связок собрано
    if (chip) {
      // «связок» в чипе больше нет: связки — соседний блок, и слово путало
      var ready = list.filter(function (d) { return (d.props || []).length >= MIN_PROPS && (d.text || '').trim(); }).length;
      chip.textContent = !list.length ? 'необязательно'
        : (ready === list.length ? 'обосновано' : 'нужно обоснование');
      chip.className = 'wchip' + (ready ? ' is-ok' : '');
    }
    growCardTextareas(wrap);
    wrap.querySelectorAll('textarea').forEach(growTextarea);
  }

  // ввод в полях глубинной
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'TEXTAREA') return;
    var deepEl = t.closest && t.closest('.deep');
    if (!deepEl) return;
    var d = deepList().filter(function (x) { return x.id === deepEl.dataset.deepId; })[0];
    if (!d) return;
    if (t.hasAttribute('data-deep-text')) { d.text = t.value; saveState(); return; }
    var mech = t.getAttribute('data-mech');
    if (mech) {
      (d.props || []).forEach(function (p) { if (p.hlId === mech) p.mechanism = t.value; });
      saveState();
    }
  });

  // клики: подпереть / убрать опору / убрать формулировку / выбрать целевую
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (t.hasAttribute('data-prop')) { attachProp(t.getAttribute('data-prop')); return; }
    if (t.hasAttribute('data-unprop')) { detachProp(t.getAttribute('data-unprop')); return; }
    if (t.hasAttribute('data-deep-remove')) {
      var rid = t.getAttribute('data-deep-remove');
      state.deepProblems = deepList().filter(function (d) { return d.id !== rid; });
      saveState(); renderDeep(); renderProblems(); return;
    }
    // клик по карточке глубинной делает её целевой для следующего «подпереть»
    var deepEl = t.closest && t.closest('.deep');
    if (deepEl) window.__deepTarget = deepEl.dataset.deepId;
  });

  // Свёрнутое состояние. Собранная главная проблема с двумя-тремя обоснованиями
  // занимает половину колонки и выдавливает наблюдения за экран — а возвращаться
  // к ним нужно постоянно. Сворачивается в строку, разворачивается одним кликом.
  var collapsed = false;

  function renderDeepSummary() {
    var sum = document.getElementById('deepSummary');
    if (!sum) return;
    var parts = deepList().map(function (d) {
      var t = (d.text || '').trim();
      return (t ? escapeHtml(t) : '<i>без формулировки</i>') +
             ' <i>· обоснований: ' + ((d.props || []).length) + '</i>';
    });
    sum.innerHTML = parts.join('<br />');
  }

  var deepToggleBtn = document.getElementById('deepToggle');
  if (deepToggleBtn) deepToggleBtn.addEventListener('click', function () {
    collapsed = !collapsed;
    document.getElementById('deepList').style.display = collapsed ? 'none' : '';
    var addB = document.getElementById('deepAdd');
    if (addB) addB.style.display = (collapsed || !deepList().length || state.finished) ? 'none' : '';
    document.getElementById('deepSummary').style.display = collapsed ? '' : 'none';
    this.textContent = collapsed ? 'развернуть' : 'свернуть';
    if (collapsed) renderDeepSummary();
  });

  var deepStartBtn = document.getElementById('deepStart');
  if (deepStartBtn) deepStartBtn.addEventListener('click', addDeep);
  var deepAddBtn = document.getElementById('deepAdd');
  if (deepAddBtn) deepAddBtn.addEventListener('click', addDeep);

  // ---------- фаза 2: связки (АК-2) ----------

  var linksRoot = document.getElementById('linksRoot');

  function cardShortLabel(h) {
    var t = (h.problem || '').trim();
    return t.length > 70 ? t.slice(0, 70) + '…' : (t || '(без описания)');
  }

  // Оценка проблем: необязательный тег угроза/возможность (+ поле влияния).
  // Необязательность принципиальна — иначе L1/L2 АК-2 стали бы ненаблюдаемыми.

  // Связки: проблемы выбираются кликом по чипам (не печатаются).
  function updateConnCount() {
    var el = document.getElementById('connCount');
    if (el) el.textContent = (state.connections || []).length;
  }

  function renderConnections() {
    updateConnCount();
    var list = document.getElementById('connectionsList');
    var addBtn = document.getElementById('addConnectionBtn');
    list.innerHTML = '';
    state.connections.forEach(function (conn) {
      var el = document.createElement('div');
      el.className = 'card' + (state.finished ? ' is-locked' : '');
      var chipsHtml = problemsWithText().map(function (h) {
        var selected = (conn.cardIds || []).indexOf(h.id) !== -1;
        return '<button class="conn-chip' + (selected ? ' is-selected' : '') + '" data-card-id="' + h.id + '">' + escapeHtml(cardShortLabel(h)) + '</button>';
      }).join('');
      el.innerHTML =
        '<label>Какие проблемы связаны — выберите из своих</label>' +
        '<div class="conn-chips">' + chipsHtml + '</div>' +
        '<label>В чём механизм: почему одно порождает другое</label>' +
        '<textarea class="conn-mechanism" rows="2">' + escapeHtml(conn.mechanism || '') + '</textarea>' +
        // поле «корневая проблема» убрано при слиянии экранов: его роль забрал
        // блок «Главная проблема» наверху рабочей области — там же и обоснование
                // Галочка «цепочка замыкается обратно» убрана (аудит 2026-07-27): судья АК-2
        // её и так игнорирует (петли ищутся в тексте механизмов), а подпись преподавала
        // понятие петли за секунду до ответа. conn.isLoop в стейте/бэкенде остаётся
        // (легаси-данные старых участников).
        '<div class="conn-note" style="font-size:12px; color:var(--muted-soft); margin:-2px 0 2px; line-height:1.45;">Решения, альтернативы и горизонт — в следующих раундах. Здесь только картина проблем.</div>';

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
      if (state.finished) el.querySelectorAll('textarea, input, .conn-chip').forEach(function (x) {
        x.setAttribute('disabled', 'disabled');
      });

      list.appendChild(el);
    });
    addBtn.style.display = state.finished ? 'none' : '';
    growCardTextareas(list);
  }

  document.getElementById('addConnectionBtn').addEventListener('click', function () {
    state.connections.push({ id: uid(), cardIds: [], mechanism: '', conclusion: '', isLoop: false });
    saveState();
    renderConnections();
  });




  // ---------- finish ----------

  function showFinishOverlay() {
    document.getElementById('stationRoot').style.display = 'none';
    linksRoot.style.display = 'none';
    document.getElementById('finishOverlay').style.display = 'flex';
  }


  function lockEverything() {
    document.getElementById('finishBtn').setAttribute('disabled', 'disabled');
    document.getElementById('finishBtn').textContent = 'Раунд завершён';
    document.querySelectorAll('#workScroll textarea, #workScroll select, #workScroll input').forEach(function (el) {
      el.setAttribute('disabled', 'disabled');
    });
    document.querySelectorAll('.links-body textarea, .links-body input').forEach(function (el) {
      el.setAttribute('disabled', 'disabled');
    });
    renderProblems();
  }

  function finishStation() {
    // связки/оценки НЕ форсируем: их отсутствие — честный низкий АК-2, а не стоп.
    // Защита от «пустого прогона» — на входе в связки (нужна ≥1 описанная проблема).
    state.finished = true;
    state.finishedAt = new Date().toISOString();
    saveState();
    clearTimeout(backendSyncTimer);

    renderConnections();
    lockEverything();
    // Финиш-оверлей ждёт подтверждения записи: раньше он показывался сразу,
    // и при сбое сети участник уходил дальше уверенным, что ответ сохранён,
    // хотя до бэкенда он не дошёл. Не дождались — оверлей всё равно покажем
    // (локально всё сохранено), но статус в полосе времени скажет «не
    // сохранено», а api.js повторит отправку сам.
    syncStateToBackend().then(showFinishOverlay, showFinishOverlay);
  }

  document.getElementById('finishBtn').addEventListener('click', finishStation);

  // ---------- init render ----------

  renderProblems();
  renderConnections();
  saveState(); // сохранить реконсиленные отметки/производные карточки сразу

  // Экрана связок больше нет (слияние 2026-07-31) — всё в одной рабочей области.
  // Сессии, начатые до слияния и остановленные на втором экране, просто открываются
  // здесь же: их наблюдения и связки на месте, терять нечего.
  if (state.finished) {
    lockEverything();
    showFinishOverlay();
  }
})();

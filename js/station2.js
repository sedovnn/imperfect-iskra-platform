// i(m)perfect — станция 2 «Приоритизация и развилка» (кейс «Искра»).
// Продолжает станцию 1: жёсткий гейт, если станция 1 не завершена. Судейство
// против ключа (LLM-судья) считается на бэкенде синхронно при завершении —
// участнику баллы не показываются здесь же, только фасилитатору в кабинете.

(function () {
  var session = null;
  var state = null; // { rootConnections, forkChoice, forkRationale, forkCriteria1, forkCriteria2, finished, startedAt }

  function storageKey(bib) { return 'imp_station2_' + bib; }
  function station1Key(bib) { return 'imp_station1_' + bib; }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem('imp_current_session') || 'null'); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (!parsed.rootConnections) parsed.rootConnections = [];
        return parsed;
      }
    } catch (e) {}
    return {
      rootConnections: [],
      forkChoice: '',
      forkRationale: '',
      forkCriteria1: '',
      forkCriteria2: '',
      finished: false,
      startedAt: new Date().toISOString()
    };
  }

  function uid() { return 'id_' + Math.random().toString(36).slice(2, 10); }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  var backendSyncTimer = null;

  function saveState() {
    localStorage.setItem(storageKey(session.bib), JSON.stringify(state));
    scheduleBackendSync();
  }

  function scheduleBackendSync() {
    if (!window.imp.isApiConfigured()) return;
    clearTimeout(backendSyncTimer);
    backendSyncTimer = setTimeout(syncStateToBackend, 3000);
  }

  function syncStateToBackend() {
    if (!window.imp.isApiConfigured()) return;
    window.imp.callApi('saveStation2', { bib: session.bib, state: state });
  }

  // ---------- gate ----------

  session = loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }

  function localStation1Finished() {
    try {
      var raw = localStorage.getItem(station1Key(session.bib));
      if (!raw) return false;
      return !!JSON.parse(raw).finished;
    } catch (e) { return false; }
  }

  function renderOwnCards(cards) {
    var list = document.getElementById('ownCardsList');
    cards = cards || [];
    if (!cards.length) {
      list.innerHTML = '<p class="fac-detail-text">Карточек пока нет — вернитесь на станцию 1.</p>';
      return;
    }
    list.innerHTML = cards.map(function (c) {
      return '<div class="fac-card"><p>' + escapeHtml(c.text || '(без формулировки)') + '</p>' +
        (c.anchor ? '<div class="fac-card-meta"><span>якорь: ' + escapeHtml(c.anchor) + '</span></div>' : '') +
        '</div>';
    }).join('');
  }

  function proceedToStation(cards) {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('gateStation1').style.display = 'none';
    document.getElementById('stationRoot').style.display = '';
    document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(3, '0');
    renderOwnCards(cards);
    initWorkspace();
  }

  function showStation1Gate() {
    document.getElementById('gateStation1').style.display = 'flex';
  }

  // источник правды — бэкенд (кросс-девайсный), локальный стейт станции 1 — фолбэк,
  // если бэкенд не настроен или недоступен (тот же принцип, что везде в этом проекте)
  if (window.imp.isApiConfigured()) {
    window.imp.callApi('loadStation1', { bib: session.bib }).then(function (res) {
      if (res && res.ok && res.state && res.state.finished) {
        proceedToStation(res.state.cards);
      } else if (res && res.ok) {
        showStation1Gate();
      } else if (localStation1Finished()) {
        proceedToStation(loadLocalStation1Cards());
      } else {
        showStation1Gate();
      }
    });
  } else if (localStation1Finished()) {
    proceedToStation(loadLocalStation1Cards());
  } else {
    showStation1Gate();
  }

  function loadLocalStation1Cards() {
    try {
      var raw = localStorage.getItem(station1Key(session.bib));
      return raw ? (JSON.parse(raw).cards || []) : [];
    } catch (e) { return []; }
  }

  // ---------- workspace (only runs once the station1 gate passes) ----------

  function initWorkspace() {
    state = loadState(session.bib);

    // ---------- intro dismiss ----------

    var introKey = 'imp_station2_intro_seen_' + session.bib;
    var introEl = document.getElementById('stationIntro');
    if (localStorage.getItem(introKey)) introEl.style.display = 'none';
    document.getElementById('dismissIntro').addEventListener('click', function () {
      introEl.style.display = 'none';
      localStorage.setItem(introKey, '1');
    });

    // ---------- root connections ----------

    var connectionsList = document.getElementById('connectionsList');
    var addConnectionBtn = document.getElementById('addConnectionBtn');
    var MAX_CONNECTIONS = 3;

    function renderConnections() {
      connectionsList.innerHTML = '';
      state.rootConnections.forEach(function (c) {
        var el = document.createElement('div');
        el.className = 'card';
        el.innerHTML =
          '<button class="card-remove" title="Убрать связку">✕</button>' +
          '<label>Какие проблемы связаны</label>' +
          '<input type="text" class="conn-problems" placeholder="например: №15, №5, №9 — или своими словами" value="' + escapeHtml(c.problems) + '" />' +
          '<label>В чём механизм — почему одно порождает другое</label>' +
          '<textarea class="conn-mechanism" rows="2">' + escapeHtml(c.mechanism) + '</textarea>';

        el.querySelector('.card-remove').addEventListener('click', function () {
          state.rootConnections = state.rootConnections.filter(function (x) { return x.id !== c.id; });
          saveState();
          renderConnections();
        });
        el.querySelector('.conn-problems').addEventListener('input', function (e) {
          c.problems = e.target.value; saveState();
        });
        el.querySelector('.conn-mechanism').addEventListener('input', function (e) {
          c.mechanism = e.target.value; saveState();
        });

        connectionsList.appendChild(el);
      });
      addConnectionBtn.style.display = state.rootConnections.length >= MAX_CONNECTIONS ? 'none' : '';
    }

    addConnectionBtn.addEventListener('click', function () {
      if (state.rootConnections.length >= MAX_CONNECTIONS) return;
      state.rootConnections.push({ id: uid(), problems: '', mechanism: '' });
      saveState();
      renderConnections();
    });

    renderConnections();

    // ---------- fork ----------

    var forkRadios = document.querySelectorAll('input[name="forkChoice"]');
    forkRadios.forEach(function (r) {
      r.checked = state.forkChoice === r.value;
      r.addEventListener('change', function () {
        if (r.checked) { state.forkChoice = r.value; saveState(); }
      });
    });

    var forkRationale = document.getElementById('forkRationale');
    forkRationale.value = state.forkRationale || '';
    forkRationale.addEventListener('input', function (e) { state.forkRationale = e.target.value; saveState(); });

    var forkCriteria1 = document.getElementById('forkCriteria1');
    forkCriteria1.value = state.forkCriteria1 || '';
    forkCriteria1.addEventListener('input', function (e) { state.forkCriteria1 = e.target.value; saveState(); });

    var forkCriteria2 = document.getElementById('forkCriteria2');
    forkCriteria2.value = state.forkCriteria2 || '';
    forkCriteria2.addEventListener('input', function (e) { state.forkCriteria2 = e.target.value; saveState(); });

    // ---------- finish ----------

    function showFinishOverlay() {
      document.getElementById('stationRoot').style.display = 'none';
      document.getElementById('finishOverlay').style.display = 'flex';
    }

    function finishStation() {
      if (state.rootConnections.length === 0 || !state.forkChoice) {
        if (!window.confirm('Связки или развилка не заполнены. Завершить станцию всё равно?')) return;
      }
      state.finished = true;
      state.finishedAt = new Date().toISOString();
      saveState();
      clearTimeout(backendSyncTimer);
      syncStateToBackend();

      document.getElementById('addConnectionBtn').style.display = 'none';
      document.querySelectorAll('#workScroll input, #workScroll textarea').forEach(function (el) {
        el.setAttribute('disabled', 'disabled');
      });
      document.querySelectorAll('#connectionsList .card-remove').forEach(function (el) {
        el.style.display = 'none';
      });
      document.getElementById('finishBtn').setAttribute('disabled', 'disabled');
      document.getElementById('finishBtn').textContent = 'Станция завершена';

      showFinishOverlay();
    }

    document.getElementById('finishBtn').addEventListener('click', finishStation);
    document.getElementById('finishOverlayReview').addEventListener('click', function () {
      document.getElementById('finishOverlay').style.display = 'none';
      document.getElementById('stationRoot').style.display = '';
    });

    if (state.finished) {
      // re-run finish rendering (locked state + overlay) after reload — same pattern as station1.js
      state.finished = false;
      finishStation();
    }
  }
})();

// i(m)perfect — станция 3 «Встреча с Агеевым» (кейс «Искра»).
// Продолжает станцию 2: жёсткий гейт, если станция 2 не завершена. Здесь нет
// балла по ходу — судейство даёт только категориальный вердикт фасилитатору
// (удержал/вернулся/сдал позицию по проблеме №15), участнику не показывается.

(function () {
  var AGEEV_LINES = [
    'Заходите, присаживайтесь. Я прочитал то, что вы прислали — карту, связки, рекомендацию. Прежде чем перейдём к делу — короткий вопрос на разогрев: что из вашей карты вы бы назвали первым, если бы у вас было тридцать секунд перед лифтом?',
    'Хорошо. По развилке я примерно понял вашу позицию. Меня смущает вот что: правление скажет, что решение можно принять и через полгода, когда будет больше данных. Зачем спешить?',
    'И раз заговорили о данных — отдельный вопрос по одному из пунктов карты. Вы написали что-то про отсутствие мониторинга рынка и конкурентов. Честно, не вижу тут проблемы: у нас одиннадцать статей на топовых конференциях в 2025-м — больше, чем у всех остальных на рынке вместе. Ресерч в курсе всего, что происходит в индустрии. Loop выйдет не раньше 2027-го — время есть. По-моему, это не корневая проблема, а частность, которую можно снять с карты.',
    'Понял вас. На сегодня достаточно — коллеги ждут вас на восьмом этаже, обсудите детали. Прежде чем вы уйдёте — что-нибудь ещё, о чём мы не поговорили?'
  ];

  var session = null;
  var state = null; // { responses: ['','','',''], finished, startedAt }

  function storageKey(bib) { return 'imp_station3_' + bib; }
  function station2Key(bib) { return 'imp_station2_' + bib; }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem('imp_current_session') || 'null'); } catch (e) { return null; }
  }

  function loadState(bib) {
    try {
      var raw = localStorage.getItem(storageKey(bib));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (!parsed.responses) parsed.responses = ['', '', '', ''];
        return parsed;
      }
    } catch (e) {}
    return {
      responses: ['', '', '', ''],
      finished: false,
      startedAt: new Date().toISOString()
    };
  }

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
    window.imp.callApi('saveStation3', { bib: session.bib, state: state });
  }

  // ---------- gate ----------

  session = loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }

  function localStation2Finished() {
    try {
      var raw = localStorage.getItem(station2Key(session.bib));
      if (!raw) return false;
      return !!JSON.parse(raw).finished;
    } catch (e) { return false; }
  }

  function proceedToStation() {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('gateStation2').style.display = 'none';
    document.getElementById('stationRoot').style.display = '';
    document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(3, '0');
    initWorkspace();
  }

  function showStation2Gate() {
    document.getElementById('gateStation2').style.display = 'flex';
  }

  if (window.imp.isApiConfigured()) {
    window.imp.callApi('loadStation2', { bib: session.bib }).then(function (res) {
      if (res && res.ok && res.state && res.state.finished) {
        proceedToStation();
      } else if (res && res.ok) {
        showStation2Gate();
      } else if (localStation2Finished()) {
        proceedToStation();
      } else {
        showStation2Gate();
      }
    });
  } else if (localStation2Finished()) {
    proceedToStation();
  } else {
    showStation2Gate();
  }

  // ---------- workspace (only runs once the station2 gate passes) ----------

  function initWorkspace() {
    state = loadState(session.bib);

    var introKey = 'imp_station3_intro_seen_' + session.bib;
    var introEl = document.getElementById('stationIntro');
    if (localStorage.getItem(introKey)) introEl.style.display = 'none';
    document.getElementById('dismissIntro').addEventListener('click', function () {
      introEl.style.display = 'none';
      localStorage.setItem(introKey, '1');
    });

    var dialogueScroll = document.getElementById('dialogueScroll');
    var finishBtn = document.getElementById('finishBtn');

    function firstUnansweredSlot() {
      for (var i = 0; i < 4; i++) {
        if (!state.responses[i]) return i;
      }
      return -1; // all answered
    }

    function renderDialogue() {
      dialogueScroll.innerHTML = '';
      var upTo = firstUnansweredSlot();
      var lastIndex = upTo === -1 ? 3 : upTo;

      for (let i = 0; i <= lastIndex; i++) {
        var turn = document.createElement('div');
        turn.className = 'card';
        turn.style.marginBottom = '14px';

        var answered = !!state.responses[i];
        var html = '<p style="margin:0 0 10px; font-size:14px; line-height:1.6;"><b>Агеев:</b> «' + escapeHtml(AGEEV_LINES[i]) + '»</p>';

        if (answered) {
          html += '<div class="fac-card-meta" style="margin-bottom:4px;"><span>ваш ответ</span></div>' +
            '<p class="fac-detail-text">' + escapeHtml(state.responses[i]) + '</p>';
        } else {
          html += '<textarea class="dialogue-response" rows="3" placeholder="Ваш ответ…"></textarea>' +
            '<button class="btn btn-primary btn-small dialogue-submit" style="margin-top:10px; margin-bottom:0;">Ответить →</button>';
        }
        turn.innerHTML = html;

        if (!answered) {
          turn.querySelector('.dialogue-submit').addEventListener('click', function () {
            var textarea = turn.querySelector('.dialogue-response');
            var value = textarea.value.trim();
            if (!value) { textarea.focus(); return; }
            state.responses[i] = value;
            saveState();
            renderDialogue();
          });
        }

        dialogueScroll.appendChild(turn);
      }

      finishBtn.style.display = upTo === -1 ? '' : 'none';
    }

    renderDialogue();

    function finishStation() {
      state.finished = true;
      state.finishedAt = new Date().toISOString();
      saveState();
      clearTimeout(backendSyncTimer);
      syncStateToBackend();

      finishBtn.setAttribute('disabled', 'disabled');
      finishBtn.textContent = 'Станция завершена';

      var summary = document.createElement('div');
      summary.className = 'finish-summary';
      summary.innerHTML =
        '<h4>Станция 3 завершена</h4>' +
        '<p style="font-size:13px; color:var(--muted); margin:0;">Разговор сохранён. Оценивает его судья-ИИ — вердикт виден только фасилитатору. Раунд 1 продолжается комнатой 4.</p>';
      dialogueScroll.appendChild(summary);
    }

    finishBtn.addEventListener('click', finishStation);

    if (state.finished) {
      // re-run finish rendering (locked state + summary) after reload — same pattern as station1/2
      state.finished = false;
      finishStation();
    }
  }
})();

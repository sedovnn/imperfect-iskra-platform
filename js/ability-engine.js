// i(m)perfect — общий движок способностей (модель Strat OS). Один файл ведёт
// участника через любую способность, описанную в js/ability-configs.js — какая
// именно, задаёт тонкая HTML-обёртка через window.ABILITY_CODE перед подключением
// этого скрипта. localStorage — источник мгновенного отклика, бэкенд — синхронизация
// в фоне, тот же принцип, что у station1/2/3.js.

(function () {
  var session = null;
  var config = null;
  var abilityCode = window.ABILITY_CODE;
  var state = null; // { stages: {}, finished, startedAt, stageIndex }
  var backendSyncTimer = null;

  function storageKey(bib, code) { return 'imp_ability_' + code + '_' + bib; }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem('imp_current_session') || 'null'); } catch (e) { return null; }
  }

  function loadState(bib, code) {
    try {
      var raw = localStorage.getItem(storageKey(bib, code));
      if (raw) {
        var parsed = JSON.parse(raw);
        if (!parsed.stages) parsed.stages = {};
        if (typeof parsed.stageIndex !== 'number') parsed.stageIndex = 0;
        return parsed;
      }
    } catch (e) {}
    return { stages: {}, finished: false, startedAt: new Date().toISOString(), stageIndex: 0 };
  }

  function saveState() {
    localStorage.setItem(storageKey(session.bib, abilityCode), JSON.stringify(state));
    scheduleBackendSync();
  }

  function scheduleBackendSync() {
    if (!window.imp.isApiConfigured()) return;
    clearTimeout(backendSyncTimer);
    backendSyncTimer = setTimeout(syncStateToBackend, 3000);
  }

  function syncStateToBackend() {
    if (!window.imp.isApiConfigured()) return;
    window.imp.callApi('saveAbility', {
      bib: session.bib,
      abilityCode: abilityCode,
      stages: state.stages,
      finished: state.finished,
      startedAt: state.startedAt
    });
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function uid() { return 'id_' + Math.random().toString(36).slice(2, 10); }

  // ---------- gate ----------

  session = loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }

  config = window.ABILITY_CONFIGS[abilityCode];
  if (!config) { return; }

  function localAbilityFinished(bib, code) {
    try {
      var raw = localStorage.getItem(storageKey(bib, code));
      if (!raw) return false;
      return !!JSON.parse(raw).finished;
    } catch (e) { return false; }
  }

  function proceedToAbility() {
    document.getElementById('gate').style.display = 'none';
    var prevGate = document.getElementById('gatePrev');
    if (prevGate) prevGate.style.display = 'none';
    document.getElementById('stationRoot').style.display = '';
    document.getElementById('hdrBib').textContent = '№ ' + String(session.bib).padStart(3, '0');
    initWorkspace();
  }

  function showPrevGate() {
    var prevGate = document.getElementById('gatePrev');
    if (prevGate) prevGate.style.display = 'flex';
  }

  if (!config.gateOn) {
    proceedToAbility();
  } else if (window.imp.isApiConfigured()) {
    window.imp.callApi('loadAbility', { bib: session.bib, abilityCode: config.gateOn }).then(function (res) {
      if (res && res.ok && res.state && res.state.finished) {
        proceedToAbility();
      } else if (res && res.ok) {
        showPrevGate();
      } else if (localAbilityFinished(session.bib, config.gateOn)) {
        proceedToAbility();
      } else {
        showPrevGate();
      }
    });
  } else if (localAbilityFinished(session.bib, config.gateOn)) {
    proceedToAbility();
  } else {
    showPrevGate();
  }

  // ---------- workspace ----------

  function initWorkspace() {
    state = loadState(session.bib, abilityCode);

    document.querySelector('.station-name').textContent = config.title;

    var introKey = 'imp_ability_intro_seen_' + abilityCode + '_' + session.bib;
    var introEl = document.getElementById('stationIntro');
    if (introEl) {
      document.querySelector('#stationIntro .kicker').textContent = config.intro.kicker;
      document.getElementById('introText').textContent = config.intro.text;
      if (localStorage.getItem(introKey)) introEl.style.display = 'none';
      document.getElementById('dismissIntro').addEventListener('click', function () {
        introEl.style.display = 'none';
        localStorage.setItem(introKey, '1');
      });
    }

    renderStage();

    document.getElementById('finishOverlayReview').addEventListener('click', function () {
      document.getElementById('finishOverlay').style.display = 'none';
      document.getElementById('stationRoot').style.display = '';
    });

    if (state.finished) {
      state.finished = false;
      finishAbility();
    }
  }

  function showFinishOverlay() {
    document.getElementById('stationRoot').style.display = 'none';
    document.getElementById('finishOverlay').style.display = 'flex';
  }

  function finishAbility() {
    state.finished = true;
    state.finishedAt = new Date().toISOString();
    saveState();
    clearTimeout(backendSyncTimer);
    syncStateToBackend();
    showFinishOverlay();
  }

  // ---------- stage rendering ----------

  var stageScroll;

  function renderStage() {
    stageScroll = document.getElementById('stageScroll');
    stageScroll.innerHTML = '';

    if (state.stageIndex >= config.stages.length) {
      finishAbility();
      return;
    }

    var stage = config.stages[state.stageIndex];
    var card = document.createElement('div');
    card.className = 'card';
    card.appendChild(renderStageBody(stage));

    var nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary btn-small';
    nextBtn.style.marginTop = '14px';
    nextBtn.style.marginBottom = '0';
    nextBtn.textContent = state.stageIndex === config.stages.length - 1 ? 'Завершить →' : 'Далее →';
    nextBtn.addEventListener('click', function () {
      if (!collectStage(stage)) return;
      saveState();
      state.stageIndex += 1;
      saveState();
      renderStage();
    });

    stageScroll.appendChild(card);
    var btnWrap = document.createElement('div');
    btnWrap.appendChild(nextBtn);
    stageScroll.appendChild(btnWrap);
  }

  function fieldValue(key) { return state.stages[key]; }
  function setFieldValue(key, value) { state.stages[key] = value; }

  function renderStageBody(stage) {
    var wrap = document.createElement('div');
    switch (stage.type) {
      case 'checklist': wrap.innerHTML = renderChecklist(stage); attachChecklist(wrap, stage); break;
      case 'freeText': wrap.innerHTML = renderFreeText(stage); break;
      case 'template': wrap.innerHTML = renderTemplate(stage); break;
      case 'stepBuilder': wrap.innerHTML = renderStepBuilderShell(stage); attachStepBuilder(wrap, stage); break;
      case 'dependencyBuilder': wrap.innerHTML = renderDependencyBuilder(stage); attachDependencyBuilder(wrap, stage); break;
      case 'singleChoiceWithText': wrap.innerHTML = renderSingleChoiceWithText(stage); break;
      case 'stressTest': wrap.innerHTML = renderStressTest(stage); break;
      default: wrap.innerHTML = '<p>Неизвестный тип стадии.</p>';
    }
    return wrap;
  }

  // ---- checklist ----
  function renderChecklist(stage) {
    var selected = fieldValue(stage.key) || [];
    var html = '<p class="kicker" style="margin-bottom:10px;">' + escapeHtml(stage.question) + '</p>';
    stage.options.forEach(function (opt) {
      html += '<label class="consent"><input type="checkbox" data-key="' + escapeHtml(opt.key) + '"' +
        (selected.indexOf(opt.key) !== -1 ? ' checked' : '') + ' /><span>' + escapeHtml(opt.label) + '</span></label>';
    });
    return html;
  }
  function attachChecklist(wrap, stage) {
    // no-op — read at collect time
  }

  // ---- freeText ----
  function renderFreeText(stage) {
    var val = fieldValue(stage.key) || '';
    return '<div class="rationale-block"><label>' + escapeHtml(stage.question) + (stage.optional ? ' <span style="text-transform:none; font-weight:400; color:var(--muted-soft);">(необязательно)</span>' : '') + '</label>' +
      '<textarea data-key="' + escapeHtml(stage.key) + '" rows="4" placeholder="' + escapeHtml(stage.placeholder || '') + '">' + escapeHtml(val) + '</textarea></div>';
  }

  // ---- template ----
  function renderTemplate(stage) {
    var html = '<p class="kicker" style="margin-bottom:10px;">' + escapeHtml(stage.question) + '</p>';
    stage.fields.forEach(function (f) {
      var val = fieldValue(f.key) || '';
      html += '<div class="rationale-block"><label>' + escapeHtml(f.label) + '</label>' +
        '<textarea data-key="' + escapeHtml(f.key) + '" rows="2" placeholder="' + escapeHtml(f.placeholder || '') + '">' + escapeHtml(val) + '</textarea></div>';
    });
    return html;
  }

  // ---- stepBuilder ----
  function renderStepBuilderShell(stage) {
    return '<p class="kicker" style="margin-bottom:10px;">' + escapeHtml(stage.question) + '</p>' +
      '<div class="cards-list" id="stepList"></div>' +
      '<button class="btn btn-ghost btn-small" id="addStepBtn" type="button">' + escapeHtml(stage.addLabel || '+ этап') + '</button>';
  }
  function attachStepBuilder(wrap, stage) {
    var listEl = wrap.querySelector('#stepList');
    var addBtn = wrap.querySelector('#addStepBtn');
    var steps = fieldValue(stage.key) || [];
    setFieldValue(stage.key, steps);

    function renderList() {
      listEl.innerHTML = '';
      steps.forEach(function (step, i) {
        var row = document.createElement('div');
        row.className = 'card';
        row.innerHTML = '<button class="card-remove" type="button" title="Убрать этап">✕</button>' +
          '<input type="text" class="step-label" placeholder="этап ' + (i + 1) + '" value="' + escapeHtml(step.label || '') + '" />';
        row.querySelector('.card-remove').addEventListener('click', function () {
          steps.splice(i, 1);
          renderList();
        });
        row.querySelector('.step-label').addEventListener('input', function (e) {
          step.label = e.target.value;
        });
        listEl.appendChild(row);
      });
      addBtn.style.display = steps.length >= (stage.maxItems || 5) ? 'none' : '';
    }

    addBtn.addEventListener('click', function () {
      if (steps.length >= (stage.maxItems || 5)) return;
      steps.push({ id: uid(), label: '' });
      renderList();
    });

    renderList();
  }

  // ---- dependencyBuilder ----
  function attachDependencyBuilder(wrap, stage) {
    // markup built in renderDependencyBuilder below using current steps snapshot;
    // change listeners attached here for the dropdown/text pairs already in the DOM
    var deps = fieldValue(stage.key) || [];
    setFieldValue(stage.key, deps);
    wrap.querySelectorAll('.dep-block').forEach(function (block, i) {
      var select = block.querySelector('.dep-reason');
      var textarea = block.querySelector('.dep-justification');
      select.addEventListener('change', function () {
        deps[i] = deps[i] || {};
        deps[i].reasonType = select.value;
        textarea.style.display = (select.value === 'resource' || select.value === 'constraint') ? '' : 'none';
      });
      textarea.addEventListener('input', function () {
        deps[i] = deps[i] || {};
        deps[i].justification = textarea.value;
      });
    });
  }
  function renderDependencyBuilder(stage) {
    var steps = (fieldValue(stage.stepsKey) || []).filter(function (s) { return s.label && s.label.trim(); });
    var deps = fieldValue(stage.key) || [];
    if (steps.length < 2) {
      return '<p class="fac-detail-text">Сначала добавьте хотя бы 2 этапа на предыдущем шаге.</p>';
    }
    var html = '<p class="kicker" style="margin-bottom:10px;">' + escapeHtml(stage.question) + '</p>';
    for (var i = 0; i < steps.length - 1; i++) {
      var d = deps[i] || {};
      html += '<div class="dep-block" style="margin-bottom:14px;">' +
        '<p class="fac-detail-text" style="margin-bottom:8px;"><b>' + escapeHtml(steps[i].label) + '</b> → <b>' + escapeHtml(steps[i + 1].label) + '</b></p>' +
        '<select class="dep-reason">' +
        '<option value="">выберите…</option>' +
        stage.reasonOptions.map(function (r) {
          return '<option value="' + escapeHtml(r.value) + '"' + (d.reasonType === r.value ? ' selected' : '') + '>' + escapeHtml(r.label) + '</option>';
        }).join('') +
        '</select>' +
        '<textarea class="dep-justification" rows="2" placeholder="почему именно так" style="display:' + ((d.reasonType === 'resource' || d.reasonType === 'constraint') ? '' : 'none') + ';">' + escapeHtml(d.justification || '') + '</textarea>' +
        '</div>';
    }
    return html;
  }

  // ---- singleChoiceWithText ----
  function renderSingleChoiceWithText(stage) {
    var selected = fieldValue(stage.key) || '';
    var html = '<p class="kicker" style="margin-bottom:10px;">' + escapeHtml(stage.question) + '</p>';
    stage.options.forEach(function (opt) {
      html += '<label class="consent"><input type="radio" name="' + escapeHtml(stage.key) + '" value="' + escapeHtml(opt.value) + '"' +
        (selected === opt.value ? ' checked' : '') + ' /><span>' + escapeHtml(opt.label) + '</span></label>';
    });
    html += '<div class="rationale-block" style="margin-top:14px;"><label>' + escapeHtml(stage.textLabel) + '</label>' +
      '<textarea data-key="' + escapeHtml(stage.textKey) + '" rows="3">' + escapeHtml(fieldValue(stage.textKey) || '') + '</textarea></div>';
    return html;
  }

  // ---- stressTest ----
  function renderStressTest(stage) {
    var selected = fieldValue(stage.choiceKey) || '';
    var html = '<blockquote class="letter" style="margin-bottom:16px;"><p>' + escapeHtml(stage.challengeText) + '</p></blockquote>';
    stage.options.forEach(function (opt) {
      html += '<label class="consent"><input type="radio" name="' + escapeHtml(stage.choiceKey) + '" value="' + escapeHtml(opt.value) + '"' +
        (selected === opt.value ? ' checked' : '') + ' /><span>' + escapeHtml(opt.label) + '</span></label>';
    });
    html += '<div class="rationale-block" style="margin-top:14px;"><label>Комментарий (необязательно)</label>' +
      '<textarea data-key="' + escapeHtml(stage.commentKey) + '" rows="2">' + escapeHtml(fieldValue(stage.commentKey) || '') + '</textarea></div>';
    return html;
  }

  // ---------- collect stage into state.stages, returns false if invalid (blocks advance) ----------

  function collectStage(stage) {
    if (stage.type === 'checklist') {
      var checked = Array.prototype.slice.call(stageScroll.querySelectorAll('input[type=checkbox][data-key]'))
        .filter(function (el) { return el.checked; }).map(function (el) { return el.getAttribute('data-key'); });
      setFieldValue(stage.key, checked);
      return true;
    }
    if (stage.type === 'freeText') {
      var ta = stageScroll.querySelector('textarea[data-key="' + stage.key + '"]');
      setFieldValue(stage.key, ta ? ta.value.trim() : '');
      return true;
    }
    if (stage.type === 'template') {
      var ok = true;
      stage.fields.forEach(function (f) {
        var el = stageScroll.querySelector('textarea[data-key="' + f.key + '"]');
        setFieldValue(f.key, el ? el.value.trim() : '');
      });
      return ok;
    }
    if (stage.type === 'stepBuilder') {
      // уже собрано в attachStepBuilder через прямые мутации массива steps
      return true;
    }
    if (stage.type === 'dependencyBuilder') {
      return true;
    }
    if (stage.type === 'singleChoiceWithText') {
      var radio = stageScroll.querySelector('input[name="' + stage.key + '"]:checked');
      if (!radio) { window.alert('Выберите один из вариантов.'); return false; }
      setFieldValue(stage.key, radio.value);
      var text = stageScroll.querySelector('textarea[data-key="' + stage.textKey + '"]');
      setFieldValue(stage.textKey, text ? text.value.trim() : '');
      return true;
    }
    if (stage.type === 'stressTest') {
      var choice = stageScroll.querySelector('input[name="' + stage.choiceKey + '"]:checked');
      if (!choice) { window.alert('Выберите один из вариантов.'); return false; }
      setFieldValue(stage.choiceKey, choice.value);
      var comment = stageScroll.querySelector('textarea[data-key="' + stage.commentKey + '"]');
      setFieldValue(stage.commentKey, comment ? comment.value.trim() : '');
      return true;
    }
    return true;
  }
})();

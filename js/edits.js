// i(m)perfect — регистратор правок («Мышление», решение встречи 2026-07-30).
//
// Зачем: гипотеза фаундеров — то, КАК человек переписывает свои мысли, ближе к
// процессу мышления, чем итоговый текст, и отличает человека от ИИ (модель не
// правит себя, она вставляет готовое). Пока это только сбор: никакой оценки,
// никакого влияния на баллы. Сначала копим, потом смотрим корреляцию с баллами
// судей; если её нет — сигнал ни о чём, и мы это узнаем дёшево.
//
// Почему модуль пассивный и полностью автономный:
//   * не трогает ни одну существующую цепочку сохранения. Логика сохранения
//     раундов уже пережила гонку с дублями строк и сериализацию очереди — лезть
//     туда ради телеметрии нельзя;
//   * ничего не требует от кода раундов: подключил тег — работает;
//   * своя ручка на бэкенде и свой лист. Сломаться может только он сам.
//
// Что пишем (агрегат, не текст ответов): сколько раз правил, сколько стёр,
// сколько вставил из буфера, когда начал и когда закончил. Сам текст здесь НЕ
// сохраняется — он и так лежит в ответах раунда, дублировать незачем.

(function () {
  window.imp = window.imp || {};

  var LS_PREFIX = 'imp_edits_';
  var SYNC_EVERY_MS = 45000;

  var fields = {};        // key → запись
  var dirty = false;
  var bib = null;
  var round = null;

  function currentBib() {
    if (bib) return bib;
    try {
      var s = JSON.parse(sessionStorage.getItem('imp_current_session') ||
                         localStorage.getItem('imp_current_session') || 'null');
      bib = s && s.bib ? String(s.bib) : null;
    } catch (e) { bib = null; }
    return bib;
  }

  // имя раунда берём из файла страницы: round1.html → round1, map.html → map
  function currentRound() {
    if (round) return round;
    var m = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    round = m || 'unknown';
    return round;
  }

  // Ключ поля: id, иначе name, иначе позиция среди однотипных. Поля, которые
  // рендерятся заново (реплики раундов пересобирают блок), сохраняют id —
  // поэтому счётчики не обнуляются при ре-рендере.
  function keyOf(el) {
    if (el.id) return el.id;
    if (el.name) return 'name:' + el.name;
    var all = document.querySelectorAll(el.tagName);
    return el.tagName.toLowerCase() + ':' + Array.prototype.indexOf.call(all, el);
  }

  function rec(el) {
    var k = keyOf(el);
    if (!fields[k]) {
      fields[k] = {
        edits: 0,          // сколько раз менялось содержимое
        typedChars: 0,     // прирост длины (набрано)
        deletedChars: 0,   // убыль длины (стёрто)
        pastes: 0,         // сколько раз вставляли из буфера
        pastedChars: 0,
        rewrites: 0,       // «переписал»: разовая потеря больше 30% текста
        maxLen: 0,
        finalLen: 0,
        firstAt: null,
        lastAt: null,
        prevLen: 0
      };
    }
    return fields[k];
  }

  function valueOf(el) {
    if (el.isContentEditable) return el.textContent || '';
    return el.value || '';
  }

  function onInput(e) {
    var el = e.target;
    if (!el || !el.matches) return;
    if (!el.matches('textarea, input[type="text"], [contenteditable="true"]')) return;
    // поля входа и пароля не трогаем — там нечего мерить, а данные чувствительные
    if (el.type === 'password' || el.id === 'entryCode' || el.id === 'facPassword') return;

    var r = rec(el);
    var len = valueOf(el).length;
    var now = Date.now();
    var delta = len - r.prevLen;

    if (r.firstAt === null) r.firstAt = now;
    r.lastAt = now;
    r.edits += 1;
    if (delta > 0) r.typedChars += delta;
    if (delta < 0) {
      var lost = -delta;
      r.deletedChars += lost;
      // разовая потеря больше трети — это не опечатка, это переписывание
      if (r.prevLen > 0 && lost / r.prevLen > 0.3) r.rewrites += 1;
    }
    r.prevLen = len;
    r.finalLen = len;
    if (len > r.maxLen) r.maxLen = len;
    dirty = true;
  }

  function onPaste(e) {
    var el = e.target;
    if (!el || !el.matches) return;
    if (!el.matches('textarea, input[type="text"], [contenteditable="true"]')) return;
    var r = rec(el);
    var text = '';
    try { text = (e.clipboardData || window.clipboardData).getData('text') || ''; } catch (err) {}
    r.pastes += 1;
    r.pastedChars += text.length;
    dirty = true;
  }

  document.addEventListener('input', onInput, true);
  document.addEventListener('paste', onPaste, true);

  // ---------- хранение ----------

  function snapshot() {
    var out = {};
    Object.keys(fields).forEach(function (k) {
      var f = fields[k];
      out[k] = {
        edits: f.edits, typed: f.typedChars, deleted: f.deletedChars,
        pastes: f.pastes, pastedChars: f.pastedChars, rewrites: f.rewrites,
        maxLen: f.maxLen, finalLen: f.finalLen,
        firstAt: f.firstAt ? new Date(f.firstAt).toISOString() : '',
        lastAt: f.lastAt ? new Date(f.lastAt).toISOString() : ''
      };
    });
    return out;
  }

  function persist() {
    var b = currentBib();
    if (!b) return null;
    var all = {};
    try { all = JSON.parse(localStorage.getItem(LS_PREFIX + b) || '{}'); } catch (e) {}
    all[currentRound()] = snapshot();
    try { localStorage.setItem(LS_PREFIX + b, JSON.stringify(all)); } catch (e) {}
    return all;
  }

  // ---------- отправка ----------
  // Отдельное действие и отдельный лист: если ручка отвалится, ответы участника
  // это не заденет. Ошибку глотаем молча — телеметрия не повод пугать человека.

  function sync() {
    if (!dirty) return;
    var b = currentBib();
    if (!b || !window.imp.callApi) return;
    dirty = false;
    persist();
    window.imp.callApi('saveEdits', {
      bib: b, round: currentRound(), edits: JSON.stringify(snapshot())
    }).catch(function () { dirty = true; });
  }

  setInterval(sync, SYNC_EVERY_MS);

  // Уход со страницы: обычный запрос браузер успевает отменить, поэтому маячок.
  window.addEventListener('pagehide', function () {
    var b = currentBib();
    if (!b || !dirty) { persist(); return; }
    persist();
    try {
      var payload = JSON.stringify({
        action: 'saveEdits', bib: b, round: currentRound(), edits: JSON.stringify(snapshot())
      });
      navigator.sendBeacon(window.imp.apiUrl(), new Blob([payload], { type: 'text/plain' }));
      dirty = false;
    } catch (e) {}
  });

  // для отладки и для будущего анализа из консоли
  window.imp.editsSnapshot = snapshot;
})();

// Кабинет ведущего (решение владельца 03.10). Своя страница и свой скрипт: ведущий создаёт
// поток, получает ссылку и QR, дальше смотрит прохождение — участники появляются сами по мере
// регистрации. Оценок, карточек и выдачи номеров здесь нет: это администратор.
//
// Права держит сервер (ACTION_ROLE в code.js): ведущему открыты v2List (только свои потоки, без
// оценок), addWave (поток записывается на него и сразу открыт по ссылке) и setWaveMeta.
// Ключ — тот же, что у прежнего кабинета (sessionStorage 'imp_cabinet_pw'), поэтому переход
// с administrator.html сюда не требует входа второй раз.
(function () {
  'use strict';
  var PW_KEY = 'imp_cabinet_pw';
  var POLL_MS = 15000;          // сервер присылать сам не умеет — спрашиваем раз в 15 секунд
  var S = window.imp.scenes;
  var ROUTE = S && S.route ? S.route() : [];
  var TIMES = [[90, '1,5 часа'], [120, '2 часа'], [150, '2,5 часа'], [180, '3 часа'], [0, 'без таймера']];

  var pw = '', data = { waves: [], participants: [], roster: [] }, pollTimer = null, openBib = {};
  var el = function (id) { return document.getElementById(id); };
  var main = el('vedMain');

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function hhmm(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function fmtMin(sec) {
    var m = Math.max(0, Math.ceil(sec / 60));
    if (m < 60) return m + ' мин';
    var h = Math.floor(m / 60), mm = m % 60;
    return h + ' ч' + (mm ? ' ' + mm + ' мин' : '');
  }
  function timeWord(min) {
    for (var i = 0; i < TIMES.length; i++) if (TIMES[i][0] === (Number(min) || 0)) return TIMES[i][1];
    return 'без таймера';
  }
  function link(w) {
    try { return new URL('index.html?w=' + encodeURIComponent(w.num), location.href).href; }
    catch (e) { return 'index.html?w=' + w.num; }
  }
  function api(action, extra) {
    var p = { password: pw };
    Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
    return window.imp.callApi(action, p);
  }
  function route() {
    var m = /^#w=([^&]+)(&new=1)?/.exec(location.hash || '');
    return m ? { wave: decodeURIComponent(m[1]), fresh: !!m[2] } : { wave: '' };
  }
  function waveById(id) { return data.waves.filter(function (w) { return String(w.id) === String(id); })[0]; }

  // ---------- вход ----------
  // ⚠ ВХОД — ЛЁГКОЙ ПРОВЕРКОЙ КЛЮЧА, КАК У АДМИНИСТРАТОРА (решение владельца 15.10). Прежде ключ проверялся загрузкой всего
  // списка участников (v2List, до 30 с): человек ждал на экране входа, пока сервер читал все листы. Теперь сначала
  // verifyPassword (роль), потом страница и «Загружаю…», а список приходит следом.
  function login(key, silent) {
    var btn = el('vedKeyBtn'), err = el('vedKeyErr');
    if (!silent) { btn.disabled = true; btn.textContent = 'Проверяю…'; }
    return window.imp.callApi('verifyPassword', { password: key }).then(function (res) {
      btn.disabled = false; btn.textContent = 'Войти →';
      if (!res || !res.ok) {
        err.textContent = !res ? 'Сервер не ответил. Нажмите «Войти» ещё раз.'
          : (res.error === 'unauthorized' ? 'Ключ не подошёл.' : 'Сервер ответил ошибкой: ' + String(res.error || ''));
        err.style.display = '';
        if (res && res.error === 'unauthorized') { try { sessionStorage.removeItem(PW_KEY); } catch (e) {} }
        return;
      }
      // Администратор — на свою страницу (решение владельца 03.10: две страницы).
      if (String(res.role) === 'full') { try { sessionStorage.setItem(PW_KEY, key); } catch (e) {} location.replace('administrator.html'); return; }
      pw = key;
      try { sessionStorage.setItem(PW_KEY, key); } catch (e) {}
      el('vedGate').style.display = 'none';
      el('vedApp').style.display = '';
      el('vedWho').textContent = 'Ведущий';
      loadFirst(0);
    });
  }
  // Первая загрузка списка — после входа; сервер после паузы отвечает долго, поэтому два повтора, затем — просьба обновить.
  function loadFirst(n) {
    var main = el('vedMain');
    if (main && !data.waves.length) main.innerHTML = '<p class="ved-dim">Загружаю потоки и участников…</p>';
    return window.imp.callApi('v2List', { password: pw }).then(function (res) {
      if (res && res.ok) { absorb(res); render(); startPoll(); return; }
      if (n < 2) return loadFirst(n + 1);
      if (main) main.innerHTML = '<p class="ved-dim">Не удалось загрузить список' + (res && res.error ? ': ' + String(res.error) : ': сервер не ответил') +
        '. Обновите страницу.</p>';
    });
  }
  function absorb(res) {
    data.waves = (res.waves || []).filter(function (w) { return !w.archived; });
    data.participants = res.participants || [];
    data.roster = res.roster || [];
    el('vedWho').textContent = 'Ведущий' + (res.actorName ? ' · ' + res.actorName : '');
  }
  function refresh() {
    return window.imp.callApi('v2List', { password: pw }).then(function (res) {
      if (res && res.ok) { absorb(res); if (route().wave && !route().fresh) renderWave(waveById(route().wave), true); }
    });
  }
  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () { if (!document.hidden && route().wave) refresh(); }, POLL_MS);
  }

  // ---------- экраны ----------
  function render() {
    var r = route();
    if (!r.wave) return renderHome();
    var w = waveById(r.wave);
    if (!w) { location.hash = ''; return; }
    if (r.fresh) return renderShare(w);
    renderWave(w);
  }

  function renderHome() {
    var mine = data.waves.slice().reverse();
    main.innerHTML =
      '<p class="ved-k">Новый поток</p><h1 class="ved-h1">Создайте поток</h1>' +
      '<form class="ved-card ved-row" id="vedNew">' +
        '<label class="ved-f"><span>Название</span><input id="vedNewName" placeholder="например, «Сбер, группа 2 — 14 октября»" required /></label>' +
        '<label class="ved-f"><span>Время на ассессмент</span><select id="vedNewTime">' +
          TIMES.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === 120 ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') +
        '</select></label>' +
        '<button class="btn btn-primary" type="submit" id="vedNewBtn">Создать поток →</button>' +
      '</form>' +
      (mine.length ? '<p class="ved-k ved-k-gap">Мои потоки</p><div class="ved-list">' + mine.map(function (w) {
        var c = counts(w);
        return '<a href="#w=' + encodeURIComponent(w.id) + '"><b>' + esc(w.name || w.num) + '</b>' +
          '<span>' + c.joined + ' ' + plural(c.joined, 'участник', 'участника', 'участников') + ' · ' + c.done + ' закончили · ' + timeWord(w.timerMin) + '</span></a>';
      }).join('') + '</div>' : '');
    el('vedNew').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (el('vedNewName').value || '').trim();
      if (!name) return;
      var btn = el('vedNewBtn'); btn.disabled = true; btn.textContent = 'Создаю…';
      api('addWave', { name: name, timerMin: el('vedNewTime').value }).then(function (res) {
        btn.disabled = false; btn.textContent = 'Создать поток →';
        if (!res || !res.ok || !res.wave) { window.imp.alert('Поток не создан: ' + ((res && (res.message || res.error)) || 'сервер не ответил') + '.'); return; }
        data.waves.push({ id: res.wave.id, num: res.wave.num, name: res.wave.name, selfEnroll: true, timerMin: res.wave.timerMin, owner: res.wave.owner });
        location.hash = '#w=' + encodeURIComponent(res.wave.id) + '&new=1';
      });
    });
  }

  function shareHtml(w) {
    return '<div class="ved-card ved-share">' +
      '<button type="button" class="ved-qr" id="vedQr" title="QR на весь экран">' + window.imp.qrSvg(link(w)) + '</button>' +
      '<div><p class="ved-k">Ссылка для участников</p>' +
        '<div class="ved-link" id="vedLink">' + esc(link(w)) + '</div>' +
        '<div class="ved-row">' +
          '<button type="button" class="btn btn-ghost" id="vedCopy">Скопировать ссылку</button>' +
          '<button type="button" class="btn btn-ghost" id="vedQrBig">QR на весь экран</button>' +
          (route().fresh ? '<a class="btn btn-primary" href="#w=' + encodeURIComponent(w.id) + '">Перейти к потоку →</a>' : '') +
        '</div>' +
        '<p class="ved-dim">Покажите QR на экране или отправьте ссылку в чат группы. Время на ассессмент — ' + timeWord(w.timerMin) + '.' +
          (w.selfEnroll === false ? ' <b>Вход по ссылке закрыт</b> — откройте его в настройках потока.' : '') + '</p>' +
      '</div></div>';
  }
  function wireShare(w) {
    var full = function () {
      el('vedQrFullImg').innerHTML = window.imp.qrSvg(link(w));
      el('vedQrFullLink').textContent = link(w);
      el('vedQrFull').style.display = 'flex';
    };
    if (el('vedQr')) el('vedQr').addEventListener('click', full);
    if (el('vedQrBig')) el('vedQrBig').addEventListener('click', full);
    if (el('vedCopy')) el('vedCopy').addEventListener('click', function () {
      var t = link(w), b = this;
      var ok = function () { b.textContent = 'Скопировано ✓'; setTimeout(function () { b.textContent = 'Скопировать ссылку'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () { window.imp.alert(t); });
      else window.imp.alert(t);
    });
  }

  function renderShare(w) {
    main.innerHTML = '<p class="ved-k">Поток создан</p><h1 class="ved-h1 no-lc">' + esc(w.name || w.num) + '</h1>' + shareHtml(w);
    wireShare(w);
  }

  // Где участник сейчас: курсор маршрута → этап; закончил; ещё не начал.
  function whereOf(p) {
    if (!p) return { cls: '', text: 'Зарегистрировался' };
    if (p.finished) return { cls: 'is-done', text: 'Закончено' };
    if (!p.started || p.cursor == null) return { cls: '', text: 'Читает инструкцию' };
    var st = ROUTE[Math.min(p.cursor, ROUTE.length - 1)];
    if (!st) return { cls: 'is-run', text: 'Проходит' };
    var n = S.stageNo(st.sceneIx), name = (S.stageShort || [])[n - 1] || st.scene.name;
    return { cls: 'is-run', text: 'Этап ' + n + ' из ' + S.stageCount() + ' · ' + name };
  }
  function leftOf(p) {
    var t = p && p.timing;
    if (!t || !t.totalMin || (p && p.finished)) return '—';
    var used = 0, now = Date.now();
    Object.keys(t.stages || {}).forEach(function (id) {
      var s = t.stages[id], a = Date.parse(s.startedAt || ''), b = s.endedAt ? Date.parse(s.endedAt) : now;
      if (!isNaN(a) && !isNaN(b)) used += Math.max(0, (b - a) / 1000);
    });
    return fmtMin(t.totalMin * 60 - used);
  }
  // Оценка в строке (решение владельца 03.10): идёт ли оценка и итог. Запускает её владелец;
  // уровней по способностям ведущему сервер не отдаёт.
  function scoreOf(p) {
    if (!p) return '<span class="ved-dim0">—</span>';
    if (p.noScore) return '<span class="ved-dim0">не оценивается</span>';
    var q = p.queue || {};
    if (q.queued || q.running) return '<span class="ved-st is-run">оценивается' + (q.total ? ' (' + (q.done || 0) + ' из ' + q.total + ')' : '') + '</span>';
    if (p.total !== null && p.total !== undefined) return '<b class="ved-total">' + esc(p.total) + '</b><span class="ved-dim0"> из 50</span>';
    // Оценён, но часть способностей ждёт ручной проверки (рубрика m-imp-k1.0, 09.10): это не «ждёт оценки». Итог —
    // предварительный, диапазоном (решение владельца 09.10); прежний бэкенд его не отдаёт — тогда только пометка.
    if (p.pendingCount) {
      var pt = p.prelimTotal;
      return pt ? '<b class="ved-total">' + esc(pt.min === pt.max ? pt.min : pt.min + '–' + pt.max) + '</b>' +
                  '<span class="ved-dim0"> из 50 · предварительно, на ручной проверке</span>'
                : '<span class="ved-dim0">на ручной проверке</span>';
    }
    if (p.finished) return '<span class="ved-dim0">ждёт оценки</span>';
    return '<span class="ved-dim0">—</span>';
  }
  // ⚠ КЛЮЧ НОМЕРА, А НЕ СТРОКА (починка 04.10). Регистрация хранит номер текстом
  // («033010»), а лист ответов — числом: Sheets срезает ведущий ноль, и прохождение
  // приходит как «33010». Строковое сравнение их не сводило: у прогонов прежних потоков
  // ведущий видел «Зарегистрировался» и прочерк вместо этапа и оценки. Правило то же,
  // что bk() в cabinet.js и bibKey_ в бэкенде: цифровой номер — по числу, буквенный —
  // без учёта регистра.
  function bk(b) {
    var s = String(b == null ? '' : b).trim().toUpperCase();
    return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
  }
  function rowsOf(w) {
    var byBib = {};
    data.participants.forEach(function (p) { byBib[bk(p.bib)] = p; });
    return data.roster.filter(function (r) { return String(r.waveId) === String(w.id); })
      .map(function (r) { return { r: r, p: byBib[bk(r.bib)] }; })
      .sort(function (a, b) { return String(a.r.registeredAt).localeCompare(String(b.r.registeredAt)); });
  }
  function counts(w) {
    var rows = rowsOf(w), c = { joined: rows.length, run: 0, done: 0 };
    rows.forEach(function (x) { if (x.p && x.p.finished) c.done++; else if (x.p && x.p.started) c.run++; });
    return c;
  }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many;
  }

  // ── Отчёты потока (14.10) ──
  // Готовый HTML — в новое окно: окно открывается сразу в обработчике нажатия, содержимое приходит потом.
  // Пока сервер собирает или читает отчёт (до минуты), новая вкладка не пустая: в ней сказано, что идёт загрузка; ошибка —
  // там же, словами (15.10: вкладка висела пустой, и было непонятно, что происходит).
  function waitPage(text, isError) {
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + (isError ? 'Отчёт не открылся' : 'Отчёт загружается…') + '</title></head>' +
      '<body style="margin:0;font-family:Georgia,serif;background:#fff;color:#181818;display:flex;min-height:100vh;align-items:center;justify-content:center">' +
      '<p style="max-width:32em;padding:24px;font-size:18px;line-height:1.5">' + String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p></body></html>';
  }
  function writeWin(w, html) { try { w.document.open(); w.document.write(html); w.document.close(); } catch (e) { /* вкладку закрыли */ } }
  function openHtml(action, payload, fail) {
    var win = window.open('', '_blank');
    if (win) writeWin(win, waitPage('Отчёт загружается — обычно это занимает до минуты.'));
    api(action, payload).then(function (res) {
      if (!win) { window.imp.alert(res && res.ok ? 'Браузер не дал открыть вкладку — разрешите всплывающие окна для этой страницы.' : fail(res)); return; }
      if (res && res.ok && res.html) { writeWin(win, res.html); return; }
      writeWin(win, waitPage(fail(res), true));
    });
  }
  var TEAM_ERR = { not_all_checked: 'проверены не все оценённые', wave_not_found: 'поток не найден',
                   forbidden_wave: 'это не ваш поток', report_not_found: 'отчёт ещё не проверен' };
  // Оценённый — у кого есть оценка; проверенный — «Проверено» по нынешней оценке. Окончательный — когда проверены все
  // оценённые (запрет держит сервер).
  function teamButtonsHtml(rows) {
    var ev = 0, ok = 0;
    rows.forEach(function (x) {
      var p = x.p;
      if (!p || !(p.judged > 0 || p.pendingCount)) return;
      ev++;
      // Проверен — отчёт собран и способностей на ручной проверке нет (14.10: «Проверено» собирает и предварительный отчёт).
      if (p.report === 'ready' && !p.pendingCount) ok++;
    });
    var fin = ev > 0 && ok === ev;
    // «Отчёты участников» одной страницей сняты 17.10 (владелец); выгрузка результатов — только администратору.
    return '<button type="button" class="btn btn-ghost btn-sm" id="vedTeamPre"' + (ev ? '' : ' disabled') +
        ' title="По нынешним оценкам; проверены ' + ok + ' из ' + ev + '">Отчёт по потоку · предварительный</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="vedTeamFin"' + (fin ? '' : ' disabled') +
        ' title="' + (fin ? 'Все оценённые проверены' : 'Откроется, когда проверены все оценённые: ' + ok + ' из ' + ev) + '">Отчёт по потоку · окончательный</button>';
  }

  var tab = 'run';
  function renderWave(w, quiet) {
    if (!w) return;
    var c = counts(w), rows = rowsOf(w);
    var head = '<p class="ved-k">Поток · ' + timeWord(w.timerMin) + '</p><h1 class="ved-h1 no-lc">' + esc(w.name || w.num) + '</h1>' +
      '<div class="ved-meta"><span class="ved-live">обновляется само</span>' +
        '<span>' + c.joined + ' вошли · ' + c.run + ' проходят · ' + c.done + ' закончили</span>' +
        '<a href="#" id="vedShowShare">ссылка и QR</a><a href="#" id="vedHome">все потоки</a></div>' +
      '<div id="vedShareBox" style="display:none;">' + shareHtml(w) + '</div>' +
      '<nav class="ved-tabs"><button type="button" data-t="run"' + (tab === 'run' ? ' class="is-on"' : '') + '>Прохождение</button>' +
        '<button type="button" data-t="set"' + (tab === 'set' ? ' class="is-on"' : '') + '>Настройки потока</button></nav>';
    var body;
    if (tab === 'run') {
      body = rows.length
        // Отчёты потока ведущему (решение владельца 03.10: отчёт доступен и ведущему по его потокам; 14.10 — отчёт по
        // потоку, предварительный и окончательный). «Проверено» ведущему не дано — только администратору (14.10).
        ? '<div class="ved-bar">' + teamButtonsHtml(rows) + '</div>' +
          '<table class="ved-table"><thead><tr><th>Участник</th><th>Где сейчас</th><th>Осталось</th><th>Вошёл</th><th>Оценка</th><th></th></tr></thead><tbody>' +
          rows.map(function (x) {
            var where = whereOf(x.p), bib = String(x.r.bib);
            return '<tr><td><button type="button" class="ved-name" data-bib="' + esc(bib) + '">' + esc(x.r.fio || 'без имени') + '</button>' +
              (openBib[bib] ? '<span class="ved-num">№ ' + esc(bib) + '</span>' : '') + '</td>' +
              '<td><span class="ved-st ' + where.cls + '">' + esc(where.text) + '</span></td>' +
              '<td>' + esc(leftOf(x.p)) + '</td><td>' + esc(hhmm(x.r.registeredAt)) + '</td>' +
              '<td>' + scoreOf(x.p) + '</td>' +
              '<td class="ved-acts"><button type="button" class="btn btn-ghost btn-xs ved-rep" data-bib="' + esc(bib) + '"' +
                (x.p && x.p.report === 'ready' ? ' title="Отчёт участника — так, как его увидит участник">'
                  : ' disabled title="Отчёт откроется, когда администратор проверит оценку («Проверено»)">') + 'Отчёт</button></td></tr>';
          }).join('') + '</tbody></table>' +
          '<p class="ved-dim">Нажмите на имя — покажется номер участника (нужен, если человек входит с другого компьютера).</p>'
        : '<p class="ved-empty">Пока никого. Участники появятся здесь сами, как только зарегистрируются по ссылке.</p>';
    } else {
      body = '<div class="ved-card ved-set">' +
        '<label class="ved-f"><span>Название</span><input id="vedSetName" value="' + esc(w.name || '') + '" /></label>' +
        '<label class="ved-f"><span>Время на ассессмент</span><select id="vedSetTime">' +
          TIMES.map(function (t) { return '<option value="' + t[0] + '"' + ((Number(w.timerMin) || 0) === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') +
        '</select><em>Меняется только у тех, кто ещё не вошёл: вошедшим время пришло при входе.</em></label>' +
        '<label class="ved-check"><input type="checkbox" id="vedSetOpen"' + (w.selfEnroll !== false ? ' checked' : '') + ' /> Вход по ссылке открыт</label>' +
        // Ответное письмо Агеева после ассессмента (решение владельца 15.10).
        '<label class="ved-check"><input type="checkbox" id="vedSetLetter"' + (w.letterOn ? ' checked' : '') + ' /> Показать участникам ответное письмо Агеева после ассессмента</label>' +
        '<label class="ved-f" id="vedSetLetterBox"' + (w.letterOn ? '' : ' style="display:none;"') + '><span>Текст письма Агеева</span>' +
          '<textarea id="vedSetLetterText" rows="8" maxlength="4000" style="width:100%;box-sizing:border-box;font:inherit;">' + esc(w.letterText || '') + '</textarea>' +
          '<em>Участник увидит письмо после «Закончить ассессмент» — белым листом, как «Введение в роль». Абзацы — через пустую строку. ' +
          '{name} в тексте заменится именем участника. Можно вписать и во время потока: текст берётся в момент окончания.</em></label>' +
        '<div class="ved-row"><button type="button" class="btn btn-primary" id="vedSetSave">Сохранить</button>' +
        '<button type="button" class="btn btn-ghost" id="vedSetArch">Убрать поток в архив</button></div></div>';
    }
    // Тихое обновление не трогает экран, где человек что-то печатает.
    if (quiet && tab === 'set') return;
    var shareOpen = el('vedShareBox') && el('vedShareBox').style.display !== 'none';
    main.innerHTML = head + body;
    if (shareOpen) el('vedShareBox').style.display = '';
    wireShare(w);
    el('vedShowShare').addEventListener('click', function (e) { e.preventDefault(); var b = el('vedShareBox'); b.style.display = b.style.display === 'none' ? '' : 'none'; });
    el('vedHome').addEventListener('click', function (e) { e.preventDefault(); location.hash = ''; });
    [].forEach.call(main.querySelectorAll('.ved-tabs button'), function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-t'); renderWave(w); });
    });
    var why = function (res) { return 'Отчёт не открылся: ' + (res ? (TEAM_ERR[res.error] || res.error || 'ошибка') : 'сервер не ответил') + '.'; };
    [].forEach.call(main.querySelectorAll('.ved-rep'), function (b) {
      b.addEventListener('click', function () { openHtml('reportGet', { bib: b.getAttribute('data-bib') }, why); });
    });
    el('vedTeamPre') && el('vedTeamPre').addEventListener('click', function () { openHtml('teamReport', { wave: w.id, variant: 'prelim' }, why); });
    el('vedTeamFin') && el('vedTeamFin').addEventListener('click', function () { openHtml('teamReport', { wave: w.id, variant: 'final' }, why); });
    [].forEach.call(main.querySelectorAll('.ved-name'), function (b) {
      b.addEventListener('click', function () { var k = b.getAttribute('data-bib'); openBib[k] = !openBib[k]; renderWave(w); });
    });
    if (tab === 'set') {
      el('vedSetLetter').addEventListener('change', function () { el('vedSetLetterBox').style.display = this.checked ? '' : 'none'; });
      el('vedSetSave').addEventListener('click', function () {
        var b = this; b.disabled = true; b.textContent = 'Сохраняю…';
        var open = el('vedSetOpen').checked, tm = Number(el('vedSetTime').value) || 0, nm = (el('vedSetName').value || '').trim();
        var lOn = el('vedSetLetter').checked, lText = el('vedSetLetterText').value || '';
        api('setWaveMeta', { id: w.id, name: nm, timerMin: tm ? String(tm) : '', selfEnroll: open ? '1' : '',
                             letterOn: lOn ? '1' : '', letterText: lText }).then(function (res) {
          b.disabled = false; b.textContent = 'Сохранить';
          if (!res || !res.ok) { window.imp.alert('Не сохранилось: ' + ((res && (res.message || res.error)) || 'сервер не ответил') + '.'); return; }
          w.name = nm; w.timerMin = tm; w.selfEnroll = open; w.letterOn = lOn; w.letterText = lText.trim();
          b.textContent = 'Сохранено ✓'; setTimeout(function () { b.textContent = 'Сохранить'; }, 1600);
        });
      });
      el('vedSetArch').addEventListener('click', function () {
        window.imp.confirm('Убрать поток «' + (w.name || w.num) + '» в архив? Участники и их ответы останутся, вход по ссылке закроется.',
          { confirmLabel: 'В архив' }).then(function (yes) {
          if (!yes) return;
          api('setWaveMeta', { id: w.id, archived: '1', selfEnroll: '' }).then(function (res) {
            if (!res || !res.ok) { window.imp.alert('Не получилось: ' + ((res && res.error) || 'сервер не ответил') + '.'); return; }
            data.waves = data.waves.filter(function (x) { return x.id !== w.id; });
            location.hash = '';
          });
        });
      });
    }
  }

  // ---------- проводка ----------
  window.addEventListener('hashchange', function () { tab = 'run'; render(); });
  el('vedQrFull').addEventListener('click', function () { el('vedQrFull').style.display = 'none'; });
  el('vedKeyBtn').addEventListener('click', function () { var k = (el('vedKey').value || '').trim(); if (k) login(k); });
  el('vedKey').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var k = (el('vedKey').value || '').trim(); if (k) login(k); } });
  // Как у администратора (js/cabinet.js, вариант Б, 19.10): после «выйти» экран входа говорит, что выход случился.
  el('vedOut').addEventListener('click', function (e) {
    e.preventDefault();
    try { sessionStorage.removeItem(PW_KEY); sessionStorage.setItem('imp_cab_out', '1'); } catch (x) {}
    location.href = 'vedushchiy.html';
  });
  try {
    if (sessionStorage.getItem('imp_cab_out')) { sessionStorage.removeItem('imp_cab_out'); el('vedOutNote').style.display = ''; }
  } catch (x) {}
  var saved = '';
  try { saved = sessionStorage.getItem(PW_KEY) || ''; } catch (e) {}
  if (saved) login(saved, true);
})();

// i(m)perfect / «Искра» — МЕХАНИКИ РАБОЧИХ ОКОН (лор v4.4.f).
//
// Зачем отдельный файл. До 05.08 в платформе была ровно одна механика — разбор
// заявок, — и она жила внутри engine.js функцией mechanicBlock на сто тридцать
// строк. Лор v4.4.f требует семи механик. Дописать их туда же значило бы получить
// движок на три тысячи строк, в котором маршрут, состояние, сохранение и семь
// разных раскладок перемешаны, — и ни одну из них нельзя проверить отдельно.
// Здесь они лежат реестром с одним контрактом, engine.js остаётся распорядителем.
//
// ЧЕМ ЭТО НЕ ЯВЛЯЕТСЯ: механика ничего не мерит. Балл считается по тексту (правило
// 1 лора). Раскладки, шкалы и слайдеры уходят судье фактами — «взял столько,
// отказал во стольк`их», — а не уровнем. Поэтому здесь нет ни одной проверки
// качества ответа, ни одной подсветки «так лучше» и ни одной реакции на длину.
//
// ЛЕКСИКА КЛАССОВ. Платформа держит классы по механике: bl- у разбора заявок.
// Эти семь делят общие первоэлементы (карточка, группа полей, счётчик нормы),
// поэтому у общих — префикс mx-, у частных — свой (mx-link-, mx-band-). Классы
// прототипа (.mech, .slot, .fan-ray, .table3) сюда НЕ переехали: прототип собирал
// свой параллельный словарь рядом с платформенным, а мы сводим к одному.
//
// КОНТРАКТ. Каждая механика — объект:
//   init(ctx)            → начальный слепок ветки состояния
//   render(host, m, ctx) → рисует тело в host; сама вешает обработчики
//   gate(m, ctx)         → '' если можно фиксировать, иначе текст «почему нельзя»
//   locked(m, ctx)       → строка-свод после фиксации (окно уже нельзя переиграть)
//   foot(m, ctx)         → { note, cta } — записка и подпись главной кнопки
// ctx даёт: esc, br, num, save, sync, redraw, BACKLOG, LIM, blNum, isDemo.
// save() — записать состояние; sync() — пересчитать гейт и включить/выключить
// кнопку; redraw() — перерисовать механику целиком.

(function () {
  window.imp = window.imp || {};

  // ── общие первоэлементы ───────────────────────────────────────────────────
  // Группа «подпись + поле». Метка data-answer="1" обязательна на всём, что
  // участник пишет своими словами: сборщик телеметрии считает ТОЛЬКО такие поля,
  // и без метки набор в этом поле не попадёт в маркер ИИ. На числовых полях
  // вилки метки нет сознательно — там не текст, а выбор внутри чужих пределов.
  function field(ctx, o) {
    var id = o.id;
    return '<label class="mx-label" for="' + id + '">' + ctx.esc(o.label) +
        (o.opt ? ' <span class="mx-opt">— необязательно</span>' : '') + '</label>' +
      (o.line
        ? '<input type="text" id="' + id + '" class="mx-input" data-answer="1"' +
          ' data-f="' + o.f + '"' + (o.i != null ? ' data-i="' + o.i + '"' : '') +
          ' placeholder="' + ctx.esc(o.ph || '') + '" value="' + ctx.esc(o.val || '') + '" />'
        : '<textarea id="' + id + '" class="mx-input" data-answer="1" rows="' + (o.rows || 3) + '"' +
          ' data-f="' + o.f + '"' + (o.i != null ? ' data-i="' + o.i + '"' : '') +
          ' placeholder="' + ctx.esc(o.ph || 'ваш ответ') + '">' + ctx.esc(o.val || '') + '</textarea>');
  }

  // Счётчик мягкой нормы. СПОКОЙНЫЙ по решению владельца 05.08: после нормы не
  // краснеет и не блокирует. Покраснение читается как «так нельзя» и продавливает
  // сильных участников, на которых норма не рассчитана, — а в живом прогоне 001347
  // именно по длинному списку из 24 карточек судья считал широту АК-1.
  function normCount(n, norm) {
    return '<span class="mx-count">' + n + ' · рекомендуем до ' + norm +
      (n > norm ? ' — глубина важнее полноты' : '') + '</span>';
  }

  function head(title, right) {
    return '<div class="mx-head"><span class="mx-title">' + title + '</span>' + (right || '') + '</div>';
  }

  var M = {};

  // ═════════════════════════════════════════════════════════════════════════
  // С1 · ТЕЗИСЫ + СВЯЗКИ. Меряет АК-1 (широта) и АК-2 (глубина связей).
  // Жёсткого лимита нет — мягкая норма. Потолок есть только у связки: 2–4
  // карточки. В прогоне участник свалил все 24 в одну связку «всё связано», и
  // причинность размылась — потолок здесь защищает признак, а не дисциплину.
  // ═════════════════════════════════════════════════════════════════════════
  var NORM = 12;
  M.theses = {
    init: function () {
      return { cards: [{ id: 1, text: '', anchor: '' }], nextId: 2, first: null, why: '', links: [], pending: [] };
    },
    gate: function (m, ctx) {
      if (ctx.isDemo) return '';
      var has = m.cards.some(function (c) { return String(c.text).trim(); });
      if (!has) return 'Напишите хотя бы один тезис — без этого дальше нельзя.';
      var f = m.cards.filter(function (c) { return c.id === m.first; })[0];
      if (!f || !String(f.text).trim()) return 'Отметьте самый тревожный симптом — без этого не продолжить.';
      return '';
    },
    foot: function () {
      return { note: 'Тезис написан и один отмечен самым тревожным. Связки — по желанию.', cta: 'Отправить Агееву →' };
    },
    locked: function (m, ctx) {
      var n = m.cards.filter(function (c) { return String(c.text).trim(); }).length;
      return '<b>' + n + '</b> ' + plural(n, 'тезис', 'тезиса', 'тезисов') +
        ' · связок: <b>' + m.links.length + '</b>' +
        ' <span class="bl-locked-hint">целиком — во вкладке «Мои ответы»</span>';
    },
    render: function (host, m, ctx) {
      var byId = function (id) { return m.cards.filter(function (x) { return x.id === id; })[0]; };
      // ── ОПОРА ТЕЗИСА: ВЫПИСКА, А НЕ ССЫЛКА СЛОВАМИ ──
      // В платформе давно есть механика отметок: выделил фрагмент в материалах —
      // забрал его в «Пометки» вместе с цитатой. Здесь стояло плоское поле «где
      // именно», в которое участник должен был ПЕРЕПЕЧАТАТЬ то, что уже отметил.
      // Теперь тезис можно опереть на саму выписку: цитата видна целиком и уезжает
      // судье как цитата, а не как «раздел 3».
      // Поле словами осталось рядом: сослаться можно и на то, что не выписывал, а
      // требовать выписку значило бы требовать пользоваться инструментом.
      // ⚠ ГРАНИЦА: сами пометки судье НЕ отдаются (решение 03.08, marksJson в
      //   вход судьи не входит). Выписка, ВЫБРАННАЯ опорой тезиса, — уже часть
      //   ответа, и она уезжает: участник сказал ею, а не просто выделил.
      var picking = {};
      // ── ПЕРЕТАСКИВАНИЕ ПОМЕТКИ НА КАРТОЧКУ ТЕЗИСА ──
      // Решение владельца 06.08. Клик-выбор («Опереть на выписку») остаётся: мышь
      // есть не у всех и не всегда, а на планшете перетаскивание вообще недоступно.
      // Здесь добавлен второй путь для того, у кого пометки уже открыты рядом:
      // тащит цитату из панели прямо на карточку.
      var dropWire = function (host2) {
        host2.querySelectorAll('.mx-card').forEach(function (card) {
          var id = Number(card.getAttribute('data-card'));
          if (!id) return;
          card.addEventListener('dragover', function (e) {
            if (!e.dataTransfer) return;
            e.preventDefault();
            card.classList.add('is-drop');
          });
          card.addEventListener('dragleave', function () { card.classList.remove('is-drop'); });
          card.addEventListener('drop', function (e) {
            card.classList.remove('is-drop');
            if (!e.dataTransfer) return;
            e.preventDefault();
            var mid = e.dataTransfer.getData('text/imp-mark');
            var quote = e.dataTransfer.getData('text/plain');
            if (!mid && !quote) return;
            var c = byId(id);
            if (!c) return;
            c.anchor = quote || '';
            c.anchorRef = mid || 'drag';
            ctx.save(); draw(); ctx.sync();
          });
        });
      };
      var anchorHtml = function (x) {
        var marks = ctx.marks ? ctx.marks() : [];
        var h = '';
        if (x.anchorRef) {
          h += '<div class="mx-anchor"><span class="mx-anchor-k">выписка из материалов</span>' +
            '<blockquote class="mark-quote">' + ctx.esc(x.anchor) + '</blockquote>' +
            '<button type="button" class="s2-act" data-anchoroff="' + x.id + '">убрать опору</button></div>';
          return h;
        }
        if (picking[x.id]) {
          h += '<div class="mx-anchor">' + (marks.length
            ? '<span class="mx-anchor-k">какая из ваших выписок</span>' + marks.map(function (mk) {
                return '<button type="button" class="mx-anchor-pick" data-anchorset="' + x.id +
                  '" data-mid="' + mk.id + '">' + ctx.esc(cut(mk.quote, 90)) + '</button>';
              }).join('')
            : '<p class="mx-hint">Выписок пока нет. Выделите фрагмент в материалах справа — появится кнопка «В пометки».</p>') +
            '<button type="button" class="s2-act" data-anchorclose="' + x.id + '">скрыть</button></div>';
        } else {
          h += '<button type="button" class="s2-act mx-anchor-open" data-anchoropen="' + x.id + '">' +
            'Опереть на выписку' + (marks.length ? ' (' + marks.length + ')' : '') + '</button>';
        }
        h += '<input type="text" class="mx-input mx-input-thin" data-answer="1" data-anchor="' + x.id + '"' +
          ' placeholder="или словами: если ссылаетесь на материалы — где именно (необязательно)" value="' +
          ctx.esc(x.anchor) + '" />';
        return h;
      };
      var draw = function () {
        var h = head('Тезисы', normCount(m.cards.length, NORM));
        m.cards.forEach(function (x, i) {
          h += '<div class="mx-card' + (m.first === x.id ? ' is-first' : '') + '" data-card="' + x.id + '">' +
            '<div class="mx-card-top"><span class="bl-n">' + (i + 1) + '</span>' +
            '<div class="mx-acts">' +
              (m.first === x.id
                // Метка-заголовок без стрелки и без глагола (лор §С1): «самым
                // тревожным →» читалось командой, а это пометка, а не переход.
                // Сама метка — КНОПКА: повторный клик её снимает, и об этом сказано
                // в title, иначе обратимость есть, но невидима.
                ? '<button type="button" class="s2-act is-on mx-flag" data-first="' + x.id +
                  '" title="Нажмите ещё раз, чтобы снять метку">Самый тревожный симптом</button>'
                : '<button type="button" class="s2-act" data-first="' + x.id + '">Самый тревожный симптом</button>') +
              (m.cards.length > 1 ? '<button type="button" class="s2-act" data-del="' + x.id + '">убрать</button>' : '') +
            '</div></div>' +
            '<textarea class="mx-input" data-answer="1" rows="3" data-text="' + x.id + '" placeholder="ваш тезис">' + ctx.esc(x.text) + '</textarea>' +
            // Подпись нейтральная (правка ревью №14): «Где в материалах это видно»
            // внушало, что легитимны только тезисы из пакета, а выход за кейс —
            // ровно граница АК-1 3→4.
            anchorHtml(x) +
            '</div>';
        });
        h += '<button type="button" class="mx-add" data-add="1">+ тезис</button>';

        var f = m.first != null && byId(m.first) ? String(byId(m.first).text).trim() : '';
        h += '<div class="mx-slot' + (f ? '' : ' is-empty') + '">' +
          '<span class="mx-title">Самый тревожный симптом</span>' +
          (f ? '<p class="mx-quote">' + ctx.br(f) + '</p>' +
               field(ctx, { id: 'mxWhy', f: 'why', label: 'Почему именно это', rows: 2, ph: 'одна фраза', val: m.why })
             : '<p class="mx-hint">Пока пусто. Отметьте один — без этого не продолжить.</p>') +
          '</div>';

        h += head('Свяжите карточки, где одно тянет другое', '<span class="mx-count">связок: ' + m.links.length + '</span>');
        m.links.forEach(function (lk, li) {
          var refs = lk.ids.map(function (id) {
            var x = byId(id); return x ? '«' + ctx.esc(cut(x.text, 40)) + '»' : '';
          }).filter(Boolean).join(' + ');
          h += '<div class="mx-link"><div class="mx-card-top"><span class="mx-link-n">Связка ' + (li + 1) + '</span>' +
            '<div class="mx-acts"><button type="button" class="s2-act" data-linkdel="' + li + '">убрать</button></div></div>' +
            '<p class="mx-link-refs">' + refs + '</p>' +
            // Пример на буквах и в ДВА звена (правка ревью №8): трёхзвенный
            // «A→B→C» рисовал форму верха АК-2 — многозвенная цепочка обязана
            // прийти сама, а не быть подсказана плейсхолдером.
            field(ctx, { id: 'mxLw' + li, f: 'lwhy', i: li, label: 'Что из чего вытекает', rows: 2, ph: 'например: A усиливает B', val: lk.why }) +
            field(ctx, { id: 'mxLc' + li, f: 'lconc', i: li, label: 'Что из этого следует для Агеева', rows: 2, val: lk.conclusion }) +
            '</div>';
        });
        if (m.cards.length >= 2) {
          h += '<p class="mx-hint">Отметьте от 2 до 4 карточек для новой связки</p>';
          m.cards.forEach(function (x) {
            if (!String(x.text).trim()) return;
            h += '<label class="mx-pick"><input type="checkbox" data-pick="' + x.id + '"' +
              (m.pending.indexOf(x.id) >= 0 ? ' checked' : '') + ' />' +
              '<span>' + ctx.esc(cut(x.text, 70)) + '</span></label>';
          });
          var bad = m.pending.length < 2 || m.pending.length > 4;
          h += '<button type="button" class="mx-add" data-linkadd="1"' + (bad ? ' disabled' : '') + '>' +
            'Создать связь из выбранных (' + m.pending.length + ')' + (bad ? ' — нужно 2–4' : '') + '</button>';
        }
        host.innerHTML = h;

        dropWire(host);
        host.querySelectorAll('[data-text]').forEach(function (ta) {
          ta.addEventListener('input', function () { byId(Number(ta.dataset.text)).text = ta.value; ctx.save(); ctx.sync(); });
        });
        host.querySelectorAll('[data-anchor]').forEach(function (i2) {
          i2.addEventListener('input', function () { byId(Number(i2.dataset.anchor)).anchor = i2.value; ctx.save(); });
        });
        var w = host.querySelector('#mxWhy');
        if (w) w.addEventListener('input', function () { m.why = w.value; ctx.save(); });
        // Селектор ровно такой, какой выдаёт field(): data-f="…" + data-i="…".
        // Было [data-lwhy] — атрибута с таким именем field() не ставит, поэтому
        // оба поля связки не подключались вовсе и текст в них терялся при
        // перерисовке. Поймано стендом.
        host.querySelectorAll('[data-f="lwhy"]').forEach(function (ta) {
          ta.addEventListener('input', function () { m.links[Number(ta.dataset.i)].why = ta.value; ctx.save(); });
        });
        host.querySelectorAll('[data-f="lconc"]').forEach(function (ta) {
          ta.addEventListener('input', function () { m.links[Number(ta.dataset.i)].conclusion = ta.value; ctx.save(); });
        });
        host.querySelectorAll('[data-pick]').forEach(function (chk) {
          chk.addEventListener('change', function () {
            var id = Number(chk.dataset.pick);
            if (chk.checked) { if (m.pending.length < 4) m.pending.push(id); else chk.checked = false; }
            else m.pending = m.pending.filter(function (p) { return p !== id; });
            ctx.save(); draw();
          });
        });
      };
      // ⚠ ДЕЛЕГИРОВАННЫЙ КЛИК ВЕШАЕТСЯ ОДИН РАЗ, СНАРУЖИ draw(). Внутри draw() он
      // копился: innerHTML меняет потомков, но слушатель сидит на самом host, и
      // после N перерисовок один клик обрабатывался N раз — карточки добавлялись
      // пачками, а потом страница вставала. Поймано стендом, не глазом.
      host.addEventListener('click', function (e) {
          var t = e.target, a;
          if ((a = t.getAttribute && t.getAttribute('data-first'))) {
            // ПОВТОРНЫЙ КЛИК СНИМАЕТ МЕТКУ. Без этого поставленную по ошибке метку
            // нельзя было убрать — только переставить на другую карточку, а если
            // тревожным участник не считает ни одну из написанных, у него не было
            // способа это показать. Гейт при снятой метке снова закроет шаг, и это
            // правильно: лор требует отметить один симптом, но выбор обязан быть
            // обратимым до фиксации.
            var pick = Number(a);
            m.first = (m.first === pick) ? null : pick;
            ctx.save(); draw(); ctx.sync(); return;
          }
          if ((a = t.getAttribute && t.getAttribute('data-del'))) {
            var id = Number(a);
            m.cards = m.cards.filter(function (x) { return x.id !== id; });
            if (m.first === id) m.first = null;
            m.pending = m.pending.filter(function (p) { return p !== id; });
            // Связка держится минимум на двух карточках: если после удаления
            // осталась одна, это уже не то, что отметил участник, — связка уходит.
            m.links = m.links.filter(function (lk) {
              lk.ids = lk.ids.filter(function (i3) { return i3 !== id; });
              return lk.ids.length >= 2;
            });
            ctx.save(); draw(); ctx.sync(); return;
          }
          if (t.getAttribute && t.getAttribute('data-add')) {
            m.cards.push({ id: m.nextId++, text: '', anchor: '' }); ctx.save(); draw(); ctx.sync(); return;
          }
          if ((a = t.getAttribute && t.getAttribute('data-anchoropen'))) { picking[Number(a)] = true; draw(); return; }
          if ((a = t.getAttribute && t.getAttribute('data-anchorclose'))) { picking[Number(a)] = false; draw(); return; }
          if ((a = t.getAttribute && t.getAttribute('data-anchorset'))) {
            var card = byId(Number(a));
            var mk = (ctx.marks ? ctx.marks() : []).filter(function (q) { return q.id === t.getAttribute('data-mid'); })[0];
            if (card && mk) {
              // Пишем САМУ цитату, а не ссылку на пометку: пометку можно убрать,
              // а сказанное участником исчезать не должно.
              card.anchor = mk.quote; card.anchorRef = mk.id;
              picking[card.id] = false; ctx.save(); draw(); ctx.sync();
            }
            return;
          }
          if ((a = t.getAttribute && t.getAttribute('data-anchoroff'))) {
            var c2 = byId(Number(a));
            if (c2) { c2.anchor = ''; c2.anchorRef = null; ctx.save(); draw(); ctx.sync(); }
            return;
          }
          if ((a = t.getAttribute && t.getAttribute('data-linkdel'))) {
            m.links.splice(Number(a), 1); ctx.save(); draw(); return;
          }
          if (t.getAttribute && t.getAttribute('data-linkadd')) {
            if (m.pending.length < 2 || m.pending.length > 4) return;
            m.links.push({ ids: m.pending.slice(), why: '', conclusion: '' });
            m.pending = []; ctx.save(); draw(); return;
          }
      });
      draw();
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // С2 · ВАРИАНТЫ. Меряет ГА-1 (что компания может сделать) и ГА-2 (источник).
  // Приглашение множественности только механическое — кнопка «+ ещё вариант».
  // Словесного «если видите не один вариант» здесь нет: это элиситация границы.
  // ═════════════════════════════════════════════════════════════════════════
  M.variants = {
    init: function () { return { rays: [{ name: '', gist: '', from: '' }] }; },
    gate: function (m, ctx) {
      if (ctx.isDemo) return '';
      return m.rays.some(function (r) { return String(r.gist).trim(); })
        ? '' : 'Нужен хотя бы один вариант с непустой сутью.';
    },
    foot: function () {
      return { note: 'Варианты перейдут в список инициатив.', cta: 'Разложил →' };
    },
    locked: function (m) {
      var n = m.rays.filter(function (r) { return String(r.name + r.gist).trim(); }).length;
      return '<b>' + n + '</b> ' + plural(n, 'вариант', 'варианта', 'вариантов') +
        ' <span class="bl-locked-hint">целиком — во вкладке «Мои ответы»</span>';
    },
    render: function (host, m, ctx) {
      var draw = function () {
        var h = head('Ваши варианты', '<span class="mx-count">вариантов: ' + m.rays.length + '</span>');
        m.rays.forEach(function (r, i) {
          h += '<div class="mx-card"><div class="mx-card-top"><span class="bl-n">' + (i + 1) + '</span>' +
            '<div class="mx-acts">' + (m.rays.length > 1 ? '<button type="button" class="s2-act" data-del="' + i + '">убрать</button>' : '') + '</div></div>' +
            field(ctx, { id: 'mxN' + i, f: 'name', i: i, line: 1, label: 'Название', ph: 'название варианта', val: r.name }) +
            field(ctx, { id: 'mxG' + i, f: 'gist', i: i, label: 'Суть', val: r.gist }) +
            field(ctx, { id: 'mxF' + i, f: 'from', i: i, label: 'Где вы это подсмотрели?', rows: 2, val: r.from }) +
            '</div>';
        });
        h += '<button type="button" class="mx-add" data-add="1">+ ещё вариант</button>';
        host.innerHTML = h;
        host.querySelectorAll('[data-f]').forEach(function (el) {
          el.addEventListener('input', function () {
            m.rays[Number(el.dataset.i)][el.dataset.f] = el.value; ctx.save(); ctx.sync();
          });
        });
      };
      // один раз, снаружи draw() — см. пояснение в M.theses
      host.addEventListener('click', function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-del');
        if (a) { m.rays.splice(Number(a), 1); ctx.save(); draw(); ctx.sync(); return; }
        if (e.target.getAttribute && e.target.getAttribute('data-add')) {
          m.rays.push({ name: '', gist: '', from: '' }); ctx.save(); draw(); ctx.sync();
        }
      });
      draw();
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // С3 · СПИСОК ИНИЦИАТИВ. Меряет ПР-1 (селекция) и ПР-2 (основание).
  //
  // ТРИ решения, не два (лор §С3). Прежняя механика платформы знала «берём / не
  // сейчас», и этого не хватает: пол ПР-1 отличает ПСЕВДО-ОТКАЗ («всё отложено на
  // потом», L2) от настоящего выбора («есть хотя бы одно „не делаем"», пол L3).
  // Без третьей кнопки эти два состояния неразличимы, то есть половина шкалы ПР-1
  // не наблюдаема. Поэтому «не сейчас» и «не делаем» разведены поступком.
  //
  // ЦЕНА ВАРИАНТОВ УЧАСТНИКА — ВИЛКА ОТ ФИНАНСИСТОВ (решение 05.08 №5 + ревью №3).
  // Сам участник цену не ставит: он провёл бы своё дёшево, а мешающую заявку кейса
  // бросил «дорогой» — дефицит обнулился бы, отказываться не пришлось, ПР-1 не
  // померился. Но и точки система не ставит: правило «ближайшая заявка того же
  // класса» нечёткое, у человека и модели вышли бы разные цены — паритет ломается.
  // Финансисты дают пределы, участник выбирает число ВНУТРИ и обосновывает.
  var VAR_FALLBACK = { people: 250, money: 5 };
  var STOPW = ['который', 'которая', 'которое', 'которые', 'через', 'между', 'своего',
    'своей', 'своих', 'нужно', 'можно', 'после', 'более', 'внутри', 'сейчас'];

  // ⚠ ЗАГЛУШКА, А НЕ МАППИНГ КЛАССОВ. Проверка №5 лора требует, чтобы вилки жили
  // в ДАННЫХ: класс варианта → вилка «низ–верх», правило отнесения
  // детерминированное и одинаковое у человека и модели. В backlog.js нет ни одного
  // тега класса, поэтому здесь вилка получена совпадением значимых слов с
  // заголовками заявок (±35% вокруг цены похожей). Пока классы не заведены в
  // данные, это честная временная опора: она держит дефицит и не выдаёт ложной
  // точности. Непопадание ни в одну заявку даёт ШИРОКУЮ осторожную вилку
  // (0,4×–2,0×) и пишется событием в протокол — самоцены участника нет ни в каком
  // случае (правка v4.4.f: fallback-самоцена возвращала ровно ту дыру).
  function rangeFor(text, BACKLOG) {
    var words = String(text || '').toLowerCase().replace(/[«»"'.,:;!?()]/g, ' ').split(/\s+/)
      .filter(function (w) { return w.length >= 4 && STOPW.indexOf(w) < 0; });
    var best = null, score = 0;
    BACKLOG.forEach(function (it) {
      var t = String(it.title).toLowerCase(), s = 0;
      words.forEach(function (w) { if (t.indexOf(w) >= 0) s++; });
      if (s > score) { score = s; best = it; }
    });
    var r1 = function (n) { return Math.round(n * 10) / 10; };
    if (best) {
      var lo = function (n) { return Math.max(1, Math.round(n * 0.65)); };
      var hi = function (n) { return Math.max(lo(n) + 1, Math.round(n * 1.35)); };
      return { pLow: lo(best.people), pHigh: hi(best.people),
               mLow: r1(lo(best.money)), mHigh: r1(hi(best.money)), matched: best.title, wide: false };
    }
    return { pLow: Math.round(VAR_FALLBACK.people * 0.4), pHigh: Math.round(VAR_FALLBACK.people * 2),
             mLow: r1(VAR_FALLBACK.money * 0.4), mHigh: r1(VAR_FALLBACK.money * 2), matched: null, wide: true };
  }

  // Позиции списка: заявки кейса (цена зашита) + варианты участника из С2 (вилка).
  function rows(m, ctx) {
    var out = [];
    var fan = ctx.mech('variants');
    ((fan && fan.rays) || []).forEach(function (r, i) {
      var t = String(r.name || '').trim() || String(r.gist || '').trim();
      if (!t) return;
      var rng = rangeFor(t + ' ' + (r.gist || ''), ctx.BACKLOG);
      out.push({ key: 'p' + i, own: true, title: cut(t, 140), range: rng });
    });
    ctx.BACKLOG.forEach(function (it) {
      out.push({ key: 'a' + it.id, own: false, id: it.id, title: it.title, who: it.who,
                 people: Number(it.people) || 0, money: Number(it.money) || 0, argument: it.argument });
    });
    return out;
  }

  function chosenOk(m, r) {
    var c = m.chosen[r.key];
    if (!c || c.people == null || c.money == null) return false;
    return c.people >= r.range.pLow && c.people <= r.range.pHigh &&
           c.money >= r.range.mLow && c.money <= r.range.mHigh;
  }
  // Своё считается по ВЫБРАННОМУ числу, а не по вилке: пока число не выбрано,
  // вклад в шкалы ноль — не по низу и не по верху, иначе платформа выбрала бы за
  // участника то самое, что мы у него и спрашиваем.
  function sums(m, ctx) {
    var t = { people: 0, money: 0, take: 0, later: 0, never: 0, undecided: 0, n: 0 };
    rows(m, ctx).forEach(function (r) {
      t.n++;
      var d = m.decided[r.key];
      if (!d) { t.undecided++; return; }
      t[d]++;
      if (d !== 'take') return;
      var c = m.chosen[r.key];
      t.people += r.own ? Number((c && c.people) || 0) : r.people;
      t.money += r.own ? Number((c && c.money) || 0) : r.money;
    });
    t.money = Math.round(t.money * 10) / 10;
    t.over = t.people > ctx.LIM.people || t.money > ctx.LIM.money;
    return t;
  }

  M.list = {
    init: function () { return { decided: {}, chosen: {}, obj: {}, criteria: '' }; },
    sums: sums, rows: rows,
    gate: function (m, ctx) {
      if (ctx.isDemo) return '';
      var t = sums(m, ctx);
      if (t.undecided) return 'Отметьте по каждой — осталось ' + t.undecided + '.';
      if (!t.take) return 'Агеев просил разобрать заявки, а не отклонить их целиком: возьмите хотя бы одно.';
      var bad = rows(m, ctx).filter(function (r) { return r.own && m.decided[r.key] === 'take' && !chosenOk(m, r); });
      if (bad.length) return 'У взятых своих вариантов укажите число внутри вилки финансистов.';
      if (!String(m.criteria).trim()) return 'Критерии обязательны: на чём стоит этот выбор.';
      return '';
    },
    foot: function () { return { note: 'Разбор зафиксируется: переиграть его нельзя.', cta: 'Зафиксировать разбор →' }; },
    locked: function (m, ctx) {
      var t = sums(m, ctx);
      return '<b>' + t.take + '</b> берём · <b>' + t.later + '</b> не сейчас · <b>' + t.never + '</b> не делаем · ' +
        t.people + ' человек из ' + ctx.LIM.people + ' · ' + ctx.num(t.money) + ' млрд из ' + ctx.LIM.money +
        (t.over ? ' <span class="bl-over-tag">за рамкой</span>' : '') +
        ' <span class="bl-locked-hint">разбор целиком — во вкладке «Мои ответы»</span>';
    },
    render: function (host, m, ctx) {
      var draw = function () {
        var all = rows(m, ctx), t = sums(m, ctx);
        var by = function (d) { return all.filter(function (r) { return m.decided[r.key] === d; }); };
        var und = all.filter(function (r) { return !m.decided[r.key]; });

        // Счётчик спокойный (СПЕК 03.08): числа без красного и без слова «перебор».
        var h = '<div class="bl-sum-host"><div class="bl-sum">' +
          '<span class="bl-sum-item"><b>' + t.take + '</b> берём</span>' +
          '<span class="bl-sum-item"><b>' + t.people + '</b> из ' + ctx.LIM.people + ' человек</span>' +
          '<span class="bl-sum-item"><b>' + ctx.num(t.money) + '</b> из ' + ctx.LIM.money + ' млрд</span>' +
          (t.undecided ? '<span class="bl-sum-left">осталось решить: ' + t.undecided + '</span>' : '') +
          '</div></div>';

        var acts = function (r) {
          return '<div class="mx-acts">' +
            ['take|берём', 'later|не сейчас', 'never|не делаем'].map(function (s) {
              var p = s.split('|');
              return '<button type="button" class="s2-act' + (m.decided[r.key] === p[0] ? ' is-on' : '') +
                '" data-set="' + p[0] + '" data-key="' + r.key + '">' + p[1] + '</button>';
            }).join('') + '</div>';
        };
        var priceOf = function (r) {
          if (!r.own) return '<span class="bl-card-cost">' + r.people + ' чел. · ' + ctx.num(r.money) + ' млрд</span>';
          var c = m.chosen[r.key] || {};
          return '<span class="bl-card-cost mx-band">Оценка финансистов: ' + r.range.pLow + '–' + r.range.pHigh +
            ' чел. · ' + ctx.num(r.range.mLow) + '–' + ctx.num(r.range.mHigh) + ' млрд' +
            (r.range.wide ? ' <span class="mx-opt">(широкая: класс не определён)</span>' : '') + '</span>' +
            '<div class="mx-pair"><span>Ваша цифра в этих пределах:</span>' +
              '<input type="number" class="mx-num" data-chp="' + r.key + '" min="' + r.range.pLow + '" max="' + r.range.pHigh +
                '" placeholder="чел." value="' + (c.people != null ? c.people : '') + '" />' +
              '<input type="number" class="mx-num" data-chm="' + r.key + '" min="' + r.range.mLow + '" max="' + r.range.mHigh +
                '" step="0.1" placeholder="млрд" value="' + (c.money != null ? c.money : '') + '" /></div>' +
            '<label class="mx-label" for="mxO' + r.key + '">Считаете, что финансисты промахнулись с вилкой? Скажите почему' +
              ' <span class="mx-opt">— необязательно</span></label>' +
            '<textarea id="mxO' + r.key + '" class="mx-input" data-answer="1" rows="2" data-obj="' + r.key +
              '" placeholder="необязательно">' + ctx.esc(m.obj[r.key] || '') + '</textarea>';
        };
        // Обоснование заявки видно СРАЗУ (решение владельца 06.08). Прятать его за
        // ссылкой «почему» смысла не было: это единственное, из чего участник понимает,
        // за что просят людей и деньги, и решение без него принимать нечем.
        var card = function (r) {
          return '<div class="bl-card' + (r.own ? ' mx-own' : '') + '">' +
            '<div class="bl-card-top"><span class="bl-n">' + (r.own ? 'ваш' : ctx.blNum(r.id)) + '</span>' + priceOf(r) + '</div>' +
            '<div class="bl-card-title">' + ctx.esc(r.title) + '</div>' +
            (r.who ? '<div class="bl-card-who">' + ctx.esc(r.who) + '</div>' : '') +
            (r.argument ? '<p class="bl-card-arg">' + ctx.esc(r.argument) + '</p>' : '') +
            acts(r) +
            '</div>';
        };

        h += '<div class="bl-list">' + (und.length
          ? '<div class="bl-zone-h">не решено <b>' + und.length + '</b></div><div class="bl-grid">' + und.map(card).join('') + '</div>'
          : '<div class="bl-zone-h">все ' + t.n + ' решены</div>') + '</div>';

        // Три столбика, не два: «не сейчас» и «не делаем» показаны раздельно и в
        // лицо — на печати (С3б) участник увидит ровно этот расклад.
        // ── СТОПКИ. Решённое лежит стопкой и переносится между стопками ОДНИМ
        // кликом: в строке стоят две другие возможности, а не «вернуть» в общий
        // пул. С двумя решениями «вернуть» хватало (единственный переезд —
        // туда-обратно), с тремя оно означало два клика вместо одного и потерю
        // места: карточка уезжала обратно в «не решено» и искалась заново.
        var OTHER = { take: 'берём', later: 'не сейчас', never: 'не делаем' };
        var col = function (title, arr, d) {
          // .mx-pile — стопка как ОТДЕЛЬНЫЙ предмет: рамка, подпись, счёт. Без
          // рамки три зоны в узкой колонке (474px на 1440) читались одним плоским
          // списком с подзаголовками — «раскладывания по стопкам» не было видно, а
          // именно оно здесь и есть поступок. Полосой во всю ширину, а не
          // столбиком: почему — в styles.css у .bl-cols.mx-cols3, там замер.
          return '<div class="mx-pile mx-pile-' + d + '">' +
            '<div class="bl-col-head">' + title + ' <span>· ' + arr.length + '</span></div>' +
            (arr.map(function (r) {
              // ⚠ У ВЗЯТОГО СВОЕГО ВАРИАНТА ПОЛЯ ВИЛКИ ОСТАЮТСЯ ЗДЕСЬ. Пока их не
              // было, участник попадал в тупик: карточка уходила из «не решено» в
              // «Берём» вместе с полями, а гейт продолжал требовать число внутри
              // вилки — вписать его было физически негде. Поймано стендом механик.
              // В «не сейчас» и «не делаем» полей нет: там число ни на что не влияет
              // (в шкалы идёт только взятое), и спрашивать его значило бы просить
              // работу впустую.
              var needBand = r.own && d === 'take';
              // Автор и цена в строке решённого — как в прежнем разборе: без них
              // стопка превращается в список заголовков, и участник, чтобы понять,
              // из чего сложились 1 602 человека, обязан помнить цены наизусть.
              var meta = r.own
                ? 'ваш вариант' + (d === 'take' && m.chosen[r.key]
                    ? ' · ' + ((m.chosen[r.key].people || 0) + ' чел. · ' + ctx.num(m.chosen[r.key].money || 0) + ' млрд')
                    : '')
                : ctx.esc(r.who) + ' · ' + r.people + ' чел. · ' + ctx.num(r.money) + ' млрд';
              var moves = Object.keys(OTHER).filter(function (k) { return k !== d; })
                .map(function (k) {
                  return '<button type="button" class="bl-row-back" data-set="' + k +
                    '" data-key="' + r.key + '">' + OTHER[k] + '</button>';
                }).join('');
              return '<div class="bl-row' + (needBand ? ' mx-row-wide' : '') + '">' +
                '<span class="bl-n">' + (r.own ? 'ваш' : ctx.blNum(r.id)) + '</span>' +
                '<span class="bl-row-t">' + ctx.esc(r.title) +
                  '<span class="bl-mini-who">' + meta + '</span></span>' +
                '<span class="mx-row-moves">' + moves + '</span>' +
                (needBand ? '<div class="mx-row-band">' + priceOf(r) + '</div>' : '') +
                '</div>';
            }).join('') || '<p class="bl-empty">пока ничего</p>') + '</div>';
        };
        h += '<div class="bl-decided"><div class="bl-zone-h">решено</div><div class="bl-cols mx-cols3">' +
          col('Берём', by('take'), 'take') + col('Не сейчас', by('later'), 'later') +
          col('Не делаем', by('never'), 'never') + '</div></div>';

        h += '<div class="mx-card">' +
          field(ctx, { id: 'mxCrit', f: 'crit', label: 'Почему именно так', rows: 5, val: m.criteria }) + '</div>';
        host.innerHTML = h;

        host.querySelectorAll('[data-chp]').forEach(function (i2) {
          i2.addEventListener('input', function () {
            var k = i2.dataset.chp; m.chosen[k] = m.chosen[k] || {};
            m.chosen[k].people = i2.value === '' ? null : Number(i2.value); ctx.save(); ctx.sync();
          });
        });
        host.querySelectorAll('[data-chm]').forEach(function (i2) {
          i2.addEventListener('input', function () {
            var k = i2.dataset.chm; m.chosen[k] = m.chosen[k] || {};
            m.chosen[k].money = i2.value === '' ? null : Number(i2.value); ctx.save(); ctx.sync();
          });
        });
        host.querySelectorAll('[data-obj]').forEach(function (ta) {
          ta.addEventListener('input', function () { m.obj[ta.dataset.obj] = ta.value; ctx.save(); });
        });
        var cr = host.querySelector('#mxCrit');
        cr.addEventListener('input', function () { m.criteria = cr.value; ctx.save(); ctx.sync(); });
      };
      // один раз, снаружи draw() — см. пояснение в M.theses
      host.addEventListener('click', function (e) {
        var t2 = e.target;
        // Обработчика «почему» здесь больше нет: обоснование видно всегда.
        if (!(t2.getAttribute && t2.hasAttribute('data-key'))) return;
        var key = t2.getAttribute('data-key'), d = t2.getAttribute('data-set');
        // Повторный клик по уже выбранному решению НИЧЕГО не делает: решить надо
        // каждую позицию, и случайный откат ломал бы собранный список. Передумать
        // можно, нажав другое решение или «вернуть» в решённом столбике.
        if (d && m.decided[key] === d) return;
        if (d) m.decided[key] = d; else delete m.decided[key];
        ctx.save();
        // Уход карточки из пула ЗАМЕТЕН ГЛАЗУ. Без этих 180 мс следующая карточка
        // мгновенно прыгает под курсор, и второй клик попадает не туда — правка
        // прежнего разбора, оплаченная тем же промахом. Переезд между стопками
        // перерисовывается сразу: строка не исчезает, она меняет столбик.
        var card = t2.closest && t2.closest('.bl-grid .bl-card');
        if (card) { card.classList.add('is-leaving'); setTimeout(function () { draw(); ctx.sync(); }, 180); }
        else { draw(); ctx.sync(); }
      });
      draw();
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // С3б · ПЕЧАТЬ. В балл НЕ входит: это маркер устойчивости под давлением —
  // утвердил / вернулся и изменил / вернулся и подтвердил.
  //
  // ДВА ШАГА, и порядок здесь и есть замер (D-ПР2-02: «надавили → как отреагировал
  // → чем объяснил»). Сначала только поступок, без поля: «Утверждаю» или
  // «Вернуться и изменить». Поле объяснения появляется ПОСЛЕ зафиксированной
  // реакции — иначе участник пишет объяснение одновременно с решением, и что было
  // раньше, реакция или её оправдание, уже не восстановить.
  //
  // Подпись поля зависит от того, был ли возврат: «Одной фразой — почему уверены»
  // или «Что поменяли и почему». Второе обязательно (§7 лора): без чтения этого
  // поля судья не отличит «калибровал» от «сменил» — оба выглядят как возврат.
  // ═════════════════════════════════════════════════════════════════════════
  // Слепок решений списка на момент возврата. Нужен затем, чтобы отличить
  // «вернулся и ИЗМЕНИЛ» от «вернулся и ПОДТВЕРДИЛ»: это два разных поступка, и
  // словарь маркера (D-ПР2-02) разводит их на «калибровал/сменил» против
  // «удержал». Без слепка оба читались бы одинаково — то есть маркер терял бы
  // треть своих состояний. Само сравнение — машинный факт, судье он уходит
  // фактом, а не уровнем; ЧТО именно поменялось, судья читает в поле «что
  // поменяли», как требует §7 лора.
  function sealSnap(ctx) {
    var lm = ctx.mech('list');
    if (!lm) return '';
    return Object.keys(lm.decided).sort().map(function (k) {
      var c = (lm.chosen && lm.chosen[k]) || {};
      return k + ':' + lm.decided[k] + ':' + (c.people == null ? '' : c.people) + ':' + (c.money == null ? '' : c.money);
    }).join('|');
  }
  function sealChanged(m, ctx) {
    if (!m.returned || m.snap == null) return false;
    return sealSnap(ctx) !== m.snap;
  }

  M.seal = {
    init: function () { return { confirmed: null, returned: false, why: '', snap: null }; },
    changed: sealChanged,
    gate: function (m, ctx) {
      if (ctx.isDemo) return '';
      if (m.confirmed == null) return '';           // шаг 1: гейта нет, есть поступок
      return String(m.why).trim() ? '' : 'Одна фраза — и день пойдёт дальше.';
    },
    foot: function (m) {
      if (m.confirmed == null) {
        return {
          note: 'Вернуться можно один раз.',
          cta: 'Утверждаю →',
          extra: m.returned ? '' : '<button type="button" class="btn btn-ghost" id="sealBack">Вернуться и изменить</button>'
        };
      }
      return { note: m.returned ? 'Возврат уже был — он у вас один.' : 'Ответ зафиксируется.', cta: 'Отправить →' };
    },
    footWire: function (foot, m, ctx) {
      var b = foot.querySelector('#sealBack');
      if (!b) return;
      b.addEventListener('click', function () {
        m.returned = true;
        // Слепок снимаем ДО возврата: сравнивать будем с ним, иначе «изменил» и
        // «подтвердил» не различить.
        m.snap = sealSnap(ctx);
        ctx.save();
        // Возврат к самому списку, а не к предыдущему такту: правится он.
        if (!ctx.jumpBackTo('list')) ctx.redraw();
      });
    },
    // «Утверждаю» на первом шаге день НЕ двигает: он фиксирует поступок и
    // открывает поле объяснения.
    onCta: function (m, ctx) {
      if (m.confirmed == null) { m.confirmed = true; ctx.save(); ctx.redraw(); return false; }
      return true;
    },
    locked: function (m, ctx) {
      var what = m.returned
        ? (sealChanged(m, ctx) ? 'вернулся и изменил' : 'вернулся и подтвердил')
        : 'утвердил под давлением';
      return '<b>' + what + '</b> <span class="bl-locked-hint">строка — во вкладке «Мои ответы»</span>';
    },
    render: function (host, m, ctx) {
      var lm = ctx.mech('list');
      var draw = function () {
        var h = '';
        if (lm) {
          var all = M.list.rows(lm, ctx), t = M.list.sums(lm, ctx);
          var by = function (d) { return all.filter(function (r) { return lm.decided[r.key] === d; }); };
          // Список крупно и раздельно, «в лицо»: участник видит ровно то, что
          // Агеев положит на стол правления.
          h += '<div class="mx-seal-total">' + t.people + ' человек · ' + ctx.num(t.money) + ' млрд' +
            (t.over ? ' <span class="bl-over-tag">за рамкой</span>' : '') + '</div>';
          [['Берём', 'take'], ['Не делаем', 'never'], ['Не сейчас', 'later']].forEach(function (p) {
            var arr = by(p[1]);
            h += '<div class="bl-col-head" style="margin-top:14px;">' + p[0] + ' <span>· ' + arr.length + '</span></div>' +
              (arr.length
                ? '<ul class="off-list">' + arr.map(function (r) {
                    return '<li>' + ctx.esc(r.title) + '</li>'; }).join('') + '</ul>'
                : '<p class="bl-empty">пока ничего</p>');
          });
        }
        if (m.confirmed != null) {
          h += '<div class="mx-card" style="margin-top:16px;">' +
            field(ctx, { id: 'mxSeal', f: 'seal', rows: 2, ph: 'одна фраза',
              label: m.returned ? 'Что поменяли и почему' : 'Одной фразой — почему уверены',
              val: m.why }) + '</div>';
        }
        host.innerHTML = h;
        var w = host.querySelector('#mxSeal');
        if (w) w.addEventListener('input', function () { m.why = w.value; ctx.save(); ctx.sync(); });
      };
      draw();
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // С4 · БУДУЩЕЕ. Меряет МК-2. Полей «условие» и «признаки» нет сознательно
  // (правило 2): в прогоне 001347 конструктор из таких полей поднял ПП-1 до L5 в
  // одном окне при L2 по тексту соседнего — форма рисовала вершину шкалы.
  // Приглашение множественности только механическое — кнопка «+ ещё вариант».
  // ═════════════════════════════════════════════════════════════════════════
  M.futures = {
    init: function () { return { cards: [''], bet: null, betWhy: '' }; },
    gate: function (m, ctx) {
      if (ctx.isDemo) return '';
      return m.cards.some(function (t) { return String(t).trim(); }) ? '' : 'Нужна хотя бы одна карточка.';
    },
    foot: function () { return { note: 'Ответ зафиксируется.', cta: 'Разложил →' }; },
    locked: function (m) {
      var n = m.cards.filter(function (t) { return String(t).trim(); }).length;
      return '<b>' + n + '</b> ' + plural(n, 'вариант', 'варианта', 'вариантов') + ' будущего' +
        (m.bet != null ? ' · наиболее вероятный отмечен' : ' · выбор не сделан') +
        ' <span class="bl-locked-hint">целиком — во вкладке «Мои ответы»</span>';
    },
    render: function (host, m, ctx) {
      var draw = function () {
        var h = head('Варианты будущего', '<span class="mx-count">вариантов: ' + m.cards.length + '</span>');
        m.cards.forEach(function (t, i) {
          // Кнопка выбора появляется ТОЛЬКО у заполненной карточки: на пустой она
          // предлагала бы отметить ничто. «Наиболее вероятным», не «как вероятный»
          // — при нескольких вариантах второе читалось так, будто пометить можно
          // несколько, а выбор здесь один.
          // Метка обратима до фиксации — тем же повторным кликом, что у самого
          // тревожного симптома в тезисах: пометка, поставленная по ошибке, снимается,
          // а не только переставляется.
          var ctrl = m.bet === i
            ? '<button type="button" class="s2-act is-on mx-flag" data-bet="' + i +
              '" title="Нажмите ещё раз, чтобы снять метку">наиболее вероятный</button>'
            : (String(t).trim() ? '<button type="button" class="s2-act" data-bet="' + i + '">отметить наиболее вероятным</button>' : '');
          h += '<div class="mx-card' + (m.bet === i ? ' is-first' : '') + '">' +
            '<div class="mx-card-top"><span class="bl-n">' + (i + 1) + '</span><div class="mx-acts">' + ctrl +
            (m.cards.length > 1 ? '<button type="button" class="s2-act" data-del="' + i + '">убрать</button>' : '') +
            '</div></div>' +
            '<textarea class="mx-input" data-answer="1" rows="3" data-fu="' + i + '" placeholder="ваш ответ">' + ctx.esc(t) + '</textarea>' +
            '</div>';
        });
        h += '<button type="button" class="mx-add" data-add="1">+ ещё вариант</button>';
        if (m.bet != null) {
          h += '<div class="mx-slot"><span class="mx-title">Лемех: «А сами какой считаете вероятнее?»</span>' +
            field(ctx, { id: 'mxBw', f: 'betwhy', label: 'Почему — одной фразой', rows: 2, ph: 'одна фраза', val: m.betWhy }) +
            '</div>';
        }
        host.innerHTML = h;
        host.querySelectorAll('[data-fu]').forEach(function (ta) {
          ta.addEventListener('input', function () { m.cards[Number(ta.dataset.fu)] = ta.value; ctx.save(); ctx.sync(); });
          // Кнопка выбора появляется по blur, а не на каждый ввод: перерисовка на
          // каждый символ сбивала бы курсор. Та же причина, по которой у вилки в
          // С3 перерисовки по blur нет вовсе — там два поля в одной карточке.
          ta.addEventListener('blur', function () { draw(); ctx.sync(); });
        });
        var w = host.querySelector('#mxBw');
        if (w) w.addEventListener('input', function () { m.betWhy = w.value; ctx.save(); });
      };
      host.addEventListener('click', function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-bet');
        if (a !== null && a !== undefined && a !== '') {
          var pick = Number(a);
          m.bet = (m.bet === pick) ? null : pick;
          ctx.save(); draw(); ctx.sync(); return;
        }
        a = e.target.getAttribute && e.target.getAttribute('data-del');
        if (a) {
          var i = Number(a); m.cards.splice(i, 1);
          if (m.bet === i) m.bet = null; else if (m.bet != null && m.bet > i) m.bet--;
          ctx.save(); draw(); ctx.sync(); return;
        }
        if (e.target.getAttribute && e.target.getAttribute('data-add')) {
          m.cards.push(''); ctx.save(); draw(); ctx.sync();
        }
      });
      draw();
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // С5 · ЦЕЛЬ. Меряет МК-1. Слайдер и цена — ОБА необязательны, и это замер, а не
  // снисхождение: обязательный срок стирал наблюдение «сам ли человек привязал
  // цель ко времени», обязательная цена — «замах без цены». Оба гейта МК-1
  // симметричны, обязательно только «чем стала».
  // Крайнее деление — «15+» без числа: поколенческий замах фиксируется, но
  // конкретной цифрой не якорится, а ходовые 3–7 лет остаются точными.
  // ═════════════════════════════════════════════════════════════════════════
  var YMAX = 16;   // 16-е деление читается как «15+»
  function yearsLabel(y) { return y ? (y === YMAX ? '15+' : String(y)) : 'не выбрано'; }
  M.goal = {
    init: function () { return { years: null, became: '', gave: '' }; },
    yearsLabel: yearsLabel,
    gate: function (m, ctx) {
      if (ctx.isDemo) return '';
      return String(m.became).trim() ? '' : '«Чем стала компания» — обязательно. Срок и цена по желанию.';
    },
    foot: function () { return { note: 'Срок и цена — по желанию.', cta: 'Ответил →' }; },
    locked: function (m) {
      // «через не выбрано» — сломанная фраза; когда срока нет, так и говорим.
      // Отсутствие срока само по себе наблюдение (МК-1), а не пропуск, поэтому
      // в своде оно стоит наравне с выбранным, без укора.
      return (m.years ? 'срок <b>' + yearsLabel(m.years) + '</b> лет' : '<b>срок не выбран</b>') +
        ' · цена ' + (String(m.gave).trim() ? 'названа' : 'не названа') +
        ' <span class="bl-locked-hint">целиком — во вкладке «Мои ответы»</span>';
    },
    render: function (host, m, ctx) {
      var draw = function () {
        host.innerHTML =
          head('Через сколько лет', '<span class="mx-count mx-opt">по желанию — можно не отвечать</span>') +
          '<div class="mx-years">' +
            '<input type="range" id="mxY" min="1" max="' + YMAX + '" step="1" value="' + (m.years || 8) + '" ' +
              'aria-label="Через сколько лет" />' +
            '<span class="mx-years-val' + (m.years ? '' : ' is-empty') + '" id="mxYv">' + yearsLabel(m.years) + '</span>' +
            (m.years ? '<button type="button" class="s2-act" id="mxYc">сбросить</button>' : '') +
          '</div>' +
          '<p class="mx-hint">от года до пятнадцати, крайнее деление — «15+». Дефолта нет: пока не сдвинете, срок не выбран.</p>' +
          '<div class="mx-card">' +
            field(ctx, { id: 'mxGb', f: 'became', label: 'Чем стала компания', rows: 5, val: m.became }) +
            field(ctx, { id: 'mxGg', f: 'gave', label: 'Что отдали', opt: 1, rows: 4, ph: 'необязательно', val: m.gave }) +
          '</div>';
        var y = host.querySelector('#mxY'), v = host.querySelector('#mxYv');
        y.addEventListener('input', function () {
          m.years = Number(y.value);
          v.textContent = yearsLabel(m.years);
          v.classList.remove('is-empty');
          ctx.save();
        });
        // Сброс перерисовывает: кнопка «сбросить» должна исчезнуть вместе с выбором.
        y.addEventListener('change', function () { draw(); });
        var c = host.querySelector('#mxYc');
        if (c) c.addEventListener('click', function () { m.years = null; ctx.save(); draw(); });
        var bb = host.querySelector('#mxGb'), gg = host.querySelector('#mxGg');
        bb.addEventListener('input', function () { m.became = bb.value; ctx.save(); ctx.sync(); });
        gg.addEventListener('input', function () { m.gave = gg.value; ctx.save(); });
      };
      draw();
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // С9 · ПИСЬМО ПРАВЛЕНИЮ. Контрольное окно: ПР-2, ПП-1, МК-1.
  // Четыре поля вместо одного свободного — правка по прогону: свободная «финальная
  // защита» дала общий текст за три минуты, и контроль намерил единицы при
  // домашних тройках. Четыре поля — структура ЗАКАЗА Агеева (он их перечисляет
  // голосом), а не структура шкалы: судья по-прежнему читает содержание, а не
  // считает заполненные строки.
  // ═════════════════════════════════════════════════════════════════════════
  var LETTER = [
    ['what', 'Что мы делаем'],
    ['why', 'Почему именно это'],
    ['how', 'Как мы туда идём'],
    ['works', 'Почему эта стратегия сработает']
  ];
  M.letter = {
    init: function () { return { what: '', why: '', how: '', works: '' }; },
    fields: LETTER,
    gate: function (m, ctx) {
      if (ctx.isDemo) return '';
      var left = LETTER.filter(function (f) { return !String(m[f[0]]).trim(); });
      return left.length ? 'Осталось заполнить: ' + left.map(function (f) { return '«' + f[1] + '»'; }).join(', ') + '.' : '';
    },
    foot: function () { return { note: 'Агеев зачитает письмо дословно.', cta: 'Отправить →' }; },
    locked: function () { return '<b>письмо отправлено</b> <span class="bl-locked-hint">все четыре поля — во вкладке «Мои ответы»</span>'; },
    render: function (host, m, ctx) {
      host.innerHTML = '<div class="mx-card">' + LETTER.map(function (f) {
        return field(ctx, { id: 'mxL_' + f[0], f: f[0], label: f[1], rows: 4, val: m[f[0]] });
      }).join('') + '</div>';
      LETTER.forEach(function (f) {
        var el = host.querySelector('#mxL_' + f[0]);
        el.addEventListener('input', function () { m[f[0]] = el.value; ctx.save(); ctx.sync(); });
      });
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // СЛЕД МЕХАНИКИ ДЛЯ ВКЛАДКИ «МОИ ОТВЕТЫ» И СВОДА ДНЯ.
  // Дословно и без оценок: участник обязан видеть ровно то, что сказал. Здесь
  // же — материал, который уедет судье, поэтому форма следа и форма входа судьи
  // должны читаться одинаково (одно и то же перечисление в одном порядке).
  // ═════════════════════════════════════════════════════════════════════════
  function p(label, body) { return '<p style="margin:8px 0 0;"><b>' + label + ':</b> ' + body + '</p>'; }

  M.theses.answerHtml = function (m, ctx) {
    var filled = m.cards.filter(function (c) { return String(c.text).trim(); });
    var h = '<ol style="margin:0;padding-left:20px;">' + filled.map(function (c) {
      return '<li>' + ctx.br(c.text) + (String(c.anchor).trim() ? ' <i>(' + ctx.br(c.anchor) + ')</i>' : '') + '</li>';
    }).join('') + '</ol>';
    var f = m.cards.filter(function (c) { return c.id === m.first; })[0];
    if (f) h += p('Самый тревожный симптом', ctx.br(f.text) + '<br /><b>Почему:</b> ' + ctx.br(m.why));
    if (m.links.length) {
      h += p('Связки (' + m.links.length + ')', '');
      m.links.forEach(function (lk) {
        var t = lk.ids.map(function (id) {
          var c = m.cards.filter(function (x) { return x.id === id; })[0];
          return c ? '«' + ctx.esc(cut(c.text, 40)) + '»' : '';
        }).filter(Boolean).join(' + ');
        h += '<p style="margin:4px 0;">' + t + '<br /><i>' + ctx.br(lk.why) + '</i><br /><i>→ ' + ctx.br(lk.conclusion) + '</i></p>';
      });
    }
    return h;
  };

  M.variants.answerHtml = function (m, ctx) {
    return m.rays.filter(function (r) { return String(r.name + r.gist).trim(); }).map(function (r) {
      return '<p style="margin:0 0 8px;"><b>' + ctx.br(r.name || '(без названия)') + '</b><br />' + ctx.br(r.gist) +
        (String(r.from).trim() ? '<br /><i>откуда: ' + ctx.br(r.from) + '</i>' : '') + '</p>';
    }).join('') || '<i>не заполнено</i>';
  };

  M.list.answerHtml = function (m, ctx) {
    var all = rows(m, ctx), t = sums(m, ctx);
    var by = function (d) { return all.filter(function (r) { return m.decided[r.key] === d; }); };
    var li = function (arr, withCost) {
      return '<ul class="recap-list">' + arr.map(function (r) {
        var cost = r.own
          ? ((m.chosen[r.key] && m.chosen[r.key].people) || 0) + ' чел. · ' + ctx.num((m.chosen[r.key] && m.chosen[r.key].money) || 0) + ' млрд' +
            ' <i>(вилка ' + r.range.pLow + '–' + r.range.pHigh + ' / ' + ctx.num(r.range.mLow) + '–' + ctx.num(r.range.mHigh) + ')</i>'
          : r.people + ' чел. · ' + ctx.num(r.money) + ' млрд';
        return '<li><span class="bl-num">' + (r.own ? 'ваш' : ctx.blNum(r.id)) + '</span> ' + ctx.esc(r.title) +
          (withCost ? '<span class="recap-cost">' + cost + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    };
    var h = '<p style="margin:0 0 8px;">' + t.people + ' человек из ' + ctx.LIM.people + ' · ' +
      ctx.num(t.money) + ' млрд из ' + ctx.LIM.money + (t.over ? ' — за рамкой' : ' — в рамке') + '</p>';
    h += p('Берём (' + t.take + ')', '') + li(by('take'), true);
    h += p('Не делаем (' + t.never + ')', '') + li(by('never'), false);
    h += p('Не сейчас (' + t.later + ')', '') + li(by('later'), false);
    if (String(m.criteria).trim()) h += p('Почему именно так', ctx.br(m.criteria));
    var objs = all.filter(function (r) { return r.own && String(m.obj[r.key] || '').trim(); });
    if (objs.length) {
      h += p('Возражения оценке финансистов', '');
      objs.forEach(function (r) { h += '<p style="margin:2px 0;">«' + ctx.esc(r.title) + '» — ' + ctx.br(m.obj[r.key]) + '</p>'; });
    }
    return h;
  };

  M.seal.answerHtml = function (m, ctx) {
    var what = m.returned
      ? (sealChanged(m, ctx) ? 'вернулся к списку и изменил его' : 'вернулся к списку и подтвердил')
      : 'утвердил под давлением';
    return '<p style="margin:0;">' + what + '</p>' +
      (String(m.why).trim() ? p(m.returned ? 'Что поменяли и почему' : 'Почему уверены', ctx.br(m.why)) : '');
  };

  M.futures.answerHtml = function (m, ctx) {
    return m.cards.filter(function (t) { return String(t).trim(); }).map(function (t, i) {
      return '<p style="margin:0 0 8px;">' + ctx.br(t) +
        (m.bet === i ? '<br /><i>наиболее вероятный' + (String(m.betWhy).trim() ? ': ' + ctx.br(m.betWhy) : '') + '</i>' : '') + '</p>';
    }).join('') || '<i>не заполнено</i>';
  };

  M.goal.answerHtml = function (m, ctx) {
    return '<p style="margin:0;">' + (m.years ? 'через ' + yearsLabel(m.years) + ' лет' : 'срок не выбран') + '</p>' +
      p('Чем стала компания', ctx.br(m.became)) +
      (String(m.gave).trim() ? p('Что отдали', ctx.br(m.gave)) : '<p style="margin:8px 0 0;" class="mx-opt">цена не названа</p>');
  };

  M.letter.answerHtml = function (m, ctx) {
    return LETTER.map(function (f) { return p(f[1], ctx.br(m[f[0]])); }).join('');
  };

  // ── утилиты файла ─────────────────────────────────────────────────────────
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  window.imp.mechanics = M;
  window.imp.mechUtil = { field: field, head: head, normCount: normCount, cut: cut, plural: plural, NORM: NORM };
})();

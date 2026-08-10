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
  // ── ДЕЛЕГИРОВАННЫЙ КЛИК — ОДИН РАЗ НА УЗЕЛ ──
  // Если render() позовут по тому же host дважды (стенд механик так и делает:
  // mount() при старте и mount() по клику в списке), слушателей станет два, и каждый
  // клик обработается дважды: метка «самый тревожный симптом» ставилась и тут же
  // снималась, а «+ тезис» добавлял две карточки. Поймано 07.08.
  function wireClick(host, handler) {
    if (host.dataset.impWired) return;
    host.dataset.impWired = '1';
    host.addEventListener('click', handler);
  }

  function field(ctx, o) {
    var id = o.id;
    // Пустая подпись НЕ рисуется: пустой <label> держал строку и давал пустоту над
    // полем (поймано владельцем на печати 07.08).
    return (o.label ? '<label class="mx-label" for="' + id + '">' + ctx.esc(o.label) +
        (o.opt ? ' <span class="mx-opt">— необязательно</span>' : '') + '</label>' : '') +
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
      return { note: '', cta: 'Отправить Агееву →' };
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
      // Решение владельца 06.08. Клик-выбор («Подтвердить пометкой в материалах») остаётся: мышь
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
            : '<p class="mx-hint">Заметок пока нет. Выделите фрагмент в материалах справа — появится кнопка «отметить».</p>') +
            '<button type="button" class="s2-act" data-anchorclose="' + x.id + '">скрыть</button></div>';
        } else {
          h += '<button type="button" class="s2-act mx-anchor-open" data-anchoropen="' + x.id + '">' +
            'Подтвердить заметкой в материалах' + (marks.length ? ' (' + marks.length + ')' : '') + '</button>';
        }
        h += '<input type="text" class="mx-input mx-input-thin" data-answer="1" data-anchor="' + x.id + '"' +
          ' placeholder="или словами: если ссылаетесь на материалы — где именно (необязательно)" value="' +
          ctx.esc(x.anchor) + '" />';
        return h;
      };
      var draw = function () {
        // ⚠ Слот отмеченного стоит ПЕРВЫМ и появляется только когда симптом отмечен
        // (правка владельца 07.08): пустая рамка «пока ничего» внизу занимала экран
        // обещанием, а отмеченное — то, ради чего Агеев просил отметить отдельно.
        var h = '<div class="mx-slot-host"></div>' + head('Тезисы', normCount(m.cards.length, NORM));
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

        // ⚠ Слот и список выбора связок ЗАВИСЯТ ОТ ТЕКСТА КАРТОЧЕК, поэтому вынесены
        // в отдельные узлы: при наборе перерисовывать весь верстак нельзя (каретка
        // уедет), а не перерисовывать было нельзя тоже — цитата в слоте и карточки
        // в списке связок появлялись только после следующей перерисовки, то есть
        // когда участник добавлял ещё один тезис. Поймано владельцем 07.08.

        h += head('Как тезисы связаны друг с другом', '<span class="mx-count">связок: ' + m.links.length + '</span>');
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
        h += '<div class="mx-pick-host"></div>';
        host.innerHTML = h;

        // Части, зависящие от текста карточек. Зовётся и из draw(), и на каждый ввод
        // символа — но перерисовывает ТОЛЬКО себя, поэтому каретка не двигается.
        var drawDerived = function () {
          var slot = host.querySelector('.mx-slot-host');
          if (slot) {
            var f = m.first != null && byId(m.first) ? String(byId(m.first).text).trim() : '';
            slot.innerHTML = f
              ? '<div class="mx-slot">' +
                  '<span class="mx-title">Самый тревожный симптом</span>' +
                  '<p class="mx-quote">' + ctx.br(f) + '</p>' +
                  field(ctx, { id: 'mxWhy', f: 'why', label: 'Почему именно это', rows: 2, ph: 'ваш ответ', val: m.why }) +
                '</div>'
              : '';
            var w2 = slot.querySelector('#mxWhy');
            if (w2) w2.addEventListener('input', function () { m.why = w2.value; ctx.save(); });
          }
          var pick = host.querySelector('.mx-pick-host');
          if (!pick) return;
          var named = m.cards.filter(function (x) { return String(x.text).trim(); });
          if (named.length < 2) { pick.innerHTML = ''; return; }
          var ph = '<p class="mx-hint">Отметьте от 2 до 4 карточек для новой связки</p>';
          named.forEach(function (x) {
            ph += '<label class="mx-pick"><input type="checkbox" data-pick="' + x.id + '"' +
              (m.pending.indexOf(x.id) >= 0 ? ' checked' : '') + ' />' +
              '<span>' + ctx.esc(cut(x.text, 70)) + '</span></label>';
          });
          var bad = m.pending.length < 2 || m.pending.length > 4;
          ph += '<button type="button" class="mx-add" data-linkadd="1"' + (bad ? ' disabled' : '') + '>' +
            'Создать связь из выбранных (' + m.pending.length + ')' + (bad ? ' — нужно 2–4' : '') + '</button>';
          pick.innerHTML = ph;
          pick.querySelectorAll('[data-pick]').forEach(function (chk) {
            chk.addEventListener('change', function () {
              var id = Number(chk.dataset.pick);
              if (chk.checked) { if (m.pending.length < 4) m.pending.push(id); else chk.checked = false; }
              else m.pending = m.pending.filter(function (p) { return p !== id; });
              ctx.save(); drawDerived();
            });
          });
        };
        drawDerived();

        dropWire(host);
        host.querySelectorAll('[data-text]').forEach(function (ta) {
          ta.addEventListener('input', function () {
            byId(Number(ta.dataset.text)).text = ta.value;
            ctx.save(); ctx.sync();
            // Слот и список связок читают этот текст — обновляем их сразу, а не к
            // следующей перерисовке верстака.
            drawDerived();
          });
        });
        host.querySelectorAll('[data-anchor]').forEach(function (i2) {
          i2.addEventListener('input', function () { byId(Number(i2.dataset.anchor)).anchor = i2.value; ctx.save(); });
        });
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
      };
      // ⚠ ДЕЛЕГИРОВАННЫЙ КЛИК ВЕШАЕТСЯ ОДИН РАЗ, СНАРУЖИ draw(). Внутри draw() он
      // копился: innerHTML меняет потомков, но слушатель сидит на самом host, и
      // после N перерисовок один клик обрабатывался N раз — карточки добавлялись
      // пачками, а потом страница вставала. Поймано стендом, не глазом.
      wireClick(host, function (e) {
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
      return { note: '', cta: 'Разложил →' };
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
      wireClick(host, function (e) {
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
  // ⚠ VAR_FALLBACK и rangeFor удалены 07.08 вместе с вилкой финансистов: свои
  // варианты в разбор заявок больше не попадают, и оценивать их платформе нечем.

  // Позиции списка: заявки кейса (цена зашита) + варианты участника из С2 (вилка).
  // ⚠ ВАРИАНТЫ УЧАСТНИКА СЮДА НЕ ПОПАДАЮТ (правка владельца 07.08). Раньше они
  // приезжали в список отдельными карточками с вилкой финансистов, и участник
  // расставлял им цену сам. Теперь разбор — только заявки кейса; свои варианты
  // живут в своём шаге и уходят судье оттуда. Вместе с ними ушли вилка (rangeFor),
  // поля цены у своей карточки и гейт «укажите число внутри вилки».
  function rows(m, ctx) {
    var out = [];
    ctx.BACKLOG.forEach(function (it) {
      out.push({ key: 'a' + it.id, own: false, id: it.id, title: it.title, who: it.who,
                 people: Number(it.people) || 0, money: Number(it.money) || 0, argument: it.argument });
    });
    return out;
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
      t.people += r.people;
      t.money += r.money;
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
      if (!String(m.criteria).trim()) return 'Критерии обязательны: на чём стоит этот выбор.';
      return '';
    },
    foot: function (m, ctx) {
      var sm = ctx.mech('seal') || {};
      return { note: '', cta: sm.returned && sm.confirmed == null ? 'Продолжить →' : 'Зафиксировать разбор →' };
    },
    // ⚠ ВТОРОЙ ПРОХОД НЕ ГОНЯЕТ ПО КРУГУ (правка владельца 07.08). После «Вернуться
    // и изменить» участник правит карточки и жмёт «Продолжить» — и попадает сразу к
    // вопросу Агеева «Что поменяли и почему?», а не в монолог, перебор и печать
    // заново. Признак второго прохода — печать уже возвращалась и ещё не подтверждена.
    onCta: function (m, ctx) {
      var sm = ctx.mech('seal');
      if (sm && sm.returned && sm.confirmed == null) {
        sm.confirmed = true;
        ctx.save();
        if (ctx.jumpToMech('seal')) return false;
      }
      return true;
    },
    locked: function (m, ctx) {
      var t = sums(m, ctx);
      return '<b>' + t.take + '</b> берём · <b>' + t.later + '</b> не сейчас · <b>' + t.never + '</b> не делаем · ' +
        t.people + ' человек из ' + ctx.LIM.people + ' · ' + ctx.num(t.money) + ' млрд из ' + ctx.LIM.money +
        (t.over ? ' <span class="bl-over-tag">вне бюджета</span>' : '') +
        ' <span class="bl-locked-hint">разбор целиком — во вкладке «Мои ответы»</span>';
    },
    render: function (host, m, ctx) {
      var draw = function () {
        var all = rows(m, ctx), t = sums(m, ctx);
        var by = function (d) { return all.filter(function (r) { return m.decided[r.key] === d; }); };
        var und = all.filter(function (r) { return !m.decided[r.key]; });

        // Счётчик спокойный (СПЕК 03.08): числа без красного и без слова «перебор».
        // ⚠ КРУПНОГО СЧЁТЧИКА БОЛЬШЕ НЕТ (правка владельца 07.08). Он стоял липкой
        // полосой над списком и считал за участника: «1602 из 500» читалось как
        // приговор ещё до того, как разбор закончен. Сумма взятого осталась — но в
        // подписи стопки «Берём», рядом с тем, из чего она сложилась. Перебор
        // участник прикидывает сам: рамка названа в монологе Агеева.
        var h = '';

        var acts = function (r) {
          return '<div class="mx-acts">' +
            ['take|берём', 'later|не сейчас', 'never|не делаем'].map(function (s) {
              var p = s.split('|');
              return '<button type="button" class="s2-act' + (m.decided[r.key] === p[0] ? ' is-on' : '') +
                '" data-set="' + p[0] + '" data-key="' + r.key + '">' + p[1] + '</button>';
            }).join('') + '</div>';
        };
        var priceOf = function (r) {
          return '<span class="bl-card-cost">' + r.people + ' чел. · ' + ctx.num(r.money) + ' млрд</span>';
        };
        // Обоснование заявки видно СРАЗУ (решение владельца 06.08). Прятать его за
        // ссылкой «почему» смысла не было: это единственное, из чего участник понимает,
        // за что просят людей и деньги, и решение без него принимать нечем.
        var card = function (r) {
          return '<div class="bl-card">' +
            '<div class="bl-card-top"><span class="bl-n">' + ctx.blNum(r.id) + '</span>' + priceOf(r) + '</div>' +
            '<div class="bl-card-title">' + ctx.esc(r.title) + '</div>' +
            (r.who ? '<div class="bl-card-who">' + ctx.esc(r.who) + '</div>' : '') +
            (r.argument ? '<p class="bl-card-arg">' + ctx.esc(r.argument) + '</p>' : '') +
            acts(r) +
            '</div>';
        };


        // Три столбика, не два: «не сейчас» и «не делаем» показаны раздельно и в
        // лицо — на печати (С3б) участник увидит ровно этот расклад.
        // ── СТОПКИ. Решённое лежит стопкой и переносится между стопками ОДНИМ
        // кликом: в строке стоят две другие возможности, а не «вернуть» в общий
        // пул. С двумя решениями «вернуть» хватало (единственный переезд —
        // туда-обратно), с тремя оно означало два клика вместо одного и потерю
        // места: карточка уезжала обратно в «не решено» и искалась заново.
        var OTHER = { take: 'берём', later: 'не сейчас', never: 'не делаем' };
        var col = function (title, arr, d) {
          // Сумма — только у «Берём»: в шкалы идёт взятое, у остальных стопок
          // складывать нечего.
          // ⚠ Сумма прижата к правому краю шапки (styles.css, .bl-col-head:has).
          // Точка разделителя не спасала: на этом кегле счёт карточек и число
          // людей всё равно читались одним числом — «Берём · 2 460 чел.».
          var sum = d === 'take' && arr.length
            ? '<span class="bl-pile-sum">' + t.people + ' чел. · ' + ctx.num(t.money) + ' млрд</span>'
            : '';
          // .mx-pile — стопка как ОТДЕЛЬНЫЙ предмет: рамка, подпись, счёт. Без
          // рамки три зоны в узкой колонке (474px на 1440) читались одним плоским
          // списком с подзаголовками — «раскладывания по стопкам» не было видно, а
          // именно оно здесь и есть поступок. Полосой во всю ширину, а не
          // столбиком: почему — в styles.css у .bl-cols.mx-cols3, там замер.
          return '<div class="mx-pile mx-pile-' + d + '">' +
            '<div class="bl-col-head' + (sum ? ' has-sum' : '') + '">' + title +
              ' <span>· ' + arr.length + '</span>' + sum + '</div>' +
            (arr.map(function (r) {
              // Автор и цена в строке решённого: без них стопка превращается в
              // список заголовков, и участник, чтобы понять, из чего сложилась
              // сумма, обязан помнить цены наизусть.
              var meta = ctx.esc(r.who) + ' · ' + r.people + ' чел. · ' + ctx.num(r.money) + ' млрд';
              var moves = Object.keys(OTHER).filter(function (k) { return k !== d; })
                .map(function (k) {
                  return '<button type="button" class="bl-row-back" data-set="' + k +
                    '" data-key="' + r.key + '">' + OTHER[k] + '</button>';
                }).join('');
              return '<div class="bl-row">' +
                '<span class="bl-n">' + ctx.blNum(r.id) + '</span>' +
                '<span class="bl-row-t">' + ctx.esc(r.title) +
                  '<span class="bl-mini-who">' + meta + '</span></span>' +
                '<span class="mx-row-moves">' + moves + '</span>' +
                '</div>';
            }).join('') || '<p class="bl-empty">пока ничего</p>') + '</div>';
        };
        // ⚠ ПОРЯДОК: сначала СТОПКИ, потом нерешённое (решение владельца 07.08).
        // Раньше решённое лежало под списком, и участник, нажав «берём», не видел,
        // куда уехала карточка, — механика читалась как «карточка пропала». Стопки
        // показываются, только когда решена первая: до этого показывать три пустые
        // зоны значило бы занять экран обещанием.
        if (t.n - und.length > 0) {
          h += '<div class="bl-decided"><div class="bl-zone-h">решено</div><div class="bl-cols mx-cols3">' +
            col('Берём', by('take'), 'take') + col('Не сейчас', by('later'), 'later') +
            col('Не делаем', by('never'), 'never') + '</div></div>';
        }

        h += '<div class="bl-list">' + (und.length
          ? '<div class="bl-zone-h">не решено <b>' + und.length + '</b></div><div class="bl-grid">' + und.map(card).join('') + '</div>'
          : '<div class="bl-zone-h">все ' + t.n + ' решены</div>') + '</div>';

        // На втором проходе критерии не спрашиваются заново: участник вернулся
        // править карточки, а не переписывать основание (правка владельца 07.08).
        var sm2 = ctx.mech('seal') || {};
        if (!(sm2.returned && sm2.confirmed == null)) {
          h += '<div class="mx-card">' +
            field(ctx, { id: 'mxCrit', f: 'crit', label: 'Почему именно так', rows: 5, val: m.criteria }) + '</div>';
        }
        host.innerHTML = h;

        // ⚠ Обработчиков полей вилки и возражения здесь больше нет: свои варианты в
        // разбор заявок не попадают (правка владельца 07.08).
        // Поля критериев на втором проходе нет — проверка обязательна.
        var cr = host.querySelector('#mxCrit');
        if (cr) cr.addEventListener('input', function () { m.criteria = cr.value; ctx.save(); ctx.sync(); });
      };
      // один раз, снаружи draw() — см. пояснение в M.theses
      wireClick(host, function (e) {
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
          cta: 'Подтвердить →',
          // Обе кнопки вермилионом и рядом, стрелки в разные стороны (решение владельца
          // 07.08): это два равноправных хода — назад или утвердить.
          extra: m.returned ? '' : '<button type="button" class="btn btn-primary" id="sealBack">← Вернуться и изменить</button>'
        };
      }
      // Второй шаг — разговор, а не форма: реплика Агеева и ответ в своей карточке
      // с кнопкой внутри (решение владельца 07.08).
      return { note: '', cta: 'Ответить →', inCard: true };
    },
    // ⚠ На экране после фиксации — ПУЗЫРЬ С ФРАЗОЙ участника, а не сводка
    // «утвердил под давлением» (правка владельца 07.08): сводка — техническая
    // информация для судьи, участнику она ничего не говорит.
    lockedBubble: function (m, ctx) { return ctx.mine(m.why); },
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
      // ⚠ «Утвердил под давлением» / «вернулся и изменил» участнику НЕ показывается
      // (правка владельца 07.08): это словарь маркера. На экране вместо сводки стоит
      // пузырь с его фразой (см. lockedBubble ниже), а поступок уходит судье фактом.
      return 'ответ зафиксирован <span class="bl-locked-hint">строка — во вкладке «Мои ответы»</span>';
    },
    render: function (host, m, ctx) {
      var lm = ctx.mech('list');
      var draw = function () {
        // Реплика перед таблицей: «Дайте посмотрю, что получилось» (scenes.js).
        var h = ctx.speech(ctx.before);
        if (lm) {
          var all = M.list.rows(lm, ctx), t = M.list.sums(lm, ctx);
          var by = function (d) { return all.filter(function (r) { return lm.decided[r.key] === d; }); };
          // Список крупно и раздельно, «в лицо»: участник видит ровно то, что
          // Агеев положит на стол правления.
          h += '<div class="mx-seal-total">' + t.people + ' человек · ' + ctx.num(t.money) + ' млрд' +
            (t.over ? ' <span class="bl-over-tag">вне бюджета</span>' : '') + '</div>';
          [['Берём', 'take'], ['Не делаем', 'never'], ['Не сейчас', 'later']].forEach(function (p) {
            var arr = by(p[1]);
            h += '<div class="bl-col-head" style="margin-top:14px;">' + p[0] + ' <span>· ' + arr.length + '</span></div>' +
              (arr.length
                ? '<ul class="off-list">' + arr.map(function (r) {
                    // ⚠ Автор и цена ОБЯЗАТЕЛЬНЫ (решение владельца 09.08). Одни
                    // заголовки не давали взвесить, с тем ли списком идти к правлению:
                    // из чего сложились люди и деньги в строке сверху, было не видно,
                    // а помнить цены наизусть — не работа участника.
                    return '<li>' + ctx.esc(r.title) +
                      '<span class="off-cost">' + ctx.esc(r.who) + ' · ' + r.people + ' чел. · ' +
                      ctx.num(r.money) + ' млрд</span></li>'; }).join('') + '</ul>'
                : '<p class="bl-empty">пока ничего</p>');
          });
        }
        // Реплики после таблицы: «Ну что, с этим к ним идти? / Финализируем?»
        if (m.confirmed == null) h += ctx.speech(ctx.ask);
        if (m.confirmed != null) {
          // ⚠ Список выше СВЁРНУТ до итоговой строки: участник его только что
          // подтвердил, и повторять три стопки под вопросом Агеева незачем.
          h = '<div class="mx-seal-total">' + (lm ? (function () {
            var t = M.list.sums(lm, ctx);
            return t.people + ' человек · ' + ctx.num(t.money) + ' млрд' +
              (t.over ? ' <span class="bl-over-tag">вне бюджета</span>' : '');
          })() : '') + '</div>';
          // После возврата Агеев спрашивает не «почему уверены», а «что поменяли»:
          // вопрос обязан относиться к тому, что участник только что сделал.
          h += ctx.speech(m.returned && ctx.probeReturn ? ctx.probeReturn : ctx.probe);
          h += '<span class="chat-name chat-name-mine">Вы</span>' +
            '<div class="s2-mine">' +
            field(ctx, { id: 'mxSeal', f: 'seal', rows: 2, ph: 'ваш ответ', label: '',
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
    // Отметил наиболее вероятный — ход называется «Ответить» и стоит под своей
    // карточкой; не отметил — обычный «Разложил» в подвале колонки.
    foot: function (m) {
      return m.bet != null
        ? { note: '', cta: 'Ответить →', inCard: true }
        : { note: '', cta: 'Разложил →' };
    },
    locked: function (m) {
      var n = m.cards.filter(function (t) { return String(t).trim(); }).length;
      return '<b>' + n + '</b> ' + plural(n, 'вариант', 'варианта', 'вариантов') + ' будущего' +
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
        // ⚠ Вопрос Лемеха — РЕПЛИКА, а не подпись поля (правка владельца 09.08).
        // Устроено так же, как вопрос Агеева в печати: пузырь собеседника, под ним
        // своя карточка с полем, кнопка «Ответить» — под карточкой (foot.inCard).
        if (m.bet != null) {
          h += ctx.speech(ctx.probe) +
            '<span class="chat-name chat-name-mine">Вы</span>' +
            '<div class="s2-mine">' +
              field(ctx, { id: 'mxBw', f: 'betwhy', label: '', rows: 2, ph: 'ваш ответ', val: m.betWhy }) +
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
      wireClick(host, function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-bet');
        if (a !== null && a !== undefined && a !== '') {
          var pick = Number(a);
          m.bet = (m.bet === pick) ? null : pick;
          // ⚠ redraw, а не draw: от метки зависит ПОДВАЛ (кнопка «Разложил» меняется
          // на «Ответить» под карточкой), а подвал собирает движок, не механика.
          ctx.save(); ctx.redraw(); return;
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
  // Деления шкалы: концы и две опоры внутри. Не варианты выбора — выбор остаётся
  // непрерывным от 1 до 15, деления только называют шкалу.
  var YTICKS = [1, 5, 10, YMAX];
  M.goal = {
    init: function () { return { years: null, became: '', gave: '' }; },
    yearsLabel: yearsLabel,
    gate: function (m, ctx) {
      if (ctx.isDemo) return '';
      return String(m.became).trim() ? '' : '«Чем стала компания» — обязательно. Срок и цена по желанию.';
    },
    foot: function () { return { note: '', cta: 'Ответил →' }; },
    locked: function (m) {
      // ⚠ Ни «срок не выбран», ни «цена не названа» здесь больше НЕТ: и то и другое —
      // оценка полноты ответа, то есть методология, сказанная участнику вслух
      // (правка владельца 07.08). Что он назвал, а что нет, читает судья.
      return (m.years ? 'срок <b>' + yearsLabel(m.years) + '</b> лет' : 'цель зафиксирована') +
        ' <span class="bl-locked-hint">целиком — во вкладке «Мои ответы»</span>';
    },
    render: function (host, m, ctx) {
      var draw = function () {
        host.innerHTML =
          head('Через сколько лет', '<span class="mx-count mx-opt">по желанию — можно не отвечать</span>') +
          // ⚠ КРУПНОГО ЧИСЛА НЕТ (решение владельца 09.08, вариант 3). Оно меняло
          // ширину и кегль на каждом движении и дёргало ряд. Вместо него шкала
          // подписана делениями, а выбранное деление подсвечивается; точный срок
          // стоит строкой ниже, в ряду постоянной высоты, — там двигаться нечему.
          '<div class="mx-years">' +
            '<input type="range" id="mxY" min="1" max="' + YMAX + '" step="1" value="' + (m.years || 8) + '" ' +
              'aria-label="Через сколько лет" />' +
            '<div class="mx-years-scale" id="mxYs">' +
              YTICKS.map(function (t) {
                return '<span class="mx-tick" data-tick="' + t + '" style="left:' +
                  Math.round(1000 * (t - 1) / (YMAX - 1)) / 10 + '%">' + (t === YMAX ? '15+' : t) + '</span>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="mx-years-foot">' +
            '<span class="mx-years-pick' + (m.years ? '' : ' is-empty') + '" id="mxYv">' +
              (m.years ? 'срок: ' + yearsLabel(m.years) + ' ' + plural(m.years === YMAX ? 15 : m.years, 'год', 'года', 'лет') : 'срок не выбран') +
            '</span>' +
            '<button type="button" class="s2-act" id="mxYc"' + (m.years ? '' : ' disabled') + '>сбросить</button>' +
          '</div>' +
          // Диапазон и «15+» теперь подписаны на самой шкале — в подсказке
          // остаётся только то, чего на шкале не видно: дефолта нет.
          '<p class="mx-hint">Дефолта нет: пока не сдвинете, срок не выбран.</p>' +
          '<div class="mx-card">' +
            field(ctx, { id: 'mxGb', f: 'became', label: 'Чем стала компания', rows: 5, val: m.became }) +
            field(ctx, { id: 'mxGg', f: 'gave', label: 'Чем пришлось пожертвовать', opt: 1, rows: 4, ph: 'необязательно', val: m.gave }) +
          '</div>';
        var y = host.querySelector('#mxY'), v = host.querySelector('#mxYv');
        // Подсветка деления — только точное совпадение. Подсветка «ближайшего»
        // врала: на трёх годах жирнела единица. Где участник на шкале, показывает
        // сам ползунок, точный срок — строка ниже; деление лишь подтверждает,
        // когда он встал ровно на него.
        var paintTicks = function () {
          host.querySelectorAll('.mx-tick').forEach(function (el2) {
            el2.classList.toggle('is-on', !!m.years && Number(el2.dataset.tick) === m.years);
          });
        };
        paintTicks();
        y.addEventListener('input', function () {
          m.years = Number(y.value);
          v.textContent = 'срок: ' + yearsLabel(m.years) + ' ' +
            plural(m.years === YMAX ? 15 : m.years, 'год', 'года', 'лет');
          v.classList.remove('is-empty');
          paintTicks();
          // Кнопка уже на месте — включаем её, а не дорисовываем: перерисовка на
          // каждое движение ползунка и была тем самым «дёргается».
          var cb = host.querySelector('#mxYc');
          if (cb) cb.disabled = false;
          ctx.save();
        });
        // Перерисовка после ползунка — только по «сбросить». На отпускании
        // (change) её нет: она пересоздавала поля цели и сбивала каретку, если
        // участник уже писал «чем стала», а потом двинул срок.
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
    foot: function () { return { note: '', cta: 'Отправить →' }; },
    locked: function () { return '<b>письмо отправлено</b> <span class="bl-locked-hint">все четыре поля — во вкладке «Мои ответы»</span>'; },
    render: function (host, m, ctx) {
      // Напоминание — рамкой и читаемым кеглем, а не служебной строкой: оно про то,
      // чем пользоваться, пока пишешь письмо (правка владельца 07.08).
      host.innerHTML = (ctx.lead ? '<p class="case-intro-marks">' + ctx.esc(ctx.lead) + '</p>' : '') +
        '<div class="mx-card">' + LETTER.map(function (f) {
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
        var cost = r.people + ' чел. · ' + ctx.num(r.money) + ' млрд';
        return '<li><span class="bl-num">' + ctx.blNum(r.id) + '</span> ' + ctx.esc(r.title) +
          (withCost ? '<span class="recap-cost">' + cost + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
    };
    var h = '<p style="margin:0 0 8px;">' + t.people + ' человек из ' + ctx.LIM.people + ' · ' +
      ctx.num(t.money) + ' млрд из ' + ctx.LIM.money + (t.over ? ' — вне бюджета' : ' — в бюджете') + '</p>';
    h += p('Берём (' + t.take + ')', '') + li(by('take'), true);
    h += p('Не делаем (' + t.never + ')', '') + li(by('never'), false);
    h += p('Не сейчас (' + t.later + ')', '') + li(by('later'), false);
    if (String(m.criteria).trim()) h += p('Почему именно так', ctx.br(m.criteria));
    return h;
  };

  // ⚠ Служебного ярлыка («утвердил под давлением») здесь БОЛЬШЕ НЕТ (правка
  // владельца 07.08): во вкладке участник читает то, что сказал, а не как это
  // назвала платформа. Сам поступок никуда не делся — он машинный факт и уходит
  // судье полем m.returned / сравнением слепка, а не строкой на экране.
  M.seal.answerHtml = function (m, ctx) {
    return String(m.why).trim() ? '<p style="margin:0;">' + ctx.br(m.why) + '</p>' : '';
  };

  M.futures.answerHtml = function (m, ctx) {
    return m.cards.filter(function (t) { return String(t).trim(); }).map(function (t, i) {
      return '<p style="margin:0 0 8px;">' + ctx.br(t) +
        (m.bet === i ? '<br /><i>наиболее вероятный' + (String(m.betWhy).trim() ? ': ' + ctx.br(m.betWhy) : '') + '</i>' : '') + '</p>';
    }).join('') || '<i>не заполнено</i>';
  };

  M.goal.answerHtml = function (m, ctx) {
    return (m.years ? '<p style="margin:0;">через ' + yearsLabel(m.years) + ' лет</p>' : '') +
      p('Чем стала компания', ctx.br(m.became)) +
      (String(m.gave).trim() ? p('Чем пришлось пожертвовать', ctx.br(m.gave)) : '');
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
  // Названия верстаков жили в engine.js (MECH_TITLES) и были недоступны никому,
  // кроме экрана участника: кабинет фасилитатора не мог назвать этап и рисовал
  // безымянные точки. Название — свойство самой механики, поэтому дом ему здесь,
  // а engine.js и кабинет читают один список. Написание строчное: это подпись
  // внутри окна, а первую букву поднимает тот, кто ставит её в начало строки.
  window.imp.mechTitles = {
    theses: 'тезисы и связки', variants: 'варианты', list: 'разбор заявок',
    seal: 'чат правления', futures: 'варианты будущего', goal: 'цель', letter: 'письмо правлению'
  };
  window.imp.mechUtil = { field: field, head: head, normCount: normCount, cut: cut, plural: plural, NORM: NORM };
})();

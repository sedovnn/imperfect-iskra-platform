// i(m)perfect — РАБОЧИЕ ОБЛАСТИ, ОПИСАННЫЕ ДЛЯ МОДЕЛИ СЛОВАМИ ЭКРАНА.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Человек узнаёт, что заполнять, из подписей на экране — их
// рисует render() в js/mechanics.js, и вытащить их оттуда без браузера нельзя.
// Значит для прогона модели их приходится перечислить. Файл читают ДВА
// потребителя: пошаговая страница (harness.html) и скрипт прогона по API
// (eval/run_v44f.js). Пока список лежал внутри скрипта, у страницы был бы свой.
//
// ⚠ ГЛАВНОЕ ПРАВИЛО: МОДЕЛЬ ПОЛУЧАЕТ РОВНО ТО ЖЕ, ЧТО ЧЕЛОВЕК, И ТЕМИ ЖЕ СЛОВАМИ.
// Ни слова рубрики, ни намёка на то, что оценивается, ни нашей внутренней лексики.
// Имена полей в JSON — тоже текст, который читает модель: `bet` подсказывает
// «ставка», `gist` — «суть как категория», латиница сама по себе задаёт чужую
// рамку. Поэтому ключи здесь — ПОДПИСИ С ЭКРАНА, а перевод в состояние механики
// делает toState(). Значения решений — тоже слова экрана («берём», «не сейчас»,
// «не делаем»), а не take/later/never.
//
// Трижды поймано владельцем 11.08: «держать или поменять — ПОСТУПОК» (наше слово
// для того, что мы меряем), «состояния мира, а не действия компании» (стена
// методологии между МК-2 и ГА), англоязычная схема с ключами вроде bet и a6.
//
// ⚠ ПРАВИТЕ МЕХАНИКУ — ПЕРЕЧИТАЙТЕ ЭТОТ ФАЙЛ. Ключи, которые отдаёт toState(),
// обязаны совпадать с init() соответствующей механики, иначе гейт отвергнет ответ
// модели, а переносчик будет гонять её по кругу, не понимая, чего от неё хотят.
//
// Подписи ниже сверены с вызовами field() в mechanics.js 11.08: «Название»,
// «Суть», «Где вы это подсмотрели?», «Что из чего вытекает», «Что из этого следует
// для Агеева», «Почему именно это», «Почему именно так», «Чем стала компания»,
// «Чем пришлось пожертвовать», «Самый тревожный симптом», «наиболее вероятный»,
// «Подтвердить», «Вернуться и изменить», плюс четыре подписи письма.

(function () {
  window.imp = window.imp || {};

  var DEC = { 'берём': 'take', 'берем': 'take', 'не сейчас': 'later', 'не делаем': 'never' };
  var DEC_BACK = { take: 'берём', later: 'не сейчас', never: 'не делаем' };

  function numToId(n) {
    var B = window.imp.backlog, i = parseInt(String(n).replace(/\D/g, ''), 10);
    var it = B[i - 1];
    return it ? it.id : null;
  }

  // ── ЧТО ВИДНО В РАБОЧЕЙ ОБЛАСТИ ─────────────────────────────────────────────
  // Материал, который человек читает глазами, а модель обязана получить текстом:
  // иначе она решает вслепую. Заявки нумеруются как на экране — 1…20.
  window.imp.mechMaterial = function (mech, run, h) {
    var B = window.imp.backlog, LIM = window.imp.backlogLimits, M = window.imp.mechanics;
    if (mech === 'list') {
      var rows = B.map(function (it) {
        return '№' + window.imp.backlogNum(it.id) + '. ' + it.title + ' — ' + it.who +
          '. ' + it.people + ' чел., ' + h.num(it.money) + ' млрд.' +
          (it.argument ? '\n    ' + it.argument : '');
      }).join('\n');
      return '\n\nНа столе ' + B.length + ' заявок. Свободных — ' + LIM.people +
        ' человек и ' + LIM.money + ' млрд.\n' + rows;
    }
    if (mech === 'seal') {
      var lm = run.mech && run.mech.list;
      if (!lm) return '';
      var t = M.list.sums(lm, h.ctx());
      var named = function (d) {
        var r = B.filter(function (it) { return lm.decided['a' + it.id] === d; })
          .map(function (it) { return '№' + window.imp.backlogNum(it.id) + ' ' + it.title; });
        return r.length ? r.join('; ') : 'ничего';
      };
      return '\n\nНа столе то, что вы решили. Берём: ' + named('take') + '. Не сейчас: ' +
        named('later') + '. Не делаем: ' + named('never') + '.\nВыходит ' + t.people +
        ' человек и ' + h.num(t.money) + ' млрд' + (t.over ? ' — больше свободного.' : '.') +
        '\nПочему именно так: ' + (lm.criteria || '—');
    }
    return '';
  };

  // Читаемый пересказ решения по заявкам — чтобы переносчик проверял ответ модели
  // глазами, а не разбирал ключи.
  window.imp.listRecap = function (lm, h) {
    var B = window.imp.backlog, M = window.imp.mechanics;
    if (!lm || !lm.decided) return '';
    var t = M.list.sums(lm, h.ctx());
    var zone = function (title, d) {
      var r = B.filter(function (it) { return lm.decided['a' + it.id] === d; })
        .map(function (it) { return '№' + window.imp.backlogNum(it.id) + ' ' + it.title; });
      return title + ' (' + r.length + '): ' + (r.length ? r.join('; ') : 'ничего');
    };
    return [zone('Берём', 'take'), zone('Не сейчас', 'later'), zone('Не делаем', 'never'),
      'Выходит ' + t.people + ' человек и ' + h.num(t.money) + ' млрд' +
      (t.over ? ' — больше свободного' : '')].join('\n');
  };

  // ── ПОЛЯ ────────────────────────────────────────────────────────────────────
  // form  — что отдать модели: пример объекта её же словами. Показывается как есть.
  // toState — перевод ответа модели в состояние механики (ключи из init()).
  // Приём и латиницы тоже: модель может ответить по-своему, и ронять из-за этого
  // прогон незачем. Но ПРЕДЛАГАЕМ только русскую форму.
  window.imp.mechFields = {
    theses: {
      form: {
        'тезисы': [{ 'тезис': '…', 'откуда это в материалах': '… (необязательно)' }],
        'самый тревожный': 'номер тезиса из списка выше',
        'почему именно это': '…',
        'связки': [{ 'тезисы': ['номера тезисов'], 'что из чего вытекает': '…', 'что из этого следует для Агеева': '…' }]
      },
      toState: function (o) {
        var cards = (o['тезисы'] || o.cards || []).map(function (c, i) {
          return { id: i + 1, text: String(c['тезис'] || c.text || c || ''), anchor: String(c['откуда это в материалах'] || c.anchor || '') };
        });
        var first = parseInt(String(o['самый тревожный'] || o.first || '').replace(/\D/g, ''), 10);
        var links = (o['связки'] || o.links || []).map(function (l) {
          return { ids: (l['тезисы'] || l.ids || []).map(function (n) { return parseInt(String(n).replace(/\D/g, ''), 10); }).filter(Boolean),
                   why: String(l['что из чего вытекает'] || l.why || ''),
                   conclusion: String(l['что из этого следует для Агеева'] || l.conclusion || '') };
        });
        return { cards: cards, nextId: cards.length + 1, first: first || null,
                 why: String(o['почему именно это'] || o.why || ''), links: links, pending: [] };
      }
    },

    variants: {
      form: { 'варианты': [{ 'название': '…', 'суть': '…', 'где вы это подсмотрели': '…' }] },
      toState: function (o) {
        return { rays: (o['варианты'] || o.rays || []).map(function (r) {
          return { name: String(r['название'] || r.name || ''), gist: String(r['суть'] || r.gist || ''),
                   from: String(r['где вы это подсмотрели'] || r.from || '') };
        }) };
      }
    },

    list: {
      form: {
        'решения': { '№1': 'берём / не сейчас / не делаем', '№2': '…', '…': '… по каждой из 20' },
        'почему именно так': '…'
      },
      toState: function (o) {
        var src = o['решения'] || o.decided || {}, decided = {};
        Object.keys(src).forEach(function (k) {
          var id = /^a\d+$/.test(k) ? parseInt(k.slice(1), 10) : numToId(k);
          var v = String(src[k] || '').trim().toLowerCase();
          var d = DEC[v] || (['take', 'later', 'never'].indexOf(v) >= 0 ? v : null);
          if (id != null && d) decided['a' + id] = d;
        });
        return { decided: decided, criteria: String(o['почему именно так'] || o.criteria || ''),
                 chosen: {}, obj: {} };
      }
    },

    seal: {
      form: { 'подтверждаю': 'да / нет', 'вернуться и изменить': 'да / нет', 'одна фраза': '…' },
      toState: function (o) {
        var yes = function (v) {
          if (typeof v === 'boolean') return v;
          return /^(да|yes|true|1)$/i.test(String(v || '').trim());
        };
        var back = o['вернуться и изменить'] !== undefined ? o['вернуться и изменить'] : o.returned;
        return { confirmed: yes(o['подтверждаю'] !== undefined ? o['подтверждаю'] : o.confirmed),
                 returned: yes(back),
                 why: String(o['одна фраза'] || o.why || ''), snap: null };
      }
    },

    futures: {
      form: { 'варианты': ['…', '…'], 'наиболее вероятный': 'номер варианта из списка выше',
              'почему именно этот': '…' },
      toState: function (o) {
        var cards = (o['варианты'] || o.cards || []).map(function (c) {
          return String(typeof c === 'string' ? c : (c['вариант'] || c.text || ''));
        });
        var b = o['наиболее вероятный'] !== undefined ? o['наиболее вероятный'] : o.bet;
        var ix = parseInt(String(b == null ? '' : b).replace(/\D/g, ''), 10);
        return { cards: cards, bet: isNaN(ix) ? null : Math.max(0, ix - 1),
                 betWhy: String(o['почему именно этот'] || o.betWhy || '') };
      }
    },

    goal: {
      form: { 'через сколько лет': 'число (необязательно)', 'чем стала компания': '…',
              'чем пришлось пожертвовать': '… (необязательно)' },
      toState: function (o) {
        var y = parseInt(String(o['через сколько лет'] || o.years || '').replace(/\D/g, ''), 10);
        return { years: isNaN(y) ? null : y, became: String(o['чем стала компания'] || o.became || ''),
                 gave: String(o['чем пришлось пожертвовать'] || o.gave || '') };
      }
    },

    letter: {
      form: { 'что мы делаем': '…', 'почему именно это': '…', 'как мы туда идём': '…',
              'почему эта стратегия сработает': '…' },
      toState: function (o) {
        return { what: String(o['что мы делаем'] || o.what || ''),
                 why: String(o['почему именно это'] || o.why || ''),
                 how: String(o['как мы туда идём'] || o.how || ''),
                 works: String(o['почему эта стратегия сработает'] || o.works || '') };
      }
    }
  };

  window.imp.decisionWords = DEC_BACK;
})();

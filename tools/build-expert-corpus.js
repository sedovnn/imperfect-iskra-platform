#!/usr/bin/env node
/* Сборка корпуса карточек для экспертной валидации методологии.
 *
 *   node tools/build-expert-corpus.js 01_methodology_v11.md expert-levels.md <пароль>
 *
 * Читает ДВА файла и кладёт результат в js/expert-corpus.js:
 *
 *   1) карту модели (§5.1–5.3 методологии) — навыки, способности, определения,
 *      метанавыки и инструменты. Нужна блоку В: эксперт судит о полноте карты.
 *   2) 50 карточек уровней (expert-levels.md) — по одной на каждую пару
 *      способность×уровень. Нужны блокам А и Б.
 *   3) отчёт о вычистке — что и сколько раз вырезано из карточек.
 *
 * ⚠ ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ ШАГ, А НЕ РУЧНАЯ ПРАВКА.
 * Методология живёт вне этого репозитория и меняется. Карточка, набранная
 * руками, разойдётся с первоисточником молча — и валидация будет измерять
 * текст, которого в методологии уже нет. Поэтому корпус ВСЕГДА порождается
 * из файла методологии, а версия корпуса записывается рядом с ответами
 * экспертов: два прогона по разным версиям не должны слиться в одну сводку.
 *
 * ⚠ ПОЧЕМУ ВЫЧИСТКА ОБЯЗАТЕЛЬНА.
 * Описание уровня в §10 содержит три класса подсказок, каждая из которых
 * делает задание бессмысленным:
 *   — прямые номера уровней («потолок L3», «чтобы выйти в L4») — 372 штуки
 *     на документ. С ними блок Б решается чтением, а не пониманием.
 *   — коды способностей («это ПП-2», «сигнал ПР») — раздают ответ блока А.
 *   — фамилии участников в примерах-маркерах. Это чужие ответы: отдавать их
 *     внешнему эксперту нельзя, и опознаваемость автора здесь ни при чём.
 * Скрипт вырезает всё три класса и ПАДАЕТ, если что-то осталось: тихо
 * пропущенная подсказка портит весь прогон, а заметна она только в сводке,
 * когда собирать экспертов заново уже поздно.
 */

'use strict';

var fs = require('fs');
var path = require('path');

// ---------------------------------------------------------------- аргументы

var srcPath = process.argv[2];
var lvlPath = process.argv[3];
var PASSWORD = process.argv[4] || process.env.EXPERT_PASS || '';
if (!srcPath || !lvlPath || !PASSWORD) {
  console.error('Использование: node tools/build-expert-corpus.js <методология.md> <описания-уровней.md> <пароль>');
  console.error('  методология    — из неё берётся карта модели: §5.1–5.3.');
  console.error('  описания       — из них берутся пятьдесят карточек: expert-levels.md.');
  console.error('  пароль         — тот, что выдаётся экспертам. Им же корпус ШИФРУЕТСЯ:');
  console.error('                   на сервере не лежит читаемая рубрика, а в исходнике страницы нет пароля.');
  process.exit(2);
}
[srcPath, lvlPath].forEach(function (f) {
  if (!fs.existsSync(f)) { console.error('Файл не найден: ' + f); process.exit(2); }
});

var src = fs.readFileSync(srcPath, 'utf8');
var srcName = path.basename(srcPath);

// Версия корпуса = номер из имени файла ПЛЮС отпечаток содержания §10.
//
// ⚠ Одного имени мало, и это выяснилось дорого. Под именем «v11» пришли два
// РАЗНЫХ документа: в одном §10 весит 93 КБ, в другом 106 КБ, и семь
// способностей из десяти описаны по-разному. Обе сборки назвались бы
// «meth-v11», ответы экспертов легли бы в одну сводку, и мы усреднили бы
// суждения о разных текстах, ничего не заметив. Отпечаток делает такие два
// корпуса разными версиями автоматически, без дисциплины именования.
var crypto = require('crypto');
var vMatch = srcName.match(/v(\d+)/i);
var CORPUS_VERSION_BASE = 'meth-v' + (vMatch ? vMatch[1] : '00');
var CORPUS_VERSION = CORPUS_VERSION_BASE;  // уточняется ниже, когда §10 разобран

// ------------------------------------------------------------------ утилиты

function section(from, to) {
  var i = src.indexOf(from);
  if (i < 0) throw new Error('Не найден раздел: ' + from);
  var j = to ? src.indexOf(to, i + from.length) : -1;
  return src.slice(i, j < 0 ? src.length : j);
}

// Строки markdown-таблицы без шапки и разделителя.
function tableRows(block) {
  return block.split('\n')
    .filter(function (l) { return /^\s*\|/.test(l) && !/^\s*\|[\s|:-]+\|\s*$/.test(l); })
    .map(function (l) {
      return l.trim().replace(/^\||\|$/g, '').split('|').map(function (c) {
        return c.trim().replace(/\*\*/g, '');
      });
    });
}

// Ссылки на разделы методологии («§10», «(§10)») — внутренняя навигация
// документа. Эксперт этих разделов не видит, для него это шум.
function dropSectionRefs(s) {
  return s.replace(/\s*\(§\s*\d+[^)]*\)/g, '').replace(/\s*§\s*\d+/g, '');
}

function squash(s) {
  return s.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// ---------------------------------------------------------- карта модели §5

var CODES = ['МК-1', 'МК-2', 'ПП-1', 'ПП-2', 'АК-1', 'АК-2', 'ПР-1', 'ПР-2', 'ГА-1', 'ГА-2'];
var SKILL_CODES = ['МК', 'ПП', 'АК', 'ПР', 'ГА'];

var invBlock = section('### 5.2 Инвентарь навыков и способностей', '### 5.3');
var defBlock = section('### 5.3 Определения навыков и способностей', '## 6.');

var skillNames = {};
tableRows(invBlock).forEach(function (r) {
  // строки вида: | 1 | Моделирование картины будущего | МК |
  if (r.length === 3 && /^\d+$/.test(r[0]) && SKILL_CODES.indexOf(r[2]) >= 0) {
    skillNames[r[2]] = r[1];
  }
});

var abilityNames = {};
tableRows(invBlock).forEach(function (r) {
  // строки вида: | МК-1 | Оперирование разными временными горизонтами |
  if (r.length === 2 && CODES.indexOf(r[0]) >= 0) abilityNames[r[0]] = r[1];
});

var skillDefs = {};
var abilityDefs = {};
tableRows(defBlock).forEach(function (r) {
  if (r.length === 2) {
    // | **Моделирование картины будущего (МК)** | Определение |
    var m = r[0].match(/\(([А-ЯЁ]{2})\)\s*$/);
    if (m && SKILL_CODES.indexOf(m[1]) >= 0) skillDefs[m[1]] = r[1];
  }
  if (r.length === 3 && CODES.indexOf(r[0]) >= 0) abilityDefs[r[0]] = r[2];
});

CODES.forEach(function (c) {
  if (!abilityNames[c]) throw new Error('Не найдено название способности ' + c + ' (§5.2)');
  if (!abilityDefs[c]) throw new Error('Не найдено определение способности ' + c + ' (§5.3)');
});
SKILL_CODES.forEach(function (c) {
  if (!skillNames[c]) throw new Error('Не найдено название навыка ' + c + ' (§5.2)');
  if (!skillDefs[c]) throw new Error('Не найдено определение навыка ' + c + ' (§5.3)');
});

// Метанавыки и инструменты — из §5.1. Нужны блоку В: методология объявляет,
// что они НЕ входят в оценку, и это решение эксперт должен подтвердить или
// оспорить явно. Без них блок В спрашивал бы «чего не хватает» о карте, из
// которой два этажа вырезаны без объяснения.
var archBlock = section('### 5.1 Архитектура модели', '### 5.2');
var metaskills = [];
var metaLine = archBlock.match(/M1[^.]*?(?=\.\s*\*\*Не входят)/);
if (metaLine) {
  metaLine[0].split(/,\s*(?=M\d)/).forEach(function (part) {
    var m = part.match(/^(M\d)\s*—\s*(.+?)\s*$/);
    if (m) metaskills.push({ code: m[1], name: m[2].replace(/\s*\(.*?\)\s*$/, '').trim() });
  });
}
if (metaskills.length < 4) throw new Error('Метанавыки из §5.1 не разобрались (нашлось ' + metaskills.length + ')');

var toolsLine = archBlock.match(/\*\*Уровень 3 — Инструменты\.\*\*\s*([^.]+\.)/);
var toolsNote = toolsLine ? squash(toolsLine[1]) : '';

// -------------------------------------------- описания уровней: отдельный файл
//
// ⚠ КАРТОЧКИ БОЛЬШЕ НЕ РЕЖУТСЯ ИЗ §10, И ЭТО НЕ УПРОЩЕНИЕ, А СМЕНА ПРЕДМЕТА.
// §10 написан для судьи, у которого перед глазами все пять уровней сразу,
// кейс и граничные тесты. Эксперт видит одну карточку из пятидесяти и не
// знает даже, к какой способности она относится. Всё, что в §10 держится на
// соседнем уровне («но не…», «чтобы выйти в…»), на кейсе («явно акцентировано
// в кейсе») или на перекрёстной ссылке («Отличать от МК-1 L1…»), при нарезке
// превращалось либо в подсказку, либо в обрывок. Последнее особенно дорого:
// разграничения способностей живут в §10 ровно в перекрёстных ссылках, и без
// них пара уровней МК-1/МК-2 на входе неразличима по построению.
//
// Поэтому источник карточек — expert-levels.md, переложение §10 под эту
// задачу. Карта модели (§5.1–5.3) по-прежнему берётся из методологии: справочник
// эксперту показывается тот самый, что в документе.
var lvlSrc = fs.readFileSync(lvlPath, 'utf8');
var lvlName = path.basename(lvlPath);

// Разрез: "## МК-1" → "### L1" → абзацы до следующего "###" или "---".
var levelTexts = {};
(function () {
  var blocks = lvlSrc.split(/\n## (?=(?:МК|ПП|АК|ПР|ГА)-[12]\s*$)/m);
  blocks.forEach(function (b) {
    var head = b.split('\n')[0].trim();
    if (!/^(?:МК|ПП|АК|ПР|ГА)-[12]$/.test(head)) return;
    var byLevel = {};
    b.split(/\n### (?=L[1-5]\s*$)/m).forEach(function (part) {
      var m = part.match(/^L([1-5])\s*\n([\s\S]*)$/);
      if (!m) return;
      var text = m[2].split(/\n---/)[0];
      byLevel[Number(m[1])] = text.trim().split(/\n\s*\n/)
        .map(function (s) { return squash(s); })
        .filter(Boolean);
    });
    levelTexts[head] = byLevel;
  });
})();
CODES.forEach(function (c) {
  if (!levelTexts[c]) throw new Error(lvlName + ': не найден блок способности ' + c);
  for (var L = 1; L <= 5; L++) {
    if (!(levelTexts[c][L] || []).length) throw new Error(lvlName + ': пуст уровень ' + c + ' L' + L);
  }
});

// Ярлыки прогрессии из таблиц §6: по построению говорят номер уровня. В
// переложении их быть не должно — проверяется ниже, в разделе про подсказки.
var PROGRESSION_LABELS = [
  'Не проявлено',
  'Единичный элемент', 'Множественные элементы', 'Интегрированная картина', 'Системная картина',
  'Реактивная позиция', 'Осознанная позиция', 'Интегрирующая позиция', 'Проектирующая позиция',
  'Ближний контур', 'Средний контур', 'Дальний контур', 'За пределами контура'
];

// ------------------------------------------------------------- вычистка

var SURNAMES = ['Шенфельдт', 'Виноградова', 'Кривошея', 'Чернакова', 'Минина', 'Седов', 'Semerikova'];
var scrubLog = { levels: 0, codes: 0, names: 0 };
var dropped = [];   // что именно выброшено, по карточкам

function scrub(text) {
  var t = dropSectionRefs(text);

  // 1. Скобки, внутри которых только ссылка на уровень или на способность:
  //    «(это L3)», «(МК-2)», «(тест 1→2)», «(Виноградова)» — вырезаются целиком.
  t = t.replace(/\s*\(([^()]*)\)/g, function (whole, inner) {
    var onlyTell =
      /^(это\s+)?L[1-5]$/.test(inner.trim()) ||
      /^(?:МК|ПП|АК|ПР|ГА)-[12]$/.test(inner.trim()) ||
      /^это\s+(?:МК|ПП|АК|ПР|ГА)-[12]$/.test(inner.trim()) ||
      /^\d\s*→\s*\d$/.test(inner.trim()) ||
      /^тест\s+\d\s*→\s*\d$/.test(inner.trim()) ||
      SURNAMES.some(function (n) { return inner.indexOf(n) >= 0; });
    if (onlyTell) {
      if (/L[1-5]/.test(inner)) scrubLog.levels++;
      if (/(?:МК|ПП|АК|ПР|ГА)-[12]/.test(inner)) scrubLog.codes++;
      if (SURNAMES.some(function (n) { return inner.indexOf(n) >= 0; })) scrubLog.names++;
      return '';
    }
    return whole;
  });

  // 2. Предложения с прямой ссылкой на номер уровня или на код способности
  //    выбрасываются целиком. Замена «L4» на слово ломает смысл: в этих
  //    предложениях номер и есть содержание («чтобы выйти в L4, нужно…»).
  //    Такое предложение — правило перехода, а не описание уровня, и в
  //    карточке ему не место независимо от подсказки.
  var sentences = t.split(/(?<=[.!?][»")\]]?)\s+/);
  var kept = sentences.filter(function (s) {
    var hasLevel = /L[1-5]/.test(s);
    var hasCode = /(?:МК|ПП|АК|ПР|ГА)-[12]/.test(s) || /\bсигнал\s+(?:МК|ПП|АК|ПР|ГА)\b/.test(s);
    var hasName = SURNAMES.some(function (n) { return s.indexOf(n) >= 0; });
    if (hasLevel) scrubLog.levels++;
    if (hasCode) scrubLog.codes++;
    if (hasName) scrubLog.names++;
    if (hasLevel || hasCode || hasName) dropped.push(s.trim());
    return !hasLevel && !hasCode && !hasName;
  });

  return squash(kept.join(' ')).replace(/\s+([,.;:])/g, '$1');
}

// ------------------------------------------------------------ сборка карточек

var cards = [];
CODES.forEach(function (code) {
  for (var L = 1; L <= 5; L++) {
    // Карточка — абзацы описания, ничего сверх. Прежняя тройка «ярлык + суть +
    // список признаков» повторяла разметку §10; в переложении её нет, и
    // раскрывать в интерфейсе тоже нечего — четыре коротких абзаца читаются
    // целиком. Поле «тип прогрессии» убрано: оно попадало в зашифрованный
    // корпус, никем не читалось и при этом называло логику роста уровней.
    var paras = levelTexts[code][L]
      .map(function (t) { return scrub(t); })
      .filter(function (t) { return t && t.length > 2; });
    var total = paras.join(' ').length;
    if (total < 200) {
      throw new Error(code + ' L' + L + ': после вычистки осталось ' + total +
        ' знаков — карточка пустая, разбор сломался');
    }
    cards.push({
      id: code + '-L' + L,
      ability: code,
      skill: code.slice(0, 2),
      level: L,
      paras: paras,
      len: total
    });
  }
});

if (cards.length !== 50) throw new Error('Карточек ' + cards.length + ', ожидалось 50');

// ------------------------------------------------------- проверка вычистки

var leaks = [];
cards.forEach(function (c) {
  var t = c.paras.join(' ');
  if (/L[1-5]/.test(t)) leaks.push(c.id + ': остался номер уровня');
  if (/(?:МК|ПП|АК|ПР|ГА)-[12]/.test(t)) leaks.push(c.id + ': остался код способности');
  if (/\bкейс/i.test(t)) leaks.push(c.id + ': осталась отсылка к кейсу');
  if (/редк|высш|исключительн/i.test(t)) leaks.push(c.id + ': осталось слово-подсказка о высоте уровня');
  SURNAMES.forEach(function (n) {
    if (t.indexOf(n) >= 0) leaks.push(c.id + ': осталась фамилия ' + n);
  });
  PROGRESSION_LABELS.forEach(function (lab) {
    if (t.indexOf(lab) === 0) leaks.push(c.id + ': карточка начинается ярлыком прогрессии «' + lab + '»');
  });
});
if (leaks.length) {
  console.error('\n❌ В карточках остались подсказки — корпус не собран:');
  leaks.forEach(function (l) { console.error('   ' + l); });
  process.exit(1);
}

// ------------------------------------------------------------------ запись

// ---- версия -------------------------------------------------------------
//
// Отпечаток берётся с ТОГО, ЧТО ВИДИТ ЭКСПЕРТ: пятидесяти карточек и
// справочника, — а не с сырого §10. Разница не косметическая. Версия отвечает
// на один вопрос: «отвечали ли эти двое на одинаковые описания?» — и от неё
// зависят три вещи: недособранный разбор в localStorage сбрасывается при
// несовпадении, порядок карточек у эксперта засеян версией, а сводка
// отказывается сливать ответы разных версий в одну цифру.
//
// Отпечаток по §10 отвечал на другой вопрос — «менялся ли документ», — и
// ошибался в обе стороны. Правка в граничных тестах или ловушках до карточки
// не доходит (они вырезаются), но версию двигала: эксперт посреди разбора
// терял ответы, а сводка объявляла несравнимыми два набора, собранных по
// дословно одинаковым текстам. Ровно это и случилось, когда из МК-1 убрали
// сквозную лестницу: пятьдесят карточек не изменились ни на знак.
var VERSIONED = {
  skills: SKILL_CODES.map(function (sc) {
    return [sc, skillNames[sc], dropSectionRefs(skillDefs[sc])].concat(
      CODES.filter(function (c) { return c.slice(0, 2) === sc; }).map(function (c) {
        return [c, abilityNames[c], dropSectionRefs(abilityDefs[c])].join('·');
      }));
  }),
  cards: cards.map(function (c) {
    return [c.id].concat(c.paras).join('·');
  })
};
CORPUS_VERSION = CORPUS_VERSION_BASE + '.' + require('crypto').createHash('sha1')
  .update(JSON.stringify(VERSIONED).replace(/\s+/g, ' '))
  .digest('hex').slice(0, 6);

var corpus = {
  version: CORPUS_VERSION,
  builtFrom: srcName,
  skills: SKILL_CODES.map(function (sc) {
    return {
      code: sc,
      name: skillNames[sc],
      def: dropSectionRefs(skillDefs[sc]),
      abilities: CODES.filter(function (c) { return c.slice(0, 2) === sc; }).map(function (c) {
        return { code: c, name: abilityNames[c], def: dropSectionRefs(abilityDefs[c]) };
      })
    };
  }),
  cards: cards,
  excluded: { metaskills: metaskills, toolsNote: toolsNote }
};

// ---------------------------------------------------------------- шифрование
//
// Корпус кладётся на сервер ЗАШИФРОВАННЫМ. Причина не в паранойе: это рубрика,
// по которой ставится уровень, и участник ассессмента, прочитавший её до кейса,
// ломает замер. Пароль на клиенте, сверяемый строкой в коде, от этого не
// защищает никак — исходник страницы открывается в два клика, а сам файл
// корпуса просто скачивается по прямому адресу.
//
// Здесь пароль работает КЛЮЧОМ, а не пропуском: в коде его нет вообще, на
// сервере лежит шифротекст, и без пароля он не значит ничего. Побочно это
// снимает и запрет на коммит: зашифрованный корпус можно класть в публичный
// репозиторий и публиковать обычным способом.
//
// PBKDF2-SHA256, 250 000 итераций → AES-256-GCM. GCM выбран ради проверки
// целостности: неверный пароль даёт ошибку расшифровки, а не мусор, который
// страница попыталась бы показать эксперту.
var salt = crypto.randomBytes(16);
var iv = crypto.randomBytes(12);
var ITER = 250000;
var key = crypto.pbkdf2Sync(Buffer.from(PASSWORD, 'utf8'), salt, ITER, 32, 'sha256');
var cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
var plain = Buffer.from(JSON.stringify(corpus), 'utf8');
var ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

var sealed = {
  v: 1,
  version: corpus.version,        // открыто: страница сверяет версию до входа
  builtFrom: srcName,
  iter: ITER,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  ct: ct.toString('base64')
};

var outPath = path.join(__dirname, '..', 'js', 'expert-corpus.js');
var head = '/* СГЕНЕРИРОВАНО tools/build-expert-corpus.js из ' + srcName + '.\n' +
  '   Внутри — 50 описаний уровней, ЗАШИФРОВАННЫЕ паролем эксперта (AES-256-GCM,\n' +
  '   ключ из пароля через PBKDF2). Без пароля файл не значит ничего, поэтому его\n' +
  '   можно и коммитить, и публиковать. Руками не править: правка разойдётся с\n' +
  '   методологией молча. Менять — в методологии, затем пересобрать. */\n';
fs.writeFileSync(outPath, head + 'window.IMP_EXPERT_SEALED = ' + JSON.stringify(sealed, null, 2) + ';\n', 'utf8');

// Проверяем расшифровку прямо здесь: молча записать нечитаемый файл — худший
// исход, потому что обнаружится он на эксперте, а не на сборке.
(function () {
  var k2 = crypto.pbkdf2Sync(Buffer.from(PASSWORD, 'utf8'), salt, ITER, 32, 'sha256');
  var d = crypto.createDecipheriv('aes-256-gcm', k2, iv);
  d.setAuthTag(ct.slice(ct.length - 16));
  var out = Buffer.concat([d.update(ct.slice(0, ct.length - 16)), d.final()]);
  var back = JSON.parse(out.toString('utf8'));
  if (back.cards.length !== 50) throw new Error('обратная расшифровка дала ' + back.cards.length + ' карточек');
})();

// ⚠ КЛЮЧ КЭША ПОДНИМАЕТ САМА СБОРКА, И БОЛЬШЕ ЭТОГО СДЕЛАТЬ НЕКОМУ. Соль и IV здесь
// случайные на каждую сборку — так и должно быть, — поэтому шифротекст меняется даже на
// том же тексте методологии, и sha этого файла ничего не говорит о его содержании:
// проверка ключей (eval/lint_cache_keys.js) его не сверяет и сверять не может. Значит
// единственное место, которое ЗНАЕТ, что файл переписан, — вот это. Без подъёма ключа
// эксперт открывает старый корпус: адрес файла не изменился, обновление страницы не
// помогает — ровно тот случай, из-за которого проверка ключей и появилась.
var bumped = (function () {
  var dir = path.join(__dirname, '..');
  var re = /(js\/expert-corpus\.js\?v=)(\d+)/g;
  var pages = fs.readdirSync(dir).filter(function (f) { return /\.html$/.test(f); });
  var seen = {};
  pages.forEach(function (p) {
    var src = fs.readFileSync(path.join(dir, p), 'utf8');
    if (!re.test(src)) return;
    re.lastIndex = 0;
    src.replace(re, function (all, head, n) { seen[p] = Number(n); return all; });
  });
  var keys = Object.keys(seen);
  if (!keys.length) return null;
  // Один ключ на все страницы: две копии одного файла с разными ключами — это две
  // разные копии в кэше браузера, и какая достанется, зависит от порядка открытия.
  var next = Math.max.apply(null, keys.map(function (p) { return seen[p]; })) + 1;
  keys.forEach(function (p) {
    var f = path.join(dir, p);
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(re, '$1' + next), 'utf8');
  });
  return { next: next, pages: keys };
})();

// ------------------------------------------------------------------ отчёт

var lens = cards.map(function (c) { return c.len; }).sort(function (a, b) { return a - b; });
console.log('✓ Корпус собран: ' + outPath);
console.log('  версия           ' + CORPUS_VERSION + '  (из ' + srcName + ')');
console.log('  пароль           ' + PASSWORD + '  — им зашифровано, его же выдавать экспертам');
console.log('                   сменить пароль = пересобрать; старая ссылка перестанет открываться');
console.log('  карточек         ' + cards.length + '  (10 способностей × 5 уровней)');
console.log('  длина карточки   мин ' + lens[0] + ', медиана ' + lens[25] + ', макс ' + lens[49] + ' знаков');
console.log('  вычищено         ' + scrubLog.levels + ' ссылок на номер уровня, ' +
  scrubLog.codes + ' кодов способностей, ' + scrubLog.names + ' упоминаний фамилий');
console.log('  утечек           нет');
console.log(bumped
  ? '  ключ кэша        ?v=' + bumped.next + '  (поднят в ' + bumped.pages.join(', ') + ')'
  : '  ключ кэша        ⚠ ни одна страница не грузит js/expert-corpus.js — поднимать нечего');

// Длина карточки коррелирует с уровнем (верхние уровни в методологии описаны
// подробнее). Это подсказка, которую вычисткой не убрать, не переписав саму
// методологию, — поэтому она НАЗВАНА здесь и вынесена в сводку отдельной
// строкой: expert-report.js считает, сколько набрал бы эксперт, ранжирующий
// карточки одной только длиной. Точность экспертов сравнивается с этим
// порогом, а не с нулём.
var byLevel = [1, 2, 3, 4, 5].map(function (l) {
  var a = cards.filter(function (c) { return c.level === l; }).map(function (c) { return c.len; });
  return Math.round(a.reduce(function (s, x) { return s + x; }, 0) / a.length);
});
// Сообщение зависит от замера, а не печатается всегда: пока карточки резались
// из §10, верхние уровни были стабильно длиннее нижних, и фраза «длина работает
// подсказкой» была верна. На выровненных описаниях она была бы неправдой,
// напечатанной собственным инструментом.
var spread = Math.max.apply(null, byLevel) - Math.min.apply(null, byLevel);
var rising = byLevel.every(function (v, i) { return i === 0 || v >= byLevel[i - 1]; });
console.log('  длина по L1..L5  ' + byLevel.join(' / ') + ' знаков' +
  (rising && spread > 80 ? ' — верхние уровни длиннее,' : ''));
console.log('                   ' + (rising && spread > 80
  ? 'длина работает подсказкой; сводка считает поправку на это.'
  : 'разброс ' + spread + ' зн., порядок по длине не читается; поправку сводка всё равно считает.'));

// Вычистка режет предложениями, и обрубок иногда теряет то, на что ссылался
// («Границу открывают ТАКЖЕ…»). Автоматически это не чинится — фразу должен
// переписать человек. Поэтому подозрительные начала названы поимённо.
var DANGLING = /^(Это|Этот|Эта|Эти|Такой|Такая|Такие|Он|Она|Они|Оба|Здесь|Там|Тогда|Поэтому|Границу|Кроме того|Также|Тоже|Второй|Второе|Первый)\b/;
var dangling = cards.filter(function (c) {
  var first = c.paras[0] || '';
  return DANGLING.test(first) || /\bтакже\b/.test(first.split(/(?<=[.!?])\s/)[0] || '');
});
if (dangling.length) {
  console.log('\n  ⚠ ВЫЧИТАТЬ ГЛАЗАМИ — карточка начинается со ссылки на то, чего в ней нет');
  console.log('    (вычистка вырезала предложение, на которое опиралось следующее):');
  dangling.forEach(function (c) {
    console.log('    ' + c.id + '  «' + (c.paras[0] || '').slice(0, 78) + '…»');
  });
}

if (dropped.length) {
  console.log('\n  выброшенные предложения (в карточку не попали):');
  dropped.forEach(function (d) { console.log('    · ' + d.slice(0, 96) + (d.length > 96 ? '…' : '')); });
}

// Длина сама по себе способна выдать порядок уровней. Где она выдаёт его
// целиком, блок Б валидации становится пустым: побить идеальный порог нельзя.
// Карточка теперь показывается на экране целиком, поэтому видимая длина — это
// вся её длина.
function visibleLen(c) { return c.len; }
var perfect = [];
CODES.forEach(function (code) {
  var five = cards.filter(function (c) { return c.ability === code; })
    .sort(function (a, b) { return visibleLen(a) - visibleLen(b); });
  if (five.every(function (c, i) { return c.level === i + 1; })) perfect.push(code);
});
if (perfect.length) {
  console.log('\n  ⚠ порядок уровней читается по одной длине карточки: ' + perfect.join(', '));
  console.log('    там блок Б ничего не измерит — описания уровней стоит выровнять по объёму.');
}

var short = cards.filter(function (c) { return c.len < 400; });
if (short.length) {
  console.log('\n  ⚠ короткие карточки (стоит вычитать глазами):');
  short.forEach(function (c) { console.log('    ' + c.id + '  ' + c.len + ' зн.  ' + c.paras[0].slice(0, 70) + '…'); });
}

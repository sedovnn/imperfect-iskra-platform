#!/usr/bin/env node
/* Сборка корпуса карточек для экспертной валидации методологии.
 *
 *   node tools/build-expert-corpus.js ~/Desktop/FP/01_methodology_v11.md
 *
 * Читает методологию, вынимает из неё три вещи и кладёт в js/expert-corpus.js:
 *
 *   1) карту модели (§5.1–5.3) — навыки, способности, определения, метанавыки
 *      и инструменты. Нужна блоку В: эксперт судит о полноте карты.
 *   2) 50 карточек уровней (§10) — по одной на каждую пару способность×уровень.
 *      Нужны блокам А и Б.
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
var PASSWORD = process.argv[3] || process.env.EXPERT_PASS || '';
if (!srcPath || !PASSWORD) {
  console.error('Использование: node tools/build-expert-corpus.js <путь к методологии.md> <пароль>');
  console.error('  Пароль — тот, что выдаётся экспертам. Им же корпус ШИФРУЕТСЯ:');
  console.error('  на сервере не лежит читаемая рубрика, а в исходнике страницы нет пароля.');
  process.exit(2);
}
if (!fs.existsSync(srcPath)) {
  console.error('Файл не найден: ' + srcPath);
  process.exit(2);
}

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

// ---------------------------------------------------- описания уровней §10

var lvlBlock = section('### МК-1 · Оперирование');

// Разрез по способностям: заголовок вида "### МК-1 · Название".
var abilityChunks = {};
var abRe = /^### ((?:МК|ПП|АК|ПР|ГА)-[12]) · .*$/gm;
var marks = [];
var m;
while ((m = abRe.exec(lvlBlock))) marks.push({ code: m[1], at: m.index });
marks.forEach(function (mk, i) {
  var end = i + 1 < marks.length ? marks[i + 1].at : lvlBlock.length;
  abilityChunks[mk.code] = lvlBlock.slice(mk.at, end);
});
CODES.forEach(function (c) {
  if (!abilityChunks[c]) throw new Error('В §10 не найден блок способности ' + c);
});

// Отпечаток версии считается НИЖЕ, когда карточки собраны, — см. «версия».

// Внутри способности: разрез по "L1 · ярлык", "L2 · ярлык", …
// Ярлыки прогрессии («Ближний контур», «Реактивная позиция», «Единичный
// элемент») приходят из таблиц §6 и по построению говорят номер уровня —
// в карточку они не попадают. Хвост после тире — содержательный, он остаётся.
var PROGRESSION_LABELS = [
  'Не проявлено',
  'Единичный элемент', 'Множественные элементы', 'Интегрированная картина', 'Системная картина',
  'Реактивная позиция', 'Осознанная позиция', 'Интегрирующая позиция', 'Проектирующая позиция',
  'Ближний контур', 'Средний контур', 'Дальний контур', 'За пределами контура'
];

function splitHeader(line) {
  // "L4 · Дальний контур — «другая роль»" → {level:4, tail:'«другая роль»'}
  // ⚠ Заголовок бывает жирным: **L1 · Не проявлено**. В одном экспорте
  // методологии так набраны пять уровней из пятидесяти, в другом — целая
  // способность. Сборщик на таком падал с «найдено уровней 0» — падал честно,
  // но чинить это каждый раз руками нельзя: разметка документа не наша.
  var h = line.replace(/^\*\*|\*\*$/g, '').match(/^L([1-5])\s*·\s*(.*)$/);
  if (!h) return null;
  var rest = h[2].trim();
  var tail = '';
  var dash = rest.indexOf('—');
  if (dash >= 0) { tail = rest.slice(dash + 1).trim(); rest = rest.slice(0, dash).trim(); }
  // если перед тире стоял не ярлык прогрессии, а содержание — оно тоже нужно
  if (PROGRESSION_LABELS.indexOf(rest) < 0 && rest) tail = tail ? rest + ' — ' + tail : rest;
  return { level: Number(h[1]), tail: tail };
}

// ⚠ Без \b: в JS граница слова считается по ASCII, между «Т» и «.» её нет, и
// /ДЕЛАЕТ\b/ по кириллице не срабатывает НИКОГДА. С этой ошибкой обе секции
// молча уезжали в «суть», и в карточку попадало «НЕ ДЕЛАЕТ» — то есть правило
// перехода на следующий уровень, ровно то, что карточка показывать не должна.
var DOES_RE = /^(?:ЧТО\s+)?ДЕЛАЕТ(?![А-ЯЁ])/;
var NOT_RE = /^(?:ЧТО\s+)?НЕ\s+ДЕЛАЕТ(?![А-ЯЁ])/;
var STOP_RE = /^(?:МАРКЕР|Маркер|Пример-маркер|Пограничные ловушки|Ловушка|Быстрая эвристика|Отличие от|Сквозная лестница|Три сквозных|Стены\.)/;

// ⚠ И ещё одна разметка. В новом экспорте МК-1 переписана списком с жирными
// заголовками секций: «- **ДЕЛАЕТ:** …», «- **НЕ ДЕЛАЕТ:** …»,
// «**Пограничные ловушки:**». Все три правила выше якорятся на начало строки,
// поэтому «- **» им не по зубам: секции не опознавались вовсе, и весь блок
// уровня уезжал в «суть». В карточках МК-1 оказывались и «НЕ ДЕЛАЕТ», и обрывки
// пограничных ловушек — то есть правила перехода на соседний уровень, ровно то,
// что эксперт видеть не должен. Разметка документа не наша и в следующем
// экспорте может смениться опять, поэтому снимаем её здесь.
var LISTED_HEAD_RE = /^(?:[-*•]\s+)?\*\*/;

function unlist(line) {
  if (!LISTED_HEAD_RE.test(line)) return { text: line, listed: false };
  return { text: line.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '').trim(), listed: true };
}

function parseLevels(code) {
  var chunk = abilityChunks[code];
  var lines = chunk.split('\n');
  var out = [];
  var cur = null;

  lines.forEach(function (raw) {
    var line = raw.trim();
    var hdr = splitHeader(line);
    if (hdr) {
      if (cur) out.push(cur);
      cur = { level: hdr.level, tail: hdr.tail, sut: [], does: [], where: 'sut' };
      return;
    }
    if (!cur || !line) return;
    var head = unlist(line);
    if (NOT_RE.test(head.text) || STOP_RE.test(head.text)) { cur.where = 'stop'; return; }
    if (DOES_RE.test(head.text)) {
      cur.where = 'does';
      // «ДЕЛАЕТ: описывает проблемы…» — содержание на той же строке
      var inline = head.text.replace(DOES_RE, '').replace(/^\s*(?:—[^:]*)?[:.]\s*/, '').trim();
      // Куда его класть, решает разметка, а не длина. В старом формате на этой
      // строке лежит первый признак — он и должен быть первым пунктом списка. В
      // новом (списочном) за «ДЕЛАЕТ:» идёт связный абзац-сводка, а признаки
      // перечислены ниже отдельными строками: сводке место в «сути», иначе
      // карточка МК-1 начиналась бы пунктом на пять строк рядом с тремя
      // короткими — там, где у остальных девяти способностей стоит абзац.
      if (inline) (head.listed ? cur.sut : cur.does).push(inline);
      return;
    }
    // Строка целиком в скобках — редакторская ремарка составителя методологии
    // («Здесь и в L5 „интегрированная“ означает…»), а не описание уровня.
    // Раньше она склеивалась со следующей фразой в одно «предложение», и
    // вычистка по ссылке на уровень уносила ОБЕ: у АК-1 карточка начиналась с
    // «Границу открывают также…» — с «также» без того, к чему оно также.
    if (/^\(.*\)$/.test(line)) return;
    if (cur.where === 'sut') cur.sut.push(line.replace(/^Суть(?:\s+уровня)?\.\s*/, ''));
    else if (cur.where === 'does') cur.does.push(line);
  });
  if (cur) out.push(cur);

  if (out.length !== 5) throw new Error(code + ': найдено уровней ' + out.length + ', ожидалось 5');
  out.forEach(function (l, i) {
    if (l.level !== i + 1) throw new Error(code + ': уровни идут не по порядку');
  });
  return out;
}

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
  var chunk = abilityChunks[code];
  var progM = chunk.match(/\*\*Тип прогрессии:\*\*\s*(.+)/);
  var progression = progM ? progM[1].trim() : '';

  parseLevels(code).forEach(function (lv) {
    // Карточка = ярлык-хвост + «суть» + «ДЕЛАЕТ».
    // «НЕ ДЕЛАЕТ», маркеры и ловушки в карточку не идут: первое — правило
    // перехода («чтобы выйти в L4…»), второе — чужие ответы с фамилиями,
    // третье — тоже про границы, а не про уровень. Карточка должна нести то,
    // по чему уровень опознаётся, а не то, чем он отличается от соседнего:
    // иначе эксперт восстанавливает порядок из формулировок «выше/ниже», и
    // блок Б перестаёт что-либо мерить.
    // Три поля, а не одна склейка: «суть» и «делает» — разные регистры (образ
    // уровня и наблюдаемые признаки), и склеенные через пробел они читались
    // как оборванная фраза («…поломки. описывает проблемы…»). На экране это
    // два абзаца, в сводке — один текст.
    var lead = scrub(lv.tail ? lv.tail.replace(/^«|»$/g, '') : '');
    var gist = scrub(lv.sut.join(' '));
    if (gist) gist = gist.charAt(0).toUpperCase() + gist.slice(1);

    // ⚠ СПИСОК ОСТАЁТСЯ СПИСКОМ. Здесь стояло lv.does.join(' ') — четыре
    // отдельные строки «Ярлык. Пояснение» склеивались в один абзац, и ярлыки
    // превращались в обрывки посреди прозы: «Планирование от цели. Цель
    // зафиксирована первой… Крупноблочная декомпозиция. Путь разложен…».
    // Читалось как набор несвязанных огрызков — владелец так и сказал, открыв
    // карточки. Текст при этом был дословный; сломана была структура, а
    // структура здесь и есть половина смысла.
    var does = lv.does.map(function (line) { return scrub(line); })
      .filter(function (t) { return t && t.length > 2; })
      .map(function (t) { return t.charAt(0).toUpperCase() + t.slice(1); });

    var total = (lead + gist + does.join(' ')).length;
    if (total < 40) {
      throw new Error(code + ' L' + lv.level + ': после вычистки осталось ' + total +
        ' знаков — карточка пустая, разбор сломался');
    }
    cards.push({
      id: code + '-L' + lv.level,
      ability: code,
      skill: code.slice(0, 2),
      level: lv.level,
      progression: progression,
      lead: lead,
      gist: gist,
      does: does,
      len: total
    });
  });
});

if (cards.length !== 50) throw new Error('Карточек ' + cards.length + ', ожидалось 50');

// ------------------------------------------------------- проверка вычистки

var leaks = [];
cards.forEach(function (c) {
  var t = [c.lead, c.gist].concat(c.does || []).join(' ');
  if (/L[1-5]/.test(t)) leaks.push(c.id + ': остался номер уровня');
  if (/(?:МК|ПП|АК|ПР|ГА)-[12]/.test(t)) leaks.push(c.id + ': остался код способности');
  SURNAMES.forEach(function (n) {
    if (t.indexOf(n) >= 0) leaks.push(c.id + ': осталась фамилия ' + n);
  });
  PROGRESSION_LABELS.forEach(function (lab) {
    if (c.lead.indexOf(lab) === 0 || c.gist.indexOf(lab) === 0) {
      leaks.push(c.id + ': карточка начинается ярлыком прогрессии «' + lab + '»');
    }
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
    return [c.id, c.lead, c.gist].concat(c.does || []).join('·');
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
console.log('  длина по L1..L5  ' + byLevel.join(' / ') + ' знаков — верхние уровни длиннее,');
console.log('                   длина работает подсказкой; сводка считает поправку на это.');

// Вычистка режет предложениями, и обрубок иногда теряет то, на что ссылался
// («Границу открывают ТАКЖЕ…»). Автоматически это не чинится — фразу должен
// переписать человек. Поэтому подозрительные начала названы поимённо.
var DANGLING = /^(Это|Этот|Эта|Эти|Такой|Такая|Такие|Он|Она|Они|Оба|Здесь|Там|Тогда|Поэтому|Границу|Кроме того|Также|Тоже|Второй|Второе|Первый)\b/;
var dangling = cards.filter(function (c) {
  return DANGLING.test(c.gist) || /\bтакже\b/.test(c.gist.split(/(?<=[.!?])\s/)[0] || '');
});
if (dangling.length) {
  console.log('\n  ⚠ ВЫЧИТАТЬ ГЛАЗАМИ — карточка начинается со ссылки на то, чего в ней нет');
  console.log('    (вычистка вырезала предложение, на которое опиралось следующее):');
  dangling.forEach(function (c) {
    console.log('    ' + c.id + '  «' + c.gist.slice(0, 78) + '…»');
  });
}

if (dropped.length) {
  console.log('\n  выброшенные предложения (в карточку не попали):');
  dropped.forEach(function (d) { console.log('    · ' + d.slice(0, 96) + (d.length > 96 ? '…' : '')); });
}

// §10 методологии обещает у каждого уровня «Суть» и поведенческие признаки.
// Там, где «Сути» нет, карточка держится на одном перечне признаков — читать
// её труднее, и в блоке Б она визуально короче соседних. Это находка про сам
// документ, а не про сборку, поэтому названа отдельно.
var noGist = cards.filter(function (c) { return !c.gist; });
if (noGist.length) {
  console.log('\n  ⚠ уровни без блока «Суть» в методологии (' + noGist.length + '):');
  console.log('    ' + noGist.map(function (c) { return c.id; }).join(', '));
  console.log('    карточка собрана из одних признаков — стоит дописать «Суть» в §10.');
}

// Длина сама по себе способна выдать порядок уровней. Где она выдаёт его
// целиком, блок Б валидации становится пустым: побить идеальный порог нельзя.
// Считаем по ВИДИМОЙ части карточки — ярлык плюс «суть», как её показывает
// экран раскладки.
function visibleLen(c) {
  var body = c.gist || (c.does || []).join(' ');
  return (c.lead ? c.lead.length + 1 : 0) + body.length;
}
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

var short = cards.filter(function (c) { return c.len < 150; });
if (short.length) {
  console.log('\n  ⚠ короткие карточки (стоит вычитать глазами):');
  short.forEach(function (c) { console.log('    ' + c.id + '  ' + c.len + ' зн.  ' + (c.gist || c.lead).slice(0, 70) + '…'); });
}

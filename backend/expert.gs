/**
 * i(m)perfect — БЭКЕНД ЭКСПЕРТНОЙ ВАЛИДАЦИИ МЕТОДОЛОГИИ.
 *
 * Отдельный скрипт и отдельная таблица. НЕ добавлять это в скрипт ассессмента:
 * там прогоны, ответы, судейство и правки, здесь — другие данные, другой объём
 * и срок жизни в несколько недель. Общий скрипт связал бы их отказы: сломался
 * бы один лист — встали бы оба экрана.
 *
 * КАК ПОСТАВИТЬ (пять минут, по шагам — в backend/EXPERT.md):
 *   1. Новая Google-таблица → Расширения → Apps Script.
 *   2. Вставить сюда весь этот файл, заменив содержимое Code.gs.
 *   3. Поменять TEAM_PASSWORD ниже.
 *   4. Развернуть → Новое развёртывание → тип «Веб-приложение»;
 *      «Запуск от имени» — Я, «У кого есть доступ» — Все.
 *   5. Скопировать URL и вставить в js/expert-api.js → EXPERT_API_URL.
 *
 * ⚠ После КАЖДОЙ правки этого файла нужно «Развернуть → Управление
 * развёртываниями → карандаш → Версия: новая». Без этого по старому URL
 * продолжает работать старый код — самая частая потеря времени здесь.
 */

// Пароль КОМАНДЫ — им сводка забирает ответы с сервера. Это НЕ тот пароль,
// который выдаётся экспертам: тот шифрует описания и живёт в другом месте.
// Совпадать они не должны: эксперт, знающий пароль команды, видит чужие ответы.
var TEAM_PASSWORD = 'смените-меня';

var SHEET_NAME = 'experts';

// Ячейка Google Sheets держит 50 000 знаков. Полный снимок эксперта — примерно
// 20–25 КБ, влезает с запасом, но проверять надо: молча обрезанный JSON
// развалит сводку, и обнаружится это через неделю на сборе ответов.
var CELL_LIMIT = 50000;

var HEADERS = ['key', 'corpus', 'name', 'startedAt', 'finishedAt', 'updatedAt', 'json'];

// ---------------------------------------------------------------------------

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return out({ ok: false, error: 'пустой запрос' });
    var req = JSON.parse(e.postData.contents);

    switch (req.action) {
      case 'saveExpert':  return out(saveExpert(req));
      case 'loadExpert':  return out(loadExpert(req));
      case 'loadExperts': return out(loadExperts(req));
      default:            return out({ ok: false, error: 'неизвестное действие: ' + req.action });
    }
  } catch (err) {
    // Ошибку возвращаем текстом, а не роняем скрипт: клиент по «ok:false»
    // положит снимок в очередь и повторит, а мы увидим причину в ответе.
    return out({ ok: false, error: String(err) });
  }
}

// Открытый в браузере адрес разворачивания — проверка, что скрипт жив и это
// именно он. Без неё непонятно, куда смотреть, когда экран говорит «не
// отправлено»: в адрес, в развёртывание или в сам код.
function doGet() {
  var sh = sheet();
  return out({
    ok: true,
    service: 'i(m)perfect · экспертная валидация',
    experts: Math.max(0, sh.getLastRow() - 1),
    passwordSet: TEAM_PASSWORD !== 'смените-меня'
  });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rowOf(sh, key) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var keys = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(key)) return i + 2;
  }
  return 0;
}

// ---------------------------------------------------------------------------

function saveExpert(req) {
  var key = String(req.key || '').trim();
  if (!key) return { ok: false, error: 'нет номера эксперта' };
  var ex = req.expert;
  if (!ex) return { ok: false, error: 'нет данных' };

  var json = JSON.stringify(ex);
  if (json.length > CELL_LIMIT) {
    return { ok: false, error: 'снимок ' + json.length + ' знаков, лимит ячейки ' + CELL_LIMIT };
  }

  var who = ex.who || {};
  var name = ((who.first || '') + ' ' + (who.last || '')).trim();
  var row = [key, ex.corpus || '', name, ex.startedAt || '', ex.finishedAt || '',
    new Date().toISOString(), json];

  // ⚠ БЛОКИРОВКА ОБЯЗАТЕЛЬНА. Экран сохраняется каждые полторы секунды, а
  // экспертов несколько. Без замка два одновременных запроса читают одну и ту
  // же «последнюю строку» и пишут в неё оба: один ответ затирает другой, и
  // виден этот исход только в сводке, где эксперта не хватает.
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet();
    var at = rowOf(sh, key);
    // upsert, а не append: снимок приходит целиком и каждый раз новый, при
    // append лист вырос бы до тысяч строк на одного человека.
    if (at) sh.getRange(at, 1, 1, HEADERS.length).setValues([row]);
    else sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function loadExpert(req) {
  var key = String(req.key || '').trim();
  if (!key) return { ok: false, error: 'нет номера' };
  var sh = sheet();
  var at = rowOf(sh, key);
  if (!at) return { ok: false };

  // Пароль здесь не спрашивается намеренно. Номер знает только его владелец, а
  // без пароля ЭКСПЕРТА страница всё равно не расшифрует ни описания, ни этот
  // ответ: ключ от них лежит не на сервере.
  var json = sh.getRange(at, HEADERS.length).getValue();
  try {
    return { ok: true, expert: JSON.parse(json) };
  } catch (err) {
    return { ok: false, error: 'строка ' + at + ' не разбирается как JSON' };
  }
}

function loadExperts(req) {
  if (String(req.password || '') !== TEAM_PASSWORD) {
    return { ok: false, error: 'пароль не принят' };
  }
  var sh = sheet();
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, experts: [] };

  var rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var experts = [];
  var broken = [];
  rows.forEach(function (r) {
    // Фильтр по версии корпуса — не украшение: ответы по разным версиям
    // методологии относятся к разным текстам, и сведённые в одну цифру врут.
    if (req.corpus && String(r[1]) !== String(req.corpus)) return;
    try { experts.push(JSON.parse(r[6])); } catch (err) { broken.push(String(r[0])); }
  });
  var res = { ok: true, experts: experts };
  // Молча пропустить нечитаемую строку значит показать сводку на неполных
  // данных как на полных. Пусть лучше будет видно, кого не хватает.
  if (broken.length) res.broken = broken;
  return res;
}

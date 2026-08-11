// i(m)perfect — КЕЙС В ТЕКСТ ДЛЯ МОДЕЛИ, С СОХРАНЁННЫМИ ТАБЛИЦАМИ.
//
// ЗАЧЕМ. В приложениях кейса семь таблиц, и в них вся числовая опора: доли сессий,
// индексы CPM, поквартальный рост. Человек видит сетку. Модель получала кашу:
// страница брала текст через innerText, а он выбрасывает границы ячеек, и строка
// «Доля сессий с ответом без перехода, %» превращалась в «%911131518212326» —
// восемь чисел, склеенных в одно (поймано владельцем 11.08). Угадать, где кончается
// 9 и начинается 11, нельзя; значит любая ссылка модели на эти данные была бы
// выдумкой. Скрипт по API рвал строки по </tr>, но столбцы всё равно приходилось
// угадывать по пробелам.
//
// ЧИСТАЯ РАБОТА СО СТРОКОЙ, БЕЗ DOM. Поэтому один и тот же код читают и браузер
// (harness.html), и node (eval/run_v44f.js) — модель в обоих случаях получает
// побайтово одинаковый текст. Через innerText такого паритета не добиться: в node
// его нет вовсе.
//
// ФОРМАТ. Строка таблицы — ячейки через « | », пустая ячейка — «—», чтобы число
// столбцов читалось и в углу шапки:
//   — | 1К24 | 2К24 | 3К24 | 4К24 | 1К25 | 2К25 | 3К25 | 4К25
//   Доля сессий с ответом без перехода, % | 9 | 11 | 13 | 15 | 18 | 21 | 23 | 26

(function () {
  window.imp = window.imp || {};

  var ENT = [[/&nbsp;/g, ' '], [/&laquo;/g, '«'], [/&raquo;/g, '»'], [/&mdash;/g, '—'],
             [/&ndash;/g, '–'], [/&thinsp;/g, ' '], [/&hellip;/g, '…'],
             [/&quot;/g, '"'], [/&#39;/g, "'"], [/&lt;/g, '<'], [/&gt;/g, '>'], [/&amp;/g, '&']];

  function ents(s) { ENT.forEach(function (p) { s = s.replace(p[0], p[1]); }); return s; }

  function cell(html) {
    return ents(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  }

  // Таблица → строки с разделителем. Порядок ячеек сохраняется, пустые не теряются:
  // без них съезжает соответствие «столбец → год».
  function tableToText(tableHtml) {
    var rows = [], re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, m;
    while ((m = re.exec(tableHtml))) {
      var cells = [], cre = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi, c;
      while ((c = cre.exec(m[1]))) cells.push(cell(c[2]) || '—');
      if (cells.length) rows.push(cells.join(' | '));
    }
    return rows.join('\n');
  }

  // html — содержимое файла кейса целиком. Возвращает текст от #caseContent и до
  // конца, с таблицами в читаемом виде.
  window.imp.caseToText = function (html) {
    var i = String(html).indexOf('id="caseContent"');
    if (i < 0) return null;
    var s = String(html).slice(i);

    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    // Таблицы — до общего срезания тегов, иначе от них останутся склеенные числа.
    s = s.replace(/<table\b[\s\S]*?<\/table>/gi, function (t) { return '\n' + tableToText(t) + '\n'; });
    s = s.replace(/<\/(p|li|h1|h2|h3|h4|h5|tr|div|summary|dt|dd)>/gi, '\n')
         .replace(/<br\s*\/?>/gi, '\n')
         .replace(/<[^>]+>/g, ' ');
    s = ents(s);
    return s.replace(/[ \t]+/g, ' ')
            .replace(/ *\n */g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
  };
})();

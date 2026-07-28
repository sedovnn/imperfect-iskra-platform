// i(m)perfect — типограф: неразрывные пробелы там, где перенос читается как ошибка.
//
// CSS умеет выравнивать строки (text-wrap: balance / pretty), но не умеет держать
// предлог со своим словом: строка кончается на «в», «и», «на» — и глаз спотыкается.
// Поэтому короткие слова приклеиваем к следующему, а тире — к предыдущему.
//
// Две точки входа:
//   window.imp.typo(str)      — для строк, которые собирает JS;
//   window.imp.typoDom(root)  — по готовой разметке; без аргумента прогоняется сам
//                               на загрузке (легенды, экраны финиша, карта, лендинг).
// Обе идемпотентны: повторный прогон по уже обработанному тексту ничего не меняет.
//
// Чего НЕ трогаем: поля ввода, таблицы и текст кейса. В кейсе много чисел и
// сокращений, а узкие колонки приложений от неразрывных пробелов ломают перенос;
// сам кейс участник читает как документ, не как речь.

(function () {
  window.imp = window.imp || {};

  var NB = ' ';

  // Односложные слова цепляем всегда, двухбуквенные — только служебные: «он», «вы»,
  // «их» висят в конце строки без вреда, а «во», «не», «же» — заметная ошибка.
  var ONE = /(^|[\s(«„ ])([a-zA-Zа-яёА-ЯЁ])\s+/g;
  var TWO = /(^|[\s(«„ ])(во|на|за|до|из|от|по|ко|со|об|на|не|ни|но|да|же|ли|бы|то|как|что|уж)\s+/gi;
  // единицы, которые не должны оторваться от числа
  var UNITS = /(\d)\s+(%|₽|\$|€|млрд|млн|тыс|руб|дней|дня|день|лет|года|год|мес|недели|неделя|человек|пунктов|пункта|пункт|раз|раза)\b/g;

  function typo(text) {
    var t = String(text == null ? '' : text);
    // два прохода: регексп не пересекает свои совпадения, поэтому в цепочке
    // «и в такой» второе короткое слово ловится только на повторе
    t = t.replace(ONE, '$1$2' + NB).replace(ONE, '$1$2' + NB);
    t = t.replace(TWO, '$1$2' + NB).replace(TWO, '$1$2' + NB);
    // тире не должно начинать строку — держим его при предыдущем слове
    t = t.replace(/[  ]+([—–])/g, NB + '$1');
    t = t.replace(UNITS, '$1' + NB + '$2');
    return t;
  }
  window.imp.typo = typo;

  // ---- прогон по разметке ----
  // Только смысловые блоки речи и прозы. Обработанный элемент помечаем, чтобы
  // повторный вызов не ходил по нему заново.
  var SELECTORS = [
    'p', 'li', 'h1', 'h2', 'h3', 'label', 'summary',
    '.chat-bubble', '.chat-act', '.chat-note', '.chat-after', '.section-lead'
  ].join(',');
  // текст кейса и приложений типограф не трогает (см. заголовок файла), плюс
  // .no-typo — ручной выключатель на случай узких колонок
  var SKIP = '#caseContent, #caseRefContent, .case-content, .appx-doc, table, .no-typo';

  function run(root) {
    var scope = root || document;
    var list = scope.querySelectorAll(SELECTORS);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.getAttribute('data-typo') === '1') continue;
      if (el.closest(SKIP)) continue;
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (var j = 0; j < nodes.length; j++) {
        var next = typo(nodes[j].nodeValue);
        if (next !== nodes[j].nodeValue) nodes[j].nodeValue = next;
      }
      el.setAttribute('data-typo', '1');
    }
  }
  window.imp.typoDom = run;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { run(); });
  } else {
    run();
  }
})();

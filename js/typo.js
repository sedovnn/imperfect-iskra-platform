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
// Ещё одна работа — строчная в начале заголовков и меток (бренд-бук, 18.10): typoDom
// ставит её вместе с пробелами, а наблюдатель — на всё, что экран дорисовывает потом.
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
  // Кроме тегов — классы блоков, чей текст лежит не в <p>: реплики раундов и
  // страница «Как проходить» (там пункты в span внутри flex-строки, и без них
  // тире вставало в начало строки на узком экране).
  var SELECTORS = [
    'p', 'li', 'h1', 'h2', 'h3', 'label', 'summary',
    '.chat-bubble', '.chat-act', '.chat-note', '.chat-after', '.section-lead',
    '.prin .t', '.intro-note'
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
    lower(scope);
  }
  window.imp.typoDom = run;

  // ---- строчная в начале заголовков и меток (бренд-бук, решение владельца 18.10) ----
  // Гайд пишет заголовки и метки строчными. Прописные раньше ставил CSS (text-transform), а тексты
  // остались в обычном регистре — так их читают модели, кабинеты и выгрузки, и так они остаются.
  // Строчную в начале ставим при показе и только если за первой буквой идёт строчная: «ИИ», «HR»,
  // «№ 000900» не трогаются (::first-letter так не умеет). Имена, которые вводят люди (названия
  // потоков), помечены .no-lc; документы сюжета — материалы кейса и письмо — со своим регистром.
  // Второй проход 18.10 (владелец «давай второй проход по текстам»): к меткам макета добавлены остальные, что до 18.10
  // шли прописными через CSS, — подписи зон, меток кабинета и карточки, витрины, входа. Не трогаем имена собеседника
  // (.chat-name), подписи этапов на полосе (.tmr-now-t: «Агеев», «Лемех»), вопросы (.mx-title, .recap-q) — это фразы,
  // а не метки, — и документы сюжета.
  var LC = 'h1, h2, h3, .interlude-where, .kicker, .interlude-next, .interlude-mark, .scr-k, .ved-k, .eyebrow, .tag, th, ' +
           '.field label, .card label, .kick, .lab, .hdr-num, .toc-title, .who-h, .recap-step, .adm-cols-hd, ' +
           '.win-label-past, .bl-over-tag, .dayside-kicker, .toc-group, .bl-zone-h, .talk-folded-t, .case-nav-title, .sc-head-name, ' +
           '.mx-flag, .tmr-k, .cab-ai, .cab-stale, .cab-ovmark, .cheat-h, .demo-tag, .xpick-step, ' +
           '.entry-sec, .dotmenu-label, .vit-sec, .vit-sec-h, .vit-step .sn, .kc-lbl, .kc-chip, .kc-tag-v';
  var LC_SKIP = '.no-lc, #caseContent, #caseRefContent, .case-content, .appx-doc, .letter';
  // В начале метки может стоять знак — «✓ Ассессмент закончен», «· Бренд»: его пропускаем, «№ 000900» не меняется.
  var LEAD = /^(\s*(?:[✓✔·•—–]\s*)?)([А-ЯЁA-Z])(?=[а-яёa-z])/;

  function lowerOne(el) {
    if (el.closest(LC_SKIP)) return;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n;
    while ((n = walker.nextNode())) { if (n.nodeValue.trim()) break; }
    if (n && LEAD.test(n.nodeValue)) {
      n.nodeValue = n.nodeValue.replace(LEAD, function (m, sp, c) { return sp + c.toLowerCase(); });
    }
  }
  function lower(root) {
    var scope = root || document;
    if (scope.nodeType === 1 && scope.matches(LC)) lowerOne(scope);
    var list = scope.querySelectorAll(LC);
    for (var i = 0; i < list.length; i++) lowerOne(list[i]);
  }

  // Экраны дня, кабинеты и экспертные страницы собирают разметку на ходу и typoDom зовут не везде,
  // поэтому строчную ставит и наблюдатель — на каждый добавленный узел. Свою правку он не видит:
  // меняется текст узла (characterData), а наблюдаем только состав (childList).
  function watch() {
    if (typeof MutationObserver !== 'function' || !document.body) return;
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var host = muts[i].target.closest ? muts[i].target.closest(LC) : null;
        if (host) lowerOne(host);   // el.textContent = '…' меняет детей самого заголовка
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) if (added[j].nodeType === 1) lower(added[j]);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { run(); watch(); });
  } else {
    run();
    watch();
  }
})();

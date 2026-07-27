// i(m)perfect — «Мои ответы» как выезжающая панель поверх текущего экрана,
// вместо перехода в новую вкладку. Не нужна на станции 1 — там свой,
// внутристанционный обзор («Весь текст / Мои заметки»), см. round1.js.
//
// Триггеров может быть больше одного на странице (например, station3 держит
// один в шапке и второй на финальном экране — там она заменяет собой прежнюю
// кнопку «ещё раз посмотреть», ставшую избыточной рядом с этой панелью).

(function () {
  var panel = document.getElementById('dossierPanel');
  if (!panel) return;
  var contentEl = document.getElementById('dossierPanelContent');
  var closeBtn = document.getElementById('closeDossierBtn');

  // фокус возвращаем на тот язычок, с которого открыли (паритет с case-ref.js:
  // до этого фокус оставался на триггере ЗА оверлеем — клавиатура «теряла» панель)
  var lastFocus = null;

  function open() {
    var session = window.imp.loadSession();
    if (!session || !session.bib) return;
    contentEl.innerHTML = window.imp.buildDossierHtml(session.bib);
    lastFocus = document.activeElement;
    panel.style.display = 'flex';
    panel.setAttribute('aria-hidden', 'false');
    // пока ящик открыт, язычки спрятаны (см. body.imp-drawer-open в styles.css)
    document.body.classList.add('imp-drawer-open');
    document.addEventListener('keydown', onKey);
    if (closeBtn) closeBtn.focus();
  }
  function close() {
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('imp-drawer-open');
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

  // Делегирование, а не привязка к найденным кнопкам: справочные кнопки создаёт
  // case-ref.js ПОСЛЕ этого скрипта и по одной паре на каждую шапку страницы
  // (в раунде 1 их две — фаза чтения и фаза связок). При прямой привязке кнопки,
  // созданные позже, оставались бы мёртвыми.
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('.js-open-dossier') : null;
    if (t) { e.preventDefault(); open(); }
  });
  if (closeBtn) closeBtn.addEventListener('click', close);
  // клик по затемнённой подложке (мимо самой панели) тоже закрывает — панель
  // теперь ящик у правого края, и «промахнуться» в подложку — естественный жест
  panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
})();

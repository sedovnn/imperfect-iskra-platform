// i(m)perfect — «Мои ответы» как выезжающая панель поверх текущего экрана,
// вместо перехода в новую вкладку. Не нужна на станции 1 — там свой,
// внутристанционный обзор («Весь текст / Мои заметки»), см. station1.js.
//
// Триггеров может быть больше одного на странице (например, station3 держит
// один в шапке и второй на финальном экране — там она заменяет собой прежнюю
// кнопку «ещё раз посмотреть», ставшую избыточной рядом с этой панелью).

(function () {
  var triggers = document.querySelectorAll('.js-open-dossier');
  var panel = document.getElementById('dossierPanel');
  if (!triggers.length || !panel) return;
  var contentEl = document.getElementById('dossierPanelContent');
  var closeBtn = document.getElementById('closeDossierBtn');

  function open() {
    var session = window.imp.loadSession();
    if (!session || !session.bib) return;
    contentEl.innerHTML = window.imp.buildDossierHtml(session.bib);
    panel.style.display = 'flex';
  }
  function close() {
    panel.style.display = 'none';
  }

  triggers.forEach(function (btn) { btn.addEventListener('click', open); });
  if (closeBtn) closeBtn.addEventListener('click', close);
})();

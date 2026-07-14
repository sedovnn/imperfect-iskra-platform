// i(m)perfect — «Мои ответы», отдельная страница. Сборка контента вынесена в
// js/dossier-render.js (тот же код использует выезжающая панель на станциях).

(function () {
  var session = window.imp.loadSession();
  if (!session || !session.bib) {
    document.getElementById('gate').style.display = 'flex';
    return;
  }
  var bib = session.bib;
  document.getElementById('dossierRoot').style.display = '';
  document.getElementById('hdrBib').textContent = '№ ' + String(bib).padStart(3, '0');
  document.getElementById('closeBtn').addEventListener('click', function () {
    // открыт в отдельной вкладке — закрываем; иначе назад
    if (window.opener) window.close(); else history.back();
  });

  document.getElementById('dossierContent').innerHTML = window.imp.buildDossierHtml(bib);
})();

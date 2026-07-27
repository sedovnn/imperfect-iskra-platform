// i(m)perfect — наблюдаемый статус сохранения в полосе времени раунда.
//
// Зачем: раньше сбой отправки уходил только в console.warn. Участник видел
// финиш-оверлей и был уверен, что всё записано, а ответ на бэкенд не доходил.
// Плюс за два часа работы «а оно сохраняется?» — законный вопрос, на который
// платформа не отвечала ничем.
//
// Что показываем (тихо, без вермилиона, пока всё хорошо):
//   «сохранено» — есть подтверждение записи;
//   «сохраняю…»  — запрос в полёте;
//   «не сохранено — проверьте связь» (акцентом) — есть очередь неотправленного;
//     платформа повторяет отправку сама (см. js/api.js flushQueue).
//
// Живёт в .round-progress рядом с таймером — это единственная постоянная
// служебная полоса раунда, статус логично держать там же.

(function () {
  if (!window.imp || !window.imp.onSyncStatus) return;

  function fmtTime(ts) {
    try {
      var d = new Date(ts);
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    } catch (e) { return ''; }
  }

  function mount() {
    var strip = document.querySelector('.round-progress');
    if (!strip) return null;
    var el = strip.querySelector('.save-status');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'save-status';
    // роль status + polite: скринридер сообщит смену состояния, не перебивая ввод
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    // перед таймером: сначала «что с моими ответами», потом «сколько прошло»
    strip.insertBefore(el, strip.firstChild);
    return el;
  }

  function render(s) {
    var el = mount();
    if (!el) return;
    if (s.failed > 0) {
      el.className = 'save-status is-failed';
      el.textContent = 'не сохранено — проверьте связь';
      el.title = 'Ответы сохранены в этом браузере; отправка повторится автоматически, когда связь вернётся.';
      return;
    }
    if (s.pending > 0) {
      el.className = 'save-status is-pending';
      el.textContent = 'сохраняю…';
      el.title = '';
      return;
    }
    if (s.lastOkAt) {
      el.className = 'save-status is-ok';
      el.textContent = 'сохранено ' + fmtTime(s.lastOkAt);
      el.title = 'Последнее подтверждение записи на сервере.';
      return;
    }
    // до первого сохранения ничего не обещаем
    el.className = 'save-status';
    el.textContent = '';
    el.title = '';
  }

  // полоса времени рисуется progress.js тоже на DOMContentLoaded — подписываемся
  // после, чтобы контейнер уже существовал; статус всё равно перерисуется по событию
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.imp.onSyncStatus(render); });
  } else {
    window.imp.onSyncStatus(render);
  }
})();

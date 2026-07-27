// i(m)perfect — модальные вопрос и сообщение в стиле платформы.
//
// Зачем: раунды останавливали участника нативными window.confirm/alert —
// системная плашка браузера поверх аккуратного экрана, чужой шрифт, иногда
// приписка «Сайт … сообщает». Это выпадало и из бренда, и из фикции: Агеев
// говорит живым голосом, а поверх вылезает системное окно. При этом в кабинете
// фасилитатора такая модалка уже была написана (impConfirm) — внутренний
// инструмент оказался оформлен лучше продукта. Реализация перенесена сюда,
// в общий файл, и используется обоими.
//
// API (Promise-based, поэтому вызывающий код асинхронный):
//   window.imp.confirm(msg, {confirmLabel, cancelLabel, danger}) → Promise<bool>
//   window.imp.alert(msg, {confirmLabel})                        → Promise<void>
// Escape и клик по подложке = отмена (у alert — просто закрытие).

(function () {
  window.imp = window.imp || {};

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function build(message, opts, withCancel) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'imp-confirm';
      var actions =
        (withCancel
          ? '<button type="button" class="btn btn-ghost" data-act="cancel">' + esc(opts.cancelLabel || 'Отмена') + '</button>'
          : '') +
        '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok">' +
          esc(opts.confirmLabel || (withCancel ? 'Подтвердить' : 'Понятно')) + '</button>';
      ov.innerHTML =
        '<div class="imp-confirm-card" role="alertdialog" aria-modal="true">' +
          '<p class="imp-confirm-msg">' + esc(message).replace(/\n/g, '<br>') + '</p>' +
          '<div class="imp-confirm-actions">' + actions + '</div>' +
        '</div>';

      var lastFocus = document.activeElement;
      function close(val) {
        document.removeEventListener('keydown', onKey);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
        resolve(val);
      }
      function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(false); } }

      ov.addEventListener('click', function (e) { if (e.target === ov) close(false); });
      var cancelBtn = ov.querySelector('[data-act="cancel"]');
      if (cancelBtn) cancelBtn.addEventListener('click', function () { close(false); });
      ov.querySelector('[data-act="ok"]').addEventListener('click', function () { close(true); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(ov);
      var okBtn = ov.querySelector('[data-act="ok"]');
      if (okBtn) okBtn.focus();
    });
  }

  window.imp.confirm = function (message, opts) { return build(message, opts, true); };
  window.imp.alert = function (message, opts) { return build(message, opts, false).then(function () {}); };
})();

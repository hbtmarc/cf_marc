/**
 * Modal de confirmação interno — substitui alert/confirm/prompt nativos.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var activeOverlay = null;
  var previousFocus = null;
  var keydownHandler = null;

  function escHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getFocusable(root) {
    return Array.prototype.slice.call(
      root.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]),' +
        ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }

  function removeModal() {
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler);
      keydownHandler = null;
    }
    if (activeOverlay && activeOverlay.parentNode) {
      activeOverlay.parentNode.removeChild(activeOverlay);
    }
    activeOverlay = null;
    if (previousFocus && typeof previousFocus.focus === "function") {
      try { previousFocus.focus(); } catch (e) { /* ignore */ }
    }
    previousFocus = null;
  }

  function resolvePromise(resolve, value) {
    removeModal();
    resolve(!!value);
  }

  /**
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.message
   * @param {string} [options.confirmLabel]
   * @param {string} [options.cancelLabel]
   * @param {string} [options.tone] warning | neutral | danger
   * @param {string} [options.details]
   * @param {HTMLElement} [options.triggerEl]
   * @returns {Promise<boolean>}
   */
  function openAppConfirm(options) {
    options = options || {};
    if (activeOverlay) {
      removeModal();
    }

    return new Promise(function (resolve) {
      previousFocus = options.triggerEl || document.activeElement;

      var tone = options.tone || "neutral";
      var title = options.title || "Confirmar ação";
      var message = options.message || "";
      var confirmLabel = options.confirmLabel || "Confirmar";
      var cancelLabel = options.cancelLabel || "Cancelar";
      var detailsHtml = options.details
        ? '<p class="app-confirm__details" id="app-confirm-details">' + escHtml(options.details) + "</p>"
        : "";

      var overlay = document.createElement("div");
      overlay.className = "app-confirm-overlay";
      overlay.innerHTML =
        '<div class="app-confirm app-confirm--' + escHtml(tone) + '"' +
        ' role="dialog" aria-modal="true"' +
        ' aria-labelledby="app-confirm-title"' +
        (message || options.details ? ' aria-describedby="app-confirm-desc"' : "") +
        ">" +
        '  <div class="app-confirm__body">' +
        '    <h2 class="app-confirm__title" id="app-confirm-title">' + escHtml(title) + "</h2>" +
        (message
          ? '    <p class="app-confirm__message" id="app-confirm-desc">' + escHtml(message) + "</p>"
          : "") +
        detailsHtml +
        "  </div>" +
        '  <div class="app-confirm__actions">' +
        '    <button type="button" class="btn btn--ghost app-confirm__cancel"' +
        ' data-app-confirm="cancel" aria-label="' + escHtml(cancelLabel) + '">' +
        escHtml(cancelLabel) + "</button>" +
        '    <button type="button" class="btn btn--primary app-confirm__confirm"' +
        ' data-app-confirm="confirm" aria-label="' + escHtml(confirmLabel) + '">' +
        escHtml(confirmLabel) + "</button>" +
        "  </div>" +
        "</div>";

      document.body.appendChild(overlay);
      activeOverlay = overlay;

      var dialog = overlay.querySelector(".app-confirm");
      var btnCancel = overlay.querySelector('[data-app-confirm="cancel"]');
      var btnConfirm = overlay.querySelector('[data-app-confirm="confirm"]');

      function onCancel() {
        resolvePromise(resolve, false);
      }

      function onConfirm() {
        resolvePromise(resolve, true);
      }

      if (btnCancel) btnCancel.addEventListener("click", onCancel);
      if (btnConfirm) btnConfirm.addEventListener("click", onConfirm);

      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) onCancel();
      });

      keydownHandler = function (e) {
        if (!activeOverlay) return;
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
          return;
        }
        if (e.key !== "Tab" || !dialog) return;
        var focusable = getFocusable(dialog);
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", keydownHandler);

      if (btnConfirm) {
        btnConfirm.focus();
      } else if (dialog) {
        dialog.focus();
      }
    });
  }

  CFM.openAppConfirm = openAppConfirm;
})(window.CFM);

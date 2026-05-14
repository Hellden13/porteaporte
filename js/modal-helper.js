// PorteaPorte modal and toast helper.
// Replaces alert() / confirm() in sensitive workflows.
(function () {
  if (window.PorteModal) return;

  const style = document.createElement('style');
  style.textContent = `
    .pp-modal-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.68);opacity:0;transition:opacity .18s ease}
    .pp-modal-overlay.show{opacity:1}
    .pp-modal{width:min(520px,100%);background:#111318;border:1px solid #1F2937;border-radius:10px;box-shadow:0 24px 70px rgba(0,0,0,.55);padding:22px;color:#F0F2F5;transform:translateY(8px) scale(.98);transition:transform .18s ease}
    .pp-modal-overlay.show .pp-modal{transform:translateY(0) scale(1)}
    .pp-modal-title{font-size:20px;font-weight:850;margin:0 0 8px;line-height:1.25}
    .pp-modal-description{color:#A8ACB1;font-size:14px;line-height:1.55;margin:0 0 18px;white-space:pre-wrap}
    .pp-modal-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
    .pp-modal-btn{border:1px solid #1F2937;border-radius:8px;padding:11px 16px;font-weight:800;cursor:pointer;background:#1A1F28;color:#F0F2F5}
    .pp-modal-btn:hover{border-color:#00D9FF}
    .pp-modal-btn.primary{border-color:transparent;background:linear-gradient(135deg,#00D9FF,#00FF9F);color:#0A0C10}
    .pp-modal-btn.danger{border-color:transparent;background:#EF4444;color:white}
    .pp-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(12px);z-index:10001;max-width:min(92vw,560px);padding:13px 16px;border-radius:8px;background:#111318;border:1px solid #1F2937;color:#F0F2F5;box-shadow:0 16px 44px rgba(0,0,0,.45);opacity:0;transition:all .18s ease;font-size:14px;line-height:1.45}
    .pp-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
    .pp-toast.success{border-color:#00FF9F;color:#00FF9F}
    .pp-toast.error{border-color:#EF4444;color:#ffb4b4}
    .pp-toast.info{border-color:#00D9FF;color:#BFEFFF}
  `;
  document.head.appendChild(style);

  function closeOverlay(overlay, value, resolve) {
    overlay.classList.remove('show');
    window.setTimeout(() => {
      overlay.remove();
      resolve(value);
    }, 140);
  }

  function showModal(options) {
    const opts = options || {};
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'pp-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      const modal = document.createElement('div');
      modal.className = 'pp-modal';

      const title = document.createElement('h2');
      title.className = 'pp-modal-title';
      title.textContent = opts.title || 'Confirmation';

      const desc = document.createElement('p');
      desc.className = 'pp-modal-description';
      desc.textContent = opts.description || '';

      const actions = document.createElement('div');
      actions.className = 'pp-modal-actions';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'pp-modal-btn';
      cancel.textContent = opts.cancelText || 'Annuler';
      cancel.addEventListener('click', () => {
        if (typeof opts.onCancel === 'function') opts.onCancel();
        closeOverlay(overlay, false, resolve);
      });

      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'pp-modal-btn ' + (opts.variant === 'danger' ? 'danger' : 'primary');
      confirm.textContent = opts.confirmText || 'Confirmer';
      confirm.addEventListener('click', async () => {
        confirm.disabled = true;
        try {
          if (typeof opts.onConfirm === 'function') await opts.onConfirm();
          closeOverlay(overlay, true, resolve);
        } catch (err) {
          confirm.disabled = false;
          showError(err.message || 'Action impossible');
        }
      });

      actions.append(cancel, confirm);
      modal.append(title, desc, actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay && opts.closeOnBackdrop !== false) {
          closeOverlay(overlay, false, resolve);
        }
      });

      const onKey = (event) => {
        if (event.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          closeOverlay(overlay, false, resolve);
        }
      };
      document.addEventListener('keydown', onKey);

      window.setTimeout(() => {
        overlay.classList.add('show');
        confirm.focus();
      }, 10);
    });
  }

  function showToast(message, type, duration) {
    const toast = document.createElement('div');
    toast.className = 'pp-toast ' + (type || 'info');
    toast.textContent = message || '';
    document.body.appendChild(toast);
    window.setTimeout(() => toast.classList.add('show'), 10);
    window.setTimeout(() => {
      toast.classList.remove('show');
      window.setTimeout(() => toast.remove(), 160);
    }, duration || (type === 'error' ? 5200 : 3400));
  }

  window.PorteModal = { showModal, showToast };
  window.showModal = showModal;
  window.showConfirm = showModal;
  window.showSuccess = (message) => showToast(message || 'Action reussie.', 'success');
  window.showError = (message) => showToast(message || 'Une erreur est survenue.', 'error');
  window.showInfo = (message) => showToast(message || '', 'info');
})();

// Modal & Toast Helper - Remplace alert()
(function() {
    const style = document.createElement('style');
    style.innerHTML = `
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; opacity: 0; transition: opacity 0.3s; }
        .modal-overlay.show { opacity: 1; }
        .modal-content { background: white; border-radius: 8px; padding: 2rem; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); transform: scale(0.9); transition: transform 0.3s; }
        .modal-overlay.show .modal-content { transform: scale(1); }
        .modal-header { font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem; color: #333; }
        .modal-description { color: #666; margin-bottom: 1.5rem; line-height: 1.5; }
        .modal-buttons { display: flex; gap: 1rem; justify-content: flex-end; }
        .modal-btn { padding: 0.75rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
        .modal-btn-cancel { background: #f0f0f0; color: #333; }
        .modal-btn-cancel:hover { background: #e0e0e0; }
        .modal-btn-confirm { background: #0051BA; color: white; }
        .modal-btn-confirm:hover { background: #003d8a; }
        .toast { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); background: #10B981; color: white; padding: 1rem 2rem; border-radius: 8px; z-index: 10000; }
        .toast.error { background: #EF4444; }
    `;
    document.head.appendChild(style);
    window.showModal = function(options) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            const modalContent = document.createElement('div');
            modalContent.className = 'modal-content';
            const header = document.createElement('div');
            header.className = 'modal-header';
            header.textContent = options.title || 'Confirmation';
            const desc = document.createElement('div');
            desc.className = 'modal-description';
            desc.textContent = options.description || '';
            const buttonsDiv = document.createElement('div');
            buttonsDiv.className = 'modal-buttons';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'modal-btn modal-btn-cancel';
            cancelBtn.textContent = 'Annuler';
            cancelBtn.onclick = () => {
                overlay.remove();
                if (options.onCancel) options.onCancel();
                resolve(false);
            };
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'modal-btn modal-btn-confirm';
            confirmBtn.textContent = options.confirmText || 'Confirmer';
            confirmBtn.onclick = () => {
                overlay.remove();
                if (options.onConfirm) options.onConfirm();
                resolve(true);
            };
            buttonsDiv.appendChild(cancelBtn);
            buttonsDiv.appendChild(confirmBtn);
            modalContent.appendChild(header);
            modalContent.appendChild(desc);
            modalContent.appendChild(buttonsDiv);
            overlay.appendChild(modalContent);
            document.body.appendChild(overlay);
            setTimeout(() => overlay.classList.add('show'), 10);
            confirmBtn.focus();
        });
    };
    window.showSuccess = function(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message || '✅ Succès!';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };
    window.showError = function(message) {
        const toast = document.createElement('div');
        toast.className = 'toast error';
        toast.textContent = message || '❌ Erreur!';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    };
})();

document.addEventListener('DOMContentLoaded', () => {

    // --- Lógica do Menu Mobile (Já existente) ---
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileNav = document.querySelector('.mobile-nav');

    if (menuToggle && mobileNav) {
        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('open');
            mobileNav.classList.toggle('open');
        });
    }

    /**
     * ================================================================
     * Sistema de Modal Flexível
     * ================================================================
     */
    const ModalSystem = {
        backdropEl: null,
        titleEl: null,
        bodyEl: null,
        footerEl: null,
        
        _currentResolve: null,
        _currentReject: null,

        // 1. Cria o HTML da modal e anexa ao <body>
        init() {
            if (this.backdropEl) return;

            // HTML baseado no main.css
            const modalHtml = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title"></h3>
                        <button class="modal-close" aria-label="Fechar Modal">&times;</button>
                    </div>
                    <div class="modal-body"></div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" data-modal-action="cancel">Cancelar</button>
                        <button class="btn btn-primary" data-modal-action="confirm">Confirmar</button>
                    </div>
                </div>
            `;
            
            this.backdropEl = document.createElement('div');
            this.backdropEl.className = 'modal-backdrop';
            this.backdropEl.innerHTML = modalHtml;
            document.body.appendChild(this.backdropEl);

            // Armazenar referências
            this.titleEl = this.backdropEl.querySelector('.modal-title');
            this.bodyEl = this.backdropEl.querySelector('.modal-body');
            this.footerEl = this.backdropEl.querySelector('.modal-footer');
            const closeBtn = this.backdropEl.querySelector('.modal-close');

            // Adicionar eventos de fecho
            this.backdropEl.addEventListener('click', (e) => {
                if (e.target === this.backdropEl) {
                    this._handleCancel();
                }
            });
            closeBtn.addEventListener('click', () => this._handleCancel());

            this.footerEl.addEventListener('click', (e) => {
                const action = e.target.dataset.modalAction;
                if (action === 'confirm') {
                    this._handleConfirm();
                } else if (action === 'cancel') {
                    this._handleCancel();
                }
            });
        },

        // 2. Função principal de exibição
        show(options) {
            if (!this.backdropEl) this.init(); 

            const {
                type = 'alert', // 'alert', 'confirm', 'loading'
                title,
                body,
                confirmText,
                cancelText,
                confirmClass = 'btn-primary'
            } = options;

            this.titleEl.textContent = title;
            this.bodyEl.innerHTML = ''; // Limpa o corpo

            const confirmBtn = this.footerEl.querySelector('[data-modal-action="confirm"]');
            const cancelBtn = this.footerEl.querySelector('[data-modal-action="cancel"]');
            const closeBtn = this.backdropEl.querySelector('.modal-close');

            if (type === 'loading') {
                this.bodyEl.innerHTML = '<div class="spinner"></div>' + (body || '');
                closeBtn.style.display = 'none';
                this.footerEl.style.display = 'none';
            } else {
                this.bodyEl.innerHTML = body || '';
                closeBtn.style.display = 'block';
                this.footerEl.style.display = 'flex';

                if (type === 'alert') {
                    confirmBtn.textContent = confirmText || 'OK';
                    confirmBtn.className = `btn ${confirmClass}`;
                    cancelBtn.style.display = 'none';
                } else if (type === 'confirm') {
                    confirmBtn.textContent = confirmText || 'Confirmar';
                    confirmBtn.className = `btn ${confirmClass}`;
                    confirmBtn.style.display = 'inline-block';
                    
                    cancelBtn.textContent = cancelText || 'Cancelar';
                    cancelBtn.style.display = 'inline-block';
                }
            }

            this.backdropEl.classList.add('open');
        },

        // 3. Funções de "atalho"
        alert(title, body) {
            return new Promise((resolve) => {
                this._currentResolve = resolve;
                this._currentReject = null; // Alertas não rejeitam, apenas resolvem
                this.show({ type: 'alert', title, body });
            });
        },

        loading(title) {
            this.show({ type: 'loading', title: title || 'A carregar...' });
        },

        confirm(title, body, options = {}) {
            return new Promise((resolve, reject) => {
                this._currentResolve = resolve;
                this._currentReject = reject;
                this.show({
                    type: 'confirm',
                    title,
                    body,
                    ...options
                });
            });
        },

        // 4. Função de fecho
        hide() {
            if (!this.backdropEl) return;
            this.backdropEl.classList.remove('open');
            this._currentResolve = null;
            this._currentReject = null;
        },

        // 5. Handlers da Promise
        _handleConfirm() {
            if (this._currentResolve) {
                this._currentResolve(true);
            }
            this.hide();
        },

        _handleCancel() {
            if (this._currentReject) {
                // Rejeita a promise (para o .catch() funcionar)
                this._currentReject(false); 
            }
            this.hide();
        }
    };

    // Inicializa o sistema de modal
    ModalSystem.init();

    // Expõe o ModalSystem globalmente para ser usado em qualquer script
    // (Ou em testes no console)
    window.ModalSystem = ModalSystem;

    /**
     * ================================================================
     * Intercepta os formulários de eliminação (DELETE)
     * ================================================================
     */
    const deleteForms = document.querySelectorAll('.delete-form');
    
    deleteForms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            // 1. Previne o envio imediato
            e.preventDefault(); 
            
            const username = form.dataset.username || 'este item';
            
            try {
                // 2. Chama a modal de confirmação
                await ModalSystem.confirm(
                    'Confirmar Eliminação',
                    `<p>Tem a certeza que quer eliminar permanentemente o utilizador <strong>${username}</strong>?</p><p>Esta ação não pode ser desfeita.</p>`,
                    {
                        confirmText: 'Sim, Eliminar',
                        confirmClass: 'btn-danger' // Botão vermelho
                    }
                );
                
                // 3. Se a Promise resolver (utilizador confirmou), envia o formulário
                form.submit();

            } catch (error) {
                // 4. Se a Promise rejeitar (utilizador cancelou), não faz nada
                // O 'catch' é necessário para evitar erro de "Promise uncaught"
            }
        });
    });

    const feedbackEl = document.getElementById('page-feedback');
    
    if (feedbackEl) {
        // Lê os dados que o Handlebars escreveu no HTML
        const { type, title, message } = feedbackEl.dataset;

        if (message) {
            // Atrasamos 50ms para garantir que a página está pronta
            setTimeout(() => {
                if (type === 'error') {
                    // Chama a sua modal de alerta!
                    ModalSystem.alert(title || 'Erro', message);
                } else if (type === 'success') {
                    // Chama a sua modal de alerta!
                    ModalSystem.alert(title || 'Sucesso', message);
                }
            }, 50);
        }
    }
    
});
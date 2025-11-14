// public/scripts/packing.js
(() => {
    const appEl = document.getElementById('packing-app');
    if (!appEl) {
        return;
    }

    const orderType = appEl.dataset.orderType;

    // Templates
    const baseCardTemplate = document.getElementById('packing-card-template');
    const itemTemplate = document.getElementById('packing-item-template');
    const finishedTemplate = document.getElementById('packing-finished-template');

    let currentSession = null;
    let isRequesting = false;

    // --- Elementos do Card (para cache) ---
    let scanInput = null;
    let scanForm = null;
    let feedbackEl = null;

    function parseInitialSession() {
        const raw = appEl.dataset.initialSession;
        if (!raw || raw === 'null' || raw === '""') {
            return null;
        }
        try {
            const parsed = JSON.parse(raw);
            return parsed && parsed.lock ? parsed : null;
        } catch (error) {
            console.warn('[Empacotamento] Não foi possível analisar a sessão inicial:', error);
            return null;
        }
    }

    function renderEmptyCard(message) {
        appEl.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'card separation-card is-empty';
        container.innerHTML = `
            <div class="card-body">
                <p class="muted">${message || 'A aguardar atribuição de pedido...'}</p>
            </div>
        `;
        appEl.appendChild(container);
    }

    function renderFinishedCard() {
        if (!finishedTemplate) {
            return renderEmptyCard('Template de finalização não encontrado.');
        }

        const card = finishedTemplate.content.cloneNode(true);
        const orderNumberEl = card.querySelector('[data-order-number-finished]');
        if (orderNumberEl && currentSession && currentSession.order) {
            orderNumberEl.textContent = `Pedido ${currentSession.order.numero_venda} finalizado.`;
        }

        card.querySelector('[data-action="request-next"]').addEventListener('click', (e) => {
            e.preventDefault();
            currentSession = null;
            acquireOrder();
        });

        appEl.innerHTML = '';
        appEl.appendChild(card);
    }

    function renderSession() {
        if (!currentSession || !currentSession.lock || !currentSession.order || !currentSession.items) {
            return acquireOrder();
        }

        if (!baseCardTemplate || !itemTemplate) {
            return renderEmptyCard('Erro: Templates de empacotamento não encontrados.');
        }

        const card = baseCardTemplate.content.cloneNode(true);
        const { order, items, lock } = currentSession;
        const progress = lock.progress || {};

        card.querySelector('[data-order-number]').textContent = order.numero_venda;
        card.querySelector('[data-order-buyer]').textContent = order.comprador || 'N/A';
        card.querySelector('[data-order-total-units]').textContent = order.total_unidades || 'N/A';

        const itemListEl = card.querySelector('[data-item-list]');
        itemListEl.innerHTML = ''; // Limpa a lista

        items.forEach(item => {
            const itemProg = progress[item.produto_codigo] || { scanned: 0, needed: 0 };
            const itemRow = itemTemplate.content.cloneNode(true);
            const isComplete = itemProg.scanned >= itemProg.needed;

            itemRow.querySelector('[data-item-name]').textContent = item.descricao_produto || 'Produto sem nome';
            itemRow.querySelector('[data-item-sku]').textContent = `SKU: ${item.sku}`;
            itemRow.querySelector('[data-scanned-count]').textContent = itemProg.scanned;
            itemRow.querySelector('[data-needed-count]').textContent = itemProg.needed;
            
            const statusIcon = itemRow.querySelector('[data-status-icon]');
            const itemCounter = itemRow.querySelector('[data-item-counter]');
            if (isComplete) {
                statusIcon.textContent = '✅';
                itemCounter.classList.add('is-complete');
            } else {
                 statusIcon.textContent = '📦';
            }
            
            itemListEl.appendChild(itemRow);
        });

        // Configura elementos de interação
        scanInput = card.querySelector('[data-scan-input]');
        scanForm = card.querySelector('[data-scan-form]');
        feedbackEl = card.querySelector('[data-feedback]');

        scanForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleScan();
        });

        // Foco automático no input
        setTimeout(() => scanInput.focus(), 100);

        appEl.innerHTML = '';
        appEl.appendChild(card);
    }
    
    function updateProgressUI(progress) {
        if (!progress || !itemListEl) return;
        
        currentSession.lock.progress = progress;
        
        const items = itemListEl.querySelectorAll('[data-sku-item]');
        
        // Esta lógica é complexa. É mais fácil re-renderizar a lista.
        // Vamos apenas atualizar os contadores com base nos dados dos items
        // (Assumindo que `currentSession.items` tem a mesma ordem)
        
        currentSession.items.forEach((item, index) => {
            const itemProg = progress[item.produto_codigo];
            if (!itemProg) return;

            const rowEl = itemListEl.children[index];
            if (!rowEl) return;
            
            const isComplete = itemProg.scanned >= itemProg.needed;
            
            rowEl.querySelector('[data-scanned-count]').textContent = itemProg.scanned;
            const statusIcon = rowEl.querySelector('[data-status-icon]');
            const itemCounter = rowEl.querySelector('[data-item-counter]');

            if (isComplete) {
                statusIcon.textContent = '✅';
                itemCounter.classList.add('is-complete');
            } else {
                 statusIcon.textContent = '📦';
            }
        });
    }

    function showFeedback(message, type = 'error') {
        if (!feedbackEl) return;
        feedbackEl.textContent = message;
        feedbackEl.className = `scan-feedback ${type === 'error' ? 'is-error' : 'is-success'}`;
        feedbackEl.hidden = false;
    }

    function clearFeedback() {
        if (!feedbackEl) return;
        feedbackEl.hidden = true;
        feedbackEl.textContent = '';
    }

    async function acquireOrder() {
        if (isRequesting) return;
        isRequesting = true;
        renderEmptyCard(`Buscando ${orderType === 'kit' ? 'kit' : 'pedido simples'}...`);
        clearFeedback();

        try {
            const response = await fetch('/empacotamento/api/acquire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderType }),
            });

            if (response.status === 204) {
                renderEmptyCard(`Nenhum ${orderType === 'kit' ? 'kit' : 'pedido simples'} separado aguardando empacotamento.`);
                currentSession = null;
                return;
            }
            if (!response.ok) {
                throw new Error('Falha ao buscar pedido.');
            }
            currentSession = await response.json();
            renderSession();
        } catch (error) {
            console.error('[Empacotamento] Erro ao adquirir:', error);
            renderEmptyCard(`Erro ao buscar pedido. ${error.message}`);
        } finally {
            isRequesting = false;
        }
    }

    async function handleScan() {
        if (isRequesting || !scanInput || !currentSession) return;
        
        const sku = scanInput.value;
        if (!sku) return;

        isRequesting = true;
        clearFeedback();
        scanInput.disabled = true;

        try {
            const response = await fetch('/empacotamento/api/pack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro desconhecido');
            }

            if (data.finished) {
                // SUCESSO! Pedido completo.
                renderFinishedCard();
                // Abre a etiqueta para impressão
                window.open(`/empacotamento/etiqueta/${data.numero_venda}`, '_blank');
            } else {
                // SUCESSO! Item bipado, mas pedido incompleto.
                showFeedback('Item confirmado!', 'success');
                currentSession.lock.progress = data.progress;
                // Atualiza a UI com o novo progresso
                renderSession(); 
            }
            
            scanInput.value = ''; // Limpa o input

        } catch (error) {
            console.error('[Empacotamento] Erro ao bipar:', error);
            showFeedback(error.message, 'error');
        } finally {
            isRequesting = false;
            if (scanInput) {
                scanInput.disabled = false;
                scanInput.focus();
            }
        }
    }

    window.addEventListener('beforeunload', () => {
        if (currentSession) {
            const blob = new Blob([''], { type: 'application/json' });
            navigator.sendBeacon('/empacotamento/api/release', blob);
        }
    });

    // --- Inicialização ---
    const initial = parseInitialSession();
    if (initial) {
        currentSession = initial;
        renderSession();
    } else {
        acquireOrder();
    }

})();
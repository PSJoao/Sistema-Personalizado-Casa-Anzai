// public/scripts/shipping.js
(() => {
    const scanForm = document.getElementById('shipping-scan-form');
    const scanInput = document.getElementById('scan-input');
    const feedbackEl = document.getElementById('scan-feedback');
    const pendingTableBody = document.querySelector('#pending-orders-table tbody');
    const checkedTableBody = document.querySelector('#checked-orders-table tbody');
    const finalizeBtn = document.getElementById('finalize-batch-btn');
    const emptyRow = document.getElementById('empty-row');
    const pendingEmptyRow = document.getElementById('pending-empty-row');
    const pendingCountEl = document.querySelector('.pending-count');

    let isProcessing = false;

    function showFeedback(message, type = 'error') {
        feedbackEl.textContent = message;
        feedbackEl.className = 'scan-feedback';
        feedbackEl.setAttribute('data-variant', type);
        feedbackEl.hidden = false;
        
        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                feedbackEl.hidden = true;
            }, 3000);
        }
    }

    function removeFromPendingTable(numeroVenda) {
        if (!pendingTableBody) return;

        // Busca a linha do pedido na tabela de pendentes
        const rows = pendingTableBody.querySelectorAll('tr[data-pedido]');
        let removed = false;
        
        for (let row of rows) {
            if (row.getAttribute('data-pedido') === numeroVenda) {
                row.remove();
                removed = true;
                break;
            }
        }

        // Atualiza o contador de pendentes
        updatePendingCount();

        // Se não há mais pedidos pendentes, mostra a linha vazia
        const remainingRows = pendingTableBody.querySelectorAll('tr[data-pedido]');
        if (remainingRows.length === 0) {
            // Verifica se a linha vazia já existe
            const existingEmptyRow = document.getElementById('pending-empty-row');
            if (!existingEmptyRow) {
                // Cria a linha vazia se não existir
                const emptyRow = document.createElement('tr');
                emptyRow.id = 'pending-empty-row';
                emptyRow.innerHTML = '<td colspan="2">Nenhum pedido pendente para expedição no momento.</td>';
                pendingTableBody.appendChild(emptyRow);
            }
        }
    }

    function updatePendingCount() {
        if (!pendingCountEl || !pendingTableBody) return;
        
        const pendingRows = pendingTableBody.querySelectorAll('tr[data-pedido]');
        const count = pendingRows.length;
        pendingCountEl.textContent = `${count} pedido(s) aguardando conferência`;
    }

    function addRowToCheckedTable(order) {
        // Remove a linha vazia se existir
        if (emptyRow) {
            emptyRow.remove();
        }

        // Verifica se o pedido já existe na tabela e remove se existir
        const existingRows = checkedTableBody.querySelectorAll('tr');
        for (let row of existingRows) {
            const pedidoCell = row.querySelector('td:first-child strong');
            if (pedidoCell && pedidoCell.textContent.trim() === order.numero_venda) {
                row.remove();
                break;
            }
        }

        // Cria a nova linha com a data/hora formatada
        const row = document.createElement('tr');
        row.setAttribute('data-pedido', order.numero_venda);
        row.className = 'newly-added'; // Classe para animação
        
        // Formata a data/hora do conferimento
        const conferidoEm = order.conferido_em ? new Date(order.conferido_em) : new Date();
        const dataFormatada = formatDateTime(conferidoEm);
        
        row.innerHTML = `
            <td><strong>${order.numero_venda}</strong></td>
            <td>${dataFormatada}</td>
            <td><span class="status-badge active">Conferido</span></td>
        `;
        
        // Adiciona no topo da tabela (sempre o mais recente primeiro)
        if (checkedTableBody.firstChild) {
            checkedTableBody.insertBefore(row, checkedTableBody.firstChild);
        } else {
            checkedTableBody.appendChild(row);
        }
        
        // Remove a classe de animação após a transição
        setTimeout(() => {
            row.classList.remove('newly-added');
        }, 500);
        
        // Habilita o botão de finalizar
        finalizeBtn.disabled = false;
        finalizeBtn.textContent = `Finalizar Envios (${checkedTableBody.rows.length})`;
    }

    function formatDateTime(date) {
        const hoje = new Date();
        const ontem = new Date(hoje);
        ontem.setDate(ontem.getDate() - 1);
        
        // Verifica se é hoje
        if (date.toDateString() === hoje.toDateString()) {
            return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        // Verifica se é ontem
        if (date.toDateString() === ontem.toDateString()) {
            return `Ontem, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        // Caso contrário, mostra a data completa
        return date.toLocaleString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    async function handleCheck(e) {
        e.preventDefault();
        if (isProcessing) return;

        const term = scanInput.value.trim();
        if (!term) return;

        isProcessing = true;
        scanInput.disabled = true;
        feedbackEl.hidden = true;

        try {
            const response = await fetch('/expedicao/api/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ term })
            });

            const data = await response.json();

            if (!response.ok) {
                // Erro: mostra modal de alerta
                const errorMessage = data.message || 'Erro ao conferir pedido.';
                await window.ModalSystem.alert('Atenção', `<p>${errorMessage}</p>`);
                scanInput.select();
                return;
            }

            // Sucesso: remove da tabela de pendentes e adiciona à tabela de conferidos
            removeFromPendingTable(data.numero_venda);
            addRowToCheckedTable(data);
            scanInput.value = '';

        } catch (error) {
            // Erro de rede ou outro erro inesperado: mostra modal
            await window.ModalSystem.alert('Erro', `<p>${error.message || 'Erro inesperado ao processar a requisição.'}</p>`);
            scanInput.select();
        } finally {
            isProcessing = false;
            scanInput.disabled = false;
            scanInput.focus();
        }
    }

    async function handleFinalize() {
        try {
            // Usa o sistema de modal para confirmação
            const confirmed = await window.ModalSystem.confirm(
                'Finalizar Romaneio',
                '<p>Tem certeza que deseja fechar este romaneio e marcar todos os pedidos listados como <strong>ENVIADOS</strong>?</p>',
                {
                    confirmText: 'Sim, Finalizar',
                    cancelText: 'Cancelar',
                    confirmClass: 'btn-success'
                }
            );

            if (!confirmed) {
                return; // Usuário cancelou
            }

            finalizeBtn.disabled = true;
            finalizeBtn.textContent = 'Processando...';

            const response = await fetch('/expedicao/api/finalize', {
                method: 'POST'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao finalizar lote.');
            }

            // Sucesso: mostra modal de sucesso e redireciona
            await window.ModalSystem.alert(
                'Sucesso',
                '<p>Romaneio gerado com sucesso! Você será redirecionado para o histórico.</p>',
                {
                    confirmClass: 'btn-success'
                }
            );
            
            window.location.href = '/expedicao/romaneios';

        } catch (error) {
            // Erro: mostra modal de erro
            await window.ModalSystem.alert('Erro', `<p>${error.message || 'Erro inesperado ao finalizar o romaneio.'}</p>`);
            finalizeBtn.disabled = false;
            finalizeBtn.textContent = 'Finalizar Envios';
        }
    }

    // Event Listeners
    if (scanForm) {
        scanForm.addEventListener('submit', handleCheck);
    }

    if (finalizeBtn) {
        finalizeBtn.addEventListener('click', handleFinalize);
    }

})();
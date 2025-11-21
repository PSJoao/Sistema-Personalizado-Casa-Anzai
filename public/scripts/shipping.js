// public/scripts/shipping.js
(() => {
    const scanForm = document.getElementById('shipping-scan-form');
    const scanInput = document.getElementById('scan-input');
    const feedbackEl = document.getElementById('scan-feedback');
    const tableBody = document.querySelector('#checked-orders-table tbody');
    const finalizeBtn = document.getElementById('finalize-batch-btn');
    const emptyRow = document.getElementById('empty-row');

    let isProcessing = false;

    function showFeedback(message, type = 'error') {
        feedbackEl.textContent = message;
        feedbackEl.className = `scan-feedback ${type === 'error' ? 'is-error' : 'is-success'}`;
        feedbackEl.hidden = false;
        
        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                feedbackEl.hidden = true;
            }, 3000);
        }
    }

    function addRowToTable(order) {
        if (emptyRow) {
            emptyRow.remove();
        }

        const row = document.createElement('tr');
        row.className = 'animate-fade-in'; // Assumindo que você tem essa classe CSS ou similar
        row.innerHTML = `
            <td><strong>${order.numero_venda}</strong></td>
            <td>${order.comprador || '-'}</td>
            <td>Hoje</td>
            <td><span class="badge badge-success">Conferido</span></td>
        `;
        
        // Adiciona no topo da tabela
        tableBody.insertBefore(row, tableBody.firstChild);
        
        // Habilita o botão de finalizar
        finalizeBtn.disabled = false;
        finalizeBtn.textContent = `Finalizar Envios (${tableBody.rows.length})`;
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
                throw new Error(data.message || 'Erro ao conferir pedido.');
            }

            // Sucesso
            showFeedback(`Pedido ${data.numero_venda} conferido com sucesso!`, 'success');
            addRowToTable(data);
            scanInput.value = '';

        } catch (error) {
            showFeedback(error.message, 'error');
            // Seleciona o texto para fácil correção
            scanInput.select();
        } finally {
            isProcessing = false;
            scanInput.disabled = false;
            scanInput.focus();
        }
    }

    async function handleFinalize() {
        if (!confirm('Tem certeza que deseja fechar este romaneio e marcar todos os pedidos listados como ENVIADOS?')) {
            return;
        }

        finalizeBtn.disabled = true;
        finalizeBtn.textContent = 'Processando...';

        try {
            const response = await fetch('/expedicao/api/finalize', {
                method: 'POST'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao finalizar lote.');
            }

            alert('Romaneio gerado com sucesso! Você será redirecionado para o histórico.');
            window.location.href = '/expedicao/romaneios';

        } catch (error) {
            alert(`Erro: ${error.message}`);
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
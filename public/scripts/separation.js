(() => {
    const appEl = document.getElementById('separation-app');
    if (!appEl) {
        return;
    }

    const departmentCode = Number.parseInt(appEl.dataset.departmentCode, 10);
    const departmentName = appEl.dataset.departmentName;

    const baseCardTemplate = document.getElementById('separation-card-template');
    const finishedTemplate = document.getElementById('separation-finished-template');

    let currentSession = null;
    let isRequesting = false;

    function parseInitialSession() {
        const raw = appEl.dataset.initialSession;
        if (!raw || raw === 'null') {
            return null;
        }

        try {
            const parsed = JSON.parse(raw);
            return parsed && parsed.lock ? parsed : null;
        } catch (error) {
            console.warn('[Separação] Não foi possível analisar a sessão inicial:', error);
            return null;
        }
    }

    function renderEmptyCard(message) {
        appEl.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'card separation-card is-empty';
        container.innerHTML = `
            <div class="card-body">
                <p class="muted">${message || 'A aguardar atribuição de produto pendente...'}</p>
            </div>
        `;
        appEl.appendChild(container);
    }

    function renderFinishedCard() {
        appEl.innerHTML = '';
        const content = finishedTemplate.content.cloneNode(true);
        const requestNextBtn = content.querySelector('[data-action="request-next"]');
        requestNextBtn.addEventListener('click', () => {
            currentSession = null;
            acquireProduct();
        });
        appEl.appendChild(content);
    }

    function renderSession() {
        if (!currentSession) {
            renderEmptyCard('Nenhum produto atribuído no momento.');
            return;
        }

        const remaining = Number(currentSession.pendentes || 0);
        if (remaining <= 0) {
            renderFinishedCard();
            return;
        }

        const { product, lock } = currentSession;

        appEl.innerHTML = '';
        const content = baseCardTemplate.content.cloneNode(true);
        const card = content.querySelector('.separation-card');

        content.querySelector('[data-product-name]').textContent = product?.descricao || 'Produto';
        content.querySelector('[data-product-sku]').textContent = product ? product.codigo : '—';
        content.querySelector('[data-department]').textContent = departmentName;
        content.querySelector('[data-remaining]').textContent = remaining;
        content.querySelector('[data-unit]').textContent = product?.unidade ? product.unidade.toLowerCase() : 'un';

        const form = content.querySelector('[data-scan-form]');
        const input = content.querySelector('[data-scan-input]');
        const feedback = content.querySelector('[data-feedback]');

        const showFeedback = (message, variant = 'error') => {
            if (!feedback) {
                return;
            }
            if (!message) {
                feedback.hidden = true;
                feedback.textContent = '';
                feedback.removeAttribute('data-variant');
                return;
            }
            feedback.hidden = false;
            feedback.dataset.variant = variant;
            feedback.textContent = message;
        };

        showFeedback(null);

        const normalizeSku = (value) => {
            if (value === null || value === undefined) {
                return '';
            }
            return String(value).trim().replace(/^0+/, '').toUpperCase();
        };

        const expectedSku = normalizeSku(product?.codigo);

        const handleSubmit = async (event) => {
            event.preventDefault();
            if (isRequesting) {
                return;
            }

            const scanned = input.value;
            const normalizedScanned = normalizeSku(scanned);

            if (!normalizedScanned) {
                showFeedback('Informe o SKU do produto antes de confirmar.', 'error');
                input.focus();
                return;
            }

            if (normalizedScanned !== expectedSku) {
                showFeedback('SKU não corresponde ao produto atual.', 'error');
                input.select();
                return;
            }

            await pickUnit(scanned, showFeedback, () => {
                input.value = '';
                input.focus();
            });
        };

        form.addEventListener('submit', handleSubmit);

        setTimeout(() => {
            input.focus();
        }, 50);

        appEl.appendChild(card);
    }

    async function fetchCurrentSession() {
        const response = await fetch('/separacao/api/session', {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.status === 204) {
            return null;
        }

        if (!response.ok) {
            throw new Error('Falha ao obter sessão atual.');
        }

        const session = await response.json();
        if (session?.lock?.departamento !== departmentCode) {
            return null;
        }
        return session;
    }

    async function acquireProduct() {
        if (isRequesting) {
            return;
        }

        isRequesting = true;
        renderEmptyCard('A procurar produto disponível...');

        try {
            const response = await fetch('/separacao/api/acquire', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ departmentCode })
            });

            if (response.status === 204) {
                currentSession = null;
                renderEmptyCard('Não existem produtos pendentes neste departamento.');
                return;
            }

            if (!response.ok) {
                throw new Error('Falha ao atribuir produto.');
            }

            currentSession = await response.json();
            renderSession();
        } catch (error) {
            console.error('[Separação] Erro ao adquirir produto:', error);
            renderEmptyCard('Não foi possível atribuir um produto no momento.');
        } finally {
            isRequesting = false;
        }
    }

    async function pickUnit(scannedSku, showFeedback, onSuccess) {
        if (!currentSession?.lock) {
            return;
        }

        isRequesting = true;
        try {
            const response = await fetch('/separacao/api/pick', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ produtoCodigo: currentSession.lock.produto_codigo, sku: scannedSku })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Falha ao registrar bipagem.');
            }

            const result = await response.json();
            currentSession.pendentes = result.pendentes;
            if (typeof result.quantidadeConcluida === 'number') {
                currentSession.lock.quantidade_concluida = result.quantidadeConcluida;
            }

            if (result.finished) {
                onSuccess();
                if (showFeedback) {
                    showFeedback('Produto concluído!', 'success');
                }
                renderFinishedCard();
            } else {
                onSuccess();
                if (showFeedback) {
                    showFeedback('Unidade registrada com sucesso.', 'success');
                }
                renderSession();
            }
        } catch (error) {
            console.error('[Separação] Erro ao bipar produto:', error);
            if (showFeedback) {
                showFeedback(error.message || 'Falha ao registrar bipagem.', 'error');
            }
        } finally {
            isRequesting = false;
        }
    }

    async function releaseSession() {
        isRequesting = true;
        currentSession = null;
        renderEmptyCard('Sessão encerrada. Ao retornar, um novo produto será atribuído.');
        isRequesting = false;
        try {
            await fetch('/separacao/api/release', {
                method: 'POST'
            });
        } catch (error) {
            console.warn('[Separação] Falha ao liberar sessão:', error);
        }
    }

    async function bootstrap() {
        renderEmptyCard('A preparar a sessão de separação...');

        const initial = parseInitialSession();
        if (initial) {
            currentSession = initial;
            renderSession();
            return;
        }

        try {
            currentSession = await fetchCurrentSession();
            if (currentSession) {
                renderSession();
                return;
            }
        } catch (error) {
            console.warn('[Separação] Não foi possível recuperar sessão prévia:', error);
        }

        await acquireProduct();
    }

    window.addEventListener('beforeunload', () => {
        if (currentSession) {
            const blob = new Blob([''], { type: 'application/json' });
            navigator.sendBeacon('/separacao/api/release', blob);
        }
    });

    bootstrap();
})();


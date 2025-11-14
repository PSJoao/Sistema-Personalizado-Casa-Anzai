// services/PackingService.js
// Regras de negócio para empacotamento de pedidos

const MercadoLivreOrder = require('../models/MercadoLivreOrder');
const OrderItem = require('../models/OrderItem');
const PackingLock = require('../models/PackingLock');

// Função auxiliar para normalizar SKUs (copiada do ProductService)
function normalizeSku(sku) {
  if (typeof sku !== 'string') {
    return null;
  }
  // Remove zeros à esquerda e espaços
  return sku.trim().replace(/^0+/, '');
}

const PackingService = {

  async getPackingQueue() {
    const rawSummary = await MercadoLivreOrder.getPackingQueueSummary();
    const stats = {
      simple: 0,
      kit: 0,
    };

    rawSummary.forEach(row => {
      if (row.order_type === 'simple') {
        stats.simple = Number(row.total_orders);
      } else if (row.order_type === 'kit') {
        stats.kit = Number(row.total_orders);
      }
    });
    return stats;
  },

  async getCurrentAssignment(userId) {
    const lock = await PackingLock.findByUser(userId);
    if (!lock) {
      return null;
    }
    
    const [orderHeader, items] = await Promise.all([
      MercadoLivreOrder.findHeaderByNumeroVenda(lock.numero_venda),
      OrderItem.findAllByNumeroVenda(lock.numero_venda)
    ]);

    return { lock, order: orderHeader, items };
  },

  async acquireOrderForUser({ userId, orderType }) {
    await PackingLock.clearStaleLocks(120);

    const existingAssignment = await this.getCurrentAssignment(userId);
    if (existingAssignment) {
      console.log(`[PackingService.acquire] Utilizador ${userId} já possui sessão. A reencaminhar.`);
      return existingAssignment;
    }

    await PackingLock.releaseByUser(userId);

    const nextOrder = await MercadoLivreOrder.findNextOrderToPack(orderType);
    if (!nextOrder) {
      return null; // Nenhum pedido disponível
    }

    const { numero_venda } = nextOrder;
    const [orderHeader, items] = await Promise.all([
      MercadoLivreOrder.findHeaderByNumeroVenda(numero_venda),
      OrderItem.findAllByNumeroVenda(numero_venda)
    ]);

    // Construir o JSON de progresso inicial
    const progressData = {};
    items.forEach(item => {
      progressData[item.produto_codigo] = {
        needed: item.quantidade_total,
        scanned: 0,
        sku: item.sku,
        cod_fabrica: item.cod_fabrica
      };
    });

    const lock = await PackingLock.acquire({
      numeroVenda: numero_venda,
      userId,
      progressData: JSON.stringify(progressData),
    });

    if (!lock) {
      console.warn(`[PackingService.acquire] Race condition para user ${userId}, pedido ${numero_venda}.`);
      return null;
    }

    return { lock, order: orderHeader, items };
  },

  async packUnit({ userId, sku }) {
    const lock = await PackingLock.findByUser(userId);
    if (!lock) {
      throw new Error('Sessão de empacotamento inválida.');
    }

    const normalizedSku = normalizeSku(sku);
    if (!normalizedSku) {
      throw new Error('SKU inválido.');
    }

    const progress = lock.progress;
    let foundCode = null;

    // Encontra a qual produto este SKU pertence *dentro do pedido*
    for (const codigo in progress) {
      const item = progress[codigo];
      if (normalizeSku(item.sku) === normalizedSku || normalizeSku(item.cod_fabrica) === normalizedSku) {
        foundCode = codigo;
        break;
      }
    }

    if (!foundCode) {
      throw new Error('SKU não pertence a este pedido.');
    }

    const itemProgress = progress[foundCode];
    if (itemProgress.scanned >= itemProgress.needed) {
      throw new Error(`Todas as ${itemProgress.needed} unidades deste produto já foram bipadas.`);
    }

    // Atualiza a contagem
    itemProgress.scanned += 1;

    // Verifica se o pedido todo está completo
    let isComplete = true;
    for (const codigo in progress) {
      if (progress[codigo].scanned < progress[codigo].needed) {
        isComplete = false;
        break;
      }
    }

    if (isComplete) {
      // Pedido finalizado!
      await MercadoLivreOrder.updateStatusByNumeroVenda(lock.numero_venda, 'em_romaneio');
      await PackingLock.releaseByUser(userId);
      console.log(`[PackingService.packUnit] Pedido ${lock.numero_venda} finalizado por ${userId}.`);
      return {
        finished: true,
        progress,
        numero_venda: lock.numero_venda
      };
    } else {
      // Pedido ainda em progresso, salva o JSON
      const updatedLock = await PackingLock.updateProgress(lock.numero_venda, JSON.stringify(progress));
      return {
        finished: false,
        progress: updatedLock.progress
      };
    }
  },

  async releaseSession(userId) {
    try {
      await PackingLock.releaseByUser(userId);
      return { success: true };
    } catch (error) {
      console.error(`[PackingService.releaseSession] Erro ao liberar sessão para user ${userId}:`, error);
      return { success: false };
    }
  },
};

module.exports = PackingService;
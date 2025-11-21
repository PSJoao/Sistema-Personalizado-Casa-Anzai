// services/ShippingService.js
const MercadoLivreOrder = require('../models/MercadoLivreOrder');
const ShippingBatch = require('../models/ShippingBatch');

const ShippingService = {

  // Busca pedidos prontos para envio ('em_romaneio') pelo termo (numero_venda ou NF)
  async findOrderForChecking(term) {
    // Normaliza o termo (remove espaços)
    const searchTerm = term.trim();
    
    const order = await MercadoLivreOrder.findReadyForShipping(searchTerm);
    return order;
  },

  // Marca um pedido como conferido
  async checkOrder(numeroVenda) {
    // Verifica se o pedido existe e está pronto
    const order = await MercadoLivreOrder.findReadyForShipping(numeroVenda);
    
    if (!order) {
      throw new Error('Pedido não encontrado na lista de expedição ou já enviado.');
    }

    if (order.conferencia_saida) {
      throw new Error('Este pedido já foi conferido.');
    }

    // Marca como conferido
    await MercadoLivreOrder.markAsChecked(numeroVenda);
    
    return { 
      success: true, 
      numero_venda: numeroVenda,
      comprador: order.comprador 
    };
  },

  // Retorna a lista de pedidos conferidos que aguardam finalização do lote
  async getPendingCheckedOrders() {
    return await MercadoLivreOrder.getCheckedPendingOrders();
  },

  // Finaliza o lote atual (cria o romaneio e move os pedidos para 'enviado')
  async finalizeBatch(userId) {
    const pendingOrders = await this.getPendingCheckedOrders();
    
    if (!pendingOrders || pendingOrders.length === 0) {
      throw new Error('Não há pedidos conferidos para gerar um romaneio.');
    }

    // 1. Cria o novo Romaneio (Batch)
    const batch = await ShippingBatch.create({ userId });

    // 2. Atualiza os pedidos para 'enviado' e vincula ao Batch
    const updatedCount = await MercadoLivreOrder.finalizeShippingBatch(batch.id);

    return {
      batch,
      totalOrders: updatedCount
    };
  },

  // Lista todos os romaneios gerados
  async listBatches() {
    return await ShippingBatch.findAll();
  },

  // Busca dados completos de um romaneio para o PDF
  async getBatchDetails(batchId) {
    const batch = await ShippingBatch.findById(batchId);
    if (!batch) return null;

    const orders = await ShippingBatch.getOrdersForBatch(batchId);
    
    return {
      ...batch,
      orders
    };
  }
};

module.exports = ShippingService;
// controllers/ShippingController.js
const ShippingService = require('../services/ShippingService');

const ShippingController = {

  // Renderiza a página principal de conferência
  async renderShippingPage(req, res) {
    try {
      // Busca a lista de pedidos pendentes para expedição (ainda não conferidos)
      const pendingOrders = await ShippingService.getPendingOrdersForShipping();
      // Busca a lista de pedidos já conferidos que estão "na mesa" esperando finalizar
      const checkedOrders = await ShippingService.getPendingCheckedOrders();
      
      res.render('shipping/index', {
        user: req.user,
        activePage: 'expedicao',
        pendingOrders,
        checkedOrders
      });
    } catch (error) {
      console.error('[ShippingController] Erro ao carregar página:', error);
      res.render('shipping/index', {
        user: req.user,
        activePage: 'expedicao',
        pendingOrders: [],
        checkedOrders: [],
        error: 'Erro ao carregar dados da expedição.'
      });
    }
  },

  // Renderiza a lista de romaneios (histórico)
  async renderBatchesPage(req, res) {
    try {
      const batches = await ShippingService.listBatches();
      res.render('shipping/batches', {
        user: req.user,
        activePage: 'expedicao',
        batches
      });
    } catch (error) {
      console.error('[ShippingController] Erro ao listar romaneios:', error);
      res.render('shipping/batches', {
        user: req.user,
        activePage: 'expedicao',
        batches: [],
        error: 'Erro ao carregar histórico de romaneios.'
      });
    }
  },

  // Renderiza o PDF do Romaneio
  async renderBatchPdf(req, res) {
    try {
      const { id } = req.params;
      const batchData = await ShippingService.getBatchDetails(id);

      if (!batchData) {
        return res.status(404).send('Romaneio não encontrado.');
      }

      // Renderiza usando um layout limpo para PDF (similar ao da etiqueta)
      res.render('shipping/pdf', {
        layout: 'label', // Reutilizamos o layout limpo ou criamos um 'report'
        batch: batchData
      });
    } catch (error) {
      console.error('[ShippingController] Erro ao gerar PDF:', error);
      res.status(500).send('Erro ao gerar romaneio.');
    }
  },

  // API: Bipar/Conferir Pedido
  async api_checkOrder(req, res) {
    try {
      const { term } = req.body; // Pode ser numero_venda ou NF
      if (!term) {
        return res.status(400).json({ message: 'Informe o código do pedido ou NF.' });
      }

      const result = await ShippingService.checkOrder(term);
      return res.json(result);

    } catch (error) {
      // Retorna erro 400 para erros de negócio (não encontrado, já conferido)
      return res.status(400).json({ message: error.message });
    }
  },

  // API: Finalizar Lote
  async api_finalizeBatch(req, res) {
    try {
      const result = await ShippingService.finalizeBatch(req.user.id);
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
};

module.exports = ShippingController;
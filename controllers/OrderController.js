// controllers/OrderController.js
// Camada responsável por orquestrar as requisições relacionadas aos pedidos

const OrderService = require('../services/OrderService');

const STATUS_LABELS = {
  pendente: 'Pendentes',
  separado: 'Separados',
  em_romaneio: 'Em Romaneio',
  enviado: 'Enviados'
};

const PLATFORM_LABELS = {
  mercado_livre: 'Mercado Livre'
};

const OrderController = {

  /**
   * Renderiza o dashboard de pedidos.
   */
  async renderDashboard(req, res) {
    try {
      const summary = await OrderService.getStatusSummary();
      const groupedOrders = await OrderService.getRecentOrdersGrouped();
      const initialBucket = summary.cards?.[0]?.id || 'pendente';

      res.render('orders/dashboard', {
        user: req.user,
        activePage: 'pedidos',
        statusCards: summary.cards,
        groupedOrders,
        statusLabels: STATUS_LABELS,
        initialBucket
      });
    } catch (error) {
      console.error('[OrderController.renderDashboard] Erro ao carregar dashboard:', error);
      res.render('orders/dashboard', {
        user: req.user,
        activePage: 'pedidos',
        statusCards: [],
        groupedOrders: {},
        statusLabels: STATUS_LABELS,
        initialBucket: 'pendente',
        error: 'Não foi possível carregar os pedidos no momento.'
      });
    }
  },

  /**
   * API JSON que devolve o resumo de status (para atualização via fetch).
   */
  async getStatusSummary(req, res) {
    try {
      const summary = await OrderService.getStatusSummary();
      res.json(summary);
    } catch (error) {
      console.error('[OrderController.getStatusSummary] Erro:', error);
      res.status(500).json({ message: 'Não foi possível obter o resumo de pedidos.' });
    }
  },

  /**
   * API JSON para pedidos por bucket.
   */
  async getOrdersByBucket(req, res) {
    const { bucket } = req.params;

    try {
      const orders = await OrderService.getOrdersByBucket(bucket);
      const normalizedOrders = orders.map((order) => ({
        ...order,
        bucket: order.status_bucket,
        plataforma_label: PLATFORM_LABELS[order.plataforma] || order.plataforma
      }));
      res.json({
        bucket,
        label: STATUS_LABELS[bucket],
        orders: normalizedOrders
      });
    } catch (error) {
      console.error('[OrderController.getOrdersByBucket] Erro:', error);
      res.status(400).json({ message: error.message });
    }
  },

  /**
   * Renderiza a página de upload de planilhas.
   */
  renderUploadPage(req, res) {
    const availablePlatforms = OrderService.getAvailablePlatforms();

    res.render('orders/upload', {
      user: req.user,
      activePage: 'pedidos',
      platforms: availablePlatforms,
      query: req.query
    });
  },

  /**
   * Processa o upload das planilhas selecionadas.
   */
  async handleUpload(req, res) {
    try {
      const { plataforma } = req.body;
      const files = req.files || [];

      const results = await OrderService.processUpload(files, plataforma, req.user.id);

      const totalInserted = results.reduce((acc, item) => acc + item.inserted, 0);
      const totalUpdated = results.reduce((acc, item) => acc + item.updated, 0);

      const successParams = new URLSearchParams({
        success: 'import',
        inserted: totalInserted,
        updated: totalUpdated
      });

      res.redirect(`/pedidos/upload?${successParams.toString()}`);
    } catch (error) {
      console.error('[OrderController.handleUpload] Erro no upload:', error);

      const errorParams = new URLSearchParams({
        error: error.message || 'Falha ao processar os ficheiros.'
      });

      res.redirect(`/pedidos/upload?${errorParams.toString()}`);
    }
  }
};

module.exports = OrderController;


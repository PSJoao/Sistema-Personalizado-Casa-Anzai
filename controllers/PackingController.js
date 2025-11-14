// controllers/PackingController.js
// Interface HTTP para o módulo de empacotamento

const PackingService = require('../services/PackingService');

const PackingController = {

  async renderPackingList(req, res) {
    try {
      const stats = await PackingService.getPackingQueue();
      res.render('packing/index', {
        user: req.user,
        activePage: 'empacotamento',
        stats,
      });
    } catch (error) {
      console.error('[PackingController.renderPackingList] Erro:', error);
      res.render('packing/index', {
        user: req.user,
        activePage: 'empacotamento',
        stats: { simple: 0, kit: 0 },
        error: 'Não foi possível carregar a fila de empacotamento.'
      });
    }
  },

  async renderPackingStation(req, res) {
    const { type } = req.params;
    if (type !== 'simple' && type !== 'kit') {
      return res.redirect('/empacotamento');
    }

    try {
      // Tenta obter uma sessão inicial para carregar a página mais rápido
      const session = await PackingService.acquireOrderForUser({
        userId: req.user.id,
        orderType: type
      });

      res.render('packing/station', {
        user: req.user,
        activePage: 'empacotamento',
        orderType: type,
        orderTypeLabel: type === 'kit' ? 'Kits' : 'Pedidos Simples',
        session: session,
        // layout: false // Descomente para debugar a página pura
      });
    } catch (error) {
      console.error('[PackingController.renderPackingStation] Erro:', error);
      res.redirect('/empacotamento?error=station_load_failed');
    }
  },

  async renderLabel(req, res) {
    const { numero_venda } = req.params;
    res.render('packing/label', {
      layout: 'label', // Usaremos um layout especial para impressão
      numero_venda,
    });
  },

  // --- API Endpoints ---

  async api_acquireOrder(req, res) {
    try {
      const { orderType } = req.body;
      if (orderType !== 'simple' && orderType !== 'kit') {
        return res.status(400).json({ message: 'Tipo de pedido inválido.' });
      }

      const assignment = await PackingService.acquireOrderForUser({
        userId: req.user.id,
        orderType,
      });

      if (!assignment) {
        return res.status(204).send(); // 204 No Content
      }
      return res.json(assignment);
    } catch (error) {
      console.error('[PackingController.api_acquireOrder] Erro:', error);
      return res.status(500).json({ message: 'Não foi possível atribuir um pedido.' });
    }
  },

  async api_packUnit(req, res) {
    try {
      const result = await PackingService.packUnit({
        userId: req.user.id,
        sku: req.body.sku,
      });
      return res.json(result);
    } catch (error) {
      console.error('[PackingController.api_packUnit] Erro:', error);
      return res.status(400).json({ message: error.message || 'Falha ao bipar item.' });
    }
  },

  async api_releaseSession(req, res) {
    try {
      await PackingService.releaseSession(req.user.id);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[PackingController.api_releaseSession] Erro:', error);
      return res.status(500).json({ message: 'Falha ao liberar sessão.' });
    }
  },
};

module.exports = PackingController;
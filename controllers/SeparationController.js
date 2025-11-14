// controllers/SeparationController.js
// Interface entre rotas HTTP e lógica de separação de produtos

const ProductService = require('../services/ProductService');

function parseDepartmentCode(value) {
  const code = Number.parseInt(value, 10);
  return Number.isFinite(code) ? code : null;
}

const SeparationController = {

  async renderDepartmentList(req, res) {
    try {
      const departments = await ProductService.getDepartmentsWithPending();
      const departmentLabels = departments.reduce((acc, department) => {
        acc[department.cod_departamento] = ProductService.getDepartmentLabel(department.cod_departamento);
        return acc;
      }, {});

      res.render('separation/index', {
        user: req.user,
        activePage: 'separacao',
        departments,
        departmentLabels
      });
    } catch (error) {
      console.error('[SeparationController.renderDepartmentList] Erro:', error);
      res.render('separation/index', {
        user: req.user,
        activePage: 'separacao',
        departments: [],
        departmentLabels: {},
        error: 'Não foi possível carregar os departamentos com pendências.'
      });
    }
  },

  async renderDepartmentPage(req, res) {
    const departmentCode = parseDepartmentCode(req.params.code);

    if (!departmentCode) {
      return res.redirect('/separacao');
    }

    const departmentName = ProductService.getDepartmentLabel(departmentCode);

    let session = null;
    try {
      session = await ProductService.getCurrentSession(req.user.id);
    } catch (error) {
      console.error('[SeparationController.renderDepartmentPage] Erro ao obter sessão:', error);
    }

    const sessionForDepartment = session && session.lock.departamento === departmentCode ? session : null;

    res.render('separation/department', {
      user: req.user,
      activePage: 'separacao',
      departmentCode,
      departmentName,
      session: sessionForDepartment
    });
  },

  async getCurrentSession(req, res) {
    try {
      const session = await ProductService.getCurrentSession(req.user.id);
      if (!session) {
        return res.status(204).send();
      }

      return res.json(session);
    } catch (error) {
      console.error('[SeparationController.getCurrentSession] Erro:', error);
      return res.status(500).json({ message: 'Não foi possível recuperar a sessão atual.' });
    }
  },

  async acquireProduct(req, res) {
    try {
      const departmentCode = parseDepartmentCode(req.body.departmentCode);
      if (!departmentCode) {
        return res.status(400).json({ message: 'Departamento inválido.' });
      }

      const assignment = await ProductService.acquireProductForUser({
        userId: req.user.id,
        departmentCode
      });

      if (!assignment) {
        return res.status(204).send();
      }

      return res.json(assignment);
    } catch (error) {
      console.error('[SeparationController.acquireProduct] Erro:', error);
      return res.status(500).json({ message: 'Não foi possível atribuir um produto para separação.' });
    }
  },

  async pickUnit(req, res) {
    try {
      // Modifique o 'ProductService.pickUnit' para NÃO enviar o produtoCodigo
      const result = await ProductService.pickUnit({
        userId: req.user.id,
        // produtoCodigo, // <--- REMOVA ESTA LINHA
        sku: req.body.sku
      });

      return res.json(result);
    } catch (error) {
      console.error('[SeparationController.pickUnit] Erro:', error);
      return res.status(400).json({ message: error.message || 'Falha ao registrar bipagem.' });
    }
  },

  async releaseSession(req, res) {
    try {
      await ProductService.releaseSession(req.user.id);
      return res.status(204).send();
    } catch (error) {
      console.error('[SeparationController.releaseSession] Erro:', error);
      return res.status(500).json({ message: 'Não foi possível liberar a sessão.' });
    }
  }
};

module.exports = SeparationController;


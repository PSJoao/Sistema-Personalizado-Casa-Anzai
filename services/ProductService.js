const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const Product = require('../models/Product');
const OrderItem = require('../models/OrderItem');
const PickingLock = require('../models/PickingLock');
const MercadoLivreOrder = require('../models/MercadoLivreOrder');

const DEPARTMENT_LABELS = {
  2: 'Veterinária',
  3: 'Agrícola',
  5: 'Hidráulica',
  6: 'Ferragens',
  7: 'Imobilizado',
  9: 'Brinde',
  10: 'Despesa e Consumo',
  11: 'Material de Construção',
  22: 'Pet'
};

const DEFAULT_PRODUCT_FILES = [
  'cadastro_produto_view.xlsx',
  path.join('Produtos_Planilha', 'cadastro_produto_view.xlsx')
];

const BOOLEAN_COLUMNS = new Set(['item_ativo', 'ativo', 'ativo_compra']);
const INTEGER_COLUMNS = new Set(['codigo', 'cod_grupo', 'cod_departamento', 'cod_marca', 'cod_fornecedor']);
const NUMERIC_COLUMNS = new Set([
  'preco_custo_ultima_compra',
  'ite_precom_liq',
  'ipi_entrada',
  'frete',
  'valor_frete',
  'acrescimo_financeiro',
  'substituicao_tributaria',
  'diferencial_aliquota',
  'preco_custo',
  'icms_saida',
  'imposto_federal_entrada',
  'imposto_federal_saida',
  'despesas_operacionais',
  'boca_de_caixa',
  'preco_custo_real'
]);

const HEADER_MAP = {
  CODIGO: 'codigo',
  COD_FABRICA: 'cod_fabrica',
  DESCRICAO: 'descricao',
  REFERENCIA: 'referencia',
  UNIDADE: 'unidade',
  ITEM_ATIVO: 'item_ativo',
  COD_GRUPO: 'cod_grupo',
  GRUPO: 'grupo',
  COD_DEPARTAMENTO: 'cod_departamento',
  DEPARTAMENTO: 'departamento',
  COD_MARCA: 'cod_marca',
  MARCA: 'marca',
  COD_FORNECEDOR: 'cod_fornecedor',
  FORNECEDOR: 'fornecedor',
  NIVEL_DE_GIRO: 'nivel_de_giro',
  PRECO_CUSTO_ULTIMA_COMPRA: 'preco_custo_ultima_compra',
  ATIVO: 'ativo',
  ATIVO_COMPRA: 'ativo_compra',
  ITE_PRECOM_liq: 'ite_precom_liq',
  IPI_ENTRADA: 'ipi_entrada',
  FRETE: 'frete',
  VALOR_FRETE: 'valor_frete',
  ACRESCIMO_FINANCEIRO: 'acrescimo_financeiro',
  SUBSTITUICAO_TRIBUTARIA: 'substituicao_tributaria',
  DIFERENCIAL_ALIQUOTA: 'diferencial_aliquota',
  PRECO_CUSTO: 'preco_custo',
  ICMS_SAIDA: 'icms_saida',
  IMPOSTO_FEDERAL_ENTRADA: 'imposto_federal_entrada',
  IMPOSTO_FEDERAL_SAIDA: 'imposto_federal_saida',
  DESPESAS_OPERACIONAIS: 'despesas_operacionais',
  BOCA_DE_CAIXA: 'boca_de_caixa',
  PRECO_CUSTO_REAL: 'preco_custo_real',
  CLASSIFICACAO_IPI: 'classificacao_ipi',
  ABREVIACAO_FISCAL: 'abreviacao_fiscal',
  ABREVIACAO_PIS: 'abreviacao_pis',
  ABREVIACAO_COFINS: 'abreviacao_cofins',
  CEST: 'cest',
  TIPO_PRODUTO: 'tipo_produto'
};

function normalizeBoolean(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['s', 'sim', '1', 'true'].includes(normalized)) {
    return true;
  }
  if (['n', 'nao', 'não', '0', 'false'].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  const cleaned = String(value).replace(/\./g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Math.trunc(value);
  }

  const cleaned = String(value).replace(/[^0-9-]/g, '');
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCellValue(key, value) {
  if (value === '\\N') {
    return null;
  }

  if (BOOLEAN_COLUMNS.has(key)) {
    return normalizeBoolean(value);
  }

  if (INTEGER_COLUMNS.has(key)) {
    return normalizeInteger(value);
  }

  if (NUMERIC_COLUMNS.has(key)) {
    return normalizeNumber(value);
  }

  return value === undefined ? null : value;
}

function normalizeSku(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .trim()
    .replace(/^0+/, '')
    .toUpperCase();
}

function locateProductFile(customPath) {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const candidates = DEFAULT_PRODUCT_FILES.map((candidate) => path.resolve(candidate));
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function parseProductWorksheet(filePath) {
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null
  });

  if (rawRows.length <= 1) {
    return [];
  }

  const headerRow = rawRows[0];
  const mappedHeaders = headerRow.map((header) => HEADER_MAP[header] || null);

  const dataRows = rawRows.slice(1);

  return dataRows
    .map((row) => {
      const record = {};

      row.forEach((cell, index) => {
        const mappedKey = mappedHeaders[index];
        if (!mappedKey) {
          return;
        }
        record[mappedKey] = normalizeCellValue(mappedKey, cell);
      });

      return record;
    })
    .filter((record) => record.codigo);
}

async function buildProductRows(records) {
  return records.map((record) => ({
    codigo: record.codigo,
    cod_fabrica: record.cod_fabrica,
    descricao: record.descricao,
    referencia: record.referencia,
    unidade: record.unidade,
    item_ativo: record.item_ativo,
    cod_grupo: record.cod_grupo,
    grupo: record.grupo,
    cod_departamento: record.cod_departamento,
    departamento: record.departamento,
    cod_marca: record.cod_marca,
    marca: record.marca,
    cod_fornecedor: record.cod_fornecedor,
    fornecedor: record.fornecedor,
    nivel_de_giro: record.nivel_de_giro,
    preco_custo_ultima_compra: record.preco_custo_ultima_compra,
    ativo: record.ativo,
    ativo_compra: record.ativo_compra,
    ite_precom_liq: record.ite_precom_liq,
    ipi_entrada: record.ipi_entrada,
    frete: record.frete,
    valor_frete: record.valor_frete,
    acrescimo_financeiro: record.acrescimo_financeiro,
    substituicao_tributaria: record.substituicao_tributaria,
    diferencial_aliquota: record.diferencial_aliquota,
    preco_custo: record.preco_custo,
    icms_saida: record.icms_saida,
    imposto_federal_entrada: record.imposto_federal_entrada,
    imposto_federal_saida: record.imposto_federal_saida,
    despesas_operacionais: record.despesas_operacionais,
    boca_de_caixa: record.boca_de_caixa,
    preco_custo_real: record.preco_custo_real,
    classificacao_ipi: record.classificacao_ipi,
    abreviacao_fiscal: record.abreviacao_fiscal,
    abreviacao_pis: record.abreviacao_pis,
    abreviacao_cofins: record.abreviacao_cofins,
    cest: record.cest,
    tipo_produto: record.tipo_produto
  }));
}

async function ensureOrderStatusFor(orderIdList) {
  if (!orderIdList || orderIdList.length === 0) {
    return;
  }

  const numericIds = orderIdList
    .map((id) => {
      const parsed = Number(id);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((id) => id !== null);

  if (numericIds.length === 0) {
    return;
  }

  const statusSummaries = await OrderItem.findOrdersNeedingStatusUpdate(numericIds);

  const updates = statusSummaries.map((summary) => {
    if (summary.todos_separados) {
      return { orderId: Number(summary.order_id), statusBucket: 'separado' };
    }
    if (summary.todos_pendentes) {
      return { orderId: Number(summary.order_id), statusBucket: 'pendente' };
    }
    return { orderId: Number(summary.order_id), statusBucket: 'pendente' };
  });

  await MercadoLivreOrder.bulkUpdateStatus(updates);
}

const ProductService = {

  async importFromSpreadsheet(customPath) {
    const filePath = locateProductFile(customPath);
    if (!filePath) {
      throw new Error('Planilha de produtos não encontrada na raiz ou em Produtos_Planilha/.');
    }

    const rawRecords = parseProductWorksheet(filePath);
    const productRows = await buildProductRows(rawRecords);

    const { inserted, updated } = await Product.bulkUpsert(productRows);

    return {
      filePath,
      total: productRows.length,
      inserted,
      updated
    };
  },

  async getDepartmentsWithPending() {
    const rows = await Product.findPendingDepartments();
    return rows.map((row) => ({
      ...row,
      produtos_com_pendencia: Number(row.produtos_com_pendencia || 0),
      unidades_pendentes: Number(row.unidades_pendentes || 0)
    }));
  },

  async getPendingProductsByDepartment(departmentCode) {
    const rows = await Product.findPendingProductsByDepartment(departmentCode);
    return rows.map((row) => ({
      ...row,
      unidades_pendentes: Number(row.unidades_pendentes || 0)
    }));
  },

  async getCurrentSession(userId) {
    const lock = await PickingLock.findByUser(userId);
    if (!lock) {
      return null;
    }

    const product = await Product.findByCodigo(lock.produto_codigo);
    const pendentes = await OrderItem.countPendingUnitsByProduct(lock.produto_codigo);

    return {
      lock,
      product,
      pendentes
    };
  },

  async acquireProductForUser({ userId, departmentCode }) {
    // 1. Limpa travas obsoletas de TODOS os utilizadores (Resolve Problema B)
    // Define um tempo curto (ex: 120 minutos = 2 horas)
    // Assegure-se de que adicionou a função clearStaleLocks em models/PickingLock.js
    await PickingLock.clearStaleLocks(120);

    // 2. Verifica se o utilizador JÁ TEM uma sessão válida NESTE departamento (Resolve Problema A)
    // **** ESTA É A LINHA CORRIGIDA ****
    const existingAssignment = await this.getCurrentSession(userId);
    
    if (existingAssignment) {
      // O utilizador já tem um lock. Apenas retorna-o.
      // Isto impede que a Aba 2 "roube" o lock da Aba 1.
      // Ambas as abas agora apontarão para o mesmo produto.
      console.log(`[ProductService.acquire] Utilizador ${userId} já possui sessão no dep ${departmentCode}. A reencaminhar.`);
      return existingAssignment;
    }

    // 3. Se não tem, significa que é uma nova sessão ou está a mudar de departamento.
    // Libera qualquer trava que o utilizador tenha em OUTROS departamentos.
    await PickingLock.releaseByUser(userId);

    // 4. Busca o próximo produto livre
    const product = await Product.findNextAvailableProduct(departmentCode);
    if (!product) {
      return null; // Nenhum produto disponível
    }

    // 5. Calcula o total pendente e tenta criar a trava
    const totalPending = await OrderItem.countPendingUnitsByProduct(product.codigo);
    const lock = await PickingLock.acquire({
      produtoCodigo: product.codigo,
      departamento: product.cod_departamento,
      userId,
      quantidadeMeta: totalPending,
    });

    if (!lock) {
      // CONDIÇÃO DE CORRIDA (RACE CONDITION):
      // Outro utilizador (ex: User 2) pegou este produto
      // entre a etapa 4 (find) e a etapa 5 (acquire).
      // O "ON CONFLICT" no PickingLock.acquire impediu a criação.
      console.warn(`[ProductService.acquire] Race condition para user ${userId}, produto ${product.codigo}. O lock falhou. A tentar de novo.`);
      
      // A forma mais simples de resolver é apenas retornar nulo 
      // e deixar o frontend tentar de novo (ou mostrar "sem produtos").
      return null;
    }

    // 6. Sucesso: retorna a nova sessão
    console.log(`[ProductService.acquire] Nova sessão para user ${userId}, produto ${product.codigo}.`);
    const pendentes = await OrderItem.countPendingUnitsByProduct(product.codigo);
    return {
      lock,
      product,
      pendentes,
      meta: lock.quantidade_meta,
    };
  },

  async pickUnit({ userId, sku }) { 
    const lock = await PickingLock.findByUser(userId);

    if (!lock) {
      throw new Error('Sessão de separação inválida para este utilizador.');
    }

    // 2. Define o 'produtoCodigo' a partir do lock
    const produtoCodigo = lock.produto_codigo;
    
    const product = await Product.findByCodigo(produtoCodigo);
    if (!product) {
      await PickingLock.releaseByUser(userId);
      throw new Error('Produto não encontrado na base.');
    }

    if (sku) {
      const normalizedSku = normalizeSku(sku);
      const expectedSku = normalizeSku(product.codigo);
      
      // MELHORIA BÓNUS: Verifique também o cod_fabrica
      const expectedSkuFab = normalizeSku(product.cod_fabrica); 

      if (normalizedSku !== expectedSku && normalizedSku !== expectedSkuFab) {
        throw new Error('SKU informado não corresponde ao produto atual.');
      }
    }

    // O 'produtoCodigo' aqui está correto (veio do lock)
    const allocation = await OrderItem.allocateUnit(produtoCodigo); 
    if (!allocation) {
      await PickingLock.releaseByUser(userId);
      return {
        finished: true,
        pendentes: 0
      };
    }

    const pendentes = await OrderItem.countPendingUnitsByProduct(produtoCodigo);
    
    // Atualiza o status do pedido no ML (sua lógica original)
    const allocationOrderId = Number(allocation.order_id);
    await ensureOrderStatusFor([allocationOrderId]);

    if (pendentes === 0) {
      // PRODUTO FINALIZADO!
      // Libera o lock para que o acquireProduct possa buscar o próximo
      await PickingLock.releaseByUser(userId);

      return {
        finished: true,
        pendentes: 0,
        // Retorna a quantidade concluída (a anterior + 1)
        quantidadeConcluida: lock.quantidade_concluida + 1
      };

    } else {
      // AINDA HÁ UNIDADES
      // Apenas atualiza o progresso do lock
      const newMeta = Math.max(lock.quantidade_concluida + 1 + pendentes, lock.quantidade_meta);
      const updatedLock = await PickingLock.updateProgress(produtoCodigo, 1, newMeta);

      return {
        finished: false, // pendentes NÃO é 0
        pendentes,
        quantidadeConcluida: updatedLock?.quantidade_concluida ?? (lock.quantidade_concluida + 1)
      };
    }
  },

  async releaseSession(userId) {
    return PickingLock.releaseByUser(userId);
  },

  getDepartmentLabel(code) {
    return DEPARTMENT_LABELS[code] || `Departamento ${code}`;
  }
};

module.exports = ProductService;


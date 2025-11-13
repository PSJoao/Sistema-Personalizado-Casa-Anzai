// services/OrderService.js
// Camada de regras de negócio para pedidos (Mercado Livre, outros canais futuramente)

const crypto = require('crypto');
const XLSX = require('xlsx');
const MercadoLivreOrder = require('../models/MercadoLivreOrder');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');

const PLATFORM_KEYS = {
  MERCADO_LIVRE: 'mercado_livre'
};

const STATUS_TRANSLATIONS = {
  pendente: 'Pendentes',
  separado: 'Separados',
  em_romaneio: 'Em Romaneio',
  enviado: 'Enviados'
};

const NUMERIC_COLUMNS = new Set([
  'unidades',
  'receita_produtos',
  'receita_acrescimo',
  'taxa_parcelamento_acrescimo',
  'tarifa_venda_impostos',
  'receita_envio',
  'tarifas_envio',
  'cancelamentos_reembolsos',
  'total',
  'preco_unitario'
]);

function canonicalizeHeader(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const RAW_HEADER_MAP = {
  'N.º de venda': 'numero_venda',
  'Data da venda': 'data_venda',
  'Estado': 'estado',
  'Descrição do status': 'descricao_status',
  'Pacote de diversos produtos': 'pacote_diversos_produtos',
  'Pertence a um kit': 'pertence_kit',
  'Unidades': 'unidades',
  'Receita por produtos (BRL)': 'receita_produtos',
  'Receita por acréscimo no preço (pago pelo comprador)': 'receita_acrescimo',
  'Taxa de parcelamento equivalente ao acréscimo': 'taxa_parcelamento_acrescimo',
  'Tarifa de venda e impostos (BRL)': 'tarifa_venda_impostos',
  'Receita por envio (BRL)': 'receita_envio',
  'Tarifas de envio (BRL)': 'tarifas_envio',
  'Cancelamentos e reembolsos (BRL)': 'cancelamentos_reembolsos',
  'Total (BRL)': 'total',
  'Mês de faturamento das suas tarifas': 'mes_faturamento_tarifas',
  'Venda por publicidade': 'venda_publicidade',
  'SKU': 'sku',
  '# de anúncio': 'numero_anuncio',
  'Canal de venda': 'canal_venda',
  'Loja oficial': 'loja_oficial',
  'Título do anúncio': 'titulo_anuncio',
  'Variação': 'variacao',
  'Preço unitário de venda do anúncio (BRL)': 'preco_unitario',
  'Tipo de anúncio': 'tipo_anuncio',
  'NF-e em anexo': 'nfe_anexo',
  'Dados pessoais ou da empresa': 'dados_pessoais_empresa',
  'Tipo e número do documento': 'documento',
  'Endereço': 'endereco',
  'Tipo de contribuinte': 'tipo_contribuinte',
  'Inscrição estadual': 'inscricao_estadual',
  'Comprador': 'comprador',
  'Negócio': 'negocio',
  'CPF': 'cpf',
  'Endereço_2': 'endereco_entrega',
  'Cidade': 'cidade',
  'Estado_2': 'estado_entrega',
  'CEP': 'cep',
  'País': 'pais'
};

const HEADER_MAP_MERCADO_LIVRE = Object.entries(RAW_HEADER_MAP).reduce((acc, [rawKey, value]) => {
  const canonicalKey = canonicalizeHeader(rawKey);
  if (canonicalKey) {
    acc[canonicalKey] = value;
  }
  return acc;
}, {});

/**
 * Faz o parsing de números brasileiros (1.234,56) para float.
 * @param {number|string|null} value
 * @returns {number|null}
 */
function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return Math.trunc(value);
  }

  const strValue = String(value).trim();
  if (!strValue) {
    return null;
  }

  const normalized = strValue.replace(',', '.');
  const floatVal = Number.parseFloat(normalized);

  if (Number.isFinite(floatVal)) {
    return Math.trunc(floatVal);
  }

  const digitsOnly = strValue.replace(/[^0-9-]/g, '');
  if (!digitsOnly) {
    return null;
  }

  const parsedInt = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(parsedInt) ? parsedInt : null;
}

/**
 * Converte valores "Sim/Não" da planilha para boolean.
 * @param {string|boolean|null} value
 * @returns {boolean|null}
 */
function toBoolean(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['sim', 'yes', 'true', '1'].includes(normalized)) {
    return true;
  }
  if (['não', 'nao', 'no', 'false', '0'].includes(normalized)) {
    return false;
  }
  return null;
}

/**
 * Converte datas de Excel (número serial) para Date.
 * @param {number|Date|string|null} value
 * @returns {Date|null}
 */
function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S));
  }

  // Se vier como string já formatada
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Normaliza os cabeçalhos duplicados (ex: segundo endereço/estado).
 * @param {Array<string>} headers
 * @returns {Array<string>}
 */
function normalizeHeaders(headers) {
  let enderecoCount = 0;
  let estadoCount = 0;

  return headers.map((header) => {
    if (!header) {
      return header;
    }

    if (header === 'Endereço') {
      enderecoCount += 1;
      return enderecoCount === 1 ? header : 'Endereço_2';
    }

    if (header === 'Estado') {
      estadoCount += 1;
      return estadoCount === 1 ? header : 'Estado_2';
    }

    return header;
  });
}

/**
 * Transforma a planilha do Mercado Livre em objetos prontos para inserção.
 * @param {Buffer} fileBuffer
 * @param {object} options
 * @returns {Array<object>}
 */
function parseMercadoLivreWorksheet(fileBuffer, options = {}) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
 
  if (!worksheet) {
    throw new Error('Planilha sem aba principal detectada.');
  }
 
  const rows = XLSX.utils.sheet_to_json(worksheet, {
     header: 1,
     raw: true,
     defval: null
   });
 
   if (rows.length < 7) {
     return [];
   }
 
  const normalizedHeaders = normalizeHeaders(rows[5]);

  const headerInfos = normalizedHeaders.map((header) => {
    if (!header) {
      return null;
    }
    const canonical = canonicalizeHeader(header);
    if (!canonical) {
      return null;
    }
    const internalKey = HEADER_MAP_MERCADO_LIVRE[canonical];
    if (!internalKey) {
      return null;
    }
    return { internalKey, canonical };
  });

  const numeroVendaIndex = headerInfos.findIndex((info) => info?.internalKey === 'numero_venda');
  const skuIndex = headerInfos.findIndex((info) => info?.internalKey === 'sku');

  if (numeroVendaIndex === -1 || skuIndex === -1) {
    throw new Error('As colunas "N.º de venda" ou "SKU" não foram reconhecidas na planilha.');
  }

  const dataRows = rows.slice(6).filter((row) => {
    return row && row[numeroVendaIndex] && row[skuIndex];
  });

  return dataRows.map((row) => {
    const normalizedRow = {};

    headerInfos.forEach((info, headerIndex) => {
      if (!info) {
        return;
      }

      let cellValue = row[headerIndex];

      if (NUMERIC_COLUMNS.has(info.internalKey)) {
        cellValue = toNumber(cellValue);
      } else if (info.internalKey === 'data_venda') {
        cellValue = toDate(cellValue);
      } else if (['pacote_diversos_produtos', 'pertence_kit', 'nfe_anexo'].includes(info.internalKey)) {
        cellValue = toBoolean(cellValue);
      } else if (typeof cellValue === 'string') {
        cellValue = cellValue.trim();
      }

      normalizedRow[info.internalKey] = cellValue;
    });

    normalizedRow.status_bucket = 'pendente';
    normalizedRow.plataforma = PLATFORM_KEYS.MERCADO_LIVRE;
    normalizedRow.uploaded_at = new Date();

    if (options.importBatchId) {
      normalizedRow.import_batch_id = options.importBatchId;
    }

    if (options.fileName) {
      normalizedRow.arquivo_original = options.fileName;
    }

    if (options.uploadedBy) {
      normalizedRow.uploaded_by = options.uploadedBy;
    }

    return normalizedRow;
  });
}

const OrderService = {

  /**
   * Retorna a lista de plataformas suportadas para upload.
   * @returns {Array<{id:string,label:string,descricao:string}>}
   */
  getAvailablePlatforms() {
    return [
      {
        id: PLATFORM_KEYS.MERCADO_LIVRE,
        label: 'Mercado Livre',
        descricao: 'Importação de planilhas provenientes do Mercado Livre.'
      }
    ];
  },

  /**
   * Faz a importação de uma planilha específica da plataforma Mercado Livre.
   * @param {Buffer} fileBuffer
   * @param {object} options
   * @param {string} options.fileName
   * @param {number} options.uploadedBy
   * @param {string} options.importBatchId
   * @returns {Promise<{inserted:number,updated:number,total:number}>}
   */
  async importMercadoLivrePlanilha(fileBuffer, { fileName, uploadedBy, importBatchId }) {
    const parsedRows = parseMercadoLivreWorksheet(fileBuffer, {
      fileName,
      uploadedBy,
      importBatchId
    });

    if (parsedRows.length === 0) {
      return { inserted: 0, updated: 0, total: 0 };
    }

    const result = await MercadoLivreOrder.bulkUpsert(parsedRows);

    const uniqueOrderNumbers = Array.from(
      new Set(parsedRows.map((row) => row.numero_venda).filter(Boolean))
    );

    const orderRecords = await MercadoLivreOrder.findByNumeroVendas(uniqueOrderNumbers);
    const orderMap = new Map();

    orderRecords.forEach((record) => {
      const key = `${record.numero_venda}::${record.sku || ''}::${record.variacao || ''}`;
      orderMap.set(key, record.id);
    });

    const aggregated = new Map();
    const missingProducts = new Set();
    const missingOrders = new Set();

    const candidateProductCodes = Array.from(
      new Set(
        parsedRows
          .map((row) => toInteger(row.sku))
          .filter((codigo) => codigo !== null && codigo !== undefined)
      )
    );

    const existingProductCodes = new Set(await Product.findExistingCodes(candidateProductCodes));

    parsedRows.forEach((row) => {
      const sku = row.sku;
      const orderKey = `${row.numero_venda}::${sku || ''}::${row.variacao || ''}`;
      const orderId = orderMap.get(orderKey);

      if (!orderId) {
        missingOrders.add(orderKey);
        return;
      }

      const produtoCodigo = toInteger(sku);
      if (!produtoCodigo) {
        missingProducts.add(sku);
        return;
      }

      if (!existingProductCodes.has(produtoCodigo)) {
        missingProducts.add(sku || produtoCodigo);
        return;
      }

      const quantidade = Number(row.unidades || 0);
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        return;
      }

      const aggregateKey = `${orderId}::${produtoCodigo}::${sku}`;
      const descricao = [row.titulo_anuncio, row.variacao].filter(Boolean).join(' - ');

      if (!aggregated.has(aggregateKey)) {
        aggregated.set(aggregateKey, {
          order_id: orderId,
          produto_codigo: produtoCodigo,
          sku,
          descricao_produto: descricao || row.titulo_anuncio || String(produtoCodigo),
          quantidade_total: 0,
          quantidade_separada: 0,
          status: 'pendente'
        });
      }

      const current = aggregated.get(aggregateKey);
      current.quantidade_total += quantidade;
    });

    let orderItemResult = { inserted: 0, updated: 0 };
    if (aggregated.size > 0) {
      orderItemResult = await OrderItem.bulkUpsert(Array.from(aggregated.values()));
    }

    if (missingProducts.size > 0) {
      console.warn('[OrderService] Produtos não encontrados na base:', Array.from(missingProducts.values()));
    }

    if (missingOrders.size > 0) {
      console.warn('[OrderService] Registos de pedido não conciliados:', missingOrders.size);
    }

    return {
      ...result,
      total: parsedRows.length,
      orderItems: orderItemResult,
      missingProducts: Array.from(missingProducts.values()),
      missingOrders: Array.from(missingOrders.values())
    };
  },

  /**
   * Recebe os ficheiros enviados e distribui para o importador correto.
   * @param {Array<{buffer:Buffer, originalname:string}>} files
   * @param {string} plataforma
   * @param {number} uploadedBy
   * @returns {Promise<Array<object>>}
   */
  async processUpload(files, plataforma, uploadedBy) {
    if (!files || files.length === 0) {
      throw new Error('Nenhum ficheiro foi recebido.');
    }

    if (plataforma !== PLATFORM_KEYS.MERCADO_LIVRE) {
      throw new Error('Plataforma ainda não suportada.');
    }

    const importBatchId = crypto.randomUUID();

    const results = [];

    for (const file of files) {
      const outcome = await this.importMercadoLivrePlanilha(file.buffer, {
        fileName: file.originalname,
        uploadedBy,
        importBatchId
      });
      results.push({
        fileName: file.originalname,
        ...outcome
      });
    }

    return results;
  },

  /**
   * Devolve o resumo por status já traduzido para exibição.
   * @returns {Promise<{cards:Array<{id:string,label:string,total:number}>}>}
   */
  async getStatusSummary() {
    const rawCounts = await MercadoLivreOrder.countByStatusBucket();

    const defaults = {
      pendente: 0,
      separado: 0,
      em_romaneio: 0,
      enviado: 0
    };

    rawCounts.forEach(({ status_bucket: bucket, total }) => {
      if (defaults.hasOwnProperty(bucket)) {
        defaults[bucket] = total;
      }
    });

    return {
      cards: Object.entries(defaults).map(([key, total]) => ({
        id: key,
        label: STATUS_TRANSLATIONS[key],
        total
      }))
    };
  },

  /**
   * Obtém pedidos recentes agrupados por bucket para exibição no dashboard.
   * @param {number} limitPorBucket
   * @returns {Promise<object>}
   */
  async getRecentOrdersGrouped(limitPorBucket = 6) {
    const buckets = Object.keys(STATUS_TRANSLATIONS);
    const result = {};

    for (const bucket of buckets) {
      result[bucket] = await MercadoLivreOrder.findRecentByStatusBucket(bucket, limitPorBucket);
    }

    return result;
  },

  /**
   * Lista pedidos por bucket específico para APIs.
   * @param {string} bucket
   * @param {number} limit
   * @returns {Promise<Array<object>>}
   */
  async getOrdersByBucket(bucket, limit = 50) {
    if (!STATUS_TRANSLATIONS[bucket]) {
      throw new Error('Bucket de status inválido.');
    }

    return MercadoLivreOrder.findByStatusBucket(bucket, limit);
  }
};

module.exports = OrderService;


// models/MercadoLivreOrder.js
// Responsável por interagir com a tabela mercado_livre_orders

const db = require('../config/database');

const TABLE_NAME = 'mercado_livre_orders';

const INSERT_COLUMNS = [
  'numero_venda',
  'data_venda',
  'estado',
  'descricao_status',
  'pacote_diversos_produtos',
  'pertence_kit',
  'unidades',
  'receita_produtos',
  'receita_acrescimo',
  'taxa_parcelamento_acrescimo',
  'tarifa_venda_impostos',
  'receita_envio',
  'tarifas_envio',
  'cancelamentos_reembolsos',
  'total',
  'mes_faturamento_tarifas',
  'venda_publicidade',
  'sku',
  'numero_anuncio',
  'canal_venda',
  'loja_oficial',
  'titulo_anuncio',
  'variacao',
  'preco_unitario',
  'tipo_anuncio',
  'nfe_anexo',
  'dados_pessoais_empresa',
  'documento',
  'endereco',
  'tipo_contribuinte',
  'inscricao_estadual',
  'comprador',
  'negocio',
  'cpf',
  'endereco_entrega',
  'cidade',
  'estado_entrega',
  'cep',
  'pais',
  'status_bucket',
  'plataforma',
  'import_batch_id',
  'arquivo_original',
  'uploaded_by',
  'uploaded_at'
];

const UPDATABLE_COLUMNS = [
  'data_venda',
  'estado',
  'descricao_status',
  'pacote_diversos_produtos',
  'pertence_kit',
  'unidades',
  'receita_produtos',
  'receita_acrescimo',
  'taxa_parcelamento_acrescimo',
  'tarifa_venda_impostos',
  'receita_envio',
  'tarifas_envio',
  'cancelamentos_reembolsos',
  'total',
  'mes_faturamento_tarifas',
  'venda_publicidade',
  'titulo_anuncio',
  'variacao',
  'preco_unitario',
  'tipo_anuncio',
  'nfe_anexo',
  'dados_pessoais_empresa',
  'documento',
  'endereco',
  'tipo_contribuinte',
  'inscricao_estadual',
  'comprador',
  'negocio',
  'cpf',
  'endereco_entrega',
  'cidade',
  'estado_entrega',
  'cep',
  'pais',
  'import_batch_id',
  'arquivo_original',
  'uploaded_by',
  'uploaded_at',
  'updated_at'
];

const UPSERT_BATCH_SIZE = 200;

function buildUpsertQuery(rows) {
  const values = [];

  const rowsSql = rows.map((row, rowIndex) => {
    const placeholders = INSERT_COLUMNS.map((column, columnIndex) => {
      values.push(row[column] !== undefined ? row[column] : null);
      const valueIndex = rowIndex * INSERT_COLUMNS.length + columnIndex + 1;
      return `$${valueIndex}`;
    });

    return `(${placeholders.join(', ')})`;
  });

  const updatesSql = UPDATABLE_COLUMNS
    .map((column) => {
      if (column === 'updated_at') {
        return `${column} = NOW()`;
      }
      return `${column} = EXCLUDED.${column}`;
    })
    .join(', ');

  const queryText = `
      INSERT INTO ${TABLE_NAME} (${INSERT_COLUMNS.join(', ')})
      VALUES ${rowsSql.join(', ')}
      ON CONFLICT (numero_venda, sku, variacao)
      DO UPDATE SET ${updatesSql}
      RETURNING id, numero_venda, sku, variacao, (xmax = 0) AS inserted;
    `;

  return { queryText, values };
}

const MercadoLivreOrder = {

  /**
   * Insere ou atualiza múltiplos pedidos numa única operação.
   * Conflitos são resolvidos pela combinação (numero_venda, sku, variacao).
   * @param {Array<object>} orderRows - Linhas já normalizadas para a estrutura da base.
   * @returns {Promise<{inserted:number, updated:number}>}
   */
  async bulkUpsert(orderRows) {
    if (!orderRows || orderRows.length === 0) {
      return { inserted: 0, updated: 0, records: [] };
    }

    let inserted = 0;
    let updated = 0;
    const records = [];

    for (let index = 0; index < orderRows.length; index += UPSERT_BATCH_SIZE) {
      const batch = orderRows.slice(index, index + UPSERT_BATCH_SIZE);
      const { queryText, values } = buildUpsertQuery(batch);

      const { rows } = await db.query(queryText, values);
      const batchInserted = rows.filter((row) => row.inserted).length;
      inserted += batchInserted;
      updated += rows.length - batchInserted;
      rows.forEach((row) => {
        records.push({
          id: row.id,
          inserted: row.inserted,
          numero_venda: row.numero_venda,
          sku: row.sku,
          variacao: row.variacao
        });
      });
    }

    return { inserted, updated, records };
  },

  /**
   * Recupera o total de pedidos por bucket de status.
   * @returns {Promise<Array<{status_bucket:string,total:number}>>}
   */
  async countByStatusBucket() {
    const query = `
      SELECT status_bucket, COUNT(*)::int AS total
      FROM ${TABLE_NAME}
      GROUP BY status_bucket;
    `;

    const { rows } = await db.query(query);
    return rows;
  },

  /**
   * Retorna os pedidos mais recentes para um bucket específico.
   * @param {string} statusBucket
   * @param {number} limit
   * @returns {Promise<Array<object>>}
   */
  async findRecentByStatusBucket(bucket, limit = 10) {
    const query = {
      text: `
        SELECT
          numero_venda,
          status_bucket,
          MAX(plataforma) AS plataforma,
          -- Pega o nome do comprador (geralmente o mesmo para todas as linhas)
          MAX(comprador) AS comprador,
          -- Pega a data da venda
          MAX(data_venda) AS data_venda,
          -- Concatena os nomes de todos os produtos do kit
          STRING_AGG(titulo_anuncio, ' | ') AS titulo_anuncio,
          -- Soma as unidades de todas as linhas do pedido
          SUM(unidades) AS unidades,
          -- Soma o total de todas as linhas do pedido
          SUM(total) AS total
        FROM ${TABLE_NAME}
        WHERE status_bucket = $1
        GROUP BY numero_venda, status_bucket
        ORDER BY data_venda DESC NULLS LAST
        LIMIT $2;
      `,
      values: [bucket, limit],
    };
    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  /**
   * Utilizado para obter todos os pedidos de um bucket (para APIs JSON).
   * @param {string} statusBucket
   * @param {number} limit
   * @returns {Promise<Array<object>>}
   */
  async findByStatusBucket(statusBucket, limit = 50) {
    const query = {
      text: `
        SELECT 
          id,
          numero_venda,
          data_venda,
          descricao_status,
          unidades,
          total,
          titulo_anuncio,
          comprador,
          plataforma,
          status_bucket,
          uploaded_at
        FROM ${TABLE_NAME}
        WHERE status_bucket = $1
        ORDER BY data_venda DESC NULLS LAST, uploaded_at DESC
        LIMIT $2
      `,
      values: [statusBucket, limit]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  async findById(id) {
    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE id = $1`,
      values: [id],
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async updateStatusByNumeroVenda(numeroVenda, statusBucket) {
    const query = {
      text: `
        UPDATE ${TABLE_NAME}
        SET status_bucket = $2, updated_at = NOW()
        WHERE numero_venda = $1
          AND status_bucket != $2; -- Evita atualizações desnecessárias
      `,
      values: [numeroVenda, statusBucket],
    };
    const { rowCount } = await db.query(query.text, query.values);
    return rowCount;
  },

  async findByNumeroVendas(orderNumbers) {
    if (!orderNumbers || orderNumbers.length === 0) {
      return [];
    }

    const query = {
      text: `
        SELECT id, numero_venda, sku, variacao
        FROM ${TABLE_NAME}
        WHERE numero_venda = ANY($1);
      `,
      values: [orderNumbers]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  async updateStatus(orderId, statusBucket) {
    const query = {
      text: `
        UPDATE ${TABLE_NAME}
        SET status_bucket = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
      values: [orderId, statusBucket]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async bulkUpdateStatus(updates) {
    if (!updates || updates.length === 0) {
      return [];
    }

    const filteredUpdates = updates
      .map((update) => ({
        orderId: Number(update.orderId),
        statusBucket: update.statusBucket
      }))
      .filter((update) => Number.isFinite(update.orderId));

    if (filteredUpdates.length === 0) {
      return [];
    }

    const valueClauses = filteredUpdates
      .map((update, index) => `($${index * 2 + 1}::BIGINT, $${index * 2 + 2}::TEXT)`)
      .join(', ');

    const values = filteredUpdates.flatMap((update) => [update.orderId, update.statusBucket]);

    const query = {
      text: `
        UPDATE ${TABLE_NAME} AS m
        SET status_bucket = data.status_bucket,
            updated_at = NOW()
        FROM (VALUES ${valueClauses}) AS data(id, status_bucket)
        WHERE m.id = data.id
        RETURNING m.id, m.status_bucket;
      `,
      values
    };

    const { rows } = await db.query(query.text, query.values);
    return rows;
  }
};

module.exports = MercadoLivreOrder;


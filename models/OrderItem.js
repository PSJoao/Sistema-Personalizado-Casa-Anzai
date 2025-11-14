// models/OrderItem.js
// Gestão dos vínculos entre pedidos e produtos

const db = require('../config/database');

const TABLE_NAME = 'order_items';

const ORDER_ITEM_COLUMNS = [
  'order_id',
  'produto_codigo',
  'sku',
  'descricao_produto',
  'quantidade_total',
  'quantidade_separada',
  'status'
];

const UPSERT_BATCH_SIZE = 200;

function buildUpsertQuery(rows) {
  const values = [];

  const rowsSql = rows.map((row, rowIndex) => {
    const placeholders = ORDER_ITEM_COLUMNS.map((column, columnIndex) => {
      values.push(row[column] !== undefined ? row[column] : null);
      const valueIndex = rowIndex * ORDER_ITEM_COLUMNS.length + columnIndex + 1;
      return `$${valueIndex}`;
    });

    return `(${placeholders.join(', ')})`;
  });

  const updateAssignments = [
    'descricao_produto = EXCLUDED.descricao_produto',
    'quantidade_total = EXCLUDED.quantidade_total',
    `status = CASE 
        WHEN ${TABLE_NAME}.quantidade_separada >= EXCLUDED.quantidade_total THEN 'separado'
        ELSE 'pendente'
      END`,
    'updated_at = NOW()'
  ].join(', ');

  const queryText = `
      INSERT INTO ${TABLE_NAME} (${ORDER_ITEM_COLUMNS.join(', ')})
      VALUES ${rowsSql.join(', ')}
      ON CONFLICT (order_id, produto_codigo, sku)
      DO UPDATE SET ${updateAssignments}
      RETURNING id, (xmax = 0) AS inserted;
    `;

  return { queryText, values };
}

const OrderItem = {

  async bulkUpsert(orderItemRows) {
    if (!orderItemRows || orderItemRows.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    let inserted = 0;
    let updated = 0;

    for (let index = 0; index < orderItemRows.length; index += UPSERT_BATCH_SIZE) {
      const batch = orderItemRows.slice(index, index + UPSERT_BATCH_SIZE);
      const { queryText, values } = buildUpsertQuery(batch);

      const { rows } = await db.query(queryText, values);
      const batchInserted = rows.filter((row) => row.inserted).length;
      inserted += batchInserted;
      updated += rows.length - batchInserted;
    }

    return { inserted, updated };
  },

  async countPendingUnitsByProduct(produtoCodigo) {
    const query = {
      text: `
        SELECT COALESCE(SUM(quantidade_total - quantidade_separada), 0) AS pendentes
        FROM ${TABLE_NAME}
        WHERE produto_codigo = $1
      `,
      values: [produtoCodigo]
    };

    const { rows } = await db.query(query.text, query.values);
    return Number(rows[0]?.pendentes || 0);
  },

  async allocateUnit(produtoCodigo) {
    const query = {
      text: `
        WITH next_item AS (
          SELECT id
          FROM ${TABLE_NAME}
          WHERE produto_codigo = $1
            AND quantidade_separada < quantidade_total
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ${TABLE_NAME} oi
        SET quantidade_separada = quantidade_separada + 1,
            status = CASE 
              WHEN quantidade_separada + 1 >= quantidade_total THEN 'separado'
              ELSE 'pendente'
            END,
            updated_at = NOW()
        FROM next_item
        WHERE oi.id = next_item.id
        RETURNING oi.id, oi.order_id, oi.produto_codigo, oi.quantidade_total, oi.quantidade_separada, oi.status;
      `,
      values: [produtoCodigo]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async findOrderStatusByNumeroVenda(numeroVenda) {
    const query = {
      text: `
        SELECT
          mlo.numero_venda,
          -- Conta o total de itens (linhas de produto) para este pedido
          COUNT(oi.id) AS total_itens,
          -- Conta quantos itens estão com status 'separado'
          COUNT(oi.id) FILTER (WHERE oi.status = 'separado') AS itens_separados,
          -- Retorna true APENAS se todos os itens estiverem separados
          BOOL_AND(oi.status = 'separado') AS pedido_completo
        FROM ${TABLE_NAME} oi
        JOIN public.mercado_livre_orders mlo ON oi.order_id = mlo.id
        WHERE mlo.numero_venda = $1
        GROUP BY mlo.numero_venda;
      `,
      values: [numeroVenda],
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  }
};

module.exports = OrderItem;


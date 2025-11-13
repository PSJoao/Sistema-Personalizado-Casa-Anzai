// models/Product.js
// Camada de acesso a dados para produtos provenientes do ERP

const db = require('../config/database');

const TABLE_NAME = 'products';

const PRODUCT_COLUMNS = [
  'codigo',
  'cod_fabrica',
  'descricao',
  'referencia',
  'unidade',
  'item_ativo',
  'cod_grupo',
  'grupo',
  'cod_departamento',
  'departamento',
  'cod_marca',
  'marca',
  'cod_fornecedor',
  'fornecedor',
  'nivel_de_giro',
  'preco_custo_ultima_compra',
  'ativo',
  'ativo_compra',
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
  'preco_custo_real',
  'classificacao_ipi',
  'abreviacao_fiscal',
  'abreviacao_pis',
  'abreviacao_cofins',
  'cest',
  'tipo_produto'
];

const UPSERT_BATCH_SIZE = 200;

function buildUpsertQuery(rows) {
  const values = [];

  const rowsSql = rows.map((row, rowIndex) => {
    const placeholders = PRODUCT_COLUMNS.map((column, columnIndex) => {
      values.push(row[column] !== undefined ? row[column] : null);
      const valueIndex = rowIndex * PRODUCT_COLUMNS.length + columnIndex + 1;
      return `$${valueIndex}`;
    });

    return `(${placeholders.join(', ')})`;
  });

  const updateAssignments = PRODUCT_COLUMNS.filter((column) => column !== 'codigo')
    .map((column) => `${column} = EXCLUDED.${column}`)
    .concat(['updated_at = NOW()'])
    .join(', ');

  const queryText = `
      INSERT INTO ${TABLE_NAME} (${PRODUCT_COLUMNS.join(', ')})
      VALUES ${rowsSql.join(', ')}
      ON CONFLICT (codigo)
      DO UPDATE SET ${updateAssignments}
      RETURNING codigo, (xmax = 0) AS inserted;
    `;

  return { queryText, values };
}

const Product = {

  async bulkUpsert(productRows) {
    if (!productRows || productRows.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    let inserted = 0;
    let updated = 0;

    for (let index = 0; index < productRows.length; index += UPSERT_BATCH_SIZE) {
      const batch = productRows.slice(index, index + UPSERT_BATCH_SIZE);
      const { queryText, values } = buildUpsertQuery(batch);

      const { rows } = await db.query(queryText, values);
      const batchInserted = rows.filter((row) => row.inserted).length;
      inserted += batchInserted;
      updated += rows.length - batchInserted;
    }

    return { inserted, updated };
  },

  async findByCodigo(codigo) {
    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE codigo = $1`,
      values: [codigo]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async findPendingDepartments() {
    const query = `
      SELECT 
        p.cod_departamento,
        COALESCE(d.name, p.departamento) AS departamento_nome,
        COUNT(DISTINCT p.codigo) AS produtos_com_pendencia,
        SUM(oi.quantidade_total - oi.quantidade_separada) AS unidades_pendentes
      FROM order_items oi
      INNER JOIN products p ON p.codigo = oi.produto_codigo
      LEFT JOIN departments d ON d.code = p.cod_departamento
      WHERE (oi.quantidade_total - oi.quantidade_separada) > 0
      GROUP BY p.cod_departamento, departamento_nome
      ORDER BY departamento_nome ASC;
    `;

    const { rows } = await db.query(query);
    return rows;
  },

  async findPendingProductsByDepartment(departmentCode) {
    const query = {
      text: `
        SELECT 
          p.codigo,
          p.descricao,
          p.departamento,
          p.cod_departamento,
          p.unidade,
          SUM(oi.quantidade_total - oi.quantidade_separada) AS unidades_pendentes
        FROM order_items oi
        INNER JOIN products p ON p.codigo = oi.produto_codigo
        WHERE p.cod_departamento = $1
          AND (oi.quantidade_total - oi.quantidade_separada) > 0
        GROUP BY p.codigo, p.descricao, p.departamento, p.cod_departamento, p.unidade
        ORDER BY p.descricao ASC;
      `,
      values: [departmentCode]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  async findExistingCodes(codes) {
    if (!codes || codes.length === 0) {
      return [];
    }

    const query = {
      text: `SELECT codigo FROM ${TABLE_NAME} WHERE codigo = ANY($1)`,
      values: [codes]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows.map((row) => Number(row.codigo));
  },

  async findNextAvailableProduct(departmentCode) {
    const query = {
      text: `
        WITH pending AS (
          SELECT 
            p.codigo,
            p.descricao,
            p.departamento,
            p.cod_departamento,
            p.unidade,
            SUM(oi.quantidade_total - oi.quantidade_separada) AS unidades_pendentes
          FROM order_items oi
          INNER JOIN products p ON p.codigo = oi.produto_codigo
          WHERE p.cod_departamento = $1
            AND (oi.quantidade_total - oi.quantidade_separada) > 0
          GROUP BY p.codigo, p.descricao, p.departamento, p.cod_departamento, p.unidade
        )
        SELECT pending.*
        FROM pending
        LEFT JOIN picking_locks pl ON pl.produto_codigo = pending.codigo
        WHERE pl.produto_codigo IS NULL
        ORDER BY pending.descricao ASC
        LIMIT 1;
      `,
      values: [departmentCode]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  }
};

module.exports = Product;


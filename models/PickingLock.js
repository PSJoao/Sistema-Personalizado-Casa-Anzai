// models/PickingLock.js
// Gerencia as travas de separação por produto e operador

const db = require('../config/database');

const TABLE_NAME = 'picking_locks';

const PickingLock = {

  async acquire({ produtoCodigo, departamento, userId, quantidadeMeta }) {
    const query = {
      text: `
        INSERT INTO ${TABLE_NAME} (produto_codigo, departamento, user_id, quantidade_meta, quantidade_concluida)
        VALUES ($1, $2, $3, $4, 0)
        ON CONFLICT (produto_codigo) DO NOTHING
        RETURNING *;
      `,
      values: [produtoCodigo, departamento, userId, quantidadeMeta]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async findByUser(userId) {
    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE user_id = $1`,
      values: [userId]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async findByProduct(produtoCodigo) {
    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE produto_codigo = $1`,
      values: [produtoCodigo]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async updateProgress(produtoCodigo, increment = 1, quantidadeMeta) {
    const query = {
      text: `
        UPDATE ${TABLE_NAME}
        SET quantidade_concluida = quantidade_concluida + $2,
            quantidade_meta = $3,
            updated_at = NOW()
        WHERE produto_codigo = $1
        RETURNING *;
      `,
      values: [produtoCodigo, increment, quantidadeMeta]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async clearStaleLocks(timeoutMinutes = 120) {
    const query = {
      text: `
        DELETE FROM ${TABLE_NAME} 
        WHERE updated_at < NOW() - INTERVAL '${Number(timeoutMinutes)} minutes';
      `,
    };

    try {
      const { rowCount } = await db.query(query.text);
      if (rowCount > 0) {
        console.log(`[PickingLock.clearStaleLocks] Limpas ${rowCount} travas obsoletas.`);
      }
      return rowCount;
    } catch (error) {
      console.error('[PickingLock.clearStaleLocks] Erro ao limpar travas obsoletas:', error);
    }
  },

  async releaseByUser(userId) {
    const query = {
      text: `DELETE FROM ${TABLE_NAME} WHERE user_id = $1 RETURNING *;`,
      values: [userId]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async releaseByProduct(produtoCodigo) {
    const query = {
      text: `DELETE FROM ${TABLE_NAME} WHERE produto_codigo = $1 RETURNING *;`,
      values: [produtoCodigo]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  }
};

module.exports = PickingLock;


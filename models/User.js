// Importa a configuração do nosso pool de conexão do banco de dados
const db = require('../config/database');
// Importa o bcrypt para 'hash' de senha na criação
const bcrypt = require('bcryptjs');

const User = {
    /**
     * Encontra um usuário pelo seu nome de usuário (username).
     * Usado para o processo de login.
     * @param {string} username - O nome de usuário a ser buscado.
     * @returns {Promise<object|null>} O objeto do usuário se encontrado, ou null.
     */
    async findByUsername(username) {
        try {
            const query = {
                text: 'SELECT * FROM users WHERE username = $1',
                values: [username],
            };
            const { rows } = await db.query(query.text, query.values);

            // Retorna o primeiro usuário encontrado (ou null se 'rows' estiver vazio)
            return rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar usuário por username:', error);
            throw error;
        }
    },

    /**
     * Encontra um usuário pelo seu ID.
     * @param {number} id - O ID do usuário.
     * @returns {Promise<object|null>} O objeto do usuário se encontrado, ou null.
     */
    async findById(id) {
        try {
            const query = {
                text: 'SELECT id, username, role, created_at FROM users WHERE id = $1',
                values: [id],
            };
            const { rows } = await db.query(query.text, query.values);
            
            // Retorna o usuário (sem a senha)
            return rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar usuário por ID:', error);
            throw error;
        }
    },

    /**
     * Cria um novo usuário no banco de dados.
     * A senha já deve vir 'hashed' do AuthService, mas por segurança,
     * vamos garantir o hash aqui também ou mover a lógica de hash para cá.
     * Por uma questão de separação de responsabilidades, o hash será feito no AuthService,
     * mas o model é um bom lugar para centralizar isso se preferir.
     *
     * Vamos adotar o padrão de receber os dados e o AuthService já ter feito o hash.
     *
     * @param {string} username
     * @param {string} hashedPassword - A senha já processada pelo bcrypt.
     * @param {string} role - 'funcionario' ou 'admin'.
     * @returns {Promise<object>} O novo usuário criado (sem a senha).
     */
    async create(username, hashedPassword, role = 'funcionario') {
        try {
            const query = {
                text: `
                    INSERT INTO users (username, password_hash, role)
                    VALUES ($1, $2, $3)
                    RETURNING id, username, role, created_at
                `,
                values: [username, hashedPassword, role],
            };

            const { rows } = await db.query(query.text, query.values);
            return rows[0];
        } catch (error) {
            // Trata erros de 'unique constraint' (usuário já existe)
            if (error.code === '23505') {
                throw new Error('Nome de usuário já existe.');
            }
            console.error('Erro ao criar usuário:', error);
            throw error;
        }
    }
};

module.exports = User;

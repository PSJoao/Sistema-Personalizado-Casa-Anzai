// Importa as ferramentas necessárias
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Para aceder ao process.env.JWT_SECRET

/**
 * Middleware para proteger rotas.
 * Verifica se o utilizador possui um JWT válido.
 */
function protectRoute(req, res, next) {
  // Verifica o cookie 'auth_token' que definimos no AuthController
  const token = req.cookies.auth_token;

  // 1. Se não houver token, o utilizador não está autenticado.
  if (!token) {
    console.log('[Auth Middleware] Acesso negado. Token não encontrado.');
    // Redireciona imediatamente para o login.
    return res.redirect('/auth/login');
  }

  // 2. Se houver um token, tenta verificá-lo.
  try {
    // Tenta verificar o token usando o nosso segredo
    const decodedPayload = jwt.verify(token, process.env.JWT_SECRET);

    // O token é válido! Decodificamos o payload (que contém id, username, role)
    // Anexamos os dados do utilizador ao objeto 'req' (req.user)
    // para que as rotas protegidas saibam *quem* está logado.
    req.user = decodedPayload;

    // O utilizador está autenticado, permite que a requisição continue
    // para o próximo handler (ex: renderizar o dashboard).
    next();

  } catch (error) {
    // 3. Ocorreu um erro na verificação (token expirado, inválido, etc.)
    console.error('[Auth Middleware] Token inválido ou expirado:', error.message);
    
    // Limpa o cookie inválido do navegador (importante!)
    res.clearCookie('auth_token');
    
    // Redireciona para a página de login
    return res.redirect('/auth/login');
  }
}

// Exportamos a função de middleware
module.exports = {
  protectRoute,
  // (Aqui também adicionaremos a função 'checkRole' para Admin/Funcionário no futuro)
};

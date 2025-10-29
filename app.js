// --- 1. Importações ---
require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const cookieParser = require('cookie-parser');
// NOVA IMPORTAÇÃO: O nosso "segurança" (porteiro)
const { protectRoute } = require('./middleware/authMiddleware'); // Certifique-se que o caminho está correto

// --- 2. Inicialização da Aplicação ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- 3. Configuração dos Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- 4. Configuração da View Engine (Handlebars) ---

// Carrega os helpers personalizados
const customHelpers = require('./helpers/handlebars-helpers');

app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: customHelpers
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// --- 5. Definição de Rotas ---

const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

const userRoutes = require('./routes/userRoutes');
app.use('/admin/users', userRoutes);


// --- Rota Raiz (Redireciona para o login) ---
app.get('/', (req, res) => {
    // Se o usuário já estiver logado (tem token), vai para o dashboard
    // Se não, vai para o login (será tratado pelo protectRoute se tentasse /dashboard)
    res.redirect('/dashboard'); 
});

// --- Rota do Dashboard (AGORA PROTEGIDA) ---
// 1. O 'protectRoute' é executado primeiro.
// 2. Se o token for válido, ele chama next() e o (req, res) => {...} é executado.
// 3. Se o token for inválIDO, o 'protectRoute' redireciona para /auth/login.
app.get('/dashboard', protectRoute, (req, res) => {
    // 'req.user' foi adicionado pelo middleware protectRoute
    // Agora podemos passar o nome de usuário, cargo, etc., para a view.
    res.render('dashboard', {
        user: req.user // Passa os dados do usuário (payload do JWT) para o .hbs
    });
});


// --- 6. Inicialização do Servidor ---
app.listen(PORT, () => {
    console.log(`[Casa Anzai] Servidor rodando na porta ${PORT}`);
    console.log(`Acesse em: http://localhost:${PORT}`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true })); // Importante para enviar cookies
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'chave-secreta-muito-segura';

// Supabase (Usado APENAS no backend com Service Role Key para ignorar RLS ou validar info)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// GA4 Client
const analyticsDataClient = new BetaAnalyticsDataClient();

// ============================================
// MIDDLEWARE: Verifica Autenticação e injeta perfil "PropertyID"
// ============================================
const requireAuth = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Acesso negado. Token não encontrado.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, email, nome, ga4PropertyId, clarityProjectId }
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
};

// ============================================
// Endpoint: Login (Valida e cria Cookie HTTP-Only)
// ============================================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Tenta logar o cliente usando Auth do Supabase (via backend)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email, password
        });

        if (authError || !authData.user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // 2. Busca informações do Client na Tabela (Properties)
        const { data: clientData, error: dbError } = await supabase
            .from('clientes_dashboard')
            .select('nome, google_property_id, clarity_project_id')
            .eq('user_id', authData.user.id)
            .single();

        if (dbError || !clientData) {
            return res.status(404).json({ error: 'Dashboard não configurado para esta conta.' });
        }

        // 3. Monta o payload do JWT com os dados de Property para não dependermos de .env global
        const payload = {
            id: authData.user.id,
            email: authData.user.email,
            nome: clientData.nome,
            ga4PropertyId: clientData.google_property_id,
            clarityProjectId: clientData.clarity_project_id
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

        // 4. Secreta o token via Cookie HttpOnly (O React não consegue ler o cookie via JS, é 100% seguro)
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
        });

        // Retorna dados públicos pro React salvar no estado pra renderizar o nome na tela.
        res.json({ success: true, user: { nome: payload.nome, email: payload.email } });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro de servidor' });
    }
});

// ============================================
// Endpoint: Check Session
// ============================================
app.get('/api/session', requireAuth, (req, res) => {
    res.json({ success: true, user: { nome: req.user.nome, email: req.user.email } });
});

// ============================================
// Endpoint: Logout
// ============================================
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// ============================================
// Endpoint: Resumo de Métricas Principais
// ============================================
app.get('/api/metrics', requireAuth, async (req, res) => {
    try {
        const propertyId = req.user.ga4PropertyId;
        let gaData = { totalVisits: 0, bounceRate: 0 };

        if (propertyId) {
            const [response] = await analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
                metrics: [{ name: 'sessions' }, { name: 'bounceRate' }],
            });
            if (response && response.rows && response.rows.length > 0) {
                gaData.totalVisits = response.rows[0].metricValues[0].value;
                gaData.bounceRate = (Number(response.rows[0].metricValues[1].value) * 100).toFixed(2) + '%';
            }
        }

        res.json({
            success: true,
            data: {
                totalVisitsGA: gaData.totalVisits || "N/A",
                bounceRateGA: gaData.bounceRate || "N/A",
                activeUsersClarity: 142,
                avgTimeClarity: '02:34'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Gráficos de Tráfego Diário (GA4)
// ============================================
app.get('/api/traffic', requireAuth, async (req, res) => {
    try {
        const propertyId = req.user.ga4PropertyId;
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'sessions' }],
        });

        const formattedData = response.rows.map(row => ({
            date: row.dimensionValues[0].value,
            analytics: parseInt(row.metricValues[0].value, 10),
            clarity: Math.floor(Math.random() * 5000),
        }));

        formattedData.sort((a, b) => a.date.localeCompare(b.date));
        res.json({ success: true, data: formattedData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Páginas Mais Acessadas (GA4)
// ============================================
app.get('/api/top-pages', requireAuth, async (req, res) => {
    try {
        const propertyId = req.user.ga4PropertyId;
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
            limit: 5,
        });

        const pages = response.rows.map(row => ({
            path: row.dimensionValues[0].value,
            views: row.metricValues[0].value,
            time: (Number(row.metricValues[1].value)).toFixed(0) + 's',
            heat: 'Alta',
        }));

        res.json({ success: true, data: pages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor protegido da API rodando na porta ${PORT}`);
});

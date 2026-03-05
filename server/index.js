require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const axios = require('axios');

const app = express();
// CORS: usa CORS_ORIGINS do .env (ex: "https://dash.seudominio.com") ou localhost para dev
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:5174'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 80;
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
app.get('/api/metrics', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const clarityToken = req.query.clarityToken;
        const startDate = req.query.dateRange || '7daysAgo';
        let gaData = { totalVisits: 0, bounceRate: 0, avgSessionDuration: '00:00', activeUsers: 0, newUsers: 0, pagesPerSession: '0' };
        let clarityData = { activeUsers: 0, avgTime: '00:00' };

        // ---- Google Analytics ----
        if (propertyId) {
            const [response] = await analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate, endDate: 'today' }],
                metrics: [
                    { name: 'sessions' },
                    { name: 'bounceRate' },
                    { name: 'averageSessionDuration' },
                    { name: 'activeUsers' },
                    { name: 'newUsers' },
                    { name: 'screenPageViewsPerSession' }
                ],
            });
            if (response && response.rows && response.rows.length > 0) {
                const row = response.rows[0].metricValues;
                gaData.totalVisits = row[0].value;
                gaData.bounceRate = (Number(row[1].value) * 100).toFixed(1) + '%';
                const avgSec = Math.round(Number(row[2].value));
                gaData.avgSessionDuration = `${String(Math.floor(avgSec / 60)).padStart(2, '0')}:${String(avgSec % 60).padStart(2, '0')}`;
                gaData.activeUsers = row[3].value;
                gaData.newUsers = row[4].value;
                gaData.pagesPerSession = Number(row[5].value).toFixed(1);
            }
        }

        // ---- Microsoft Clarity ----
        if (clarityToken) {
            try {
                const clarityRes = await axios.get(
                    'https://www.clarity.ms/export-data/api/v1/project-live-insights',
                    {
                        params: { numOfDays: 3 },
                        headers: { Authorization: `Bearer ${clarityToken}` }
                    }
                );
                const cData = clarityRes.data;
                if (cData) {
                    // Clarity retorna arrays de métricas. Vamos somar/pegar os totais
                    if (cData.trafficCount !== undefined) {
                        clarityData.activeUsers = cData.trafficCount;
                    } else if (Array.isArray(cData) && cData.length > 0) {
                        // Tenta somar o tráfego de todas as linhas
                        clarityData.activeUsers = cData.reduce((sum, row) => sum + (row.trafficCount || 0), 0);
                    }
                    if (cData.engagementTime !== undefined) {
                        const totalSec = Math.round(cData.engagementTime);
                        clarityData.avgTime = `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
                    } else if (Array.isArray(cData) && cData.length > 0 && cData[0].engagementTime !== undefined) {
                        const totalSec = Math.round(cData.reduce((sum, row) => sum + (row.engagementTime || 0), 0) / cData.length);
                        clarityData.avgTime = `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
                    }
                }
            } catch (clarityErr) {
                console.warn('Clarity API Error (metrics):', clarityErr.response?.data || clarityErr.message);
            }
        }

        res.json({
            success: true,
            data: {
                totalVisitsGA: gaData.totalVisits || "0",
                bounceRateGA: gaData.bounceRate || "0%",
                avgTimeGA: gaData.avgSessionDuration,
                activeUsersGA: gaData.activeUsers || "0",
                newUsersGA: gaData.newUsers || "0",
                pagesPerSessionGA: gaData.pagesPerSession || "0",
                activeUsersClarity: clarityData.activeUsers,
                avgTimeClarity: clarityData.avgTime
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Gráficos de Tráfego Diário (GA4)
// ============================================
app.get('/api/traffic', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const clarityToken = req.query.clarityToken;
        const startDate = req.query.dateRange || '7daysAgo';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        // ---- Google Analytics ----
        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'sessions' }],
        });

        const formattedData = response.rows.map(row => ({
            date: row.dimensionValues[0].value,
            analytics: parseInt(row.metricValues[0].value, 10),
            clarity: 0,
        }));

        formattedData.sort((a, b) => a.date.localeCompare(b.date));

        // ---- Microsoft Clarity (Interações) ----
        if (clarityToken) {
            try {
                const clarityRes = await axios.get(
                    'https://www.clarity.ms/export-data/api/v1/project-live-insights',
                    {
                        params: { numOfDays: 1 },
                        headers: { Authorization: `Bearer ${clarityToken}` }
                    }
                );
                const cData = clarityRes.data;
                if (cData) {
                    // Distribui proporcionalmente o tráfego do Clarity pelos dias do GA4
                    let totalClarity = 0;
                    if (cData.trafficCount !== undefined) {
                        totalClarity = cData.trafficCount;
                    } else if (Array.isArray(cData) && cData.length > 0) {
                        totalClarity = cData.reduce((sum, row) => sum + (row.trafficCount || 0), 0);
                    }
                    // Atribui o valor de clarity ao último dia nos dados (últimas 24h)
                    if (totalClarity > 0 && formattedData.length > 0) {
                        formattedData[formattedData.length - 1].clarity = totalClarity;
                    }
                }
            } catch (clarityErr) {
                console.warn('Clarity API Error (traffic):', clarityErr.response?.data || clarityErr.message);
            }
        }

        res.json({ success: true, data: formattedData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Páginas Mais Acessadas (GA4)
// ============================================
app.get('/api/top-pages', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        const startDate = req.query.dateRange || '7daysAgo';

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 10,
        });

        const pages = (response.rows || []).map(row => ({
            path: row.dimensionValues[0].value,
            views: parseInt(row.metricValues[0].value, 10),
            time: (Number(row.metricValues[1].value)).toFixed(0) + 's',
        }));

        res.json({ success: true, data: pages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Canais de Origem (GA4)
// ============================================
app.get('/api/sources', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const startDate = req.query.dateRange || '7daysAgo';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate: 'today' }],
            dimensions: [{ name: 'sessionSource' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 10,
        });

        const sources = (response.rows || []).map(row => {
            // Capitaliza e formata o nome da fonte para ficar bonito no gráfico
            let name = row.dimensionValues[0].value;
            // Substitui (not set) e (direct) por nomes amigáveis
            if (name === '(direct)') name = 'Direto';
            else if (name === '(not set)') name = 'Não Definido';
            else name = name.charAt(0).toUpperCase() + name.slice(1); // Ex: instagram → Instagram
            return {
                name,
                value: parseInt(row.metricValues[0].value, 10),
            };
        });

        res.json({ success: true, data: sources });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Eventos (GA4)
// ============================================
app.get('/api/events', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const startDate = req.query.dateRange || '7daysAgo';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate: 'today' }],
            dimensions: [{ name: 'eventName' }],
            metrics: [{ name: 'eventCount' }],
            orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
            limit: 10,
        });

        const events = (response.rows || []).map(row => ({
            name: row.dimensionValues[0].value,
            count: parseInt(row.metricValues[0].value, 10),
        }));

        res.json({ success: true, data: events });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Sessões por Dispositivo (GA4)
// ============================================
app.get('/api/devices', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const startDate = req.query.dateRange || '7daysAgo';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate: 'today' }],
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        });

        const devices = (response.rows || []).map(row => ({
            name: row.dimensionValues[0].value.charAt(0).toUpperCase() + row.dimensionValues[0].value.slice(1),
            value: parseInt(row.metricValues[0].value, 10),
        }));

        res.json({ success: true, data: devices });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Navegadores (GA4)
// ============================================
app.get('/api/browsers', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const startDate = req.query.dateRange || '7daysAgo';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate: 'today' }],
            dimensions: [{ name: 'browser' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 8,
        });

        const browsers = (response.rows || []).map(row => ({
            name: row.dimensionValues[0].value,
            value: parseInt(row.metricValues[0].value, 10),
        }));

        res.json({ success: true, data: browsers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Países (GA4) — Mapa de Usuários
// ============================================
app.get('/api/countries', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const startDate = req.query.dateRange || '7daysAgo';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate: 'today' }],
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
            limit: 15,
        });

        const countries = (response.rows || []).map(row => ({
            country: row.dimensionValues[0].value,
            users: parseInt(row.metricValues[0].value, 10),
            sessions: parseInt(row.metricValues[1].value, 10),
        }));

        res.json({ success: true, data: countries });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\uD83D\uDE80 Servidor rodando na porta ${PORT}`);
});

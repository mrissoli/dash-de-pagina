require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const axios = require('axios');

const app = express();
// CORS: reflete dinamicamente a origem (permite que a Vercel/Easypanel chamem a API com cookies)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'chave-secreta-muito-segura';

// Supabase (Usado APENAS no backend com Service Role Key para ignorar RLS ou validar info)
let supabase;
let supabaseAdmin; // cliente dedicado com service role para bypass de RLS
try {
    const supaUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'dummy';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    supabase = createClient(supaUrl, supaKey);
    // supabaseAdmin usa APENAS a service role key — nunca cai para anon key
    // Sem service role key, consultas admin retornarão erro claro
    if (serviceRoleKey) {
        supabaseAdmin = createClient(supaUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });
        console.log('Supabase Admin client (service role) inicializado.');
    } else {
        console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY não configurada! Endpoints admin usarão client padrão (RLS ativo).');
        supabaseAdmin = supabase; // fallback degradado
    }
} catch (err) {
    console.error("Falha ao inicializar Supabase:", err.message);
}

// GA4 Client — credenciais via GOOGLE_APPLICATION_CREDENTIALS_JSON (JSON puro ou base64)
let analyticsDataClient;
try {
    let clientOptions = {};
    const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (credJson) {
        let parsed;
        try {
            parsed = JSON.parse(credJson);
        } catch {
            parsed = JSON.parse(Buffer.from(credJson, 'base64').toString('utf8'));
        }
        clientOptions.credentials = parsed;
    }
    analyticsDataClient = new BetaAnalyticsDataClient(clientOptions);
    console.log('GA4 client inicializado com sucesso.');
} catch (err) {
    console.error('Falha ao inicializar GA4 client:', err.message);
    analyticsDataClient = null;
}

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
// Endpoint: Usuários em Tempo Real (GA4 Realtime)
// ============================================
app.get('/api/realtime', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        if (!propertyId) return res.json({ success: false, message: 'Falta propertyId' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'GA4 não configurado.' });

        const [response] = await analyticsDataClient.runRealtimeReport({
            property: `properties/${propertyId}`,
            metrics: [{ name: 'activeUsers' }],
        });

        const activeUsers = response.rows?.[0]?.metricValues?.[0]?.value || '0';
        res.json({ success: true, activeUsers: parseInt(activeUsers, 10) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Middleware: Verifica se é Admin (via Supabase Bearer Token)
// ============================================
const ADMIN_USER_ID = 'c0a20ec2-cabc-4fd3-9e69-adf77bc19ecc';
const requireAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acesso negado.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        // Valida o token diretamente com o Supabase (usa o mesmo JWT do login do frontend)
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }
        if (user.id !== ADMIN_USER_ID) {
            return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
        }
        req.user = { id: user.id, email: user.email };
        next();
    } catch (err) {
        res.status(401).json({ error: 'Erro ao validar token.' });
    }
};

// ============================================
// ADMIN: Listar todos os clientes
// ============================================
app.get('/api/admin/clientes', requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('clientes_dashboard')
            .select('user_id, nome, email')
            .order('nome');
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ADMIN: Criar novo cliente (Auth + clientes_dashboard)
// ============================================
app.post('/api/admin/clientes', requireAdmin, async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        if (!nome || !email || !senha) {
            return res.status(400).json({ success: false, error: 'Campos obrigatórios: nome, email, senha' });
        }

        // 1. Cria o usuário no Supabase Auth (service_role bypasses email confirmation)
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: senha,
            email_confirm: true, // Já confirma o e-mail automaticamente
            user_metadata: { nome }
        });

        if (authError) {
            return res.status(400).json({ success: false, error: `Erro no Auth: ${authError.message}` });
        }

        const userId = authData.user.id;

        // 2. Cria o registro na tabela clientes_dashboard
        const { error: dbError } = await supabaseAdmin
            .from('clientes_dashboard')
            .insert([{ user_id: userId, nome, email }]);

        if (dbError) {
            // Rollback: remove o usuário criado no Auth se falhou no banco
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return res.status(500).json({ success: false, error: `Erro no banco: ${dbError.message}` });
        }

        res.json({ success: true, user_id: userId, nome, email });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ADMIN: Deletar cliente (Auth + clientes_dashboard)
// ============================================
app.delete('/api/admin/clientes/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;

        // Deleta projetos do cliente
        await supabaseAdmin.from('projetos').delete().eq('cliente_id', userId);

        // Deleta da tabela clientes_dashboard
        await supabaseAdmin.from('clientes_dashboard').delete().eq('user_id', userId);

        // Deleta do Supabase Auth
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ADMIN: Listar projetos de um cliente
// ============================================
app.get('/api/admin/projetos', requireAdmin, async (req, res) => {
    try {
        const { clienteId } = req.query;
        let query = supabaseAdmin
            .from('projetos')
            .select('id, nome, google_property_id, clarity_project_id, clarity_token, cliente_id, ativo')
            .order('nome');
        if (clienteId) query = query.eq('cliente_id', clienteId);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ADMIN: Criar projeto
// ============================================
app.post('/api/admin/projetos', requireAdmin, async (req, res) => {
    try {
        const { nome, google_property_id, clarity_project_id, clarity_token, cliente_id } = req.body;
        if (!nome || !google_property_id || !cliente_id) {
            return res.status(400).json({ success: false, error: 'Campos obrigatórios: nome, google_property_id, cliente_id' });
        }
        const { data, error } = await supabaseAdmin
            .from('projetos')
            .insert([{ nome, google_property_id, clarity_project_id, clarity_token, cliente_id, ativo: true }])
            .select()
            .single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ADMIN: Atualizar projeto
// ============================================
app.put('/api/admin/projetos/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, google_property_id, clarity_project_id, clarity_token, ativo } = req.body;
        const { data, error } = await supabaseAdmin
            .from('projetos')
            .update({ nome, google_property_id, clarity_project_id, clarity_token, ativo })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ADMIN: Deletar projeto
// ============================================
app.delete('/api/admin/projetos/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabaseAdmin.from('projetos').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CLIENTE: Listar seus próprios projetos
// ============================================
app.get('/api/meus-projetos', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('projetos')
            .select('id, nome, google_property_id, clarity_project_id, clarity_token')
            .eq('cliente_id', req.user.id)
            .eq('ativo', true)
            .order('nome');
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
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
            if (!analyticsDataClient) {
                return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });
            }
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
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

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
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

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
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

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
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

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
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

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
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

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
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

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

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        ga4Client: analyticsDataClient ? 'ready' : 'not initialized',
        timestamp: new Date().toISOString()
    });
});

process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason);
});

app.get('/', (req, res) => {
    res.json({ status: 'A API Backend está Funcionando!', port: PORT });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de API iniciado em http://0.0.0.0:${PORT}`);
});

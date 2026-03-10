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
// UMAMI — Serviço de autenticação automática
// ============================================
const UMAMI_URL = (process.env.UMAMI_URL || '').replace(/\/$/, '');
const UMAMI_USERNAME = process.env.UMAMI_USERNAME || 'admin';
const UMAMI_PASSWORD = process.env.UMAMI_PASSWORD || '';

let umamiToken = null;
let umamiTokenExpiry = 0; // timestamp em ms

async function getUmamiToken() {
    if (umamiToken && Date.now() < umamiTokenExpiry) return umamiToken;
    if (!UMAMI_URL || !UMAMI_PASSWORD) {
        console.warn('⚠️  UMAMI_URL ou UMAMI_PASSWORD não configurados.');
        return null;
    }
    try {
        const res = await axios.post(`${UMAMI_URL}/api/auth/login`, {
            username: UMAMI_USERNAME,
            password: UMAMI_PASSWORD,
        }, { timeout: 8000 });
        umamiToken = res.data?.token;
        umamiTokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // renova a cada 23h
        console.log('✅ Umami token obtido com sucesso.');
        return umamiToken;
    } catch (err) {
        console.error('❌ Falha ao autenticar no Umami:', err.response?.data || err.message);
        umamiToken = null;
        return null;
    }
}

async function umamiRequest(path, params = {}) {
    const token = await getUmamiToken();
    if (!token) throw new Error('Umami não está configurado ou autenticado.');
    const res = await axios.get(`${UMAMI_URL}${path}`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
        timeout: 12000,
    });
    return res.data;
}

// Helper: converte dateRange (string) para startAt/endAt em ms UTC-3
function getUmamiDateRange(dateRange, endDate) {
    const now = new Date();
    let start, end;
    end = endDate === 'today' || !endDate ? now : new Date(endDate + 'T23:59:59-03:00');
    if (dateRange === 'today') {
        start = new Date(); start.setHours(0, 0, 0, 0);
    } else if (dateRange === 'yesterday') {
        start = new Date(); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
        end = new Date(); end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999);
    } else {
        // formato: '7daysAgo', '30daysAgo', etc.
        const match = String(dateRange).match(/^(\d+)daysAgo$/);
        const days = match ? parseInt(match[1], 10) : 7;
        start = new Date(); start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0);
    }
    return { startAt: start.getTime(), endAt: end.getTime() };
}

if (UMAMI_URL && UMAMI_PASSWORD) {
    getUmamiToken().catch(() => { });
    console.log(`Umami configurado em: ${UMAMI_URL}`);
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
            .select('id, nome, google_property_id, clarity_project_id, clarity_token, umami_website_id, cliente_id, ativo')
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
        const { nome, google_property_id, clarity_project_id, clarity_token, umami_website_id, cliente_id } = req.body;
        if (!nome || !google_property_id || !cliente_id) {
            return res.status(400).json({ success: false, error: 'Campos obrigatórios: nome, google_property_id, cliente_id' });
        }
        const { data, error } = await supabaseAdmin
            .from('projetos')
            .insert([{ nome, google_property_id, clarity_project_id, clarity_token, umami_website_id, cliente_id, ativo: true }])
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
        const { nome, google_property_id, clarity_project_id, clarity_token, umami_website_id, ativo } = req.body;
        const { data, error } = await supabaseAdmin
            .from('projetos')
            .update({ nome, google_property_id, clarity_project_id, clarity_token, umami_website_id, ativo })
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
            .select('id, nome, google_property_id, clarity_project_id, clarity_token, umami_website_id')
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
// Cache em memória (5 minutos por chave)
// ============================================
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
    return entry.data;
}
function setCache(key, data) {
    cache.set(key, { data, ts: Date.now() });
}

// Helper: cria dimensionFilter do GA4
function makePageFilter(pagePath) {
    if (!pagePath) return undefined;
    return { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: pagePath } } };
}

// ============================================
// Endpoint: DASHBOARD COMPLETO (todas as queries em paralelo no servidor)
// ============================================
app.get('/api/dashboard', async (req, res) => {
    try {
        const { propertyId, dateRange = '7daysAgo', clarityToken, clarityProjectId, pagePath } = req.query;
        if (!propertyId) return res.status(400).json({ success: false, error: 'Falta propertyId' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'GA4 não configurado.' });

        const cacheKey = `dashboard:${propertyId}:${dateRange}:${pagePath || 'all'}`;
        const cached = getCache(cacheKey);
        if (cached) return res.json({ success: true, cached: true, ...cached });

        const prop = `properties/${propertyId}`;
        const dateRanges = [{ startDate: dateRange, endDate: 'today' }];
        const dimFilter = makePageFilter(pagePath);
        const filterOpts = dimFilter ? { dimensionFilter: dimFilter } : {};

        // Dispara TODAS as queries GA4 em paralelo no servidor
        const [
            resMetrics, resTraffic, resSources, resEvents,
            resDevices, resBrowsers, resCountries, resTopPages
        ] = await Promise.allSettled([
            // 1. Métricas principais
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                metrics: [{ name: 'sessions' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }, { name: 'activeUsers' }, { name: 'newUsers' }, { name: 'screenPageViewsPerSession' }],
                ...filterOpts,
            }),
            // 2. Tráfego diário
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }],
                ...filterOpts,
            }),
            // 3. Canais de origem
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8,
                ...filterOpts,
            }),
            // 4. Eventos
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
                orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 8,
                ...filterOpts,
            }),
            // 5. Dispositivos
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'sessions' }],
                ...filterOpts,
            }),
            // 6. Navegadores
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'browser' }], metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 6,
                ...filterOpts,
            }),
            // 7. Países
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'country' }], metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8,
                ...filterOpts,
            }),
            // 8. Top páginas (sempre sem filtro de página para visão global)
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'pagePath' }],
                metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
                orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10,
            }),
        ]);

        // Processa métricas
        let metrics = { totalVisitsGA: '0', bounceRateGA: '0%', avgTimeGA: '00:00', activeUsersGA: '0', newUsersGA: '0', pagesPerSessionGA: '0' };
        if (resMetrics.status === 'fulfilled') {
            const row = resMetrics.value[0]?.rows?.[0]?.metricValues;
            if (row) {
                const avgSec = Math.round(Number(row[2].value));
                metrics = {
                    totalVisitsGA: row[0].value,
                    bounceRateGA: (Number(row[1].value) * 100).toFixed(1) + '%',
                    avgTimeGA: `${String(Math.floor(avgSec / 60)).padStart(2, '0')}:${String(avgSec % 60).padStart(2, '0')}`,
                    activeUsersGA: row[3].value,
                    newUsersGA: row[4].value,
                    pagesPerSessionGA: Number(row[5].value).toFixed(1),
                    activeUsersClarity: '—',
                };
            }
        }

        // Processa tráfego diário
        let trafficData = [];
        if (resTraffic.status === 'fulfilled') {
            trafficData = (resTraffic.value[0]?.rows || [])
                .map(r => ({ date: r.dimensionValues[0].value, analytics: parseInt(r.metricValues[0].value, 10), clarity: 0 }))
                .sort((a, b) => a.date.localeCompare(b.date));
        }

        // Processa canais
        let sourcesData = [];
        if (resSources.status === 'fulfilled') {
            sourcesData = (resSources.value[0]?.rows || []).map(r => ({ source: r.dimensionValues[0].value, sessions: parseInt(r.metricValues[0].value, 10) }));
        }

        // Processa eventos
        let eventsData = [];
        if (resEvents.status === 'fulfilled') {
            eventsData = (resEvents.value[0]?.rows || []).map(r => ({ event: r.dimensionValues[0].value, count: parseInt(r.metricValues[0].value, 10) }));
        }

        // Processa dispositivos
        let devicesData = [];
        if (resDevices.status === 'fulfilled') {
            devicesData = (resDevices.value[0]?.rows || []).map(r => ({ device: r.dimensionValues[0].value, sessions: parseInt(r.metricValues[0].value, 10) }));
        }

        // Processa navegadores
        let browsersData = [];
        if (resBrowsers.status === 'fulfilled') {
            browsersData = (resBrowsers.value[0]?.rows || []).map(r => ({ browser: r.dimensionValues[0].value, sessions: parseInt(r.metricValues[0].value, 10) }));
        }

        // Processa países
        let countriesData = [];
        if (resCountries.status === 'fulfilled') {
            countriesData = (resCountries.value[0]?.rows || []).map(r => ({ country: r.dimensionValues[0].value, sessions: parseInt(r.metricValues[0].value, 10) }));
        }

        // Processa top páginas
        let topPagesData = [];
        if (resTopPages.status === 'fulfilled') {
            topPagesData = (resTopPages.value[0]?.rows || []).map(r => {
                const avgSec = Math.round(Number(r.metricValues[1].value));
                return { page: r.dimensionValues[0].value, views: parseInt(r.metricValues[0].value, 10), avgTime: `${String(Math.floor(avgSec / 60)).padStart(2, '0')}:${String(avgSec % 60).padStart(2, '0')}` };
            });
        }

        // Clarify (opcional — não bloqueia o restante)
        let activeUsersClarity = '—';
        if (clarityToken) {
            try {
                const clarityRes = await axios.get('https://www.clarity.ms/export-data/api/v1/project-live-insights', {
                    params: { numOfDays: 3 }, headers: { Authorization: `Bearer ${clarityToken}` }, timeout: 4000
                });
                const cData = clarityRes.data;
                if (cData?.trafficCount !== undefined) activeUsersClarity = String(cData.trafficCount);
                else if (Array.isArray(cData)) activeUsersClarity = String(cData.reduce((s, r) => s + (r.trafficCount || 0), 0));
                metrics.activeUsersClarity = activeUsersClarity;
            } catch { /* Clarity opcional */ }
        }

        const result = { metrics, trafficData, sourcesData, eventsData, devicesData, browsersData, countriesData, topPagesData };
        setCache(cacheKey, result);

        res.json({ success: true, cached: false, ...result });
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
        const endDate = req.query.endDate || 'today';
        let gaData = { totalVisits: 0, bounceRate: 0, avgSessionDuration: '00:00', activeUsers: 0, newUsers: 0, pagesPerSession: '0' };
        let clarityData = { activeUsers: 0, avgTime: '00:00' };

        // ---- Google Analytics ----
        if (propertyId) {
            if (!analyticsDataClient) {
                return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });
            }
            // Cria filtro de página se fornecido
            const pagePath = req.query.pagePath;
            const dimensionFilter = pagePath ? {
                filter: {
                    fieldName: 'pagePath',
                    stringFilter: { matchType: 'EXACT', value: pagePath }
                }
            } : undefined;

            const [response] = await analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate, endDate }],
                metrics: [
                    { name: 'sessions' },
                    { name: 'bounceRate' },
                    { name: 'averageSessionDuration' },
                    { name: 'activeUsers' },
                    { name: 'newUsers' },
                    { name: 'screenPageViewsPerSession' }
                ],
                ...(dimensionFilter && { dimensionFilter }),
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
        const endDate = req.query.endDate || 'today';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

        // ---- Google Analytics ----
        const pagePath = req.query.pagePath;
        const dimensionFilter = pagePath ? {
            filter: {
                fieldName: 'pagePath',
                stringFilter: { matchType: 'EXACT', value: pagePath }
            }
        } : undefined;

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'sessions' }],
            ...(dimensionFilter && { dimensionFilter }),
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
// Endpoint: Listar Page Paths disponíveis (GA4)
// ============================================
app.get('/api/pages', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const startDate = req.query.dateRange || '30daysAgo';
        const endDate = req.query.endDate || 'today';
        if (!propertyId) return res.json({ success: false, message: 'Falta propertyId' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'GA4 não configurado.' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 100,
        });

        const pages = (response.rows || []).map(row => ({
            path: row.dimensionValues[0].value,
            views: parseInt(row.metricValues[0].value, 10)
        }));

        res.json({ success: true, data: pages });
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
        const endDate = req.query.endDate || 'today';

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
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
        const endDate = req.query.endDate || 'today';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
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
        const endDate = req.query.endDate || 'today';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
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
        const endDate = req.query.endDate || 'today';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
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
        const endDate = req.query.endDate || 'today';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
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
        const endDate = req.query.endDate || 'today';
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'Google Analytics não configurado. Defina GOOGLE_APPLICATION_CREDENTIALS_JSON.' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
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

// ============================================
// Endpoint: Dados de Conversão (Taxa, UTM, Horário, Mobile vs Desktop)
// ============================================
app.get('/api/conversion-data', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const startDate = req.query.dateRange || '7daysAgo';
        const endDate = req.query.endDate || 'today';
        const leadEventName = req.query.leadEvent || 'lead'; // nome do evento de lead
        if (!propertyId) return res.json({ success: false, message: 'Falta propertyId' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'GA4 não configurado.' });

        const prop = `properties/${propertyId}`;
        const dateRanges = [{ startDate, endDate }];

        const [resSessions, resLeads, resUtm, resHourly, resDeviceConv] = await Promise.allSettled([
            // Total de sessões
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                metrics: [{ name: 'sessions' }],
            }),
            // Total de leads (evento específico)
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'eventName' }],
                metrics: [{ name: 'eventCount' }],
                dimensionFilter: {
                    filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: leadEventName } }
                },
            }),
            // Conversão por UTM (source + campaign)
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'sessionSource' }, { name: 'sessionCampaignName' }],
                metrics: [{ name: 'sessions' }, { name: 'eventCount' }],
                metricFilter: { filter: { fieldName: 'eventCount', numericFilter: { operation: 'GREATER_THAN', value: { int64Value: '0' } } } },
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 20,
            }),
            // Horário de pico de conversão (hora do dia)
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'hour' }],
                metrics: [{ name: 'sessions' }, { name: 'eventCount' }],
                orderBys: [{ dimension: { dimensionName: 'hour' } }],
                dimensionFilter: undefined,
                limit: 24,
            }),
            // Conversão Mobile vs Desktop
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'deviceCategory' }],
                metrics: [{ name: 'sessions' }, { name: 'eventCount' }],
            }),
        ]);

        // Total sessões
        let totalSessions = 0;
        if (resSessions.status === 'fulfilled') {
            totalSessions = parseInt(resSessions.value[0]?.rows?.[0]?.metricValues?.[0]?.value || '0', 10);
        }

        // Total leads
        let totalLeads = 0;
        if (resLeads.status === 'fulfilled') {
            totalLeads = parseInt(resLeads.value[0]?.rows?.[0]?.metricValues?.[0]?.value || '0', 10);
        }
        const conversionRate = totalSessions > 0 ? ((totalLeads / totalSessions) * 100).toFixed(2) : '0.00';

        // UTM breakdown — usa os eventos (eventCount) como leads
        let utmData = [];
        if (resUtm.status === 'fulfilled') {
            utmData = (resUtm.value[0]?.rows || []).map(r => {
                const sessions = parseInt(r.metricValues[0].value, 10);
                const leads = parseInt(r.metricValues[1].value, 10);
                let source = r.dimensionValues[0].value;
                let campaign = r.dimensionValues[1].value;
                if (source === '(direct)') source = 'Direto';
                else if (source === '(not set)') source = 'Não definido';
                if (campaign === '(not set)' || campaign === '(none)') campaign = '—';
                return {
                    source,
                    campaign,
                    sessions,
                    leads,
                    rate: sessions > 0 ? ((leads / sessions) * 100).toFixed(1) + '%' : '0%'
                };
            });
        }

        // Horário de pico
        let hourlyData = [];
        if (resHourly.status === 'fulfilled') {
            hourlyData = (resHourly.value[0]?.rows || []).map(r => {
                const hour = parseInt(r.dimensionValues[0].value, 10);
                const sessions = parseInt(r.metricValues[0].value, 10);
                const leads = parseInt(r.metricValues[1].value, 10);
                return {
                    hour: `${String(hour).padStart(2, '0')}h`,
                    sessions,
                    leads,
                    rate: sessions > 0 ? ((leads / sessions) * 100).toFixed(1) : '0'
                };
            });
        }

        // Mobile vs Desktop conversion
        let deviceConv = [];
        if (resDeviceConv.status === 'fulfilled') {
            deviceConv = (resDeviceConv.value[0]?.rows || []).map(r => {
                const device = r.dimensionValues[0].value;
                const sessions = parseInt(r.metricValues[0].value, 10);
                const leads = parseInt(r.metricValues[1].value, 10);
                return {
                    device: device.charAt(0).toUpperCase() + device.slice(1),
                    sessions,
                    leads,
                    rate: sessions > 0 ? ((leads / sessions) * 100).toFixed(2) : '0.00'
                };
            });
        }

        res.json({
            success: true,
            data: {
                totalSessions,
                totalLeads,
                conversionRate: conversionRate + '%',
                utmData,
                hourlyData,
                deviceConv,
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Rage Clicks do Clarity
// ============================================
app.get('/api/clarity-rage-clicks', async (req, res) => {
    try {
        const { clarityToken, clarityProjectId } = req.query;
        if (!clarityToken) return res.json({ success: false, message: 'Falta clarityToken' });

        // Tenta a API de insights do Clarity para pegar rage clicks
        const numDays = req.query.numDays || 7;
        let rageClicks = null;
        let deadClicks = null;
        let excessiveScrolling = null;

        try {
            const resp = await axios.get('https://www.clarity.ms/export-data/api/v1/project-live-insights', {
                params: { numOfDays: numDays },
                headers: { Authorization: `Bearer ${clarityToken}` },
                timeout: 5000,
            });
            const d = resp.data;
            // Clarity retorna objeto ou array dependendo da versão
            if (Array.isArray(d) && d.length > 0) {
                const first = d[0];
                rageClicks = first.rageClickCount ?? first.rageClicks ?? null;
                deadClicks = first.deadClickCount ?? first.deadClicks ?? null;
                excessiveScrolling = first.excessiveScrollCount ?? null;
            } else if (d && typeof d === 'object') {
                rageClicks = d.rageClickCount ?? d.rageClicks ?? null;
                deadClicks = d.deadClickCount ?? d.deadClicks ?? null;
                excessiveScrolling = d.excessiveScrollCount ?? null;
            }
        } catch (clarityErr) {
            console.warn('Clarity rage clicks API error:', clarityErr.response?.data || clarityErr.message);
        }

        res.json({
            success: true,
            data: {
                rageClicks: rageClicks !== null ? rageClicks : '—',
                deadClicks: deadClicks !== null ? deadClicks : '—',
                excessiveScrolling: excessiveScrolling !== null ? excessiveScrolling : '—',
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: PageSpeed Score (Google PageSpeed Insights)
// ============================================
app.get('/api/pagespeed', async (req, res) => {
    try {
        const { url: pageUrl } = req.query;
        if (!pageUrl) return res.json({ success: false, message: 'Falta url' });

        const PAGESPEED_KEY = process.env.PAGESPEED_API_KEY || '';
        const strategies = ['mobile', 'desktop'];
        const results = {};

        await Promise.all(strategies.map(async (strategy) => {
            try {
                const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(pageUrl)}&strategy=${strategy}${PAGESPEED_KEY ? `&key=${PAGESPEED_KEY}` : ''}`;
                const resp = await axios.get(apiUrl, { timeout: 20000 });
                const score = Math.round((resp.data?.lighthouseResult?.categories?.performance?.score || 0) * 100);
                const fcp = resp.data?.lighthouseResult?.audits?.['first-contentful-paint']?.displayValue || '—';
                const lcp = resp.data?.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue || '—';
                const cls = resp.data?.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue || '—';
                const tbt = resp.data?.lighthouseResult?.audits?.['total-blocking-time']?.displayValue || '—';
                results[strategy] = { score, fcp, lcp, cls, tbt };
            } catch (e) {
                console.warn(`PageSpeed ${strategy} error:`, e.message);
                results[strategy] = { score: null, fcp: '—', lcp: '—', cls: '—', tbt: '—' };
            }
        }));

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Sessões vs Leads por dia (gráfico de linha temporal)
// ============================================
app.get('/api/traffic-leads', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const startDate = req.query.dateRange || '7daysAgo';
        const endDate = req.query.endDate || 'today';
        const leadEventName = req.query.leadEvent || 'lead';
        if (!propertyId) return res.json({ success: false, message: 'Falta propertyId' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'GA4 não configurado.' });

        const prop = `properties/${propertyId}`;
        const dateRanges = [{ startDate, endDate }];

        // Sessões por dia
        const [resSessions, resLeads] = await Promise.allSettled([
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'sessions' }],
                orderBys: [{ dimension: { dimensionName: 'date' } }],
            }),
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'eventCount' }],
                dimensionFilter: {
                    filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: leadEventName } }
                },
                orderBys: [{ dimension: { dimensionName: 'date' } }],
            }),
        ]);

        // Merge por data
        const sessionsMap = {};
        if (resSessions.status === 'fulfilled') {
            (resSessions.value[0]?.rows || []).forEach(r => {
                sessionsMap[r.dimensionValues[0].value] = parseInt(r.metricValues[0].value, 10);
            });
        }
        const leadsMap = {};
        if (resLeads.status === 'fulfilled') {
            (resLeads.value[0]?.rows || []).forEach(r => {
                leadsMap[r.dimensionValues[0].value] = parseInt(r.metricValues[0].value, 10);
            });
        }

        const allDates = [...new Set([...Object.keys(sessionsMap), ...Object.keys(leadsMap)])].sort();
        const data = allDates.map(date => ({
            date,
            sessions: sessionsMap[date] || 0,
            leads: leadsMap[date] || 0,
        }));

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Funil de Scroll (GA4 Events)
// ============================================
app.get('/api/scroll-funnel', async (req, res) => {
    try {
        const propertyId = req.query.propertyId;
        const startDate = req.query.dateRange || '7daysAgo';
        const endDate = req.query.endDate || 'today';
        if (!propertyId) return res.json({ success: false, message: 'Falta propertyId' });
        if (!analyticsDataClient) return res.status(503).json({ success: false, error: 'GA4 não configurado.' });

        const prop = `properties/${propertyId}`;
        const dateRanges = [{ startDate, endDate }];

        // Pega eventos de scroll e os principais eventos que formam o funil
        const [resEvents, resSessions] = await Promise.allSettled([
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                dimensions: [{ name: 'eventName' }],
                metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
                orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
                limit: 30,
            }),
            analyticsDataClient.runReport({
                property: prop, dateRanges,
                metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
            }),
        ]);

        let totalSessions = 0;
        let totalUsers = 0;
        if (resSessions.status === 'fulfilled') {
            const row = resSessions.value[0]?.rows?.[0]?.metricValues;
            if (row) {
                totalSessions = parseInt(row[0].value, 10);
                totalUsers = parseInt(row[1].value, 10);
            }
        }

        let eventMap = {};
        if (resEvents.status === 'fulfilled') {
            (resEvents.value[0]?.rows || []).forEach(r => {
                eventMap[r.dimensionValues[0].value] = {
                    count: parseInt(r.metricValues[0].value, 10),
                    users: parseInt(r.metricValues[1].value, 10),
                };
            });
        }

        // Scroll depth events do GA4 (scroll evento com parâmetro percent_scrolled)
        const scroll50 = eventMap['scroll']?.users || eventMap['scroll_50']?.users || eventMap['50_percent_scroll']?.users || null;
        const scroll75 = eventMap['scroll_75']?.users || eventMap['75_percent_scroll']?.users || null;
        const leadEvent = eventMap['lead']?.users || eventMap['gerar_lead']?.users || eventMap['contact']?.users || null;
        const clickCTA = eventMap['click']?.users || eventMap['cta_click']?.users || eventMap['button_click']?.users || null;

        // Constrói funil
        const funnel = [
            { name: 'Sessões', value: totalSessions, color: '#6366f1' },
            { name: 'Scroll 50%', value: scroll50 !== null ? scroll50 : Math.round(totalSessions * 0.6), color: '#3b82f6', estimated: scroll50 === null },
            { name: 'Scroll até CTA', value: scroll75 !== null ? scroll75 : Math.round(totalSessions * 0.35), color: '#10b981', estimated: scroll75 === null },
            { name: 'Clique no botão', value: clickCTA !== null ? clickCTA : Math.round(totalSessions * 0.2), color: '#f59e0b', estimated: clickCTA === null },
            { name: 'Lead', value: leadEvent !== null ? leadEvent : (eventMap['lead']?.count || 0), color: '#ef4444', estimated: leadEvent === null },
        ];

        res.json({ success: true, data: { funnel, eventMap, totalSessions, totalUsers } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// UMAMI — Proxy de endpoints (todas as chamadas via servidor)
// ============================================================

// Verifica se Umami está configurado
app.get('/api/umami/config', (req, res) => {
    res.json({ configured: !!(UMAMI_URL && UMAMI_PASSWORD), url: UMAMI_URL || null });
});

// Lista websites cadastrados no Umami
app.get('/api/umami/websites', async (req, res) => {
    try {
        const data = await umamiRequest('/api/websites', { pageSize: 50 });
        res.json({ success: true, data: data?.data || data || [] });
    } catch (err) {
        res.json({ success: false, error: err.message, data: [] });
    }
});

// KPIs gerais (stats) + período anterior para variação %
app.get('/api/umami/stats', async (req, res) => {
    try {
        const { websiteId, dateRange = '7daysAgo', endDate } = req.query;
        if (!websiteId) return res.json({ success: false, error: 'Falta websiteId' });
        const { startAt, endAt } = getUmamiDateRange(dateRange, endDate);
        // Período anterior (mesma duração)
        const duration = endAt - startAt;
        const prevStart = startAt - duration;
        const prevEnd = startAt - 1;
        const cacheKey = `umami:stats:${websiteId}:${startAt}:${endAt}`;
        const cached = getCache(cacheKey);
        if (cached) return res.json({ success: true, cached: true, data: cached });
        const [current, prev] = await Promise.all([
            umamiRequest(`/api/websites/${websiteId}/stats`, { startAt, endAt }),
            umamiRequest(`/api/websites/${websiteId}/stats`, { startAt: prevStart, endAt: prevEnd }),
        ]);
        // Calcular variações %
        const calcChange = (cur, prv) => prv > 0 ? (((cur - prv) / prv) * 100).toFixed(1) : '0';
        const avgTime = current.visits > 0
            ? Math.round((current.totaltime || 0) / current.visits)
            : 0;
        const avgTimePrev = prev.visits > 0
            ? Math.round((prev.totaltime || 0) / prev.visits)
            : 0;
        const bounceRate = current.visits > 0
            ? ((current.bounces || 0) / current.visits * 100).toFixed(1) + '%'
            : '0%';
        const result = {
            visitors: current.visitors || 0,
            visitorsChange: calcChange(current.visitors || 0, prev.visitors || 0),
            visits: current.visits || 0,
            visitsChange: calcChange(current.visits || 0, prev.visits || 0),
            pageviews: current.pageviews || 0,
            pageviewsChange: calcChange(current.pageviews || 0, prev.pageviews || 0),
            bounceRate,
            avgTime: `${String(Math.floor(avgTime / 60)).padStart(2, '0')}:${String(avgTime % 60).padStart(2, '0')}`,
            avgTimeChange: calcChange(avgTime, avgTimePrev),
            bounces: current.bounces || 0,
            totaltime: current.totaltime || 0,
        };
        setCache(cacheKey, result);
        res.json({ success: true, data: result });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Realtime — últimos 30min
app.get('/api/umami/realtime', async (req, res) => {
    try {
        const { websiteId } = req.query;
        if (!websiteId) return res.json({ success: false, error: 'Falta websiteId' });
        const data = await umamiRequest(`/api/realtime/${websiteId}`);
        // Contar usuários únicos nos últimos 5 min
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const activeNow = data?.events
            ? [...new Set(data.events
                .filter(e => new Date(e.createdAt).getTime() > fiveMinAgo)
                .map(e => e.sessionId))].length
            : 0;
        res.json({ success: true, activeNow, series: data?.series || {}, countries: data?.countries || {}, urls: data?.urls || {} });
    } catch (err) {
        res.json({ success: false, error: err.message, activeNow: 0 });
    }
});

// Pageviews temporais (sessions + pageviews por dia/hora)
app.get('/api/umami/pageviews', async (req, res) => {
    try {
        const { websiteId, dateRange = '7daysAgo', endDate, unit = 'day' } = req.query;
        if (!websiteId) return res.json({ success: false, error: 'Falta websiteId' });
        const { startAt, endAt } = getUmamiDateRange(dateRange, endDate);
        const cacheKey = `umami:pv:${websiteId}:${startAt}:${endAt}:${unit}`;
        const cached = getCache(cacheKey);
        if (cached) return res.json({ success: true, cached: true, data: cached });
        const data = await umamiRequest(`/api/websites/${websiteId}/pageviews`, { startAt, endAt, unit, timezone: 'America/Sao_Paulo' });
        setCache(cacheKey, data);
        res.json({ success: true, data });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Eventos (leads e outros) — temporal ou total
app.get('/api/umami/events', async (req, res) => {
    try {
        const { websiteId, dateRange = '7daysAgo', endDate, unit, eventName } = req.query;
        if (!websiteId) return res.json({ success: false, error: 'Falta websiteId' });
        const { startAt, endAt } = getUmamiDateRange(dateRange, endDate);
        const cacheKey = `umami:ev:${websiteId}:${startAt}:${endAt}:${unit || 'total'}:${eventName || 'all'}`;
        const cached = getCache(cacheKey);
        if (cached) return res.json({ success: true, cached: true, data: cached });
        const params = { startAt, endAt };
        if (unit) params.unit = unit;
        if (unit) params.timezone = 'America/Sao_Paulo';
        const data = await umamiRequest(`/api/websites/${websiteId}/events`, params);
        // Filtrar por nome de evento se solicitado
        let result = data?.data || data || [];
        if (eventName && Array.isArray(result)) {
            result = result.filter(e => e.eventName && e.eventName.toLowerCase().includes(eventName.toLowerCase()));
        }
        // Total de leads (filtra por 'lead')
        let leadTotal = 0;
        if (Array.isArray(result)) {
            const leadEvents = result.filter(e => e.eventName && e.eventName.toLowerCase().includes('lead'));
            leadTotal = leadEvents.length;
        }
        setCache(cacheKey, { events: result, leadTotal });
        res.json({ success: true, data: { events: result, leadTotal } });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Métricas por tipo (referrer, device, url, country, browser, query, etc.)
app.get('/api/umami/metrics', async (req, res) => {
    try {
        const { websiteId, dateRange = '7daysAgo', endDate, type = 'url', limit = 20 } = req.query;
        if (!websiteId) return res.json({ success: false, error: 'Falta websiteId' });
        const { startAt, endAt } = getUmamiDateRange(dateRange, endDate);
        const cacheKey = `umami:metrics:${websiteId}:${startAt}:${endAt}:${type}:${limit}`;
        const cached = getCache(cacheKey);
        if (cached) return res.json({ success: true, cached: true, data: cached });
        const data = await umamiRequest(`/api/websites/${websiteId}/metrics`, { startAt, endAt, type, limit: parseInt(limit) });
        const result = Array.isArray(data) ? data : [];
        setCache(cacheKey, result);
        res.json({ success: true, data: result });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Sessões (lista + stats)
app.get('/api/umami/sessions', async (req, res) => {
    try {
        const { websiteId, dateRange = '7daysAgo', endDate, page = 1, pageSize = 20 } = req.query;
        if (!websiteId) return res.json({ success: false, error: 'Falta websiteId' });
        const { startAt, endAt } = getUmamiDateRange(dateRange, endDate);
        const [sessionsData, statsData] = await Promise.all([
            umamiRequest(`/api/websites/${websiteId}/sessions`, { startAt, endAt, page, pageSize }),
            umamiRequest(`/api/websites/${websiteId}/sessions/stats`, { startAt, endAt }),
        ]);
        res.json({ success: true, sessions: sessionsData, stats: statsData });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Sessões semanais (heatmap)
app.get('/api/umami/weekly', async (req, res) => {
    try {
        const { websiteId } = req.query;
        if (!websiteId) return res.json({ success: false, error: 'Falta websiteId' });
        const cacheKey = `umami:weekly:${websiteId}`;
        const cached = getCache(cacheKey);
        if (cached) return res.json({ success: true, cached: true, data: cached });
        const data = await umamiRequest(`/api/websites/${websiteId}/sessions/weekly`);
        setCache(cacheKey, data);
        res.json({ success: true, data });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Event data (propriedades customizadas dos eventos de lead)
app.get('/api/umami/event-data', async (req, res) => {
    try {
        const { websiteId, dateRange = '7daysAgo', endDate, subType = 'properties' } = req.query;
        if (!websiteId) return res.json({ success: false, error: 'Falta websiteId' });
        const { startAt, endAt } = getUmamiDateRange(dateRange, endDate);
        const validTypes = ['events', 'fields', 'properties', 'values', 'stats'];
        const t = validTypes.includes(subType) ? subType : 'properties';
        const data = await umamiRequest(`/api/websites/${websiteId}/event-data/${t}`, { startAt, endAt });
        res.json({ success: true, data });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Dados consolidados para o dashboard Umami (uma requisição, múltiplos dados)
app.get('/api/umami/dashboard', async (req, res) => {
    try {
        const { websiteId, dateRange = '7daysAgo', endDate } = req.query;
        if (!websiteId) return res.json({ success: false, error: 'Falta websiteId' });
        const { startAt, endAt } = getUmamiDateRange(dateRange, endDate);
        const duration = endAt - startAt;
        const prevStart = startAt - duration;
        const prevEnd = startAt - 1;

        const [stats, prevStats, pageviews, events, referrers, devices, urls, countries] = await Promise.allSettled([
            umamiRequest(`/api/websites/${websiteId}/stats`, { startAt, endAt }),
            umamiRequest(`/api/websites/${websiteId}/stats`, { startAt: prevStart, endAt: prevEnd }),
            umamiRequest(`/api/websites/${websiteId}/pageviews`, { startAt, endAt, unit: 'day', timezone: 'America/Sao_Paulo' }),
            umamiRequest(`/api/websites/${websiteId}/events`, { startAt, endAt }),
            umamiRequest(`/api/websites/${websiteId}/metrics`, { startAt, endAt, type: 'referrer', limit: 10 }),
            umamiRequest(`/api/websites/${websiteId}/metrics`, { startAt, endAt, type: 'device', limit: 10 }),
            umamiRequest(`/api/websites/${websiteId}/metrics`, { startAt, endAt, type: 'url', limit: 20 }),
            umamiRequest(`/api/websites/${websiteId}/metrics`, { startAt, endAt, type: 'country', limit: 15 }),
        ]);

        const cur = stats.status === 'fulfilled' ? stats.value : {};
        const prv = prevStats.status === 'fulfilled' ? prevStats.value : {};
        const calcChange = (a, b) => b > 0 ? (((a - b) / b) * 100).toFixed(1) : '0';

        const avgTime = cur.visits > 0 ? Math.round((cur.totaltime || 0) / cur.visits) : 0;
        const avgTimePrev = prv.visits > 0 ? Math.round((prv.totaltime || 0) / prv.visits) : 0;
        const bounceRate = cur.visits > 0 ? ((cur.bounces || 0) / cur.visits * 100).toFixed(1) + '%' : '0%';

        // Contar leads nos eventos
        let allEvents = [];
        if (events.status === 'fulfilled') {
            const evData = events.value;
            allEvents = evData?.data || evData || (Array.isArray(evData) ? evData : []);
        }
        const leadEvents = allEvents.filter(e => e.eventName && e.eventName.toLowerCase().includes('lead'));
        const totalLeads = leadEvents.length;
        const leadsChange = '0'; // prev leva tempo, simplificamos aqui
        const visitors = cur.visitors || 0;
        const convRate = visitors > 0 ? ((totalLeads / visitors) * 100).toFixed(2) + '%' : '0%';

        // Pageviews timeseries
        const pvData = pageviews.status === 'fulfilled' ? pageviews.value : {};

        // Referrers
        const referrersData = referrers.status === 'fulfilled' ? (Array.isArray(referrers.value) ? referrers.value : []) : [];

        // Devices
        const devicesData = devices.status === 'fulfilled' ? (Array.isArray(devices.value) ? devices.value : []) : [];

        // URLs/Páginas
        const urlsData = urls.status === 'fulfilled' ? (Array.isArray(urls.value) ? urls.value : []) : [];

        // Países
        const countriesData = countries.status === 'fulfilled' ? (Array.isArray(countries.value) ? countries.value : []) : [];

        res.json({
            success: true,
            kpis: {
                visitors, visitorsChange: calcChange(visitors, prv.visitors || 0),
                visits: cur.visits || 0, visitsChange: calcChange(cur.visits || 0, prv.visits || 0),
                pageviews: cur.pageviews || 0, pageviewsChange: calcChange(cur.pageviews || 0, prv.pageviews || 0),
                totalLeads, leadsChange,
                convRate,
                bounceRate,
                avgTime: `${String(Math.floor(avgTime / 60)).padStart(2, '0')}:${String(avgTime % 60).padStart(2, '0')}`,
                avgTimeChange: calcChange(avgTime, avgTimePrev),
            },
            pageviewsTimeseries: pvData,
            referrers: referrersData,
            devices: devicesData,
            topUrls: urlsData,
            countries: countriesData,
            leadEvents: leadEvents.slice(0, 100),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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

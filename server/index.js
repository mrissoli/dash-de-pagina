// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Configurações do Google Analytics 4
// A biblioteca do Google usa automaticamente a variável de ambiente GOOGLE_APPLICATION_CREDENTIALS
const analyticsDataClient = new BetaAnalyticsDataClient();
const propertyId = process.env.GA4_PROPERTY_ID;

// Configurações do MS Clarity
const clarityToken = process.env.CLARITY_API_TOKEN;
const clarityProjectId = process.env.CLARITY_PROJECT_ID;

// ============================================
// Endpoint: Resumo de Métricas Principais (GA4 + Clarity)
// ============================================
app.get('/api/metrics', async (req, res) => {
    try {
        let gaData = { totalVisits: 0, bounceRate: 0 };

        // ====== BLOCO GOOGLE ANALYTICS ======
        if (propertyId) {
            const [response] = await analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [
                    {
                        startDate: '7daysAgo',
                        endDate: 'today',
                    },
                ],
                metrics: [
                    { name: 'sessions' }, // Visitas
                    { name: 'bounceRate' } // Taxa de rejeição
                ],
            });
            if (response && response.rows && response.rows.length > 0) {
                const gaMetrics = response.rows[0].metricValues;
                gaData.totalVisits = gaMetrics[0].value;
                gaData.bounceRate = (Number(gaMetrics[1].value) * 100).toFixed(2) + '%';
            }
        }

        // ====== BLOCO MICROSOFT CLARITY ======
        // O Clarity não possui uma API REST simples para "dashboard" da mesma forma que o GA4.
        // Ele requer consultas ao banco interno deles ou a exportação / integração de webhook.
        // Abaixo está uma estrutura mock temporária que será abastecida ou por webhooks 
        // ou por exportações semanais usando scripts Py/Node, que eles oferecem via "Clarity API endpoints".

        // (Exemplo de GET futuro caso habilitado: await axios.get(`https://clarity.microsoft.com/api/projects/${clarityProjectId}`, ...))

        res.json({
            success: true,
            data: {
                totalVisitsGA: gaData.totalVisits || "N/A",
                bounceRateGA: gaData.bounceRate || "N/A",
                // Valores Mock do Clarity 
                activeUsersClarity: 142, // Você preencherá no front ou usando Webhooks/Exportação
                avgTimeClarity: '02:34'
            }
        });

    } catch (error) {
        console.error('Erro ao buscar métricas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Gráficos de Tráfego Diário (GA4)
// ============================================
app.get('/api/traffic', async (req, res) => {
    try {
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        // Busca tráfego no GA4 por dia
        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [
                { startDate: '7daysAgo', endDate: 'today' },
            ],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'sessions' }],
        });

        const formattedData = response.rows.map(row => ({
            date: row.dimensionValues[0].value,
            analytics: parseInt(row.metricValues[0].value, 10),
            clarity: Math.floor(Math.random() * 5000), // MOCK DA INTERAÇÃO
        }));

        // Ordenar por data
        formattedData.sort((a, b) => a.date.localeCompare(b.date));

        res.json({ success: true, data: formattedData });
    } catch (error) {
        console.error('Erro ao buscar tráfego:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Endpoint: Páginas Mais Acessadas (GA4)
// ============================================
app.get('/api/top-pages', async (req, res) => {
    try {
        if (!propertyId) return res.json({ success: false, message: 'Falta GA4_PROPERTY_ID' });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [
                { name: 'screenPageViews' },
                { name: 'averageSessionDuration' }
            ],
            limit: 5,
        });

        const pages = response.rows.map(row => ({
            path: row.dimensionValues[0].value,
            views: row.metricValues[0].value,
            time: (Number(row.metricValues[1].value)).toFixed(0) + 's',
            heat: 'Alta', // MOCK: Lógica simulando calor da página baseada na visualização
        }));

        res.json({ success: true, data: pages });
    } catch (error) {
        console.error('Erro ao buscar top pages:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor da API do Dashboard rodando na porta ${PORT}`);
});

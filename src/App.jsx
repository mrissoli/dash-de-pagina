import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart3, Users, Clock, MousePointerClick, Activity, ChevronDown, Calendar,
  LayoutDashboard, ArrowUpRight, ArrowDownRight,
  MonitorPlay, Mail, Lock, LogIn, Shield, Smartphone, Monitor, Tablet,
  FolderOpen, Plus, Pencil, Trash2, Check, X, ShieldCheck,
  Zap, TrendingUp, MousePointer2, Gauge, Filter
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, LineChart, Line, FunnelChart, Funnel, LabelList
} from 'recharts';
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import { supabase, isSupabaseReady } from './lib/supabase';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const ADMIN_USER_ID = 'c0a20ec2-cabc-4fd3-9e69-adf77bc19ecc';

// --- MOCK CONSTANTS (Deletados pois a UI usará state nativo via API) ---
// ... Constants omitidos untuk clareza, fontes e topPages continuam os demais.

// sourcesData agora é dinâmico (useState dentro do DashboardScreen)

// topPages agora vem da API

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];

const DEVICE_COLORS = { Desktop: '#3b82f6', Mobile: '#10b981', Tablet: '#f59e0b' };

// --- COMPONENTS ---
const MetricCard = ({ title, value, change, trend, icon: Icon, colorClass, isLive }) => (
  <div className="glass-card metric-card">
    <div className="metric-header">
      <span className="metric-title">{title}</span>
      <div className={`metric-icon ${colorClass}`}><Icon size={20} /></div>
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
      <span className="metric-value">{value}</span>
      {isLive && (
        <div className="live-indicator">
          <div className="pulse"></div>
          <span style={{ fontSize: '12px', color: 'var(--success-color)', fontWeight: '600' }}>Ao vivo</span>
        </div>
      )}
    </div>
    {!isLive && (
      <div className={`metric-change ${trend === 'up' ? 'change-positive' : 'change-negative'}`}>
        {trend === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
        <span>{change} vs. período anterior</span>
      </div>
    )}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <div className="tooltip-label">{label}</div>
        {payload.map((entry, index) => (
          <div key={index} className="tooltip-item">
            <div className="tooltip-color" style={{ backgroundColor: entry.color }}></div>
            <span style={{ color: 'var(--text-primary)' }}>{entry.name}:</span>
            <span style={{ fontWeight: '700', color: entry.color }}>{entry.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// Heatmap Semanal do Umami
const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const UmamiWeeklyHeatmap = ({ data }) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Sem dados de heatmap semanal.</div>;
  }
  // data format: [{ x: hour, y: day, v: count }] or {0: {0: v, ...}, ...}
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  let maxVal = 1;
  if (Array.isArray(data)) {
    data.forEach(item => {
      const d = item.day ?? item.y ?? 0;
      const h = item.hour ?? item.x ?? 0;
      const v = item.v ?? item.count ?? item.sessions ?? 0;
      if (d < 7 && h < 24) { matrix[d][h] = v; if (v > maxVal) maxVal = v; }
    });
  } else if (typeof data === 'object') {
    Object.keys(data).forEach(d => {
      Object.keys(data[d] || {}).forEach(h => {
        const v = data[d][h] || 0;
        matrix[parseInt(d)][parseInt(h)] = v;
        if (v > maxVal) maxVal = v;
      });
    });
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(24, 1fr)', gap: '2px', minWidth: '600px' }}>
        {/* Header horas */}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} style={{ textAlign: 'center', fontSize: '9px', color: 'var(--text-secondary)', paddingBottom: '4px' }}>{h}h</div>
        ))}
        {/* Linhas por dia */}
        {DAYS_PT.map((day, d) => (
          <React.Fragment key={d}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', paddingRight: '6px' }}>{day}</div>
            {Array.from({ length: 24 }, (_, h) => {
              const v = matrix[d][h];
              const intensity = maxVal > 0 ? v / maxVal : 0;
              const bg = intensity === 0 ? 'rgba(255,255,255,0.04)' : `rgba(99,102,241,${(0.15 + intensity * 0.85).toFixed(2)})`;
              return (
                <div key={h} title={`${day} ${h}h: ${v} sessões`}
                  style={{ height: '20px', borderRadius: '3px', background: bg, cursor: 'default', transition: 'background 0.2s' }}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <span>Menos</span>
        {[0.04, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <div key={i} style={{ width: '16px', height: '16px', borderRadius: '3px', background: v === 0.04 ? 'rgba(255,255,255,0.04)' : `rgba(99,102,241,${v.toFixed(2)})` }} />
        ))}
        <span>Mais</span>
      </div>
    </div>
  );
};

// --- SCREENS ---
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      // Usando Supabase direto no frontend conf. pedido do cliente
      if (!isSupabaseReady()) {
        setErrorMsg('Erro de configuração: Supabase não está configurado. Verifique as variáveis de ambiente.');
        setIsLoading(false);
        return;
      }
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        setErrorMsg('Credenciais inválidas no Supabase.');
        setIsLoading(false);
        return;
      }

      // Chama o backend /api/login para criar o cookie JWT de sessão
      // (necessário para endpoints /api/admin/* e /api/meus-projetos)
      try {
        await fetch(`${API_BASE}/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        // Ignora erro aqui — o dashboard ainda funciona, só o admin pode falhar
      }

      // Buscar perfil na tabela do cliente
      let clientData = null;
      let dbError = null;

      const isAdmin = authData.user.id === 'c0a20ec2-cabc-4fd3-9e69-adf77bc19ecc' || authData.user.user_metadata?.role === 'admin';

      if (!isAdmin) {
        const { data, error } = await supabase
          .from('clientes_dashboard')
          .select('nome, google_property_id, clarity_project_id, clarity_token')
          .eq('user_id', authData.user.id)
          .single();
        clientData = data;
        dbError = error;
      } else {
        // Se for admin, assume dados padrão para avançar
        clientData = {
          nome: authData.user.user_metadata?.nome || 'Admin',
          google_property_id: null,
          clarity_project_id: null,
          clarity_token: null
        };
      }

      setIsLoading(false);

      if ((dbError || !clientData) && !isAdmin) {
        setErrorMsg('Dashboard não configurado para esta conta nesta base.');
      } else {
        onLogin({
          id: authData.user.id,
          email: authData.user.email,
          nome: clientData?.nome || 'Admin',
          ga4PropertyId: clientData?.google_property_id || null,
          clarityProjectId: clientData?.clarity_project_id || null,
          clarityToken: clientData?.clarity_token || null,
          isAdmin: isAdmin
        });
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMsg('Erro de conexão ao banco.');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card glass-card">
        <div className="login-header">
          <div className="login-logo-circle"><Activity size={32} color="var(--accent-color)" /></div>
          <h2>Portal do Cliente</h2>
          <p>Acesse seu painel exclusivo de tráfego</p>
        </div>
        {errorMsg && (
          <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger-color)', borderRadius: '8px', color: 'var(--danger-color)', fontSize: '13px', textAlign: 'center' }}>
            {errorMsg}
          </div>
        )}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label>E-mail Corporativo</label>
            <div className="input-wrapper">
              <Mail size={18} className="input-icon" />
              <input type="email" placeholder="cliente@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>
          <div className="input-group">
            <label>Senha</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>
          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? <div className="loader"></div> : <>Entrar no Dashboard<LogIn size={18} /></>}
          </button>
        </form>
        <div className="login-footer"><Shield size={14} /><span>Acesso seguro e criptografado</span></div>
      </div>
    </div>
  );
}

// ============================================================
// Admin Panel Component
// ============================================================
function AdminPanel({ user }) {
  const [activeTab, setActiveTab] = useState('clientes'); // 'clientes' | 'projetos' | 'admins'
  const [clientes, setClientes] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [selectedCliente, setSelectedCliente] = useState(null);

  // Estado do formulário de cliente
  const [showClienteForm, setShowClienteForm] = useState(false);
  const [clienteForm, setClienteForm] = useState({ nome: '', email: '', senha: '' });

  // Estado do formulário de projeto
  const [editingProjeto, setEditingProjeto] = useState(null);
  const [showProjetoForm, setShowProjetoForm] = useState(false);
  const [projetoForm, setProjetoForm] = useState({ nome: '', google_property_id: '', clarity_project_id: '', clarity_token: '', umami_website_id: '', cliente_id: '' });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Estado do formulário de admin
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminForm, setAdminForm] = useState({ nome: '', email: '', senha: '' });

  const showMsg = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg({ text: '', type: '' }), 4000); };

  // Pega o token Supabase para autenticar no backend como admin
  const getAuthHeader = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }, []);

  const adminFetch = useCallback(async (url, options = {}) => {
    const authHeaders = await getAuthHeader();
    return fetch(url, { ...options, headers: { ...authHeaders, ...(options.headers || {}) }, credentials: 'include' });
  }, [getAuthHeader]);

  const loadClientes = useCallback(async () => {
    const res = await adminFetch(`${API_BASE}/admin/clientes`);
    const d = await res.json();
    if (d.success) setClientes(d.data);
    else showMsg(d.error || 'Erro ao carregar clientes', 'error');
  }, [adminFetch]);

  const loadProjetos = useCallback(async (clienteId) => {
    const url = clienteId ? `${API_BASE}/admin/projetos?clienteId=${clienteId}` : `${API_BASE}/admin/projetos`;
    const res = await adminFetch(url);
    const d = await res.json();
    if (d.success) setProjetos(d.data);
  }, [adminFetch]);

  const loadAdmins = useCallback(async () => {
    const res = await adminFetch(`${API_BASE}/admin/admins`);
    const d = await res.json();
    if (d.success) setAdmins(d.data);
    else showMsg(d.error || 'Erro ao carregar administradores', 'error');
  }, [adminFetch]);

  useEffect(() => { loadClientes(); loadProjetos(null); loadAdmins(); }, []);

  const handleSelectCliente = (c) => {
    setSelectedCliente(c);
    loadProjetos(c.user_id);
    setShowProjetoForm(false);
    setEditingProjeto(null);
    setActiveTab('projetos');
  };

  // ---- CRUD Clientes ----
  const handleCreateCliente = async () => {
    if (!clienteForm.nome || !clienteForm.email || !clienteForm.senha) return showMsg('Preencha nome, e-mail e senha.', 'error');
    setSaving(true);
    const res = await adminFetch(`${API_BASE}/admin/clientes`, { method: 'POST', body: JSON.stringify(clienteForm) });
    const d = await res.json();
    if (d.success) {
      showMsg(`✅ Cliente "${d.nome}" criado com sucesso!`);
      setShowClienteForm(false);
      setClienteForm({ nome: '', email: '', senha: '' });
      loadClientes();
    } else { showMsg(d.error, 'error'); }
    setSaving(false);
  };

  const handleDeleteCliente = async (c) => {
    if (!window.confirm(`Excluir o cliente "${c.nome}" e todos os projetos dele?`)) return;
    const res = await adminFetch(`${API_BASE}/admin/clientes/${c.user_id}`, { method: 'DELETE' });
    const d = await res.json();
    if (d.success) { showMsg('✅ Cliente excluído.'); loadClientes(); if (selectedCliente?.user_id === c.user_id) setSelectedCliente(null); }
    else showMsg(d.error, 'error');
  };

  // ---- CRUD Admins ----
  const handleCreateAdmin = async () => {
    if (!adminForm.nome || !adminForm.email || !adminForm.senha) return showMsg('Preencha nome, e-mail e senha.', 'error');
    setSaving(true);
    const res = await adminFetch(`${API_BASE}/admin/admins`, { method: 'POST', body: JSON.stringify(adminForm) });
    const d = await res.json();
    if (d.success) {
      showMsg(`✅ Administrador "${d.nome}" criado com sucesso!`);
      setShowAdminForm(false);
      setAdminForm({ nome: '', email: '', senha: '' });
      loadAdmins();
    } else { showMsg(d.error, 'error'); }
    setSaving(false);
  };

  const handleDeleteAdmin = async (a) => {
    if (!window.confirm(`Excluir o administrador "${a.nome}"?`)) return;
    const res = await adminFetch(`${API_BASE}/admin/admins/${a.user_id}`, { method: 'DELETE' });
    const d = await res.json();
    if (d.success) { showMsg('✅ Administrador excluído.'); loadAdmins(); }
    else showMsg(d.error, 'error');
  };

  // ---- CRUD Projetos ----
  const openCreateProjeto = () => {
    setEditingProjeto(null);
    setProjetoForm({ nome: '', google_property_id: '', clarity_project_id: '', clarity_token: '', umami_website_id: '', cliente_id: selectedCliente?.user_id || '' });
    setShowProjetoForm(true);
  };

  const openEditProjeto = (p) => {
    setEditingProjeto(p);
    setProjetoForm({ nome: p.nome, google_property_id: p.google_property_id, clarity_project_id: p.clarity_project_id || '', clarity_token: p.clarity_token || '', umami_website_id: p.umami_website_id || '', cliente_id: p.cliente_id });
    setShowProjetoForm(true);
  };

  const handleSaveProjeto = async () => {
    setSaving(true);
    const url = editingProjeto ? `${API_BASE}/admin/projetos/${editingProjeto.id}` : `${API_BASE}/admin/projetos`;
    const method = editingProjeto ? 'PUT' : 'POST';
    const res = await adminFetch(url, { method, body: JSON.stringify(projetoForm) });
    const d = await res.json();
    if (d.success) { showMsg('✅ Projeto salvo!'); setShowProjetoForm(false); loadProjetos(selectedCliente?.user_id || null); }
    else showMsg(d.error, 'error');
    setSaving(false);
  };

  const handleDeleteProjeto = async (id) => {
    if (!window.confirm('Excluir este projeto?')) return;
    await adminFetch(`${API_BASE}/admin/projetos/${id}`, { method: 'DELETE' });
    loadProjetos(selectedCliente?.user_id || null);
  };

  // Estilos
  const adSt = { background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '20px' };
  const inputSt = { width: '100%', padding: '10px 14px', background: 'var(--surface-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' };
  const labelSt = { fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '500' };
  const btnSt = (color, extra = {}) => ({ padding: '9px 18px', background: color, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', ...extra });

  return (
    <div style={{ padding: '32px 40px' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldCheck size={24} color="var(--accent-color)" />
          <div>
            <h2 style={{ margin: 0, fontSize: '22px' }}>Painel Administrativo</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>Gerencie clientes e projetos de Analytics</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--surface-bg)', padding: '4px', borderRadius: '10px', width: 'fit-content', border: '1px solid var(--surface-border)' }}>
        {[{ key: 'clientes', label: '👥 Clientes', count: clientes.length }, { key: 'projetos', label: '📁 Projetos', count: projetos.length }, { key: 'admins', label: '🛡️ Admins', count: admins.length }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '13px', background: activeTab === tab.key ? 'var(--card-bg)' : 'transparent', color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none', transition: 'all 0.15s' }}>
            {tab.label} <span style={{ marginLeft: '6px', background: activeTab === tab.key ? 'var(--accent-color)' : 'var(--surface-border)', color: '#fff', fontSize: '11px', padding: '1px 7px', borderRadius: '20px' }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Feedback */}
      {msg.text && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: msg.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${msg.type === 'error' ? 'var(--danger-color)' : 'var(--success-color)'}`, color: msg.type === 'error' ? 'var(--danger-color)' : 'var(--success-color)', marginBottom: '16px', fontSize: '13px', fontWeight: '500' }}>
          {msg.text}
        </div>
      )}

      {/* ===== ABA CLIENTES ===== */}
      {activeTab === 'clientes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontWeight: '700', fontSize: '15px' }}>Clientes cadastrados</div>
            <button onClick={() => setShowClienteForm(!showClienteForm)} style={btnSt('var(--accent-color)')}><Plus size={14} /> Novo Cliente</button>
          </div>

          {showClienteForm && (
            <div style={{ ...adSt, marginBottom: '16px', border: '1px solid var(--accent-color)' }}>
              <div style={{ fontWeight: '700', marginBottom: '16px', fontSize: '15px' }}>➕ Criar novo cliente</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelSt}>Nome completo *</label>
                  <input style={inputSt} placeholder="Ex: João da Silva" value={clienteForm.nome} onChange={e => setClienteForm({ ...clienteForm, nome: e.target.value })} />
                </div>
                <div>
                  <label style={labelSt}>E-mail *</label>
                  <input style={inputSt} type="email" placeholder="joao@empresa.com" value={clienteForm.email} onChange={e => setClienteForm({ ...clienteForm, email: e.target.value })} />
                </div>
                <div>
                  <label style={labelSt}>Senha de acesso *</label>
                  <input style={inputSt} type="password" placeholder="Mínimo 6 caracteres" value={clienteForm.senha} onChange={e => setClienteForm({ ...clienteForm, senha: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button onClick={handleCreateCliente} disabled={saving} style={btnSt('#10b981')}><Check size={14} />{saving ? 'Criando...' : 'Criar Cliente'}</button>
                <button onClick={() => { setShowClienteForm(false); setClienteForm({ nome: '', email: '', senha: '' }); }} style={{ ...btnSt('transparent'), border: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}><X size={14} /> Cancelar</button>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>💡 O cliente será criado no Supabase Authentication automaticamente e poderá fazer login imediatamente.</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {clientes.map(c => (
              <div key={c.user_id} style={{ ...adSt, display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(16,185,129,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: '700', fontSize: '16px', color: 'var(--accent-color)' }}>
                  {c.nome?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '700', fontSize: '15px' }}>{c.nome || 'Sem nome'}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{c.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #555)', marginTop: '2px', fontFamily: 'monospace' }}>{c.user_id}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button onClick={() => handleSelectCliente(c)} style={{ ...btnSt('rgba(99,102,241,0.15)'), color: 'var(--accent-color)', border: '1px solid rgba(99,102,241,0.3)' }}><FolderOpen size={13} /> Projetos</button>
                  <button onClick={() => handleDeleteCliente(c)} style={{ ...btnSt('rgba(239,68,68,0.1)'), color: 'var(--danger-color)', border: '1px solid rgba(239,68,68,0.3)' }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            {clientes.length === 0 && !showClienteForm && (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px dashed var(--surface-border)' }}>
                <Users size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
                <div style={{ fontWeight: '600', marginBottom: '6px' }}>Nenhum cliente cadastrado</div>
                <div style={{ fontSize: '13px' }}>Clique em "Novo Cliente" para adicionar o primeiro.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== ABA ADMINS ===== */}
      {activeTab === 'admins' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontWeight: '700', fontSize: '15px' }}>Administradores do Sistema</div>
            <button onClick={() => setShowAdminForm(!showAdminForm)} style={btnSt('var(--accent-color)')}><Plus size={14} /> Novo Administrador</button>
          </div>

          {showAdminForm && (
            <div style={{ ...adSt, marginBottom: '16px', border: '1px solid var(--accent-color)' }}>
              <div style={{ fontWeight: '700', marginBottom: '16px', fontSize: '15px' }}>➕ Criar novo administrador</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelSt}>Nome completo *</label>
                  <input style={inputSt} placeholder="Ex: João Admin" value={adminForm.nome} onChange={e => setAdminForm({ ...adminForm, nome: e.target.value })} />
                </div>
                <div>
                  <label style={labelSt}>E-mail *</label>
                  <input style={inputSt} type="email" placeholder="admin@empresa.com" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} />
                </div>
                <div>
                  <label style={labelSt}>Senha de acesso *</label>
                  <input style={inputSt} type="password" placeholder="Mínimo 6 caracteres" value={adminForm.senha} onChange={e => setAdminForm({ ...adminForm, senha: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button onClick={handleCreateAdmin} disabled={saving} style={btnSt('#10b981')}><Check size={14} />{saving ? 'Criando...' : 'Criar Admin'}</button>
                <button onClick={() => { setShowAdminForm(false); setAdminForm({ nome: '', email: '', senha: '' }); }} style={{ ...btnSt('transparent'), border: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}><X size={14} /> Cancelar</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {admins.map(a => (
              <div key={a.user_id} style={{ ...adSt, display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(239,68,68,0.3), rgba(245,158,11,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: '700', fontSize: '16px', color: 'var(--danger-color)' }}>
                  {a.nome?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{a.nome || 'Sem nome'} <span style={{fontSize: '11px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: 'bold'}}>ADMIN</span></div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{a.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #555)', marginTop: '2px', fontFamily: 'monospace' }}>{a.user_id}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {a.user_id !== 'c0a20ec2-cabc-4fd3-9e69-adf77bc19ecc' && (
                    <button onClick={() => handleDeleteAdmin(a)} style={{ ...btnSt('rgba(239,68,68,0.1)'), color: 'var(--danger-color)', border: '1px solid rgba(239,68,68,0.3)' }}><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== ABA PROJETOS ===== */}
      {activeTab === 'projetos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '20px', alignItems: 'start' }}>
          {/* Sidebar de clientes */}
          <div style={adSt}>
            <div style={{ fontWeight: '700', marginBottom: '12px', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Filtrar por Cliente</div>
            <div onClick={() => { setSelectedCliente(null); loadProjetos(null); }}
              style={{ padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px', background: !selectedCliente ? 'rgba(99,102,241,0.15)' : 'transparent', border: !selectedCliente ? '1px solid var(--accent-color)' : '1px solid transparent', fontSize: '13px', fontWeight: !selectedCliente ? '600' : '400', color: !selectedCliente ? 'var(--accent-color)' : 'var(--text-primary)' }}>
              Todos os Projetos
            </div>
            {clientes.map(c => (
              <div key={c.user_id} onClick={() => { setSelectedCliente(c); loadProjetos(c.user_id); }}
                style={{ padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px', background: selectedCliente?.user_id === c.user_id ? 'rgba(99,102,241,0.15)' : 'transparent', border: selectedCliente?.user_id === c.user_id ? '1px solid var(--accent-color)' : '1px solid transparent', transition: 'all 0.15s' }}>
                <div style={{ fontWeight: '600', fontSize: '13px' }}>{c.nome || 'Sem nome'}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{c.email}</div>
              </div>
            ))}
          </div>

          {/* Lista e form de projetos */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '15px' }}>
                {selectedCliente ? `Projetos de ${selectedCliente.nome}` : 'Todos os Projetos'}
                <span style={{ marginLeft: '10px', background: 'var(--accent-color)', color: '#fff', fontSize: '11px', padding: '2px 8px', borderRadius: '20px' }}>{projetos.length}</span>
              </div>
              <button onClick={openCreateProjeto} style={btnSt('var(--accent-color)')}><Plus size={14} /> Novo Projeto</button>
            </div>

            {showProjetoForm && (
              <div style={{ ...adSt, marginBottom: '16px', border: '1px solid var(--accent-color)' }}>
                <div style={{ fontWeight: '700', marginBottom: '16px' }}>{editingProjeto ? '✏️ Editar Projeto' : '➕ Novo Projeto'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div><label style={labelSt}>Nome do Projeto *</label><input style={inputSt} placeholder="Ex: Site Principal" value={projetoForm.nome} onChange={e => setProjetoForm({ ...projetoForm, nome: e.target.value })} /></div>
                  <div><label style={labelSt}>GA4 Property ID *</label><input style={inputSt} placeholder="Ex: 504225943" value={projetoForm.google_property_id} onChange={e => setProjetoForm({ ...projetoForm, google_property_id: e.target.value })} /></div>
                  <div><label style={labelSt}>Clarity Project ID</label><input style={inputSt} placeholder="Ex: abc123xyz" value={projetoForm.clarity_project_id} onChange={e => setProjetoForm({ ...projetoForm, clarity_project_id: e.target.value })} /></div>
                  <div><label style={labelSt}>Clarity API Token</label><input style={inputSt} placeholder="Bearer token do Clarity" value={projetoForm.clarity_token} onChange={e => setProjetoForm({ ...projetoForm, clarity_token: e.target.value })} /></div>
                  <div style={{ gridColumn: '1/-1' }}><label style={labelSt}>Umami Website ID</label><input style={inputSt} placeholder="UUID do website no Umami" value={projetoForm.umami_website_id} onChange={e => setProjetoForm({ ...projetoForm, umami_website_id: e.target.value })} /></div>
                  {!selectedCliente && <div style={{ gridColumn: '1/-1' }}><label style={labelSt}>Cliente (user_id)</label><input style={inputSt} placeholder="UUID do cliente" value={projetoForm.cliente_id} onChange={e => setProjetoForm({ ...projetoForm, cliente_id: e.target.value })} /></div>}
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                  <button onClick={handleSaveProjeto} disabled={saving} style={btnSt('#10b981')}><Check size={14} />{saving ? 'Salvando...' : 'Salvar'}</button>
                  <button onClick={() => setShowProjetoForm(false)} style={{ ...btnSt('transparent'), border: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}><X size={14} /> Cancelar</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {projetos.map(p => (
                <div key={p.id} style={{ ...adSt, display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FolderOpen size={18} color="var(--accent-color)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '4px' }}>{p.nome}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '4px' }}>
                      <span>📊 GA4: <code style={{ color: 'var(--accent-color)' }}>{p.google_property_id}</code></span>
                      {p.clarity_project_id && <span>🎯 Clarity: <code style={{ color: '#10b981' }}>{p.clarity_project_id}</code></span>}
                      {p.umami_website_id && <span>🌐 Umami: <code style={{ color: '#8b5cf6' }}>{p.umami_website_id.split('-')[0]}...</code></span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button onClick={() => openEditProjeto(p)} style={{ ...btnSt('rgba(99,102,241,0.2)'), color: 'var(--accent-color)', border: '1px solid rgba(99,102,241,0.3)' }}><Pencil size={13} /></button>
                    <button onClick={() => handleDeleteProjeto(p.id)} style={{ ...btnSt('rgba(239,68,68,0.15)'), color: 'var(--danger-color)', border: '1px solid rgba(239,68,68,0.3)' }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
              {projetos.length === 0 && !showProjetoForm && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px dashed var(--surface-border)' }}>Nenhum projeto cadastrado para este cliente.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Dashboard Screen
// ============================================================
function DashboardScreen({ user, onLogout }) {
  const isAdmin = user.id === ADMIN_USER_ID || user.isAdmin;
  const [activeNav, setActiveNav] = useState('dashboard');
  const [dateRange, setDateRange] = useState('7daysAgo');
  const [showDateMenu, setShowDateMenu] = useState(false);

  // Multi-projeto
  const [projetos, setProjetos] = useState([]);
  const [selectedProjeto, setSelectedProjeto] = useState(null);
  const [showProjetoMenu, setShowProjetoMenu] = useState(false);

  // Admin Client Seletor
  const [clientesAdmin, setClientesAdmin] = useState([]);
  const [selectedClienteAdminId, setSelectedClienteAdminId] = useState(null);
  const [showClienteAdminMenu, setShowClienteAdminMenu] = useState(false);

  // Filtro de página
  const [pages, setPages] = useState([]);
  const [selectedPage, setSelectedPage] = useState(null); // null = todas as páginas
  const [showPageMenu, setShowPageMenu] = useState(false);
  const [pageSearch, setPageSearch] = useState('');

  // Métricas
  const [metrics, setMetrics] = useState({
    totalVisitsGA: '...', bounceRateGA: '...', activeUsersClarity: '...', avgTimeGA: '...', activeUsersGA: '...', newUsersGA: '...', pagesPerSessionGA: '...'
  });
  const [realtimeUsers, setRealtimeUsers] = useState(null);
  const [trafficData, setTrafficData] = useState([]);
  const [sourcesData, setSourcesData] = useState([]);
  const [eventsData, setEventsData] = useState([]);
  const [devicesData, setDevicesData] = useState([]);
  const [browsersData, setBrowsersData] = useState([]);
  const [countriesData, setCountriesData] = useState([]);
  const [topPagesData, setTopPagesData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const realtimeIntervalRef = useRef(null);

  // Novos estados
  const [conversionData, setConversionData] = useState({ conversionRate: '...', totalLeads: '...', utmData: [], hourlyData: [], deviceConv: [] });
  const [rageClickData, setRageClickData] = useState({ rageClicks: '...', deadClicks: '...', excessiveScrolling: '...' });
  const [pageSpeedData, setPageSpeedData] = useState(null);
  const [pageSpeedLoading, setPageSpeedLoading] = useState(false);
  const [trafficLeadsData, setTrafficLeadsData] = useState([]);
  const [funnelData, setFunnelData] = useState([]);
  // URL base do cliente p/ PageSpeed (configurável)
  const [pageSpeedUrl, setPageSpeedUrl] = useState('');

  // ===== Umami states =====
  const [umamiConfigured, setUmamiConfigured] = useState(false);
  const [umamiWebsites, setUmamiWebsites] = useState([]);
  const [selectedUmamiWebsite, setSelectedUmamiWebsite] = useState(null);
  const [umamiKpis, setUmamiKpis] = useState(null);
  const [umamiTimeseries, setUmamiTimeseries] = useState({ pageviews: [], sessions: [] });
  const [umamiReferrers, setUmamiReferrers] = useState([]);
  const [umamiDevices, setUmamiDevices] = useState([]);
  const [umamiTopUrls, setUmamiTopUrls] = useState([]);
  const [umamiCountries, setUmamiCountries] = useState([]);
  const [umamiLeadEvents, setUmamiLeadEvents] = useState([]);
  const [umamiWeekly, setUmamiWeekly] = useState(null);
  const [umamiHourly, setUmamiHourly] = useState([]);
  const [umamiLoading, setUmamiLoading] = useState(false);
  const [umamiUtmData, setUmamiUtmData] = useState([]);
  const [umamiBrowsers, setUmamiBrowsers] = useState([]);
  const [showUmamiWebsiteMenu, setShowUmamiWebsiteMenu] = useState(false);
  const [selectedUmamiEvent, setSelectedUmamiEvent] = useState('lead');
  const [availableUmamiEvents, setAvailableUmamiEvents] = useState([]);

  const thisYear = new Date().getFullYear();
  const dateOptions = [
    { label: 'Hoje', value: 'today', startDate: 'today', endDate: 'today' },
    { label: 'Ontem', value: 'yesterday', startDate: 'yesterday', endDate: 'yesterday' },
    { label: 'Últimos 3 dias', value: '3daysAgo', startDate: '3daysAgo', endDate: 'today' },
    { label: 'Últimos 7 dias', value: '7daysAgo', startDate: '7daysAgo', endDate: 'today' },
    { label: 'Últimos 14 dias', value: '14daysAgo', startDate: '14daysAgo', endDate: 'today' },
    { label: 'Últimos 30 dias', value: '30daysAgo', startDate: '30daysAgo', endDate: 'today' },
    { label: 'Últimos 90 dias', value: '90daysAgo', startDate: '90daysAgo', endDate: 'today' },
    { label: `Esse ano (${thisYear})`, value: 'thisYear', startDate: `${thisYear}-01-01`, endDate: 'today' },
  ];
  const selectedDateOption = dateOptions.find(o => o.value === dateRange) || dateOptions[3];

  // Carrega lista de projetos do cliente (ou todos para admins)
  useEffect(() => {
    const loadProjetos = async () => {
      try {
        let url = `${API_BASE}/meus-projetos`;
        let options = { credentials: 'include' };
        
        if (isAdmin) {
          url = `${API_BASE}/admin/projetos`;
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            options.headers = { 'Authorization': `Bearer ${session.access_token}` };
            
            // Tenta puxar lista de clientes também
            fetch(`${API_BASE}/admin/clientes`, options)
              .then(res => res.json())
              .then(d => {
                if (d.success) setClientesAdmin(d.data);
              })
              .catch(() => {});
          }
        }
        
        const res = await fetch(url, options);
        const d = await res.json();
        if (d.success && d.data.length > 0) {
          setProjetos(d.data);
          setSelectedProjeto(d.data[0]);
        } else {
          // Fallback para o projeto da tabela clientes_dashboard legacy
          if (user.ga4PropertyId) {
            const legacyProjeto = { id: 'legacy', nome: 'Projeto Principal', google_property_id: user.ga4PropertyId, clarity_project_id: user.clarityProjectId, clarity_token: user.clarityToken };
            setProjetos([legacyProjeto]);
            setSelectedProjeto(legacyProjeto);
          }
        }
      } catch { }
    };
    loadProjetos();
  }, [user]);

  // Polling de usuários em tempo real (a cada 30s)
  const fetchRealtime = useCallback(async (propertyId) => {
    if (!propertyId) return;
    try {
      const res = await fetch(`${API_BASE}/realtime?propertyId=${propertyId}`);
      const d = await res.json();
      if (d.success) setRealtimeUsers(d.activeUsers);
    } catch { }
  }, []);

  useEffect(() => {
    if (!selectedProjeto?.google_property_id) return;
    fetchRealtime(selectedProjeto.google_property_id);
    realtimeIntervalRef.current = setInterval(() => fetchRealtime(selectedProjeto.google_property_id), 30000);
    return () => clearInterval(realtimeIntervalRef.current);
  }, [selectedProjeto, fetchRealtime]);

  // Buscar dados reais das APIs — uma chamada por tipo de dado, todas em paralelo
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedProjeto?.google_property_id) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setDashboardError('');

        const { startDate, endDate } = selectedDateOption;
        const dr = `&dateRange=${startDate}&endDate=${endDate}`;
        const pid = `propertyId=${selectedProjeto.google_property_id}`;
        const ct = `&clarityToken=${encodeURIComponent(selectedProjeto.clarity_token || '')}`;
        const pp = selectedPage ? `&pagePath=${encodeURIComponent(selectedPage.path)}` : '';

        const [resMetrics, resTraffic, resSources, resEvents, resDevices, resBrowsers, resCountries, resTopPages,
          resConversion, resRageClicks, resTrafficLeads, resFunnel] = await Promise.all([
            fetch(`${API_BASE}/metrics?${pid}${ct}${dr}${pp}`, { credentials: 'include' }),
            fetch(`${API_BASE}/traffic?${pid}${ct}${dr}${pp}`, { credentials: 'include' }),
            fetch(`${API_BASE}/sources?${pid}${dr}${pp}`, { credentials: 'include' }),
            fetch(`${API_BASE}/events?${pid}${dr}${pp}`, { credentials: 'include' }),
            fetch(`${API_BASE}/devices?${pid}${dr}${pp}`, { credentials: 'include' }),
            fetch(`${API_BASE}/browsers?${pid}${dr}${pp}`, { credentials: 'include' }),
            fetch(`${API_BASE}/countries?${pid}${dr}${pp}`, { credentials: 'include' }),
            fetch(`${API_BASE}/top-pages?${pid}${dr}`, { credentials: 'include' }),
            fetch(`${API_BASE}/conversion-data?${pid}${dr}`, { credentials: 'include' }),
            fetch(`${API_BASE}/clarity-rage-clicks?${ct.replace('&clarityToken=', 'clarityToken=')}`, { credentials: 'include' }),
            fetch(`${API_BASE}/traffic-leads?${pid}${dr}`, { credentials: 'include' }),
            fetch(`${API_BASE}/scroll-funnel?${pid}${dr}`, { credentials: 'include' }),
          ]);

        // Métricas
        if (resMetrics.ok) {
          const mData = await resMetrics.json();
          if (mData.success && mData.data) setMetrics(mData.data);
          else if (!mData.success) setDashboardError(mData.error || mData.message || 'Erro ao carregar métricas.');
        }

        // Tráfego diário
        if (resTraffic.ok) {
          const tData = await resTraffic.json();
          if (tData.success && tData.data) {
            const formatted = tData.data.map(item => {
              const d = new Date(item.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
              const shortDay = d.toLocaleDateString('pt-BR', { weekday: 'short' });
              return { name: shortDay.charAt(0).toUpperCase() + shortDay.slice(1), analytics: item.analytics, clarity: item.clarity };
            });
            setTrafficData(formatted);
          } else if (!tData.success) {
            setDashboardError(tData.error || tData.message || 'Erro ao carregar tráfego.');
          }
        }

        if (resSources.ok) { const s = await resSources.json(); if (s.success && s.data) setSourcesData(s.data); }
        if (resEvents.ok) { const e = await resEvents.json(); if (e.success && e.data) setEventsData(e.data); }
        if (resDevices.ok) { const d = await resDevices.json(); if (d.success && d.data) setDevicesData(d.data); }
        if (resBrowsers.ok) { const b = await resBrowsers.json(); if (b.success && b.data) setBrowsersData(b.data); }
        if (resCountries.ok) { const c = await resCountries.json(); if (c.success && c.data) setCountriesData(c.data); }
        if (resTopPages.ok) { const tp = await resTopPages.json(); if (tp.success && tp.data) setTopPagesData(tp.data); }

        // Novos endpoints
        if (resConversion.ok) {
          const cv = await resConversion.json();
          if (cv.success && cv.data) setConversionData(cv.data);
        }
        if (resRageClicks.ok) {
          const rc = await resRageClicks.json();
          if (rc.success && rc.data) setRageClickData(rc.data);
        }
        if (resTrafficLeads.ok) {
          const tl = await resTrafficLeads.json();
          if (tl.success && tl.data) {
            const formatted = tl.data.map(item => {
              const d = new Date(item.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
              const shortDay = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' });
              return { name: shortDay, sessions: item.sessions, leads: item.leads };
            });
            setTrafficLeadsData(formatted);
          }
        }
        if (resFunnel.ok) {
          const fn = await resFunnel.json();
          if (fn.success && fn.data?.funnel) setFunnelData(fn.data.funnel);
        }
      } catch (error) {
        console.error('Falha ao buscar dados', error);
        setDashboardError('O servidor Backend está Offline ou inacessível. Certifique-se de que o Servidor Node está rodando.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedProjeto, dateRange, selectedPage]);

  // ===== Fetch Umami Config + Websites =====
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${API_BASE}/umami/config`);
        const cfg = await res.json();
        setUmamiConfigured(cfg.configured);
        if (cfg.configured) {
          const wRes = await fetch(`${API_BASE}/umami/websites`);
          const wData = await wRes.json();
          if (wData.success && wData.data?.length > 0) {
            setUmamiWebsites(wData.data);
            if (selectedProjeto?.umami_website_id) {
              const matched = wData.data.find(w => w.id === selectedProjeto.umami_website_id);
              setSelectedUmamiWebsite(matched || null);
            } else {
              setSelectedUmamiWebsite(null);
            }
          }
        }
      } catch { }
    };
    init();
  }, [selectedProjeto?.umami_website_id]);

  // ===== Fetch Umami Dashboard Data =====
  useEffect(() => {
    if (!selectedUmamiWebsite?.id) return;
    const fetchUmami = async () => {
      setUmamiLoading(true);
      try {
        const { startDate, endDate } = selectedDateOption;
        const qs = `websiteId=${selectedUmamiWebsite.id}&dateRange=${startDate}&endDate=${endDate}&eventName=${encodeURIComponent(selectedUmamiEvent)}`;
        const [dashRes] = await Promise.all([
          fetch(`${API_BASE}/umami/dashboard?${qs}`)
        ]);
        if (dashRes.ok) {
          const d = await dashRes.json();
          if (d.success) {
            setUmamiKpis(d.kpis);
            // Timeseries — merge pageviews, sessions, leads
            const pvMap = {};
            (d.pageviewsTimeseries?.pageviews || []).forEach(p => { pvMap[p.t] = { date: p.t, pageviews: p.y, sessions: 0, leads: 0 }; });
            (d.pageviewsTimeseries?.sessions || []).forEach(s => { if (pvMap[s.t]) pvMap[s.t].sessions = s.y; else pvMap[s.t] = { date: s.t, pageviews: 0, sessions: s.y, leads: 0 }; });
            (d.pageviewsTimeseries?.leads || []).forEach(l => { if (pvMap[l.t]) pvMap[l.t].leads = l.y; else pvMap[l.t] = { date: l.t, pageviews: 0, sessions: 0, leads: l.y }; });

            const ts = Object.values(pvMap).sort((a, b) => a.date.localeCompare(b.date)).map(item => {
              const dateObj = new Date(item.date);
              return { ...item, name: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) };
            });
            setUmamiTimeseries(ts);
            setUmamiReferrers(d.referrers || []);
            setUmamiDevices(d.devices || []);
            setUmamiTopUrls(d.topUrls || []);
            setUmamiCountries(d.countries || []);
            setUmamiLeadEvents(d.leadEvents || []);
            setUmamiUtmData(d.utmData || []);
            setUmamiBrowsers(d.browsers || []);
            setAvailableUmamiEvents(d.availableEvents || []);

            // Hourly Parsing
            const hourMap = {};
            (d.hourlyPageviews?.pageviews || []).forEach(p => {
              const hr = new Date(p.t).getHours();
              if (!hourMap[hr]) hourMap[hr] = { hour: `${String(hr).padStart(2, '0')}h`, pageviews: 0, sessions: 0 };
              hourMap[hr].pageviews += p.y;
            });
            (d.hourlyPageviews?.sessions || []).forEach(s => {
              const hr = new Date(s.t).getHours();
              if (!hourMap[hr]) hourMap[hr] = { hour: `${String(hr).padStart(2, '0')}h`, pageviews: 0, sessions: 0 };
              hourMap[hr].sessions += s.y;
            });
            setUmamiHourly(Array.from({ length: 24 }, (_, i) => hourMap[i] || { hour: `${String(i).padStart(2, '0')}h`, pageviews: 0, sessions: 0 }));
          }
        }
      } catch (e) { console.warn('Umami fetch error:', e.message); }
      finally { setUmamiLoading(false); }
    };
    fetchUmami();
    
    // Configura o fetch periódico para não floodar
    const interval = setInterval(fetchUmami, 60000); // 1 minuto
    
    return () => clearInterval(interval);
  }, [selectedUmamiWebsite, dateRange, selectedUmamiEvent]);

  // PageSpeed — carrega quando o projeto muda (URL separada)
  useEffect(() => {
    const fetchPageSpeed = async () => {
      if (!pageSpeedUrl) return;
      setPageSpeedLoading(true);
      try {
        const res = await fetch(`${API_BASE}/pagespeed?url=${encodeURIComponent(pageSpeedUrl)}`);
        const d = await res.json();
        if (d.success && d.data) setPageSpeedData(d.data);
      } catch { } finally { setPageSpeedLoading(false); }
    };
    fetchPageSpeed();
  }, [pageSpeedUrl]);

  // Busca páginas disponíveis quando muda o projeto ou período
  useEffect(() => {
    const fetchPages = async () => {
      if (!selectedProjeto?.google_property_id) return;
      try {
        const res = await fetch(`${API_BASE}/pages?propertyId=${selectedProjeto.google_property_id}&dateRange=${dateRange}`);
        const d = await res.json();
        if (d.success) setPages(d.data);
      } catch { }
    };
    fetchPages();
    setSelectedPage(null); // reseta filtro de página ao trocar projeto/período
  }, [selectedProjeto, dateRange]);

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo"><Activity size={28} color="var(--accent-color)" /><span>MetricDash</span></div>
        <div className="nav-menu">
          <div className="nav-section-title">Principal</div>
          <div className={`nav-item ${activeNav === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveNav('dashboard')}><LayoutDashboard size={18} /> Resumo</div>
          <div className={`nav-item ${activeNav === 'analytics' ? 'active' : ''}`} onClick={() => setActiveNav('analytics')}>
            <BarChart3 size={18} /> Analytics Base
            {umamiConfigured && <span style={{ marginLeft: 'auto', fontSize: '9px', padding: '2px 6px', background: 'rgba(16,185,129,0.2)', color: '#10b981', borderRadius: '10px', fontWeight: 700 }}>Umami</span>}
          </div>
          <div className={`nav-item ${activeNav === 'clarity' ? 'active' : ''}`} onClick={() => setActiveNav('clarity')}><MonitorPlay size={18} /> Mapas de Calor</div>
          {isAdmin && (
            <>
              <div className="nav-section-title" style={{ marginTop: '16px' }}>Administração</div>
              <div className={`nav-item ${activeNav === 'admin' ? 'active' : ''}`} onClick={() => setActiveNav('admin')} style={{ color: 'var(--accent-color)' }}><ShieldCheck size={18} /> Administração Geral</div>
            </>
          )}
        </div>
        <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid var(--surface-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="user-profile">{user?.nome?.charAt(0) || user?.name?.charAt(0) || '?'}</div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: '600', fontSize: '14px' }}>{user.nome || user.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user.email}</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ marginTop: '16px', width: '100%', padding: '8px', background: 'transparent', border: '1px solid var(--surface-border)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}>Sair da Conta</button>
        </div>
      </aside>
      {activeNav === 'admin' && isAdmin && <main className="main-content"><AdminPanel user={user} /></main>}

      {activeNav === 'dashboard' && <main className="main-content">
        <header className="header">
          <div className="header-title">
            <h1>{selectedProjeto?.nome || 'Visão Geral da Conta'}</h1>
            <p>Dados combinados de forma segura pelo Servidor</p>
          </div>
          <div className="header-actions">
            {/* Seletor de Cliente (Só Admin) */}
            {isAdmin && clientesAdmin.length > 0 && (
              <div className="date-picker" onClick={() => setShowClienteAdminMenu(!showClienteAdminMenu)} style={{ cursor: 'pointer', position: 'relative', userSelect: 'none', marginRight: '8px' }}>
                <Users size={16} color="var(--text-secondary)" />
                <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedClienteAdminId ? clientesAdmin.find(c => c.user_id === selectedClienteAdminId)?.nome : 'Todos os Clientes'}
                </span>
                {selectedClienteAdminId && (
                  <span onClick={(e) => { e.stopPropagation(); setSelectedClienteAdminId(null); setShowClienteAdminMenu(false); }} style={{ marginLeft: '4px', display: 'flex' }}>
                    <X size={13} color="var(--text-secondary)" />
                  </span>
                )}
                <ChevronDown size={16} color="var(--text-secondary)" />
                {showClienteAdminMenu && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: '#1e1e24', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '6px', zIndex: 100, minWidth: '240px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'dropdownFadeIn 0.2s ease-out' }}>
                    <div onClick={(e) => { e.stopPropagation(); setSelectedClienteAdminId(null); setShowClienteAdminMenu(false); }}
                        style={{ padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: !selectedClienteAdminId ? 'var(--accent-color)' : 'var(--text-primary)', fontWeight: !selectedClienteAdminId ? '600' : '400', background: !selectedClienteAdminId ? 'rgba(99,102,241,0.1)' : 'transparent', transition: 'all 0.15s' }}>
                        Todos os Clientes
                    </div>
                    {clientesAdmin.map(c => (
                      <div key={c.user_id} onClick={(e) => { e.stopPropagation(); setSelectedClienteAdminId(c.user_id); setShowClienteAdminMenu(false); setSelectedProjeto(null); }}
                        style={{ padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: selectedClienteAdminId === c.user_id ? 'var(--accent-color)' : 'var(--text-primary)', fontWeight: selectedClienteAdminId === c.user_id ? '600' : '400', background: selectedClienteAdminId === c.user_id ? 'rgba(99,102,241,0.1)' : 'transparent', transition: 'all 0.15s' }}>
                        {c.nome}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Seletor de Projeto */}
            {(isAdmin ? projetos.filter(p => !selectedClienteAdminId || p.cliente_id === selectedClienteAdminId) : projetos).length > 0 && (
              <div className="date-picker" onClick={() => setShowProjetoMenu(!showProjetoMenu)} style={{ cursor: 'pointer', position: 'relative', userSelect: 'none', marginRight: '8px' }}>
                <FolderOpen size={16} color="var(--text-secondary)" />
                <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedProjeto?.nome || 'Nenhum Projeto'}
                </span>
                <ChevronDown size={16} color="var(--text-secondary)" />
                {showProjetoMenu && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: '#1e1e24', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '6px', zIndex: 100, minWidth: '240px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'dropdownFadeIn 0.2s ease-out' }}>
                    {(isAdmin ? projetos.filter(p => !selectedClienteAdminId || p.cliente_id === selectedClienteAdminId) : projetos).map(p => (
                      <div key={p.id} onClick={(e) => { e.stopPropagation(); setSelectedProjeto(p); setShowProjetoMenu(false); }}
                        style={{ padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: selectedProjeto?.id === p.id ? 'var(--accent-color)' : 'var(--text-primary)', fontWeight: selectedProjeto?.id === p.id ? '600' : '400', background: selectedProjeto?.id === p.id ? 'rgba(99,102,241,0.1)' : 'transparent', transition: 'all 0.15s' }}>
                        {p.nome}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Seletor de Página (slug) */}
            <div className="date-picker" onClick={() => { setShowPageMenu(!showPageMenu); if (!showPageMenu) setPageSearch(''); }} style={{ cursor: 'pointer', position: 'relative', userSelect: 'none', marginRight: '8px', background: selectedPage ? 'rgba(99,102,241,0.12)' : undefined, borderColor: selectedPage ? 'var(--accent-color)' : undefined }}>
              <BarChart3 size={16} color={selectedPage ? 'var(--accent-color)' : 'var(--text-secondary)'} />
              <span style={{ color: selectedPage ? 'var(--accent-color)' : undefined, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedPage ? selectedPage.path : 'Todas as Páginas'}
              </span>
              {selectedPage && (
                <span onClick={(e) => { e.stopPropagation(); setSelectedPage(null); setShowPageMenu(false); }}
                  style={{ marginLeft: '4px', color: 'var(--text-secondary)', display: 'flex', cursor: 'pointer' }}>
                  <X size={13} />
                </span>
              )}
              <ChevronDown size={16} color="var(--text-secondary)" />
              {showPageMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: '#1e1e24', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '8px', zIndex: 200, width: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'dropdownFadeIn 0.2s ease-out' }} onClick={e => e.stopPropagation()}>
                  <input
                    autoFocus
                    placeholder="Buscar /slug..."
                    value={pageSearch}
                    onChange={e => setPageSearch(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--surface-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', marginBottom: '6px', outline: 'none' }}
                  />
                  <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    <div onClick={() => { setSelectedPage(null); setShowPageMenu(false); }}
                      style={{ padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: !selectedPage ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: !selectedPage ? '600' : '400', background: !selectedPage ? 'rgba(99,102,241,0.1)' : 'transparent', marginBottom: '2px' }}>
                      🌐 Todas as páginas
                    </div>
                    {pages
                      .filter(p => p?.path && p.path.toLowerCase().includes(pageSearch.toLowerCase()))
                      .map(p => (
                        <div key={p.path} onClick={() => { setSelectedPage(p); setShowPageMenu(false); }}
                          style={{ padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontFamily: 'monospace', color: selectedPage?.path === p.path ? 'var(--accent-color)' : 'var(--text-primary)', background: selectedPage?.path === p.path ? 'rgba(99,102,241,0.1)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.path}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px', flexShrink: 0 }}>{p.views.toLocaleString()}</span>
                        </div>
                      ))
                    }
                    {pages.filter(p => p.path.toLowerCase().includes(pageSearch.toLowerCase())).length === 0 && (
                      <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhuma página encontrada</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Seletor de Período */}
            <div className="date-picker" onClick={() => setShowDateMenu(!showDateMenu)} style={{ cursor: 'pointer', position: 'relative', userSelect: 'none' }}>
              <Calendar size={16} color="var(--text-secondary)" />
              <span>{selectedDateOption?.label}</span>
              <ChevronDown size={16} color="var(--text-secondary)" />
              {showDateMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: '#1e1e24', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '6px', zIndex: 100, minWidth: '200px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'dropdownFadeIn 0.2s ease-out' }}>
                  {dateOptions.map(opt => (
                    <div key={opt.value} onClick={(e) => { e.stopPropagation(); setDateRange(opt.value); setShowDateMenu(false); }}
                      style={{ padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: dateRange === opt.value ? 'var(--accent-color)' : 'var(--text-primary)', fontWeight: dateRange === opt.value ? '600' : '400', background: dateRange === opt.value ? 'rgba(99, 102, 241, 0.1)' : 'transparent', transition: 'all 0.15s' }}>
                      {opt.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {dashboardError && (
          <div style={{ margin: '32px 40px 0 40px', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger-color)', borderRadius: '12px', color: 'var(--danger-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontWeight: 600, fontSize: '15px' }}>Sem Dados de Origem (Aviso de API)</span>
            <span style={{ fontSize: '14px' }}>{dashboardError}</span>
          </div>
        )}

        <div className="dashboard">
          <div className="metrics-grid">
            <MetricCard title="Usuários Ao Vivo" value={realtimeUsers !== null ? realtimeUsers : '...'} icon={Activity} colorClass="icon-green" isLive={true} />
            <MetricCard title="Visitantes Únicos" value={umamiKpis?.visitors?.toLocaleString('pt-BR') || 0} change={`${parseFloat(umamiKpis?.visitorsChange || 0) > 0 ? '+' : ''}${umamiKpis?.visitorsChange || '0'}%`} trend={parseFloat(umamiKpis?.visitorsChange || 0) >= 0 ? "up" : "down"} icon={Users} colorClass="icon-blue" />
            <MetricCard title="Total de Sessões" value={umamiKpis?.visits?.toLocaleString('pt-BR') || 0} change={`${parseFloat(umamiKpis?.visitsChange || 0) > 0 ? '+' : ''}${umamiKpis?.visitsChange || '0'}%`} trend={parseFloat(umamiKpis?.visitsChange || 0) >= 0 ? "up" : "down"} icon={Activity} colorClass="icon-purple" />
            <MetricCard title="Taxa de Conversão" value={umamiKpis?.convRate || '0%'} change={null} trend="up" icon={TrendingUp} colorClass="icon-green" subValue='Leads / Visitantes Únicos' />
          </div>
          <div className="metrics-grid" style={{ marginTop: '16px' }}>
            <MetricCard title="Total de Leads" value={umamiKpis?.totalLeads?.toLocaleString('pt-BR') || 0} change={`${parseFloat(umamiKpis?.leadsChange || 0) > 0 ? '+' : ''}${umamiKpis?.leadsChange || '0'}%`} trend={parseFloat(umamiKpis?.leadsChange || 0) >= 0 ? "up" : "down"} icon={TrendingUp} colorClass="icon-green" subValue='Eventos c/ "lead"' />
            <MetricCard title="Tempo Médio" value={umamiKpis?.avgTime || '00:00'} change={`${parseFloat(umamiKpis?.avgTimeChange || 0) > 0 ? '+' : ''}${umamiKpis?.avgTimeChange || '0'}%`} trend={parseFloat(umamiKpis?.avgTimeChange || 0) >= 0 ? "up" : "down"} icon={Clock} colorClass="icon-purple" />
            <MetricCard title="Pageviews" value={umamiKpis?.pageviews?.toLocaleString('pt-BR') || 0} change={`${parseFloat(umamiKpis?.pageviewsChange || 0) > 0 ? '+' : ''}${umamiKpis?.pageviewsChange || '0'}%`} trend={parseFloat(umamiKpis?.pageviewsChange || 0) >= 0 ? "up" : "down"} icon={BarChart3} colorClass="icon-blue" />
          </div>

          {/* ===== Sessões vs Leads + Funil ===== */}
          <div className="charts-grid" style={{ display: 'none' }}>
            {/* Linha: Sessões vs Leads */}
            <div className="glass-card">
              <div className="card-title-row">
                <span className="card-title">Sessões vs Leads (Linha do Tempo)</span>
              </div>
              <div style={{ height: '300px', width: '100%', position: 'relative' }}>
                {isLoading ? (
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}><div className="loader" /></div>
                ) : trafficLeadsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trafficLeadsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gSess" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} dy={8} />
                      <YAxis yAxisId="left" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line yAxisId="left" type="monotone" dataKey="sessions" name="Sessões" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="leads" name="Leads" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                    Sem dados. Verifique se o evento "lead" está configurado no GA4.
                  </div>
                )}
              </div>
            </div>

            {/* Funil Visual */}
            <div className="glass-card">
              <div className="card-title-row"><span className="card-title">Funil de Conversão</span></div>
              <div style={{ padding: '8px 0' }}>
                {funnelData.length > 0 ? funnelData.map((step, i) => {
                  const prev = i === 0 ? step.value : funnelData[i - 1].value;
                  const pct = prev > 0 ? ((step.value / funnelData[0].value) * 100).toFixed(0) : 0;
                  const dropPct = i > 0 && prev > 0 ? (((prev - step.value) / prev) * 100).toFixed(0) : null;
                  return (
                    <div key={i} style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{step.name}{step.estimated ? ' *' : ''}</span>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          {dropPct && <span style={{ fontSize: '11px', color: '#ef4444' }}>-{dropPct}%</span>}
                          <span style={{ fontSize: '13px', fontWeight: 700, color: step.color }}>{step.value.toLocaleString('pt-BR')}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '36px', textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </div>
                      <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: step.color, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  );
                }) : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando funil...</div>}
                {funnelData.some(s => s.estimated) && <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '8px' }}>* Valores estimados (eventos não rastreados)</div>}
              </div>
            </div>
          </div>

          {/* ===== Tráfego original + Canais ===== */}
          <div className="charts-grid">
            <div className="glass-card">
              <div className="card-title-row"><span className="card-title">Sessões vs Leads (UMAMI)</span></div>
              <div style={{ height: '280px', width: '100%', position: 'relative' }}>
                {umamiLoading ? (
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}><div className="loader" style={{ borderColor: 'rgba(59,130,246,0.3)', borderTopColor: '#3b82f6' }} /></div>
                ) : umamiTimeseries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={umamiTimeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorAna" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                        <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.5} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
                      <YAxis yAxisId="left" stroke="var(--text-secondary)" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" stroke="#10b981" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area yAxisId="left" type="monotone" dataKey="sessions" name="Sessões" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAna)" />
                      <Area yAxisId="right" type="monotone" dataKey="leads" name="Leads" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorLeads)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Nenhum dado do Umami.</div>
                )}
              </div>
            </div>

            <div className="glass-card">
              <div className="card-title-row"><span className="card-title">Canais de Origem (UMAMI)</span></div>
              <div style={{ height: '280px', width: '100%' }}>
                {umamiReferrers.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={umamiReferrers.slice(0, 8).map(r => ({ name: r.x || '(direct)', value: r.y }))} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="value" name="Acessos" radius={[0, 4, 4, 0]} barSize={20}>
                        {umamiReferrers.slice(0, 8).map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Nenhum dado do Umami.</div>}
              </div>
            </div>
          </div>

          {/* ===== NOVA LINHA: Eventos + Dispositivos ===== */}
          <div className="charts-grid">
            <div className="glass-card" style={{ display: 'none' }}>
              <div className="card-title-row"><span className="card-title">Eventos (GA4)</span></div>
              <div style={{ height: '300px', width: '100%' }}>
                {eventsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={eventsData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="count" name="Eventos" radius={[0, 4, 4, 0]} barSize={16}>
                        {eventsData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Sem dados de eventos.</div>}
              </div>
            </div>

            <div className="glass-card">
              <div className="card-title-row"><span className="card-title">Sessões por Dispositivo (UMAMI)</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
                {umamiDevices.length > 0 ? (() => {
                  const total = umamiDevices.reduce((s, d) => s + (d.y || 0), 0);
                  return (
                    <>
                      <div style={{ width: '100%', height: '220px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={umamiDevices} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={5} dataKey="y" nameKey="x" stroke="none">
                              {umamiDevices.map((entry, i) => <Cell key={i} fill={DEVICE_COLORS[entry.x] || COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {umamiDevices.map((d, i) => {
                          const pct = total > 0 ? ((d.y / total) * 100).toFixed(1) : 0;
                          const DevIcon = d.x === 'mobile' ? Smartphone : d.x === 'desktop' ? Monitor : Tablet;
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <DevIcon size={14} color={DEVICE_COLORS[d.x] || COLORS[i % COLORS.length]} />
                              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{d.x}: <strong style={{ color: 'var(--text-primary)' }}>{pct}%</strong></span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })() : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Sem dados do Umami.</div>}
              </div>
            </div>
          </div>
          {/* ===== Conversão UTM / Campanha ===== */}
          <div className="glass-card" style={{ margin: '0' }}>
            <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <span className="card-title">Conversão por UTM / Campanha</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Evento:</span>
                <select 
                  value={selectedUmamiEvent}
                  onChange={e => setSelectedUmamiEvent(e.target.value)}
                  style={{ background: 'var(--surface-bg)', color: 'var(--text-primary)', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', outline: 'none' }}
                >
                  <option value="lead">Lead</option>
                  {(availableUmamiEvents || []).filter(ev => ev.toLowerCase() !== 'lead').map(ev => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              {umamiUtmData && umamiUtmData.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      {['FONTE', 'CAMPANHA', 'SESSÕES', selectedUmamiEvent.toUpperCase().substring(0, 15), 'TAXA CONV.'].map(h => (
                        <th key={h} style={{ textAlign: h === 'FONTE' || h === 'CAMPANHA' ? 'left' : 'right', padding: '12px 8px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {umamiUtmData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 8px', fontSize: '13px', fontWeight: 600 }}>{row.source}</td>
                        <td style={{ padding: '10px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{row.campaign}</td>
                        <td style={{ textAlign: 'right', padding: '10px 8px', fontSize: '13px' }}>{row.sessions.toLocaleString('pt-BR')}</td>
                        <td style={{ textAlign: 'right', padding: '10px 8px', fontSize: '13px', fontWeight: 700, color: '#10b981' }}>{row.leads}</td>
                        <td style={{ textAlign: 'right', padding: '10px 8px' }}>
                          <span style={{ background: parseFloat(row.rate) > 5 ? 'rgba(16,185,129,0.15)' : parseFloat(row.rate) > 2 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.1)', color: parseFloat(row.rate) > 5 ? '#10b981' : parseFloat(row.rate) > 2 ? '#f59e0b' : '#ef4444', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>{row.rate}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Sem dados de conversão UTM. Configure o evento "lead" no GA4 e use parâmetros UTM nos seus anúncios.</div>}
            </div>
          </div>

          {/* ===== Horas de Pico + Mobile vs Desktop Conversão ===== */}
          <div className="charts-grid">
            <div className="glass-card">
              <div className="card-title-row"><span className="card-title">Distribuição por Hora do Dia</span></div>
              <div style={{ height: '260px' }}>
                {umamiHourly && umamiHourly.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={umamiHourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                      <XAxis dataKey="hour" stroke="var(--text-secondary)" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                      <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="sessions" name="Sessões" radius={[3, 3, 0, 0]} barSize={14}>
                        {(umamiHourly || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                      <Bar dataKey="pageviews" name="Pageviews" radius={[3, 3, 0, 0]} barSize={8} fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Sem dados horários.</div>}
              </div>
            </div>

            <div className="glass-card">
              <div className="card-title-row"><span className="card-title">Conversão Mobile vs Desktop</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
                {umamiDevices && umamiDevices.length > 0 ? umamiDevices.map((d, i) => {
                  const DevIcon = d.x === 'mobile' ? Smartphone : d.x === 'desktop' ? Monitor : Tablet;
                  const color = DEVICE_COLORS[d.x] || COLORS[i % COLORS.length];
                  const rate = parseFloat(d.convRate);
                  return (
                    <div key={i} style={{ background: `${color}10`, border: `1px solid ${color}25`, borderRadius: '12px', padding: '14px 18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <DevIcon size={18} color={color} />
                          <span style={{ fontWeight: 600, fontSize: '14px', textTransform: 'capitalize' }}>{d.x}</span>
                        </div>
                        <span style={{ fontSize: '22px', fontWeight: 800, color }}>{d.convRate}%</span>
                      </div>
                      <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}>
                        <div style={{ height: '100%', width: `${Math.min(rate * 10, 100)}%`, background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <span>{(d.y || 0).toLocaleString('pt-BR')} sessões</span>
                        <span><strong style={{ color }}>{d.leads}</strong> leads</span>
                      </div>
                    </div>
                  );
                }) : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Sem dados de conversão por dispositivo.</div>}
              </div>
            </div>
          </div>

          {/* ===== NOVA LINHA: Navegadores + Mapa Países ===== */}
          <div className="charts-grid">
            <div className="glass-card">
              <div className="card-title-row"><span className="card-title">Navegadores</span></div>
              <div style={{ height: '300px', width: '100%' }}>
                {umamiBrowsers && umamiBrowsers.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={umamiBrowsers} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                      <XAxis dataKey="x" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="y" name="Sessões" radius={[4, 4, 0, 0]} barSize={28}>
                        {umamiBrowsers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Sem dados.</div>}
              </div>
            </div>

            <div className="glass-card">
              <div className="card-title-row"><span className="card-title">Mapa de Usuários por País</span></div>
              <div style={{ height: '300px', width: '100%', overflow: 'hidden', padding: '10px 0' }}>
                {umamiCountries && umamiCountries.length > 0 ? (() => {
                  const maxUsers = Math.max(...umamiCountries.map(c => c.y), 1);
                  const colorScale = scaleLinear().domain([0, maxUsers]).range(["rgba(59, 130, 246, 0.15)", "#3b82f6"]);

                  return (
                    <ComposableMap projectionConfig={{ scale: 140 }} style={{ width: '100%', height: '100%' }}>
                      <Geographies geography={geoUrl}>
                        {({ geographies }) =>
                          geographies.map((geo) => {
                            const d = umamiCountries.find(s => s.x === geo.properties.iso_a2 || s.x === geo.properties.iso_a3);
                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill={d ? colorScale(d.y) : "rgba(255,255,255,0.03)"}
                                stroke="var(--surface-border)"
                                strokeWidth={0.5}
                                style={{
                                  default: { outline: "none" },
                                  hover: { fill: "#10b981", outline: "none" },
                                  pressed: { outline: "none" }
                                }}
                              />
                            );
                          })
                        }
                      </Geographies>
                    </ComposableMap>
                  );
                })() : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Sem dados de países.</div>}
              </div>
            </div>
          </div>

          {/* ===== Ranking de Páginas ===== */}
          <div className="glass-card" style={{ margin: '0' }}>
            <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <span className="card-title">Ranking de Páginas</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Evento:</span>
                <select 
                  value={selectedUmamiEvent}
                  onChange={e => setSelectedUmamiEvent(e.target.value)}
                  style={{ background: 'var(--surface-bg)', color: 'var(--text-primary)', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', outline: 'none' }}
                >
                  <option value="lead">Lead</option>
                  {(availableUmamiEvents || []).filter(ev => ev.toLowerCase() !== 'lead').map(ev => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              {umamiTopUrls && umamiTopUrls.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>#</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>PÁGINA</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>VISUALIZAÇÕES</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{selectedUmamiEvent.toUpperCase().substring(0, 15)}</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>CONVERSÃO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {umamiTopUrls.map((page, i) => {
                      const maxViews = umamiTopUrls[0]?.y || 1;
                      const pct = ((page.y / maxViews) * 100).toFixed(0);
                      const rate = parseFloat(page.convRate);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '12px 8px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>{page.x}</div>
                            <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(99, 102, 241, 0.15)', width: '100%' }}>
                              <div style={{ height: '100%', borderRadius: '2px', background: COLORS[i % COLORS.length], width: `${pct}%`, transition: 'width 0.5s ease' }}></div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', padding: '12px 8px', fontSize: '14px', fontWeight: 600 }}>{page.y.toLocaleString('pt-BR')}</td>
                          <td style={{ textAlign: 'right', padding: '12px 8px', fontSize: '13px', fontWeight: 700, color: '#10b981' }}>{page.leads}</td>
                          <td style={{ textAlign: 'right', padding: '12px 8px' }}>
                            <span style={{ background: rate > 5 ? 'rgba(16,185,129,0.15)' : rate > 2 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.1)', color: rate > 5 ? '#10b981' : rate > 2 ? '#f59e0b' : '#ef4444', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>{page.convRate}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Sem dados de páginas.</div>}
            </div>
          </div>

        </div >
      </main >}

      {/* ===== ABA: ANALYTICS BASE (UMAMI) ===== */}
      {
        activeNav === 'analytics' && <main className="main-content">
          <header className="header">
            <div className="header-title">
              <h1>Analytics Base</h1>
              <p>{umamiConfigured ? `Dados precisos via Umami — sem sampling, sem ad blockers` : 'Configure o Umami para ver dados detalhados'}</p>
            </div>
            <div className="header-actions">
              {umamiConfigured && (
                <div className="date-picker" style={{ background: selectedUmamiWebsite ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', cursor: 'default', userSelect: 'none', marginRight: '8px' }}>
                  <BarChart3 size={16} color={selectedUmamiWebsite ? "#10b981" : "#ef4444"} />
                  <span style={{ color: selectedUmamiWebsite ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {selectedUmamiWebsite ? selectedUmamiWebsite.name : 'Nenhum site vinculado'}
                  </span>
                </div>
              )}
              <div className="date-picker" onClick={() => setShowDateMenu(!showDateMenu)} style={{ cursor: 'pointer', position: 'relative', userSelect: 'none' }}>
                <Calendar size={16} color="var(--text-secondary)" />
                <span>{selectedDateOption?.label}</span>
                <ChevronDown size={16} color="var(--text-secondary)" />
                {showDateMenu && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: '#1e1e24', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '6px', zIndex: 100, minWidth: '200px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'dropdownFadeIn 0.2s ease-out' }}>
                    {dateOptions.map(opt => (
                      <div key={opt.value} onClick={e => { e.stopPropagation(); setDateRange(opt.value); setShowDateMenu(false); }}
                        style={{ padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: dateRange === opt.value ? 'var(--accent-color)' : 'var(--text-primary)', fontWeight: dateRange === opt.value ? 700 : 400, background: dateRange === opt.value ? 'rgba(99,102,241,0.1)' : 'transparent' }}>
                        {opt.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </header>

          {!umamiConfigured ? (
            <div className="dashboard">
              <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
                <div style={{ fontSize: '52px', marginBottom: '16px' }}>📊</div>
                <div style={{ fontWeight: 700, fontSize: '20px', marginBottom: '8px' }}>Umami não configurado</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 24px', lineHeight: '1.7' }}>
                  Preencha <code style={{ background: 'var(--surface-bg)', padding: '2px 6px', borderRadius: '4px' }}>UMAMI_URL</code>, <code style={{ background: 'var(--surface-bg)', padding: '2px 6px', borderRadius: '4px' }}>UMAMI_USERNAME</code> e <code style={{ background: 'var(--surface-bg)', padding: '2px 6px', borderRadius: '4px' }}>UMAMI_PASSWORD</code> no arquivo <code style={{ background: 'var(--surface-bg)', padding: '2px 6px', borderRadius: '4px' }}>server/.env</code>.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', maxWidth: '680px', margin: '0 auto' }}>
                  {[
                    { icon: '🚫', title: 'Sem ad blockers', desc: 'Não é bloqueado por extensões de privacidade' },
                    { icon: '🍪', title: 'Sem cookies', desc: 'Compliance com LGPD — sem consent banner' },
                    { icon: '📈', title: 'Sem sampling', desc: '100% dos dados reais, sem amostragem' },
                    { icon: '🔒', title: 'Self-hosted', desc: 'Seus dados no seu servidor' },
                  ].map((f, i) => (
                    <div key={i} style={{ background: 'var(--surface-bg)', borderRadius: '12px', padding: '16px', border: '1px solid var(--surface-border)', textAlign: 'left' }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{f.icon}</div>
                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{f.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : !selectedUmamiWebsite ? (
            <div className="dashboard">
              <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
                <div style={{ fontSize: '52px', marginBottom: '16px' }}>🔗</div>
                <div style={{ fontWeight: 700, fontSize: '20px', marginBottom: '8px' }}>Projeto sem Umami vinculado</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 24px', lineHeight: '1.7' }}>
                  Este projeto ({selectedProjeto?.nome}) ainda não possui um <code style={{ background: 'var(--surface-bg)', padding: '2px 6px', borderRadius: '4px' }}>Umami Website ID</code> configurado.
                </div>
                <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '16px', borderRadius: '12px', display: 'inline-block', textAlign: 'left', maxWidth: '400px' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>Como resolver:</p>
                  <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <li style={{ marginBottom: '6px' }}>Vá na aba <strong>Admin</strong></li>
                    <li style={{ marginBottom: '6px' }}>Encontre este projeto e clique em editar (✏️)</li>
                    <li>Cole o UUID do site que está no painel do Umami</li>
                  </ol>
                </div>
              </div>
            </div>
          ) : (
            <div className="dashboard">
              {/* KPI Cards */}
              <div className="metrics-grid">
                {umamiLoading ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="glass-card metric-card" style={{ opacity: 0.4 }}>
                    <div className="metric-header"><span className="metric-title">Carregando...</span></div>
                    <span className="metric-value">—</span>
                  </div>
                )) : umamiKpis ? (
                  <>
                    <div className="glass-card metric-card">
                      <div className="metric-header"><span className="metric-title">Visitantes Únicos</span><div className="metric-icon icon-blue"><Users size={20} /></div></div>
                      <span className="metric-value">{umamiKpis.visitors?.toLocaleString('pt-BR')}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px' }}>
                        {parseFloat(umamiKpis.visitorsChange) >= 0 ? <ArrowUpRight size={14} color="#10b981" /> : <ArrowDownRight size={14} color="#ef4444" />}
                        <span style={{ color: parseFloat(umamiKpis.visitorsChange) >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{umamiKpis.visitorsChange}%</span>
                        <span style={{ color: 'var(--text-secondary)' }}>vs anterior</span>
                      </div>
                    </div>
                    <div className="glass-card metric-card">
                      <div className="metric-header"><span className="metric-title">Total de Sessões</span><div className="metric-icon icon-purple"><Activity size={20} /></div></div>
                      <span className="metric-value">{umamiKpis.visits?.toLocaleString('pt-BR')}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px' }}>
                        {parseFloat(umamiKpis.visitsChange) >= 0 ? <ArrowUpRight size={14} color="#10b981" /> : <ArrowDownRight size={14} color="#ef4444" />}
                        <span style={{ color: parseFloat(umamiKpis.visitsChange) >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{umamiKpis.visitsChange}%</span>
                        <span style={{ color: 'var(--text-secondary)' }}>vs anterior</span>
                      </div>
                    </div>
                    <div className="glass-card metric-card">
                      <div className="metric-header"><span className="metric-title">Total de Leads</span><div className="metric-icon icon-green"><TrendingUp size={20} /></div></div>
                      <span className="metric-value" style={{ color: '#10b981' }}>{umamiKpis.totalLeads?.toLocaleString('pt-BR')}</span>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>Eventos com "lead" no nome</div>
                    </div>
                    <div className="glass-card metric-card">
                      <div className="metric-header"><span className="metric-title">Taxa de Conversão</span><div className="metric-icon icon-orange"><Gauge size={20} /></div></div>
                      <span className="metric-value" style={{ color: '#f59e0b' }}>{umamiKpis.convRate}</span>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>Leads / Visitantes Únicos</div>
                    </div>
                    <div className="glass-card metric-card">
                      <div className="metric-header"><span className="metric-title">Tempo Médio</span><div className="metric-icon icon-purple"><Clock size={20} /></div></div>
                      <span className="metric-value">{umamiKpis.avgTime}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px' }}>
                        {parseFloat(umamiKpis.avgTimeChange) >= 0 ? <ArrowUpRight size={14} color="#10b981" /> : <ArrowDownRight size={14} color="#ef4444" />}
                        <span style={{ color: parseFloat(umamiKpis.avgTimeChange) >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{umamiKpis.avgTimeChange}%</span>
                        <span style={{ color: 'var(--text-secondary)' }}>vs anterior</span>
                      </div>
                    </div>
                    <div className="glass-card metric-card">
                      <div className="metric-header"><span className="metric-title">Pageviews</span><div className="metric-icon icon-blue"><BarChart3 size={20} /></div></div>
                      <span className="metric-value">{umamiKpis.pageviews?.toLocaleString('pt-BR')}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px' }}>
                        {parseFloat(umamiKpis.pageviewsChange) >= 0 ? <ArrowUpRight size={14} color="#10b981" /> : <ArrowDownRight size={14} color="#ef4444" />}
                        <span style={{ color: parseFloat(umamiKpis.pageviewsChange) >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{umamiKpis.pageviewsChange}%</span>
                        <span style={{ color: 'var(--text-secondary)' }}>vs anterior</span>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Timeseries + Referrers */}
              <div className="charts-grid">
                <div className="glass-card">
                  <div className="card-title-row"><span className="card-title">Sessões vs Pageviews (Umami)</span></div>
                  <div style={{ height: '280px' }}>
                    {Array.isArray(umamiTimeseries) && umamiTimeseries.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={umamiTimeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gPVU" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                            <linearGradient id="gSsU" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                          <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" dataKey="pageviews" name="Pageviews" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#gPVU)" />
                          <Area type="monotone" dataKey="sessions" name="Sessões" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#gSsU)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Sem dados.</div>}
                  </div>
                </div>
                <div className="glass-card">
                  <div className="card-title-row"><span className="card-title">Canais de Origem (Referrers)</span></div>
                  <div style={{ height: '280px' }}>
                    {umamiReferrers.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={umamiReferrers.slice(0, 8).map(r => ({ name: r.x || '(direct)', value: r.y }))} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                          <Bar dataKey="value" name="Sessões" radius={[0, 4, 4, 0]} barSize={18}>
                            {umamiReferrers.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Sem dados.</div>}
                  </div>
                </div>
              </div>

              {/* Distribuição Horária + Dispositivos */}
              <div className="charts-grid">
                <div className="glass-card">
                  <div className="card-title-row"><span className="card-title">Distribuição por Hora do Dia</span></div>
                  <div style={{ height: '260px' }}>
                    {umamiHourly.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={umamiHourly} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                          <XAxis dataKey="hour" stroke="var(--text-secondary)" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
                          <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                          <Bar dataKey="pageviews" name="Pageviews" radius={[3, 3, 0, 0]} barSize={13}>
                            {umamiHourly.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Sem dados horários.</div>}
                  </div>
                </div>
                <div className="glass-card">
                  <div className="card-title-row"><span className="card-title">Sessões por Dispositivo</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
                    {umamiDevices.length > 0 ? (() => {
                      const total = umamiDevices.reduce((s, d) => s + (d.y || 0), 0);
                      return umamiDevices.map((d, i) => {
                        const pct = total > 0 ? ((d.y / total) * 100).toFixed(1) : 0;
                        const DevIcon = d.x === 'mobile' ? Smartphone : d.x === 'desktop' ? Monitor : Tablet;
                        const color = COLORS[i % COLORS.length];
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <DevIcon size={18} color={color} style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'capitalize' }}>{d.x}</span>
                                <span style={{ fontSize: '13px', color }}>{d.y?.toLocaleString('pt-BR')} <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>({pct}%)</span></span>
                              </div>
                              <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })() : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Sem dados.</div>}
                  </div>
                </div>
              </div>

              {/* Ranking de Páginas */}
              <div className="glass-card" style={{ margin: 0 }}>
                <div className="card-title-row"><span className="card-title">Ranking de Páginas</span></div>
                <div style={{ overflowX: 'auto' }}>
                  {umamiTopUrls.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                          {['URL', 'PAGEVIEWS', 'CONVERSÕES'].map(h => <th key={h} style={{ textAlign: h === 'URL' ? 'left' : 'right', padding: '12px 8px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.5px' }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {umamiTopUrls.map((url, i) => {
                          const leadsForUrl = umamiLeadEvents.filter(e => e.urlPath === url.x).length;
                          const convUrl = url.y > 0 ? ((leadsForUrl / url.y) * 100).toFixed(1) + '%' : '—';
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '10px 8px', fontSize: '12px', fontFamily: 'monospace', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <div style={{ marginBottom: '4px' }}>{url.x}</div>
                                <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(99,102,241,0.12)' }}>
                                  <div style={{ height: '100%', width: `${((url.y / (umamiTopUrls[0]?.y || 1)) * 100).toFixed(0)}%`, background: '#6366f1', borderRadius: '2px' }} />
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', padding: '10px 8px', fontSize: '14px', fontWeight: 700 }}>{url.y?.toLocaleString('pt-BR')}</td>
                              <td style={{ textAlign: 'right', padding: '10px 8px' }}>
                                {leadsForUrl > 0 ? <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>{leadsForUrl} ({convUrl})</span>
                                  : <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Sem dados de páginas.</div>}
                </div>
              </div>

              {/* Heatmap Semanal */}
              {umamiWeekly && (
                <div className="glass-card" style={{ margin: 0 }}>
                  <div className="card-title-row"><span className="card-title">Heatmap Semanal de Atividade</span></div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Intensidade de sessões por hora e dia da semana</div>
                  <UmamiWeeklyHeatmap data={umamiWeekly} />
                </div>
              )}

              {/* Países */}
              {umamiCountries.length > 0 && (
                <div className="glass-card" style={{ margin: 0 }}>
                  <div className="card-title-row"><span className="card-title">Usuários por País</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {umamiCountries.slice(0, 10).map((c, i) => {
                      const pct = umamiCountries[0]?.y > 0 ? ((c.y / umamiCountries[0].y) * 100).toFixed(0) : 0;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', minWidth: '30px' }}>{c.x}</span>
                          <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: COLORS[i % COLORS.length], borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 700, minWidth: '50px', textAlign: 'right' }}>{c.y?.toLocaleString('pt-BR')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      }

      {/* ===== ABA: MAPAS DE CALOR (CLARITY) ===== */}
      {
        activeNav === 'clarity' && <main className="main-content">
          <header className="header">
            <div className="header-title">
              <h1>Mapas de Calor & Comportamento</h1>
              <p>Dados de comportamento real via Microsoft Clarity</p>
            </div>
          </header>
          <div className="dashboard">
            {/* Métricas de comportamento do Clarity */}
            <div className="metrics-grid">
              <div className="glass-card metric-card">
                <div className="metric-header">
                  <span className="metric-title">Rage Clicks</span>
                  <div className="metric-icon icon-orange"><MousePointer2 size={20} /></div>
                </div>
                <span className="metric-value">{rageClickData.rageClicks}</span>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>Usuários frustrados clicando repetidamente</div>
              </div>
              <div className="glass-card metric-card">
                <div className="metric-header">
                  <span className="metric-title">Dead Clicks</span>
                  <div className="metric-icon icon-purple"><MousePointerClick size={20} /></div>
                </div>
                <span className="metric-value">{rageClickData.deadClicks}</span>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>Cliques em elementos não interativos</div>
              </div>
              <div className="glass-card metric-card">
                <div className="metric-header">
                  <span className="metric-title">Scroll Excessivo</span>
                  <div className="metric-icon icon-blue"><Zap size={20} /></div>
                </div>
                <span className="metric-value">{rageClickData.excessiveScrolling}</span>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>Usuários com scroll excessivo na página</div>
              </div>
              <div className="glass-card metric-card">
                <div className="metric-header">
                  <span className="metric-title">Usuários (Clarity)</span>
                  <div className="metric-icon icon-green"><Users size={20} /></div>
                </div>
                <span className="metric-value">{metrics.activeUsersClarity}</span>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>Sessões registradas pelo Clarity</div>
              </div>
            </div>

            {/* Link para o Clarity + explicação */}
            <div className="glass-card" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MonitorPlay size={24} color="#3b82f6" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>Gravações de Sessão e Mapas de Calor</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Assista a gravações reais de usuários e visualize mapas de calor diretamente no painel do Clarity.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                {[
                  { icon: '🎥', title: 'Gravações de Sessão', desc: 'Assista à jornada real de cada usuário na sua página' },
                  { icon: '🔥', title: 'Heatmaps de Clique', desc: 'Veja onde os usuários mais clicam na página' },
                  { icon: '📜', title: 'Heatmaps de Scroll', desc: 'Identifique até onde os usuários chegam na página' },
                  { icon: '⚡', title: 'Comportamento de UX', desc: 'Rage clicks, dead clicks e scroll excessivo' },
                ].map((item, i) => (
                  <div key={i} style={{ background: 'var(--surface-bg)', borderRadius: '10px', padding: '14px', border: '1px solid var(--surface-border)' }}>
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>{item.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{item.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.desc}</div>
                  </div>
                ))}
              </div>
              {selectedProjeto?.clarity_project_id ? (
                <a
                  href={`https://clarity.microsoft.com/projects/view/${selectedProjeto.clarity_project_id}/heatmaps`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--accent-color)', borderRadius: '10px', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '14px', transition: 'opacity 0.2s' }}
                  onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseOut={e => e.currentTarget.style.opacity = '1'}
                >
                  <MonitorPlay size={18} /> Abrir Clarity Dashboard →
                </a>
              ) : (
                <div style={{ padding: '14px 18px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', fontSize: '13px', color: '#f59e0b' }}>
                  ⚠️ Clarity Project ID não configurado para este projeto. Configure no painel Admin → Projetos.
                </div>
              )}
            </div>

            {/* Resumo de insights de comportamento */}
            <div className="glass-card" style={{ padding: '24px' }}>
              <div className="card-title-row"><span className="card-title">💡 Insights de Comportamento</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                {[
                  rageClickData.rageClicks !== '—' && rageClickData.rageClicks > 0 && {
                    color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)',
                    icon: '⚠️', text: `${rageClickData.rageClicks} rage clicks detectados — usuários estão ficando frustrados com algo na página. Verifique botões com delays de resposta.`
                  },
                  rageClickData.deadClicks !== '—' && rageClickData.deadClicks > 0 && {
                    color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)',
                    icon: '🎯', text: `${rageClickData.deadClicks} dead clicks — usuários clicam em elementos que não são clicáveis. Considere tornar esses elementos interativos ou melhorar clareza visual.`
                  },
                  { color: '#6366f1', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.2)', icon: '📊', text: 'Use as gravações de sessão para identificar onde os usuários abandonam o formulário ou não encontram o botão de CTA.' },
                  { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', icon: '🔥', text: 'Combine os dados do mapa de calor de scroll com a taxa de conversão para saber se o CTA está visível para mais de 50% dos visitantes.' },
                ].filter(Boolean).map((insight, i) => (
                  <div key={i} style={{ padding: '14px 16px', background: insight.bg, border: `1px solid ${insight.border}`, borderRadius: '10px', fontSize: '13px', color: insight.color, lineHeight: '1.5' }}>
                    {insight.icon} {insight.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      }
    </>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        if (!isSupabaseReady()) throw new Error("Supabase is not configured.");
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const { data: clientData } = await supabase
            .from('clientes_dashboard')
            .select('nome, google_property_id, clarity_project_id, clarity_token')
            .eq('user_id', session.user.id)
            .single();

          if (clientData) {
            setCurrentUser({
              id: session.user.id,
              email: session.user.email,
              nome: clientData.nome,
              ga4PropertyId: clientData.google_property_id,
              clarityProjectId: clientData.clarity_project_id,
              clarityToken: clientData.clarity_token
            });
          }
        }
      } catch (err) {
        console.warn("Sessão não existe ou expirou.");
      } finally {
        setIsInitializing(false);
      }
    };
    checkSession();
  }, []);

  const handleLogout = async () => {
    try {
      if (isSupabaseReady()) {
        await supabase.auth.signOut();
      }
    } catch (err) { }
    setCurrentUser(null);
  };

  if (isInitializing) {
    return <div className="login-container"><div className="loader"></div></div>;
  }

  return (
    <div className="app-container">
      {!currentUser ? (
        <LoginScreen onLogin={(user) => setCurrentUser(user)} />
      ) : (
        <DashboardScreen user={currentUser} onLogout={handleLogout} />
      )}
    </div>
  );
}

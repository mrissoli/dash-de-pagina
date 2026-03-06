import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart3, Users, Clock, MousePointerClick, Activity, ChevronDown, Calendar,
  LayoutDashboard, Settings, Bell, ArrowUpRight, ArrowDownRight,
  MonitorPlay, Flame, Mail, Lock, LogIn, Shield, Smartphone, Monitor, Tablet,
  FolderOpen, Plus, Pencil, Trash2, Check, X, ChevronRight, ShieldCheck
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Cell, PieChart, Pie
} from 'recharts';
import { supabase, isSupabaseReady } from './lib/supabase';

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
      const { data: clientData, error: dbError } = await supabase
        .from('clientes_dashboard')
        .select('nome, google_property_id, clarity_project_id, clarity_token')
        .eq('user_id', authData.user.id)
        .single();

      setIsLoading(false);

      if (dbError || !clientData) {
        setErrorMsg('Dashboard não configurado para esta conta nesta base.');
      } else {
        onLogin({
          id: authData.user.id,
          email: authData.user.email,
          nome: clientData.nome,
          ga4PropertyId: clientData.google_property_id,
          clarityProjectId: clientData.clarity_project_id,
          clarityToken: clientData.clarity_token
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
  const [activeTab, setActiveTab] = useState('clientes'); // 'clientes' | 'projetos'
  const [clientes, setClientes] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [selectedCliente, setSelectedCliente] = useState(null);

  // Estado do formulário de cliente
  const [showClienteForm, setShowClienteForm] = useState(false);
  const [clienteForm, setClienteForm] = useState({ nome: '', email: '', senha: '' });

  // Estado do formulário de projeto
  const [editingProjeto, setEditingProjeto] = useState(null);
  const [showProjetoForm, setShowProjetoForm] = useState(false);
  const [projetoForm, setProjetoForm] = useState({ nome: '', google_property_id: '', clarity_project_id: '', clarity_token: '', cliente_id: '' });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

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

  useEffect(() => { loadClientes(); loadProjetos(null); }, []);

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

  // ---- CRUD Projetos ----
  const openCreateProjeto = () => {
    setEditingProjeto(null);
    setProjetoForm({ nome: '', google_property_id: '', clarity_project_id: '', clarity_token: '', cliente_id: selectedCliente?.user_id || '' });
    setShowProjetoForm(true);
  };

  const openEditProjeto = (p) => {
    setEditingProjeto(p);
    setProjetoForm({ nome: p.nome, google_property_id: p.google_property_id, clarity_project_id: p.clarity_project_id || '', clarity_token: p.clarity_token || '', cliente_id: p.cliente_id });
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
        {[{ key: 'clientes', label: '👥 Clientes', count: clientes.length }, { key: 'projetos', label: '📁 Projetos', count: projetos.length }].map(tab => (
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
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      <span>📊 GA4: <code style={{ color: 'var(--accent-color)' }}>{p.google_property_id}</code></span>
                      {p.clarity_project_id && <span>🎯 Clarity: <code style={{ color: '#10b981' }}>{p.clarity_project_id}</code></span>}
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
  const isAdmin = user.id === ADMIN_USER_ID;
  const [activeNav, setActiveNav] = useState('dashboard');
  const [dateRange, setDateRange] = useState('7daysAgo');
  const [showDateMenu, setShowDateMenu] = useState(false);

  // Multi-projeto
  const [projetos, setProjetos] = useState([]);
  const [selectedProjeto, setSelectedProjeto] = useState(null);
  const [showProjetoMenu, setShowProjetoMenu] = useState(false);

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

  // Carrega lista de projetos do cliente
  useEffect(() => {
    const loadProjetos = async () => {
      try {
        const res = await fetch(`${API_BASE}/meus-projetos`, { credentials: 'include' });
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

        const [resMetrics, resTraffic, resSources, resEvents, resDevices, resBrowsers, resCountries, resTopPages] = await Promise.all([
          fetch(`${API_BASE}/metrics?${pid}${ct}${dr}${pp}`, { credentials: 'include' }),
          fetch(`${API_BASE}/traffic?${pid}${ct}${dr}${pp}`, { credentials: 'include' }),
          fetch(`${API_BASE}/sources?${pid}${dr}${pp}`, { credentials: 'include' }),
          fetch(`${API_BASE}/events?${pid}${dr}${pp}`, { credentials: 'include' }),
          fetch(`${API_BASE}/devices?${pid}${dr}${pp}`, { credentials: 'include' }),
          fetch(`${API_BASE}/browsers?${pid}${dr}${pp}`, { credentials: 'include' }),
          fetch(`${API_BASE}/countries?${pid}${dr}${pp}`, { credentials: 'include' }),
          fetch(`${API_BASE}/top-pages?${pid}${dr}`, { credentials: 'include' }),
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

        // Canais de origem
        if (resSources.ok) {
          const sData = await resSources.json();
          if (sData.success && sData.data) setSourcesData(sData.data);
        }
        // Eventos
        if (resEvents.ok) {
          const eData = await resEvents.json();
          if (eData.success && eData.data) setEventsData(eData.data);
        }
        // Dispositivos
        if (resDevices.ok) {
          const dData = await resDevices.json();
          if (dData.success && dData.data) setDevicesData(dData.data);
        }
        // Navegadores
        if (resBrowsers.ok) {
          const bData = await resBrowsers.json();
          if (bData.success && bData.data) setBrowsersData(bData.data);
        }
        // Países
        if (resCountries.ok) {
          const cData = await resCountries.json();
          if (cData.success && cData.data) setCountriesData(cData.data);
        }
        // Top páginas
        if (resTopPages.ok) {
          const tpData = await resTopPages.json();
          if (tpData.success && tpData.data) setTopPagesData(tpData.data);
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
          <div className={`nav-item ${activeNav === 'analytics' ? 'active' : ''}`} onClick={() => setActiveNav('analytics')}><BarChart3 size={18} /> Analytics Base</div>
          <div className={`nav-item ${activeNav === 'clarity' ? 'active' : ''}`} onClick={() => setActiveNav('clarity')}><MonitorPlay size={18} /> Mapas de Calor</div>
          {isAdmin && (
            <>
              <div className="nav-section-title" style={{ marginTop: '16px' }}>Administração</div>
              <div className={`nav-item ${activeNav === 'admin' ? 'active' : ''}`} onClick={() => setActiveNav('admin')} style={{ color: 'var(--accent-color)' }}><ShieldCheck size={18} /> Gerenciar Clientes</div>
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

      {activeNav !== 'admin' && <main className="main-content">
        <header className="header">
          <div className="header-title">
            <h1>{selectedProjeto?.nome || 'Visão Geral da Conta'}</h1>
            <p>Dados combinados de forma segura pelo Servidor</p>
          </div>
          <div className="header-actions">
            {/* Seletor de Projeto */}
            {projetos.length > 1 && (
              <div className="date-picker" onClick={() => setShowProjetoMenu(!showProjetoMenu)} style={{ cursor: 'pointer', position: 'relative', userSelect: 'none', marginRight: '8px' }}>
                <FolderOpen size={16} color="var(--text-secondary)" />
                <span>{selectedProjeto?.nome || 'Projeto'}</span>
                <ChevronDown size={16} color="var(--text-secondary)" />
                {showProjetoMenu && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '6px', zIndex: 100, minWidth: '220px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                    {projetos.map(p => (
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
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '8px', zIndex: 200, width: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
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
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '6px', zIndex: 100, minWidth: '200px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
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
            <MetricCard title="Total de Sessões (GA)" value={metrics.totalVisitsGA} change="-" trend="up" icon={Users} colorClass="icon-blue" />
            <MetricCard title="Taxa de Rejeição (GA)" value={metrics.bounceRateGA} change="-" trend="down" icon={MousePointerClick} colorClass="icon-orange" />
            <MetricCard title="Tempo Médio (GA)" value={metrics.avgTimeGA || '00:00'} change="-" trend="up" icon={Clock} colorClass="icon-purple" />
          </div>
          <div className="metrics-grid" style={{ marginTop: '16px' }}>
            <MetricCard title="Novos Usuários (GA)" value={metrics.newUsersGA} change="-" trend="up" icon={Users} colorClass="icon-blue" />
            <MetricCard title="Págs/Sessão (GA)" value={metrics.pagesPerSessionGA} change="-" trend="up" icon={LayoutDashboard} colorClass="icon-green" />
            <MetricCard title="Usuários (Clarity)" value={metrics.activeUsersClarity} change="-" trend="up" icon={MonitorPlay} colorClass="icon-orange" />
          </div>

          <div className="charts-grid">
            <div className="glass-card">
              <div className="card-title-row">
                <span className="card-title">Tráfego vs Interações Interativas</span>
              </div>
              <div style={{ height: '300px', width: '100%', position: 'relative' }}>
                {isLoading ? (
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                    <div className="loader" style={{ borderColor: 'rgba(59, 130, 246, 0.3)', borderTopColor: '#3b82f6' }}></div>
                  </div>
                ) : trafficData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trafficData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorAna" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                        <linearGradient id="colorCla" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
                      <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="analytics" name="Visitas (GA)" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAna)" />
                      <Area type="monotone" dataKey="clarity" name="Interações (Clarity)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorCla)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                    Nenhum dado de tráfego disponível nos últimos 7 dias.
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card">
              <div className="card-title-row">
                <span className="card-title">Canais de Origem</span>
              </div>
              <div style={{ height: '300px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourcesData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Bar dataKey="value" name="Acessos" radius={[0, 4, 4, 0]} barSize={20}>
                      {sourcesData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ===== NOVA LINHA: Eventos + Dispositivos ===== */}
          <div className="charts-grid">
            <div className="glass-card">
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
              <div className="card-title-row"><span className="card-title">Sessões por Dispositivo</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
                {devicesData.length > 0 ? (
                  <>
                    <div style={{ width: '100%', height: '220px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={devicesData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={5} dataKey="value" nameKey="name" stroke="none">
                            {devicesData.map((entry, i) => <Cell key={i} fill={DEVICE_COLORS[entry.name] || COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {devicesData.map((d, i) => {
                        const total = devicesData.reduce((s, x) => s + x.value, 0);
                        const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
                        const DevIcon = d.name === 'Mobile' ? Smartphone : d.name === 'Desktop' ? Monitor : Tablet;
                        const color = DEVICE_COLORS[d.name] || COLORS[i % COLORS.length];
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '10px', background: `${color}15`, border: `1px solid ${color}30` }}>
                            <DevIcon size={18} color={color} />
                            <div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{d.name}</div>
                              <div style={{ fontSize: '16px', fontWeight: 700, color }}>{pct}%</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{d.value.toLocaleString('pt-BR')} sess.</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : <div style={{ color: 'var(--text-secondary)', padding: '40px' }}>Sem dados de dispositivos.</div>}
              </div>
            </div>
          </div>

          {/* ===== NOVA LINHA: Navegadores + Mapa Países ===== */}
          <div className="charts-grid">
            <div className="glass-card">
              <div className="card-title-row"><span className="card-title">Navegadores</span></div>
              <div style={{ height: '300px', width: '100%' }}>
                {browsersData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={browsersData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="value" name="Sessões" radius={[4, 4, 0, 0]} barSize={28}>
                        {browsersData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Sem dados.</div>}
              </div>
            </div>

            <div className="glass-card">
              <div className="card-title-row"><span className="card-title">Mapa de Usuários por País</span></div>
              <div style={{ maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
                {countriesData.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--surface-border)', position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1 }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>PAÍS</th>
                        <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>USUÁRIOS</th>
                        <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>SESSÕES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countriesData.map((c, i) => {
                        const maxUsers = countriesData[0]?.users || 1;
                        const pct = ((c.users / maxUsers) * 100).toFixed(0);
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '10px 8px', fontSize: '13px', fontWeight: 500 }}>
                              {c.country}
                              <div style={{ marginTop: '4px', height: '3px', borderRadius: '2px', background: 'rgba(59, 130, 246, 0.15)', width: '100%' }}>
                                <div style={{ height: '100%', borderRadius: '2px', background: '#3b82f6', width: `${pct}%`, transition: 'width 0.5s ease' }}></div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', padding: '10px 8px', fontSize: '13px', fontWeight: 600 }}>{c.users}</td>
                            <td style={{ textAlign: 'right', padding: '10px 8px', fontSize: '13px', color: 'var(--text-secondary)' }}>{c.sessions}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Sem dados de países.</div>}
              </div>
            </div>
          </div>

          {/* ===== Ranking de Páginas ===== */}
          <div className="glass-card" style={{ margin: '0' }}>
            <div className="card-title-row"><span className="card-title">Ranking de Páginas</span></div>
            <div style={{ overflowX: 'auto' }}>
              {topPagesData.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>#</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>PÁGINA</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>VISUALIZAÇÕES</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>TEMPO MÉDIO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPagesData.map((page, i) => {
                      const maxViews = topPagesData[0]?.views || 1;
                      const pct = ((page.views / maxViews) * 100).toFixed(0);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '12px 8px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>{page.path}</div>
                            <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(99, 102, 241, 0.15)', width: '100%' }}>
                              <div style={{ height: '100%', borderRadius: '2px', background: COLORS[i % COLORS.length], width: `${pct}%`, transition: 'width 0.5s ease' }}></div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', padding: '12px 8px', fontSize: '14px', fontWeight: 600 }}>{page.views.toLocaleString('pt-BR')}</td>
                          <td style={{ textAlign: 'right', padding: '12px 8px', fontSize: '13px', color: 'var(--text-secondary)' }}>{page.time}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Sem dados de páginas.</div>}
            </div>
          </div>

        </div>
      </main>}
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

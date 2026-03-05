import React, { useState, useEffect } from 'react';
import {
  BarChart3, Users, Clock, MousePointerClick, Activity, ChevronDown, Calendar,
  LayoutDashboard, PieChart, Settings, Bell, ArrowUpRight, ArrowDownRight,
  MonitorPlay, Flame, Mail, Lock, LogIn, Shield
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Cell
} from 'recharts';
import { supabase } from './lib/supabase';

// --- MOCK DATA ---
const trafficData = [
  { name: 'Seg', analytics: 4000, clarity: 2400 },
  { name: 'Ter', analytics: 3000, clarity: 1398 },
  { name: 'Qua', analytics: 2000, clarity: 9800 },
  { name: 'Qui', analytics: 2780, clarity: 3908 },
  { name: 'Sex', analytics: 1890, clarity: 4800 },
  { name: 'Sáb', analytics: 2390, clarity: 3800 },
  { name: 'Dom', analytics: 3490, clarity: 4300 },
];

const sourcesData = [
  { name: 'Google Organic', value: 4000 },
  { name: 'Direct', value: 3000 },
  { name: 'Social (Insta)', value: 2000 },
  { name: 'Meta Ads', value: 2780 },
  { name: 'Referral', value: 1890 },
];

const topPages = [
  { path: '/', views: '12,492', time: '02:14', heat: 'Alta', trend: '+12%' },
  { path: '/produtos', views: '8,391', time: '01:45', heat: 'Média', trend: '+5%' },
  { path: '/carrinho', views: '3,211', time: '03:20', heat: 'Alta', trend: '-2%' },
  { path: '/blog/dicas', views: '2,904', time: '04:12', heat: 'Baixa', trend: '+18%' },
  { path: '/contato', views: '1,102', time: '00:54', heat: 'Baixa', trend: '0%' },
];

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'];

// --- COMPONENTS ---

const MetricCard = ({ title, value, change, trend, icon: Icon, colorClass, isLive }) => (
  <div className="glass-card metric-card">
    <div className="metric-header">
      <span className="metric-title">{title}</span>
      <div className={`metric-icon ${colorClass}`}>
        <Icon size={20} />
      </div>
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

    // Passo 1: Autenticar no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (authError) {
      setErrorMsg('Login inválido. Verifique suas credenciais.');
      setIsLoading(false);
      return;
    }

    // Passo 2: Buscar o Property ID / Dados customizados do Cliente na Tabela 'clientes_dashboard'
    const { data: clientData, error: dbError } = await supabase
      .from('clientes_dashboard')
      .select('nome, google_property_id, clarity_project_id')
      .eq('user_id', authData.user.id)
      .single();

    setIsLoading(false);

    if (dbError || !clientData) {
      setErrorMsg('Conta autenticada, mas perfil de Dashboard não encontrado no banco.');
      return;
    }

    // Passar para a Dashboard os IDs amarrados e ocultos
    onLogin({
      id: authData.user.id,
      name: clientData.nome,
      email: authData.user.email,
      ga4PropertyId: clientData.google_property_id,
      clarityProjectId: clientData.clarity_project_id
    });
  };

  return (
    <div className="login-container">
      <div className="login-card glass-card">
        <div className="login-header">
          <div className="login-logo-circle">
            <Activity size={32} color="var(--accent-color)" />
          </div>
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
              <input
                type="email"
                placeholder="cliente@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label>Senha</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? (
              <div className="loader"></div>
            ) : (
              <>
                Entrar no Dashboard
                <LogIn size={18} />
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <Shield size={14} />
          <span>Acesso seguro e criptografado</span>
        </div>
      </div>
    </div>
  );
}

function DashboardScreen({ user, onLogout }) {
  const [activeNav, setActiveNav] = useState('dashboard');

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Activity size={28} color="var(--accent-color)" />
          <span>MetricDash</span>
        </div>

        <div className="nav-menu">
          <div className="nav-section-title">Principal</div>
          <div className={`nav-item ${activeNav === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveNav('dashboard')}>
            <LayoutDashboard size={18} /> Resumo
          </div>
          <div className={`nav-item ${activeNav === 'analytics' ? 'active' : ''}`} onClick={() => setActiveNav('analytics')}>
            <BarChart3 size={18} /> Analytics Base
          </div>
          <div className={`nav-item ${activeNav === 'clarity' ? 'active' : ''}`} onClick={() => setActiveNav('clarity')}>
            <MonitorPlay size={18} /> Mapas de Calor
          </div>
        </div>

        {/* User Info no final da sidebar */}
        <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid var(--surface-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="user-profile">{user.name.charAt(0)}</div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: '600', fontSize: '14px' }}>{user.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user.email}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              marginTop: '16px', width: '100%', padding: '8px',
              background: 'transparent', border: '1px solid var(--surface-border)',
              color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.target.style.color = 'var(--text-primary)'; e.target.style.borderColor = 'var(--text-primary)'; }}
            onMouseOut={(e) => { e.target.style.color = 'var(--text-secondary)'; e.target.style.borderColor = 'var(--surface-border)'; }}
          >
            Sair da Conta
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="header">
          <div className="header-title">
            <h1>Visão Geral da Conta</h1>
            <p>Dados combinados: Google Analytics + Microsoft Clarity</p>
          </div>
          <div className="header-actions">
            <div className="date-picker">
              <Calendar size={16} color="var(--text-secondary)" />
              <span>Últimos 7 dias</span>
              <ChevronDown size={16} color="var(--text-secondary)" />
            </div>
            <div style={{ padding: '8px', cursor: 'pointer' }}><Bell size={20} color="var(--text-secondary)" /></div>
          </div>
        </header>

        <div className="dashboard">
          <div className="metrics-grid">
            <MetricCard title="Usuários Ativos (Clarity)" value="142" icon={Activity} colorClass="icon-green" isLive={true} />
            <MetricCard title="Total de Visitas (GA)" value="31,048" change="+14.5%" trend="up" icon={Users} colorClass="icon-blue" />
            <MetricCard title="Taxa de Rejeição (GA)" value="42.3%" change="-2.1%" trend="down" icon={MousePointerClick} colorClass="icon-orange" />
            <MetricCard title="Tempo Médio (Clarity)" value="02:34" change="+0:12" trend="up" icon={Clock} colorClass="icon-purple" />
          </div>

          <div className="charts-grid">
            <div className="glass-card">
              <div className="card-title-row">
                <span className="card-title">Tráfego vs Interações Interativas</span>
                <div className="badge-row">
                  <span className="badge badge-analytics">GA: Acessos</span>
                  <span className="badge badge-clarity">Clarity: Cliques/Scroll</span>
                </div>
              </div>
              <div style={{ height: '300px', width: '100%' }}>
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
              </div>
            </div>

            <div className="glass-card">
              <div className="card-title-row">
                <span className="card-title">Canais de Origem</span>
                <span className="badge badge-analytics">GA</span>
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

        </div>
      </main>
    </>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  // Verifica se o usuário já tem uma sessão salva no navegador no Load
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Se houver sessão, puxamos os ids da tabela e logamos ele transparentemente
        const { data: clientData } = await supabase
          .from('clientes_dashboard')
          .select('nome, google_property_id, clarity_project_id')
          .eq('user_id', session.user.id)
          .single();

        if (clientData) {
          setCurrentUser({
            id: session.user.id,
            name: clientData.nome,
            email: session.user.email,
            ga4PropertyId: clientData.google_property_id,
            clarityProjectId: clientData.clarity_project_id
          });
        }
      }
    };
    checkSession();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

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

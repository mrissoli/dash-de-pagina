import { createClient } from '@supabase/supabase-js';

// Em dev local: usa VITE_ env vars
// Em produção (Easypanel): usa window.__RUNTIME_CONFIG__ injetado pelo Express
function getConfig() {
    const rc = window.__RUNTIME_CONFIG__ || {};
    return {
        url: import.meta.env.VITE_SUPABASE_URL || rc.SUPABASE_URL || '',
        key: import.meta.env.VITE_SUPABASE_ANON_KEY || rc.SUPABASE_ANON_KEY || ''
    };
}

const { url, key } = getConfig();

// Cria um client dummy se não tem config (evita crash na inicialização)
export const supabase = (url && key)
    ? createClient(url, key)
    : null;

// Helper para verificar se o Supabase está configurado
export const isSupabaseReady = () => supabase !== null;

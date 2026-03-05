import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Cria um client dummy se não tem config (evita crash na inicialização)
export const supabase = (url && key)
    ? createClient(url, key)
    : null;

// Helper para verificar se o Supabase está configurado corretamente
export const isSupabaseReady = () => supabase !== null;

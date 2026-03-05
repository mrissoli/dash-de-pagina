import { createClient } from '@supabase/supabase-js';

// Tenta usar variáveis de build (dev local) ou runtime config (produção)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || window.__RUNTIME_CONFIG__?.SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || window.__RUNTIME_CONFIG__?.SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

import { createClient } from '@supabase/supabase-js';

// URL e Key do Supabase Project.
// Em ambiente de produção num app real (vite), estas variáveis viriam do .env via import.meta.env
// Para este momento de estrutura, declararemos aqui para serem substituídos depois.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sua-url-do-supabase.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sua-anon-key-publica';

export const supabase = createClient(supabaseUrl, supabaseKey);

require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAdmins() {
  const { data, error } = await supabaseAdmin.from('administradores').select('*').limit(1);
  console.log('administradores:', data, error ? error.message : null);
}
checkAdmins();

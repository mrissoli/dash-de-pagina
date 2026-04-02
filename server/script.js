require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supaUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseAdmin = createClient(supaUrl, supaKey);

async function run() {
  const { data, error } = await supabaseAdmin.from('clientes_dashboard').select('*').eq('user_id', 'c0a20ec2-cabc-4fd3-9e69-adf77bc19ecc').single();
  console.log('admin_in_clientes:', error ? error.message : 'OK ' + JSON.stringify(data));
}
run();

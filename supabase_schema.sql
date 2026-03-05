CREATE TABLE clientes_dashboard (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  google_property_id TEXT,
  clarity_project_id TEXT,
  clarity_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ativar RLS (Row Level Security) para segurança
ALTER TABLE clientes_dashboard ENABLE ROW LEVEL SECURITY;

-- Política de Segurança: O cliente (auth.uid) só pode ler seus PRÓPRIOS dados na tabela
CREATE POLICY "Clientes podem ver apenas os seus dados" 
ON clientes_dashboard
FOR SELECT 
USING (auth.uid() = user_id);

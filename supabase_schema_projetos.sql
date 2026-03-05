-- =====================================================
-- Execute este SQL no Supabase SQL Editor
-- Cria a tabela de projetos para suporte multi-analytics
-- =====================================================

CREATE TABLE IF NOT EXISTS projetos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  google_property_id TEXT NOT NULL,
  clarity_project_id TEXT,
  clarity_token TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca rápida por cliente
CREATE INDEX IF NOT EXISTS idx_projetos_cliente_id ON projetos(cliente_id);

-- Habilitar RLS (Row Level Security)
ALTER TABLE projetos ENABLE ROW LEVEL SECURITY;

-- Política: cliente só vê seus próprios projetos
CREATE POLICY "cliente_le_proprios_projetos"
  ON projetos FOR SELECT
  USING (cliente_id = auth.uid());

-- Política: service_role (backend) acessa tudo
-- (O backend usa SUPABASE_SERVICE_ROLE_KEY, então bypass RLS automático)

-- Adicionar coluna email na tabela clientes_dashboard se não existir
-- (Para o admin panel exibir o email do cliente)
ALTER TABLE clientes_dashboard ADD COLUMN IF NOT EXISTS email TEXT;

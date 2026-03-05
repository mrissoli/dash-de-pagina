-- =====================================================
-- Execute este SQL no Supabase SQL Editor
-- Cria a tabela de projetos para suporte multi-analytics
-- =====================================================

-- 1. Criar a tabela projetos
CREATE TABLE IF NOT EXISTS projetos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL,
  nome TEXT NOT NULL,
  google_property_id TEXT NOT NULL,
  clarity_project_id TEXT,
  clarity_token TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Índice para busca rápida por cliente
CREATE INDEX IF NOT EXISTS idx_projetos_cliente_id ON projetos(cliente_id);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE projetos ENABLE ROW LEVEL SECURITY;

-- 4. Política: cliente só vê seus próprios projetos
DROP POLICY IF EXISTS "cliente_le_proprios_projetos" ON projetos;
CREATE POLICY "cliente_le_proprios_projetos"
  ON projetos FOR SELECT
  USING (cliente_id = auth.uid());

-- 5. Adicionar coluna email na tabela clientes_dashboard se não existir
ALTER TABLE clientes_dashboard ADD COLUMN IF NOT EXISTS email TEXT;

-- 6. MIGRAÇÃO: copiar projetos existentes de clientes_dashboard para projetos
-- (só insere se a tabela projetos estiver vazia ou se o cliente ainda não tem projeto)
INSERT INTO projetos (cliente_id, nome, google_property_id, clarity_project_id, clarity_token, ativo)
SELECT
  c.user_id,
  COALESCE(c.nome, 'Projeto Principal') AS nome,
  c.google_property_id,
  c.clarity_project_id,
  c.clarity_token,
  true
FROM clientes_dashboard c
WHERE
  c.google_property_id IS NOT NULL
  AND c.google_property_id <> ''
  AND NOT EXISTS (
    SELECT 1 FROM projetos p WHERE p.cliente_id = c.user_id
  );

-- 7. Verificar resultado
SELECT
  c.nome AS cliente,
  c.email,
  p.nome AS projeto,
  p.google_property_id,
  p.clarity_project_id
FROM clientes_dashboard c
LEFT JOIN projetos p ON p.cliente_id = c.user_id
ORDER BY c.nome;

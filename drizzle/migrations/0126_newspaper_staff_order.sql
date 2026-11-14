-- A Folha Sem Selo: ordem manual da equipe da Redação (o Editor-Chefe arrasta; o jogador vê na mesma ordem).
-- Só acrescenta a coluna e numera as linhas existentes por nome. Aplicar depois da 0118. O commit GitHub não aplica SQL.
BEGIN;

ALTER TABLE public.campaign_newspaper_staff
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE public.campaign_newspaper_staff s SET sort_order = r.rn
  FROM (SELECT id, (row_number() OVER (ORDER BY lower(name), created_at) - 1) AS rn
          FROM public.campaign_newspaper_staff) r
 WHERE s.id = r.id
   AND NOT EXISTS (SELECT 1 FROM public.campaign_newspaper_staff x WHERE x.sort_order <> 0);

COMMIT;

-- A Folha Sem Selo: modelos de matéria personalizados, exclusão de edições do Arquivo
-- e reaproveitamento do número de edição apagada.
-- Aplicar depois de 0111, 0116, 0117 e 0118. O commit GitHub não aplica SQL.
BEGIN;

-- 1) Número de edição liberado: a nova edição recebe o menor número ainda livre.
CREATE OR REPLACE FUNCTION public.assign_newspaper_edition_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('campaign_newspapers_edition_no',0));
  SELECT g INTO NEW.edition_no
    FROM generate_series(1,(SELECT coalesce(max(n.edition_no),0)+1 FROM public.campaign_newspapers n)) g
   WHERE NOT EXISTS (SELECT 1 FROM public.campaign_newspapers n WHERE n.edition_no=g)
   ORDER BY g LIMIT 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assign_newspaper_edition_no_trigger ON public.campaign_newspapers;
CREATE TRIGGER assign_newspaper_edition_no_trigger BEFORE INSERT
  ON public.campaign_newspapers FOR EACH ROW
  EXECUTE FUNCTION public.assign_newspaper_edition_no();

-- 2) Excluir qualquer edição do Arquivo (só Editor-Chefe/Narrador). Apaga leituras e revisões;
--    pedidos de Casas já publicados nela continuam publicados, apenas sem o vínculo.
CREATE OR REPLACE FUNCTION public.delete_campaign_newspaper(p_newspaper uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_campaign_newspaper()
  THEN RAISE EXCEPTION 'Exclusão não autorizada'; END IF;
  PERFORM 1 FROM public.campaign_newspapers WHERE id=p_newspaper FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Edição não encontrada'; END IF;
  DELETE FROM public.campaign_newspaper_reads WHERE newspaper_id=p_newspaper;
  DELETE FROM public.campaign_newspaper_revisions WHERE newspaper_id=p_newspaper;
  UPDATE public.campaign_newspaper_commissions SET newspaper_id=NULL WHERE newspaper_id=p_newspaper;
  DELETE FROM public.campaign_newspapers WHERE id=p_newspaper;
END $$;
REVOKE ALL ON FUNCTION public.delete_campaign_newspaper(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_campaign_newspaper(uuid) TO authenticated;

-- 3) Modelos de matéria criados pelo Editor-Chefe (duplicar, renomear, editar).
CREATE TABLE IF NOT EXISTS public.campaign_newspaper_story_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(blocks)='array' AND jsonb_array_length(blocks) BETWEEN 1 AND 12),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_newspaper_story_models ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_newspaper_story_models FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_newspaper_story_models TO authenticated;
GRANT ALL ON public.campaign_newspaper_story_models TO service_role;
DROP POLICY IF EXISTS newspaper_story_models_all ON public.campaign_newspaper_story_models;
CREATE POLICY newspaper_story_models_all ON public.campaign_newspaper_story_models
  FOR ALL TO authenticated
  USING (public.can_edit_campaign_newspaper())
  WITH CHECK (public.can_edit_campaign_newspaper());

COMMIT;

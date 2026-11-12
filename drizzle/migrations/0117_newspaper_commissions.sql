-- A Folha Sem Selo: notícias contratadas pelas Casas (custo: 1 Riqueza permanente).
-- A Casa escreve o texto e envia uma imagem; o Editor-Chefe vê o pedido em "Anúncios",
-- edita e publica na edição. Ao publicar, o pedido sai das pendências (trigger no banco).
-- O Editor-Chefe pode recusar um pedido com nota; a Riqueza é devolvida e a Casa vê o motivo.
-- Rascunhos podem ser excluídos (RPC), liberando a edição para recomeçar.
-- Aplicar no Supabase de homologação DEPOIS de 0111 e 0116. O commit GitHub não aplica SQL.
-- O débito segue o mesmo padrão das compras de espionagem (0092): ficha travada, 1 ponto
-- permanente, lançamento no livro-caixa e chave de idempotência, tudo em uma transação.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_newspaper_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id text NOT NULL REFERENCES public.campaign_houses(id),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 180),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 10 AND 6000),
  image_path text CHECK (image_path IS NULL OR (
    image_path LIKE house_id || '/%' AND length(image_path) <= 300)),
  cost_wealth integer NOT NULL DEFAULT 1 CHECK (cost_wealth = 1),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','published','rejected')),
  rejection_note text CHECK (rejection_note IS NULL OR length(btrim(rejection_note)) BETWEEN 3 AND 1000),
  rejected_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id),
  request_key uuid NOT NULL UNIQUE,
  newspaper_id uuid REFERENCES public.campaign_newspapers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  seen_at timestamptz
);
ALTER TABLE public.campaign_newspaper_commissions ADD COLUMN IF NOT EXISTS seen_at timestamptz;
CREATE INDEX IF NOT EXISTS newspaper_commissions_pending_idx
  ON public.campaign_newspaper_commissions (created_at) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS newspaper_commissions_house_idx
  ON public.campaign_newspaper_commissions (house_id, created_at DESC);

ALTER TABLE public.campaign_newspaper_commissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_newspaper_commissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.campaign_newspaper_commissions TO authenticated;
GRANT ALL ON public.campaign_newspaper_commissions TO service_role;
DROP POLICY IF EXISTS newspaper_commissions_read ON public.campaign_newspaper_commissions;
-- Casa lê só os próprios pedidos; Editor-Chefe e Narrador leem todos. Escrita apenas pela RPC.
CREATE POLICY newspaper_commissions_read ON public.campaign_newspaper_commissions
  FOR SELECT TO authenticated
  USING (public.can_edit_campaign_newspaper() OR public.in_campaign_house(house_id,false));

-- Bucket privado para a imagem enviada pela Casa (o Editor-Chefe a copia para a edição).
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES ('campaign-newspaper-commissions','campaign-newspaper-commissions',false,5242880,
 ARRAY['image/png','image/jpeg','image/webp'])
 ON CONFLICT(id) DO NOTHING;
DROP POLICY IF EXISTS newspaper_commission_image_read ON storage.objects;
CREATE POLICY newspaper_commission_image_read ON storage.objects
 FOR SELECT TO authenticated
 USING (bucket_id='campaign-newspaper-commissions' AND (
   public.can_edit_campaign_newspaper()
   OR public.in_campaign_house(split_part(name,'/',1),false)));
DROP POLICY IF EXISTS newspaper_commission_image_upload ON storage.objects;
CREATE POLICY newspaper_commission_image_upload ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (bucket_id='campaign-newspaper-commissions'
   AND name ~ '^[A-Za-z0-9_-]+/[0-9a-f-]{36}\.(png|jpg|webp)$'
   AND (public.is_campaign_admin()
     OR public.in_campaign_house(split_part(name,'/',1),true)));

CREATE OR REPLACE FUNCTION public.newspaper_commission_story(
  p_house text,p_title text,p_body text,p_image_path text,p_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE
  v_h record;v_prev jsonb;v_next jsonb;v_id uuid;
  v_total integer;v_available integer;v_region_wealth integer:=0;
  v_allocated integer;v_units integer;v_consequences integer;v_destroyed integer;
  v_old_perm integer;v_title text:=btrim(coalesce(p_title,''));
  v_body text:=btrim(coalesce(p_body,''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
     NOT(public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
  THEN RAISE EXCEPTION 'Contratação de notícia não autorizada'; END IF;
  IF p_key IS NULL OR length(v_title) NOT BETWEEN 3 AND 180
     OR length(v_body) NOT BETWEEN 10 AND 6000
     OR (p_image_path IS NOT NULL AND p_image_path NOT LIKE p_house||'/%')
  THEN RAISE EXCEPTION 'Notícia inválida: informe título e texto'; END IF;

  -- Mesma trava do livro-caixa: impede disputa com outras compras da Casa.
  PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0));
  SELECT n.state,n.version INTO v_h FROM public.noble_house_sheets n
   WHERE n.house_id=p_house FOR UPDATE;
  IF NOT FOUND OR v_h.state->>'phase'<>'active'
  THEN RAISE EXCEPTION 'A Casa precisa de ficha ativa'; END IF;

  -- Idempotência: reenviar a mesma chave nunca debita Riqueza novamente.
  SELECT c.id INTO v_id FROM public.campaign_newspaper_commissions c
   WHERE c.request_key=p_key AND c.house_id=p_house;
  IF FOUND THEN
    RETURN jsonb_build_object('commissionId',v_id,'alreadyApplied',true,
      'houseVersion',v_h.version);
  END IF;
  IF EXISTS(SELECT 1 FROM public.campaign_newspaper_commissions c WHERE c.request_key=p_key)
     OR EXISTS(SELECT 1 FROM public.noble_house_ledger l
        WHERE l.house_id=p_house AND l.operation_key=p_key)
  THEN RAISE EXCEPTION 'Chave já utilizada em outra operação'; END IF;

  -- Limite por Casa: no máximo 3 pedidos aguardando publicação (evita lotar a redação).
  IF (SELECT count(*) FROM public.campaign_newspaper_commissions c
       WHERE c.house_id=p_house AND c.state='pending')>=3
  THEN RAISE EXCEPTION 'A Casa já tem 3 notícias aguardando publicação'; END IF;

  v_prev:=v_h.state;
  v_old_perm:=coalesce((v_prev#>>'{permanent,wealth}')::integer,0);
  -- Mesmo cálculo conservador de Riqueza disponível da compra de espionagem (0092).
  IF v_prev->>'regionalApplied'='true' AND v_prev->>'method'<>'import' THEN
    v_region_wealth:=CASE lower(replace(v_prev#>>'{identity,region}',' ',''))
      WHEN 'crownlands' THEN 10 WHEN 'veilstone' THEN 15 WHEN 'shieldmark' THEN 10
      WHEN 'helmlands' THEN 5 WHEN 'horselands' THEN 15 WHEN 'dragoncoast' THEN 20
      WHEN 'swordmarch' THEN 15 WHEN 'swordmark' THEN 15 WHEN 'ferlin' THEN 10
      WHEN 'stonelands' THEN 15 WHEN 'elfhold' THEN 15 WHEN 'volkumburgh' THEN 10
      ELSE 0 END;
  END IF;
  SELECT coalesce(sum((m->'changes'->>'wealth')::integer),0)::integer
    INTO v_consequences FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_prev->'mailConsequences')='array'
       THEN v_prev->'mailConsequences' ELSE '[]'::jsonb END) m
   WHERE m->>'active'='true';
  SELECT coalesce(sum(
    CASE WHEN jsonb_typeof(h->'allocatedCosts')='object' AND (h->'allocatedCosts' ? 'wealth')
    THEN (h->'allocatedCosts'->>'wealth')::integer
    ELSE (SELECT coalesce(sum((c->>'amount')::integer),0)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(h->'costs')='array'
       THEN h->'costs' ELSE '[]'::jsonb END) c
      WHERE c->>'resource'='wealth' AND c->>'mode'='allocation') END),0)::integer
    INTO v_allocated FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_prev->'holdings')='array'
       THEN v_prev->'holdings' ELSE '[]'::jsonb END) h
   WHERE h->>'status' IN('active','building');
  SELECT coalesce(sum(
    CASE WHEN jsonb_typeof(u->'allocatedCosts')='object' AND (u->'allocatedCosts' ? 'wealth')
    THEN (u->'allocatedCosts'->>'wealth')::integer
    ELSE (SELECT coalesce(sum((c->>'amount')::integer),0)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(u->'costs')='array'
       THEN u->'costs' ELSE '[]'::jsonb END) c
      WHERE c->>'resource'='wealth' AND c->>'mode'='allocation') END),0)::integer
    INTO v_units FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_prev->'units')='array'
       THEN v_prev->'units' ELSE '[]'::jsonb END) u
   WHERE coalesce(u->>'destroyed','false')<>'true';
  SELECT coalesce(sum(
    CASE WHEN jsonb_typeof(h->'allocatedCosts')='object' AND (h->'allocatedCosts' ? 'wealth')
    THEN (h->'allocatedCosts'->>'wealth')::integer
    ELSE (SELECT coalesce(sum((c->>'amount')::integer),0)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(h->'costs')='array'
       THEN h->'costs' ELSE '[]'::jsonb END) c
      WHERE c->>'resource'='wealth' AND c->>'mode'='allocation') END),0)::integer
    INTO v_destroyed FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_prev->'holdings')='array'
       THEN v_prev->'holdings' ELSE '[]'::jsonb END) h
   WHERE h->>'status'='destroyed' AND coalesce(h->>'lostAllocation','false')<>'true';

  v_total:=coalesce((v_prev#>>'{base,wealth}')::integer,0)+v_old_perm+
    v_region_wealth+v_consequences;
  v_available:=v_total-v_allocated-v_units-v_destroyed;
  IF v_available<1 THEN RAISE EXCEPTION 'Sem recursos: exige 1 ponto de Riqueza disponível'; END IF;

  v_next:=jsonb_set(v_prev,'{permanent,wealth}',to_jsonb(v_old_perm-1),false);
  UPDATE public.noble_house_sheets SET state=v_next,version=version+1,
    updated_by=auth.uid(),updated_at=now() WHERE house_id=p_house;
  INSERT INTO public.campaign_newspaper_commissions(
    house_id,requested_by,title,body,image_path,request_key
  ) VALUES(p_house,auth.uid(),v_title,v_body,p_image_path,p_key)
  RETURNING id INTO v_id;
  INSERT INTO public.noble_house_ledger(
    house_id,operation_key,actor,action,explanation,rule,campaign_month,
    before_state,after_state,version
  ) VALUES(
    p_house,p_key,auth.uid(),'newspaper_commission',
    'Notícia contratada em A Folha Sem Selo: '||v_title||' (−1 Riqueza).',
    'Cormyr: notícia contratada no jornal · custo permanente 1 Riqueza',
    (v_next->>'month')::integer,v_prev,v_next,v_h.version+1
  );
  RETURN jsonb_build_object('commissionId',v_id,'alreadyApplied',false,
    'houseVersion',v_h.version+1,'remainingWealthEstimate',v_available-1);
END $body$;
REVOKE ALL ON FUNCTION public.newspaper_commission_story(text,text,text,text,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.newspaper_commission_story(text,text,text,text,uuid)
  TO authenticated;

-- Recusa: só o Editor-Chefe/Narrador, só pedido pendente, com nota; devolve 1 Riqueza e lança no livro-caixa.
CREATE OR REPLACE FUNCTION public.newspaper_reject_commission(p_commission uuid,p_note text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE
  v_c record;v_h record;v_prev jsonb;v_next jsonb;
  v_note text:=btrim(coalesce(p_note,''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_campaign_newspaper()
  THEN RAISE EXCEPTION 'Recusa não autorizada'; END IF;
  IF length(v_note) NOT BETWEEN 3 AND 1000
  THEN RAISE EXCEPTION 'Escreva uma nota explicando a recusa'; END IF;
  SELECT * INTO v_c FROM public.campaign_newspaper_commissions WHERE id=p_commission;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||v_c.house_id,0));
  SELECT * INTO v_c FROM public.campaign_newspaper_commissions
   WHERE id=p_commission FOR UPDATE;
  IF v_c.state<>'pending' THEN RAISE EXCEPTION 'Este pedido já foi publicado ou recusado'; END IF;
  SELECT n.state,n.version INTO v_h FROM public.noble_house_sheets n
   WHERE n.house_id=v_c.house_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha da Casa indisponível'; END IF;
  v_prev:=v_h.state;
  v_next:=jsonb_set(v_prev,'{permanent,wealth}',
    to_jsonb(coalesce((v_prev#>>'{permanent,wealth}')::integer,0)+v_c.cost_wealth),false);
  UPDATE public.noble_house_sheets SET state=v_next,version=version+1,
    updated_by=auth.uid(),updated_at=now() WHERE house_id=v_c.house_id;
  UPDATE public.campaign_newspaper_commissions
     SET state='rejected',rejection_note=v_note,rejected_at=now(),rejected_by=auth.uid()
   WHERE id=p_commission;
  INSERT INTO public.noble_house_ledger(
    house_id,operation_key,actor,action,explanation,rule,campaign_month,
    before_state,after_state,version
  ) VALUES(
    v_c.house_id,gen_random_uuid(),auth.uid(),'newspaper_commission_refund',
    'Notícia recusada pelo Editor-Chefe: '||v_c.title||' (+1 Riqueza devolvida). Nota: '||v_note,
    'Cormyr: recusa de notícia contratada · devolução de 1 Riqueza',
    (v_next->>'month')::integer,v_prev,v_next,v_h.version+1
  );
  RETURN jsonb_build_object('commissionId',p_commission,'refunded',v_c.cost_wealth,
    'houseVersion',v_h.version+1);
END $body$;
REVOKE ALL ON FUNCTION public.newspaper_reject_commission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.newspaper_reject_commission(uuid,text) TO authenticated;

-- Excluir rascunho: somente edições ainda não publicadas. As revisões do rascunho são
-- apagadas junto; pedidos contratados que estavam nele voltam sozinhos às pendências.
CREATE OR REPLACE FUNCTION public.delete_campaign_newspaper_draft(p_newspaper uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE v_state text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_campaign_newspaper()
  THEN RAISE EXCEPTION 'Exclusão não autorizada'; END IF;
  SELECT state INTO v_state FROM public.campaign_newspapers WHERE id=p_newspaper FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Edição não encontrada'; END IF;
  IF v_state<>'draft' THEN
    RAISE EXCEPTION 'Somente rascunhos podem ser excluídos; use Cancelar envio ou Arquivar';
  END IF;
  DELETE FROM public.campaign_newspaper_revisions WHERE newspaper_id=p_newspaper;
  DELETE FROM public.campaign_newspapers WHERE id=p_newspaper AND state='draft';
END $$;
REVOKE ALL ON FUNCTION public.delete_campaign_newspaper_draft(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_campaign_newspaper_draft(uuid) TO authenticated;

-- A Casa confirma que viu a resposta (publicação ou recusa); some o aviso na aba Jornal.
CREATE OR REPLACE FUNCTION public.mark_newspaper_commissions_seen(p_house text)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.campaign_access_active()
     OR NOT(public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
  THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  UPDATE public.campaign_newspaper_commissions
     SET seen_at=now()
   WHERE house_id=p_house AND state<>'pending' AND seen_at IS NULL;
  GET DIAGNOSTICS v_n=ROW_COUNT;
  RETURN v_n;
END $body$;
REVOKE ALL ON FUNCTION public.mark_newspaper_commissions_seen(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_newspaper_commissions_seen(text) TO authenticated;

-- Publicar a edição retira do rol de pendências as notícias contratadas que ela contém.
CREATE OR REPLACE FUNCTION public.settle_newspaper_commissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.state IN ('published','archived') THEN
    UPDATE public.campaign_newspaper_commissions c
       SET state='published',newspaper_id=NEW.id,published_at=now()
     WHERE c.state='pending'
       AND c.id::text IN (
         SELECT b->>'commissionId' FROM jsonb_array_elements(NEW.blocks) b
          WHERE b ? 'commissionId');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS settle_newspaper_commissions_trigger ON public.campaign_newspapers;
CREATE TRIGGER settle_newspaper_commissions_trigger
  AFTER INSERT OR UPDATE ON public.campaign_newspapers
  FOR EACH ROW EXECUTE FUNCTION public.settle_newspaper_commissions();

COMMIT;

-- Consequências: narrator-only, letter-bound house resource events.
-- Each event is recorded in the sheet + official ledger in ONE database transaction.
-- Deductions are ALLOCATIONS, gains are event bonuses (never base/permanent purchases).
BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_letter_consequences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 letter_id uuid NOT NULL REFERENCES public.campaign_letters(id),
 house_id text NOT NULL REFERENCES public.campaign_houses(id),
 changes jsonb NOT NULL,
 explanation text NOT NULL,
 operation_key uuid NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 active boolean NOT NULL DEFAULT true,
 reversed_by uuid REFERENCES auth.users(id),
 reversed_at timestamptz,
 reversal_key uuid UNIQUE,
 reversal_reason text,
 CONSTRAINT consequence_json_object CHECK(jsonb_typeof(changes)='object'),
 CONSTRAINT consequence_reversal_consistency CHECK (
   (active AND reversed_at IS NULL AND reversal_key IS NULL AND reversed_by IS NULL)
   OR (NOT active AND reversed_at IS NOT NULL AND reversal_key IS NOT NULL AND reversed_by IS NOT NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_letter_consequence_single_active
 ON public.campaign_letter_consequences(letter_id,house_id) WHERE active;
CREATE INDEX IF NOT EXISTS campaign_letter_consequence_letter_lookup
 ON public.campaign_letter_consequences(letter_id,created_at DESC);
ALTER TABLE public.campaign_letter_consequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_letter_consequences FROM PUBLIC,anon,authenticated;
-- Deliberately omit explanation, actor and reversal reason from player-selectable columns.
GRANT SELECT(id,letter_id,house_id,changes,active,created_at)
 ON public.campaign_letter_consequences TO authenticated;
GRANT ALL ON public.campaign_letter_consequences TO service_role;
DO $policies$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_letter_consequences' AND policyname='letter_consequences_visible') THEN
  CREATE POLICY letter_consequences_visible ON public.campaign_letter_consequences FOR SELECT TO authenticated
   USING (public.is_campaign_admin() OR (
     public.in_campaign_house(house_id,false) AND EXISTS(
       SELECT 1 FROM public.campaign_letters l
       WHERE l.id=letter_id AND public.can_read_letter(l)
     )
   ));
 END IF;
END $policies$;

CREATE OR REPLACE FUNCTION public.apply_letter_consequence(
 p_letter uuid, p_house text, p_changes jsonb,
 p_explanation text, p_key uuid, p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
 v_actor uuid:=auth.uid(); v_sheet public.noble_house_sheets%ROWTYPE;
 v_existing public.campaign_letter_consequences%ROWTYPE;
 v_id uuid:=gen_random_uuid(); v_after jsonb;
 v_resource text; v_value numeric; v_has_effect boolean:=false;
 v_allowed text[]:=ARRAY['defense','influence','lands','law','population','power','wealth'];
BEGIN
 IF v_actor IS NULL OR NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador pode aplicar consequências.' USING ERRCODE='42501'; END IF;
 IF p_letter IS NULL OR p_key IS NULL OR p_house IS NULL OR btrim(p_house)='' OR p_expected_version IS NULL THEN
   RAISE EXCEPTION 'Parâmetros obrigatórios da consequência ausentes.';
 END IF;
 IF length(btrim(coalesce(p_explanation,''))) NOT BETWEEN 10 AND 2000 THEN
   RAISE EXCEPTION 'Justificativa do evento deve conter de 10 a 2000 caracteres.';
 END IF;
 IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR p_changes='{}'::jsonb THEN
   RAISE EXCEPTION 'Indique pelo menos uma alteração de recurso.';
 END IF;
 FOR v_resource IN SELECT jsonb_object_keys(p_changes) LOOP
   IF NOT v_resource=ANY(v_allowed) OR jsonb_typeof(p_changes->v_resource)<>'number' THEN
     RAISE EXCEPTION 'Recurso ou quantidade inválida: %',v_resource;
   END IF;
   v_value:=(p_changes->>v_resource)::numeric;
   IF v_value<>trunc(v_value) OR abs(v_value)>100 THEN
     RAISE EXCEPTION 'A alteração deve ser inteira e não pode exceder 100 pontos.';
   END IF;
   IF v_value<>0 THEN v_has_effect:=true; END IF;
 END LOOP;
 IF NOT v_has_effect THEN RAISE EXCEPTION 'A consequência deve alterar ao menos um recurso.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.campaign_letters l WHERE l.id=p_letter AND l.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Missiva inexistente ou excluída.';
 END IF;
 -- Same advisory lock as commit_noble_house_operation; protects sheet and ledger version.
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0));
 SELECT * INTO v_existing FROM public.campaign_letter_consequences WHERE operation_key=p_key;
 IF FOUND THEN
   IF v_existing.letter_id<>p_letter OR v_existing.house_id<>p_house OR v_existing.changes<>p_changes THEN
     RAISE EXCEPTION 'Chave de operação reutilizada com outro evento.';
   END IF;
   RETURN jsonb_build_object('id',v_existing.id,'duplicate',true,'version',
     (SELECT version FROM public.noble_house_sheets WHERE house_id=p_house));
 END IF;
 IF EXISTS (SELECT 1 FROM public.campaign_letter_consequences WHERE letter_id=p_letter AND house_id=p_house AND active) THEN
   RAISE EXCEPTION 'Esta missiva já tem uma consequência ativa para a Casa. Estorne antes de corrigir.';
 END IF;
 SELECT * INTO v_sheet FROM public.noble_house_sheets WHERE house_id=p_house FOR UPDATE;
 IF NOT FOUND OR v_sheet.version<>p_expected_version THEN
   RAISE EXCEPTION 'Ficha alterada em outra janela. Recarregue e confirme a versão.';
 END IF;
 IF v_sheet.state->>'schemaVersion' IS DISTINCT FROM '1' OR v_sheet.state->>'houseId' IS DISTINCT FROM p_house THEN
   RAISE EXCEPTION 'Ficha inválida: consequência não aplicada.';
 END IF;
 IF jsonb_typeof(coalesce(v_sheet.state->'mailConsequences','[]'::jsonb))<>'array' THEN
   RAISE EXCEPTION 'Registro de eventos da ficha inválido.';
 END IF;
 v_after:=jsonb_set(v_sheet.state,'{mailConsequences}',
   coalesce(v_sheet.state->'mailConsequences','[]'::jsonb) ||
   jsonb_build_array(jsonb_build_object('id',v_id,'letterId',p_letter,
     'changes',p_changes,'active',true,'createdAt',now())),true);
 INSERT INTO public.campaign_letter_consequences
   (id,letter_id,house_id,changes,explanation,operation_key,created_by)
 VALUES(v_id,p_letter,p_house,p_changes,btrim(p_explanation),p_key,v_actor);
 UPDATE public.noble_house_sheets SET state=v_after,version=v_sheet.version+1,
   updated_by=v_actor,updated_at=now() WHERE house_id=p_house;
 INSERT INTO public.noble_house_ledger
   (house_id,operation_key,actor,action,explanation,rule,campaign_month,before_state,after_state,version)
 VALUES(p_house,p_key,v_actor,'mail_consequence',btrim(p_explanation),
   'Evento de missiva '||p_letter::text||' · efeito: '||p_changes::text||
   ' · perdas alocadas / ganhos em bônus de evento',
   (v_after->>'month')::integer,v_sheet.state,v_after,v_sheet.version+1);
 RETURN jsonb_build_object('id',v_id,'duplicate',false,'version',v_sheet.version+1);
END $fn$;
REVOKE ALL ON FUNCTION public.apply_letter_consequence(uuid,text,jsonb,text,uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_letter_consequence(uuid,text,jsonb,text,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_letter_consequence(
 p_id uuid, p_key uuid, p_expected_version integer, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
 v_actor uuid:=auth.uid(); v_event public.campaign_letter_consequences%ROWTYPE;
 v_sheet public.noble_house_sheets%ROWTYPE; v_after jsonb; v_events jsonb; v_found boolean:=false;
BEGIN
 IF v_actor IS NULL OR NOT public.is_campaign_admin() THEN
   RAISE EXCEPTION 'Somente o Narrador pode estornar consequências.' USING ERRCODE='42501';
 END IF;
 IF p_id IS NULL OR p_key IS NULL OR p_expected_version IS NULL THEN RAISE EXCEPTION 'Dados de estorno ausentes.'; END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 THEN
   RAISE EXCEPTION 'Justifique o estorno em 10 a 2000 caracteres.';
 END IF;
 SELECT * INTO v_event FROM public.campaign_letter_consequences WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Consequência não encontrada.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||v_event.house_id,0));
 SELECT * INTO v_event FROM public.campaign_letter_consequences WHERE id=p_id FOR UPDATE;
 IF NOT v_event.active THEN
   IF v_event.reversal_key=p_key THEN
     RETURN jsonb_build_object('id',v_event.id,'duplicate',true,
       'version',(SELECT version FROM public.noble_house_sheets WHERE house_id=v_event.house_id));
   END IF;
   RAISE EXCEPTION 'Consequência já estornada.';
 END IF;
 SELECT * INTO v_sheet FROM public.noble_house_sheets WHERE house_id=v_event.house_id FOR UPDATE;
 IF NOT FOUND OR v_sheet.version<>p_expected_version THEN
   RAISE EXCEPTION 'Ficha alterada em outra janela. Recarregue antes de estornar.';
 END IF;
 SELECT coalesce(jsonb_agg(
    CASE WHEN row->>'id'=v_event.id::text THEN
       jsonb_set(row,'{active}','false'::jsonb,true) ELSE row END ORDER BY ord),'[]'::jsonb),
   bool_or(row->>'id'=v_event.id::text)
 INTO v_events,v_found
 FROM jsonb_array_elements(coalesce(v_sheet.state->'mailConsequences','[]'::jsonb))
 WITH ORDINALITY AS e(row,ord);
 IF NOT coalesce(v_found,false) THEN RAISE EXCEPTION 'Evento ausente na ficha; estorno cancelado.'; END IF;
 v_after:=jsonb_set(v_sheet.state,'{mailConsequences}',v_events,true);
 UPDATE public.campaign_letter_consequences SET active=false,reversed_by=v_actor,reversed_at=now(),
   reversal_key=p_key,reversal_reason=btrim(p_reason) WHERE id=p_id;
 UPDATE public.noble_house_sheets SET state=v_after,version=v_sheet.version+1,
   updated_by=v_actor,updated_at=now() WHERE house_id=v_event.house_id;
 INSERT INTO public.noble_house_ledger
   (house_id,operation_key,actor,action,explanation,rule,campaign_month,before_state,after_state,version)
 VALUES(v_event.house_id,p_key,v_actor,'mail_consequence_reversed',btrim(p_reason),
   'Estorno de consequência da missiva '||v_event.letter_id::text||' · evento '||v_event.id::text,
   (v_after->>'month')::integer,v_sheet.state,v_after,v_sheet.version+1);
 RETURN jsonb_build_object('id',v_event.id,'duplicate',false,'version',v_sheet.version+1);
END $fn$;
REVOKE ALL ON FUNCTION public.reverse_letter_consequence(uuid,uuid,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_letter_consequence(uuid,uuid,integer,text) TO authenticated;

COMMIT;

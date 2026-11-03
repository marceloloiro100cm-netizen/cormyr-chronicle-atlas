-- Cormyr: duas compras individuais de espiões a 1 Riqueza cada.
-- São permanentes enquanto o agente existir e não acumulam repetidamente.
-- Aquisição debita Riqueza permanente e lança o livro-caixa da Casa em uma transação.
BEGIN;
CREATE TABLE IF NOT EXISTS public.spy_agent_upgrades (
 agent_id uuid NOT NULL,
 owner_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 upgrade_code text NOT NULL CHECK(upgrade_code IN ('forged_documents','ace_in_the_hole')),
 cost_wealth integer NOT NULL DEFAULT 1 CHECK(cost_wealth=1),
 purchased_at timestamptz NOT NULL DEFAULT now(),
 request_key uuid NOT NULL UNIQUE,
 purchased_by uuid NOT NULL REFERENCES auth.users(id),
 PRIMARY KEY(agent_id,upgrade_code),
 FOREIGN KEY(agent_id,owner_house_id) REFERENCES public.spy_assets(id,owner_house_id)
);
ALTER TABLE public.spy_agent_upgrades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spy_agent_upgrades_owner ON public.spy_agent_upgrades;
CREATE POLICY spy_agent_upgrades_owner ON public.spy_agent_upgrades
 FOR SELECT TO authenticated USING
 (public.is_campaign_admin() OR public.in_campaign_house(owner_house_id,false));
REVOKE ALL ON public.spy_agent_upgrades FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_agent_upgrades TO authenticated;
ALTER TABLE public.spy_agent_history DROP CONSTRAINT IF EXISTS spy_agent_history_event_type_check;
ALTER TABLE public.spy_agent_history ADD CONSTRAINT spy_agent_history_event_type_check
 CHECK(event_type IN('recruited','mission_success','mission_failure',
  'escaped','captured','dead','promoted','upgrade_purchased'));

CREATE OR REPLACE FUNCTION public.spy_buy_agent_upgrade(
 p_house text,p_agent uuid,p_code text,p_expected_agent_version integer,
 p_expected_house_version integer,p_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE
 v_a record; v_h record;v_prev jsonb;v_next jsonb;v_calendar record;
 v_used integer;v_available integer;v_total integer;v_region_wealth integer:=0;
 v_allocated integer;v_units integer;v_consequences integer;
 v_old_perm integer;v_holding integer;v_name text;v_date text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT(public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Compra de espião não autorizada'; END IF;
 IF p_code NOT IN('forged_documents','ace_in_the_hole') OR p_agent IS NULL
  OR p_key IS NULL OR p_expected_agent_version IS NULL OR
  p_expected_house_version IS NULL
 THEN RAISE EXCEPTION 'Compra inválida'; END IF;

 -- A mesma trava usada pelo livro-caixa impede disputa com outras compras.
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0));
 SELECT n.state,n.version INTO v_h FROM public.noble_house_sheets n
 WHERE n.house_id=p_house FOR UPDATE;
 IF NOT FOUND OR v_h.state->>'phase'<>'active'
 THEN RAISE EXCEPTION 'A Casa precisa de ficha ativa'; END IF;
 SELECT a.* INTO v_a FROM public.spy_assets a
 WHERE a.owner_house_id=p_house AND a.id=p_agent FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agente não pertence à Casa'; END IF;

 -- Idempotência: reenviar a mesma chave nunca debita Riqueza novamente.
 IF EXISTS(SELECT 1 FROM public.spy_agent_upgrades x WHERE x.request_key=p_key
  AND x.agent_id=p_agent AND x.owner_house_id=p_house AND x.upgrade_code=p_code)
 THEN RETURN jsonb_build_object('agentId',p_agent,'upgrade',p_code,
  'alreadyApplied',true,'agentVersion',v_a.version,'houseVersion',v_h.version);
 END IF;
 IF EXISTS(SELECT 1 FROM public.spy_agent_upgrades x WHERE x.request_key=p_key)
  OR EXISTS(SELECT 1 FROM public.noble_house_ledger l
    WHERE l.house_id=p_house AND l.operation_key=p_key)
 THEN RAISE EXCEPTION 'Chave já utilizada em outra compra'; END IF;
 IF v_a.status IN('dead','captured','lost','retired')
 THEN RAISE EXCEPTION 'Não é possível equipar um agente fora de serviço'; END IF;
 IF v_a.version<>p_expected_agent_version OR v_h.version<>p_expected_house_version
 THEN RAISE EXCEPTION 'Ficha alterada. Recarregue antes de comprar'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_agent_upgrades x
  WHERE x.agent_id=p_agent AND x.upgrade_code=p_code)
 THEN RAISE EXCEPTION 'Este espião já possui essa compra'; END IF;

 v_prev:=v_h.state;
 v_old_perm:=coalesce((v_prev#>>'{permanent,wealth}')::integer,0);
 -- Cálculo conservador: recursos positivos não homologados NÃO são assumidos.
 IF v_prev->>'regionalApplied'='true' AND v_prev->>'method'<>'import' THEN
  v_region_wealth:=CASE lower(replace(v_prev#>>'{identity,region}',' ',''))
   WHEN 'crownlands' THEN 10 WHEN 'veilstone' THEN 15 WHEN 'shieldmark' THEN 10
   WHEN 'helmlands' THEN 5 WHEN 'horselands' THEN 15 WHEN 'dragoncoast' THEN 20
   WHEN 'swordmarch' THEN 15 WHEN 'swordmark' THEN 15 WHEN 'ferlin' THEN 10
   WHEN 'stonelands' THEN 15 WHEN 'elfhold' THEN 15 WHEN 'volkumburgh' THEN 10
   ELSE 0 END;
 END IF;

 SELECT coalesce(sum(CASE WHEN (m->'changes'->>'wealth')::integer>0
     THEN (m->'changes'->>'wealth')::integer
     ELSE (m->'changes'->>'wealth')::integer END),0)::integer
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
    WHERE c->>'resource'='wealth' AND c->>'mode'='allocation')
  END),0)::integer
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
    WHERE c->>'resource'='wealth' AND c->>'mode'='allocation')
  END),0)::integer
 INTO v_units FROM jsonb_array_elements(
  CASE WHEN jsonb_typeof(v_prev->'units')='array'
   THEN v_prev->'units' ELSE '[]'::jsonb END) u
 WHERE coalesce(u->>'destroyed','false')<>'true';

 v_total:=coalesce((v_prev#>>'{base,wealth}')::integer,0)+v_old_perm+
   v_region_wealth+v_consequences;
 v_available:=v_total-v_allocated-v_units;
 IF v_available<1 THEN RAISE EXCEPTION 'Sem recursos: exige 1 ponto de Riqueza disponível'; END IF;

 v_next:=jsonb_set(v_prev,'{permanent,wealth}',to_jsonb(v_old_perm-1),false);
 UPDATE public.noble_house_sheets SET state=v_next,version=version+1,
  updated_by=auth.uid(),updated_at=now()
 WHERE house_id=p_house;
 UPDATE public.spy_assets SET version=version+1 WHERE id=p_agent;
 v_name:=CASE p_code WHEN 'forged_documents' THEN 'Documentos falsificados'
  ELSE 'Uma carta na manga' END;
 INSERT INTO public.noble_house_ledger(
  house_id,operation_key,actor,action,explanation,rule,campaign_month,
  before_state,after_state,version
 ) VALUES(
  p_house,p_key,auth.uid(),'spy_agent_upgrade',
  'Compra para '||v_a.codename||': '||v_name||' (−1 Riqueza).',
  'Cormyr: equipamento especial de espionagem · custo permanente 1 Riqueza',
  (v_next->>'month')::integer,v_prev,v_next,v_h.version+1
 );
 INSERT INTO public.spy_agent_upgrades(
  agent_id,owner_house_id,upgrade_code,request_key,purchased_by
 ) VALUES(p_agent,p_house,p_code,p_key,auth.uid());
 SELECT year,month,day,festival,version INTO v_calendar
 FROM public.campaign_calendar WHERE id=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Hub Temporal indisponível'; END IF;
 v_date:=lpad(v_calendar.year::text,4,'0')||'-'||
  CASE WHEN v_calendar.festival IS NOT NULL THEN 'F-'||v_calendar.festival
  ELSE lpad((v_calendar.month+1)::text,2,'0')||'-'||
   lpad(v_calendar.day::text,2,'0') END;
 IF NOT public.valid_campaign_date(v_date) THEN RAISE EXCEPTION 'Data inválida'; END IF;
 INSERT INTO public.spy_agent_history(
  owner_house_id,agent_id,event_type,event_date_key,calendar_version,
  agent_rank,cunning,total_successes,detail,request_key,actor
 ) VALUES(
  p_house,p_agent,'upgrade_purchased',v_date,v_calendar.version,
  CASE least(3,v_a.mission_successes/3)
   WHEN 0 THEN 'Verde' WHEN 1 THEN 'Treinada'
   WHEN 2 THEN 'Veterana' ELSE 'Elite' END,
  3+least(3,v_a.mission_successes/3),v_a.mission_successes,
  v_name||' adquirida (1 Riqueza permanente).',p_key,auth.uid()
 );
 RETURN jsonb_build_object('agentId',p_agent,'upgrade',p_code,
  'alreadyApplied',false,'agentVersion',v_a.version+1,
  'houseVersion',v_h.version+1,'remainingWealthEstimate',v_available-1);
END $body$;
REVOKE ALL ON FUNCTION public.spy_buy_agent_upgrade(text,uuid,text,integer,integer,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_buy_agent_upgrade(text,uuid,text,integer,integer,uuid)
 TO authenticated;
COMMIT;

-- 0100 · Baixa voluntária de espião com devolução da Riqueza gasta.
-- Não apaga missões nem histórico: a ficha é arquivada (status retired),
-- mas deixa de ocupar vaga e devolve o retrato para a galeria da Casa.
-- O recrutamento em si é gratuito; somente melhorias EFETIVAMENTE compradas
-- (spy_agent_upgrades) geram reembolso. Operação ACID e idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS public.spy_agent_removals(
 agent_id uuid PRIMARY KEY,
 owner_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 request_key uuid NOT NULL UNIQUE,
 refunded_wealth integer NOT NULL CHECK(refunded_wealth BETWEEN 0 AND 2),
 portrait_id text,
 codename text NOT NULL,
 removed_by uuid NOT NULL REFERENCES auth.users(id),
 removed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(agent_id,owner_house_id) REFERENCES public.spy_assets(id,owner_house_id)
);
ALTER TABLE public.spy_agent_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spy_agent_removals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_agent_removals TO service_role;

-- O histórico deve continuar legível mesmo após o agente sair do elenco.
ALTER TABLE public.spy_agent_history
 DROP CONSTRAINT IF EXISTS spy_agent_history_event_type_check;
ALTER TABLE public.spy_agent_history
 ADD CONSTRAINT spy_agent_history_event_type_check
 CHECK(event_type IN('recruited','mission_success','mission_failure',
 'escaped','captured','dead','promoted','upgrade_purchased','retired'));

CREATE OR REPLACE FUNCTION public.spy_remove_agent(
 p_house text,p_agent uuid,p_expected_agent_version integer,
 p_expected_house_version integer,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE
 v_h record;v_a record;v_previous record;v_prev jsonb;v_next jsonb;
 v_refund integer:=0;v_old_permanent integer;v_cal record;v_date text;
 v_rank text;v_cunning integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Baixa de espião não autorizada'; END IF;
 IF p_house IS NULL OR p_agent IS NULL OR p_request_key IS NULL
  OR p_expected_agent_version IS NULL OR p_expected_agent_version<1
  OR p_expected_house_version IS NULL OR p_expected_house_version<0
 THEN RAISE EXCEPTION 'Parâmetros de baixa inválidos'; END IF;

 -- Mesma trava usada pelas compras. Impede dupla devolução ou mutação
 -- simultânea da ficha enquanto o reembolso é calculado.
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0));
 SELECT state,version INTO v_h FROM public.noble_house_sheets
  WHERE house_id=p_house FOR UPDATE;
 IF NOT FOUND OR v_h.state->>'phase'<>'active'
 THEN RAISE EXCEPTION 'Ficha ativa da Casa necessária'; END IF;
 SELECT * INTO v_a FROM public.spy_assets
  WHERE id=p_agent AND owner_house_id=p_house FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Espião não pertence à Casa'; END IF;

 SELECT * INTO v_previous FROM public.spy_agent_removals
  WHERE agent_id=p_agent AND owner_house_id=p_house;
 IF FOUND THEN
  IF v_previous.request_key<>p_request_key
   THEN RAISE EXCEPTION 'Espião já excluído, sem novo reembolso'; END IF;
  RETURN jsonb_build_object(
   'agentId',p_agent,'refundedWealth',v_previous.refunded_wealth,
   'freedSlot',true,'portraitReleased',v_previous.portrait_id IS NOT NULL,
   'alreadyApplied',true,'houseVersion',v_h.version);
 END IF;
 IF EXISTS(SELECT 1 FROM public.spy_agent_removals
    WHERE request_key=p_request_key)
  OR EXISTS(SELECT 1 FROM public.noble_house_ledger
    WHERE house_id=p_house AND operation_key=p_request_key)
 THEN RAISE EXCEPTION 'Chave já utilizada em outra operação'; END IF;

 IF v_a.status<>'available' THEN
  RAISE EXCEPTION 'Exclua somente espiões disponíveis, fora de missão'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operations o
  WHERE o.asset_id=p_agent AND o.status NOT IN('completed','cancelled'))
 THEN RAISE EXCEPTION 'Finalize ou cancele a missão antes de excluir o espião'; END IF;
 IF v_a.version<>p_expected_agent_version OR v_h.version<>p_expected_house_version
 THEN RAISE EXCEPTION 'Ficha desatualizada. Atualize antes da exclusão'; END IF;

 -- Cada melhoria já foi debitada do permanente e tem custo registrado.
 SELECT coalesce(sum(u.cost_wealth),0)::integer INTO v_refund
 FROM public.spy_agent_upgrades u
 WHERE u.agent_id=p_agent AND u.owner_house_id=p_house;
 IF v_refund<0 OR v_refund>2 THEN
  RAISE EXCEPTION 'Custos de espião inconsistentes: revisão necessária'; END IF;
 v_prev:=v_h.state;
 v_old_permanent:=coalesce((v_prev#>>'{permanent,wealth}')::integer,0);
 v_next:=jsonb_set(v_prev,'{permanent,wealth}',
  to_jsonb(v_old_permanent+v_refund),false);

 SELECT year,month,day,festival,version INTO v_cal
 FROM public.campaign_calendar WHERE id=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Hub Temporal indisponível'; END IF;
 v_date:=lpad(v_cal.year::text,4,'0')||'-'||
  CASE WHEN v_cal.festival IS NOT NULL THEN 'F-'||v_cal.festival
  ELSE lpad((v_cal.month+1)::text,2,'0')||'-'||
    lpad(v_cal.day::text,2,'0') END;
 IF NOT public.valid_campaign_date(v_date)
 THEN RAISE EXCEPTION 'Data de baixa inválida'; END IF;
 v_rank:=CASE least(3,v_a.mission_successes/3)
  WHEN 0 THEN 'Verde' WHEN 1 THEN 'Treinada'
  WHEN 2 THEN 'Veterana' ELSE 'Elite' END;
 v_cunning:=3+least(3,v_a.mission_successes/3);

 UPDATE public.noble_house_sheets SET state=v_next,
  version=version+1,updated_by=auth.uid(),updated_at=now()
 WHERE house_id=p_house;
 -- Preservar histórico e missões antigas, mas tornar vaga e retrato livres.
 UPDATE public.spy_assets SET status='retired',portrait_id=NULL,
  version=version+1 WHERE id=p_agent AND owner_house_id=p_house;
 INSERT INTO public.spy_agent_removals(
  agent_id,owner_house_id,request_key,refunded_wealth,portrait_id,
  codename,removed_by
 ) VALUES(p_agent,p_house,p_request_key,v_refund,
  v_a.portrait_id,v_a.codename,auth.uid());
 INSERT INTO public.noble_house_ledger(
  house_id,operation_key,actor,action,explanation,rule,campaign_month,
  before_state,after_state,version
 ) VALUES(
  p_house,p_request_key,auth.uid(),'spy_agent_removed',
  'Baixa do espião '||v_a.codename||': +'||v_refund||
   ' Riqueza devolvida; vaga e retrato liberados.',
  'Devolver somente custo de melhorias efetivamente pagas, sem apagar missões.',
  (v_next->>'month')::integer,v_prev,v_next,v_h.version+1);
 INSERT INTO public.spy_agent_history(
  owner_house_id,agent_id,event_type,event_date_key,calendar_version,
  target_name,agent_rank,cunning,total_successes,detail,request_key,actor
 ) VALUES(
  p_house,p_agent,'retired',v_date,v_cal.version,v_a.codename,
  v_rank,v_cunning,v_a.mission_successes,
  'Agente excluído do elenco ativo. Reembolso de '||v_refund||
   ' Riqueza; vaga e retrato liberados.',p_request_key,auth.uid());
 RETURN jsonb_build_object(
  'agentId',p_agent,'refundedWealth',v_refund,
  'freedSlot',true,'portraitReleased',v_a.portrait_id IS NOT NULL,
  'alreadyApplied',false,'houseVersion',v_h.version+1);
END $body$;

REVOKE ALL ON FUNCTION public.spy_remove_agent(text,uuid,integer,integer,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_remove_agent(text,uuid,integer,integer,uuid)
 TO authenticated;
COMMIT;

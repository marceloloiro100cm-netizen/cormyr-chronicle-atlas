CREATE TABLE public.noble_house_sheets (house_id text PRIMARY KEY REFERENCES public.campaign_houses(id), state jsonb NOT NULL DEFAULT '{}'::jsonb, version integer NOT NULL DEFAULT 1, updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), sync_state text NOT NULL DEFAULT 'not_configured');
GRANT SELECT ON public.noble_house_sheets TO authenticated;
GRANT ALL ON public.noble_house_sheets TO service_role;
ALTER TABLE public.noble_house_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY noble_house_read ON public.noble_house_sheets FOR SELECT TO authenticated USING (public.is_campaign_admin() OR public.in_campaign_house(house_id,false));
CREATE TABLE public.noble_house_ledger (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), house_id text NOT NULL REFERENCES public.campaign_houses(id), operation_key uuid NOT NULL, actor uuid NOT NULL, action text NOT NULL, explanation text NOT NULL DEFAULT '', rule text NOT NULL DEFAULT '', campaign_month integer NOT NULL, before_state jsonb NOT NULL, after_state jsonb NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(house_id,operation_key));
GRANT SELECT ON public.noble_house_ledger TO authenticated;
GRANT ALL ON public.noble_house_ledger TO service_role;
ALTER TABLE public.noble_house_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY noble_ledger_read ON public.noble_house_ledger FOR SELECT TO authenticated USING (public.is_campaign_admin() OR public.in_campaign_house(house_id,false));
CREATE TABLE public.noble_house_gm_notes (house_id text PRIMARY KEY REFERENCES public.campaign_houses(id), notes text NOT NULL DEFAULT '', secret_state jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE ON public.noble_house_gm_notes TO authenticated;
GRANT ALL ON public.noble_house_gm_notes TO service_role;
ALTER TABLE public.noble_house_gm_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY noble_gm_private ON public.noble_house_gm_notes TO authenticated USING(public.is_campaign_admin()) WITH CHECK(public.is_campaign_admin());
CREATE TABLE public.noble_house_rule_overrides (id text PRIMARY KEY, definition jsonb NOT NULL, version integer NOT NULL DEFAULT 1, updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.noble_house_rule_overrides TO authenticated;
GRANT ALL ON public.noble_house_rule_overrides TO service_role;
ALTER TABLE public.noble_house_rule_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY noble_rules_read ON public.noble_house_rule_overrides FOR SELECT TO authenticated USING(public.campaign_access_active());
CREATE OR REPLACE FUNCTION public.commit_noble_house_operation(p_actor uuid,p_house text,p_version integer,p_key uuid,p_action text,p_state jsonb,p_explanation text,p_rule text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public.noble_house_sheets; previous public.noble_house_ledger; is_admin boolean; next_version integer;
BEGIN
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin') INTO is_admin;
 IF NOT is_admin AND NOT EXISTS(SELECT 1 FROM public.house_memberships m JOIN public.campaign_players p ON p.id=m.player_id WHERE m.house_id=p_house AND m.can_edit AND p.user_id=p_actor AND p.active AND NOT p.require_password_change) THEN RAISE EXCEPTION 'Casa não autorizada.'; END IF;
 IF p_state->>'houseId' IS DISTINCT FROM p_house OR p_state->>'schemaVersion' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Ficha inválida.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0));
 SELECT * INTO previous FROM public.noble_house_ledger WHERE house_id=p_house AND operation_key=p_key;
 IF FOUND THEN IF previous.actor<>p_actor OR previous.action<>p_action THEN RAISE EXCEPTION 'Chave de operação já usada.'; END IF; RETURN jsonb_build_object('state',previous.after_state,'version',previous.version,'duplicate',true); END IF;
 SELECT * INTO current_row FROM public.noble_house_sheets WHERE house_id=p_house FOR UPDATE;
 IF coalesce(current_row.version,0)<>p_version THEN RAISE EXCEPTION 'A ficha mudou em outra janela. Recarregue antes de confirmar.'; END IF;
 next_version:=p_version+1;
 INSERT INTO public.noble_house_sheets(house_id,state,version,updated_by) VALUES(p_house,p_state,next_version,p_actor) ON CONFLICT(house_id) DO UPDATE SET state=EXCLUDED.state,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=now();
 INSERT INTO public.noble_house_ledger(house_id,operation_key,actor,action,explanation,rule,campaign_month,before_state,after_state,version) VALUES(p_house,p_key,p_actor,p_action,p_explanation,p_rule,(p_state->>'month')::integer,coalesce(current_row.state,'{}'::jsonb),p_state,next_version);
 RETURN jsonb_build_object('state',p_state,'version',next_version,'duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.commit_noble_house_operation(uuid,text,integer,uuid,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_noble_house_operation(uuid,text,integer,uuid,text,jsonb,text,text) TO service_role;
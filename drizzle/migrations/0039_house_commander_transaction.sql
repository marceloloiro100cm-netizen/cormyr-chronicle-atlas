-- Atomic commander creation: failed or repeated operations never leave orphan NPCs.
CREATE OR REPLACE FUNCTION public.commit_noble_house_operation(p_actor uuid,p_house text,p_version integer,p_key uuid,p_action text,p_state jsonb,p_explanation text,p_rule text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public.noble_house_sheets; previous public.noble_house_ledger; is_admin boolean; next_version integer; u jsonb; old_unit jsonb; new_units jsonb; npc uuid; member_id text; commander text; normalized text;
BEGIN
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin') INTO is_admin;
 IF NOT is_admin AND NOT EXISTS(SELECT 1 FROM public.house_memberships m JOIN public.campaign_players p ON p.id=m.player_id WHERE m.house_id=p_house AND m.can_edit AND p.user_id=p_actor AND p.active AND NOT p.require_password_change) THEN RAISE EXCEPTION 'Casa não autorizada.'; END IF;
 IF p_state->>'houseId' IS DISTINCT FROM p_house OR p_state->>'schemaVersion' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Ficha inválida.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0));
 SELECT * INTO previous FROM public.noble_house_ledger WHERE house_id=p_house AND operation_key=p_key;
 IF FOUND THEN IF previous.actor<>p_actor OR previous.action<>p_action THEN RAISE EXCEPTION 'Chave de operação já usada.'; END IF; RETURN jsonb_build_object('state',previous.after_state,'version',previous.version,'duplicate',true); END IF;
 SELECT * INTO current_row FROM public.noble_house_sheets WHERE house_id=p_house FOR UPDATE;
 IF coalesce(current_row.version,0)<>p_version THEN RAISE EXCEPTION 'A ficha mudou em outra janela. Recarregue antes de confirmar.'; END IF;
 -- Resolve commanders only after the version check and under the same house lock.
 -- House-visible NPCs may be reused. Private names are never copied into a shared sheet.
 IF p_action IN ('unit','unit_state') THEN
 new_units:='[]';
 FOR u IN SELECT value FROM jsonb_array_elements(p_state->'units') LOOP
 SELECT value INTO old_unit FROM jsonb_array_elements(coalesce(current_row.state->'units','[]')) WHERE value->>'id'=u->>'id';
 commander:=btrim(coalesce(u->>'commanderName',''));
 IF commander<>'' AND (old_unit IS NULL OR old_unit->>'commanderName' IS DISTINCT FROM commander) THEN
 normalized:=lower(regexp_replace(normalize(commander,NFD),U&'[\0300-\036f]','','g'));
 SELECT id INTO npc FROM campaign_records WHERE house_id=p_house AND kind='character' AND visibility='house' AND title !~* '^ficha\M' AND lower(regexp_replace(normalize(btrim(title),NFD),U&'[\0300-\036f]','','g'))=normalized ORDER BY created_at,id LIMIT 1;
 IF npc IS NULL THEN
 npc:=gen_random_uuid();
 INSERT INTO campaign_records(id,house_id,kind,visibility,title,content,created_by,updated_by) VALUES(npc,p_house,'character','house',commander,'Comandante da unidade '||(u->>'name'),p_actor,p_actor);
 END IF;
 SELECT value->>'id' INTO member_id FROM jsonb_array_elements(coalesce(p_state->'court','[]')) WHERE value->>'npcId'=npc::text AND value->>'role'='Comandante de Exército' LIMIT 1;
 IF member_id IS NULL THEN
 member_id:=gen_random_uuid()::text;
 p_state:=jsonb_set(p_state,'{court}',coalesce(p_state->'court','[]')||jsonb_build_array(jsonb_build_object('id',member_id,'npcId',npc,'name',commander,'role','Comandante de Exército','notes','Comandante da unidade '||(u->>'name'))));
 END IF;
 u:=jsonb_set(u,'{commanderId}',to_jsonb(member_id));
 END IF;
 new_units:=new_units||jsonb_build_array(u);
 END LOOP;
 p_state:=jsonb_set(p_state,'{units}',new_units);
 END IF;
 next_version:=p_version+1;
 INSERT INTO public.noble_house_sheets(house_id,state,version,updated_by) VALUES(p_house,p_state,next_version,p_actor) ON CONFLICT(house_id) DO UPDATE SET state=EXCLUDED.state,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=now();
 INSERT INTO public.noble_house_ledger(house_id,operation_key,actor,action,explanation,rule,campaign_month,before_state,after_state,version) VALUES(p_house,p_key,p_actor,p_action,p_explanation,p_rule,(p_state->>'month')::integer,coalesce(current_row.state,'{}'::jsonb),p_state,next_version);
 RETURN jsonb_build_object('state',p_state,'version',next_version,'duplicate',false);
END $$;

-- Technical character sheets are not narrative court choices.
CREATE OR REPLACE FUNCTION public.mail_compose_options() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE directory jsonb; houses jsonb;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'houses',(SELECT coalesce(jsonb_agg(m.house_id),'[]'::jsonb) FROM house_memberships m WHERE m.player_id=p.id)) ORDER BY p.name),'[]'::jsonb) INTO directory
 FROM campaign_players p WHERE p.active AND NOT p.require_password_change AND p.user_id IS NOT NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'version',s.version,
 'court',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c->>'id','name',coalesce(r.title,nullif(c->>'name',''),'Integrante sem identificação'),'role',c->>'role')),'[]'::jsonb)
 FROM jsonb_array_elements(coalesce(s.state->'court','[]'::jsonb)) c
 LEFT JOIN campaign_records r ON r.id::text=c->>'npcId' AND r.house_id=h.id AND r.kind='character' AND r.title !~* '^ficha\M' AND public.can_read_record(r)
 WHERE c->>'id' IS NOT NULL AND (nullif(c->>'npcId','') IS NULL OR r.id IS NOT NULL)),
 'units',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u->>'id','name',u->>'name','available',coalesce(u->>'destroyed','false')<>'true')),'[]'::jsonb) FROM jsonb_array_elements(coalesce(s.state->'units','[]'::jsonb)) u WHERE u->>'id' IS NOT NULL)
 ) ORDER BY h.name),'[]'::jsonb) INTO houses
 FROM campaign_houses h LEFT JOIN noble_house_sheets s ON s.house_id=h.id
 WHERE h.active AND h.season=2 AND (public.is_campaign_admin() OR public.in_campaign_house(h.id));
 RETURN jsonb_build_object('players',directory,'houses',houses);
END $$;


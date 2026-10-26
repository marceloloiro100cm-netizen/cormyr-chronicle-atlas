CREATE OR REPLACE FUNCTION public.commit_noble_house_source(p_actor uuid,p_house text,p_version integer,p_key uuid,p_record uuid,p_source_version integer,p_source_hash text,p_totals jsonb,p_state jsonb,p_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src public.campaign_records; current_row public.noble_house_sheets; prior public.noble_house_ledger; result jsonb; resource text; existing_state jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Somente o Narrador pode conciliar fichas.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0));
 SELECT * INTO prior FROM public.noble_house_ledger WHERE house_id=p_house AND operation_key=p_key;
 IF FOUND THEN IF prior.actor<>p_actor OR prior.action<>'source_link' THEN RAISE EXCEPTION 'Chave já utilizada.'; END IF; RETURN jsonb_build_object('state',prior.after_state,'version',prior.version,'duplicate',true); END IF;
 IF EXISTS(SELECT 1 FROM public.noble_house_source_links WHERE house_id=p_house) THEN RAISE EXCEPTION 'Casa já vinculada; nova conciliação exige revisão explícita.'; END IF;
 SELECT * INTO src FROM public.campaign_records WHERE id=p_record FOR UPDATE;
 IF NOT FOUND OR src.house_id IS DISTINCT FROM p_house OR src.visibility NOT IN ('house','player') OR src.version<>p_source_version OR md5(src.content)<>p_source_hash THEN RAISE EXCEPTION 'Fonte alterada ou divergente; nada foi conciliado.'; END IF;
 IF src.visibility='player' AND NOT EXISTS(SELECT 1 FROM public.house_memberships m JOIN public.campaign_players p ON p.id=m.player_id WHERE m.house_id=p_house AND p.id=src.player_id AND p.active) THEN RAISE EXCEPTION 'Jogador da fonte sem vínculo autorizado.'; END IF;
 SELECT * INTO current_row FROM public.noble_house_sheets WHERE house_id=p_house FOR UPDATE;
 IF coalesce(current_row.version,0)<>p_version THEN RAISE EXCEPTION 'Ficha mudou; recarregue antes de conciliar.'; END IF;
 IF current_row.house_id IS NOT NULL THEN
 existing_state:=current_row.state;
 IF (p_state-'permanent'-'pending'-'importSources') IS DISTINCT FROM (existing_state-'permanent'-'pending'-'importSources') THEN RAISE EXCEPTION 'Conciliação não pode alterar compras, base ou identidade.'; END IF;
 ELSE
 IF p_state->'holdings'<>'[]'::jsonb OR p_state->'units'<>'[]'::jsonb OR p_state->'projects'<>'[]'::jsonb THEN RAISE EXCEPTION 'Conciliação não cria compras ou tropas.'; END IF;
 existing_state:='{}'::jsonb;
 END IF;
 FOREACH resource IN ARRAY ARRAY['defense','influence','lands','law','population','power','wealth'] LOOP
 IF jsonb_typeof(p_totals->resource)<>'number' OR (p_totals->>resource)::numeric<0 OR (p_totals->>resource)::numeric>100000 THEN RAISE EXCEPTION 'Total inválido.'; END IF;
 END LOOP;
 INSERT INTO public.campaign_migration_backups(reason,snapshot) VALUES('Antes de vincular ficha real: '||p_house,jsonb_build_object('house',p_house,'sheet',to_jsonb(current_row),'source',to_jsonb(src),'ledger',(SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) FROM public.noble_house_ledger l WHERE house_id=p_house)));
 result:=public.commit_noble_house_operation(p_actor,p_house,p_version,p_key,'source_link',p_state,p_note,'Conciliação de totais de fonte existente; compras preservadas');
 INSERT INTO public.noble_house_source_links(house_id,record_id,source_version,source_file_id,source_modified_at,confirmed_totals,source_snapshot,before_state,after_version,actor) VALUES(p_house,p_record,src.version,src.source_file_id,src.source_modified_at,p_totals,to_jsonb(src),existing_state,(result->>'version')::integer,p_actor);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.commit_noble_house_source(uuid,text,integer,uuid,uuid,integer,text,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_noble_house_source(uuid,text,integer,uuid,uuid,integer,text,jsonb,jsonb,text) TO service_role;
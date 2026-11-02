-- CCA-ESP-MVP-001 · Lote 11 · CONSUMIDOR TEMPORAL EM HOMOLOGAÇÃO, não implantado.
-- Depende do schema 0075 e do Hub 0060–0067 reconciliado.
BEGIN;
SET LOCAL lock_timeout='5s';
INSERT INTO public.campaign_temporal_consumers(code,title,description,boundary,mode,enabled)
VALUES('spy-movements','Deslocamentos de espiões',
  'Chegadas de agentes apenas quando o calendario e publicado; sem divulgar missao','date','manual_review',false)
ON CONFLICT(code) DO NOTHING;
-- Habilitar apenas depois de homologar o replay/backup; status inicial desativado.
CREATE OR REPLACE FUNCTION public.spy_process_published_movements(
 p_expected_calendar_version integer,p_request_key uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE cal record; latest_date text; seg record; n integer:=0; pass_count integer; checked boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_campaign_admin() OR NOT public.campaign_access_active() THEN
  RAISE EXCEPTION 'Somente o Narrador pode processar movimentos'; END IF;
 IF p_request_key IS NULL OR length(trim(p_reason))<10 THEN
  RAISE EXCEPTION 'Chave e justificativa obrigatórias'; END IF;
 IF p_expected_calendar_version<1 THEN RAISE EXCEPTION 'Versão temporal inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('spy-movements',0));
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_request_key) THEN
  RAISE EXCEPTION 'Chave de movimento já usada: reexecução com nova chave e versão obrigatória';
 END IF;
 SELECT * INTO cal FROM public.campaign_calendar WHERE id=true FOR SHARE;
 IF NOT FOUND OR cal.version<>p_expected_calendar_version THEN
  RAISE EXCEPTION 'Versão do calendário mudou'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.campaign_time_operations cto
  WHERE (cto.after_state->>'version')::integer=cal.version) INTO checked;
 IF NOT checked THEN RAISE EXCEPTION 'Publicação oficial ainda não confirmada'; END IF;
 latest_date:=public.harptos_time_key(cal.year,cal.month,cal.day,cal.festival);
 -- Retrocessos não desfazem chegadas. Repetir a busca para saltos com múltiplos trechos.
 LOOP
 pass_count:=n;
 FOR seg IN SELECT s.* FROM public.spy_operation_segments s
  JOIN public.spy_operations o ON o.id=s.operation_id
  WHERE s.status IN ('planned','traveling')
   AND public.harptos_calendar_ordinal(s.arrival_key)<=public.harptos_calendar_ordinal(latest_date)
   AND o.status IN ('planned','traveling','returning')
   AND NOT EXISTS (SELECT 1 FROM public.spy_operation_segments p
    WHERE p.operation_id=s.operation_id AND p.ordinal<s.ordinal
     AND p.status NOT IN ('arrived','cancelled'))
  ORDER BY public.harptos_calendar_ordinal(s.arrival_key),s.ordinal,s.id
  FOR UPDATE OF s SKIP LOCKED
 LOOP
  INSERT INTO public.spy_temporal_deliveries(segment_id,calendar_version,transition)
  VALUES(seg.id,cal.version,'arrived') ON CONFLICT(segment_id,transition) DO NOTHING;
  IF NOT FOUND THEN CONTINUE; END IF;
  UPDATE public.spy_operation_segments SET status='arrived' WHERE id=seg.id;
  -- Chegada física não resolve investigação, captura nem carta.
  UPDATE public.spy_assets SET current_location_id=seg.to_location_id,version=version+1
   WHERE id=(SELECT asset_id FROM public.spy_operations WHERE id=seg.operation_id);
  n:=n+1;
 END LOOP;
 EXIT WHEN n=pass_count;
 END LOOP;
 INSERT INTO public.spy_operation_events(request_key,actor,event_type,reason,calendar_version)
 VALUES(p_request_key,auth.uid(),'movement_batch_reviewed',p_reason,cal.version)
 ON CONFLICT(request_key) DO NOTHING;
 RETURN jsonb_build_object('processed',n,'date',latest_date,'calendar_version',cal.version,
  'operation_review_required',true);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_process_published_movements(integer,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_process_published_movements(integer,uuid,text) TO authenticated;
-- Conclusão excepcional, sem alterar calendário, com motivo e autor rastreável.
CREATE OR REPLACE FUNCTION public.spy_finish_segment_as_narrator(
 p_segment uuid,p_request_key uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE seg public.spy_operation_segments;op public.spy_operations;date_key text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_campaign_admin() OR NOT public.campaign_access_active()
  THEN RAISE EXCEPTION 'Narrador obrigatório'; END IF;
 IF p_segment IS NULL OR p_request_key IS NULL OR length(trim(p_reason))<10
  THEN RAISE EXCEPTION 'Justificativa obrigatória'; END IF;
 SELECT * INTO seg FROM public.spy_operation_segments WHERE id=p_segment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Trecho não encontrado'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_request_key AND
  event_type='narrator_segment_override') THEN
  RETURN jsonb_build_object('duplicate',true,'id',seg.id);
 END IF;
 IF seg.status NOT IN ('planned','traveling','pending_review')
  THEN RAISE EXCEPTION 'Trecho não disponível para conclusão excepcional'; END IF;
 SELECT * INTO op FROM public.spy_operations WHERE id=seg.operation_id FOR UPDATE;
 IF op.status IN ('cancelled','completed') THEN RAISE EXCEPTION 'Missão já encerrada'; END IF;
 UPDATE public.spy_operation_segments SET status='arrived' WHERE id=seg.id;
 UPDATE public.spy_assets SET current_location_id=seg.to_location_id,version=version+1
  WHERE id=op.asset_id;
 INSERT INTO public.spy_operation_events(operation_id,request_key,actor,
  event_type,old_state,new_state,reason)
 VALUES(seg.operation_id,p_request_key,auth.uid(),'narrator_segment_override',
  seg.status,'arrived',p_reason);
 RETURN jsonb_build_object('duplicate',false,'id',seg.id,'calendar_unchanged',true);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_finish_segment_as_narrator(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_finish_segment_as_narrator(uuid,uuid,text) TO authenticated;
COMMIT;

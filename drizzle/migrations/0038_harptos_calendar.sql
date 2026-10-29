-- Harptos dates are campaign dates, never Gregorian timestamps.
CREATE FUNCTION public.valid_campaign_date(v text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE y integer; m integer; d integer;
BEGIN
 IF v IS NULL OR v !~ '^\d{4}-(\d{2}-\d{2}|F-(midwinter|greengrass|midsummer|shieldmeet|highharvestide|feast-moon))$' THEN RETURN false; END IF;
 y:=left(v,4)::integer; IF y<1 THEN RETURN false; END IF;
 IF substring(v,6,2)='F-' THEN RETURN v NOT LIKE '%shieldmeet' OR y%4=0; END IF;
 m:=substring(v,6,2)::integer; d:=right(v,2)::integer; RETURN m BETWEEN 1 AND 12 AND d BETWEEN 1 AND 30;
END $$;

CREATE FUNCTION public.enforce_campaign_mail_date() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE selected text:=nullif(current_setting('cormyr.mail_date',true),'');
BEGIN
 IF selected IS NOT NULL THEN NEW.campaign_date:=selected; END IF;
 IF NEW.campaign_date IS NOT NULL AND NOT public.valid_campaign_date(NEW.campaign_date) THEN RAISE EXCEPTION 'Data de Harptos inválida'; END IF;
 IF auth.uid() IS NOT NULL AND NEW.campaign_date IS NULL AND (TG_OP='INSERT' OR (OLD.publication_state='draft' AND NEW.publication_state<>'draft')) THEN RAISE EXCEPTION 'Selecione a data da campanha antes de salvar ou enviar'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_campaign_date BEFORE INSERT OR UPDATE ON public.campaign_letters FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_mail_date();
CREATE TRIGGER aa_campaign_date BEFORE INSERT OR UPDATE ON public.letter_replies FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_mail_date();

-- The wrapper supplies a transaction-local date to the existing permission-checked operations.
-- It never changes the caller's JWT or grants access to another recipient.
CREATE FUNCTION public.dated_mail_action(p_action text,p_args jsonb,p_date text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; previous text:=current_setting('cormyr.mail_date',true); existing_date text;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 IF NOT public.valid_campaign_date(p_date) THEN RAISE EXCEPTION 'Selecione uma data válida de Harptos'; END IF;
 PERFORM pg_advisory_xact_lock(184522);
 IF p_action='send_linked_mail' THEN
 IF EXISTS(SELECT 1 FROM campaign_letters WHERE batch_key=(p_args->>'p_key')::uuid AND sender_user_id=auth.uid() AND campaign_date IS DISTINCT FROM p_date) THEN RAISE EXCEPTION 'Chave já utilizada com outra data'; END IF;
 ELSIF p_action='reply_weekly_message' THEN
 IF EXISTS(SELECT 1 FROM letter_replies WHERE idempotency_key=(p_args->>'p_key')::uuid AND author_user_id=auth.uid() AND campaign_date IS DISTINCT FROM p_date) THEN RAISE EXCEPTION 'Chave já utilizada com outra data'; END IF;
 END IF;
 PERFORM set_config('cormyr.mail_date',p_date,true);
 CASE p_action
 WHEN 'send_linked_mail' THEN result:=public.send_linked_mail((p_args->>'p_key')::uuid,p_args->>'p_origin',ARRAY(SELECT jsonb_array_elements_text(p_args->'p_targets')),p_args->>'p_subject',p_args->>'p_content',p_args->>'p_court',p_args->>'p_unit',p_args->>'p_role',coalesce((p_args->>'p_draft')::boolean,false),(p_args->>'p_week')::integer);
 WHEN 'reply_weekly_message' THEN result:=to_jsonb(public.reply_weekly_message((p_args->>'p_letter')::uuid,(p_args->>'p_reply')::uuid,p_args->>'p_content',(p_args->>'p_key')::uuid,coalesce((p_args->>'p_draft')::boolean,false)));
 WHEN 'save_weekly_reply_draft' THEN result:=to_jsonb(public.save_weekly_reply_draft((p_args->>'p_id')::uuid,(p_args->>'p_letter')::uuid,(p_args->>'p_reply')::uuid,p_args->>'p_content'));
 WHEN 'edit_linked_mail_draft' THEN result:=public.edit_linked_mail_draft((p_args->>'p_id')::uuid,(p_args->>'p_version')::integer,p_args->>'p_subject',p_args->>'p_content',p_args->>'p_origin',p_args->>'p_court',p_args->>'p_unit',p_args->>'p_role');
 WHEN 'edit_campaign_letter' THEN result:=public.edit_campaign_letter((p_args->>'p_id')::uuid,(p_args->>'p_version')::integer,p_args->>'p_subject',p_args->>'p_content');
 WHEN 'representation' THEN result:=public.campaign_representation_action(p_args->>'p_action',p_args->'p_args');
 ELSE RAISE EXCEPTION 'Operação de missiva inválida';
 END CASE;
 PERFORM set_config('cormyr.mail_date',coalesce(previous,''),true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.dated_mail_action(text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dated_mail_action(text,jsonb,text) TO authenticated;

CREATE TABLE public.campaign_calendar (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), year integer NOT NULL DEFAULT 1522 CHECK(year BETWEEN 1 AND 9999),
 month integer NOT NULL DEFAULT 0 CHECK(month BETWEEN 0 AND 11), day integer NOT NULL DEFAULT 1 CHECK(day BETWEEN 1 AND 30),
 festival text, auto_advance boolean NOT NULL DEFAULT true, last_round integer, version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
INSERT INTO public.campaign_calendar(last_round) SELECT max(number) FROM public.letter_rounds WHERE status='open';
ALTER TABLE public.campaign_calendar ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.campaign_calendar TO authenticated;
CREATE POLICY calendar_read ON public.campaign_calendar FOR SELECT TO authenticated USING(public.campaign_access_active());
CREATE TABLE public.campaign_calendar_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor uuid,created_at timestamptz NOT NULL DEFAULT now(),before_state jsonb NOT NULL,after_state jsonb NOT NULL,reason text NOT NULL);
ALTER TABLE public.campaign_calendar_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.campaign_calendar_audit TO authenticated;
CREATE POLICY calendar_audit_read ON public.campaign_calendar_audit FOR SELECT TO authenticated USING(public.is_campaign_admin());
GRANT ALL ON public.campaign_calendar,public.campaign_calendar_audit TO service_role;

CREATE FUNCTION public.apply_calendar_months(delta integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s noble_house_sheets; next_state jsonb; projects jsonb; holdings jsonb; p jsonb; h jsonb; target integer;
BEGIN
 IF delta<=0 THEN RETURN; END IF;
 FOR s IN SELECT * FROM noble_house_sheets ORDER BY house_id LOOP
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||s.house_id,0));
 SELECT * INTO s FROM noble_house_sheets WHERE house_id=s.house_id FOR UPDATE;
 IF s.state->>'schemaVersion' IS DISTINCT FROM '1' OR NOT(s.state ? 'month') THEN CONTINUE; END IF;
 target:=(s.state->>'month')::integer+delta; next_state:=jsonb_set(s.state,'{month}',to_jsonb(target));
 projects:='[]'; holdings:=coalesce(next_state->'holdings','[]');
 FOR p IN SELECT value FROM jsonb_array_elements(coalesce(next_state->'projects','[]')) LOOP
 IF p->>'status'='building' AND (p->>'start')::integer+(p->>'duration')::integer+coalesce((p->>'modifier')::integer,0)<=target THEN
 SELECT value INTO h FROM jsonb_array_elements(holdings) WHERE value->>'id'=p->>'holdingId';
 IF h IS NULL OR h->>'status'<>'building' THEN p:=jsonb_set(p,'{status}','"cancelled"');
 ELSIF nullif(h->>'parentId','') IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(holdings) parent WHERE parent->>'id'=h->>'parentId' AND parent->>'status'='active') THEN
 p:=jsonb_set(p,'{status}','"completed"');
 SELECT jsonb_agg(CASE WHEN value->>'id'=h->>'id' THEN jsonb_set(value,'{status}','"active"') ELSE value END) INTO holdings FROM jsonb_array_elements(holdings);
 END IF;
 END IF;
 projects:=projects||jsonb_build_array(p);
 END LOOP;
 next_state:=jsonb_set(jsonb_set(next_state,'{projects}',projects),'{holdings}',holdings);
 PERFORM public.commit_noble_house_operation(auth.uid(),s.house_id,s.version,gen_random_uuid(),'calendar_advance',next_state,'Avanço do calendário global de Harptos','Calendário da campanha · meses completos');
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.apply_calendar_months(integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.set_campaign_calendar(p_version integer,p_date text,p_auto boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_row campaign_calendar; y integer; m integer; d integer; f text;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador ajusta o calendário'; END IF;
 IF NOT public.valid_campaign_date(p_date) OR p_auto IS NULL THEN RAISE EXCEPTION 'Data inválida'; END IF;
 PERFORM pg_advisory_xact_lock(184522);
 SELECT * INTO old_row FROM campaign_calendar WHERE id FOR UPDATE;
 IF p_version IS DISTINCT FROM old_row.version THEN RAISE EXCEPTION 'Calendário alterado; recarregue antes de salvar'; END IF;
 y:=left(p_date,4)::integer;
 IF substring(p_date,6,2)='F-' THEN f:=substring(p_date,8);d:=30;m:=CASE f WHEN 'midwinter' THEN 0 WHEN 'greengrass' THEN 3 WHEN 'midsummer' THEN 6 WHEN 'shieldmeet' THEN 6 WHEN 'highharvestide' THEN 8 ELSE 10 END;
 ELSE m:=substring(p_date,6,2)::integer-1;d:=right(p_date,2)::integer; END IF;
 IF (y-old_row.year)*12+m-old_row.month>120 THEN RAISE EXCEPTION 'Avance no máximo 120 meses por operação'; END IF;
 PERFORM public.apply_calendar_months((y-old_row.year)*12+m-old_row.month);
 UPDATE campaign_calendar SET year=y,month=m,day=d,festival=f,auto_advance=p_auto,version=version+1,updated_at=now(),updated_by=auth.uid() WHERE id;
 INSERT INTO campaign_calendar_audit(actor,before_state,after_state,reason) SELECT auth.uid(),to_jsonb(old_row),to_jsonb(c),'Ajuste manual do Narrador' FROM campaign_calendar c WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.set_campaign_calendar(integer,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_campaign_calendar(integer,text,boolean) TO authenticated;

CREATE FUNCTION public.advance_calendar_round() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c campaign_calendar; m integer; y integer; d integer;
BEGIN
 IF NEW.status<>'open' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(184522);
 SELECT * INTO c FROM campaign_calendar WHERE id FOR UPDATE;
 IF c.last_round IS NOT NULL AND NEW.number<=c.last_round THEN RETURN NEW; END IF;
 m:=c.month;y:=c.year;d:=c.day;
 IF c.auto_advance AND c.last_round IS NOT NULL THEN
 d:=((c.day-1)/10+1)*10+1;
 IF d>30 THEN d:=1;m:=m+1; IF m>11 THEN m:=0;y:=y+1; END IF; PERFORM public.apply_calendar_months(1); END IF;
 END IF;
 UPDATE campaign_calendar SET year=y,month=m,day=d,festival=CASE WHEN c.auto_advance AND c.last_round IS NOT NULL THEN NULL ELSE c.festival END,last_round=NEW.number,version=version+1,updated_by=auth.uid(),updated_at=now() WHERE id;
 INSERT INTO campaign_calendar_audit(actor,before_state,after_state,reason) SELECT auth.uid(),to_jsonb(c),to_jsonb(n),'Abertura da rodada '||NEW.number FROM campaign_calendar n WHERE id;
 RETURN NEW;
END $$;
CREATE TRIGGER calendar_round AFTER INSERT OR UPDATE OF status ON public.letter_rounds FOR EACH ROW EXECUTE FUNCTION public.advance_calendar_round();

CREATE FUNCTION public.calendar_mail_events(p_year integer,p_month integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(event ORDER BY event->>'date',event->>'id'),'[]') FROM (
 SELECT jsonb_build_object('id','letter:'||l.id,'date',l.campaign_date,'title',l.subject,'kind','mail') event FROM campaign_letters l
 WHERE l.deleted_at IS NULL AND l.publication_state='delivered' AND public.valid_campaign_date(l.campaign_date)
 AND left(l.campaign_date,4)=lpad(p_year::text,4,'0') AND (substring(l.campaign_date,6,2)=lpad((p_month+1)::text,2,'0') OR substring(l.campaign_date,6,2)='F-')
 UNION ALL
 SELECT jsonb_build_object('id','reply:'||r.id,'date',r.campaign_date,'title','Resposta · '||l.subject,'kind','mail') FROM letter_replies r JOIN campaign_letters l ON l.id=r.letter_id
 WHERE l.deleted_at IS NULL AND l.publication_state='delivered' AND r.publication_state='delivered' AND public.valid_campaign_date(r.campaign_date)
 AND left(r.campaign_date,4)=lpad(p_year::text,4,'0') AND (substring(r.campaign_date,6,2)=lpad((p_month+1)::text,2,'0') OR substring(r.campaign_date,6,2)='F-')
 ) visible_events
$$;
REVOKE ALL ON FUNCTION public.calendar_mail_events(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calendar_mail_events(integer,integer) TO authenticated;
CREATE INDEX campaign_letters_calendar_date ON public.campaign_letters(campaign_date) WHERE publication_state='delivered' AND deleted_at IS NULL;
CREATE INDEX letter_replies_calendar_date ON public.letter_replies(campaign_date) WHERE publication_state='delivered';
CREATE FUNCTION public.get_campaign_calendar() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT to_jsonb(c) FROM public.campaign_calendar c WHERE id $$;
REVOKE ALL ON FUNCTION public.get_campaign_calendar() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_calendar() TO authenticated;

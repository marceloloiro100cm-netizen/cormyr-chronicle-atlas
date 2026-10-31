-- Hub Temporal, Lote 4. One authoritative, idempotent writer for the game clock.
-- This is a NEW migration; no production DDL is run from ChatGPT.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30000ms';

-- Calendar dates and tendays do not use Gregorian arithmetic.
CREATE OR REPLACE FUNCTION public.harptos_time_key(p_year integer,p_month integer,p_day integer,p_festival text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT lpad(p_year::text,4,'0')||'-'||CASE
 WHEN p_festival IS NULL THEN lpad((p_month+1)::text,2,'0')||'-'||lpad(p_day::text,2,'0')
 ELSE 'F-'||p_festival END
$$;

CREATE OR REPLACE FUNCTION public.harptos_ordinary_index(p_date text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE y integer;m integer;d integer;f text;
BEGIN
 IF NOT public.valid_campaign_date(p_date) THEN RAISE EXCEPTION 'Data de Harptos inválida'; END IF;
 y:=left(p_date,4)::integer;
 IF substring(p_date,6,2)='F-' THEN
  f:=substring(p_date,8);
  m:=CASE f WHEN 'midwinter' THEN 0 WHEN 'greengrass' THEN 3
    WHEN 'midsummer' THEN 6 WHEN 'shieldmeet' THEN 6
    WHEN 'highharvestide' THEN 8 WHEN 'feast-moon' THEN 10 END;
  d:=30;
 ELSE m:=substring(p_date,6,2)::integer-1;d:=right(p_date,2)::integer;
 END IF;
 RETURN (y-1)*360+m*30+d-1;
END $$;

CREATE OR REPLACE FUNCTION public.harptos_from_ordinary_index(p_index integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE y integer; m integer; d integer;
BEGIN
 IF p_index IS NULL OR p_index < 0 OR p_index >= 9999*360 THEN
  RAISE EXCEPTION 'Avanço ultrapassa o calendário de Harptos';
 END IF;
 y:=p_index/360+1; m:=(p_index%360)/30; d:=p_index%30+1;
 RETURN public.harptos_time_key(y,m,d,NULL);
END $$;

CREATE OR REPLACE FUNCTION public.harptos_advance_desdia(p_start text,p_count integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE i integer;
BEGIN
 IF p_count IS NULL OR p_count NOT BETWEEN 0 AND 120 THEN
  RAISE EXCEPTION 'Informe entre zero e 120 désdias';
 END IF;
 i:=public.harptos_ordinary_index(p_start);
 IF p_count=0 THEN RETURN p_start; END IF;
 RETURN public.harptos_from_ordinary_index(i+p_count*10);
END $$;

-- Absolute chronological day number INCLUDING intercalary festivals (one
-- additional day in every year divisible by four, after Midsummer).
CREATE OR REPLACE FUNCTION public.harptos_calendar_ordinal(p_date text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE y integer; m integer; d integer; f text; extra integer;
BEGIN
 IF NOT public.valid_campaign_date(p_date) THEN RAISE EXCEPTION 'Data de Harptos inválida'; END IF;
 y:=left(p_date,4)::integer;
 IF substring(p_date,6,2)='F-' THEN
  f:=substring(p_date,8);
  m:=CASE f WHEN 'midwinter' THEN 0 WHEN 'greengrass' THEN 3
    WHEN 'midsummer' THEN 6 WHEN 'shieldmeet' THEN 6
    WHEN 'highharvestide' THEN 8 WHEN 'feast-moon' THEN 10 END;
  d:=31;
 ELSE m:=substring(p_date,6,2)::integer-1;d:=right(p_date,2)::integer;
 END IF;
 extra:=(CASE WHEN m>0 THEN 1 ELSE 0 END)+
        (CASE WHEN m>3 THEN 1 ELSE 0 END)+
        (CASE WHEN m>6 THEN 1+CASE WHEN y%4=0 THEN 1 ELSE 0 END ELSE 0 END)+
        (CASE WHEN m>8 THEN 1 ELSE 0 END)+
        (CASE WHEN m>10 THEN 1 ELSE 0 END);
 RETURN (y-1)*365+(y-1)/4 + m*30+extra + d-1+
        CASE WHEN f='shieldmeet' THEN 1 ELSE 0 END;
END $$;

-- Generates the next calendar date independently of the legacy week/round.
CREATE OR REPLACE FUNCTION public.resolve_campaign_time_target(
 p_mode text,p_date text,p_count integer,p_current text
) RETURNS text LANGUAGE plpgsql STABLE SET search_path=public AS $$
BEGIN
 IF p_mode='advance' THEN
  IF p_date IS NOT NULL THEN RAISE EXCEPTION 'Avanço de désdia não aceita data arbitrária'; END IF;
  IF p_count IS NULL OR p_count NOT BETWEEN 1 AND 120 THEN
   RAISE EXCEPTION 'Informe entre uma e 120 désdias'; END IF;
  RETURN public.harptos_advance_desdia(p_current,p_count);
 ELSIF p_mode='set' THEN
  IF NOT public.valid_campaign_date(p_date) THEN RAISE EXCEPTION 'Data de Harptos inválida'; END IF;
  RETURN p_date;
 ELSIF p_mode='publish' THEN
  IF p_date IS NOT NULL THEN RAISE EXCEPTION 'Publicação de eventos não aceita outra data'; END IF;
  RETURN p_current;
 ELSE RAISE EXCEPTION 'Modo de publicação temporal inválido';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.campaign_time_operations(
 id uuid PRIMARY KEY,
 actor uuid NOT NULL,
 request_hash text NOT NULL,
 expected_version integer NOT NULL,
 mode text NOT NULL CHECK(mode IN ('advance','set','publish')),
 from_date text NOT NULL CHECK(public.valid_campaign_date(from_date)),
 to_date text NOT NULL CHECK(public.valid_campaign_date(to_date)),
 before_state jsonb NOT NULL,
 after_state jsonb NOT NULL,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_time_operations_created ON public.campaign_time_operations(created_at DESC);
ALTER TABLE public.campaign_time_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_time_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.campaign_time_operations TO service_role;
-- Narrator history is only exposed by a permission-checked RPC.
-- No outbox includes private content from Casas or missivas.

CREATE OR REPLACE FUNCTION public.preview_campaign_time_change(
 p_version integer,p_mode text,p_date text DEFAULT NULL,p_count integer DEFAULT 1,
 p_allow_backdate boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.campaign_calendar; start_date text; end_date text;
 base_month integer; target_month integer; delta integer; start_ordinal integer; end_ordinal integer;
 crossed jsonb; year_crossings jsonb; house_count integer;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador consulta a prévia'; END IF;
 SELECT * INTO c FROM public.campaign_calendar WHERE id=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Calendário oficial indisponível'; END IF;
 IF p_version IS DISTINCT FROM c.version THEN RAISE EXCEPTION 'Calendário alterado; recarregue antes de salvar'; END IF;
 start_date:=public.harptos_time_key(c.year,c.month,c.day,c.festival);
 end_date:=public.resolve_campaign_time_target(p_mode,p_date,p_count,start_date);
 base_month:=c.year*12+c.month;
 target_month:=left(end_date,4)::integer*12+
   CASE WHEN substring(end_date,6,2)='F-' THEN
    CASE substring(end_date,8) WHEN 'midwinter' THEN 0 WHEN 'greengrass' THEN 3
     WHEN 'midsummer' THEN 6 WHEN 'shieldmeet' THEN 6 WHEN 'highharvestide' THEN 8 ELSE 10 END
   ELSE substring(end_date,6,2)::integer-1 END;
 delta:=target_month-base_month;
 IF delta>120 OR delta< -120 THEN RAISE EXCEPTION 'Altere no máximo 120 meses por operação'; END IF;
 start_ordinal:=public.harptos_calendar_ordinal(start_date);
 end_ordinal:=public.harptos_calendar_ordinal(end_date);
 WITH festivals(id,month,day_order) AS (VALUES
  ('midwinter',0,0),('greengrass',3,0),('midsummer',6,0),('shieldmeet',6,1),
  ('highharvestide',8,0),('feast-moon',10,0)
 ), candidates AS (
 SELECT public.harptos_time_key(y.yr,f.month,30,f.id) AS event_date
 FROM generate_series(least(c.year,left(end_date,4)::integer),
                      greatest(c.year,left(end_date,4)::integer)) y(yr)
 CROSS JOIN festivals f
 WHERE f.id<>'shieldmeet' OR y.yr%4=0
 ), crossed_dates AS (
 SELECT event_date,public.harptos_calendar_ordinal(event_date) AS ordinal FROM candidates
 )
 SELECT coalesce(jsonb_agg(event_date ORDER BY
   CASE WHEN end_ordinal>=start_ordinal THEN ordinal ELSE -ordinal END),'[]'::jsonb)
 INTO crossed FROM crossed_dates
 WHERE (end_ordinal>start_ordinal AND ordinal>start_ordinal AND ordinal<=end_ordinal)
    OR (end_ordinal<start_ordinal AND ordinal<start_ordinal AND ordinal>=end_ordinal);
 SELECT coalesce(jsonb_agg(y ORDER BY
  CASE WHEN end_ordinal>=start_ordinal THEN y ELSE -y END),'[]'::jsonb)
 INTO year_crossings
 FROM generate_series(least(c.year,left(end_date,4)::integer)+1,
  greatest(c.year,left(end_date,4)::integer)) as y
 WHERE (end_ordinal>start_ordinal AND y>c.year)
    OR (end_ordinal<start_ordinal AND y<=c.year);
 SELECT count(*)::integer INTO house_count FROM public.noble_house_sheets
 WHERE state->>'schemaVersion'='1' AND state ? 'month';
 RETURN jsonb_build_object(
  'version',c.version,'from',start_date,'to',end_date,'mode',p_mode,
  'ordinary_days',public.harptos_ordinary_index(end_date)-public.harptos_ordinary_index(start_date),
  'calendar_days',end_ordinal-start_ordinal,'month_delta',delta,
  'backdated',end_ordinal<start_ordinal,
  'backdate_authorized',coalesce(p_allow_backdate,false),
  'crossed_festivals',crossed,'crossed_years',year_crossings,
  'house_sheets_to_check',CASE WHEN delta>0 THEN house_count ELSE 0 END,
  'published_week_unchanged',c.published_week
 );
END $$;
REVOKE ALL ON FUNCTION public.preview_campaign_time_change(integer,text,text,integer,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_campaign_time_change(integer,text,text,integer,boolean)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_campaign_time_change(
 p_version integer,p_key uuid,p_mode text,p_date text DEFAULT NULL,p_count integer DEFAULT 1,
 p_reason text DEFAULT '',p_allow_backdate boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE old_row public.campaign_calendar; saved public.campaign_calendar;
 existing public.campaign_time_operations; current_date_key text; target_date_key text;
 target_year integer;target_month integer;target_day integer;target_festival text;
 delta_months integer; from_ordinal integer; to_ordinal integer; signature text;
 actor_id uuid; changed_events integer; planned jsonb;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador altera o calendário'; END IF;
 actor_id:=auth.uid();
 IF actor_id IS NULL OR p_key IS NULL OR p_version IS NULL THEN
  RAISE EXCEPTION 'Identificação, versão e chave temporal obrigatórias'; END IF;
 signature:=md5(jsonb_build_object(
   'version',p_version,'mode',p_mode,'date',p_date,'count',p_count,
   'reason',coalesce(p_reason,''),'backdate',coalesce(p_allow_backdate,false))::text);
 -- Same lock as the legacy mail/calendar operations. A retry observes its
 -- committed operation before interpreting a stale optimistic version.
 PERFORM pg_advisory_xact_lock(184522);
 SELECT * INTO existing FROM public.campaign_time_operations WHERE id=p_key;
 IF FOUND THEN
  IF existing.actor IS DISTINCT FROM actor_id OR existing.request_hash IS DISTINCT FROM signature THEN
   RAISE EXCEPTION 'Chave temporal já utilizada com outros parâmetros'; END IF;
  RETURN existing.after_state || jsonb_build_object('duplicate',true,'operation_key',p_key);
 END IF;
 SELECT * INTO old_row FROM public.campaign_calendar WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Calendário oficial indisponível'; END IF;
 IF old_row.version IS DISTINCT FROM p_version THEN
  RAISE EXCEPTION 'Calendário alterado; recarregue antes de salvar'; END IF;
 planned:=public.preview_campaign_time_change(p_version,p_mode,p_date,p_count,p_allow_backdate);
 current_date_key:=planned->>'from';target_date_key:=planned->>'to';
 delta_months:=(planned->>'month_delta')::integer;
 from_ordinal:=public.harptos_calendar_ordinal(current_date_key);
 to_ordinal:=public.harptos_calendar_ordinal(target_date_key);
 IF to_ordinal<from_ordinal AND
    (NOT coalesce(p_allow_backdate,false) OR length(btrim(coalesce(p_reason,'')))<10) THEN
  RAISE EXCEPTION 'Retrocesso exige autorização expressa e justificativa de dez caracteres'; END IF;
 target_year:=left(target_date_key,4)::integer;
 IF substring(target_date_key,6,2)='F-' THEN
  target_festival:=substring(target_date_key,8);target_day:=30;
  target_month:=CASE target_festival WHEN 'midwinter' THEN 0
   WHEN 'greengrass' THEN 3 WHEN 'midsummer' THEN 6 WHEN 'shieldmeet' THEN 6
   WHEN 'highharvestide' THEN 8 ELSE 10 END;
 ELSE
  target_month:=substring(target_date_key,6,2)::integer-1;
  target_day:=right(target_date_key,2)::integer;target_festival:=NULL;
 END IF;
 -- This applies only the non-negative number of months and remains atomic
 -- with the calendar publication. Backdating never reverses past ledger rows.
 IF delta_months>0 THEN PERFORM public.apply_calendar_months(delta_months); END IF;
 UPDATE public.campaign_calendar SET year=target_year,month=target_month,
   day=target_day,festival=target_festival,auto_advance=false,
   version=version+1,updated_at=now(),updated_by=actor_id,published_at=now()
 WHERE id=true RETURNING * INTO saved;
 -- Publish already staged events. The drafts never become directly readable.
 INSERT INTO public.campaign_schedule_event_audit(event_id,actor,reason,before_state,after_state)
 SELECT id,actor_id,'Publicação temporal '||p_key,to_jsonb(e),
   jsonb_build_object('date',CASE WHEN draft_deleted THEN NULL ELSE draft_date END,
     'title',CASE WHEN draft_deleted THEN NULL ELSE draft_title END)
 FROM public.campaign_schedule_events e
 WHERE (draft_deleted AND published_date IS NOT NULL)
   OR (NOT draft_deleted AND (published_date IS DISTINCT FROM draft_date
    OR published_title IS DISTINCT FROM draft_title
    OR published_description IS DISTINCT FROM draft_description));
 UPDATE public.campaign_schedule_events SET
   published_date=CASE WHEN draft_deleted THEN NULL ELSE draft_date END,
   published_title=CASE WHEN draft_deleted THEN NULL ELSE draft_title END,
   published_description=CASE WHEN draft_deleted THEN NULL ELSE draft_description END,
   version=version+1
 WHERE (draft_deleted AND published_date IS NOT NULL)
   OR (NOT draft_deleted AND (published_date IS DISTINCT FROM draft_date
    OR published_title IS DISTINCT FROM draft_title
    OR published_description IS DISTINCT FROM draft_description));
 INSERT INTO public.campaign_calendar_audit(actor,before_state,after_state,reason)
 VALUES(actor_id,to_jsonb(old_row),to_jsonb(saved),
   'Hub Temporal · '||p_mode||' · operação '||p_key||
   CASE WHEN length(btrim(coalesce(p_reason,'')))>0 THEN ' · '||left(btrim(p_reason),500) ELSE '' END);
 INSERT INTO public.campaign_time_operations(
  id,actor,request_hash,expected_version,mode,from_date,to_date,before_state,after_state,reason)
 VALUES(p_key,actor_id,signature,p_version,p_mode,current_date_key,target_date_key,
  to_jsonb(old_row),to_jsonb(saved),left(btrim(coalesce(p_reason,'')),500));
 RETURN to_jsonb(saved)||jsonb_build_object('duplicate',false,'operation_key',p_key);
END $$;
REVOKE ALL ON FUNCTION public.publish_campaign_time_change(integer,uuid,text,text,integer,text,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_campaign_time_change(integer,uuid,text,text,integer,text,boolean)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.get_campaign_time_history(p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Histórico temporal exclusivo do Narrador'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Limite de histórico inválido'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'actor',actor,'mode',mode,'from',from_date,'to',to_date,
  'version_before',expected_version,'version_after',(after_state->>'version')::integer,
  'reason',reason,'created_at',created_at) ORDER BY created_at DESC,id DESC),'[]'::jsonb)
 INTO result FROM (
   SELECT * FROM public.campaign_time_operations ORDER BY created_at DESC,id DESC LIMIT p_limit
 ) list;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_campaign_time_history(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_time_history(integer) TO authenticated;

-- Opening a letter round records its Harptos period in the already-existing
-- BEFORE trigger, but must not touch year, month, day, version or published_week.
DROP TRIGGER IF EXISTS calendar_round ON public.letter_rounds;
DROP TRIGGER IF EXISTS sync_campaign_calendar_week ON public.campaign_calendar;

-- Block the obsolete entrypoints instead of leaving bypasses without an
-- idempotency key. The narrator UI now uses publish_campaign_time_change.
REVOKE EXECUTE ON FUNCTION public.set_campaign_calendar(integer,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_campaign_schedule(integer,text,boolean,integer) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_campaign_schedule_confirmed(integer,text,boolean,integer)
 FROM PUBLIC,anon,authenticated;
-- The unused trigger function remains for migration compatibility, but cannot
-- be invoked through an INSERT or UPDATE of letter_rounds.

COMMIT;

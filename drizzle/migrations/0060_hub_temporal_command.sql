-- Hub Temporal · Lote 4. All date changes use one versioned/idempotent command.
-- No automatic age/fortune/missive delivery; future consumers will read the outbox.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25000ms';

CREATE TABLE public.campaign_time_changes (
  operation_key uuid PRIMARY KEY,
  actor uuid NOT NULL,
  expected_version integer NOT NULL,
  desdias integer NOT NULL CHECK(desdias BETWEEN 1 AND 360),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 500),
  from_date text NOT NULL,
  to_date text NOT NULL,
  from_version integer NOT NULL,
  to_version integer NOT NULL,
  impact jsonb NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_time_changes_created ON public.campaign_time_changes(created_at DESC);
ALTER TABLE public.campaign_time_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaign_time_changes_gm_read ON public.campaign_time_changes
  FOR SELECT TO authenticated USING(public.is_campaign_admin());
REVOKE ALL ON public.campaign_time_changes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.campaign_time_changes TO authenticated;
GRANT ALL ON public.campaign_time_changes TO service_role;

-- Durable pending notifications: no effect consumers are enabled yet.
CREATE TABLE public.campaign_time_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_key uuid NOT NULL REFERENCES public.campaign_time_changes(operation_key),
  kind text NOT NULL CHECK(kind IN (
    'campaign.desdia.advanced','campaign.date.changed','campaign.month.changed',
    'campaign.year.changed','campaign.season.changed','campaign.festival.crossed'
  )),
  event_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(operation_key,kind,event_key)
);
ALTER TABLE public.campaign_time_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaign_time_outbox_gm_read ON public.campaign_time_outbox
  FOR SELECT TO authenticated USING(public.is_campaign_admin());
REVOKE ALL ON public.campaign_time_outbox FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.campaign_time_outbox TO authenticated;
GRANT ALL ON public.campaign_time_outbox TO service_role;

-- Date helper: count only 360 ordinary days per year. The intercalary day
-- immediately follows day 30 of its parent month and shares its ordinary index.
CREATE FUNCTION public.harptos_add_desdias(p_from text,p_desdias integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE y integer; m integer; d integer; f text; absolute_day bigint;
  new_year integer; new_month integer; new_day integer;
BEGIN
 IF NOT public.valid_campaign_date(p_from) THEN RAISE EXCEPTION 'Data inicial de Harptos inválida'; END IF;
 IF p_desdias IS NULL OR p_desdias NOT BETWEEN 0 AND 360
 THEN RAISE EXCEPTION 'Avance entre 0 e 360 désdias'; END IF;
 IF p_desdias=0 THEN RETURN p_from; END IF;
 y:=left(p_from,4)::integer;
 IF substring(p_from,6,2)='F-' THEN
   f:=substring(p_from,8);
   m:=CASE f WHEN 'midwinter' THEN 0 WHEN 'greengrass' THEN 3
       WHEN 'midsummer' THEN 6 WHEN 'shieldmeet' THEN 6
       WHEN 'highharvestide' THEN 8 ELSE 10 END;
   d:=30;
 ELSE
   m:=substring(p_from,6,2)::integer-1;
   d:=right(p_from,2)::integer;
 END IF;
 absolute_day:=((y-1)::bigint*360)+(m*30)+(d-1)+(p_desdias::bigint*10);
 IF absolute_day>=9999::bigint*360 THEN
   RAISE EXCEPTION 'A data excede o ano 9999 CV';
 END IF;
 new_year:=(absolute_day/360)::integer+1;
 new_month:=((absolute_day%360)/30)::integer;
 new_day:=(absolute_day%30)::integer+1;
 RETURN lpad(new_year::text,4,'0')||'-'||lpad((new_month+1)::text,2,'0')||
   '-'||lpad(new_day::text,2,'0');
END $$;
REVOKE ALL ON FUNCTION public.harptos_add_desdias(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.harptos_add_desdias(text,integer) TO authenticated;

-- Only the narrator can inspect economic impact; no house names or private letters
-- are embedded in the broadcast data.
CREATE FUNCTION public.preview_campaign_time_change(p_version integer,p_desdias integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.campaign_calendar; original text; destination text;
  target_y integer; target_m integer; old_m integer; delta integer;
  house_drift integer; projects_count integer; months jsonb:='[]'::jsonb;
  years jsonb:='[]'::jsonb; festivals jsonb:='[]'::jsonb;
  seasons jsonb:='[]'::jsonb; i integer; curr_y integer; curr_m integer;
  prior_m integer; festival_key text; festival_id text;
  old_season text; new_season text;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador consulta impactos temporais'; END IF;
 SELECT * INTO STRICT c FROM public.campaign_calendar WHERE id=true;
 IF c.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Calendário alterado; recarregue antes de avançar'; END IF;
 IF p_desdias IS NULL OR p_desdias NOT BETWEEN 1 AND 360
 THEN RAISE EXCEPTION 'O avanço deve conter de 1 a 360 désdias'; END IF;
 original:=lpad(c.year::text,4,'0')||'-'||CASE WHEN c.festival IS NOT NULL
   THEN 'F-'||c.festival
   ELSE lpad((c.month+1)::text,2,'0')||'-'||lpad(c.day::text,2,'0') END;
 destination:=public.harptos_add_desdias(original,p_desdias);
 target_y:=left(destination,4)::integer;
 target_m:=substring(destination,6,2)::integer-1;
 old_m:=c.year*12+c.month;
 delta:=target_y*12+target_m-old_m;
 IF delta>120 THEN RAISE EXCEPTION 'Avance no máximo 120 meses por operação'; END IF;

 SELECT count(*) INTO house_drift FROM public.noble_house_sheets s
 WHERE s.state->>'schemaVersion'='1' AND (
   NOT(s.state ? 'month')
   OR (s.state->>'month')::integer IS DISTINCT FROM old_m);
 SELECT count(*) INTO projects_count
 FROM public.noble_house_sheets s,
 LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.state->'projects')='array'
   THEN s.state->'projects' ELSE '[]'::jsonb END) p
 WHERE s.state->>'schemaVersion'='1'
   AND p->>'status'='building'
   AND (p->>'start')::integer+(p->>'duration')::integer+
       coalesce((p->>'modifier')::integer,0)<=old_m+delta
   AND (p->>'start')::integer+(p->>'duration')::integer+
       coalesce((p->>'modifier')::integer,0)>old_m;

 FOR i IN old_m+1..target_y*12+target_m LOOP
   curr_y:=i/12;curr_m:=i%12;prior_m:=(curr_m+11)%12;
   months:=months||jsonb_build_array(jsonb_build_object('year',curr_y,'month',curr_m));
   IF curr_m=0 THEN years:=years||to_jsonb(curr_y); END IF;
   old_season:=CASE WHEN prior_m IN (11,0,1) THEN 'winter'
     WHEN prior_m IN (2,3,4) THEN 'spring'
     WHEN prior_m IN (5,6,7) THEN 'summer' ELSE 'autumn' END;
   new_season:=CASE WHEN curr_m IN (11,0,1) THEN 'winter'
     WHEN curr_m IN (2,3,4) THEN 'spring'
     WHEN curr_m IN (5,6,7) THEN 'summer' ELSE 'autumn' END;
   IF old_season<>new_season THEN
     seasons:=seasons||jsonb_build_array(jsonb_build_object(
       'year',curr_y,'month',curr_m,'from',old_season,'to',new_season));
   END IF;
   -- The boundary crosses festivals belonging to the month just completed.
   IF prior_m IN (0,3,6,8,10) THEN
     IF prior_m=0 THEN festival_id:='midwinter';
     ELSIF prior_m=3 THEN festival_id:='greengrass';
     ELSIF prior_m=6 THEN festival_id:='midsummer';
     ELSIF prior_m=8 THEN festival_id:='highharvestide';
     ELSE festival_id:='feast-moon'; END IF;
     festival_key:=lpad((CASE WHEN curr_m=0 THEN curr_y-1 ELSE curr_y END)::text,4,'0')||
       '-F-'||festival_id;
     -- Festival of origin is excluded from impact; this boundary follows it.
     IF original<>festival_key AND NOT (prior_m=6 AND original LIKE '%F-shieldmeet') THEN
       festivals:=festivals||jsonb_build_array(jsonb_build_object('date',festival_key,'id',festival_id));
     END IF;
     IF prior_m=6 AND (CASE WHEN curr_m=0 THEN curr_y-1 ELSE curr_y END)%4=0 THEN
       festival_key:=lpad((CASE WHEN curr_m=0 THEN curr_y-1 ELSE curr_y END)::text,4,'0')||
         '-F-shieldmeet';
       IF original<>festival_key THEN
         festivals:=festivals||jsonb_build_array(jsonb_build_object('date',festival_key,'id','shieldmeet'));
       END IF;
     END IF;
   END IF;
 END LOOP;
 RETURN jsonb_build_object(
   'from',original,'to',destination,'expected_version',p_version,
   'desdias',p_desdias,'ordinary_days',p_desdias*10,
   'months_delta',delta,'crossed_months',months,
   'crossed_years',years,'crossed_seasons',seasons,
   'crossed_festivals',festivals,
   'houses_drifted',house_drift,'projects_maturing',projects_count,
   'can_publish',house_drift=0
 );
END $$;
REVOKE ALL ON FUNCTION public.preview_campaign_time_change(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_campaign_time_change(integer,integer) TO authenticated;

CREATE FUNCTION public.publish_campaign_time_change(
  p_key uuid,p_expected_version integer,p_desdias integer,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.campaign_calendar; saved public.campaign_calendar;
  prior public.campaign_time_changes; impact jsonb; next_date text;
  target_y integer; target_m integer; target_d integer; delta integer; f jsonb;
  ev jsonb; m jsonb; y jsonb; s jsonb; change_reason text;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador avança o tempo'; END IF;
 IF p_key IS NULL OR p_expected_version IS NULL OR p_desdias IS NULL
   OR p_desdias NOT BETWEEN 1 AND 360 OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 500
 THEN RAISE EXCEPTION 'Forneça chave, versão, désdias e justificativa (10–500 caracteres)'; END IF;
 change_reason:=btrim(p_reason);
 PERFORM pg_advisory_xact_lock(184522);
 SELECT * INTO STRICT c FROM public.campaign_calendar WHERE id=true FOR UPDATE;
 -- A retry is safe even after other changes, but only for exactly the same caller/payload.
 SELECT * INTO prior FROM public.campaign_time_changes WHERE operation_key=p_key;
 IF FOUND THEN
   IF prior.actor IS DISTINCT FROM auth.uid()
      OR prior.expected_version IS DISTINCT FROM p_expected_version
      OR prior.desdias IS DISTINCT FROM p_desdias OR prior.reason IS DISTINCT FROM change_reason
   THEN RAISE EXCEPTION 'Chave de avanço temporal já utilizada com parâmetros diferentes'; END IF;
   RETURN jsonb_build_object('duplicate',true,'snapshot',to_jsonb(c),
      'change',prior.impact,'original_to',prior.to_date);
 END IF;
 IF c.version IS DISTINCT FROM p_expected_version THEN
   RAISE EXCEPTION 'Calendário alterado; recarregue antes de avançar';
 END IF;
 impact:=public.preview_campaign_time_change(p_expected_version,p_desdias);
 IF (impact->>'can_publish')::boolean IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Existem Casas em mês divergente; concilie-as antes de avançar o Reino';
 END IF;
 next_date:=impact->>'to';
 target_y:=left(next_date,4)::integer;target_m:=substring(next_date,6,2)::integer-1;
 target_d:=right(next_date,2)::integer;delta:=(impact->>'months_delta')::integer;
 IF delta>0 THEN PERFORM public.apply_calendar_months(delta); END IF;

 UPDATE public.campaign_calendar
 SET year=target_y,month=target_m,day=target_d,festival=NULL,
   version=version+1,updated_at=now(),updated_by=auth.uid(),published_at=now()
 WHERE id=true RETURNING * INTO saved;

 INSERT INTO public.campaign_time_changes(
    operation_key,actor,expected_version,desdias,reason,
    from_date,to_date,from_version,to_version,impact,before_state,after_state
 ) VALUES (
   p_key,auth.uid(),p_expected_version,p_desdias,change_reason,
   impact->>'from',next_date,c.version,saved.version,impact,to_jsonb(c),to_jsonb(saved)
 );

 INSERT INTO public.campaign_calendar_audit(actor,before_state,after_state,reason)
 VALUES (auth.uid(),to_jsonb(c),to_jsonb(saved),
    'Avanço central de '||p_desdias||' désdia(s) · '||change_reason);

 INSERT INTO public.campaign_time_outbox(operation_key,kind,event_key,payload)
 VALUES (p_key,'campaign.date.changed',next_date,
           jsonb_build_object('from',impact->>'from','to',next_date,'version',saved.version)),
        (p_key,'campaign.desdia.advanced',next_date,
           jsonb_build_object('desdias',p_desdias,'days',p_desdias*10,'to',next_date,'version',saved.version));
 FOR m IN SELECT value FROM jsonb_array_elements(impact->'crossed_months') LOOP
   INSERT INTO public.campaign_time_outbox(operation_key,kind,event_key,payload)
   VALUES(p_key,'campaign.month.changed',(m->>'year')||'-'||(m->>'month'),m);
 END LOOP;
 FOR y IN SELECT value FROM jsonb_array_elements(impact->'crossed_years') LOOP
   INSERT INTO public.campaign_time_outbox(operation_key,kind,event_key,payload)
   VALUES(p_key,'campaign.year.changed',y#>>'{}',jsonb_build_object('year',y));
 END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(impact->'crossed_seasons') LOOP
   INSERT INTO public.campaign_time_outbox(operation_key,kind,event_key,payload)
   VALUES(p_key,'campaign.season.changed',(s->>'year')||'-'||(s->>'month'),s);
 END LOOP;
 FOR f IN SELECT value FROM jsonb_array_elements(impact->'crossed_festivals') LOOP
   INSERT INTO public.campaign_time_outbox(operation_key,kind,event_key,payload)
   VALUES(p_key,'campaign.festival.crossed',f->>'date',f);
 END LOOP;
 RETURN jsonb_build_object('duplicate',false,'snapshot',to_jsonb(saved),'change',impact);
END $$;
REVOKE ALL ON FUNCTION public.publish_campaign_time_change(uuid,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_campaign_time_change(uuid,integer,integer,text) TO authenticated;

CREATE FUNCTION public.get_campaign_time_change_history(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE history jsonb;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador consulta o histórico temporal'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Limite inválido'; END IF;
 SELECT coalesce(jsonb_agg(item ORDER BY item->>'created_at' DESC),'[]'::jsonb)
 INTO history FROM (
   SELECT jsonb_build_object('key',operation_key,'from',from_date,'to',to_date,
     'version',to_version,'desdias',desdias,'reason',reason,'actor',actor,
     'created_at',created_at,'impact',impact) AS item
   FROM public.campaign_time_changes ORDER BY created_at DESC LIMIT p_limit
 ) results;
 RETURN history;
END $$;
REVOKE ALL ON FUNCTION public.get_campaign_time_change_history(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_time_change_history(integer) TO authenticated;

-- Opening mail rounds no longer moves the date or triggers monthly purchases.
-- Its sequential number is retained for compatibility with delivery workflows.
CREATE OR REPLACE FUNCTION public.advance_calendar_round()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.campaign_calendar;
BEGIN
 IF NEW.status<>'open' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(184522);
 SELECT * INTO STRICT c FROM public.campaign_calendar WHERE id=true FOR UPDATE;
 IF c.last_round IS NULL OR NEW.number>c.last_round THEN
   UPDATE public.campaign_calendar SET last_round=NEW.number WHERE id=true;
   -- Existing sync_campaign_calendar_week trigger updates published_week only.
 END IF;
 RETURN NEW;
END $$;

-- Do not let a legacy screen/RPC bypass the new single time-advance command.
-- Existing event publication remains usable only for the already-published date.
CREATE OR REPLACE FUNCTION public.set_campaign_calendar(
 p_version integer,p_date text,p_auto boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.campaign_calendar; existing_date text;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador ajusta o calendário'; END IF;
 IF NOT public.valid_campaign_date(p_date) OR p_auto IS NULL THEN RAISE EXCEPTION 'Data inválida'; END IF;
 PERFORM pg_advisory_xact_lock(184522);
 SELECT * INTO STRICT c FROM public.campaign_calendar WHERE id=true FOR UPDATE;
 IF c.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Calendário alterado; recarregue antes de salvar'; END IF;
 existing_date:=lpad(c.year::text,4,'0')||'-'||CASE WHEN c.festival IS NOT NULL
   THEN 'F-'||c.festival
   ELSE lpad((c.month+1)::text,2,'0')||'-'||lpad(c.day::text,2,'0') END;
 IF p_date IS DISTINCT FROM existing_date THEN
   RAISE EXCEPTION 'Para alterar a data oficial utilize o comando de avanço de désdias';
 END IF;
 UPDATE public.campaign_calendar SET auto_advance=p_auto,version=version+1,
    updated_at=now(),updated_by=auth.uid() WHERE id=true;
END $$;

COMMIT;

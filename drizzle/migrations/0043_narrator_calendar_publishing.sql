-- Shared Harptos calendar publishing: staged narrator events, public snapshots and week.
-- Existing campaign date, automatic tendays and project advancement remain authoritative.
ALTER TABLE public.campaign_calendar
  ADD COLUMN published_week integer NOT NULL DEFAULT 1 CHECK (published_week BETWEEN 1 AND 100000),
  ADD COLUMN published_at timestamptz;
UPDATE public.campaign_calendar SET
  published_week=greatest(1,coalesce(last_round,1)),
  published_at=coalesce(updated_at,now());

CREATE TABLE public.campaign_schedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_date text NOT NULL CHECK (public.valid_campaign_date(draft_date)),
  draft_title text NOT NULL CHECK (length(btrim(draft_title)) BETWEEN 1 AND 180),
  draft_description text NOT NULL DEFAULT '' CHECK (length(draft_description)<=4000),
  draft_deleted boolean NOT NULL DEFAULT false,
  published_date text CHECK (published_date IS NULL OR public.valid_campaign_date(published_date)),
  published_title text,
  published_description text,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX campaign_schedule_events_published_date ON public.campaign_schedule_events(published_date) WHERE published_date IS NOT NULL;
ALTER TABLE public.campaign_schedule_events ENABLE ROW LEVEL SECURITY;
-- No direct SELECT on drafts. Even authenticated players can only read
-- published snapshots via the controlled RPC below.
REVOKE ALL ON public.campaign_schedule_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.campaign_schedule_events TO service_role;

CREATE TABLE public.campaign_schedule_event_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  actor uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  before_state jsonb,
  after_state jsonb
);
ALTER TABLE public.campaign_schedule_event_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_schedule_event_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.campaign_schedule_event_audit TO service_role;

CREATE FUNCTION public.get_campaign_schedule_events(p_year integer,p_month integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF p_year NOT BETWEEN 1 AND 9999 OR p_month NOT BETWEEN 0 AND 11 THEN RAISE EXCEPTION 'Mês inválido'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id','schedule:'||id::text,'date',published_date,
   'title',published_title,'description',coalesce(published_description,''),
   'kind','kingdom') ORDER BY published_date,id),'[]'::jsonb)
 INTO result
 FROM campaign_schedule_events
 WHERE published_date IS NOT NULL AND published_title IS NOT NULL
   AND left(published_date,4)=lpad(p_year::text,4,'0')
   AND (substring(published_date,6,2)=lpad((p_month+1)::text,2,'0')
      OR (substring(published_date,6,2)='F-' AND (
       (p_month=0 AND published_date LIKE '%midwinter')
       OR (p_month=3 AND published_date LIKE '%greengrass')
       OR (p_month=6 AND (published_date LIKE '%midsummer' OR published_date LIKE '%shieldmeet'))
       OR (p_month=8 AND published_date LIKE '%highharvestide')
       OR (p_month=10 AND published_date LIKE '%feast-moon'))));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_campaign_schedule_events(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_schedule_events(integer,integer) TO authenticated;

CREATE FUNCTION public.get_campaign_schedule_drafts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Apenas o Narrador consulta os rascunhos do calendário'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'date',draft_date,'title',draft_title,
  'description',draft_description,'deleted',draft_deleted,'version',version,
  'published',published_date IS NOT NULL) ORDER BY draft_date,id),'[]'::jsonb)
 INTO result FROM campaign_schedule_events;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_campaign_schedule_drafts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_schedule_drafts() TO authenticated;

CREATE FUNCTION public.save_campaign_schedule_event(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing campaign_schedule_events; updated campaign_schedule_events;
 item_id uuid; event_date text; event_title text; event_description text;
 deleted boolean; expected integer; before_state jsonb;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Apenas o Narrador altera eventos'; END IF;
 event_date:=p_payload->>'date';
 event_title:=btrim(coalesce(p_payload->>'title',''));
 event_description:=coalesce(p_payload->>'description','');
 deleted:=coalesce((p_payload->>'deleted')::boolean,false);
 expected:=(p_payload->>'version')::integer;
 IF NOT public.valid_campaign_date(event_date)
   OR length(event_title) NOT BETWEEN 1 AND 180 OR length(event_description)>4000
   THEN RAISE EXCEPTION 'Preencha data, título (1–180) e descrição (até 4000 caracteres)'; END IF;
 IF nullif(p_payload->>'id','') IS NULL THEN
   IF deleted THEN RAISE EXCEPTION 'Não é possível excluir evento não cadastrado'; END IF;
   INSERT INTO campaign_schedule_events(draft_date,draft_title,draft_description,updated_by)
   VALUES(event_date,event_title,event_description,auth.uid()) RETURNING * INTO updated;
   before_state:=NULL;
 ELSE
   item_id:=(p_payload->>'id')::uuid;
   SELECT * INTO existing FROM campaign_schedule_events WHERE id=item_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Evento não encontrado'; END IF;
   IF expected IS DISTINCT FROM existing.version THEN RAISE EXCEPTION 'Evento alterado por outra sessão. Recarregue.'; END IF;
   before_state:=to_jsonb(existing);
   UPDATE campaign_schedule_events SET draft_date=event_date,
     draft_title=event_title,draft_description=event_description,
     draft_deleted=deleted,version=version+1,
     updated_by=auth.uid(),updated_at=now()
   WHERE id=item_id RETURNING * INTO updated;
 END IF;
 INSERT INTO campaign_schedule_event_audit(event_id,actor,reason,before_state,after_state)
 VALUES(updated.id,auth.uid(),'Edição do rascunho do calendário',before_state,to_jsonb(updated));
 RETURN jsonb_build_object('id',updated.id,'version',updated.version);
END $$;
REVOKE ALL ON FUNCTION public.save_campaign_schedule_event(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_campaign_schedule_event(jsonb) TO authenticated;

CREATE FUNCTION public.publish_campaign_schedule(p_version integer,p_date text,p_auto boolean,p_week integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before_state jsonb;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador publica o calendário'; END IF;
 IF p_week IS NULL OR p_week NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Semana do jogo inválida'; END IF;
 IF NOT public.valid_campaign_date(p_date) THEN RAISE EXCEPTION 'Data de Harptos inválida'; END IF;
 PERFORM pg_advisory_xact_lock(184522);
 SELECT to_jsonb(c) INTO before_state FROM campaign_calendar c WHERE id FOR UPDATE;
 -- The existing operation checks optimistic concurrency, advances project months
 -- and writes the calendar audit, all in this same transaction.
 PERFORM public.set_campaign_calendar(p_version,p_date,p_auto);
 UPDATE campaign_calendar SET published_week=p_week,published_at=now() WHERE id;
 INSERT INTO campaign_schedule_event_audit(event_id,actor,reason,before_state,after_state)
 SELECT id,auth.uid(),'Publicação do calendário',to_jsonb(e),
   jsonb_build_object('date',CASE WHEN draft_deleted THEN NULL ELSE draft_date END,
     'title',CASE WHEN draft_deleted THEN NULL ELSE draft_title END)
 FROM campaign_schedule_events e
 WHERE (draft_deleted AND published_date IS NOT NULL)
   OR (NOT draft_deleted AND (published_date IS DISTINCT FROM draft_date
    OR published_title IS DISTINCT FROM draft_title
    OR published_description IS DISTINCT FROM draft_description));
 UPDATE campaign_schedule_events SET
   published_date=CASE WHEN draft_deleted THEN NULL ELSE draft_date END,
   published_title=CASE WHEN draft_deleted THEN NULL ELSE draft_title END,
   published_description=CASE WHEN draft_deleted THEN NULL ELSE draft_description END,
   version=version+1;
 INSERT INTO campaign_calendar_audit(actor,before_state,after_state,reason)
 SELECT auth.uid(),before_state,to_jsonb(c),'Publicação global da semana '||p_week
 FROM campaign_calendar c WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.publish_campaign_schedule(integer,text,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_campaign_schedule(integer,text,boolean,integer) TO authenticated;

-- Opening a new mail round already advances the global date. Reflect its number
-- on the shared calendar without changing the round advancement trigger.
CREATE FUNCTION public.sync_campaign_calendar_week() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.last_round IS DISTINCT FROM OLD.last_round AND NEW.last_round IS NOT NULL THEN
   UPDATE campaign_calendar SET published_week=NEW.last_round,published_at=now() WHERE id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_campaign_calendar_week
AFTER UPDATE OF last_round ON public.campaign_calendar
FOR EACH ROW EXECUTE FUNCTION public.sync_campaign_calendar_week();

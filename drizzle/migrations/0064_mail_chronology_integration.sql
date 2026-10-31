-- Hub Temporal · Lote 8: leitura histórica consistente de correspondência e eventos.
-- Não redata nenhuma missiva ou resposta. Rodadas não movem o calendário.
BEGIN;
SET LOCAL lock_timeout='5s';

-- O mês dos festivais não é representado por YYYY-MM, mas F-<nome>.
-- Esta função resolve a ancoragem sem confundir a désdia com a rodada.
CREATE OR REPLACE FUNCTION public.campaign_date_in_month(
 p_date text,p_year integer,p_month integer
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN p_year NOT BETWEEN 1 AND 9999 OR p_month NOT BETWEEN 0 AND 11
   OR NOT public.valid_campaign_date(p_date) THEN false
  WHEN substring(p_date,6,2)<>'F-' THEN
   left(p_date,4)=lpad(p_year::text,4,'0')
   AND substring(p_date,6,2)=lpad((p_month+1)::text,2,'0')
  ELSE left(p_date,4)=lpad(p_year::text,4,'0')
   AND p_month=CASE substring(p_date,8)
    WHEN 'midwinter' THEN 0 WHEN 'greengrass' THEN 3
    WHEN 'midsummer' THEN 6 WHEN 'shieldmeet' THEN 6
    WHEN 'highharvestide' THEN 8 WHEN 'feast-moon' THEN 10
    ELSE -1 END
 END
$$;
REVOKE ALL ON FUNCTION public.campaign_date_in_month(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.campaign_date_in_month(text,integer,integer) TO authenticated;

-- SECURITY INVOKER: cada usuário recebe exclusivamente cartas e respostas
-- que já tem permissão para consultar através da RLS de origem.
-- Nunca revelar rascunhos ou conteúdos de correspondência na cronologia.
CREATE OR REPLACE FUNCTION public.calendar_mail_events(p_year integer,p_month integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.campaign_access_active() THEN
  RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 IF p_year NOT BETWEEN 1 AND 9999 OR p_month NOT BETWEEN 0 AND 11 THEN
  RAISE EXCEPTION 'Período de consulta inválido'; END IF;
 SELECT coalesce(jsonb_agg(item ORDER BY item->>'date',item->>'id'),'[]'::jsonb)
 INTO result
 FROM (
  SELECT jsonb_build_object('id','letter:'||l.id,'date',l.campaign_date,
    'title',l.subject,'kind','mail') item
  FROM public.campaign_letters l
  WHERE l.deleted_at IS NULL AND l.publication_state='delivered'
   AND public.campaign_date_in_month(l.campaign_date,p_year,p_month)
  UNION ALL
  SELECT jsonb_build_object('id','reply:'||r.id,'date',r.campaign_date,
    'title','Resposta · '||l.subject,'kind','mail')
  FROM public.letter_replies r
  JOIN public.campaign_letters l ON l.id=r.letter_id
  WHERE l.deleted_at IS NULL AND l.publication_state='delivered'
   AND r.deleted_at IS NULL AND r.publication_state='delivered'
   AND public.campaign_date_in_month(r.campaign_date,p_year,p_month)
 ) visible_events;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.calendar_mail_events(integer,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calendar_mail_events(integer,integer)
 TO authenticated;

-- Coleta coerente da cronologia de mês, sem compor datas a partir da semana.
-- A referência da rodada é uma fotografia congelada; legados NULL permanecem
-- NULL (sem atribuir mês/désdia retroativamente).
CREATE OR REPLACE FUNCTION public.get_campaign_chronology(p_year integer,p_month integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE mail_events jsonb;published_events jsonb;rounds_data jsonb;
 year_key text;month_key text;
BEGIN
 IF NOT public.campaign_access_active() THEN
  RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF p_year NOT BETWEEN 1 AND 9999 OR p_month NOT BETWEEN 0 AND 11 THEN
  RAISE EXCEPTION 'Mês de cronologia inválido'; END IF;
 mail_events:=public.calendar_mail_events(p_year,p_month);
 published_events:=public.get_campaign_schedule_events(p_year,p_month);
 year_key:=lpad(p_year::text,4,'0');
 month_key:=lpad((p_month+1)::text,2,'0');
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'number',r.number,'status',r.status,'harptos_period',r.harptos_period,
  'opened_at',r.opened_at,'closed_at',r.closed_at)
  ORDER BY r.number),'[]'::jsonb)
 INTO rounds_data
 FROM public.letter_rounds r
 WHERE r.harptos_period IS NOT NULL
   AND (
    r.harptos_period LIKE year_key||'-'||month_key||':désdia-%'
    OR (substring(r.harptos_period,1,7)=year_key||'-F-'
     AND public.campaign_date_in_month(r.harptos_period,p_year,p_month))
   );
 RETURN jsonb_build_object(
  'year',p_year,'month',p_month,
  'events',(
   SELECT coalesce(jsonb_agg(e.event ORDER BY e.ordinal,e.event->>'id'),'[]'::jsonb)
   FROM (
    SELECT x.event,public.harptos_calendar_ordinal(x.event->>'date') ordinal
    FROM (
     SELECT value event FROM jsonb_array_elements(mail_events)
     UNION ALL
     SELECT value FROM jsonb_array_elements(published_events)
    ) x WHERE public.valid_campaign_date(x.event->>'date')
   ) e
  ),
  'rounds',rounds_data,
  'unassigned_round_count',(
   SELECT count(*) FROM public.letter_rounds WHERE harptos_period IS NULL
   AND status IN ('open','closed')
  )
 );
END $$;
REVOKE ALL ON FUNCTION public.get_campaign_chronology(integer,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_chronology(integer,integer)
 TO authenticated;
COMMIT;

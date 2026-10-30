-- Return the committed calendar snapshot from the same transaction as publication.
-- The existing publisher continues enforcing authorization, version checks,
-- project progression, event snapshots, and audit entries.
CREATE FUNCTION public.publish_campaign_schedule_confirmed(
  p_version integer,p_date text,p_auto boolean,p_week integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved jsonb;
BEGIN
  IF NOT public.is_campaign_admin() THEN
    RAISE EXCEPTION 'Somente o Narrador publica o calendário';
  END IF;
  PERFORM public.publish_campaign_schedule(p_version,p_date,p_auto,p_week);
  SELECT to_jsonb(c) INTO STRICT saved FROM public.campaign_calendar c WHERE c.id;
  IF saved->>'version' IS NULL
     OR saved->>'published_week' IS DISTINCT FROM p_week::text
     OR saved->>'auto_advance' IS DISTINCT FROM p_auto::text
     OR public.valid_campaign_date(p_date) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Confirmação do calendário inconsistente';
  END IF;
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.publish_campaign_schedule_confirmed(integer,text,boolean,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_campaign_schedule_confirmed(integer,text,boolean,integer)
  TO authenticated;

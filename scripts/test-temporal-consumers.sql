-- Hub Temporal · Lote 10: notificações atômicas, revisões e replay seguro.
-- Todas as mutações são revertidas; execução permitida somente em DB efêmero.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label;END IF;END $$;
INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000a10'),
 ('30000000-0000-0000-0000-000000000a11');
INSERT INTO public.user_roles(user_id,role)
VALUES('30000000-0000-0000-0000-000000000a10','admin');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000a10',true);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_temporal_consumer_dashboard(80)->'consumers')=9,
 'nine explicit integration points registered');
SELECT pg_temp.assert(
 (public.get_temporal_consumer_dashboard(80)->>'pending_total')::int=0,
 'no historical operation is backfilled with invented effects');

SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000a12',
 'set','1522-02-01',0,'Lote 10 revisao mensal',false);

SELECT pg_temp.assert(
 (public.get_temporal_consumer_dashboard(80)->>'pending_total')::int>=3,
 'monthly transition produces review-only messages for services and economy');
SELECT pg_temp.assert(
 (SELECT count(*) FROM jsonb_array_elements(
  public.get_temporal_consumer_dashboard(80)->'deliveries') d
  WHERE d->>'consumer_code'='army-units' AND d->>'status'='informational')=1,
 'army projection receives one notification without automatic recruitment');

SELECT pg_temp.assert(public.publish_campaign_time_change(
 1,'30000000-0000-4000-8000-000000000a12',
 'set','1522-02-01',0,'Lote 10 revisao mensal',false)->>'duplicate'='true',
 'publication retry returns existing committed snapshot');
SELECT pg_temp.assert(
 (SELECT count(*) FROM jsonb_array_elements(
 public.get_temporal_consumer_dashboard(80)->'deliveries'))=7,
 'retry cannot duplicate existing delivery rows');

DO $review$
DECLARE delivery uuid;count_before integer;result jsonb;
BEGIN
 SELECT (d->>'id')::uuid INTO delivery
 FROM jsonb_array_elements(public.get_temporal_consumer_dashboard(80)->'deliveries') d
 WHERE d->>'consumer_code'='economy';
 IF delivery IS NULL THEN RAISE EXCEPTION 'Economy delivery not found';END IF;
 result:=public.replay_temporal_delivery(delivery);
 PERFORM pg_temp.assert(result->>'replay_read_only'='true'
  AND result->>'status'='pending','replay is read only');
 SELECT (public.get_temporal_consumer_dashboard(80)->>'pending_total')::integer INTO count_before;
 result:=public.resolve_temporal_delivery(
  delivery,'30000000-0000-4000-8000-000000000a13',
  'reviewed','Conferido sem produzir qualquer renda');
 PERFORM pg_temp.assert(result->>'duplicate'='false','first review accepted');
 result:=public.resolve_temporal_delivery(
  delivery,'30000000-0000-4000-8000-000000000a13',
  'reviewed','Conferido sem produzir qualquer renda');
 PERFORM pg_temp.assert(result->>'duplicate'='true','review retry acknowledged only once');
 PERFORM pg_temp.assert(
  (public.get_temporal_consumer_dashboard(80)->>'pending_total')::integer=count_before-1,
  'only one manual pending delivery resolved');
 PERFORM pg_temp.assert(public.replay_temporal_delivery(delivery)->>'status'='reviewed',
  'replaying reviewed event never reopens it');
 BEGIN
  PERFORM public.resolve_temporal_delivery(
   delivery,'30000000-0000-4000-8000-000000000a13',
   'skipped','Mudanca maliciosa de decisao');
  RAISE EXCEPTION 'reused resolution key accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='reused resolution key accepted'
   OR SQLERRM NOT LIKE 'Chave de resolução já utilizada%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.resolve_temporal_delivery(
   delivery,'30000000-0000-4000-8000-000000000a14',
   'reviewed','Tentativa de revisar novamente');
  RAISE EXCEPTION 'resolved delivery reopened';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='resolved delivery reopened'
   OR SQLERRM NOT LIKE 'Esta entrega não está pendente%' THEN RAISE;END IF;
 END;
END $review$;

-- Retificação histórica em operação própria: não reabre economia nem desfaz
-- efeitos já aprovados, e gera nova pendência com direction=backward.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000a15',
 'set','1522-01-21',0,'Retrocesso autorizado para teste temporal',true);
SELECT pg_temp.assert(
 (SELECT count(*) FROM jsonb_array_elements(
 public.get_temporal_consumer_dashboard(80)->'deliveries') d
 WHERE d->>'direction'='backward' AND d->>'consumer_code'='economy'
 AND d->>'status'='pending')=1,
 'historical correction triggers a review, not reversal of old decisions');

-- Sem SELECT direto mesmo para usuário autenticado: apenas RPC admin.
DO $rls$
BEGIN
 BEGIN
  PERFORM count(*) FROM public.campaign_temporal_deliveries;
  RAISE EXCEPTION 'direct access incorrectly granted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 WHEN raise_exception THEN RAISE; END;
END $rls$;
RESET ROLE;
SELECT pg_temp.assert(
 (SELECT count(*) FROM public.campaign_temporal_effect_checkpoints)=0,
 'no automatic effects/checkpoints recorded during temporal publication');
ROLLBACK;

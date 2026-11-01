-- Lote 13 · contrato de homologação no PostgreSQL descartável.
-- Proibido executar em produção: cria utilizador de teste e usa ROLLBACK.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Assertion failed: %',label;END IF;END $$;

-- A fronteira pública expõe somente a data, jamais dados de jogadores.
SELECT pg_temp.assert(has_function_privilege('anon',
 'public.get_public_campaign_time()','EXECUTE'),
 'anon can read only the public clock projection');
SELECT pg_temp.assert(
 (SELECT count(*)=5 FROM jsonb_object_keys(public.get_public_campaign_time())),
 'public projection contains exactly five keys');
SELECT pg_temp.assert(public.valid_campaign_date(
 public.harptos_time_key(
 (public.get_public_campaign_time()->>'year')::integer,
 (public.get_public_campaign_time()->>'month')::integer,
 (public.get_public_campaign_time()->>'day')::integer,
 public.get_public_campaign_time()->>'festival')),
 'public projection maps to a valid Harptos date');

DO $permissions$
DECLARE rel text;role_name text;verb text;signature text;
BEGIN
 FOR rel IN SELECT unnest(ARRAY[
  'public.campaign_temporal_consumers',
  'public.campaign_temporal_deliveries',
  'public.campaign_temporal_delivery_resolutions',
  'public.campaign_temporal_effect_checkpoints']) LOOP
  PERFORM pg_temp.assert((SELECT c.relrowsecurity
   FROM pg_class c WHERE c.oid=rel::regclass),
   rel||' must retain row-level security');
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH verb IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    PERFORM pg_temp.assert(NOT has_table_privilege(role_name,rel,verb),
     role_name||' cannot directly '||verb||' on '||rel);
   END LOOP;
  END LOOP;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'public.get_temporal_release_preflight()',
  'public.get_temporal_consumer_dashboard(integer)',
  'public.replay_temporal_delivery(uuid)',
  'public.resolve_temporal_delivery(uuid,uuid,text,text)',
  'public.get_campaign_time_history(integer)',
  'public.preview_campaign_time_change(integer,text,text,integer,boolean)',
  'public.publish_campaign_time_change(integer,uuid,text,text,integer,text,boolean)'
 ] LOOP
  PERFORM pg_temp.assert(
   NOT has_function_privilege('anon',signature,'EXECUTE'),
   'anon cannot use narrator-only function '||signature);
 END LOOP;
END $permissions$;

SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM pg_trigger
  WHERE tgrelid='public.campaign_time_operations'::regclass
   AND tgname='enqueue_campaign_temporal_consumers'
   AND NOT tgisinternal AND tgenabled IN ('O','A')),
 'one enabled transactional consumer trigger');
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM pg_proc
  WHERE oid='public.get_temporal_release_preflight()'::regprocedure
   AND prosecdef AND provolatile='s'),
 'preflight is stable and runs with strictly controlled permissions');
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM pg_constraint
  WHERE conrelid='public.campaign_temporal_deliveries'::regclass
   AND contype='u' AND array_length(conkey,1)=2),
 'transaction and consumer delivery have unique idempotency key');
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM public.campaign_temporal_effect_checkpoints),
 'no automatic business effects/checkpoints have run in a fresh installation');

-- A conta comum autenticada também não consegue usar o RPC administrativo.
INSERT INTO auth.users(id)
 VALUES('30000000-0000-0000-0000-000000000d31');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '30000000-0000-0000-0000-000000000d31',true);
DO $nonadmin$
DECLARE before_clock jsonb;after_clock jsonb;failed boolean;
BEGIN
 before_clock:=public.get_public_campaign_time();
 failed:=false;
 BEGIN PERFORM public.get_temporal_release_preflight();
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 PERFORM pg_temp.assert(failed,'common player blocked from preflight');
 failed:=false;
 BEGIN PERFORM public.get_temporal_consumer_dashboard(10);
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 PERFORM pg_temp.assert(failed,'common player blocked from consumer dashboard');
 failed:=false;
 BEGIN PERFORM public.publish_campaign_time_change(
  1,'30000000-0000-4000-8000-000000000d31',
  'advance',NULL,1,'Tentativa proibida do jogador',false);
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 PERFORM pg_temp.assert(failed,'common player blocked from publishing dates');
 after_clock:=public.get_public_campaign_time();
 PERFORM pg_temp.assert(before_clock=after_clock,
  'unauthorized calls never change public calendar');
END $nonadmin$;
ROLLBACK;

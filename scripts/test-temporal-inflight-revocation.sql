-- Lote 28: a commit requested after revocation cannot complete.
-- Simulates the final RPC boundary on disposable PostgreSQL CI only.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'L28: %',label; END IF; END $$;
INSERT INTO auth.users(id) VALUES('30000000-0000-0000-0000-000000002801'),
('30000000-0000-0000-0000-000000002802');
INSERT INTO public.user_roles(user_id,role) VALUES
('30000000-0000-0000-0000-000000002801','admin');
INSERT INTO public.campaign_houses(id,name) VALUES('l28-a','Ensaio de bloqueio');
INSERT INTO public.campaign_players(id,user_id,name) VALUES
('30000000-0000-0000-0000-000000002811',
 '30000000-0000-0000-0000-000000002802','Jogador em voo');
INSERT INTO public.house_memberships(player_id,house_id,authorized_by,can_edit)
VALUES('30000000-0000-0000-0000-000000002811','l28-a',
'30000000-0000-0000-0000-000000002801',true);
INSERT INTO public.noble_house_sheets(house_id,state,version,updated_by) VALUES(
'l28-a',jsonb_build_object('schemaVersion',1,'houseId','l28-a',
'phase','active','month',18264,'treasury',10,'permanent','{}'::jsonb,
'units','[]'::jsonb,'holdings','[]'::jsonb,'projects','[]'::jsonb),1,
'30000000-0000-0000-0000-000000002801');
-- The application already collected action data when an operator revokes editing.
UPDATE public.house_memberships SET can_edit=false WHERE house_id='l28-a';
DO $test$
DECLARE denied boolean:=false; s jsonb; result jsonb;
BEGIN
 SELECT state INTO s FROM public.noble_house_sheets WHERE house_id='l28-a';
 BEGIN
  PERFORM public.commit_noble_house_operation(
   '30000000-0000-0000-0000-000000002802','l28-a',1,
   '30000000-0000-4000-8000-000000002821','unit',s,
   'Tentativa em voo após revogação','Custo que não deve ser debitado');
 EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'revoked player cannot persist old request');
 PERFORM pg_temp.assert(
  (SELECT version=1 AND state=s FROM public.noble_house_sheets WHERE house_id='l28-a'),
  'version and House state preserved on failure');
 PERFORM pg_temp.assert(
  (SELECT count(*)=0 FROM public.noble_house_ledger WHERE house_id='l28-a'),
  'rejected request creates no journal entry');
END $test$;
UPDATE public.house_memberships SET can_edit=true WHERE house_id='l28-a';
SELECT pg_temp.assert(
 public.commit_noble_house_operation(
  '30000000-0000-0000-0000-000000002802','l28-a',1,
  '30000000-0000-4000-8000-000000002822','unit',
  (SELECT state FROM public.noble_house_sheets WHERE house_id='l28-a'),
  'Authorized unchanged state','CI authorization check')->>'duplicate'='false',
 'restored membership can commit exactly once');
SELECT pg_temp.assert(
 (SELECT version=2 FROM public.noble_house_sheets WHERE house_id='l28-a')
 AND (SELECT count(*)=1 FROM public.noble_house_ledger WHERE house_id='l28-a'),
 'authorized attempt journals exactly one version');
ROLLBACK;

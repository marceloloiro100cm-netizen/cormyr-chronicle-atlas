-- Banco PostgreSQL descartável da CI. Não toca no Supabase real.
BEGIN;
DO $checks$
DECLARE v_id uuid:=gen_random_uuid();v_before int;v_after int;
BEGIN
 IF to_regclass('public.campaign_newspapers') IS NULL OR
    to_regclass('public.campaign_newspaper_revisions') IS NULL OR
    to_regclass('public.campaign_newspaper_reads') IS NULL
 THEN RAISE EXCEPTION 'Jornal: tabelas ausentes'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class
   WHERE oid IN ('public.campaign_newspapers'::regclass,
    'public.campaign_newspaper_revisions'::regclass,
    'public.campaign_newspaper_reads'::regclass) AND NOT relrowsecurity)
 THEN RAISE EXCEPTION 'Jornal: RLS desativada'; END IF;
 IF has_table_privilege('anon','public.campaign_newspapers','SELECT')
    OR has_table_privilege('anon','public.campaign_newspaper_reads','SELECT')
    OR has_table_privilege('authenticated','public.campaign_newspaper_revisions','INSERT')
 THEN RAISE EXCEPTION 'Jornal: permissões excessivas'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage'
  AND tablename='objects' AND policyname='newspaper_asset_read')
 THEN RAISE EXCEPTION 'Jornal: acesso privado aos anexos ausente'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets
  WHERE id='campaign-newspapers' AND public=false)
 THEN RAISE EXCEPTION 'Jornal: o bucket deve ser privado'; END IF;
 IF has_function_privilege('anon','public.mark_campaign_newspaper_read(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Jornal: anon pode confirmar leitura'; END IF;
 IF public.can_edit_campaign_newspaper() IS TRUE
 THEN RAISE EXCEPTION 'Jornal: editor sem autenticação'; END IF;
 -- O trigger gera histórico e versão mesmo para quem contorna a interface.
 PERFORM set_config('request.jwt.claim.sub',v_id::text,true);
 INSERT INTO public.campaign_newspapers(id,campaign_date,title)
 VALUES(v_id,'1522-01-01','Edição isolada de teste');
 SELECT version INTO v_before FROM public.campaign_newspapers WHERE id=v_id;
 UPDATE public.campaign_newspapers SET subtitle='Nova manchete' WHERE id=v_id;
 SELECT version INTO v_after FROM public.campaign_newspapers WHERE id=v_id;
 IF v_after<>v_before+1 OR NOT EXISTS(
   SELECT 1 FROM public.campaign_newspaper_revisions
    WHERE newspaper_id=v_id AND previous_version=v_before)
 THEN RAISE EXCEPTION 'Jornal: auditoria ou versão incorreta'; END IF;
END $checks$;
ROLLBACK;

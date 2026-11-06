-- Source-specific import; never overwrite an edited house or choose an ambiguous name.
-- The zero UUID identifies this automated migration, not a campaign user.
CREATE TABLE IF NOT EXISTS public.noble_house_workbook_imports (
  batch text NOT NULL,
  house_key text NOT NULL,
  house_id text,
  status text NOT NULL CHECK(status IN ('applied','missing','ambiguous','needs_review')),
  detail text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(batch,house_key)
);
ALTER TABLE public.noble_house_workbook_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.noble_house_workbook_imports FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.noble_house_workbook_imports TO authenticated;
GRANT ALL ON public.noble_house_workbook_imports TO service_role;
DROP POLICY IF EXISTS workbook_import_admin ON public.noble_house_workbook_imports;
CREATE POLICY workbook_import_admin ON public.noble_house_workbook_imports FOR SELECT TO authenticated USING(public.is_campaign_admin());

DO $import$
DECLARE
 entry jsonb; old_state jsonb; next_state jsonb; old_version integer;
 target_id text; matches text[]; result_status text; detail_text text; reviewed_match boolean;
 batch_key constant text := 'workbooks-2026-10-29';
 system_actor constant uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
 FOR entry IN SELECT value FROM jsonb_array_elements($workbooks$[]$workbooks$::jsonb)
 LOOP
  target_id := NULL;
  SELECT array_agg(id ORDER BY id) INTO matches FROM public.campaign_houses
   WHERE lower(regexp_replace(btrim(name),'^casa[[:space:]]+','','i')) = entry->>'key';
  IF coalesce(cardinality(matches),0) = 0 THEN
   result_status := 'missing'; detail_text := 'Casa não encontrada; nenhuma casa criada automaticamente.';
  ELSIF cardinality(matches) <> 1 THEN
   result_status := 'ambiguous'; detail_text := 'Mais de uma casa corresponde ao nome exato; nenhuma alterada.';
  ELSE
   target_id := matches[1];
   PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||target_id,0));
   SELECT state,version INTO old_state,old_version FROM public.noble_house_sheets WHERE house_id=target_id FOR UPDATE;
   reviewed_match := coalesce(target_id = entry->'reviewed'->>'houseId'
     AND old_version = (entry->'reviewed'->>'version')::integer
     AND md5(old_state::text) = entry->'reviewed'->>'hash',false);
   IF EXISTS(SELECT 1 FROM public.noble_house_ledger WHERE house_id=target_id AND operation_key=(entry->>'operationKey')::uuid) THEN
    CONTINUE; -- Do not replay after purchases, edits, or manual corrections.
   ELSIF old_state IS NOT NULL AND NOT reviewed_match AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(entry->'previous') AS previous(value)
     WHERE previous.value - 'houseId' = old_state - 'houseId'
   ) THEN
    result_status := 'needs_review'; detail_text := 'Ficha existente difere dos estados legados conhecidos; preservar compras e conciliar manualmente.';
   ELSE
    next_state := jsonb_set(entry->'state','{houseId}',to_jsonb(target_id));
    IF old_state IS NOT NULL THEN
     next_state := jsonb_set(next_state,'{court}',coalesce(old_state->'court','[]'::jsonb));
     next_state := jsonb_set(next_state,'{importSources}',(
       SELECT jsonb_agg(source ORDER BY source)
       FROM (SELECT DISTINCT value AS source FROM jsonb_array_elements(coalesce(old_state->'importSources','[]'::jsonb) || (next_state->'importSources'))) sources
     ));
    END IF;
    IF reviewed_match THEN
     -- These six exact version/hash snapshots were reviewed against their ledgers.
     -- Preserve existing Qazir approval and its cost once, using its original ID.
     IF target_id='ashkar' THEN
      next_state := jsonb_set(next_state,'{holdings}',(
       SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(next_state->'holdings') WITH ORDINALITY
        WHERE value->>'id'<>'hold-ashkar-vassal-1'
      ) || (old_state->'holdings'));
      next_state := jsonb_set(next_state,'{vassals}',old_state->'vassals');
     END IF;
    END IF;
    INSERT INTO public.noble_house_sheets(house_id,state,version,updated_by)
      VALUES(target_id,next_state,coalesce(old_version,0)+1,system_actor)
      ON CONFLICT(house_id) DO UPDATE SET state=EXCLUDED.state,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=now();
    INSERT INTO public.noble_house_ledger(house_id,operation_key,actor,action,explanation,rule,campaign_month,before_state,after_state,version)
      VALUES(target_id,(entry->>'operationKey')::uuid,system_actor,'Conciliação das fichas 29/10/2026',
       'Importação de ficha ausente, legado intacto ou versão/hash conferidos; Corte e vassalagem existentes preservadas; cópia integral anterior no ledger.',
       'Planilhas anexadas · docs/house-possessions-audit-2026-10-29.md',
       (next_state->>'month')::integer,coalesce(old_state,'{}'::jsonb),next_state,coalesce(old_version,0)+1);
    result_status := 'applied'; detail_text := 'Ficha importada com histórico integral antes/depois. Pendências da fonte registradas no estado.';
   END IF;
  END IF;
  INSERT INTO public.noble_house_workbook_imports(batch,house_key,house_id,status,detail)
    VALUES(batch_key,entry->>'key',target_id,result_status,detail_text)
    ON CONFLICT(batch,house_key) DO UPDATE SET house_id=EXCLUDED.house_id,status=EXCLUDED.status,detail=EXCLUDED.detail,checked_at=now();
 END LOOP;
END $import$;

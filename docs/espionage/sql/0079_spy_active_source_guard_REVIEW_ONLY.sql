-- CCA-ESP-MVP-001 · defense in depth · REVIEW ONLY.
-- Prevent newly assigned missions from using an agent whose source holding is
-- inactive/removed, or a contractor absent from canonical purchase ledger.
BEGIN;
CREATE OR REPLACE FUNCTION public.spy_verify_agent_source()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $spy$
DECLARE asset public.spy_assets; sheet jsonb; h jsonb; kind text; parent_ok boolean; paid boolean;
BEGIN
 SELECT * INTO asset FROM public.spy_assets WHERE id=NEW.asset_id
  AND owner_house_id=NEW.owner_house_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agente não pertence à Casa'; END IF;
 SELECT state INTO sheet FROM public.noble_house_sheets WHERE house_id=NEW.owner_house_id;
 IF sheet IS NULL OR sheet->>'houseId' IS DISTINCT FROM NEW.owner_house_id OR
  sheet->>'phase' IS DISTINCT FROM 'active' OR
  jsonb_typeof(sheet->'holdings') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Ficha de origem não conciliada'; END IF;
 SELECT value INTO h FROM jsonb_array_elements(sheet->'holdings')
  WHERE value->>'id'=asset.source_holding_id LIMIT 1;
 IF h IS NULL OR h->>'status' IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Posse de origem indisponível'; END IF;
 kind:=h->>'itemId';
 IF asset.kind='network_cell' AND
  ((kind='pros-spy-network' AND asset.source_ref='base:'||(h->>'id')||':0')
   OR
   (kind='pros-spy-network--expanded-network' AND
    asset.source_ref IN ('expanded:'||(h->>'id')||':0','expanded:'||(h->>'id')||':1')))
 THEN
  IF kind='pros-spy-network--expanded-network' THEN
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(sheet->'holdings') p
    WHERE p->>'id'=h->>'parentId' AND p->>'itemId'='pros-spy-network'
     AND p->>'status'='active') INTO parent_ok;
   IF NOT parent_ok THEN RAISE EXCEPTION 'Rede principal desativada'; END IF;
  END IF;
 ELSIF asset.kind='contractor' AND kind='pros-spy-contract-batch' AND
  asset.source_ref IN ('contractor:'||(h->>'id')||':0','contractor:'||(h->>'id')||':1') THEN
  SELECT EXISTS(SELECT 1 FROM public.noble_house_ledger ledger
   WHERE ledger.house_id=NEW.owner_house_id AND ledger.action='purchase'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(ledger.after_state->'holdings','[]'::jsonb)) a
      WHERE a->>'id'=h->>'id' AND a->>'itemId'='pros-spy-contract-batch'
       AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(a->'costs','[]'::jsonb)) c
        WHERE c->>'resource'='wealth' AND c->>'mode'='allocation' AND c->>'amount'='5'))
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(ledger.before_state->'holdings','[]'::jsonb)) x
      WHERE x->>'id'=h->>'id')) INTO paid;
  IF NOT paid THEN RAISE EXCEPTION 'Contratação sem compra comprovada'; END IF;
 ELSIF asset.kind='local_contact' AND
  kind IN('pros-street-gangs--eyes-everywhere','pros-minstrel-s-seat--speakers-listeners','pros-bailiffs')
  AND left(asset.source_ref,length('contact:'||(h->>'id')||':'))='contact:'||(h->>'id')||':'
 THEN NULL;
 ELSE RAISE EXCEPTION 'Tipo ou identificador de agente não corresponde à posse ativa';
 END IF;
 RETURN NEW;
END $spy$;
REVOKE ALL ON FUNCTION public.spy_verify_agent_source() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS spy_source_guard ON public.spy_operations;
CREATE TRIGGER spy_source_guard BEFORE INSERT ON public.spy_operations
 FOR EACH ROW EXECUTE FUNCTION public.spy_verify_agent_source();
COMMIT;

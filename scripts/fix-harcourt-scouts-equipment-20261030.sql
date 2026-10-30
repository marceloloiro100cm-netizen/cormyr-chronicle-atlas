-- Completa o perfil técnico dos Batedores Montados sem mudar pontos nem efetivo.
-- Migração corretiva auditada (após a importação inicial, estado v2).
BEGIN;
SET LOCAL statement_timeout='25000ms';
DO $$ BEGIN
 IF (SELECT version FROM public.noble_house_sheets WHERE house_id='harcourt')<>2
 THEN RAISE EXCEPTION 'Unexpected Harcourt version; review before correction'; END IF;
END $$;
WITH s AS (SELECT state FROM public.noble_house_sheets WHERE house_id='harcourt'),
 fixed AS (
 SELECT jsonb_set(s.state,'{units}',(
  SELECT jsonb_agg(CASE WHEN x->>'id'='harcourt-unit-scouts'
    THEN jsonb_set(x,'{equipmentTypeId}',to_jsonb('scouts'::text),true)
    ELSE x END)
  FROM jsonb_array_elements(s.state->'units') x
 )) AS state FROM s
)
SELECT public.commit_noble_house_operation(
 (SELECT user_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1),
 'harcourt',2,'c3789a17-52e5-4a26-9d53-42fa007bc1de'::uuid,'correct',
 fixed.state,'Correção técnica de perfil de equipamento misto dos Batedores das Estepes',
 'Tipos mistos da cavalaria e batedores exigem equipmentTypeId; nenhum custo alterado')
FROM fixed;
DO $$ DECLARE s jsonb; BEGIN
 SELECT state INTO s FROM public.noble_house_sheets WHERE house_id='harcourt';
 IF (SELECT version FROM public.noble_house_sheets WHERE house_id='harcourt')<>3 THEN RAISE EXCEPTION 'Version mismatch'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(s->'units') u WHERE u->>'id'='harcourt-unit-scouts' AND u->>'equipmentTypeId'='scouts')<>1 THEN RAISE EXCEPTION 'Equipment profile missing'; END IF;
 IF (SELECT sum((c->>'amount')::int) FROM jsonb_array_elements(s->'units') u CROSS JOIN LATERAL jsonb_array_elements(u->'costs') c WHERE c->>'resource'='power')<>50 THEN RAISE EXCEPTION 'Power changed'; END IF;
 END $$;
COMMIT;
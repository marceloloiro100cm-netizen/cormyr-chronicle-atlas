-- 0097 · A posse concede VAGAS, não agentes prontos.
-- Reconcilia apenas os três registros genéricos inseridos na importação
-- inicial da Ashkar, jamais agentes nomeados/criados por jogador.
-- Arquiva integralmente os registros antes da remoção e aborta se qualquer
-- dado, missão, histórico, foto ou estado tiver sido alterado.
BEGIN;
CREATE TABLE IF NOT EXISTS public.spy_legacy_seed_archive(
 id uuid PRIMARY KEY,
 owner_house_id text NOT NULL,
 archived_snapshot jsonb NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL
);
ALTER TABLE public.spy_legacy_seed_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spy_legacy_seed_archive FROM PUBLIC,anon,authenticated;

DO $body$
DECLARE v_count integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('spy:ashkar:legacy-seed',0));
 SELECT count(*) INTO v_count FROM public.spy_assets WHERE owner_house_id='ashkar';
 IF v_count=0 THEN RETURN; END IF;
 IF v_count<>3 THEN
  RAISE EXCEPTION 'Conciliação de agentes Ashkar abortada: quantidade alterada (%)',v_count;
 END IF;
 SELECT count(*) INTO v_count FROM public.spy_assets a
 WHERE a.owner_house_id='ashkar'
   AND ((a.source_ref='base:hold-ashkar-spy:0' AND a.codename='Agente da Rede 1'
       AND a.source_holding_id='hold-ashkar-spy')
    OR (a.source_ref='expanded:hold-ashkar-spy-exp:0'
       AND a.codename='Agente da Rede Ampliada 1'
       AND a.source_holding_id='hold-ashkar-spy-exp')
    OR (a.source_ref='expanded:hold-ashkar-spy-exp:1'
       AND a.codename='Agente da Rede Ampliada 2'
       AND a.source_holding_id='hold-ashkar-spy-exp'))
   AND a.status='available'
   AND a.version=1 AND a.mission_successes=0
   AND a.portrait_id IS NULL
   AND a.created_at='2026-11-03 01:41:48.990405+00'::timestamptz
   AND NOT EXISTS(SELECT 1 FROM public.spy_agent_history h WHERE h.agent_id=a.id)
   AND NOT EXISTS(SELECT 1 FROM public.spy_agent_upgrades u WHERE u.agent_id=a.id)
   AND NOT EXISTS(SELECT 1 FROM public.spy_operations o WHERE o.asset_id=a.id);
 IF v_count<>3 THEN
  RAISE EXCEPTION 'Conciliação de agentes Ashkar abortada: nem todos são sementes intactas (%)',v_count;
 END IF;

 INSERT INTO public.spy_legacy_seed_archive(id,owner_house_id,archived_snapshot,reason)
 SELECT a.id,a.owner_house_id,to_jsonb(a),
  'Semente técnica da importação: não corresponde a espião criado pelo jogador.'
 FROM public.spy_assets a WHERE a.owner_house_id='ashkar'
 ON CONFLICT(id) DO NOTHING;

 DELETE FROM public.spy_assets a
 WHERE a.owner_house_id='ashkar'
   AND EXISTS(SELECT 1 FROM public.spy_legacy_seed_archive arch WHERE arch.id=a.id);

 IF (SELECT count(*) FROM public.spy_assets WHERE owner_house_id='ashkar')<>0 THEN
   RAISE EXCEPTION 'Conciliação de Ashkar incompleta';
 END IF;
END $body$;
COMMIT;

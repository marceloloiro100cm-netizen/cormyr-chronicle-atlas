-- 0108 | Dossiês de Espionagem · lote 12 · consulta eficiente.
-- Índices não modificam segredos, missões, nem o calendário.
BEGIN;
SET LOCAL lock_timeout='8s';
CREATE INDEX IF NOT EXISTS spy_intelligence_events_dossier_chronology_idx
 ON public.spy_intelligence_events(dossier_id,created_at DESC);
CREATE INDEX IF NOT EXISTS spy_intelligence_dossiers_owner_recent_idx
 ON public.spy_intelligence_dossiers(owner_house_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS spy_intelligence_awards_pending_idx
 ON public.spy_intelligence_mission_awards(processing_state,created_at DESC)
 WHERE processing_state='waiting_catalog';
COMMIT;

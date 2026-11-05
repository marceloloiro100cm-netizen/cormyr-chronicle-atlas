-- CORMYR BATTLE V3 — convocações de testes. Sem ficha oficial e sem movimento de tropas.
-- Migração aditiva: executar primeiro no banco exclusivo de homologação.
BEGIN;
CREATE TABLE IF NOT EXISTS public.battle_v3_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
 target_house_id text NOT NULL REFERENCES public.campaign_houses(id) ON UPDATE CASCADE,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 scenario text NOT NULL CHECK (scenario IN ('plain-open','contested-woods','border-hills','narrow-passage')),
 attacker_model_id text NOT NULL CHECK (attacker_model_id IN ('evenhand-model','ashkar-model','phelles-model','stonecastle-model','torchwinter-model','grantass-model')),
 defender_model_id text NOT NULL CHECK (defender_model_id IN ('evenhand-model','ashkar-model','phelles-model','stonecastle-model','torchwinter-model','grantass-model')),
 attacker_commander text NOT NULL CHECK (attacker_commander IN ('tillet','noble','knight','war-mage','purple-dragon','ranger','priest','engineer','quartermaster','ashkar-raider')),
 defender_commander text NOT NULL CHECK (defender_commander IN ('tillet','noble','knight','war-mage','purple-dragon','ranger','priest','engineer','quartermaster','ashkar-raider')),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS battle_v3_invitation_target_active_idx
 ON public.battle_v3_invitations(target_house_id,created_at DESC) WHERE status='open';
ALTER TABLE public.battle_v3_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_v3_invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS battle_v3_admin_manage ON public.battle_v3_invitations;
CREATE POLICY battle_v3_admin_manage ON public.battle_v3_invitations
 FOR ALL TO authenticated
 USING (public.is_campaign_admin() AND public.campaign_access_active())
 WITH CHECK (public.is_campaign_admin() AND public.campaign_access_active());
DROP POLICY IF EXISTS battle_v3_member_read ON public.battle_v3_invitations;
CREATE POLICY battle_v3_member_read ON public.battle_v3_invitations
 FOR SELECT TO authenticated
 USING (status='open' AND public.campaign_access_active()
  AND public.in_campaign_house(target_house_id,false));
REVOKE ALL ON TABLE public.battle_v3_invitations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.battle_v3_invitations TO authenticated;
COMMENT ON TABLE public.battle_v3_invitations IS
 'Convocações de duelo V3 puramente fictícias. Não armazena fichas, comandos ou perdas oficiais.';
COMMIT;

-- Public-repository privacy boundary. Schema only: never include real game data.
-- This DDL was also applied to the live Supabase database on 2026-11-06.
CREATE TABLE IF NOT EXISTS public.campaign_private_gm_content (
 id text PRIMARY KEY,
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_private_gm_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campaign_private_gm_content FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.campaign_private_gm_content TO authenticated;
GRANT ALL ON TABLE public.campaign_private_gm_content TO service_role;
DROP POLICY IF EXISTS private_gm_read_admin ON public.campaign_private_gm_content;
CREATE POLICY private_gm_read_admin ON public.campaign_private_gm_content
 FOR SELECT TO authenticated USING (public.is_campaign_admin());

CREATE TABLE IF NOT EXISTS public.campaign_private_vassal_workbooks (
 parent_house_id text NOT NULL,
 vassal_house_id text NOT NULL,
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(parent_house_id,vassal_house_id)
);
ALTER TABLE public.campaign_private_vassal_workbooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campaign_private_vassal_workbooks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.campaign_private_vassal_workbooks TO service_role;

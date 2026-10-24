CREATE TABLE public.noble_house_drive_exports (
 binding_id uuid PRIMARY KEY REFERENCES public.drive_sync_bindings(id),
 house_id text NOT NULL REFERENCES public.campaign_houses(id),
 file_id text, provider_etag text, content_hash text,
 exported_version integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'pending', error text,
 last_synced_at timestamptz
);
GRANT SELECT ON public.noble_house_drive_exports TO authenticated;
GRANT ALL ON public.noble_house_drive_exports TO service_role;
ALTER TABLE public.noble_house_drive_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY noble_house_export_read ON public.noble_house_drive_exports FOR SELECT TO authenticated USING(public.is_campaign_admin() OR public.in_campaign_house(house_id,false));
CREATE FUNCTION public.noble_house_export_pending() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN UPDATE public.noble_house_drive_exports SET status='pending',error=NULL WHERE house_id=NEW.house_id AND exported_version<NEW.version; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.noble_house_export_pending() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER noble_house_export_pending AFTER INSERT OR UPDATE OF version ON public.noble_house_sheets FOR EACH ROW EXECUTE FUNCTION public.noble_house_export_pending();
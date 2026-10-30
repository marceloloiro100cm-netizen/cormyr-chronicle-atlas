-- Lote 8: Harptos reference is frozen when a new round opens.
BEGIN;
ALTER TABLE public.letter_rounds ADD COLUMN IF NOT EXISTS harptos_period text;
CREATE OR REPLACE FUNCTION public.set_round_harptos_period() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.campaign_calendar;
BEGIN
 IF NEW.status='open' AND NEW.harptos_period IS NULL THEN
  SELECT * INTO d FROM public.campaign_calendar WHERE id=true;
  IF FOUND THEN
   NEW.harptos_period:=CASE WHEN d.festival IS NOT NULL
     THEN lpad(d.year::text,4,'0')||'-F-'||d.festival
     ELSE lpad(d.year::text,4,'0')||'-'||lpad((d.month+1)::text,2,'0')||
       ':désdia-'||((d.day-1)/10+1)::text END;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER z_round_harptos_period
 BEFORE INSERT OR UPDATE OF status ON public.letter_rounds
 FOR EACH ROW EXECUTE FUNCTION public.set_round_harptos_period();
COMMIT;

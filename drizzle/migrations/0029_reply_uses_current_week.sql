CREATE OR REPLACE FUNCTION public.reply_current_week() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT number INTO n FROM public.letter_rounds WHERE status='open' ORDER BY number DESC LIMIT 1;
  IF n IS NULL THEN SELECT max(number) INTO n FROM public.letter_rounds; END IF;
  IF n IS NOT NULL THEN NEW.creation_week:=n; NEW.delivery_week:=n; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_reply_current_week ON public.letter_replies;
CREATE TRIGGER zz_reply_current_week BEFORE INSERT ON public.letter_replies FOR EACH ROW EXECUTE FUNCTION public.reply_current_week();
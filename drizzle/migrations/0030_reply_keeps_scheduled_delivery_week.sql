CREATE OR REPLACE FUNCTION public.reply_current_week() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT number INTO n FROM public.letter_rounds WHERE status='open' ORDER BY number DESC LIMIT 1;
  IF n IS NULL THEN SELECT max(number) INTO n FROM public.letter_rounds; END IF;
  IF n IS NOT NULL THEN NEW.creation_week:=n; END IF;
  RETURN NEW;
END $$;
COMMENT ON COLUMN public.letter_replies.creation_week IS 'Semana em que a resposta foi escrita (exibida no cabeçalho).';
COMMENT ON COLUMN public.letter_replies.delivery_week IS 'Semana em que a resposta será entregue; definida pela função de envio.';
CREATE OR REPLACE FUNCTION public.reply_marks_letter_unread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.publication_state = 'delivered' AND (TG_OP = 'INSERT' OR OLD.publication_state <> 'delivered') THEN
    DELETE FROM public.letter_receipts
    WHERE letter_id = NEW.letter_id AND user_id <> NEW.author_user_id;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER reply_unread
AFTER INSERT OR UPDATE ON public.letter_replies
FOR EACH ROW EXECUTE FUNCTION public.reply_marks_letter_unread();
-- Registro do Mestre is deliberately separate from publicly selectable letters/replies:
-- no API SELECT * or Drive export can accidentally include confidential notes.
BEGIN;
CREATE TABLE public.narrator_mail_notes(
 id text PRIMARY KEY,
 letter_id uuid REFERENCES public.campaign_letters(id) ON DELETE CASCADE,
 reply_id uuid REFERENCES public.letter_replies(id) ON DELETE CASCADE,
 notes jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL,
 CONSTRAINT one_mail_subject CHECK((letter_id IS NOT NULL)::integer+(reply_id IS NOT NULL)::integer=1),
 CONSTRAINT structured_notes_only CHECK(jsonb_typeof(notes)='object' AND (notes - ARRAY['ordem_recebida','execucao','resultado','conhecimento','pendencia'])='{}'::jsonb),
 CONSTRAINT subject_identifier CHECK(
  (letter_id IS NOT NULL AND id='letter:'||letter_id::text) OR
  (reply_id IS NOT NULL AND id='reply:'||reply_id::text)
 )
);
ALTER TABLE public.narrator_mail_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY narrator_mail_notes_private ON public.narrator_mail_notes
 FOR ALL TO authenticated USING(public.is_campaign_admin()) WITH CHECK(public.is_campaign_admin());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.narrator_mail_notes TO authenticated;
GRANT ALL ON public.narrator_mail_notes TO service_role;
COMMIT;

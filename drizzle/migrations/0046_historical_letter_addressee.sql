-- Historical missives can name an outside noble house which does not yet
-- have a playable-house registration. A text label records that addressee
-- without creating fictitious players, house memberships, or inbox deliveries.
ALTER TABLE public.campaign_letters
 ADD COLUMN IF NOT EXISTS historical_recipient_name text,
 ADD COLUMN IF NOT EXISTS historical_source text;
COMMENT ON COLUMN public.campaign_letters.historical_recipient_name
 IS 'Name of the original external addressee, for historical mail without a registered playable house.';
COMMENT ON COLUMN public.campaign_letters.historical_source
 IS 'Provenance of an imported historical letter; not a new send or delivery action.';

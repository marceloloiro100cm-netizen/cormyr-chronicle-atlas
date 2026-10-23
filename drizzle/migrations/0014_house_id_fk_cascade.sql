-- Allow house id corrections to propagate: re-create house foreign keys with ON UPDATE CASCADE.
alter table public.house_memberships drop constraint house_memberships_house_id_fkey;
alter table public.house_memberships add constraint house_memberships_house_id_fkey foreign key (house_id) references public.campaign_houses(id) on update cascade;

alter table public.campaign_records drop constraint campaign_records_house_id_fkey;
alter table public.campaign_records add constraint campaign_records_house_id_fkey foreign key (house_id) references public.campaign_houses(id) on update cascade;

alter table public.campaign_letters drop constraint campaign_letters_recipient_house_id_fkey;
alter table public.campaign_letters add constraint campaign_letters_recipient_house_id_fkey foreign key (recipient_house_id) references public.campaign_houses(id) on update cascade;

alter table public.campaign_players drop constraint campaign_players_roster_house_id_fkey;
alter table public.campaign_players add constraint campaign_players_roster_house_id_fkey foreign key (roster_house_id) references public.campaign_houses(id) on update cascade;

alter table public.drive_sync_bindings drop constraint drive_sync_bindings_house_id_fkey;
alter table public.drive_sync_bindings add constraint drive_sync_bindings_house_id_fkey foreign key (house_id) references public.campaign_houses(id) on update cascade;

alter table public.letter_replies drop constraint letter_replies_house_id_fkey;
alter table public.letter_replies add constraint letter_replies_house_id_fkey foreign key (house_id) references public.campaign_houses(id) on update cascade;
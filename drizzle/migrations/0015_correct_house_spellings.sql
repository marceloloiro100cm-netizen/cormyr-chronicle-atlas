-- Owner confirmed the official spellings: Silversky and Harcourt. The archive rows match exactly,
-- so the inactive archive duplicates are removed and the official rows take the correct ids,
-- names, lord names, crests and castle, with the review notes cleared.

delete from public.campaign_houses where id in ('silversky','harcourt') and active = false;

update public.campaign_houses
set id = 'silversky', name = 'Silversky', lord_name = 'Ashladd Silversky',
    crest = '/cormyr/assets/horselands-silversky.webp', archive_house_id = 'silversky',
    region = 'Horselands', review_note = null
where id = 'silverky';

update public.campaign_houses
set id = 'harcourt', name = 'Harcourt', lord_name = 'Genevieve Harcourt',
    castle = 'Honorwatch Keep', crest = '/cormyr/assets/horselands-harcourt.webp',
    archive_house_id = 'harcourt', region = 'Horselands', review_note = null
where id = 'hardcourt';
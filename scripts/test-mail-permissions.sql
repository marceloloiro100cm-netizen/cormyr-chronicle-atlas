BEGIN;
-- Explicit date for pre-calendar lifecycle fixtures. Date enforcement is tested separately.
SELECT set_config('cormyr.mail_date','1522-01-01',true);
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000000005');
INSERT INTO user_roles VALUES('00000000-0000-0000-0000-000000000001','admin');
INSERT INTO campaign_houses(id,name) VALUES('test-a','A'),('test-b','B');
INSERT INTO campaign_players(id,user_id,name) VALUES ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002','Player 2'),('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000003','Player 3'),('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000004','Player 4'),('00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000005','Player 5');
INSERT INTO house_memberships(player_id,house_id,authorized_by) VALUES('00000000-0000-0000-0000-000000000012','test-a','00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000013','test-b','00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000015','test-a','00000000-0000-0000-0000-000000000001');
INSERT INTO letter_rounds(number,status,closed) VALUES(1,'open',false);
INSERT INTO campaign_letters(id,sender_user_id,sender_name,recipient_house_id,subject,content,letter_number,publication_state) VALUES('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000001','GM','test-a','Test','Text',1,'delivered');
INSERT INTO letter_replies(id,letter_id,author_user_id,author_player_id,author_name,house_id,recipient_user_id,content,idempotency_key,publication_state,delivery_week,reply_to_id)
VALUES('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','A','test-a','00000000-0000-0000-0000-000000000001','[cormyr-image:00000000-0000-0000-0000-000000000001/secret.png|image]','00000000-0000-0000-0000-000000000101','delivered',1,'00000000-0000-0000-0000-000000000100'),
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000001',NULL,'GM','test-a','00000000-0000-0000-0000-000000000002','Future','00000000-0000-0000-0000-000000000102','scheduled',2,'00000000-0000-0000-0000-000000000101');
INSERT INTO storage.objects(bucket_id,name) VALUES('campaign-images','00000000-0000-0000-0000-000000000001/secret.png');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SELECT pg_temp.assert((SELECT count(*)=1 FROM letter_replies),'house member sees delivered reply only');
SELECT pg_temp.assert((SELECT count(*)=1 FROM storage.objects),'house member sees authorized attachment');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM campaign_letters),'outsider cannot read letter');
SELECT pg_temp.assert((SELECT count(*)=0 FROM letter_replies),'outsider cannot read replies');
SELECT pg_temp.assert((SELECT count(*)=0 FROM storage.objects),'outsider cannot read image');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SELECT public.mark_letter_read('00000000-0000-0000-0000-000000000100');
SELECT public.mark_letter_read('00000000-0000-0000-0000-000000000100');
SELECT pg_temp.assert((SELECT count(*)=1 FROM letter_receipts),'repeat mark read updates one receipt');
SELECT public.save_letter_draft('00000000-0000-0000-0000-000000000200','test-b','Draft','First',1);
SELECT public.save_letter_draft('00000000-0000-0000-0000-000000000200','test-b','Draft','Second',1);
SELECT pg_temp.assert((SELECT version=2 FROM campaign_letters WHERE id='00000000-0000-0000-0000-000000000200'),'draft increments version');
SELECT pg_temp.assert((SELECT count(*)=2 FROM letter_versions WHERE letter_id='00000000-0000-0000-0000-000000000200'),'draft retains audit versions');
SELECT public.edit_letter_draft('00000000-0000-0000-0000-000000000200',2,'Draft','Third');
DO $$ BEGIN
 BEGIN PERFORM public.edit_letter_draft('00000000-0000-0000-0000-000000000200',2,'Draft','Stale'); RAISE EXCEPTION 'stale version accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale version accepted' THEN RAISE; END IF; END;
END $$;
SELECT public.schedule_letter_draft('00000000-0000-0000-0000-000000000200',1);
SELECT public.mark_letter_read('00000000-0000-0000-0000-000000000200');
SELECT pg_temp.assert((SELECT count(*)=1 FROM letter_receipts WHERE letter_id='00000000-0000-0000-0000-000000000200'),'author can mark own delivered thread read');
SELECT public.save_weekly_reply_draft('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000100',NULL,'Saved reply');
SELECT public.save_weekly_reply_draft('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000100',NULL,'Edited reply');
-- Lote 4 item 17: player draft stays private from Narrator until delivery.
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000201'),'draft author can see own reply');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000201'),'narrator cannot read a player private draft');
SELECT pg_temp.assert((SELECT count(*)=0 FROM jsonb_array_elements(public.mail_page('{"box":"rascunhos"}')->'replies') AS replies(value)
 WHERE replies.value->>'idempotency_key'='00000000-0000-0000-0000-000000000201'),'narrator paged inbox cannot leak draft');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000201'),'third party cannot see private player draft');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);

SELECT pg_temp.assert(public.reply_delivery_week('00000000-0000-0000-0000-000000000001')=1,'player to GM same week');
SELECT pg_temp.assert(public.reply_delivery_week('00000000-0000-0000-0000-000000000003')=2,'player to player next week');
SELECT public.schedule_weekly_reply_draft((SELECT id FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000201'));
SELECT pg_temp.assert((SELECT publication_state='delivered' FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000201'),'draft reply delivered now');
SELECT public.save_weekly_reply_draft('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000100',NULL,'Will become inaccessible');
SELECT id AS stale_draft_id FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000202' \gset
RESET ROLE;
UPDATE campaign_letters SET deleted_at=now() WHERE id='00000000-0000-0000-0000-000000000100';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT count(*)=0 FROM letter_replies),'deleted parent hides replies from author');
SELECT set_config('test.stale_draft', :'stale_draft_id', true);
DO $$ BEGIN
 BEGIN PERFORM public.schedule_weekly_reply_draft(current_setting('test.stale_draft')::uuid); RAISE EXCEPTION 'deleted parent accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='deleted parent accepted' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM letter_replies),'deleted parent hides house replies');
SELECT pg_temp.assert((SELECT count(*)=0 FROM storage.objects),'deleted parent hides attachment');
RESET ROLE;
SELECT pg_temp.assert(NOT public.can_export_mail('reply','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000005'),'Drive denies deleted parent');
UPDATE campaign_letters SET deleted_at=NULL WHERE id='00000000-0000-0000-0000-000000000100';
SELECT pg_temp.assert(public.can_export_mail('reply','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000005'),'Drive permits same house audience');
SELECT pg_temp.assert(NOT public.can_export_mail('reply','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000002'),'Drive denies future reply');
SELECT pg_temp.assert(NOT public.can_export_mail('reply','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000004'),'Drive denies outsider');
UPDATE campaign_players SET active=false WHERE id='00000000-0000-0000-0000-000000000015';
SELECT pg_temp.assert(NOT public.can_export_mail('reply','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000005'),'Drive denies inactive member');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SELECT public.set_letter_round(1,true);
SELECT pg_temp.assert(public.reply_delivery_week('00000000-0000-0000-0000-000000000002')=2,'GM closed round preview targets next week');
SELECT public.reply_weekly_message('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000101','Next round','00000000-0000-0000-0000-000000000203',false);
SELECT pg_temp.assert((SELECT delivery_week=2 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000203'),'direct reply matches preview');
SELECT public.save_weekly_reply_draft('00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000101','Next round draft');
SELECT public.schedule_weekly_reply_draft((SELECT id FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000204'));
SELECT pg_temp.assert((SELECT delivery_week=2 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000204'),'draft matches direct reply');

-- Lote 1: direct, draft and preview use a single delivery-week calculation.
SELECT pg_temp.assert((SELECT creation_week=1 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000203'),'closed round 1: direct response created in round 1');
SELECT pg_temp.assert((SELECT creation_week=1 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000204'),'closed round 1: draft response created in round 1');
SELECT public.set_letter_round(2,false);
SELECT pg_temp.assert(public.reply_delivery_week('00000000-0000-0000-0000-000000000002')=3,'open round 2: GM preview targets 3');
SELECT public.reply_weekly_message('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000101','Round 2 direct','00000000-0000-0000-0000-000000000205',false);
SELECT pg_temp.assert((SELECT creation_week=2 AND delivery_week=3 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000205'),'open round 2: direct created in 2, scheduled for 3');
SELECT public.save_weekly_reply_draft('00000000-0000-0000-0000-000000000206','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000101','Round 2 draft');
SELECT public.schedule_weekly_reply_draft((SELECT id FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000206'));
SELECT pg_temp.assert((SELECT creation_week=2 AND delivery_week=3 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000206'),'open round 2: approved draft created in 2, scheduled for 3');
SELECT public.set_letter_round(2,true);
SELECT pg_temp.assert(public.reply_delivery_week('00000000-0000-0000-0000-000000000002')=3,'closed round 2: GM preview stays on 3, not 4');
SELECT public.reply_weekly_message('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000101','Between rounds direct','00000000-0000-0000-0000-000000000207',false);
SELECT pg_temp.assert((SELECT creation_week=2 AND delivery_week=3 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000207'),'closed round 2: direct has creation 2 and delivery 3, no double increment');
SELECT public.save_weekly_reply_draft('00000000-0000-0000-0000-000000000208','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000101','Between rounds draft');
SELECT public.schedule_weekly_reply_draft((SELECT id FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000208'));
SELECT pg_temp.assert((SELECT creation_week=2 AND delivery_week=3 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000208'),'closed round 2: draft has same creation and delivery weeks');
-- If a privileged importer explicitly supplies creation_week, the trigger must not override it.
-- Direct INSERT is intentionally forbidden to authenticated clients: use postgres in this rolled-back fixture.
RESET ROLE;
INSERT INTO public.letter_replies (letter_id,author_user_id,author_name,recipient_user_id,content,idempotency_key,creation_week,publication_state)
VALUES('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000001','Mestre','00000000-0000-0000-0000-000000000002','Explicit creation week','00000000-0000-0000-0000-000000000209',1,'draft');
SELECT pg_temp.assert((SELECT creation_week=1 FROM public.letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000209'),'trigger preserves explicit creation week');
SET LOCAL ROLE authenticated;


-- Lote 2 (item 07 EXCLUÍDO): testamos exclusivamente número sequencial,
-- carimbos de encerramento, idempotência e destinatário obrigatório.
DO $round_validation$ BEGIN
  BEGIN
    PERFORM public.set_letter_round(4,false);
    RAISE EXCEPTION 'skip accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='skip accepted' OR SQLERRM NOT LIKE 'As semanas devem avançar em sequência%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_letter_round(99,true);
    RAISE EXCEPTION 'fake close accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='fake close accepted' OR SQLERRM NOT LIKE 'Só é possível encerrar a semana%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_letter_round(1,false);
    RAISE EXCEPTION 'historic reopen accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='historic reopen accepted' OR SQLERRM NOT LIKE 'Semana histórica encerrada%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.send_linked_mail(
      p_key=>'00000000-0000-0000-0000-000000000299',p_origin=>NULL,
      p_targets=>ARRAY[]::text[],p_subject=>'Sem destinatário',p_content=>'Não enviar');
    RAISE EXCEPTION 'recipientless accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='recipientless accepted' OR SQLERRM NOT LIKE 'Escolha entre 1 e 50 destinatários%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_letter_batch_drafts('geral',NULL,'Sem destinatário','Não enviar',ARRAY[]::text[],'00000000-0000-0000-0000-000000000298');
    RAISE EXCEPTION 'recipientless draft accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='recipientless draft accepted' OR SQLERRM NOT LIKE 'Destinatários inválidos%' THEN RAISE; END IF;
  END;
END $round_validation$;
SELECT public.set_letter_round(3,false);
SELECT pg_temp.assert((SELECT status='closed' AND closed_at IS NOT NULL FROM public.letter_rounds WHERE number=2),'opening next week closes former with timestamp');
SELECT pg_temp.assert((SELECT status='open' AND opened_at IS NOT NULL FROM public.letter_rounds WHERE number=3),'new week receives opening timestamp');
SELECT set_config('test.round_queue_count',(SELECT count(*)::text FROM public.sync_outbox),true);
SELECT set_config('test.round_opened_at',(SELECT opened_at::text FROM public.letter_rounds WHERE number=3),true);
SELECT public.set_letter_round(3,false);
SELECT pg_temp.assert((SELECT count(*) FROM public.sync_outbox)=current_setting('test.round_queue_count')::integer,'opening same week twice never requeues');
SELECT pg_temp.assert((SELECT opened_at::text=current_setting('test.round_opened_at') FROM public.letter_rounds WHERE number=3),'opening same week twice preserves original timestamp');
SELECT public.set_letter_round(3,true);
SELECT set_config('test.round_closed_at',(SELECT closed_at::text FROM public.letter_rounds WHERE number=3),true);
SELECT public.set_letter_round(3,true);
SELECT pg_temp.assert((SELECT closed_at::text=current_setting('test.round_closed_at') FROM public.letter_rounds WHERE number=3),'repeating close never overwrites audit timestamp');
DO $round_validation2$ BEGIN
  BEGIN
    PERFORM public.set_letter_round(5,false);
    RAISE EXCEPTION 'skip after closing accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='skip after closing accepted' OR SQLERRM NOT LIKE 'As semanas devem avançar em sequência%' THEN RAISE; END IF;
  END;
END $round_validation2$;

-- Lote 5: versionamento, permissões, adendo do Mestre, audit e entrega Drive.
SELECT pg_temp.assert((SELECT version=2 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000201'),'editing a saved draft increments reply revision');
SELECT pg_temp.assert((SELECT count(*)=2 FROM letter_reply_versions WHERE reply_id=(SELECT id FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000201')),'draft preserves both revisions');
SELECT pg_temp.assert((SELECT count(*)>=1 FROM sync_outbox WHERE entity_type='reply'
 AND entity_id=(SELECT id FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000201') AND version=2),'published edited draft enqueues its current version');
DO $privacy_check$ BEGIN
 BEGIN
  PERFORM public.edit_letter_reply(current_setting('test.stale_draft')::uuid,1,'Mestre tentando ler/alterar rascunho');
  RAISE EXCEPTION 'narrator edited private player draft';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='narrator edited private player draft' OR SQLERRM NOT LIKE 'Rascunho privado de outro jogador%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.delete_letter_reply(current_setting('test.stale_draft')::uuid,1);
  RAISE EXCEPTION 'narrator deleted private player draft';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='narrator deleted private player draft' OR SQLERRM NOT LIKE 'Rascunho privado de outro jogador%' THEN RAISE; END IF;
 END;
END $privacy_check$;
-- O próprio Narrador pode responder ao original sem precisar de resposta prévia do jogador.
SELECT public.reply_weekly_message('00000000-0000-0000-0000-000000000100',NULL,
 'Complemento do Mestre','00000000-0000-0000-0000-000000000310',false);
SELECT pg_temp.assert((SELECT recipient_user_id='00000000-0000-0000-0000-000000000002'::uuid
 AND reply_to_id='00000000-0000-0000-0000-000000000100'::uuid AND delivery_week=4
 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000310'),'narrator addendum addresses active house member and next week');
SELECT public.save_weekly_reply_draft('00000000-0000-0000-0000-000000000311','00000000-0000-0000-0000-000000000100',NULL,'Adendo em rascunho');
SELECT public.schedule_weekly_reply_draft((SELECT id FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000311'));
SELECT pg_temp.assert((SELECT publication_state='scheduled' AND delivery_week=4
 FROM letter_replies WHERE idempotency_key='00000000-0000-0000-0000-000000000311'),'narrator addendum draft can be scheduled');
SELECT public.edit_letter_reply('00000000-0000-0000-0000-000000000101',1,'Texto editorial revisado');
SELECT pg_temp.assert((SELECT version=2 FROM letter_replies WHERE id='00000000-0000-0000-0000-000000000101'),'delivered reply is versioned');
SELECT pg_temp.assert((SELECT count(*)=2 FROM letter_reply_versions WHERE reply_id='00000000-0000-0000-0000-000000000101'),'delivered reply retains revision history');
SELECT pg_temp.assert((SELECT payload->>'content'='Texto editorial revisado'
 FROM sync_outbox WHERE entity_type='reply' AND entity_id='00000000-0000-0000-0000-000000000101' AND version=2),'updated reply exports revised payload');
DO $reply_version_check$ BEGIN
 BEGIN
  PERFORM public.edit_letter_reply('00000000-0000-0000-0000-000000000101',1,'Versão antiga');
  RAISE EXCEPTION 'stale reply accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='stale reply accepted' OR SQLERRM NOT LIKE 'Conflito de versão%' THEN RAISE; END IF;
 END;
END $reply_version_check$;
SELECT public.edit_campaign_letter('00000000-0000-0000-0000-000000000100',1,'Missiva revisada','Texto revisado pelo Mestre');
SELECT pg_temp.assert((SELECT version=2 FROM campaign_letters WHERE id='00000000-0000-0000-0000-000000000100'),'letter edit creates version');
SELECT pg_temp.assert((SELECT payload->>'content'='Texto revisado pelo Mestre'
 FROM sync_outbox WHERE entity_type='letter' AND entity_id='00000000-0000-0000-0000-000000000100' AND version=2),'letter editing queues latest content for Drive');
SELECT public.delete_letter_reply('00000000-0000-0000-0000-000000000101',2);
SELECT pg_temp.assert((SELECT count(*)=3 FROM letter_reply_versions WHERE reply_id='00000000-0000-0000-0000-000000000101'),'soft delete is auditable');
SELECT pg_temp.assert((SELECT count(*)=0 FROM letter_replies WHERE id='00000000-0000-0000-0000-000000000101'),'deleted reply hidden from narrator RLS');
SELECT pg_temp.assert(public.can_export_mail('reply','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001'),'Drive service can publish tombstone for authorized narrator');
SELECT pg_temp.assert(NOT public.can_export_mail('reply','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000004'),'deleted reply tombstone still restricted to original audience');
SELECT pg_temp.assert((SELECT payload->>'deleted_at' IS NOT NULL FROM sync_outbox WHERE entity_type='reply'
 AND entity_id='00000000-0000-0000-0000-000000000101' AND version=3),'soft deletion queues tombstone for Drive');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.can_export_mail(text,uuid,uuid)','EXECUTE'),'export authorization is service only');
ROLLBACK;

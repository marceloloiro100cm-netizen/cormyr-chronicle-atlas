-- Disposable database: enforce the contract without generating real messages.
BEGIN;
DO $check$
DECLARE
 delivery text;
 visibility text;
 guard text;
BEGIN
 SELECT pg_get_functiondef('public.send_linked_mail(uuid,text,text[],text,text,text,text,text,boolean,integer)'::regprocedure) INTO delivery;
 SELECT pg_get_functiondef('public.mail_page(jsonb,integer,integer)'::regprocedure) INTO visibility;
 SELECT pg_get_functiondef('public.require_house_mail_recipient()'::regprocedure) INTO guard;
 IF position('Narrador deve ser o unico destinatario' IN delivery)=0
    OR position('Envio individual desativado' IN delivery)=0 THEN
  RAISE EXCEPTION 'Recipient validation missing: player can bypass house or Narrator choices';
 END IF;
 IF position('NEW.sender_player_id IS NOT NULL' IN guard)=0
    OR position('NEW.recipient_player_id IS NOT NULL' IN guard)=0 THEN
  RAISE EXCEPTION 'Database guard does not distinguish Narrator from individual players';
 END IF;
 IF position('box' IN visibility)=0 OR position('copias' IN visibility)=0
    OR position('l.sender_player_id IS NOT NULL' IN visibility)=0 THEN
  RAISE EXCEPTION 'Narrator virtual copies filter missing';
 END IF;
END $check$;
ROLLBACK;

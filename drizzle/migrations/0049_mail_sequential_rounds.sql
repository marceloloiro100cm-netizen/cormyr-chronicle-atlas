-- Lote 2: itens 06 e 08; item 07 expressamente excluído.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25000ms';
-- Lote 2 (06,08): rodadas estritamente sequenciais.
-- O item 07 foi cancelado pelo Narrador e não é abrangido por esta migração.
-- Esta definição não atualiza cartas, respostas nem semanas históricas.
CREATE OR REPLACE FUNCTION public.set_letter_round(p_number integer, p_closed boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_number integer;
  latest_number integer;
  existing_status text;
BEGIN
  IF NOT public.is_campaign_admin() THEN
    RAISE EXCEPTION 'Somente o Narrador abre ou encerra semanas';
  END IF;
  IF p_number IS NULL OR p_number<1 OR p_closed IS NULL THEN
    RAISE EXCEPTION 'Semana ou operação inválida';
  END IF;
  PERFORM pg_advisory_xact_lock(184522);
  SELECT number INTO current_number FROM public.letter_rounds
   WHERE status='open' ORDER BY number DESC LIMIT 1;
  SELECT coalesce(max(number),0) INTO latest_number FROM public.letter_rounds
   WHERE status IN ('open','closed');
  SELECT status INTO existing_status FROM public.letter_rounds
   WHERE number=p_number;

  IF p_closed THEN
    IF existing_status='closed' THEN
      RETURN; -- repetir fechamento é seguro; preserva o momento original
    END IF;
    IF current_number IS DISTINCT FROM p_number OR existing_status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'Só é possível encerrar a semana que está aberta';
    END IF;
    UPDATE public.letter_rounds
      SET closed=true,status='closed',closed_by=auth.uid(),
          closed_at=now(),updated_at=now()
      WHERE number=p_number AND status='open';
    RETURN;
  END IF;

  IF current_number=p_number THEN
    RETURN; -- não republicar cartas ou respostas ao repetir abertura
  END IF;
  IF existing_status='closed' THEN
    RAISE EXCEPTION 'Semana histórica encerrada não pode ser reaberta';
  END IF;
  IF p_number<>latest_number+1 THEN
    RAISE EXCEPTION 'As semanas devem avançar em sequência. Próxima semana: %',latest_number+1;
  END IF;
  IF existing_status IS NOT NULL AND existing_status<>'prepared' THEN
    RAISE EXCEPTION 'Estado de semana inválido: %',existing_status;
  END IF;

  IF current_number IS NOT NULL THEN
    UPDATE public.letter_rounds
      SET status='closed',closed=true,closed_by=auth.uid(),
          closed_at=now(),updated_at=now()
      WHERE number=current_number AND status='open';
  END IF;
  INSERT INTO public.letter_rounds(number,closed,status,opened_by,opened_at,closed_by,closed_at)
    VALUES(p_number,false,'open',auth.uid(),now(),NULL,NULL)
  ON CONFLICT(number) DO UPDATE
    SET closed=false,status='open',
        opened_by=coalesce(letter_rounds.opened_by,excluded.opened_by),
        opened_at=coalesce(letter_rounds.opened_at,excluded.opened_at),
        closed_by=NULL,closed_at=NULL,updated_at=now()
    WHERE letter_rounds.status='prepared';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível abrir a próxima semana';
  END IF;

  -- Publicar e reenfileirar SOMENTE as mensagens que estavam programadas.
  -- Não reenviar mensagens históricas já entregues.
  WITH transitioned AS (
    UPDATE public.campaign_letters
       SET publication_state='delivered',delivered_at=now()
     WHERE delivery_week=p_number AND publication_state='scheduled'
    RETURNING id,version,to_jsonb(campaign_letters) AS payload
  )
  INSERT INTO public.sync_outbox(entity_type,entity_id,version,payload)
    SELECT 'letter',id,version,payload FROM transitioned
  ON CONFLICT(entity_type,entity_id,version)
    DO UPDATE SET payload=excluded.payload,state='pending',next_attempt_at=now();

  WITH transitioned AS (
    UPDATE public.letter_replies
       SET publication_state='delivered',delivered_at=now()
     WHERE delivery_week=p_number AND publication_state='scheduled'
    RETURNING id,to_jsonb(letter_replies) AS payload
  )
  INSERT INTO public.sync_outbox(entity_type,entity_id,version,payload)
    SELECT 'reply',id,1,payload FROM transitioned
  ON CONFLICT(entity_type,entity_id,version)
    DO UPDATE SET payload=excluded.payload,state='pending',next_attempt_at=now();
END
$function$;

COMMIT;

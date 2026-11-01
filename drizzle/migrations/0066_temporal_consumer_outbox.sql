-- Hub Temporal · Lote 10: pontos de conexão, entregas transacionais e replay seguro.
-- Somente cria mensagens/pendências; NÃO executa sorte, renda, soldos, ações,
-- batalhas, estação nem transferências entre vassalos automaticamente.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE IF NOT EXISTS public.campaign_temporal_consumers(
 code text PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9_-]{1,48}$'),
 title text NOT NULL,
 description text NOT NULL,
 boundary text NOT NULL CHECK(boundary IN ('always','date','month','year','season')),
 mode text NOT NULL CHECK(mode IN ('projection','manual_review')),
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- A tabela é um catálogo explícito de pontos de conexão. Futuras integrações
-- devem ser registradas por migração revisada, nunca por dados do jogador.
INSERT INTO public.campaign_temporal_consumers(code,title,description,boundary,mode) VALUES
 ('official-calendar','Relógio e cabeçalho','Consultar versão oficial, dessdia e ano Harptos; sem cache independente','always','projection'),
 ('chronology','Eventos e missivas','Invalidar a cronologia publicada, sem reescrever documentos históricos','always','projection'),
 ('noble-ages','Nobres e genealogias','Idade derivada da identidade canônica e do ano; falecidos mantêm idade do óbito','year','projection'),
 ('house-assets','Posses e projetos','Recarregar posses ativas e projetos reconciliados pela transação do Lote 9','month','projection'),
 ('army-units','Exércitos e unidades','Recalcular bônus de unidades a partir de posses já ativas; não criar tropas ou soldos','month','projection'),
 ('economy','Economia e sorte','Revisar ações, entradas, mitigação e fortuna pelas regras, sem geração periódica','month','manual_review'),
 ('services','Serviços e obras especiais','Revisar serviços que dependam de prazo sem os conceder automaticamente','month','manual_review'),
 ('vassalage','Vassalagem','Revisar obrigações e eventos de vassalos sem transferências automáticas','month','manual_review'),
 ('seasons','Estações e clima','Revisar regras sazonais pendentes de definição do Narrador','season','manual_review')
ON CONFLICT(code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.campaign_temporal_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_id uuid NOT NULL REFERENCES public.campaign_time_operations(id) ON DELETE RESTRICT,
 consumer_code text NOT NULL REFERENCES public.campaign_temporal_consumers(code) ON DELETE RESTRICT,
 calendar_version integer NOT NULL CHECK(calendar_version>=1),
 from_date text NOT NULL CHECK(public.valid_campaign_date(from_date)),
 to_date text NOT NULL CHECK(public.valid_campaign_date(to_date)),
 direction text NOT NULL CHECK(direction IN ('forward','backward','same')),
 boundary text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('projection','manual_review')),
 status text NOT NULL CHECK(status IN ('informational','pending','reviewed','skipped')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(operation_id,consumer_code),
 CHECK ((mode='projection' AND status='informational')
     OR (mode='manual_review' AND status IN ('pending','reviewed','skipped'))),
 CHECK ((status IN ('reviewed','skipped') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
     OR (status IN ('informational','pending') AND reviewed_by IS NULL AND reviewed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS campaign_temporal_deliveries_pending_idx
 ON public.campaign_temporal_deliveries(status,created_at,id)
 WHERE status='pending';
CREATE INDEX IF NOT EXISTS campaign_temporal_deliveries_operation_idx
 ON public.campaign_temporal_deliveries(operation_id);
ALTER TABLE public.campaign_temporal_consumers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_temporal_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_temporal_consumers FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.campaign_temporal_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.campaign_temporal_consumers TO service_role;
GRANT ALL ON public.campaign_temporal_deliveries TO service_role;

-- A chave de resolução é independente da chave de publicação.
-- Uma repetição com mesmos parâmetros retorna o resultado anterior, enquanto
-- uma chave reaproveitada com outros parâmetros é rejeitada.
CREATE TABLE IF NOT EXISTS public.campaign_temporal_delivery_resolutions(
 request_key uuid PRIMARY KEY,
 delivery_id uuid NOT NULL REFERENCES public.campaign_temporal_deliveries(id) ON DELETE RESTRICT,
 actor uuid NOT NULL REFERENCES auth.users(id),
 request_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('reviewed','skipped')),
 note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_temporal_delivery_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_temporal_delivery_resolutions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.campaign_temporal_delivery_resolutions TO service_role;

-- Ponto de deduplicação para FUTUROS consumidores transacionais. Cada regra
-- deverá usar uma chave semântica (ex.: idCasa:mes:regra), nunca apenas o UUID
-- da publicação, para impedir duplicação após retrocessos históricos.
CREATE TABLE IF NOT EXISTS public.campaign_temporal_effect_checkpoints(
 consumer_code text NOT NULL REFERENCES public.campaign_temporal_consumers(code),
 effect_key text NOT NULL CHECK(length(effect_key) BETWEEN 1 AND 240),
 first_operation_id uuid NOT NULL REFERENCES public.campaign_time_operations(id),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(consumer_code,effect_key)
);
ALTER TABLE public.campaign_temporal_effect_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_temporal_effect_checkpoints FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.campaign_temporal_effect_checkpoints TO service_role;
-- Não há RPC pública para criar checkpoints: serão gravados pela mesma transação
-- SQL da regra de negócio quando uma integração futura estiver aprovada.

CREATE OR REPLACE FUNCTION public.enqueue_campaign_temporal_consumers()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $enqueue$
DECLARE
 from_month integer;to_month integer;from_year integer;to_year integer;
 from_season text;to_season text;ord_from integer;ord_to integer;
 dir text;entry public.campaign_temporal_consumers;
 matches_boundary boolean;summary jsonb;
BEGIN
 from_year:=(NEW.before_state->>'year')::integer;
 to_year:=(NEW.after_state->>'year')::integer;
 from_month:=(NEW.before_state->>'month')::integer;
 to_month:=(NEW.after_state->>'month')::integer;
 from_season:=CASE from_month
  WHEN 0 THEN 'winter' WHEN 1 THEN 'winter'
  WHEN 2 THEN 'spring' WHEN 3 THEN 'spring' WHEN 4 THEN 'spring'
  WHEN 5 THEN 'summer' WHEN 6 THEN 'summer' WHEN 7 THEN 'summer'
  WHEN 8 THEN 'autumn' WHEN 9 THEN 'autumn' WHEN 10 THEN 'autumn'
  ELSE 'winter' END;
 to_season:=CASE to_month
  WHEN 0 THEN 'winter' WHEN 1 THEN 'winter'
  WHEN 2 THEN 'spring' WHEN 3 THEN 'spring' WHEN 4 THEN 'spring'
  WHEN 5 THEN 'summer' WHEN 6 THEN 'summer' WHEN 7 THEN 'summer'
  WHEN 8 THEN 'autumn' WHEN 9 THEN 'autumn' WHEN 10 THEN 'autumn'
  ELSE 'winter' END;
 ord_from:=public.harptos_calendar_ordinal(NEW.from_date);
 ord_to:=public.harptos_calendar_ordinal(NEW.to_date);
 dir:=CASE WHEN ord_to>ord_from THEN 'forward'
  WHEN ord_to<ord_from THEN 'backward' ELSE 'same' END;
 summary:=jsonb_build_object(
  'operation_id',NEW.id,'calendar_version',NEW.after_state->'version',
  'from',NEW.from_date,'to',NEW.to_date,'direction',dir,'published_mode',NEW.mode,
  'month_delta',(to_year*12+to_month)-(from_year*12+from_month),
  'year_delta',to_year-from_year,'season_from',from_season,'season_to',to_season,
  'rule_effects_applied',false);
 FOR entry IN SELECT * FROM public.campaign_temporal_consumers WHERE enabled ORDER BY code LOOP
  matches_boundary:=CASE entry.boundary
   WHEN 'always' THEN true
   WHEN 'date' THEN ord_from<>ord_to
   WHEN 'month' THEN from_year*12+from_month<>to_year*12+to_month
   WHEN 'year' THEN from_year<>to_year
   WHEN 'season' THEN from_season<>to_season
   ELSE false END;
  IF matches_boundary THEN
   INSERT INTO public.campaign_temporal_deliveries(
    operation_id,consumer_code,calendar_version,from_date,to_date,
    direction,boundary,mode,status,payload)
   VALUES(NEW.id,entry.code,(NEW.after_state->>'version')::integer,
    NEW.from_date,NEW.to_date,dir,entry.boundary,entry.mode,
    CASE WHEN entry.mode='projection' THEN 'informational' ELSE 'pending' END,
    summary||jsonb_build_object('consumer',entry.code,'boundary',entry.boundary))
   ON CONFLICT(operation_id,consumer_code) DO NOTHING;
  END IF;
 END LOOP;
 RETURN NEW;
END $enqueue$;
REVOKE ALL ON FUNCTION public.enqueue_campaign_temporal_consumers()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS enqueue_campaign_temporal_consumers ON public.campaign_time_operations;
CREATE TRIGGER enqueue_campaign_temporal_consumers
 AFTER INSERT ON public.campaign_time_operations
 FOR EACH ROW EXECUTE FUNCTION public.enqueue_campaign_temporal_consumers();

-- Registro de consumidores e entregas: apenas projeções e metadados sem conteúdo
-- privado de missivas, Personagens ou Casas. Nenhum SELECT direto é concedido.
CREATE OR REPLACE FUNCTION public.get_temporal_consumer_dashboard(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $dashboard$
DECLARE c jsonb;d jsonb;pending_total integer;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Painel temporal exclusivo do Narrador'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Limite de entregas inválido'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.code),'[]'::jsonb) INTO c
 FROM (SELECT registry.code,registry.title,registry.description,registry.boundary,
         registry.mode,registry.enabled,
         count(delivery.id)::integer AS total,
         count(delivery.id) FILTER(WHERE delivery.status='pending')::integer AS pending
       FROM public.campaign_temporal_consumers registry
       LEFT JOIN public.campaign_temporal_deliveries delivery
         ON delivery.consumer_code=registry.code
       GROUP BY registry.code) x;
 SELECT count(*)::integer INTO pending_total
 FROM public.campaign_temporal_deliveries WHERE status='pending';
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) INTO d
 FROM (
  SELECT id,operation_id,consumer_code,calendar_version,from_date,to_date,
    direction,boundary,mode,status,review_note,reviewed_at,created_at
  FROM public.campaign_temporal_deliveries
  ORDER BY created_at DESC,id DESC LIMIT p_limit
 ) x;
 RETURN jsonb_build_object('consumers',c,'deliveries',d,'pending_total',pending_total);
END $dashboard$;
REVOKE ALL ON FUNCTION public.get_temporal_consumer_dashboard(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_temporal_consumer_dashboard(integer) TO authenticated;

-- Revisar NÃO executa regra da Casa, exército ou economia.
CREATE OR REPLACE FUNCTION public.resolve_temporal_delivery(
 p_id uuid,p_request_key uuid,p_status text,p_note text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $resolve$
DECLARE actor_id uuid;d public.campaign_temporal_deliveries;
 prior public.campaign_temporal_delivery_resolutions;signature text;
BEGIN
 IF NOT public.is_campaign_admin() OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Somente o Narrador revisa entregas temporais'; END IF;
 actor_id:=auth.uid();
 IF p_id IS NULL OR p_request_key IS NULL OR p_status NOT IN ('reviewed','skipped')
    OR length(btrim(coalesce(p_note,'')))<10 THEN
  RAISE EXCEPTION 'Identificação, decisão e justificativa de dez caracteres obrigatórias'; END IF;
 signature:=md5(jsonb_build_object('id',p_id,'status',p_status,'note',btrim(p_note))::text);
 SELECT * INTO prior FROM public.campaign_temporal_delivery_resolutions
 WHERE request_key=p_request_key;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM actor_id OR prior.request_hash IS DISTINCT FROM signature THEN
   RAISE EXCEPTION 'Chave de resolução já utilizada com outros parâmetros'; END IF;
  RETURN jsonb_build_object('id',prior.delivery_id,'status',prior.status,'duplicate',true);
 END IF;
 SELECT * INTO d FROM public.campaign_temporal_deliveries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Entrega temporal não localizada'; END IF;
 IF d.mode<>'manual_review' OR d.status<>'pending' THEN
  RAISE EXCEPTION 'Esta entrega não está pendente; revisão repetida bloqueada'; END IF;
 UPDATE public.campaign_temporal_deliveries SET status=p_status,
  reviewed_by=actor_id,reviewed_at=now(),review_note=left(btrim(p_note),500)
 WHERE id=p_id;
 INSERT INTO public.campaign_temporal_delivery_resolutions(
  request_key,delivery_id,actor,request_hash,status,note)
 VALUES(p_request_key,p_id,actor_id,signature,p_status,left(btrim(p_note),500));
 RETURN jsonb_build_object('id',p_id,'status',p_status,'duplicate',false);
END $resolve$;
REVOKE ALL ON FUNCTION public.resolve_temporal_delivery(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_temporal_delivery(uuid,uuid,text,text) TO authenticated;

-- Replay seguro = releitura do evento original e seu status, sem enfileirar
-- novamente nem executar mutações de recursos/soldos/fortuna.
CREATE OR REPLACE FUNCTION public.replay_temporal_delivery(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $replay$
DECLARE d public.campaign_temporal_deliveries;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Replay temporal exclusivo do Narrador'; END IF;
 SELECT * INTO d FROM public.campaign_temporal_deliveries WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Entrega temporal não localizada'; END IF;
 RETURN jsonb_build_object('id',d.id,'status',d.status,'mode',d.mode,
  'payload',d.payload,'replay_read_only',true);
END $replay$;
REVOKE ALL ON FUNCTION public.replay_temporal_delivery(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replay_temporal_delivery(uuid) TO authenticated;
COMMIT;

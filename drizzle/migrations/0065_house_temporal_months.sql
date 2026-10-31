-- Hub Temporal · Lote 9: possses, construcoes e servicos das Casas.
-- Vincula execucao ao MES ABSOLUTO do Reino; nunca soma o delta ao mes
-- defasado de cada Casa. Sem efeito de renda passiva ou Sorte automatica.
BEGIN;
SET LOCAL lock_timeout='5s';

-- PREVIA ADMINISTRATIVA: nenhuma escrita, versao do calendario validada.
-- Inclui Casas em atraso, adiantadas, rascunhos, conflitos e obras elegiveis.
CREATE OR REPLACE FUNCTION public.preview_house_time_impacts(
 p_version integer,p_target_date text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $preview$
DECLARE c public.campaign_calendar;
 base_month integer; target_month integer; target_year integer; target_m integer;
 row_value record; items jsonb:='[]'::jsonb; due_count integer;
 eligible integer:=0; ahead_count integer:=0; draft_count integer:=0;
 invalid_count integer:=0; synced_count integer:=0; total integer:=0;
 project_total integer:=0; disposition text; house_month integer;
BEGIN
 IF NOT public.is_campaign_admin() THEN
  RAISE EXCEPTION 'Apenas o Narrador consulta o impacto de posses'; END IF;
 IF NOT public.valid_campaign_date(p_target_date) THEN
  RAISE EXCEPTION 'Destino temporal invalido'; END IF;
 SELECT * INTO c FROM public.campaign_calendar WHERE id=true;
 IF NOT FOUND OR c.version IS DISTINCT FROM p_version THEN
  RAISE EXCEPTION 'Calendário alterado; recarregue antes de confirmar'; END IF;
 base_month:=c.year*12+c.month;
 target_year:=left(p_target_date,4)::integer;
 target_m:=CASE WHEN substring(p_target_date,6,2)='F-' THEN
  CASE substring(p_target_date,8) WHEN 'midwinter' THEN 0
   WHEN 'greengrass' THEN 3 WHEN 'midsummer' THEN 6
   WHEN 'shieldmeet' THEN 6 WHEN 'highharvestide' THEN 8 ELSE 10 END
  ELSE substring(p_target_date,6,2)::integer-1 END;
 target_month:=target_year*12+target_m;
 IF abs(target_month-base_month)>120 THEN
  RAISE EXCEPTION 'Salto temporal superior a 120 meses'; END IF;
 FOR row_value IN SELECT house_id,state,version FROM public.noble_house_sheets ORDER BY house_id LOOP
  total:=total+1;
  due_count:=0;
  house_month:=NULL;
  IF row_value.state->>'schemaVersion' IS DISTINCT FROM '1'
    OR jsonb_typeof(row_value.state)<>'object'
    OR jsonb_typeof(row_value.state->'holdings') IS DISTINCT FROM 'array'
    OR jsonb_typeof(row_value.state->'projects') IS DISTINCT FROM 'array'
    OR row_value.state->>'houseId' IS DISTINCT FROM row_value.house_id
    OR coalesce(row_value.state->>'month','') !~ '^[0-9]{1,6}$' THEN
    disposition:='invalid';invalid_count:=invalid_count+1;
  ELSE
   house_month:=(row_value.state->>'month')::integer;
   IF row_value.state->>'phase'='active' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(row_value.state->'projects') e(p)
    WHERE e.p->>'status'='building'
      AND (coalesce(e.p->>'start','') !~ '^[0-9]{1,6}$'
        OR coalesce(e.p->>'duration','') !~ '^[0-9]{1,6}$'
        OR coalesce(e.p->>'modifier','') !~ '^-?[0-9]{1,6}$'
        OR e.p->>'holdingId' IS NULL)) THEN
     disposition:='invalid';invalid_count:=invalid_count+1;
   ELSIF row_value.state->>'phase' IS DISTINCT FROM 'active' THEN
    disposition:='draft';draft_count:=draft_count+1;
   ELSIF target_month<=base_month THEN
    disposition:='historical';synced_count:=synced_count+1;
   ELSIF house_month>=target_month THEN
    IF house_month>base_month THEN
     disposition:='ahead';ahead_count:=ahead_count+1;
    ELSE
     disposition:='aligned';synced_count:=synced_count+1;
    END IF;
   ELSE
    disposition:='advance';eligible:=eligible+1;
    SELECT count(*)::integer INTO due_count FROM
     jsonb_array_elements(row_value.state->'projects') AS entry(project)
     WHERE entry.project->>'status'='building'
       AND (entry.project->>'start') ~ '^[0-9]{1,6}$'
       AND (entry.project->>'duration') ~ '^[0-9]{1,6}$'
       AND (entry.project->>'modifier') ~ '^-?[0-9]{1,6}$'
       AND (entry.project->>'start')::integer+
           (entry.project->>'duration')::integer+
           (entry.project->>'modifier')::integer <= target_month;
    project_total:=project_total+due_count;
   END IF;
  END IF;
  items:=items||jsonb_build_array(jsonb_build_object(
   'house_id',row_value.house_id,'version',row_value.version,
   'month',house_month,'status',disposition,'project_candidates',due_count));
 END LOOP;
 RETURN jsonb_build_object(
  'calendar_version',c.version,
  'base_month',base_month,'target_month',target_month,
  'total',total,'eligible',eligible,'ahead',ahead_count,'drafts',draft_count,
  'invalid',invalid_count,'aligned_or_historical',synced_count,
  'project_candidates',project_total,
  'houses',items,
  'backdated',target_month<base_month);
END $preview$;
REVOKE ALL ON FUNCTION public.preview_house_time_impacts(integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_house_time_impacts(integer,text) TO authenticated;

-- O contrato da versao 0038 recebe numero de meses a avancar; mantemos essa
-- assinatura (chamada dentro de publish_campaign_time_change) e substituimos
-- a implementacao por reconciliacao ABSOLUTA com o destino do calendario.
CREATE OR REPLACE FUNCTION public.apply_calendar_months(delta integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $apply$
DECLARE
 c public.campaign_calendar; target_month integer;
 s public.noble_house_sheets; next_state jsonb; holdings jsonb; projects jsonb;
 next_projects jsonb; p jsonb; h jsonb; parent jsonb;
 effective_deadline integer; round_n integer; project_n integer;
 changed boolean; candidate_finished integer; cancelled integer;
 start_month integer; project_id text; holding_id text; parent_id text;
BEGIN
 IF delta IS NULL OR delta<=0 THEN RETURN; END IF;
 IF delta>120 THEN RAISE EXCEPTION 'Avanço mensal superior a 120 meses'; END IF;
 IF NOT public.is_campaign_admin() OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Somente o Narrador avança os meses da campanha'; END IF;
 SELECT * INTO c FROM public.campaign_calendar WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Calendário oficial indisponível'; END IF;
 target_month:=c.year*12+c.month+delta;
 IF target_month>9999*12+11 THEN
  RAISE EXCEPTION 'Ano destino excede Harptos'; END IF;
 FOR s IN SELECT * FROM public.noble_house_sheets ORDER BY house_id LOOP
  -- Ordem deterministica igual ao fluxo de edicao de cada Casa.
  PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||s.house_id,0));
  SELECT * INTO s FROM public.noble_house_sheets WHERE house_id=s.house_id FOR UPDATE;
  IF jsonb_typeof(s.state)<>'object'
    OR s.state->>'schemaVersion' IS DISTINCT FROM '1'
    OR s.state->>'houseId' IS DISTINCT FROM s.house_id
    OR coalesce(s.state->>'month','') !~ '^[0-9]{1,6}$'
    OR jsonb_typeof(s.state->'holdings') IS DISTINCT FROM 'array'
    OR jsonb_typeof(s.state->'projects') IS DISTINCT FROM 'array'
  THEN
   RAISE EXCEPTION 'Casa % com ficha temporal invalida; revise antes de avancar',s.house_id;
  END IF;
  IF s.state->>'phase' IS DISTINCT FROM 'active' THEN CONTINUE; END IF;
  start_month:=(s.state->>'month')::integer;
  -- Uma Casa adiantada (ex.: retificacao historica) nao pode ser revertida.
  IF start_month>=target_month THEN CONTINUE; END IF;
  -- Retificacoes historicas podem deixar a Casa adiantada em relacao ao
  -- periodo anterior do Reino: avance apenas a diferenca ainda nao processada.
  -- Protecao contra uma ficha que foi artificialmente retrocedida e cujo
  -- periodo de destino ja foi efetivamente processado no livro-razão.
  IF EXISTS(SELECT 1 FROM public.noble_house_ledger l
    WHERE l.house_id=s.house_id AND l.action='calendar_advance'
    AND l.campaign_month=target_month) THEN
   RAISE EXCEPTION 'Casa % ja possui lancamento temporal para o mes %; verifique o historico',
    s.house_id,target_month;
  END IF;
  holdings:=s.state->'holdings';projects:=s.state->'projects';
  project_n:=jsonb_array_length(projects);
  candidate_finished:=0;cancelled:=0;
  -- Passagem em ponto fixo: pais concluidos no MES de destino desbloqueiam
  -- filhos dependentes mesmo quando a ordem do array nao e topologica.
  FOR round_n IN 1..(project_n+1) LOOP
   changed:=false;next_projects:='[]'::jsonb;
   FOR p IN SELECT value FROM jsonb_array_elements(projects) LOOP
    IF p->>'status'='building' THEN
     IF coalesce(p->>'start','') !~ '^[0-9]{1,6}$'
      OR coalesce(p->>'duration','') !~ '^[0-9]{1,6}$'
      OR coalesce(p->>'modifier','') !~ '^-?[0-9]{1,6}$'
      OR p->>'holdingId' IS NULL THEN
      RAISE EXCEPTION 'Projeto de % sem duracao/inicio valido; revisao necessaria',s.house_id;
     END IF;
     effective_deadline:=(p->>'start')::integer+(p->>'duration')::integer+
       (p->>'modifier')::integer;
     IF effective_deadline<=target_month THEN
      holding_id:=p->>'holdingId';
      SELECT value INTO h FROM jsonb_array_elements(holdings)
       WHERE value->>'id'=holding_id;
      IF h IS NULL OR h->>'status' NOT IN ('building','active') THEN
       p:=jsonb_set(p,'{status}','"cancelled"'::jsonb);
       cancelled:=cancelled+1;changed:=true;
      ELSIF h->>'status'='active' THEN
       p:=jsonb_set(p,'{status}','"completed"'::jsonb);
       candidate_finished:=candidate_finished+1;changed:=true;
      ELSE
       parent_id:=nullif(h->>'parentId','');
       IF parent_id IS NULL THEN
        p:=jsonb_set(p,'{status}','"completed"'::jsonb);
        candidate_finished:=candidate_finished+1;changed:=true;
       ELSE
        SELECT value INTO parent FROM jsonb_array_elements(holdings)
         WHERE value->>'id'=parent_id;
        IF parent IS NOT NULL AND parent->>'status'='active' THEN
         p:=jsonb_set(p,'{status}','"completed"'::jsonb);
         candidate_finished:=candidate_finished+1;changed:=true;
        END IF;
       END IF;
       IF p->>'status'='completed' THEN
        SELECT coalesce(jsonb_agg(
         CASE WHEN value->>'id'=holding_id
          THEN jsonb_set(value,'{status}','"active"'::jsonb)
          ELSE value END ORDER BY ord),'[]'::jsonb)
        INTO holdings FROM jsonb_array_elements(holdings) WITH ORDINALITY h(value,ord);
       END IF;
      END IF;
     END IF;
    END IF;
    next_projects:=next_projects||jsonb_build_array(p);
   END LOOP;
   projects:=next_projects;
   EXIT WHEN NOT changed;
  END LOOP;
  next_state:=jsonb_set(jsonb_set(s.state,'{month}',to_jsonb(target_month)),
   '{projects}',projects);
  next_state:=jsonb_set(next_state,'{holdings}',holdings);
  PERFORM public.commit_noble_house_operation(
   auth.uid(),s.house_id,s.version,gen_random_uuid(),'calendar_advance',
   next_state,
   'Hub Temporal · mes absoluto '||start_month||' → '||target_month||
   ' · obras concluidas '||candidate_finished||' · projetos cancelados '||cancelled,
   'Lote 9 · reconciliacao absoluta e atomica de meses de Harptos; sem renda/fortuna automatica');
 END LOOP;
END $apply$;
REVOKE ALL ON FUNCTION public.apply_calendar_months(integer) FROM PUBLIC,anon,authenticated;
COMMIT;

        OR coalesce(e.p->>'duration','') !~ '^[0-9]{1,6}
    disposition:='draft';draft_count:=draft_count+1;
   ELSIF target_month<=base_month THEN
    disposition:='historical';synced_count:=synced_count+1;
   ELSIF house_month>=target_month THEN
    IF house_month>base_month THEN
     disposition:='ahead';ahead_count:=ahead_count+1;
    ELSE
     disposition:='aligned';synced_count:=synced_count+1;
    END IF;
   ELSE
    disposition:='advance';eligible:=eligible+1;
    SELECT count(*)::integer INTO due_count FROM
     jsonb_array_elements(row_value.state->'projects') AS entry(project)
     WHERE entry.project->>'status'='building'
       AND (entry.project->>'start') ~ '^[0-9]{1,6}$'
       AND (entry.project->>'duration') ~ '^[0-9]{1,6}$'
       AND (entry.project->>'modifier') ~ '^-?[0-9]{1,6}$'
       AND (entry.project->>'start')::integer+
           (entry.project->>'duration')::integer+
           (entry.project->>'modifier')::integer <= target_month;
    project_total:=project_total+due_count;
   END IF;
  END IF;
  items:=items||jsonb_build_array(jsonb_build_object(
   'house_id',row_value.house_id,'version',row_value.version,
   'month',house_month,'status',disposition,'project_candidates',due_count));
 END LOOP;
 RETURN jsonb_build_object(
  'calendar_version',c.version,
  'base_month',base_month,'target_month',target_month,
  'total',total,'eligible',eligible,'ahead',ahead_count,'drafts',draft_count,
  'invalid',invalid_count,'aligned_or_historical',synced_count,
  'project_candidates',project_total,
  'houses',items,
  'backdated',target_month<base_month);
END $preview$;
REVOKE ALL ON FUNCTION public.preview_house_time_impacts(integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_house_time_impacts(integer,text) TO authenticated;

-- O contrato da versao 0038 recebe numero de meses a avancar; mantemos essa
-- assinatura (chamada dentro de publish_campaign_time_change) e substituimos
-- a implementacao por reconciliacao ABSOLUTA com o destino do calendario.
CREATE OR REPLACE FUNCTION public.apply_calendar_months(delta integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $apply$
DECLARE
 c public.campaign_calendar; target_month integer;
 s public.noble_house_sheets; next_state jsonb; holdings jsonb; projects jsonb;
 next_projects jsonb; p jsonb; h jsonb; parent jsonb;
 effective_deadline integer; round_n integer; project_n integer;
 changed boolean; candidate_finished integer; cancelled integer;
 start_month integer; project_id text; holding_id text; parent_id text;
BEGIN
 IF delta IS NULL OR delta<=0 THEN RETURN; END IF;
 IF delta>120 THEN RAISE EXCEPTION 'Avanço mensal superior a 120 meses'; END IF;
 IF NOT public.is_campaign_admin() OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Somente o Narrador avança os meses da campanha'; END IF;
 SELECT * INTO c FROM public.campaign_calendar WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Calendário oficial indisponível'; END IF;
 target_month:=c.year*12+c.month+delta;
 IF target_month>9999*12+11 THEN
  RAISE EXCEPTION 'Ano destino excede Harptos'; END IF;
 FOR s IN SELECT * FROM public.noble_house_sheets ORDER BY house_id LOOP
  -- Ordem deterministica igual ao fluxo de edicao de cada Casa.
  PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||s.house_id,0));
  SELECT * INTO s FROM public.noble_house_sheets WHERE house_id=s.house_id FOR UPDATE;
  IF jsonb_typeof(s.state)<>'object'
    OR s.state->>'schemaVersion' IS DISTINCT FROM '1'
    OR s.state->>'houseId' IS DISTINCT FROM s.house_id
    OR coalesce(s.state->>'month','') !~ '^[0-9]{1,6}$'
    OR jsonb_typeof(s.state->'holdings') IS DISTINCT FROM 'array'
    OR jsonb_typeof(s.state->'projects') IS DISTINCT FROM 'array'
  THEN
   RAISE EXCEPTION 'Casa % com ficha temporal invalida; revise antes de avancar',s.house_id;
  END IF;
  IF s.state->>'phase' IS DISTINCT FROM 'active' THEN CONTINUE; END IF;
  start_month:=(s.state->>'month')::integer;
  -- Uma Casa adiantada (ex.: retificacao historica) nao pode ser revertida.
  IF start_month>=target_month THEN CONTINUE; END IF;
  -- Retificacoes historicas podem deixar a Casa adiantada em relacao ao
  -- periodo anterior do Reino: avance apenas a diferenca ainda nao processada.
  -- Protecao contra uma ficha que foi artificialmente retrocedida e cujo
  -- periodo de destino ja foi efetivamente processado no livro-razão.
  IF EXISTS(SELECT 1 FROM public.noble_house_ledger l
    WHERE l.house_id=s.house_id AND l.action='calendar_advance'
    AND l.campaign_month=target_month) THEN
   RAISE EXCEPTION 'Casa % ja possui lancamento temporal para o mes %; verifique o historico',
    s.house_id,target_month;
  END IF;
  holdings:=s.state->'holdings';projects:=s.state->'projects';
  project_n:=jsonb_array_length(projects);
  candidate_finished:=0;cancelled:=0;
  -- Passagem em ponto fixo: pais concluidos no MES de destino desbloqueiam
  -- filhos dependentes mesmo quando a ordem do array nao e topologica.
  FOR round_n IN 1..(project_n+1) LOOP
   changed:=false;next_projects:='[]'::jsonb;
   FOR p IN SELECT value FROM jsonb_array_elements(projects) LOOP
    IF p->>'status'='building' THEN
     IF coalesce(p->>'start','') !~ '^[0-9]{1,6}$'
      OR coalesce(p->>'duration','') !~ '^[0-9]{1,6}$'
      OR coalesce(p->>'modifier','') !~ '^-?[0-9]{1,6}$'
      OR p->>'holdingId' IS NULL THEN
      RAISE EXCEPTION 'Projeto de % sem duracao/inicio valido; revisao necessaria',s.house_id;
     END IF;
     effective_deadline:=(p->>'start')::integer+(p->>'duration')::integer+
       (p->>'modifier')::integer;
     IF effective_deadline<=target_month THEN
      holding_id:=p->>'holdingId';
      SELECT value INTO h FROM jsonb_array_elements(holdings)
       WHERE value->>'id'=holding_id;
      IF h IS NULL OR h->>'status' NOT IN ('building','active') THEN
       p:=jsonb_set(p,'{status}','"cancelled"'::jsonb);
       cancelled:=cancelled+1;changed:=true;
      ELSIF h->>'status'='active' THEN
       p:=jsonb_set(p,'{status}','"completed"'::jsonb);
       candidate_finished:=candidate_finished+1;changed:=true;
      ELSE
       parent_id:=nullif(h->>'parentId','');
       IF parent_id IS NULL THEN
        p:=jsonb_set(p,'{status}','"completed"'::jsonb);
        candidate_finished:=candidate_finished+1;changed:=true;
       ELSE
        SELECT value INTO parent FROM jsonb_array_elements(holdings)
         WHERE value->>'id'=parent_id;
        IF parent IS NOT NULL AND parent->>'status'='active' THEN
         p:=jsonb_set(p,'{status}','"completed"'::jsonb);
         candidate_finished:=candidate_finished+1;changed:=true;
        END IF;
       END IF;
       IF p->>'status'='completed' THEN
        SELECT coalesce(jsonb_agg(
         CASE WHEN value->>'id'=holding_id
          THEN jsonb_set(value,'{status}','"active"'::jsonb)
          ELSE value END ORDER BY ord),'[]'::jsonb)
        INTO holdings FROM jsonb_array_elements(holdings) WITH ORDINALITY h(value,ord);
       END IF;
      END IF;
     END IF;
    END IF;
    next_projects:=next_projects||jsonb_build_array(p);
   END LOOP;
   projects:=next_projects;
   EXIT WHEN NOT changed;
  END LOOP;
  next_state:=jsonb_set(jsonb_set(s.state,'{month}',to_jsonb(target_month)),
   '{projects}',projects);
  next_state:=jsonb_set(next_state,'{holdings}',holdings);
  PERFORM public.commit_noble_house_operation(
   auth.uid(),s.house_id,s.version,gen_random_uuid(),'calendar_advance',
   next_state,
   'Hub Temporal · mes absoluto '||start_month||' → '||target_month||
   ' · obras concluidas '||candidate_finished||' · projetos cancelados '||cancelled,
   'Lote 9 · reconciliacao absoluta e atomica de meses de Harptos; sem renda/fortuna automatica');
 END LOOP;
END $apply$;
REVOKE ALL ON FUNCTION public.apply_calendar_months(integer) FROM PUBLIC,anon,authenticated;
COMMIT;

        OR coalesce(e.p->>'modifier','') !~ '^-?[0-9]{1,6}
    disposition:='draft';draft_count:=draft_count+1;
   ELSIF target_month<=base_month THEN
    disposition:='historical';synced_count:=synced_count+1;
   ELSIF house_month>=target_month THEN
    IF house_month>base_month THEN
     disposition:='ahead';ahead_count:=ahead_count+1;
    ELSE
     disposition:='aligned';synced_count:=synced_count+1;
    END IF;
   ELSE
    disposition:='advance';eligible:=eligible+1;
    SELECT count(*)::integer INTO due_count FROM
     jsonb_array_elements(row_value.state->'projects') AS entry(project)
     WHERE entry.project->>'status'='building'
       AND (entry.project->>'start') ~ '^[0-9]{1,6}$'
       AND (entry.project->>'duration') ~ '^[0-9]{1,6}$'
       AND (entry.project->>'modifier') ~ '^-?[0-9]{1,6}$'
       AND (entry.project->>'start')::integer+
           (entry.project->>'duration')::integer+
           (entry.project->>'modifier')::integer <= target_month;
    project_total:=project_total+due_count;
   END IF;
  END IF;
  items:=items||jsonb_build_array(jsonb_build_object(
   'house_id',row_value.house_id,'version',row_value.version,
   'month',house_month,'status',disposition,'project_candidates',due_count));
 END LOOP;
 RETURN jsonb_build_object(
  'calendar_version',c.version,
  'base_month',base_month,'target_month',target_month,
  'total',total,'eligible',eligible,'ahead',ahead_count,'drafts',draft_count,
  'invalid',invalid_count,'aligned_or_historical',synced_count,
  'project_candidates',project_total,
  'houses',items,
  'backdated',target_month<base_month);
END $preview$;
REVOKE ALL ON FUNCTION public.preview_house_time_impacts(integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_house_time_impacts(integer,text) TO authenticated;

-- O contrato da versao 0038 recebe numero de meses a avancar; mantemos essa
-- assinatura (chamada dentro de publish_campaign_time_change) e substituimos
-- a implementacao por reconciliacao ABSOLUTA com o destino do calendario.
CREATE OR REPLACE FUNCTION public.apply_calendar_months(delta integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $apply$
DECLARE
 c public.campaign_calendar; target_month integer;
 s public.noble_house_sheets; next_state jsonb; holdings jsonb; projects jsonb;
 next_projects jsonb; p jsonb; h jsonb; parent jsonb;
 effective_deadline integer; round_n integer; project_n integer;
 changed boolean; candidate_finished integer; cancelled integer;
 start_month integer; project_id text; holding_id text; parent_id text;
BEGIN
 IF delta IS NULL OR delta<=0 THEN RETURN; END IF;
 IF delta>120 THEN RAISE EXCEPTION 'Avanço mensal superior a 120 meses'; END IF;
 IF NOT public.is_campaign_admin() OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Somente o Narrador avança os meses da campanha'; END IF;
 SELECT * INTO c FROM public.campaign_calendar WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Calendário oficial indisponível'; END IF;
 target_month:=c.year*12+c.month+delta;
 IF target_month>9999*12+11 THEN
  RAISE EXCEPTION 'Ano destino excede Harptos'; END IF;
 FOR s IN SELECT * FROM public.noble_house_sheets ORDER BY house_id LOOP
  -- Ordem deterministica igual ao fluxo de edicao de cada Casa.
  PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||s.house_id,0));
  SELECT * INTO s FROM public.noble_house_sheets WHERE house_id=s.house_id FOR UPDATE;
  IF jsonb_typeof(s.state)<>'object'
    OR s.state->>'schemaVersion' IS DISTINCT FROM '1'
    OR s.state->>'houseId' IS DISTINCT FROM s.house_id
    OR coalesce(s.state->>'month','') !~ '^[0-9]{1,6}$'
    OR jsonb_typeof(s.state->'holdings') IS DISTINCT FROM 'array'
    OR jsonb_typeof(s.state->'projects') IS DISTINCT FROM 'array'
  THEN
   RAISE EXCEPTION 'Casa % com ficha temporal invalida; revise antes de avancar',s.house_id;
  END IF;
  IF s.state->>'phase' IS DISTINCT FROM 'active' THEN CONTINUE; END IF;
  start_month:=(s.state->>'month')::integer;
  -- Uma Casa adiantada (ex.: retificacao historica) nao pode ser revertida.
  IF start_month>=target_month THEN CONTINUE; END IF;
  -- Retificacoes historicas podem deixar a Casa adiantada em relacao ao
  -- periodo anterior do Reino: avance apenas a diferenca ainda nao processada.
  -- Protecao contra uma ficha que foi artificialmente retrocedida e cujo
  -- periodo de destino ja foi efetivamente processado no livro-razão.
  IF EXISTS(SELECT 1 FROM public.noble_house_ledger l
    WHERE l.house_id=s.house_id AND l.action='calendar_advance'
    AND l.campaign_month=target_month) THEN
   RAISE EXCEPTION 'Casa % ja possui lancamento temporal para o mes %; verifique o historico',
    s.house_id,target_month;
  END IF;
  holdings:=s.state->'holdings';projects:=s.state->'projects';
  project_n:=jsonb_array_length(projects);
  candidate_finished:=0;cancelled:=0;
  -- Passagem em ponto fixo: pais concluidos no MES de destino desbloqueiam
  -- filhos dependentes mesmo quando a ordem do array nao e topologica.
  FOR round_n IN 1..(project_n+1) LOOP
   changed:=false;next_projects:='[]'::jsonb;
   FOR p IN SELECT value FROM jsonb_array_elements(projects) LOOP
    IF p->>'status'='building' THEN
     IF coalesce(p->>'start','') !~ '^[0-9]{1,6}$'
      OR coalesce(p->>'duration','') !~ '^[0-9]{1,6}$'
      OR coalesce(p->>'modifier','') !~ '^-?[0-9]{1,6}$'
      OR p->>'holdingId' IS NULL THEN
      RAISE EXCEPTION 'Projeto de % sem duracao/inicio valido; revisao necessaria',s.house_id;
     END IF;
     effective_deadline:=(p->>'start')::integer+(p->>'duration')::integer+
       (p->>'modifier')::integer;
     IF effective_deadline<=target_month THEN
      holding_id:=p->>'holdingId';
      SELECT value INTO h FROM jsonb_array_elements(holdings)
       WHERE value->>'id'=holding_id;
      IF h IS NULL OR h->>'status' NOT IN ('building','active') THEN
       p:=jsonb_set(p,'{status}','"cancelled"'::jsonb);
       cancelled:=cancelled+1;changed:=true;
      ELSIF h->>'status'='active' THEN
       p:=jsonb_set(p,'{status}','"completed"'::jsonb);
       candidate_finished:=candidate_finished+1;changed:=true;
      ELSE
       parent_id:=nullif(h->>'parentId','');
       IF parent_id IS NULL THEN
        p:=jsonb_set(p,'{status}','"completed"'::jsonb);
        candidate_finished:=candidate_finished+1;changed:=true;
       ELSE
        SELECT value INTO parent FROM jsonb_array_elements(holdings)
         WHERE value->>'id'=parent_id;
        IF parent IS NOT NULL AND parent->>'status'='active' THEN
         p:=jsonb_set(p,'{status}','"completed"'::jsonb);
         candidate_finished:=candidate_finished+1;changed:=true;
        END IF;
       END IF;
       IF p->>'status'='completed' THEN
        SELECT coalesce(jsonb_agg(
         CASE WHEN value->>'id'=holding_id
          THEN jsonb_set(value,'{status}','"active"'::jsonb)
          ELSE value END ORDER BY ord),'[]'::jsonb)
        INTO holdings FROM jsonb_array_elements(holdings) WITH ORDINALITY h(value,ord);
       END IF;
      END IF;
     END IF;
    END IF;
    next_projects:=next_projects||jsonb_build_array(p);
   END LOOP;
   projects:=next_projects;
   EXIT WHEN NOT changed;
  END LOOP;
  next_state:=jsonb_set(jsonb_set(s.state,'{month}',to_jsonb(target_month)),
   '{projects}',projects);
  next_state:=jsonb_set(next_state,'{holdings}',holdings);
  PERFORM public.commit_noble_house_operation(
   auth.uid(),s.house_id,s.version,gen_random_uuid(),'calendar_advance',
   next_state,
   'Hub Temporal · mes absoluto '||start_month||' → '||target_month||
   ' · obras concluidas '||candidate_finished||' · projetos cancelados '||cancelled,
   'Lote 9 · reconciliacao absoluta e atomica de meses de Harptos; sem renda/fortuna automatica');
 END LOOP;
END $apply$;
REVOKE ALL ON FUNCTION public.apply_calendar_months(integer) FROM PUBLIC,anon,authenticated;
COMMIT;

        OR e.p->>'holdingId' IS NULL)) THEN
     disposition:='invalid';invalid_count:=invalid_count+1;
   ELSIF row_value.state->>'phase' IS DISTINCT FROM 'active' THEN
    disposition:='draft';draft_count:=draft_count+1;
   ELSIF target_month<=base_month THEN
    disposition:='historical';synced_count:=synced_count+1;
   ELSIF house_month>=target_month THEN
    IF house_month>base_month THEN
     disposition:='ahead';ahead_count:=ahead_count+1;
    ELSE
     disposition:='aligned';synced_count:=synced_count+1;
    END IF;
   ELSE
    disposition:='advance';eligible:=eligible+1;
    SELECT count(*)::integer INTO due_count FROM
     jsonb_array_elements(row_value.state->'projects') AS entry(project)
     WHERE entry.project->>'status'='building'
       AND (entry.project->>'start') ~ '^[0-9]{1,6}$'
       AND (entry.project->>'duration') ~ '^[0-9]{1,6}$'
       AND (entry.project->>'modifier') ~ '^-?[0-9]{1,6}$'
       AND (entry.project->>'start')::integer+
           (entry.project->>'duration')::integer+
           (entry.project->>'modifier')::integer <= target_month;
    project_total:=project_total+due_count;
   END IF;
  END IF;
  items:=items||jsonb_build_array(jsonb_build_object(
   'house_id',row_value.house_id,'version',row_value.version,
   'month',house_month,'status',disposition,'project_candidates',due_count));
 END LOOP;
 RETURN jsonb_build_object(
  'calendar_version',c.version,
  'base_month',base_month,'target_month',target_month,
  'total',total,'eligible',eligible,'ahead',ahead_count,'drafts',draft_count,
  'invalid',invalid_count,'aligned_or_historical',synced_count,
  'project_candidates',project_total,
  'houses',items,
  'backdated',target_month<base_month);
END $preview$;
REVOKE ALL ON FUNCTION public.preview_house_time_impacts(integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_house_time_impacts(integer,text) TO authenticated;

-- O contrato da versao 0038 recebe numero de meses a avancar; mantemos essa
-- assinatura (chamada dentro de publish_campaign_time_change) e substituimos
-- a implementacao por reconciliacao ABSOLUTA com o destino do calendario.
CREATE OR REPLACE FUNCTION public.apply_calendar_months(delta integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $apply$
DECLARE
 c public.campaign_calendar; target_month integer;
 s public.noble_house_sheets; next_state jsonb; holdings jsonb; projects jsonb;
 next_projects jsonb; p jsonb; h jsonb; parent jsonb;
 effective_deadline integer; round_n integer; project_n integer;
 changed boolean; candidate_finished integer; cancelled integer;
 start_month integer; project_id text; holding_id text; parent_id text;
BEGIN
 IF delta IS NULL OR delta<=0 THEN RETURN; END IF;
 IF delta>120 THEN RAISE EXCEPTION 'Avanço mensal superior a 120 meses'; END IF;
 IF NOT public.is_campaign_admin() OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Somente o Narrador avança os meses da campanha'; END IF;
 SELECT * INTO c FROM public.campaign_calendar WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Calendário oficial indisponível'; END IF;
 target_month:=c.year*12+c.month+delta;
 IF target_month>9999*12+11 THEN
  RAISE EXCEPTION 'Ano destino excede Harptos'; END IF;
 FOR s IN SELECT * FROM public.noble_house_sheets ORDER BY house_id LOOP
  -- Ordem deterministica igual ao fluxo de edicao de cada Casa.
  PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||s.house_id,0));
  SELECT * INTO s FROM public.noble_house_sheets WHERE house_id=s.house_id FOR UPDATE;
  IF jsonb_typeof(s.state)<>'object'
    OR s.state->>'schemaVersion' IS DISTINCT FROM '1'
    OR s.state->>'houseId' IS DISTINCT FROM s.house_id
    OR coalesce(s.state->>'month','') !~ '^[0-9]{1,6}$'
    OR jsonb_typeof(s.state->'holdings') IS DISTINCT FROM 'array'
    OR jsonb_typeof(s.state->'projects') IS DISTINCT FROM 'array'
  THEN
   RAISE EXCEPTION 'Casa % com ficha temporal invalida; revise antes de avancar',s.house_id;
  END IF;
  IF s.state->>'phase' IS DISTINCT FROM 'active' THEN CONTINUE; END IF;
  start_month:=(s.state->>'month')::integer;
  -- Uma Casa adiantada (ex.: retificacao historica) nao pode ser revertida.
  IF start_month>=target_month THEN CONTINUE; END IF;
  -- Retificacoes historicas podem deixar a Casa adiantada em relacao ao
  -- periodo anterior do Reino: avance apenas a diferenca ainda nao processada.
  -- Protecao contra uma ficha que foi artificialmente retrocedida e cujo
  -- periodo de destino ja foi efetivamente processado no livro-razão.
  IF EXISTS(SELECT 1 FROM public.noble_house_ledger l
    WHERE l.house_id=s.house_id AND l.action='calendar_advance'
    AND l.campaign_month=target_month) THEN
   RAISE EXCEPTION 'Casa % ja possui lancamento temporal para o mes %; verifique o historico',
    s.house_id,target_month;
  END IF;
  holdings:=s.state->'holdings';projects:=s.state->'projects';
  project_n:=jsonb_array_length(projects);
  candidate_finished:=0;cancelled:=0;
  -- Passagem em ponto fixo: pais concluidos no MES de destino desbloqueiam
  -- filhos dependentes mesmo quando a ordem do array nao e topologica.
  FOR round_n IN 1..(project_n+1) LOOP
   changed:=false;next_projects:='[]'::jsonb;
   FOR p IN SELECT value FROM jsonb_array_elements(projects) LOOP
    IF p->>'status'='building' THEN
     IF coalesce(p->>'start','') !~ '^[0-9]{1,6}$'
      OR coalesce(p->>'duration','') !~ '^[0-9]{1,6}$'
      OR coalesce(p->>'modifier','') !~ '^-?[0-9]{1,6}$'
      OR p->>'holdingId' IS NULL THEN
      RAISE EXCEPTION 'Projeto de % sem duracao/inicio valido; revisao necessaria',s.house_id;
     END IF;
     effective_deadline:=(p->>'start')::integer+(p->>'duration')::integer+
       (p->>'modifier')::integer;
     IF effective_deadline<=target_month THEN
      holding_id:=p->>'holdingId';
      SELECT value INTO h FROM jsonb_array_elements(holdings)
       WHERE value->>'id'=holding_id;
      IF h IS NULL OR h->>'status' NOT IN ('building','active') THEN
       p:=jsonb_set(p,'{status}','"cancelled"'::jsonb);
       cancelled:=cancelled+1;changed:=true;
      ELSIF h->>'status'='active' THEN
       p:=jsonb_set(p,'{status}','"completed"'::jsonb);
       candidate_finished:=candidate_finished+1;changed:=true;
      ELSE
       parent_id:=nullif(h->>'parentId','');
       IF parent_id IS NULL THEN
        p:=jsonb_set(p,'{status}','"completed"'::jsonb);
        candidate_finished:=candidate_finished+1;changed:=true;
       ELSE
        SELECT value INTO parent FROM jsonb_array_elements(holdings)
         WHERE value->>'id'=parent_id;
        IF parent IS NOT NULL AND parent->>'status'='active' THEN
         p:=jsonb_set(p,'{status}','"completed"'::jsonb);
         candidate_finished:=candidate_finished+1;changed:=true;
        END IF;
       END IF;
       IF p->>'status'='completed' THEN
        SELECT coalesce(jsonb_agg(
         CASE WHEN value->>'id'=holding_id
          THEN jsonb_set(value,'{status}','"active"'::jsonb)
          ELSE value END ORDER BY ord),'[]'::jsonb)
        INTO holdings FROM jsonb_array_elements(holdings) WITH ORDINALITY h(value,ord);
       END IF;
      END IF;
     END IF;
    END IF;
    next_projects:=next_projects||jsonb_build_array(p);
   END LOOP;
   projects:=next_projects;
   EXIT WHEN NOT changed;
  END LOOP;
  next_state:=jsonb_set(jsonb_set(s.state,'{month}',to_jsonb(target_month)),
   '{projects}',projects);
  next_state:=jsonb_set(next_state,'{holdings}',holdings);
  PERFORM public.commit_noble_house_operation(
   auth.uid(),s.house_id,s.version,gen_random_uuid(),'calendar_advance',
   next_state,
   'Hub Temporal · mes absoluto '||start_month||' → '||target_month||
   ' · obras concluidas '||candidate_finished||' · projetos cancelados '||cancelled,
   'Lote 9 · reconciliacao absoluta e atomica de meses de Harptos; sem renda/fortuna automatica');
 END LOOP;
END $apply$;
REVOKE ALL ON FUNCTION public.apply_calendar_months(integer) FROM PUBLIC,anon,authenticated;
COMMIT;

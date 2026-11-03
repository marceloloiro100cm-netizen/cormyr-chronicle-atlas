-- CCA-ESP-MVP-001 · Aditivo temporal aprovado pelo Narrador
-- 1 rodada de espionagem = 1 désdia = 10 dias ORDINÁRIOS de Harptos.
-- SQL candidato para reconciliação futura do agendador durável; REVIEW_ONLY.
-- Festivais intercalares NÃO consomem os dez dias. Não publica calendário.
BEGIN;
CREATE OR REPLACE FUNCTION public.spy_add_desdias(p_date_key text,p_rounds integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public,pg_temp AS $spy$
DECLARE y integer;m integer;d integer;festival text;
 ordinary_idx bigint; next_idx bigint;ny integer;nm integer;nd integer;
BEGIN
 IF p_rounds NOT BETWEEN 0 AND 10000 THEN
  RAISE EXCEPTION 'Quantidade de désdias inválida'; END IF;
 IF p_date_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  y:=substring(p_date_key,1,4)::integer;
  m:=substring(p_date_key,6,2)::integer;
  d:=substring(p_date_key,9,2)::integer;
  IF y NOT BETWEEN 1 AND 9999 OR m NOT BETWEEN 1 AND 12 OR d NOT BETWEEN 1 AND 30
  THEN RAISE EXCEPTION 'Data ordinária de Harptos inválida'; END IF;
 ELSIF p_date_key ~ '^[0-9]{4}-F-[a-z-]+$' THEN
  y:=substring(p_date_key,1,4)::integer;
  festival:=substring(p_date_key,8);
  m:=CASE festival
   WHEN 'midwinter' THEN 1 WHEN 'greengrass' THEN 4
   WHEN 'midsummer' THEN 7 WHEN 'shieldmeet' THEN 7
   WHEN 'highharvestide' THEN 9 WHEN 'feast-moon' THEN 11
   ELSE NULL END;
  d:=30;
  IF y NOT BETWEEN 1 AND 9999 OR m IS NULL OR
   (festival='shieldmeet' AND y%4<>0)
  THEN RAISE EXCEPTION 'Festival de Harptos inválido neste ano'; END IF;
 ELSE
  RAISE EXCEPTION 'Chave de Harptos inválida'; END IF;
 IF p_rounds=0 THEN RETURN p_date_key; END IF;
 -- Ordinal de dias ORDINÁRIOS: 360 por ano, nenhum festival inserido.
 ordinary_idx:=(y::bigint-1)*360+(m-1)*30+d-1;
 next_idx:=ordinary_idx+p_rounds::bigint*10;
 IF next_idx>=9999::bigint*360 THEN
  RAISE EXCEPTION 'Prazo ultrapassa o limite do calendário de Harptos'; END IF;
 ny:=(next_idx/360)::integer+1;
 nm:=((next_idx%360)/30)::integer+1;
 nd:=(next_idx%30)::integer+1;
 RETURN lpad(ny::text,4,'0')||'-'||lpad(nm::text,2,'0')||'-'||lpad(nd::text,2,'0');
END $spy$;
REVOKE ALL ON FUNCTION public.spy_add_desdias(text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_add_desdias(text,integer) TO service_role;
COMMIT;

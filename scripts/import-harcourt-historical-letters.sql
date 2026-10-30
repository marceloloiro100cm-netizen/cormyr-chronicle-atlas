-- Idempotent archival import, prepared from "Ação da Casa Harcourt.docx".
-- The in-world send date, provided by the user, is 12 Marpenoth 1522 CV.
-- The file's 15 Marpenoth is the future celebration date, not the send date.
-- Player letters reach Everlost and Silversky. The two NPC recipients are
-- the Narrator's incoming correspondence; no fictitious playable house created.
-- All four retain their actual Harcourt player identity and Lady Genevieve's signature.
BEGIN;
SET LOCAL statement_timeout = '30000ms';
DO $import$
DECLARE
 author_player uuid;author_user uuid;admin_user uuid;round_number integer;
BEGIN
 SELECT id,user_id INTO STRICT author_player,author_user FROM public.campaign_players
 WHERE roster_house_id='harcourt' AND active AND user_id IS NOT NULL;
 SELECT user_id INTO admin_user FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 IF admin_user IS NULL THEN RAISE EXCEPTION 'No Narrator role to audit the import'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.campaign_houses WHERE id='harcourt' AND active)
 OR NOT EXISTS(SELECT 1 FROM public.campaign_houses WHERE id='everlost' AND active)
 OR NOT EXISTS(SELECT 1 FROM public.campaign_houses WHERE id='silversky' AND active)
 THEN RAISE EXCEPTION 'A listed playable house is missing'; END IF;
 IF NOT public.valid_campaign_date('1522-10-12') THEN RAISE EXCEPTION 'Invalid Harptos date'; END IF;
 round_number:=coalesce(public.open_letter_round(),(SELECT max(number) FROM public.letter_rounds),1);
 INSERT INTO public.campaign_letters(
  id,sender_player_id,sender_user_id,sender_name,
  recipient_house_id,recipient_player_id,origin_house_id,
  subject,content,campaign_date,creation_week,delivery_week,
  publication_state,letter_kind,delivered_at,
  sync_state,last_synced_at,administrative_actor,
  historical_recipient_name,historical_source
 )
 SELECT src.id,author_player,author_user,'Lady Genevieve Harcourt',
 src.recipient_house_id,NULL,'harcourt',
 src.subject,src.body,'1522-10-12',round_number,round_number,
 'delivered','reservada',now(),
 'synced',now(),admin_user,
 src.recipient_label,'Ação da Casa Harcourt.docx'
 FROM (VALUES
 ('b1201522-0000-4000-8000-000000000001'::uuid,'Verdadeira Ressurreição — Casa Everlost',$harcourtletter$Ao Barão Odnot Everlost, Senhor de Wind Spring,
Há famílias cuja história é escrita em tratados, outras em salões, e algumas, como a vossa, em
sangue e aço.

A Verdadeira Ressurreição nos recorda que nem mesmo a morte precisa ser a última palavra. É uma
lição que imagino encontrar eco entre os Everlost, uma casa que conhece o peso da perda e a
dificuldade de se reerguer sem abandonar aquilo em que acredita.

Em homenagem a Torm e à renovação de seus votos, envio de Goldsun uma pequena seleção de
nossos vinhos e provisões, tanto para vossa mesa quanto para os homens que servem sob vosso
estandarte. Que possam compartilhar uma refeição digna da ocasião e recordar que o dever daqueles
que protegem nossas terras merece ser reconhecido também em tempos de paz.
Não é necessário que toda demonstração de respeito venha acompanhada de uma espada
desembainhada. Às vezes, uma mesa bem servida estabelece uma amizade que muitos discursos
jamais conseguiriam.

Que Torm fortaleça vossa casa, preserve vossos homens e conceda aos Everlost muitos anos para
construir aquilo que seus antepassados não puderam terminar.

Com estima e consideração,

Genevieve Harcourt
Senhora de Goldsun Keep$harcourtletter$,'everlost',NULL),
 ('b1201522-0000-4000-8000-000000000002'::uuid,'Verdadeira Ressurreição — Casa Silversky',$harcourtletter$Ao Senhor Ashladd Silversky, o Um-Olho, Senhor de Vila Rapina,
Dizem que os céus favorecem aqueles que desejam alcançar grandes alturas. Ainda assim, até a
águia mais ambiciosa precisa encontrar alimento antes de voltar a voar.

A Verdadeira Ressurreição é uma ocasião apropriada para recordar que a força não está apenas em
subir, mas também em saber o que merece ser preservado durante a ascensão. A Casa Silversky
ainda tem muitos horizontes diante de si, e imagino que seu senhor não pretenda desperdiçar
nenhum deles.

Por isso, envio de Goldsun alguns vinhos de nossas adegas e provisões de nossos silos, para vossa
casa e para os homens responsáveis por proteger Vila Rapina. Que os soldados possam desfrutar de
um pequeno descanso durante a celebração, e que vossa mesa receba uma lembrança da estima com
que os Harcourt observam o crescimento de vossos domínios.

Em nome de Torm, que a renovação da fé seja também uma renovação de propósito. Que a astúcia
vos permita reconhecer as oportunidades, que a prudência vos ajude a escolher quais perseguir e
que a fortuna não vos falte quando chegar o momento de agir.

Afinal, subir é uma ambição respeitável. Permanecer no alto é uma arte muito mais rara.

Com amizade e consideração,

Genevieve Harcourt
Senhora de Goldsun Keep$harcourtletter$,'silversky',NULL),
 ('b1201522-0000-4000-8000-000000000003'::uuid,'Verdadeira Ressurreição — Casa Stormserpent',$harcourtletter$À Lady Maerra Stormserpent, Senhora de Windscar, Guardiã dos
Campos do Trovão,
Uma boa senhora sabe que notícias confiáveis são tão valiosas quanto boas colheitas, e que
nenhuma das duas chega muito longe sem pessoas capazes de transportá-las.
A Casa Stormserpent compreende isso melhor do que a maioria. Seus patrulheiros conhecem as
distâncias, seus cavaleiros sabem o valor de uma montaria bem cuidada e vossos comandantes
aprenderam que a prudência não diminui a coragem. São virtudes que merecem reconhecimento.

Em preparação para a Verdadeira Ressurreição, envio de Goldsun vinhos de nossas adegas e
provisões de nossos silos, com uma parte reservada aos homens que mantêm as estradas e os
campos sob vigilância. Que encontrem algum conforto à mesa após suas jornadas, e que suas
montarias também recebam o cuidado que merecem.

A celebração de Torm nos recorda que o serviço não perde seu valor quando ninguém está olhando.
Às vezes, são justamente aqueles que permanecem longe dos salões e das cerimônias que tornam
possível a segurança de todos os demais.

Espero que receba este gesto como uma expressão sincera de respeito por vossa casa e pelo trabalho
que realiza nas Horselands.

Que Torm proteja vossos cavaleiros, conserve a clareza de vossas observações e permita que vossas
flechas permaneçam reservadas para os perigos que realmente as merecem.

Com estima,

Genevieve Harcourt
Senhora de Goldsun Keep$harcourtletter$,NULL,'Lady Maerra Stormserpent — Windscar (NPC, Narrador)'),
 ('b1201522-0000-4000-8000-000000000004'::uuid,'Verdadeira Ressurreição — Casa Greenbarrow',$harcourtletter$À Lady Alisanne Greenbarrow, Senhora de Easting,
As terras férteis nos ensinam uma verdade que os nobres por vezes esquecem: nenhuma casa
prospera apenas porque possui boas terras. É preciso cultivá-las, proteger quem trabalha nelas e
compreender que a abundância de uma estação deve ajudar a sustentar a seguinte.

Por essa razão, considero a Verdadeira Ressurreição uma ocasião particularmente adequada para
estender a mão aos vizinhos. A renovação da fé em Torm nos recorda que o dever não se limita aos
grandes feitos, mas também se manifesta nos cuidados cotidianos que permitem a uma comunidade
permanecer de pé.

Envio de Goldsun uma seleção de nossos vinhos, grãos, farinha e conservas, com uma parte
destinada aos guardas e servidores responsáveis pela segurança de Easting. Espero que esses
presentes encontrem bom uso nas celebrações e proporcionem algum conforto àqueles que
trabalham para manter vossa cidade próspera.

Que Torm abençoe os campos, proteja os viajantes e recompense aqueles que dedicam seu trabalho
ao bem de suas comunidades. E que a prosperidade de Easting continue sendo motivo de orgulho
para seus habitantes e uma contribuição para a paz de toda a região.

Recebei este presente como sinal de estima e como desejo sincero de que nossas casas mantenham
relações cordiais, sustentadas pela confiança, pelo comércio e pelo respeito mútuo.

Com consideração e os melhores votos para a celebração,
Genevieve Harcourt
Senhora de Goldsun Keep$harcourtletter$,NULL,'Lady Alisanne Greenbarrow — Easting (NPC, Narrador)')
 ) AS src(id,subject,body,recipient_house_id,recipient_label)
 ON CONFLICT (id) DO NOTHING;

 -- The standard INSERT trigger queues a sync command, but these are historical
 -- correspondence already sent in-world, not a new outgoing narratorial action.
 DELETE FROM public.sync_outbox WHERE entity_type='letter' AND state='pending'
  AND entity_id IN (
   'b1201522-0000-4000-8000-000000000001'::uuid,
   'b1201522-0000-4000-8000-000000000002'::uuid,
   'b1201522-0000-4000-8000-000000000003'::uuid,
   'b1201522-0000-4000-8000-000000000004'::uuid
  );

 IF (SELECT count(*) FROM public.campaign_letters
     WHERE id::text LIKE 'b1201522-0000-4000-8000-00000000000%'
       AND sender_user_id=author_user AND sender_player_id=author_player
       AND origin_house_id='harcourt' AND campaign_date='1522-10-12'
       AND publication_state='delivered'
       AND historical_source='Ação da Casa Harcourt.docx')<>4
 THEN RAISE EXCEPTION 'Import validation failed: four Harcourt letters expected'; END IF;
 IF (SELECT count(*) FROM public.campaign_letters
     WHERE id::text LIKE 'b1201522-0000-4000-8000-00000000000%'
       AND recipient_house_id IS NULL AND recipient_player_id IS NULL
       AND historical_recipient_name LIKE '%(NPC, Narrador)%')<>2
 THEN RAISE EXCEPTION 'NPC letter routing mismatch'; END IF;
END $import$;
COMMIT;

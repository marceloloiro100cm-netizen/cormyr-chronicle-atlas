-- Galeria de espiões da pasta Google Drive enviada pelo Narrador.
-- 15 imagens servidas pelo próprio Cormyr. 5 imagens grandes utilizam
-- miniatura pública do Drive com fallback seguro na interface.
-- Nenhum agente criado e nenhuma seleção existente sobrescrita.
BEGIN;
INSERT INTO public.spy_portrait_catalog(id,label,image_url,sort_order,active)
VALUES
 ('espiao-tillet','Tillet','https://drive.google.com/thumbnail?id=17SXFn87QQIvsjauiFYRWWIVdk4IiXkcQ&sz=w400',1,true),
 ('espiao-estivadora','Estivadora','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/estivadora.jpg',2,true),
 ('espiao-cortesa','Cortesã','https://drive.google.com/thumbnail?id=15jcdLz8R1bkofUK_X8uvIR4cSOPBl2ng&sz=w400',3,true),
 ('espiao-vigia','Vigia','https://drive.google.com/thumbnail?id=1roVx_sdr7BCchzPs_CleJvwH2iVZvLNK&sz=w400',4,true),
 ('espiao-ladina','Ladina','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/ladina.jpg',5,true),
 ('espiao-taverneiro','Taverneiro','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/taverneiro.jpg',6,true),
 ('espiao-assassino','Assassino','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/assassino.jpg',7,true),
 ('espiao-cozinheira','Cozinheira','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/cozinheira.jpg',8,true),
 ('espiao-escriba','Escriba','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/escriba.jpg',9,true),
 ('espiao-bardo','Bardo','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/bardo.jpg',10,true),
 ('espiao-ferreiro','Ferreiro','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/ferreiro.jpg',11,true),
 ('espiao-mensageira','Mensageira','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/mensageira.jpg',12,true),
 ('espiao-mendiga','Mendiga','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/mendiga.jpg',13,true),
 ('espiao-cacador','Caçador','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/cacador.jpg',14,true),
 ('espiao-nobre','Nobre','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/nobre.jpg',15,true),
 ('espiao-mercador','Mercador','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/mercador.jpg',16,true),
 ('espiao-camponesa','Camponesa','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/camponesa.jpg',17,true),
 ('espiao-contador','Contador','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/contador.jpg',18,true),
 ('espiao-guarda','Guarda','https://drive.google.com/thumbnail?id=1wM1JWqE8w_tjxwre1QtHS_-7SEEVVwWs&sz=w400',19,true),
 ('espiao-ladrao','Ladrão','https://drive.google.com/thumbnail?id=1dwtaJHBRq8t4RGuVr3-CWVUDtopxmz9j&sz=w400',20,true)
ON CONFLICT(id) DO UPDATE SET
 label=EXCLUDED.label,image_url=EXCLUDED.image_url,
 sort_order=EXCLUDED.sort_order,active=true;
COMMIT;

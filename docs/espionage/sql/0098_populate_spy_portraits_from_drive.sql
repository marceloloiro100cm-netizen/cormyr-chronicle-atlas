-- Galeria de espiões da pasta Google Drive enviada pelo Narrador.
-- 20 imagens servidas pelo próprio Cormyr, sem depender de miniaturas do Drive.
-- Originais confirmados no catálogo de profissões enviado pelo Narrador.
-- Nenhum agente criado e nenhuma seleção existente sobrescrita.
BEGIN;
INSERT INTO public.spy_portrait_catalog(id,label,image_url,sort_order,active)
VALUES
 ('espiao-tillet','Tillet','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/tillet.jpg',1,true),
 ('espiao-estivadora','Estivadora','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/estivadora.jpg',2,true),
 ('espiao-cortesa','Cortesã','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/cortesa.jpg',3,true),
 ('espiao-vigia','Vigia','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/vigia.jpg',4,true),
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
 ('espiao-guarda','Guarda','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/guarda.jpg',19,true),
 ('espiao-ladrao','Ladrão','https://cormyr-chronicle-atlas.lovable.app/spy-portraits/ladrao.jpg',20,true)
ON CONFLICT(id) DO UPDATE SET
 label=EXCLUDED.label,image_url=EXCLUDED.image_url,
 sort_order=EXCLUDED.sort_order,active=true;
COMMIT;

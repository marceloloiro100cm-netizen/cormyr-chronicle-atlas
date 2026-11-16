# Dossiês de Espionagem — consulta Firebase Cloud

## Escopo

A consulta `listSpyDossiers` entra na API existente
`POST /api/firebase-cloud-read` e só utiliza o Firebase Admin SDK no
servidor. Não depende de Supabase, não acessa coleções com o SDK de
navegador e não executa novas missões.

Na interface `/firebase-access`, após escolher uma Casa, aparecem os
seus dossiês de inteligência: Casa investigada, quantidade de segredos
descobertos, categorias (Recursos / Exército / Posses), informações
reveladas e data da última verificação.

## Segurança

- O servidor verifica um Firebase ID token não revogado e a conta Auth
  habilitada. Perfil e Casas autorizadas são consultados no documento de
  acesso do snapshot, nunca vindos do navegador.
- Jogadores consultam **somente dossiês cujo `ownerHouseId` pertença à
  Casa selecionada e autorizada**. O Narrador precisa selecionar a Casa
  proprietária; não existe listagem geral para o navegador. Editor não
  pode consultar.
- Somente os documentos `dossiers` e `findings` do
  `migrationSpyStage/<snapshot>` entram na leitura. **Não** devolvemos
  `operations`, `decisions`, `adminAudit`, relatórios de captura ou
  descobertas pertencentes a outro dossiê.
- O retorno é limitado a 50 dossiês por Casa, 600 achados analisados
  no servidor e 240 kB de resposta; respostas maiores falham com 503
  em vez de vazar dados parciais.
- A coleção só é lida quando o estágio privado estiver marcado como
  `complete`; o proprietário deve constar como Casa ativa.
- Valores do achado são exibidos como texto React, nunca como HTML
  arbitrário. Não há consulta a links de mídia privados.

## Bloqueios preservados

O portal usa a flag `CORMYR_FIREBASE_CLOUD_READ_ENABLED`, o snapshot
SHA-256 configurado no servidor e a conta Firebase Auth habilitada.
Estes controles permanecem desativados até a homologação da campanha.
Os dados históricos são somente leitura e nenhuma permissão, regra
ou conta Firebase foi modificada.

## Validação

Os testes Node verificam:
- visão autorizada da própria Casa;
- negação de acesso aos dados de outra Casa e ao perfil Editor;
- visualização controlada por Casa na conta Narrador;
- exclusão de auditoria GM e operações ainda não reveladas;
- erro em estágio incompleto, Casa inativa ou identificador malformado;
- limites de tamanho da resposta.

**Estado de produção:** código preparado; não equivale a ativação de
contas nem homologação Cloud real. Pendência administrativa #513.

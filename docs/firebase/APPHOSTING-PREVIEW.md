# Firebase App Hosting — preview protegido do Cormyr

## Escopo

Este backend fica conectado à branch `deploy/firebase-preview-20261113`.
Ele é um ambiente de teste independente do endereço do site atual e não
requer tokens do Lovable. O objetivo inicial é comprovar o build Node.js,
a publicação do serviço HTTPS e a integração GitHub–Firebase sem expor
os registros da campanha.

## Estado de segurança

O app atual ainda utiliza integrações do antigo Supabase e contém
configuração pública de acesso ao backend de origem. A migração para
Firebase Cloud Authentication/Firestore **ainda não foi feita**:
os registros foram preservados e testados apenas no emulador e as
986 imagens estão no Storage privado de homologação.

Por isso o App Hosting executa
`scripts/apphosting/preview-server.mjs` em vez do servidor completo
do TanStack Start. Ele exibe uma página de preparação e a rota
`/__health`. Todas as outras rotas (inclusive `/cormyr/index.html`,
chamadas de API, arquivos de mídia, dados e URLs internas) retornam 404.
O processo recusa inicialização se `CORMYR_PREVIEW_LOCKED=1` não estiver
configurado. Não há conexão com o banco, uso de credenciais, cookies de
jogadores ou carregamento de módulos da aplicação nesse processo.

A configuração existe em `apphosting.yaml` com CPU 1, 512 MiB,
mínimo 0 e máximo 1 instância. Mesmo em homologação podem surgir custos
de Cloud Build, Cloud Run e outros serviços associados.

## Build Node.js

`npm run build:apphosting` usa
`CORMYR_BUILD_TARGET=firebase NITRO_PRESET=node_server vite build`.
A configuração Vite seleciona explicitamente Nitro Node **somente**
para esse build. A construção original do Lovable/Cloudflare não muda.
O build deve produzir `.output/server/index.mjs` e
`.output/public/`; se faltar, o verificador aborta. O servidor
completo **não** é exposto pelo backend de testes.

Configuração no Firebase App Hosting:
- Projeto: `cormyr`
- Diretório raiz: `/`
- Branch ativa: `deploy/firebase-preview-20261113`
- Nome sugerido: `cormyr-preview`
- Aplicativo Web: criar um novo
- Lançamentos automáticos: desativados inicialmente

Depois que a branch de preview tiver sido validada, concluir o
assistente no console criará o backend e tentará o primeiro rollout.
A URL `*.hosted.app` só existe depois dessa etapa; não a adivinhar.
Não apontar ainda o domínio principal ou subdomínio público com
dados reais.

## Critérios para liberar a UI funcional

1. Importar Auth/Firestore para projeto de homologação com autorização por Casa
   e contas especiais validadas.
2. Eliminar dependências do banco Lovable/Supabase de produção no preview.
3. Validar regras e testes de missivas, permissões, calendário, batalha e
   espionagem no backend homologado.
4. Adicionar controle de acesso de testadores com credenciais privadas
   gerenciadas por serviço apropriado (não colocar senhas no Git).
5. Só então trocar o runCommand para o servidor Nitro Node e habilitar
   páginas do app para testes. Não liberar via flag de UI apenas.

## Validação

Workflow de GitHub Actions `Firebase App Hosting preview — Node and lockdown`:
- testa que o servidor preview bloqueia rotas privadas;
- testa fail-closed sem a flag;
- faz `npm ci` e compila o TanStack Start como Node;
- confere o arquivo de saída Nitro;
- garante o processo de homologação como entrypoint.

**Não é um deploy em produção** e não importa dados na nuvem.

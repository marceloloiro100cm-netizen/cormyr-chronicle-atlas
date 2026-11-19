# Cormyr Chronicle Atlas — status verificado da migração ao Firebase
Atualização: 12/11/2026 (horário de Brasília), após a importação de imagens.

## Evidências concluídas

- Projeto Google `cormyr` e bucket `gs://cormyr.firebasestorage.app` confirmados
  pelo proprietário no console Firebase.
- A conta `cormyr-migration` tem acesso ao Drive para o manifesto
  `campaign-images` e a pasta correspondente; permissão verificada nos
  metadados do Google Drive.
- O inventário do Drive percorreu 207 pastas, retornou 779 arquivos;
  `metadataMatching=779`, `missing=0`, `mismatched=0`.
- O importador transferiu 10 arquivos e, posteriormente, 769, com
  SHA-256 checado nos uploads; a listagem plana do bucket confirmou **779**
  objetos em `migration-staging/campaign-images/**`.
- Manifesto `complete:false` — essa contagem não é o aceite de uma
  exportação final, tampouco garante consistência temporal do Storage.
- `feat/firebase-site-cloudrun-runtime-20261112` produziu build nativo
  TanStack/Nitro sem configuração Vite Lovable, e o job de SSR local
  `Firebase site runtime (homologation only)` passou no GitHub Actions.
  **Nenhum deploy do novo site foi executado**.

## Não concluído / não presumir

1. **Aplicação**: permanece no runtime atual. Nova configuração do build
   encontra-se em PR, não em produção. A versão do Cloud Run não está implantada.
2. **Auth**: contas, senhas, associações de Casa, revogações e permissões não
   foram transferidas para Firebase Authentication.
3. **Banco**: os backups PostgreSQL privados de 11/11 e 12/11 estão disponíveis
   na biblioteca do proprietário; não são prova de reconciliação com o banco
   ativo após o último evento/missiva. Firestore não recebeu os dados.
4. **Regras**: Firestore e Storage no repositório negam todos os acessos de
   clientes intencionalmente. Essas regras não foram publicadas como políticas
   finais da aplicação.
5. **Mídias**: arquivos de jornal/equipe estão preparados em backup parcial,
   mas seu upload ao Storage não foi confirmado. A pasta de campanha pode ter
   objetos adicionais posteriores ao manifesto.
6. **Dependências legadas**: o inventário estático registra 104 arquivos
   acoplados ao Supabase, 61 tabelas candidatas e 144 RPCs SQL distintas
   (contagem histórica, não catálogo vivo).
7. **Validação geral**: há falha preexistente no passo
   `Restore fixture backup and validate temporal contracts (isolated)`
   do job `mail-database`; não desabilitar esse teste para forçar um merge.

## Ordem de migração em lotes

- **Lote A (feito em PR)**: build SSR independente, container Cloud Run e
  configuração de Firebase Hosting em homologação, com teste de resposta local.
- **Lote B (pendente)**: autenticação e políticas, comparando UID/hash de senha
  do backup com o banco vivo; matriz de narrador/jogador/editor/casa alheia.
- **Lote C (pendente)**: casas, jogadores, fichas e histórico; migradores
  idempotentes com contagens, hashes, referências e Firestore emulador.
- **Lote D (pendente)**: missivas, Hub Temporal, espionagem, jornal, batalhas
  e sincronização de Drive, sem expor dados privados.
- **Lote E (pendente)**: integração visual e funcional ponta a ponta,
  testes de permissão, plano de corte e rollback.
- **Lote F (pendente)**: homologação publicada com custo aprovado,
  reconciliação delta, troca final de domínio e cancelamento da origem.

## Critérios de proteção

Nunca publicar dumps, usuários, emails, hashes de senha, missivas ou
conteúdo do narrador no GitHub público, logs ou artefatos públicos.
Não utilizar tokens do Lovable. Não trocar DNS, desligar origem nem publicar
regras placeholder para usuários até provar a reconciliação. Tratar
Firebase Storage staging como PRIVADO, não como diretório de imagens públicas.

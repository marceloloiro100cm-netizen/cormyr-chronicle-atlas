# Espionagem, parte 1: agentes (emulador Firebase)

Primeiro de três cortes do domínio de espionagem. Só o Firestore Emulator (`demo-cormyr-migration`); nada de produção, nada de Supabase. As regras vêm das funções SQL finais em `docs/espionage/sql` (0089, 0090, 0092, 0094 a 0096, 0100, 0103). O DDL das tabelas base (`spy_assets`, `spy_operations`...) não está no repositório; os formatos seguem as funções e `src/integrations/supabase/types.ts`.

## Arquivos
- `spy-agents-core.mjs`: regras puras. `house-wealth-core.mjs`: conta de Riqueza compartilhada com o jornal.
- `stage-spy-emulator.mjs`: importa 9 tabelas (assets, history, upgrades, removals, portraits, locations, operations, segments, events) em `migrationSpyStage/<snapshot>`.
- `spy-agents-service.mjs`: serviço transacional. Testes: `spy-agents-core.test.mjs`, `stage-spy-emulator.test.mjs`, `spy-agents-service.integration.mjs` (CI com emulador). Regras deny-all no `firestore.domain.rules`. Workflow `firebase-spy-agents.yml`.

## Regras portadas
- Posto por sucessos: Verde (0-2), Treinada (3-5), Veterana (6-8), Elite (9+); Astúcia 3 a 6.
- Rede de Espiões: 3 células por posse ativa de Rede (pai ativo), 2 por Rede Ampliada; agentes capturados, mortos, perdidos ou aposentados liberam a vaga.
- Recrutar: editor da Casa ou Narrador, nome 2 a 80 sem caracteres de controle, chave de idempotência, localização do domínio da posse, data oficial do calendário.
- Criar agente = recrutar + retrato + até 2 melhorias numa única transação; repetir a chave devolve o mesmo agente, dados diferentes dão conflito.
- Melhorias (Documentos falsificados, Uma carta na manga): 1 Riqueza permanente cada, ficha ativa, versões otimistas do agente e da Casa, só agente disponível e sem missão aberta, lançamento no livro-caixa e histórico.
- Retrato: do catálogo ativo, único em toda a campanha, nunca para agente aposentado.
- Baixa: aposenta o agente, devolve só o custo das melhorias pagas (0 a 2), libera vaga e retrato, uma única vez; missões e histórico permanecem.
- Leituras: painel da Casa (agentes, operações com dias de viagem, histórico, vagas, retratos, versão da ficha) e consulta leve de vagas, só para membros.

## Dry-run no seu backup (não grava nada)
```
cd ~/cormyr-chronicle-atlas && git fetch origin && git checkout feat/firebase-spy-stage && git pull
node scripts/firebase/stage-spy-emulator.mjs --normalized ~/cormyr-chronicle-atlas/.firebase-migration/inspecao-12nov-E4pokAhB/normalized
```
Só contagens são impressas. Se `planValid` vier falso, me mande o bloco `issues`.

## Próximos cortes
2) missões, viagem, linha do tempo, resolução e contrainteligência; 3) dossiês de inteligência, auditoria e painel do Narrador. `renomear agente` (0086) é só de revisão e o app não usa; fica fora.

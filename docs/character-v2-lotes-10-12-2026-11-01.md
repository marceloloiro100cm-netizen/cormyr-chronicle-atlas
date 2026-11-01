# Cormyr Chronicle Atlas — Ficha de Personagem V2 · Lotes 10–12
**Situação:** código preparado; a publicação da nova ficha para jogadores está BLOQUEADA até aceite e migração real validada.

## Lote 10: equipamento, rolagem e PDF
- `equipment-report.ts`: catálogo de armadura, escudo, arma e item somente após homologação individual do Narrador. Sem ficha de equipamento verificada, o item fica pendente e não cria bônus.
- Impede múltiplas armaduras/escudos simultâneos e quantidades ambíguas. Retorna um snapshot verificável com VA, penalidade, defesa, Volume e dano por fórmula; não inventa preços nem armas inexistentes.
- `rolls.ts`: separa D e B, valida graduação, especialidade, quantidade de dados, rerrolagens válidas/obrigatórias, penalidades, dificuldade e origens; modelo determinístico, não um gerador seguro de dados no servidor. Rolagens fornecidas por cliente não têm valor autoritativo.
- `pdf.ts`: PDF obtido do mesmo report model que a prévia de cálculo, sem conteúdo original, dados da Corte privada ou histórico de XP. O modelo discrimina cada fonte e as pendências.
- Ferimentos, lesões, condições, armas avançadas e talentos que exigem ações específicas permanecem sem efeito mecânico até catalogação integral de regra, duração e cenário. O lote 10 NÃO valida todas as armas do capítulo 9.

## Lote 11: vínculo canônico, segurança e persistência de rascunhos
- `migration.functions.ts`: leitura única por registro e Casa, `requireSupabaseAuth`, verificação de Narrador ativo antes e depois da consulta, RLS do registro e vínculos de fontes.
- `drizzle/migrations/0070_character_v2_assisted_drafts.sql`: **migration preparada, não executada**. Acrescenta rascunhos privados e diário imutável de operações. Apenas Narrador ativo lê; RLS revoga SELECT de jogadores; writes acontecem por RPC `stage_character_v2_draft` / `review_character_v2_draft` depois de vincular explicitamente pessoa canônica e origem.
- Critérios: ID da fonte + versão + MD5 do conteúdo no momento da operação, Casa consistente, personagem revisado, vínculo em `character_source_links`, lock transacional, ID de operação e justificativa. A fonte original de `campaign_records` **nunca é editada** por essas RPCs.
- A migration depende da existência e aplicação de 0062/0063 e das funções de acesso; **NÃO executá-la sem inventário das migrations em produção e backup testado**.
- A edição de V2 e XP/Destino por jogadores **não foi habilitada**. RPC de compra com saldo canônico e controle de autorização na gravação exige homologação funcional e testes de conflito em banco isolado; não confiar no motor de cliente.

## Lote 12: prévia, divergências, rollback e aceitação
- `migration-review.ts`: comparação original × números V2, verificações de ID/casa/vínculo, qualidade de revisão, campos ainda textuais, XP/Destino não conciliados. Nunca vincular por similaridade de nomes.
- `narrator-review.tsx`: painel expandível na aba Ficha **só quando `admin`**, com leitura autenticada exclusivamente de fichas do tipo personagem e botão de PDF de prévia; **sem botões de publicar ou migrar**.
- A flag `CHARACTER_V2_PLAYER_UI_ENABLED` permanece `false` e `CHARACTER_V2_RELEASE_GATE` permanece `false`, com método explícito que rejeita ativação.
- O script SQL permite rejeitar/registrar rollback do rascunho sem tocar no legado. Um rollback real de escrita futura requer backup e reprocessamento controlado das transações.
- Aceite de Aldaeric: 4 Astúcia + 3 Percepção + 4 Status → Defesa de Intriga 11; 3 Vontade → Compostura 9. A conciliação de Movimento 4m+1m e "Corrida 0" deve ser manual.
- Testes necessários para publicar: RLS cross-house (jogador, narrador, representação revogada), concorrência, migrações aplicadas/restauradas em staging, backup reexecutável, importações com anexos e versões, checks de Rápido/Manco/Defeito/armas, PDF e report, perfis reais e aprovação do Narrador.

## Critérios de saída e pendências de produção
1. CI com testes de unidades, TypeScript e build — necessário para integrar código.
2. Inventário live do Supabase (migrations, RLS e dados) e backup restaurado em ambiente isolado — **pendente**.
3. Aplicação de migration 0070, ensaio de funções em staging e auditoria contra acesso indevido — **pendente**.
4. Conferência editorial de regras de armamento, ferimentos, benefícios e defeitos ainda narrativos — **pendente**.
5. Migração e aceite explícito de Aldaeric e amostra de outras Casas, com controle de alterações posteriores — **pendente**.
6. RPC servidor para compras reais de XP/Destino e tratamentos de concorrência — **pendente**.
7. Somente após esses itens, planejar ativação gradual de V2 com rollback e monitoramento.

Este documento diferencia *código integrado* de *migração executada* e *funcionalidade liberada*. Nenhum registro V1 deve ser apagado, renomeado, convertido ou sobrescrito automaticamente.

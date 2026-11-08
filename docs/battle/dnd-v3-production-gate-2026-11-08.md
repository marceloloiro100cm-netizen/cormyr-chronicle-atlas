# Cormyr · D&D V3 — Gate de produção (8 nov 2026)

## Escopo da candidata
- PR #334: 300 revisões no banco privado, 58 perfis com voo, 300 modificadores de DES; 370/373 ataques com tipo de dano identificado na fonte original.
- PR #335: implantação e deslocamento de unidades voadoras sobre barreiras na abstração 2D e tiro à distância sem limite máximo no tabuleiro, com linha de visão multicélula.
- Independência de GOT, Adaptado, calendário, recursos, contas, senhas, e-mails e fichas de Casas.

## Pré-verificações observadas
- PR #334: Validate sucesso.
- PR #335: Validate e battle-browser synthetic sucesso.
- Banco de produção: 300 criaturas de origem; 300 revisões correspondentes; 0 chaves órfãs; 58 `fly_ft`; 300 `dex_mod`; RLS ativa em `battle_dnd_verified_sources`.
- Permissão de leitura das tabelas `battle_dnd_cormyr_monsters` e `battle_dnd_verified_sources`: `is_campaign_admin() AND campaign_access_active()`. Fichas e ajustes próprios exigem Narrador e UID do autor.

## Gate combinado de CI
Validar esta branch criada a partir de `main` **após** os PRs #334 e #335:
- Testes automatizados de unidades/componentes, TypeScript, build de produção.
- Testes sintéticos de navegador de batalha e regressão.
- Testes isolados de banco, RLS e restauração.

## Testes manuais após publicação
1. Abrir a interface publicada como Narrador autenticado e iniciar uma batalha D&D de treino sem alterar casas oficiais.
2. Confirmar o carregamento das 300 criaturas e filtros por nome, grupo, tipo, ND e fonte.
3. Verificar PV, CA, iniciativa DES, dano básico e personalizações.
4. Posicionar criatura voadora sobre barreira; impedir a mesma célula para unidade terrestre.
5. Atacar à distância de longe com LOS livre; bloquear por muralha; verificar L/H/G e replay.
6. Como jogador e anônimo, confirmar a impossibilidade de consultar o bestiário privado ou editar fichas.
7. Confirmar que GOT/Adaptado, missivas, calendário e contas continuam funcionais.

**Este arquivo é evidência da revisão e não prova aceitação com sessões reais. Não marca produção como validada antes do deploy e smoke test.**

# V4 — Integração isolada para produção (06/11/2026)

Origem: PR #299 (interface CRZ V4) e PR #301 (interface V3/PTE V4), validados em CI antes da integração. Release **baseada na main** em commit `309672371e2af1f95a5b9dd4d491be59f293528b`, preservando os commits contemporâneos de música e espionagem.

## Alterações
- CRZ e V3: arena única; General à esquerda e espaço vazio para retrato; ordem no topo (hover/foco destaca posição da pilha); mapa hexagonal no centro; ações recentes no canto direito.
- Movimento e ataques por clique contextual, sempre sujeitos a `crzLegalCommands` / `getLegalActions` e seus respectivos redutores. Comandos de espera, defesa, habilidade e poder de General preservados.
- Paleta escura medieval de Cormyr, facções azul/vermelho, fontes com contraste reforçado, mapa com zoom e layout responsivo. Replays e relatórios do CRZ continuam acessíveis em abas.
- Testes de interface de componentes, navegação Chromium desktop/mobile com exércitos fictícios, snapshots isolados do banco.

## Limites
Esta publicação **não altera fichas oficiais, senhas, emails, sessões, Supabase, calendário ou unidades reais**. A V4 é uma mudança de interface dos simuladores; não converte a batalha em resultado oficial. Os recursos do Narrador e do jogador mantêm a separação de acesso preexistente. Nenhum retrato proprietário foi incluído: o placeholder pode ser preenchido com imagens originais posteriormente.

## Gate de liberação e rollback
Somente publicar depois da conclusão de Vitest, TypeScript, build e testes de bancos descartáveis no commit de release sobre `main` contemporânea e da verificação de fluxo fictício de navegação desktop/celular. Registrar o SHA da `main` que entrou no Lovable. Para rollback, reverter o commit de release ou desativar a visualização afetada em um build subsequente, preservando os commits das outras áreas. Smoke sintético não comprova autenticação de usuário real nem o estado final de propagação do deploy.

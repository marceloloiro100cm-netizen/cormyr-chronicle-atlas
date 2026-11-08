# Cormyr — Auditoria ponta a ponta e implantação D&D simplificado

**Data de referência:** 7 de novembro de 2026. **Escopo:** modo D&D do módulo de batalha, independente dos motores Game of Thrones e Adaptado. Este documento descreve código e controles de entrega; não equivale a teste autenticado em produção.

## 1. Fonte e carga do bestiário

- Seleção privada de 300 criaturas: 27 dragões, 16 goblinoides, 126 humanoides, 61 constructos, 70 mortos-vivos.
- Os dados mantêm nome, fonte, ND, tamanho, PV, CA, deslocamento terrestre e ataques básicos. **Sem poderes, magia, multiataques, salvaguardas ou ações lendárias**.
- Importador local válido na `main` desde o PR #329; alternativa privada automática por Supabase está no PR #330 (branch de integração) com SELECT RLS restrito ao Narrador autenticado e ativo.
- Nenhuma linha do bestiário privado ou arquivo do usuário vai para o GitHub público. O esquema SQL e os adaptadores podem ser versionados sem os dados.

## 2. Correção imediata dos atributos incompletos

**Movimento:** a seleção registra 16 criaturas com `speed_ft=0`, embora representem criaturas voadoras. Para não declará-las imóveis, a conversão de uso em batalha passa a atribuir **voo tático provisório de 30 pés**; deslocamento terrestre original continua 0 e o sistema identifica e avisa sobre o ajuste. O valor é **parâmetro substituto**, não estatística oficial, e não altera a tabela privada nem o arquivo original. A arena ainda é bidimensional e usa as regras de travessia da malha, não simula altitude/obstáculos aéreos.

**Ataque:** a seleção tem 39 ataques remotos sem alcance; em 36 fichas esse é o único ataque. O modo D&D **não mais converte o ataque remoto incompleto em ataque corpo a corpo com bônus/dano do disparo**. Se houver corpo a corpo definido, ele é mantido. Se não houver, o motor inclui um **ataque básico provisório** explícito, `+0` para acertar e `1d4` de concussão, alcance de contato de 5 pés. O disparo sem alcance fica indisponível e recebe aviso de revisão. O ataque provisório não se confunde com um poder original da criatura.

**Limites:** nenhuma velocidade, alcance, dano de magia ou habilidade oficial é inferida/afirmada como exata. Para equivalência futura, rever dados com fontes autorizadas e permitir edição explícita pelo Narrador.

## 3. Capacidades atuais, verificadas no código

| Subsistema | Cobertura atual | Lacuna / condição de aceite |
| --- | --- | --- |
| Seleção de regras | Três motores isolados: GOT / Adaptado / D&D | Não chamar D&D simplificado de D&D 5e integral |
| Biblioteca | 300 entradas, validação Zod, filtros por nome/grupo/tipo/tamanho/fonte/ND, paginação | Testar carregamento privado autenticado, usuário jogador e anonimato |
| Formação | Atacante/defensor, 1–7 pilhas por lado, contagem 1–1.000 sujeita ao tamanho | Revisar as regras de escala e casos de massa |
| Unidades militares | 16 perfis terrestres das 17 categorias; navios indisponíveis | Sistema naval independente para a 17ª categoria |
| Ficha | PV, CA, ataque, iniciativa, movimento, número de sobreviventes | Fichas simplificadas sem resistência, condições, ações especiais |
| Dados | Ataques d20 com falha em 1 e crítico em 20, dano por dado e baixas | Balancear e homologar combate por encontro |
| Mapa | Malha quadrada, movimento, ocupação, linha de visão, zoom, tela ampliada | Quadrado CRZ = 10 pés; não representa 5 pés/altitude do D&D convencional |
| Iniciativa | d20 + Destreza (zero nas fichas sem DES) + treinamento, por encontro | Importar modificador de DES quando houver fonte autorizada |
| Ações | Somente mover, ataque simples, defender, esperar, encerrar no novo D&D básico | Habilidades/magias/aoe/salvaguardas reservadas para lote futuro |
| Integridade | Replays locais com hash, relatório pós-batalha | Salvar/retomar D&D no servidor privado e sessões multiusuário pendentes |
| Isolamento | Simulação não altera HouseState, tropas oficiais, economia, calendário ou missivas | Testar ponta a ponta que nenhum efeito oficial é emitido |
| Publicação | Código em PR e CI automatizado | Não declarar publicado sem merge, deploy e aceite autenticado |

## 4. Gates obrigatórios para promoção

1. Executar testes do motor D&D, biblioteca 300, interface, replay, mapa, TypeScript, `bun run build`, testes do banco e navegador sintético **no SHA final da branch**.
2. Na homologação, entrar como Narrador ativo e confirmar carga automática das 300; em sessão de jogador e anônima, confirmar RLS negando leitura.
3. Conferir contagem e filtros por fonte, ND fracionário, categorias e busca; inserir monstros de ambos os lados e editar quantidade sem ultrapassar limites.
4. Jogar combate manual e IA; verificar deslocamento de um dos 16 que chegaram com 0; verificar ataque `+0/1d4` para um dos 36 sem ataque corpo a corpo e alcance remoto; confirmar que nenhum raio sem alcance usa dano/bônus antigos.
5. Conferir iniciativa, crítico, dano, morte removendo token do mapa, exportar/importar replay e relatório; assegurar invariância dos motores GOT/Adaptado.
6. Fazer revisão visual em desktop e mobile, inclusive tela ampliada; validar build Lovable e rollback sem alteração de senhas, emails, casas ou Hub Temporal.

## 5. Pendências antes de “funcionamento total” ampliado

**P0:** checar build/CI do PR de integração, RLS real, importação no Narrador, ataque e movimento, replay e regressões.

**P1:** substituir parâmetros provisórios por velocidades/alcances autenticados no catálogo privado; campo de edição administrativa de ficha simplificada; ajustar voo real, escala de quadrado e regras opcionais sem quebrar hashes/replays legados; retomar partida D&D no servidor e teste autenticado.

**P2:** regras de magias, atributos DES, sentidos, resistência/imunidades, condições, reações, ataques múltiplos, efeitos em área, combate aéreo/naval, integração autorizada com ficha de personagem/jogador e turnos multiusuário.

**Decisão de escopo:** nesta entrega o pedido é **movimento corrigido e um ataque básico simples**. Não tentar implementar ações especiais de todos os monstros agora; manter dados privados e mudanças isoladas de D&D.

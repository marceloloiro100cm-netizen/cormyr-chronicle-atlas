# P1 — Usabilidade, inspeção e continuidade 2D/3D
**Cormyr Chronicle Atlas · 10/11/2026**

## Escopo aplicado ao código
- **Inspeção segura de terreno:** selecionar um quadrado no 3D mostra coordenadas, categoria visual, anotações de estrada/ponte e a unidade que já está exposta à visão atual. Não calcula custos, cobertura, visibilidade, voo ou bloqueios; essas decisões continuam nos motores GOT, Adaptado e D&D.
- **Continuidade de seleção:** a visão 3D continua recebendo o ID da unidade selecionada, o ator ativo e o callback original. Alternar 2D/3D não cria sessão, jogada ou salvamento; não troca o contexto do motor.
- **Revogação de acesso:** se Narrador/sessão perder permissão ao 3D, o seletor interno volta ao 2D, impedindo reabertura automática em sessão posterior.
- **Semântica dos destaques:** selecionado e casas de movimento em verde, unidade ativa em dourado e alvo de ataque em vermelho. Destaques continuam apenas projeções visuais de dados autorizados.
- **Celular:** controles de câmera em faixa rolável com alvos de toque de 44 px; leitura de terreno fora do canvas; altura do mapa ajustável em retrato/paisagem. Nenhum gesto do canvas vira comando sem a confirmação P0 existente.

## Segurança / compatibilidade
- 2D permanece padrão. 3D é experimental, somente para Narrador.
- Sem alterações em saldo de unidades, regras, cálculo métrico (3 m no D&D, 10 m no GOT), motor, fichas, campanhas, replays, calendário, dados ou Supabase.
- Inspetor usa estritamente o mapa e os tokens já entregues ao renderer. Não busca informação do banco nem revela dados privados.
- Onde um adaptador só entrega o aspecto visual da célula (como `road` ou `bridge` no GOT), o inspetor descreve **a representação recebida**, e não uma condição tática ou custo inferido.

## Testes adicionados
- `terrain-inspection.test.ts`: coordenadas, múltiplas células, ponte/estrada e célula inválida.
- `miniatures-p0.test.tsx`: inspeção não executa movimento, ataque ou altera confirmação pendente.
- `miniatures-p1-toggle.test.tsx`: preservação do ID selecionado e retorno ao 2D após revogação da permissão.
- Mantidos os testes P0 de câmera, WebGL, entrada e confirmação de movimentos/ataques, além de testes dos lotes anteriores.

## Homologação ainda necessária
- [ ] TypeScript, suíte unitária, build e E2E Chromium aprovados em CI para o SHA final.
- [ ] Narrador autenticado comparar seleção, objetivo, movimento e ataques 2D/3D nos 3 modos.
- [ ] Dispositivo Android real: toque, arrasto, pinça, zoom e rolagem de barra sem ataque ou movimento acidental.
- [ ] Conferir terreno (inclusive estrada/ponte), unidades multi-quadrado, derrota e mudança de turno.
- [ ] Validar layout 320–390 px e paisagem; revisar contraste e legibilidade no dispositivo.
- [ ] Autorizar separadamente merge e publicação. Sem liberar 3D a jogadores antes da homologação.

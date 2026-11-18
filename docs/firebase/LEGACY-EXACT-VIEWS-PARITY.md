# Cormyr — restauração EXATA das interfaces originais no Firebase

**Escopo aprovado pelo proprietário:** reconstruir as telas de Narrador, Editor-chefe e Jogadores **sem mudar posição, conteúdo, filtro, nome, fluxo ou efeito de qualquer função**. Não é autorização para lançar uma versão simplificada, trocar botões por placeholders ou voltar a usar Supabase/Lovable/Vercel.

## Fonte de verdade da interface

Os componentes anteriores permanecem íntegros no repositório. **Usar esses próprios componentes, JSX, estados, filtros e estilos**, migrando apenas as dependências de consulta/gravação para APIs Firebase-only com Firebase Auth e autorização validada no servidor.

O teste \`scripts/firebase/legacy-view-parity-lock.test.mjs\` fixa os Git blob SHA dos arquivos históricos. Não reescrever o layout "semelhante" a eles; importar os componentes originais após portar serviços e contratos. Mudanças deliberadas nesses arquivos precisam ser isoladas e aprovadas como equivalentes, com testes de captura visual e comportamento.

### Narrador — visual e comportamentos que devem permanecer idênticos

Fontes: \`src/routes/_authenticated/jogadores.tsx\`, \`src/components/players/narrator-missives-hub.tsx\`, \`src/components/players/admin-panel.tsx\`, \`src/components/calendar/narrator-calendar.tsx\`, \`src/components/players/missivas-tab.tsx\`.

Menu original, nesta ordem:

1. **Conselho das casas**
2. **Missivas**
3. **Jornal**
4. **Hub Temporal**
5. **Dossiês de Espionagem**
6. **Módulo de batalha**
7. **Eventos**
8. **Aventuras**

O Conselho inclui seleção de Casa, dados, fichas, administração de jogadores/contas, acervo; as outras seções mostram os componentes específicos do Narrador, não atalhos genéricos. Conservar filtro por regiões e Casas (Grupo 1 · Dragon Coast, Grupo 2 · Horselands), visão global de mensagens, filtros deslocados para a coluna prevista, dados do HUB por désdia e semanas de missivas, recebidos/medição, históricos, operações de espionagem e batalha. Uma simulação ou preview não é equivalente a salvar com versão e trilha de auditoria.

### Missivas — mesmo filtro, sem eliminar nem renomear campos

Fonte: \`src/components/players/missivas-tab.tsx\`; preservar:

- **Buscar** (assunto, resposta, autor ou Casa), **Caixa** (Todas, Recebidas, Enviadas, Cópias para mediação quando Narrador, Programadas, Rascunhos, Histórico por semana, Lixeira).
- **Grupo de narração**, **Casa destinatária / legado**, **Casa remetente**, **Membro da corte**, **Unidade militar**, **Semana**, **Tipo**, **Resposta**, **Minha leitura**.
- Recolher/Expandir filtros; limpar; expandir/recolher todas; navegação por semana, páginas e indicadores.
- Escrever, editar, responder, programar, entregar, fechar/abrir a rodada, contar leituras, consultar versões, restaurar/excluir missivas e respostas, encaminhar, copiar para mediação e impor o mesmo isolamento entre Casas.

As consultas SQL anteriores \`mail_page\`, \`mail_trash_page\`, \`reply_delivery_week\` e \`set_letter_round\` **não podem** ser ligadas ao Supabase em produção. É necessário reproduzir no Firestore os mesmos contratos, inclusive filtros e totais, sem buscar apenas as 30 mensagens da tela Firebase simplificada. Permissões: Narrador lê/mede conforme o original; Jogador só vê correspondência autorizada; Editor não recebe envio nem acesso indevido.

### Editor-chefe — usar a Redação original, não o editor simplificado

Fontes: \`src/components/newspaper/NewspaperEditorialDesk.tsx\`, \`NewspaperHub.tsx\`, \`NewspaperCanvas.tsx\`, \`newspaper-editorial.css\`.

Interface própria, independente, com artes \`/newspaper/cab_*.webp\`, brasão e emblema. Menu original, nesta ordem:

1. Painel do Jornal
2. Escrever o Jornal
3. Matérias
4. Calendário
5. Redação
6. Anúncios
7. Arquivo
8. Leitura e Alcance
9. Configurações

Preservar fluxo de criar/editar/publicar/cancelar/arquivar, histórico, revisões e restauração, prévia, modelos de matéria, equipe, gravuras, upload de PDF/imagens, encomendas das Casas, edição direta em blocos (arrastar, redimensionar, mover, fixar, colunas, capitular, recorte, tipografia própria), atalhos de teclado, desfazer/refazer, texto com recuo, identidade editorial, data de publicação do HUB e contagem de leituras. O editor de blocos Firebase atual é incompleto e não é substituto aceitável.

**Primeira implementação na branch:** \`cloud-editorial-content.mjs\` passou a validar e reter metadados não perigosos da diagramação antiga, sem permitir caminhos de imagem arbitrários, mídias externas, referências a pedidos não autorizados ou agendamento de publicação sem serviço real. Isso **não** finaliza o serviço editorial.

### Jogadores — mesmo painel e mesmas funções

Fonte: \`src/routes/_authenticated/jogadores.tsx\`; conservar:

1. Casa
2. Ficha
3. Galeria
4. Calendário
5. Documentos
6. Missivas
7. Jornal
8. Batalha (somente onde o recurso estiver habilitado)

Manter identidade heráldica por Casa, telas de ficha/corte/NPC, recursos, domínios, construção, galeria, documentos, missivas completas, jornal e batalhas. Editar somente a própria Casa e respeitar o acesso da temporada; Narrador tem representação administrativa equivalente apenas se a segurança for migrada corretamente.

## Gate de equivalência obrigatório

| Prova | Condição para liberar |
|---|---|
| UI | Screenshot pixel-a-pixel ou comparação visual supervisionada das três áreas, desktop e mobile, usando o código original como padrão |
| Controles | Todos os menus, campos, filtros e estados originais renderizados sem redução |
| Serviços | Toda ação conectada a Auth/Firestore/Storage, com resposta e persistência verdadeiras; nada de no-op/placeholder |
| Semântica | Mesmas regras de semana/rodada, publicação, leitura, rascunhos, edição, cancelamento, lixeira e histórico |
| Segurança | Narrador, Editor-chefe, Jogador A, Jogador B e anônimo testados contra o Cloud em contas distintas |
| Integridade | Revisão do snapshot de origem, delta, migração dos anexos e sequência temporal confirmadas |
| Publicação | Build, Validate, E2E e confirmação da SHA servida pelo Firebase App Hosting |

**Enquanto qualquer item estiver pendente, manter este PR como rascunho. Não alterar a produção para simular paridade. Não habilitar rotas Supabase legadas e não modificar Firestore para esconder lacunas de interface.**

## Sequência de migração sem alterar o frontend original

1. Preservar código/arte/estilos/controles antigos e comparar antes/depois.
2. Criar adaptadores privados Firebase de **leitura e escrita** com contratos completos, começando por missivas e redação e depois administração/fichas, com testes isolados e de autorização.
3. Substituir somente as dependências dos componentes originais por interfaces equivalentes Firebase; **não reescrever seus JSX, filtros nem eventos**.
4. Fazer E2E real entre perfis, comprovando persistência e recusas entre Casas.
5. Publicar somente quando tudo estiver validado, migrado e aprovado. Este documento não representa autorização de GO.

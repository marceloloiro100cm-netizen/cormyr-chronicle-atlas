# Implantação gradual da Ficha de Personagem V2 — 01/11/2026

## Entrega desta implantação

A nova interface de bolinhas está conectada à aba **Ficha do Personagem** para registros já acessíveis ao usuário, usando o mesmo escopo de leitura de Casa e de registro do site. A versão antiga continua íntegra, consultável em seção expansível, e com o fluxo de edição V1 preexistente.

A visualização V2 é **somente consulta**. Mostra habilidades importadas, nomes de especialidades legadas, indicadores derivados básicos e pendências. Nenhuma habilidade ausente se converte silenciosamente em grau 2 adquirido. Movimento e Corrida permanecem **A conferir** enquanto equipamento, Volume e especialidades não forem homologados. Qualidades e defeitos em texto não são transformados em efeitos ativos por reconhecimento textual.

## Situação real de dados (consulta anterior no ambiente do Lovable)

- 19 registros `kind='character'` e 6 fichas legadas reconhecíveis, com 18 habilidades visíveis no padrão de importação.
- O campo Lidar com Animais não aparece nos 18 nomes tabulados; não presumir sua graduação.
- Personagens canônicos e vínculos permaneciam em zero; isso impede a migração para uma ficha V2 **editável e autoritativa**.
- A implantação não executa SQL, não vincula identidades por nome, não modifica XP/Destino, não altera regras militares.
- Fichas não encontradas (Everlost, Harcourt) devem aparecer como não disponíveis no padrão já existente, sem criar personagens fictícios.

## Como funciona a experiência

1. Jogador abre a própria Casa em Jogadores → Ficha do Personagem.
2. Se o registro existente é uma ficha V1 ou planilha GOT reconhecível, a nova apresentação aparece em bolinhas.
3. Indicadores de base aparecem apenas quando todas as habilidades necessárias foram reconhecidas; outros indicadores são sinalizados como pendentes. Fórmulas não equivalem a números oficiais sem equipamento e qualidades homologadas.
4. Abaixo, a versão original fica disponível em **Consultar documento original**. A edição da versão anterior mantém as regras e permissões já existentes.
5. Narrador continua com ferramenta exclusiva de conciliação canônica, comparação Original × V2 e exportação da prévia.

## Portas ainda não liberadas

- Substituir os registros originais com estado V2 oficial, criar ou sincronizar personagens canônicos, comprar pontos, XP e Destino, usar bônus em combate com autoridade de servidor, migrar SQL 0070 e ativar UI de edição V2.
- `CHARACTER_V2_PLAYER_UI_ENABLED=false` e `CHARACTER_V2_RELEASE_GATE=false` permanecem sem alteração; apenas **a visualização derivada de leitura** foi integrada.
- Próxima etapa para tornar a V2 editável: revisão do Narrador e vínculo canônico individual, staging de migrations/RLS com backup restaurado, RPC atômica de compras com autorização, teste de rollback e aceite.

## Critérios de publicação

- Testes de renderização, acessibilidade, 18 de 19 habilidades importadas, Astúcia 4, Defesa de Intriga base 11 e Compostura base 9 no exemplo Aldaeric.
- Regressão total do repositório, verificação TypeScript, compilação de produção.
- Integração à main seguida de sincronização do Lovable e deploy explícito. O status do deploy deve ser verificado, não pressuposto.

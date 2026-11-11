# Acesso especial "Espião" (fora da segunda temporada)

O perfil de jogador **Leonardo** utiliza a casa de acesso `espiao` / **Espião**. No seletor público de **Casa ou Narrador**, o nome exibido é **Leonardo**; a casa não deve constar no elenco das casas nobres oficiais.

## Publicação

1. Revisar e integrar a alteração no GitHub sem usar créditos/tokens do Lovable.
2. **Aplicar no Supabase do ambiente correto** a migração `drizzle/migrations/0110_special_spy_identity.sql`. A presença do SQL no GitHub **não** altera o banco.
3. Confirmar o deploy do frontend e a disponibilidade de `/house-flags/espiao.svg`.
4. Autenticado como **Narrador**, abrir `/jogadores` > **Administração** > **Cadastrar conta e jogador** e preencher nome, e-mail e senha inicial **somente no formulário seguro**. Selecionar `Espião (acesso especial, fora da temporada)`, manter a conta ativa e **Exigir alteração da senha no próximo acesso**. A senha nunca deve constar do GitHub, logs ou documentos.
5. Confirmar no Supabase uma linha ativa em `campaign_players`, o vínculo `house_memberships` ao ID `espiao`, a casa privada `campaign_houses` com `season=0`, `house_catalog.public_reviewed=false`, e o usuário autenticável. Nenhum papel de Narrador deve ser criado.
6. Testar com sessão limpa: **Casa ou Narrador → Leonardo**, credenciais individuais, troca obrigatória da senha inicial, acesso à própria casa, bandeira e missivas autorizadas. Verificar que outra conta não consegue consultar a casa especial e que as oito casas públicas permanecem inalteradas.

## Segurança

A seleção do login é uma preferência visual; **RLS e associação por usuário** continuam determinando o acesso real. O vínculo de `espiao` não concede leitura do Narrador nem documentos de outras casas. A bandeira hospedada é uma versão de interface da imagem fornecida; a senha e o e-mail do jogador não são versionados.

Se a função administrativa indicar erro após criar o usuário no provedor, verificar o cadastro existente antes de tentar novamente para evitar permissões pendentes ou duplicação.

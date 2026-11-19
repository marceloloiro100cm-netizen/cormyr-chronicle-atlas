# Conexão das telas originais — trabalho em revisão

Base: d97a11918643f9c5ce8f7ec8d091d20e1eb031e5. A importação privada foi concluída no run 44504476744: 42 tabelas, 1.725 registros. Há 2 edições de jornal; as 355 revisões são histórico, não edições adicionais.

Esta alteração prepara a troca da demonstração local por consultas autenticadas ao acervo Firebase nas telas originais. Não deve ser mesclada como conclusão da migração operacional.

Implementado:

- Verificação de identidade e vínculos atuais no servidor antes e depois da consulta.
- Conexão dos filtros de missivas ao contrato já existente, sem concessão de permissões pelos vínculos históricos.
- Leitura das fichas, unidades, construções, registros e livro-caixa importados sob escopo da Casa.
- Separação de edições e revisões do jornal; rascunhos apenas para narrador/editor.
- Adaptador de leitura de espionagem usando regras puras existentes, sem ativar serviços de emulador em produção.
- Rejeição explícita de operações ainda não implementadas; nenhuma gravação simulada.
- Proteção contra troca de conta durante renovação do token, consulta e decodificação da resposta.

Pendências para mesclar e liberar:

1. Conciliar documentos operacionais criados após a importação, inclusive respostas e revisões, sem duplicar o acervo ou substituir versões atuais.
2. Conectar gravações transacionais de missivas, fichas, espionagem, calendário e redação às ações originais; preservar idempotência, versões e auditoria.
3. Conectar anexos privados e uploads ao Firebase Storage, com autorização derivada do registro pai.
4. Completar RPCs de calendário, rotas regionais e demais ações ainda explicitamente indisponíveis.
5. Executar validação autenticada das três visões com dados reais e conferir o resultado da auditoria protegida de relações.

Os componentes originais permanecem intactos; o teste de paridade verifica seus hashes. Os testes locais não substituem a homologação autenticada nem comprovam publicação no App Hosting.

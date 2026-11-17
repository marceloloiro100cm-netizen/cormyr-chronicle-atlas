# Arquivos de história e brasões — integridade offline (17/11/2026)

A comparação com o snapshot privado mostrou 10 Casas ativas com correspondências únicas no catálogo público, mas a referência a um arquivo não prova que ele exista, seja legível ou esteja editorialmente aprovada.

Esta implementação lê somente `public/cormyr/data.js`, `public/cormyr/histories/*.json` e `public/cormyr/assets/*` **no checkout do GitHub**, sem consultar Auth, Firestore, Supabase ou arquivos privados. Ela verifica os arquivos de história como JSON com a propriedade `text` não vazia, confirma que os brasões estão presentes e informa somente contagens agregadas. Caminhos com travessia de diretórios ou symlinks são recusados. Nenhuma história, caminho de arquivo, segredo, nome de Casa ou identificação privada aparece nos logs.

O catálogo da revisão atual possui 172 Casas em 11 regiões, com 170 referências a arquivos de história e 172 referências a brasões. Duas Casas não possuem referência de história no índice. O auditor distingue referência ausente de arquivo ausente ou inválido; os totais efetivos são apresentados nos resultados da execução offline.

**Validade de arquivo não é revisão de conteúdo.** O estágio `migrationPublicContentStage` permanece pendente, a rodada atual não é inferida e não há escrita nem habilitação de gameplay. A decisão de liberar jogadores permanece `NO_GO`.

# Exportação de mídia para migração

No site atual, autentique-se como narrador e abra a administração da temporada
na área dos jogadores. Expanda **Backup de imagens e jornais** e clique em
**Exportar todos os arquivos**. Use Chrome ou Edge no computador, em HTTPS,
e selecione uma pasta vazia. Autorize a gravação nessa pasta e mantenha a aba aberta.

A ferramenta percorre campaign-images, campaign-newspapers,
campaign-newspaper-staff, campaign-newspaper-commissions e
campaign-newspaper-engravings, incluindo subpastas e páginas adicionais.
Não exporta o banco PostgreSQL, usuários/senhas ou buckets de dumps.
O backup do banco deve ser obtido separadamente.

Para pausar e retomar, escolha a mesma pasta. Cada bucket recebe um manifesto
com caminhos, IDs, datas, tamanhos e SHA-256 dos bytes baixados. A retomada
confere o hash local; arquivos corrompidos são baixados novamente.
O SHA-256 verifica a cópia gravada, não é uma assinatura do provedor.
O inventário é repetido no final para detectar alterações durante a cópia;
não substitui um snapshot transacional. Evite alterações na origem.
Somente manifestos com complete=true representam buckets concluídos.
Arquivos locais antigos não são apagados: na importação, usar exclusivamente
os caminhos do manifesto concluído. Compacte toda a pasta de destino,
incluindo os manifestos, antes de enviar o backup.

A autorização de narrador é consultada no banco em toda chamada, com JWT
validado pelo middleware existente. O cliente privilegiado só é carregado
depois dessa consulta. Nenhuma chave administrativa é enviada ao navegador.
URLs de download duram 60 segundos; respostas RPC são private/no-store.
Não há alteração de políticas nem gravação na origem.

Limites: requer File System Access (Chrome/Edge desktop); arquivos individuais
acima de 128 MiB e nomes incompatíveis com sistemas de arquivos comuns
interrompem a execução explicitamente. Não declara sucesso parcial.

Validação local:

```
npx vitest run src/test/storage-export.test.ts src/test/storage-export-auth.test.ts
npx tsc --noEmit
npm run build
```

Após publicar, ainda é necessário validar com uma sessão real de narrador:
exportar uma pasta, interromper, retomar e comparar os manifestos com
storage.objects do backup final. A execução local com mocks não comprova
acesso ao armazenamento de produção nem conclusão da migração Firebase.

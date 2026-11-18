# Firebase Storage — auditoria automática de homologação (18/11/2026)

A auditoria de staging usa a identidade **somente leitura**
`cormyr-gh-reader@cormyr.iam.gserviceaccount.com` e a rotina
`scripts/firebase/verify-storage-homologation.mjs --staging-only-readonly`.

- Busca somente os metadados `name`, `size` e `crc32c` (além de MD5,
  quando houver), no prefixo isolado de homologação.
- Compara os **objetos reais** listados pela API JSON com as entradas de
  `gcloud storage ls --recursive`, descartando pseudopastas e detectando
  objetos extras, ausentes ou duplicados. Não publica nomes nem caminhos.
- O valor histórico de **986 entradas do CLI** incluía diretórios virtuais:
  ele permanece como referência informativa, **não como critério de
  integridade**. A igualdade das duas listagens de objetos é obrigatória.
- Testes de contrato rodam em PR; em pushes relevantes na `main`, o job
  de leitura GCS é acionado automaticamente. A identidade com permissão
  de upload fica restrita à execução manual do workflow.
- O relatório usa apenas contagens agregadas; nenhum objeto é baixado,
  copiado, apagado ou escrito.

**Escopo estrito:** essa auditoria verifica metadados do **destino
homologado**, não a igualdade atual entre fonte e destino. A comparação
com a origem `cormyr.firebasestorage.app` requer credencial de leitura
adequada, checksum por objeto e evidência de delta congelado. Nada aqui
autoriza o cutover, a ativação dos runtimes ou a liberação dos jogadores.

Não conceder permissões adicionais automaticamente e não usar Supabase,
Lovable ou Vercel.

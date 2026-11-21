# Restauração das imagens históricas — 21/11/2026

## Evidência da produção (auditoria OIDC somente leitura)

O snapshot verificado contém **uma imagem na edição 1** de `A Folha Sem Selo`,
armazenada como `imagePath` e não como gravura estática `imageSrc`.
O objeto não foi encontrado nas duas localizações pesquisadas no bucket
`cormyr.firebasestorage.app` (`migration-staging/campaign-newspapers/` e
`campaign-newspapers/`). Não substituir o caminho na edição por uma imagem
inventada; o registro é um vínculo histórico de origem.

A imagem original da edição 1 foi localizada no backup privado exportado pelo
proprietário, em PNG. A recuperação dos bytes foi verificada, mas **o arquivo
ainda precisa ser restaurado no Storage de produção** pelo processo privado
autorizado (fora deste PR). Não publicar o PNG num repositório público e não
abrir o bucket a usuários anônimos.

Ao restaurar o arquivo, usar a **exata chave** `imagePath` da edição 1,
precedida por `migration-staging/campaign-newspapers/`, no bucket privado
`cormyr.firebasestorage.app`. A restauração deve validar SHA-256, tamanho e
assinatura PNG e usar `ifGenerationMatch=0` para evitar sobrescrita. O hash
de conteúdo original identificado no backup é
`84fcfd2ce77a34aae2d1b14f58f10053fe732764d6ef56cc8629277e1058b83f`.
O serviço nunca revela o caminho da imagem em JSON ou HTML públicos; só
emite `/api/public/newspaper-image?edition=...&index=...`, e revalida
o registro de edição publicada no backend.

## Galeria privada das Casas

A auditoria encontrou 42 referências a imagens em registros importados;
na amostra de 12 caminhos, dez existem nas duas cópias do Storage e dois não
existem nas duas. Isso não autoriza liberar uma ACL global.

O novo caminho de leitura histórica exige simultaneamente: identidade
Firebase ativa, referência em conteúdo que a Casa ou Narrador pode ler no
momento, estágio de Storage concluído, raiz Cloud ativa/reconciliada, existência
nas duas cópias, comparação do tamanho/CRC32C/MD5 disponível e assinatura
válida do arquivo. Não depende de `privateMediaReadApproved` reservado a
novos uploads, mas tampouco ativa escrita ou concede acesso público.

As imagens realmente ausentes continuam mostrando indisponibilidade. Antes
de declará-las restauradas, reconciliar a lista dos objetos de origem e destino
com os ZIPs/manifestos originais e confirmar leitura efetiva como Narrador,
Casa própria e Casa alheia. A galeria pública continua com gate independente
`publicGalleryApproved`/revisão individual; este PR não a libera.

## Aceitação ainda necessária

- Restaurar a imagem original da edição 1 no caminho canônico, usando o backup
  do proprietário e registro de checksum. Não modificar o acervo.
- Confirmar que App Hosting tem acesso de leitura às duas cópias privadas
  necessárias ao verificador de integridade.
- Conferir `migrationStorageStage` completo para o mesmo snapshot.
- Testar a exibição no jornal público, editor e leitor privado, além de
  visibilidade isolada por Casa na galeria privada.

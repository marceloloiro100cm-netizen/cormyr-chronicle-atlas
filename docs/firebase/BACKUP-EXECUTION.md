# Execução da validação do backup

Este lote extrai e verifica um dump PostgreSQL sem restaurar SQL em banco,
sem enviar dados ao Firebase e sem alterar o site. Não é o migrador final.

## Requisitos e comando

Usar cliente PostgreSQL 17 ou superior capaz de ler o formato 1.16 e a
compressão do arquivo de origem. Python 3.12 é suficiente; nenhuma dependência
Python adicional é necessária. O SQL não é executado.

```bash
bash scripts/firebase/prepare-backup.sh /caminho/arquivo.backup .firebase-migration/inspecao-nova
```

Criar antes o diretório pai `.firebase-migration`, se necessário. A pasta de
saída deve ser nova. O comando falha se ela existir, preservando tentativas
anteriores. Guardar o arquivo de origem imutável durante a extração.

São produzidos, com acesso local restrito:
- TOC original e SQL extraído pelo pg_restore.
- JSON por tabela, preservando cada valor como texto PostgreSQL ou null.
- Manifesto com tabela de origem, quantidade de linhas e SHA-256 por arquivo.
- Auditoria de contagens, algoritmos de senha e referências de Storage.
- Hash SHA-256 e tamanho do arquivo de origem.

Os JSONs ainda não são documentos Firestore. Tipos, arrays, JSONB, relações,
visibilidade e limites de documento exigem conversão explícita por domínio.
Não importar sessões, refresh tokens, vault ou hashes de senha no Firestore.

## Validação executada

Extração de um backup real realizada offline com pg_restore 17, seguida de
leitura de todas as seções COPY. Contagens e dados resultantes permanecem
privados. Não há conteúdo, nomes, emails, senhas ou hashes do backup neste PR.

Os testes cobrem tabela vazia entre seções (para não contar comentários SQL
como linhas), null versus texto literal, UTF-8, escapes octais/hexadecimais,
identificadores entre aspas, largura de linhas e truncamento.

## Bloqueios para a troca definitiva

- Reconciliar backup atual com o banco ativo: o backup disponível precede
  mudanças recentes e não contém as tabelas do jornal.
- Copiar os binários de todos os objetos Storage e comparar hashes; linhas
  de storage.objects não contêm os arquivos.
- Confirmar estratégia para contas sem senha, sem atribuir senha compartilhada.
- Implementar e testar adaptadores Firebase, autorização, transações e SSR.
- Executar importação autenticada e reconciliada no destino. A configuração
  pública do app e a sessão Cloud Shell do proprietário não autenticam o agente.
- Validar atualização incremental e congelamento final antes da troca.

O site continua no backend atual. Não cancelar Lovable neste estágio.

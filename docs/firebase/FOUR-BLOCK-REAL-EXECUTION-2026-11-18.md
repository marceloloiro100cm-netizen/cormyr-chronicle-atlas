# Quatro frentes operacionais — execução controlada em 18/11/2026

Objetivo: obter prova real e limitada do Firebase, sem retroceder para Lovable,
Supabase ou Vercel, sem modificar a origem histórica e sem liberar escrita antes
de provar segurança por Casa.

## 1 — Storage, origem versus homologação

O operador protegido coleta metadados dos dois escopos fixos em
`scripts/firebase/verify-storage-homologation.mjs`:

- Origem: `gs://cormyr.firebasestorage.app/migration-staging/campaign-images/`
- Homologação: `gs://cormyr-migration-homolog-477785088395/campaign-images/`

A primeira tentativa é feita automaticamente pela identidade de leitura
de escopo mínimo (`.github/workflows/firebase-storage-source-copy-readonly.yml`),
sem revisão humana nem ampliação de IAM. Se a origem não autorizar esse leitor,
o job falha de forma explícita e o operador protegido pode repetir a prova
com a identidade administrativa já configurada após aprovação do ambiente.

A comparação exige os mesmos caminhos relativos, tamanhos e CRC32C e,
quando ambos os objetos oferecem MD5, compara também MD5. Relatório com
contagens e códigos de erro pré-definidos. Não imprime nomes, paths, tokens
nem lista de objetos. Se a origem responder 403, isso é um bloqueio de acesso
de leitura, não uma igualdade presumida.

A última conferência independente da homologação, execução
[#44258601915](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/44258601915),
encontrou 779 objetos, 2.107.760.075 bytes e zero divergências API × CLI,
mas **não comparou a origem**. Mesmo que o novo comparador confirme igualdade
hoje, a fonte deve estar congelada ou ter delta final reconciliado antes de
declarar cutover.

## 2 — Dez Casas e conteúdo público

A auditoria lê o único snapshot privado e compara os nomes das Casas ativas
da temporada 2 com `public/cormyr/data.js`, exigindo unicidade de ambos
os lados. A auditoria protegida anterior indicou 10/10 nomes coincidentes,
sem ambiguidade, de 11 Casas no snapshot.

Também verifica localmente os arquivos do arquivo público: contagem de
brasões com assinatura de imagem válida, JSON de histórias legíveis e
histórias não referenciadas. Isso **não** confere autorização para copiar
biografias, imagens nem relações de Casas para o catálogo operacional:
o `migrationPublicContentStage` exige revisão editorial explícita por
registro, traduções en/es/de e um digest aprovado antes da importação atômica.

Não colocar nomes privados, mapeamentos de jogadores nem UIDs em logs ou
arquivos públicos. A função `publishReviewedPublicStage` já existe, mas
não deve ser invocada sem o plano revisado.

## 3 — Calendário e runtimes

Releitura somente das dez etapas Cloud, do calendário histórico e dos
dois documentos de runtime. Os runtimes continuam em estado pendente e
inativo enquanto não houver fonte atual confiável de rodada e versão.
Nenhum cálculo deriva a rodada aberta de `lastRound` histórico.

Não ativar `campaignCloudRuntime`, `campaignMailRuntime`,
`mailWriteApproved` ou `applicationEnabled` por inferência.
Uma coincidência de checksum de Storage não significa reconciliação do
banco de dados ou da cronologia após o snapshot.

## 4 — Perfis e aceite entre Casas

O operador confirma a lista Auth e os vínculos de acesso por dados reais
sem imprimir usuários, nomes nem Casas. A última auditoria indicou 14/14
contas Auth habilitadas, 10/14 perfis estruturalmente elegíveis, 4 acessos
de campanha inativos, 2 sem perfil, 2 jogadores sem Casa e 2 trocas de
senha pendentes; os grupos podem se sobrepor. Dados serão reavaliados.

É proibido deduzir uma Casa a partir de e-mail, nome, histórico ou posição
da conta. A regularização requer atribuição explícita do narrador.
`requirePasswordChange` não pode ser apagado por suposição: é necessária
prova de troca de senha. Como `migration*` é histórico imutável, não
corrigir vínculos escrevendo diretamente nos documentos de importação.
Antes de implementar o runtime de acesso mutável, todas as rotas precisam
ler a mesma fonte canônica para não criar permissões divergentes.

A aceitação real requer login autorizado do narrador, jogadores de Casas A
e B e editor, teste anônimo, leitura entre Casas, negativa de vazamento,
missiva idempotente, resposta e comprovante de leitura, com recarga real.
Emulador com identidades sintéticas não prova esse aceite.

## Estado das operações

O novo auditor **tenta** item 1 na origem e coleta as evidências disponíveis
dos itens 2–4. Resultado HTTP 403, ausência de revisão, falta de vínculo ou
ausência da origem atual ficam explícitos como bloqueios; não são motivo
para conceder IAM amplo, inventar dados ou declarar sucesso.
O workflow exige aprovação administrativa do ambiente protegido
`firebase-auth-test-activation`. Toda inspeção é somente leitura;
`releaseDecision=NO_GO` e `readyForPlayers=false` permanecem.

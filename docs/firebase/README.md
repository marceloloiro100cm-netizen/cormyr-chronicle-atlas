# Cormyr Chronicle Atlas — migração para Firebase

**Atualizado em 13/11/2026.** Esta documentação acompanha a migração
sem interromper a origem Lovable/Supabase. Todo desenvolvimento e
versionamento passam pelo GitHub, **sem gastar tokens Lovable**.

## Estado observado

| Frente | Situação comprovada | O que ainda falta |
| --- | --- | --- |
| Backup PostgreSQL | Snapshot privado normalizado com 148 tabelas; 5.209 linhas auditadas historicamente | Comparar com a origem ativa antes do corte |
| Firestore Emulator: arquivo bruto | 98 tabelas públicas, 3.455 documentos, 1 registro grande em 6 fragmentos; round-trip passou | Converter os demais domínios; não é dado de produção cloud |
| Modelo tipado inicial | 11 Casas, 11 jogadores, 14 acessos, 101 missivas endereçadas e 15 em quarentena | Backend transacional, regras e integração com o app |
| Storage de homologação | 986 objetos copiados no bucket privado e leitura restrita GitHub validada | Verificar novos arquivos e hashes na reconciliação final |
| Firebase Authentication | 14 candidatos de origem (13 BCRYPT, um sem senha); fluxo de importação para emulador implementado e testado com dados sintéticos | Executar contra backup real, verificar login, OAuth/SSO e importar cloud só com segurança |
| Hub Temporal | Projeção Harptos + histórico privado implementados para emulador, testes específicos aprovados | Rodar com snapshot real; portar operações atômicas e consumidores |
| Cobertura de módulos | Auditoria agregada de todas as tabelas implementada | Executar sobre snapshot real, expandir módulos |
| Hospedagem | Backend App Hosting `cormyr-preview` criado, primeiro build falhou; branch de preview corrigida | **Publicação suspensa pelo proprietário**, tratar posteriormente |

Os testes com Auth/Firestore Emulator **não** são prova de login real
ou migração para a nuvem. Os dois usuários sem perfil explícito não
recebem permissões automaticamente. Um vínculo customizado de
OAuth/OIDC permanece pendente de reconciliação.

A origem atual continua operando. O projeto Firebase `cormyr` não
deve ser tratado como uma réplica pronta para os jogadores.

## Artefatos e executáveis atuais

- `docs/firebase/PRIVATE-FIRESTORE-EMULATOR-ARCHIVE.md`: backup bruto
  preservado no Firestore Emulator.
- `docs/firebase/TYPED-DOMAIN-STAGING.md`: modelos de Casas, jogadores,
  missivas e matriz de permissões por Casa.
- `docs/firebase/AUTH-EMULATOR-MIGRATION.md`: importação de Auth com
  BCRYPT e OAuth em emulador, sem conexão cloud.
- `docs/firebase/TEMPORAL-EMULATOR-STAGING.md`: calendário Harptos e
  histórico temporal privado.
- `docs/firebase/MIGRATION-COVERAGE.md`: contagens por domínio sem
  apresentar percentual fictício de funcionalidades prontas.
- `docs/firebase/STORAGE-SCOPED-ACCESS-HOMOLOGATION.md`: bucket privado
  das 986 imagens.
- `firebase/firestore.rules` e `firebase/storage.rules`: **deny all**
  na configuração de produção; não publicar regras temporárias.
- `firebase/firestore.domain.rules`: regras estritas de emulador para
  autorização e leitura de projeções, sem escrita por SDK cliente.

## Critérios de aceite para trocar de backend

1. **Fonte íntegra:** reconciliação final com PostgreSQL/Storage ativos,
   sem perder novos registros ou anexos após o snapshot de 12/11.
2. **Identidades:** UIDs preservados, logins BCRYPT/OAuth/SSO validados,
   contas especiais explicitamente classificadas, rollback seguro.
3. **Autorização:** regras por Casa com testes anônimo, membro, outra
   Casa, narrador e editor. Nenhuma missiva cruzada; editor não envia.
4. **Modelos e regras:** converter todas as tabelas de aplicação
   pertinentes e reimplementar operações RPC/SQL transacionais,
   restrições e validações; conservar históricos e vínculos.
5. **Jogabilidade:** testar missivas, calendário, construções, avanço do
   tempo, combate, espionagem, jornal, fichas e efeitos em campanhas.
6. **Operação cloud:** preparar IAM mínimo, credenciais OIDC, regras,
   Storage privado e rotinas de backup/recuperação, sem segredos no Git.
7. **Corte:** ensaio de homologação, plano de congelamento/delta,
   controle de concorrência, comparação automatizada, rollback e
   somente então mudança de DNS/hospedagem.

**Enquanto qualquer etapa acima estiver pendente, não desligar a origem
nem publicar o app funcional com acesso a dados reais.**

## Procedimento de auditoria no Cloud Shell

A pasta privada normalizada já existente poderá ser usada, sem
reexportar nada para repetir as auditorias:

```bash
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
WORK="/tmp/cormyr-migration-review-$(date +%s)-$$"
git -C "$ROOT" worktree add --detach "$WORK" FETCH_HEAD
N="$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"

node "$WORK/scripts/firebase/stage-auth-emulator.mjs" --normalized "$N"
node "$WORK/scripts/firebase/stage-temporal-emulator.mjs" --normalized "$N"
node "$WORK/scripts/firebase/audit-migration-coverage.mjs" "$N"
```

Os relatórios retornam somente contagens e razões de bloqueio; não
imprimem nomes, UIDs ou textos privados. Não rodar opções de execução
em nuvem. Nenhum dos comandos acima altera origem ou Firebase.

## Limites

O código de UI do site ainda contém adaptadores do Supabase e
integrações de Drive que precisam ser removidos gradativamente,
com isolamento e validação. O GitHub não substitui acesso autenticado
ao Cloud Shell ou uma conexão ao banco de origem. Sem isso não se
pode comprovar delta, aplicar IAM ou executar importação cloud.

**A publicação de teste e a vinculação de domínio foram pausadas.**

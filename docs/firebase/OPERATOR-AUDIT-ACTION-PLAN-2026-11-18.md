# Cormyr — plano operacional após auditoria protegida (18/11/2026 UTC)

## Evidência confirmada, sem dados privados

Fonte: [GitHub Actions #44217811805](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/44217811805).

A identidade administrativa OIDC conseguiu ler Firebase Auth e Firestore. O job retornou exit 2 **porque um estágio auxiliar permanece pendente**, não por falha de credenciais ou indisponibilidade do projeto.

| Prova | Resultado |
| --- | --- |
| Auth habilitado | 14/14 |
| Vínculos de acesso presentes | 14/14 |
| Estágios privados | 6/6 completos |
| Estágios auxiliares | 3/4 completos |
| `migrationPublicContentStage` | Ausente — HTTP 404 |
| `campaignCloudRuntime` / `campaignMailRuntime` | Ambos presentes, `pending`, inativos |
| Histórico de calendário | Documento e rodada histórica encontrados |
| Perfis estruturalmente aptos | 10/14: 1 narrador, 8 jogadores, 1 editor |
| Acessos de campanha inativos | 4 (podem sobrepor outros grupos) |
| Contas sem perfil | 2 |
| Jogadores sem Casa | 2 |
| Trocas de senha pendentes | 2 |
| Referências inválidas a Casas | 0 |
| Correspondência público/privado | 10/10 Casas ativas por nome, 0 ambíguas |
| Revisão pública por registro | Não aprovada |
| Reconciliação de delta de dados e Storage | Não comprovada |
| Testes autenticados reais entre duas Casas | Não realizados |
| Decisão de liberação | `NO_GO` |

O acervo público possui 172 Casas em 11 regiões, mas **somente as 10 Casas ativas do snapshot** são candidatas ao catálogo da temporada. Coincidência de nome e existência de imagem não constituem revisão editorial ou autorização para publicar dados privados.

## Próxima ordem de execução

1. **Revisão do catálogo público (sem publicação automática).** Preparar fonte privada revisada das 10 Casas e traduções `en`, `es`, `de`; cada registro deve ter decisão explícita `publicReviewed=true`. Usar `preflightReviewedPublicStage` para obter resumo sanitizado e digest. Não salvar conteúdo privado no repositório público.
2. **Importação atômica protegida.** Aplicar `publishReviewedPublicStage` somente após a fonte revisada e seu digest terem aprovação independente. Esta operação cria o estágio público, catálogo e traduções, **mas não habilita o runtime nem libera jogadores**.
3. **Reconciliação de operações e Storage.** Verificar diferenças desde o snapshot até a origem ativa, bytes das mídias, versão de calendário e rodada real. Não deduzir `openRound` a partir do histórico.
4. **Decisões pendentes de identidade.** Regularizar os quatro acessos inativos e as duas contas sem perfil/Casa por decisão explícita do narrador. Apenas marcar `requirePasswordChange=false` após comprovação de troca de senha.
5. **Ativar separadamente os dois runtimes depois da reconciliação.** Aprovar flags e `openRound`/`calendarVersion` idênticos em `campaignCloudRuntime` e `campaignMailRuntime`. Não atribuir valores ilustrativos.
6. **Aceite funcional real.** Autenticar narrador, jogador A, jogador B, editor e anônimo; validar isolamento, missiva idempotente, resposta, releitura, calendário e rollback operacional.

## Interpretação dos workflows

Um job de **auditoria** deve refletir se conseguiu coletar fontes confiáveis; um resultado de **liberação** permanece `NO_GO` até satisfazer todas as condições de segurança. A ausência conhecida do estágio público não deve ser ocultada nem transformar a auditoria em aprovação. O CI não executa reconciliação de origem, mutações Firebase, mudança de IAM, publicação pública ou liberação da campanha.

**Regra:** nunca usar Lovable, Supabase ou Vercel como fallback. Repositório público sem segredos, tokens, textos de missivas, e-mails, UIDs, nomes de Casas do snapshot ou hashes privados.

# Hotfix de produção · 06/11/2026 — página não carrega

## Diagnóstico confirmado
Após PR #290, a hospedagem compilou o aplicativo sem `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. O client da aplicação lança `Missing Supabase environment variable(s)` no carregamento inicial, e a boundary de `src/routes/__root.tsx` mostra `This page didn't load`. Reprodução pela inspeção de console do navegador em produção; também atingiu a rota `/auth`.

O arquivo `.env` removido do repositório deve **continuar excluído do Git**. Ele também não é fonte confiável de variáveis de produção. Duas chamadas ao publish do Lovable antes deste hotfix não atualizaram os valores embutidos no pacote servido.

## Correção
- Adiciona `src/integrations/supabase/public-config.ts` com **somente** o URL público e a chave de classe `sb_publishable_`, originalmente expostos como `VITE_*` no cliente. Esses dados são por definição **públicos** e devem continuar sujeitos a RLS e checagens de autorização; não são a chave administrativa `SUPABASE_SERVICE_ROLE_KEY`.
- `client.ts` usa valores do ambiente com prioridade quando presentes, com fallback seguro de coordenadas públicas e guarda para `process` ausente no browser.
- Auth middleware e rotas públicas usam o mesmo fallback, sem alterar checks de token, `getClaims`, RLS, `is_campaign_admin` nem tabelas privadas. O cliente administrativo continua exigindo `SUPABASE_SERVICE_ROLE_KEY` somente no servidor; **nunca** se faz fallback de serviço secreto.
- Testes de regressão validam build sem `.env`, precedência das variáveis externas e ausência de chaves administrativas na configuração pública.

## Impacto e rollback
Nenhuma alteração em emails, senhas, contas, atribuições, dados reais, bancos, migrations, economia ou campanha. Não modifica regras CRZ nem PTE. A plataforma deve posteriormente receber as variáveis build-time em seu serviço de implantação; esta correção mantém a página funcional se a injeção falhar.

Atenção: a existência de chave publicável **não concede acesso aos dados privados**. A segurança depende de RLS e validação de autorização já implementadas; manter esses controles em vigor. Em caso de falha, fazer rollback do PR de hotfix, não do PR #290, e reconfigurar variáveis no host.

Verificar em produção após deploy com navegador (não apenas código HTTP 200): `/` abre, `/auth` abre, console sem `Missing Supabase environment variable(s)`, Narrador pode chegar ao Laboratório CRZ e jogadores não recebem acesso; sem teste de alteração de credenciais.

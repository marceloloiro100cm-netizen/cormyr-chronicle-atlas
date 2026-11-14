# Lote 1 — Fundação de autenticação Firebase (homologação isolada)

## Escopo implementado

O aplicativo em produção permanece em Supabase: `src/start.ts` usa
`attachSupabaseAuth`, `/_authenticated` exige sessão Supabase e os
serviços dos demais módulos não foram conectados a Firebase Cloud.
Não ligar Firebase como backend global antes do Lote 2.

Foi adicionada uma página de homologação em `/firebase-homolog` e uma
rota de verificação server-side em `GET /api/firebase-auth-verify`. O
login usa o endpoint público do Firebase Identity Toolkit e envia o
ID token somente ao verificador. O servidor confere assinatura RS256,
projeto, emissor, audiência e prazos contra JWKS do Google. Ele retorna
apenas `authenticated: true/false`, sem dados, permissões ou acesso de
campanha. A rota não expõe dados de Casas, jogadores ou missivas.

O refresh token só é guardado na `sessionStorage` do navegador da
homologação (com fallback para memória se storage for bloqueado).
Sair remove essa credencial. O frontend não acessa o Admin SDK.

## Habilitação exclusivamente no ambiente de homologação

Por padrão **ambas as travas estão desligadas**. Definir *somente* no
deploy de homologação, sem alterar o ambiente ativo:

| Variável | Ambiente | Valor |
| --- | --- | --- |
| `VITE_FIREBASE_AUTH_HOMOLOGATION` | build | `true` |
| `VITE_FIREBASE_API_KEY` | build | chave Web API pública do Firebase |
| `VITE_FIREBASE_PROJECT_ID` | build | `cormyr` |
| `FIREBASE_AUTH_HOMOLOGATION_ENABLED` | servidor | `true` |
| `FIREBASE_PROJECT_ID` | servidor | `cormyr` |

Chaves Web API Firebase são identificadores públicos; **nunca** colocar
`service_role`, chaves de conta de serviço ou refresh tokens no código,
em variáveis VITE_ ou no repositório público.

O Firebase Auth precisa ter usuários de homologação importados com UIDs
preservados e provedores/regras conferidos. Nenhuma conta real é criada
por esta alteração. Testar senha com uma identidade de homologação
autorizada e confirmar resposta `authenticated: true`; ausência de
credenciais, flag ou token deve retornar 503/401 conforme o caso.

## Testes e controles

- `src/integrations/auth/firebase-homologation.test.ts`: flag,
  sessão temporária, escopo da chamada e ausência de fallback.
- `src/integrations/auth/firebase-homologation-auth.test.ts`: negação
  por padrão, tokens inválidos, resposta sem dados pessoais.
- O verificador criptográfico existente tem suíte própria em
  `firebase-id-token.test.ts`.

A aceitação do Lote 1 só ocorre após CI verde e um login real
na homologação cloud. Os Lotes 2 e 3 ainda precisam conectar
os serviços de domínio e importar contas e dados definitivos.

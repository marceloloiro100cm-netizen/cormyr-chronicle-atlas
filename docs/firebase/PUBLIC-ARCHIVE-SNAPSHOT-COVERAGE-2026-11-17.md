# Cobertura do catálogo público — pré-reconciliação somente leitura

A página pública arquivada usa \`public/cormyr/data.js\`, um arquivo já disponibilizado no site, e hoje contém 11 regiões e 172 entradas de Casas. O snapshot privado é uma origem independente: a auditoria protegida da migração registrou 11 Casas, das quais 10 estavam ativas na temporada 2.

**Não usar 172 como contagem de Casas no banco de jogadores, nem 10 como catálogo público completo.** A comparação implementada nesta etapa compara apenas nomes normalizados, de forma exata, e retorna contagens agregadas dos casos correspondentes, ambíguos ou não encontrados. Nomes não conferem identidade, perfil, direito de acesso, revisão pública ou autorização para publicar.

O parser lê a atribuição fixa \`window.CORMYR_DATA = {...}\` estritamente como JSON e não executa código JavaScript. A auditoria lê um único snapshot privado completo e sua coleção de Casas, no projeto Firebase atual, usando credenciais OIDC já protegidas; não publica nomes, identificadores, datas, conteúdo das histórias ou credenciais.

O relatório de operador pode exibir contagens, mas sempre deixa \`publicReviewApproved=false\`, \`readyForPlayers=false\` e \`releaseDecision=NO_GO\`. Nenhum documento ou flag Firestore é alterado; falta revisão individual do material, conferência das regiões/classificações/narrativas, vínculo dos IDs e reconciliação da origem corrente. Nenhum novo pedido de Cloud Shell ou uso de Lovable/Supabase/Vercel foi adicionado.

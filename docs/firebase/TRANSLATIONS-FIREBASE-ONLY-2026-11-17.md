# Traduções dinâmicas — leitura exclusiva Firebase

Em 17/11/2026, o endpoint anônimo de traduções já utilizava Firebase, mas
\`loadDynamicTranslations\` ainda lia diretamente tabelas do backend antigo,
e \`upsertTranslationsBatch\` ainda escrevia nesse backend.

Esta alteração move a **leitura usada pelo contexto de internacionalização**
para o mesmo serviço Firebase aprovado das rotas públicas, respeitando o
snapshot fixo do servidor e as flags \`CORMYR_FIREBASE_PUBLIC_TRANSLATIONS_ENABLED\`.
Dados públicos só são retornados após os gates de revisão por registro, estágio
e runtime. Sem autorização ou rede, retorna dicionário vazio e o contexto usa o
português original; nenhum fallback ao banco antigo.

O filtro local \`projectFirebaseDynamicTranslations\` rejeita chaves inválidas,
dicionários grandes e tipos privados (eventos, registros, aventuras).
A edição administrativa legada deixa de fazer escritas. Sua API responde
explicitamente que o editor Firebase ainda não foi homologado, em vez de
afirmar uma gravação que não é segura. Um futuro editor exige identidade
Firebase do Narrador, revisão pública individual, controle de versões,
auditoria e aceite real entre perfis.

Não foram ativadas flags, não houve importação de conteúdo,
Firestore write, Auth write, alteração IAM ou publicação intencional
de dados de Casas. Os testes unitários utilizam conteúdo sintético.
O acesso principal de jogadores e outras funções legadas têm migração
independente e não são declarados completos por este lote.

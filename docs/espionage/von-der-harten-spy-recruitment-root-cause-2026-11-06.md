# Incidente: criação do espião Von der Harten — 06/11/2026

## Evidência observada no banco de produção (somente leitura, antes do ajuste)
- Casa operacional `von-der-harten`, ficha ativa, Rede de Espiões `von-der-harten-spy-network` ativa, `domainId=dom-von-der-harten-lex-castle`.
- A ficha declara o domínio `Lex Castle e as Montanhas de Highmarket`; catálogo público oficial revisado classifica a Casa em `Crownlands`.
- **0 agentes** da Casa e **0 agentes usando `espiao-contador`** globalmente.
- A Rede permite **3 vagas** pelo RPC implantado; o registro `spy_locations(kind='domain',ref_id='dom-von-der-harten-lex-castle')` estava **ausente**.
- A função `spy_recruit_agent`, chamada por `spy_create_agent`, levanta erro **"Domínio de recrutamento sem localização homologada"** ao não encontrar esse registro, antes de qualquer inserção de agente ou reserva de retrato.
- O diálogo antes capturava toda exceção como se a foto estivesse ocupada, ocultando a causa.

## Correção pontual aplicada em produção
- A migração idempotente está reproduzida em `docs/espionage/sql/0109_von_der_harten_spy_domain_location_2026_11_06.sql`.
- Inserido somente `spy_locations(kind=domain,ref_id=dom-von-der-harten-lex-castle,region_id=crownlands,approved=true,visibility=narrator)`, após cruzamento das informações da ficha e catálogo oficial.
- Verificação posterior confirmou ligação do domínio com a Rede ativa, **0 agentes** de Von der Harten, **0 reservas** para Contador e calendário oficial presente.
- Não foram alterados autenticação, senhas, e-mails, saldo, missões ou retratos; nenhum espião de teste foi criado.
- Atualizado o cliente para mostrar mensagens seguras e específicas para localização, vagas, retrato, Riqueza, autorização e calendário. A mesma chave idempotente é preservada em uma tentativa repetida com parâmetros iguais. Falha de atualização de cache após êxito não pode simular falha de criação.

## Validação final
- Após integração do código, confirmar CI, sincronização do Lovable e eventual publicação antes de afirmar que a interface foi atualizada.
- O controle funcional final deve ser realizado com uma tentativa **autorizada pelo próprio jogador/narrador**, porque criar agentes reais consumiria uma vaga e reservaria imagem; não fazer essa alteração como teste automático de produção.
- Caso persista um erro, a nova mensagem poderá diferenciar outras condições do RPC, sem expor erros SQL brutos ou a identidade de espiões de outras Casas.

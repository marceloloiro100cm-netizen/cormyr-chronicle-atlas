# Firebase calendário — polling somente na bancada de homologação

**Item 19 da migração (parcial).** O calendário real da campanha usa atualmente Supabase Realtime e o fallback de `useCampaignTime` (15 s). Não substituir ou desligar essa assinatura enquanto a migração Cloud estiver incompleta.

A página experimental `FirebaseDomainPreview`, disponível apenas quando `domainPreviewConfigured()` está habilitado no ambiente de homologação, passa a oferecer a opção **Acompanhar calendário (15 s)** quando a superfície `calendar` é selecionada.

- A leitura utiliza exclusivamente `readFirebaseSurface('calendar', ...)` no backend de emulador já autenticado; **não chama Supabase**.
- O monitor só inicia após clique do operador. A cadência mínima é 15 s.
- Rejeita qualquer ano, dia, mês, festival ou versão inválidos, sem inferir a data do dispositivo.
- Mudanças de versão geram atualização; respostas iguais são deduplicadas.
- Ao desligar o acompanhamento, sair da página ou trocar de módulo, o intervalo é cancelado e respostas pendentes não alteram a interface.
- Falhas expõem apenas uma mensagem genérica; não registram tokens ou dados da sessão.
- O monitor não modifica o calendário, missivas, Hub Temporal, jobs ou as regras Firebase.

**Limite importante:** polling de versão não substitui o serviço Realtime final. Ainda falta a integração com o Firebase Auth Cloud, a autorização por Casa, o sistema de notificações e a homologação de carga/latência antes de ativar esse monitor nos painéis reais dos jogadores. `readyForCutover=false`.

Teste: `src/integrations/backend/firebase-calendar-polling.test.ts`. Build e Validate precisam passar antes do merge. Nenhum dado da campanha é alterado.

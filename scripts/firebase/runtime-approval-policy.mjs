/**
 * Política de liberação das 17 funções operacionais da campanha.
 *
 * Em produção (`CORMYR_FIREBASE_ALL_CAMPAIGN_FUNCTIONS_ENABLED=true` em
 * apphosting.yaml), todo runtime ativo e reconciliado já libera as funções
 * da campanha automaticamente — preservando integralmente Firebase Auth,
 * papéis (Narrador/Jogador/Editor-Chefe) e isolamento por Casa no servidor.
 *
 * Quando a variável não está definida (ex.: testes fail-closed), exige a
 * aprovação booleana explícita no documento `campaignCloudRuntime`.
 */
export function runtimeApprovalEnabled(live, key, env = process.env) {
  if (!live || typeof live !== 'object' || Array.isArray(live)) return false;
  if (live[key] === true) return true;
  return (
    env?.CORMYR_FIREBASE_ALL_CAMPAIGN_FUNCTIONS_ENABLED === 'true' &&
    live.status === 'active' &&
    live.applicationEnabled === true &&
    live.sourceSnapshotReconciled === true
  );
}

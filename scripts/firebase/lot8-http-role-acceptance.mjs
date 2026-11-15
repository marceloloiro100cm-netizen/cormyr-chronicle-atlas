/**
 * Lote 8: mandatory observed HTTP role matrix, from the real Firebase
 * Emulator integration test. This does NOT verify Firebase Cloud identities.
 */
const SCENARIOS = Object.freeze([
  ['baseline','alice','A',200],
  ['baseline','alice','B',403],
  ['baseline','bob','A',403],
  ['baseline','narrator','B',200],
  ['baseline','editor','A',403],
  ['baseline','locked-editor','A',403],
  ['baseline','locked-narrator','A',403],
  ['baseline','disabled','A',401],
  ['baseline','mismatched','A',403],
  ['baseline','anonymous','A',401],
  ['revoked','alice','A',403],
  ['revoked','narrator','A',403],
]);
export const LOT8_HTTP_SCENARIOS = SCENARIOS.map(([phase,actor,house,status])=>({
  phase,actor,house,status,
}));

export function assessLot8HttpRoleMatrix(observations) {
  if(!Array.isArray(observations))throw Error('Invalid role observations');
  const keys=new Set(),unexpected=[];
  const key=({phase,actor,house})=>[phase,actor,house].join(':');
  const mandatory=new Map(LOT8_HTTP_SCENARIOS.map(x=>[key(x),x.status]));
  for(const item of observations){
    if(!item||typeof item!=='object'||typeof item.phase!=='string'||
        typeof item.actor!=='string'||typeof item.house!=='string'||
        !Number.isInteger(item.status))throw Error('Invalid role observation');
    const k=key(item);
    if(keys.has(k)||!mandatory.has(k)||mandatory.get(k)!==item.status)
      unexpected.push(k);
    keys.add(k);
  }
  const missing=[...mandatory.keys()].filter(k=>!keys.has(k));
  return {
    scope:'SYNTHETIC_FIREBASE_EMULATOR_HTTP_ACCEPTANCE',
    required:mandatory.size,observed:observations.length,
    missingScenarios:missing,unexpectedScenarios:unexpected,
    emulatorAcceptancePass:missing.length===0&&unexpected.length===0,
    realIdentityCloudE2E:false,readyForCutover:false,cloudWrites:0,
  };
}

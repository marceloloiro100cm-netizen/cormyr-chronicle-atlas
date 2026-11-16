import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {newHouseState} from './types';
import {constructionStateHash} from './firebase-construction-transaction';
import {prepareHouseEconomySeedDraft,MAX_SEED_DRAFT_BYTES}
  from './firebase-economy-seed-preflight';

const snapshot='a'.repeat(64),month=1522*12+1;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function fixture(){
  const source=newHouseState('house-a','Ferlin',month);
  source.phase='active';source.method='import';
  for(const key of Object.keys(source.base) as (keyof typeof source.base)[])
    source.base[key]=120;
  source.domains=[{
    id:'d1',name:'Vale',terrain:'plains',features:[],notes:'',
  }];
  return {
    snapshotId:snapshot,houseId:'house-a',sourceSheetVersion:4,
    calendarMonth:month,sourceState:source,existingDocumentPresent:false,
  };
}
describe('Firebase — planejamento dry-run de ficha econômica operacional',()=>{
  it('gera exclusivamente rascunho pendente e reproduz origem sem escrita',()=>{
    const f=fixture(),before=structuredClone(f);
    const plan=prepareHouseEconomySeedDraft(f);
    expect(plan.status).toBe('ready_for_operator_review');
    expect(plan.writesPerformed).toBe(false);
    expect(plan.automaticallyApproved).toBe(false);
    expect(plan.readyForCutover).toBe(false);
    expect(plan.draft?.status).toBe('pending');
    expect(plan.draft?.sourceReconciled).toBe(false);
    expect(plan.draft?.seedVerified).toBe(false);
    expect(plan.draft?.version).toBe(0);
    expect(plan.draft?.state).toEqual(f.sourceState);
    expect(plan.draft?.state).not.toBe(f.sourceState);
    expect(plan.draft?.stateHash).toBe(constructionStateHash(f.sourceState));
    expect(plan.draft?.sourceStateHash).toBe(constructionStateHash(f.sourceState));
    expect(plan.preview?.holdings).toBe(0);
    expect(plan.preview?.projects).toBe(0);
    expect(plan.targetPath).toBe(
      'campaignCloudRuntime/'+snapshot+'/houseEconomies/'+hash('house:house-a'));
    expect(f).toEqual(before);
  });
  it('nunca oferece substituição se já existe um documento operacional',()=>{
    const f=fixture();
    const plan=prepareHouseEconomySeedDraft({
      ...f,existingDocumentPresent:true,
    });
    expect(plan.status).toBe('existing_document_requires_review');
    expect(plan.draft).toBeNull();
    expect(plan.targetPath).toBeNull();
    expect(plan.preview).toBeNull();
  });
  it('não corrige automaticamente mês ou Casa divergente',()=>{
    const f=fixture();
    const wrongDate=prepareHouseEconomySeedDraft({
      ...f,calendarMonth:month+1,
    });
    expect(wrongDate.status).toBe('calendar_mismatch');
    expect(wrongDate.draft).toBeNull();
    expect(prepareHouseEconomySeedDraft({
      ...f,houseId:'house-b',
    }).status).toBe('source_unusable');
    expect(prepareHouseEconomySeedDraft({
      ...f,sourceState:{houseId:'house-a'},
    }).status).toBe('source_unusable');
  });
  it('recusa entrada inválida sem gerar alvo de gravação',()=>{
    const f=fixture();
    for(const changed of [
      {snapshotId:'untrusted'},
      {snapshotId:'A'.repeat(64)},
      {houseId:'../escape'},
      {sourceSheetVersion:-1},
      {calendarMonth:0},
      {existingDocumentPresent:undefined},
    ]){
      const plan=prepareHouseEconomySeedDraft({...f,...changed});
      expect(plan.status).toBe('invalid_input');
      expect(plan.draft).toBeNull();
      expect(plan.targetPath).toBeNull();
    }
  });
  it('rejeita origem com números de recursos ou dados anômalos',()=>{
    const f=fixture();
    const altered=structuredClone(f.sourceState);
    altered.base.defense=Number.NaN;
    expect(prepareHouseEconomySeedDraft({
      ...f,sourceState:altered,
    }).status).toBe('source_unusable');
    const extra=structuredClone(f.sourceState) as unknown as
      Record<string,unknown>;
    extra['inventedUndefined']=undefined;
    expect(prepareHouseEconomySeedDraft({
      ...f,sourceState:extra,
    }).status).toBe('source_unusable');
  });
  it('recusa documento que se aproximaria do limite de tamanho Firestore',()=>{
    const f=fixture();
    f.sourceState.identity.notes='x'.repeat(MAX_SEED_DRAFT_BYTES+1000);
    const result=prepareHouseEconomySeedDraft(f);
    expect(result.status).toBe('state_exceeds_firestore_budget');
    expect(result.draft).toBeNull();
  });
});

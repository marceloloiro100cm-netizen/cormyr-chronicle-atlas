import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';
const source=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
describe('Ficha Firebase: contrato de integração 4c',()=>{
 it('registra a operação original e preserva a chave da tentativa',()=>{
  expect(source('src/lib/firebase-workspace/activate.ts'))
   .toContain('registerWorkspaceFunction(houseOperation');
  const component=source('src/components/house/hub.tsx');
  expect(component).toContain('retry.current.key');
  expect(component).toContain("qc.invalidateQueries({queryKey:['noble-house',props.house.id]})");
 });
 it('inclui ledger operacional e mantém guardas desativadas na implantação',()=>{
  expect(source('src/lib/firebase-workspace/service.ts'))
   .toContain('readOperationalHouseLedger(db,snapshotId)');
  expect(source('src/lib/firebase-workspace/service.ts'))
   .toContain("process.env['CORMYR_FIREBASE_HOUSE_OPS_ENABLED']");
  const app=source('apphosting.yaml');
  expect(app).toMatch(/CORMYR_FIREBASE_HOUSE_OPS_ENABLED\n\s+value: "false"/);
 });
});

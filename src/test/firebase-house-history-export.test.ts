import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {houseNavigationVisible} from '@/lib/house/navigation';
import {newHouseState} from '@/lib/house/types';
import {houseReport} from '@/lib/house/report';

describe('Item 12: Histórico e documentos da Casa no Firebase',()=>{
 it('torna Histórico e documentos acessível ao jogador, sem liberar seções administrativas',()=>{
  expect(houseNavigationVisible('history',false,true)).toBe(true);
  expect(houseNavigationVisible('history',true,true)).toBe(true);
  expect(houseNavigationVisible('history',false,false)).toBe(true);
  for(const id of ['kingdom','reconciliation','coverage','rules'])
   expect(houseNavigationVisible(id,false,true)).toBe(false);
  expect(houseNavigationVisible('rules',true,true)).toBe(true);
 });
 it('mantém o acesso no menu real e exportações locais sem escrever no Drive',()=>{
  const src=readFileSync('src/components/house/hub.tsx','utf8');
  expect(src).toContain("['history','Histórico e documentos'");
  expect(src).toContain('NAV.filter(([id])=>houseNavigationVisible(');
  expect(src).toContain('exportHouseExcel(state,house.name,catalog,full)');
  expect(src).toContain('exportHousePdf(state,house.name,catalog,full)');
  expect(src).toContain('fetchFullLedger()');
  const activation=readFileSync('src/lib/firebase-workspace/activate.ts','utf8');
  expect(activation).toContain("kind:'houseLedgerExport'");
  expect(activation).toContain('registerWorkspaceFunction(loadHouseLedger');
  const backend=readFileSync('src/lib/firebase-workspace/service.ts','utf8');
  expect(backend).toContain("input?.kind==='houseLedgerExport'");
  expect(backend).toContain('checkHouse(id)');
  expect(backend).toContain("throw new CloudAccessError('house_ledger_export_too_large',413)");
  const drive=readFileSync('src/components/house/drive-status.tsx','utf8');
  expect(drive).toContain('enabled: !firebaseMode');
  expect(drive).toContain('if(firebaseMode)return');
 });
 it('documento para baixar usa a Ficha e não cria lançamentos econômicos',()=>{
  const sheet=newHouseState('ashkar','Ferlin',24300);
  const before=structuredClone(sheet);
  const sections=houseReport(sheet,'Ashkar',[],[]);
  expect(sections.map(x=>x.title)).toContain('Histórico de operações');
  expect(sections.map(x=>x.title)).toContain('Recursos');
  expect(sections.find(x=>x.title==='Identidade')?.rows)
   .toContainEqual(['Casa','Ashkar']);
  expect(sheet).toEqual(before);
 });
});

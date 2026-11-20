import {describe,it,expect} from 'vitest';
import {projectOperationalRecords,projectOperationalVersions,
 type OperationalRecord} from './operational-records';
import type {Scope} from './service';
const user:Scope={uid:'player-one',profile:'jogador',playerId:'p1',
 memberHouseIds:['house-a'],editHouseIds:['house-a']};
const imported=[
 {id:'r1',title:'Meu registro',content:'antigo',version:1,kind:'document',
  visibility:'house',house_id:'house-a',player_id:null,updated_by:'old',
  updated_at:'2026-11-10T00:00:00Z'},
 {id:'r2',title:'Outra Casa',content:'segredo',version:1,kind:'document',
  visibility:'house',house_id:'house-b',player_id:null},
 {id:'r3',title:'Narrador',content:'privado',version:1,kind:'document',
  visibility:'gm',house_id:'house-a',player_id:null},
];
const now='2026-11-19T20:00:00Z';
const edit:OperationalRecord={id:'r1',baseVersion:1,version:2,
 record:{...imported[0],title:'Meu registro',content:'novo',version:2,
  updated_by:user.uid,updated_at:now},
 previous:imported[0]!,updatedBy:user.uid,updatedAt:now};
describe('item 6, acervo e versões operacionais',()=>{
 it('a versão mais nova prevalece sem mutar o acervo e sem revelar outra Casa',()=>{
  const copy=structuredClone(imported);
  const rows=projectOperationalRecords(user,imported,[edit]);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.content).toBe('novo');
  expect(imported).toEqual(copy);
 });
 it('o Narrador vê tudo, mas um jogador não vê gm',()=>{
  const narrator:Scope={...user,profile:'narrador',playerId:null,
   memberHouseIds:[],editHouseIds:[]};
  expect(projectOperationalRecords(narrator,imported,[edit])).toHaveLength(3);
  expect(projectOperationalRecords(user,imported,[edit]).map(r=>r.id))
   .toEqual(['r1']);
 });
 it('confere histórico e mantém versão anterior',()=>{
  const visible=projectOperationalRecords(user,imported,[edit]);
  const versions=projectOperationalVersions(user,visible,[],[edit]);
  expect(versions.map(x=>x.version)).toEqual([1,2]);
  expect((versions[0]?.snapshot as {content:string}).content).toBe('antigo');
  expect((versions[1]?.snapshot as {content:string}).content).toBe('novo');
 });
 it('rejeita alteração de visibilidade, Casa ou versão de origem',()=>{
  expect(()=>projectOperationalRecords(user,imported,[{
   ...edit,record:{...edit.record,house_id:'house-b'},
  }])).toThrow(/record/);
  expect(()=>projectOperationalRecords(user,imported,[{
   ...edit,baseVersion:0,
  }])).toThrow(/record/);
 });
 it('registro novo da própria Casa aparece, de outra Casa não',()=>{
  const one:OperationalRecord={id:'r4',baseVersion:0,version:1,
   record:{id:'r4',title:'Novo',content:'texto',kind:'document',
    version:1,visibility:'house',house_id:'house-a',player_id:null},
   previous:null,updatedBy:user.uid,updatedAt:now};
  const other:OperationalRecord={...one,id:'r5',record:{
   ...one.record,id:'r5',house_id:'house-b'}};
  const rows=projectOperationalRecords(user,imported,[one,other]);
  expect(rows.map(r=>r.id)).toEqual(['r1','r4']);
 });
});

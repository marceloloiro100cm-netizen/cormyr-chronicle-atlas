import {describe,it,expect} from 'vitest';
import {projectAgeDashboard,projectHouseAges,readAgeRegistry,
 listAgeTransitions,type AgeRegistry} from './operational-character-ages';
import type {Scope} from './service';

const snapshot='a'.repeat(64);
const gm:Scope={uid:'narrator',profile:'narrador',playerId:null,
 memberHouseIds:[],editHouseIds:[]};
const player:Scope={uid:'alice',profile:'jogador',playerId:'p1',
 memberHouseIds:['h1'],editHouseIds:[]};
const make=(id:string,extra:Partial<AgeRegistry['characters'][number]>={}):AgeRegistry['characters'][number]=>({
 id,displayName:'Pessoa '+id,houseId:'h1',nobleRoles:['Lorde'],race:null,
 isNoble:true,visibility:'house',ownerUserId:null,
 aliveStatus:'alive',reviewStatus:'reviewed',confidence:'confirmed',
 birthYear:1500,baselineAge:null,baselineYear:null,deathYear:null,
 agePolicy:'year_turn',...extra,
});
const registry:AgeRegistry={characters:[
 make('a'),make('b',{aliveStatus:'deceased',deathYear:1510}),
 make('c',{reviewStatus:'pending',birthYear:null}),
 make('d',{visibility:'player',ownerUserId:'alice'}),
 make('e',{visibility:'gm'}),
],links:[
 ...['a','b','c','d','e'].map(id=>({
 characterId:id,sourceKind:'campaign_record',sourceKey:'record-'+id,
 sourceVisibility:id==='d'?'player':id==='e'?'gm':'house'})),
],transitions:[]};
const records=['a','b','c','d','e'].map(id=>({
 id:'record-'+id,house_id:'h1',kind:'character',
 visibility:id==='d'?'player':id==='e'?'gm':'house',
 player_id:id==='d'?'p1':null,
}));
const row=(id:string,content:unknown)=>({id,data:()=>content});
const inMemory=(mode:'complete'|'missing'|'bad'='complete')=>{
 const values=new Map<string,unknown>();
 const root='migrationCharacterStage/'+snapshot;
 if(mode!=='missing'){
  values.set(root,{status:'complete',private:true,
   counts:{characters:registry.characters.length,
    links:registry.links.length,transitions:0}});
  registry.characters.forEach(c=>values.set(root+'/characters/'+c.id,c));
  registry.links.forEach((l,i)=>values.set(root+'/links/'+i,l));
 }
 if(mode==='bad')values.set(root,{status:'complete',private:true,
  counts:{characters:999,links:5,transitions:0}});
 const ref=(path:string):any=>({
  path,
  doc:(part:string)=>ref(path+'/'+part),
  collection:(part:string)=>ref(path+'/'+part),
  limit:(n:number)=>({...ref(path),max:n}),
  async get(){
   if(this.max)return {docs:[...values].filter(([key])=>key.startsWith(path+'/'))
    .slice(0,this.max).map(([key,value])=>row(key.split('/').at(-1)??'',value))};
   return {exists:values.has(path),data:()=>values.get(path)};
  },
 });
 return {db:{collection:(name:string)=>ref(name)},values};
};
describe('Idade canônica ligada ao HUB, item 9',()=>{
 it('calcula ano novo sem alterar origem; falecidos congelam e pendências não inventam idade',()=>{
  const original=structuredClone(registry);
  const view=projectAgeDashboard(registry,1522,1523,2000);
  expect(view.totals.total).toBe(5);
  expect(view.totals.nobles).toBe(5);
  expect(view.totals.deceased).toBe(1);
  expect(view.totals.aged_nobles).toBe(3);
  expect(view.totals.pending).toBe(1);
  expect(view.characters.find(c=>c.id==='a')?.after_age.age).toBe(23);
  expect(view.characters.find(c=>c.id==='b')?.after_age.age).toBe(10);
  expect(view.characters.find(c=>c.id==='c')?.after_age.age).toBe(null);
  expect(registry).toEqual(original);
 });
 it('respeita a visibilidade do registro, da fonte e do próprio cadastro',()=>{
  const house=projectHouseAges(player,registry,records,'h1',1522);
  expect(house.map(x=>x.record_id)).toEqual([
   'record-a','record-b','record-c','record-d',
  ]);
  expect(projectHouseAges(gm,registry,records,'h1',1522)).toHaveLength(5);
  expect(()=>projectHouseAges({...player,memberHouseIds:[]},
    registry,records,'h1',1522)).toThrow('access_denied');
  expect(()=>projectHouseAges({...player,profile:'editor'},
    registry,records,'h1',1522)).toThrow('access_denied');
 });
 it('exige estágio privado reconciliado e contagens íntegras',async()=>{
  const good=inMemory();
  const stored=await readAgeRegistry(good.db,snapshot);
  expect(stored.characters).toHaveLength(5);
  await expect(readAgeRegistry(inMemory('bad').db,snapshot))
   .rejects.toThrow('character_source_not_reconciled');
  await expect(readAgeRegistry(inMemory('missing').db,snapshot))
   .rejects.toThrow('character_source_not_homologated');
 });
 it('histórico da virada só expõe versões e datas auditadas ao Narrador',async()=>{
  const mem=inMemory(),root='campaignCloudRuntime/'+snapshot;
  mem.values.set(root,{status:'active',private:true,
   sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,applicationEnabled:true});
  mem.values.set(root+'/characterYearTransitions/year-6-1522-1523',{
   id:'event-id',calendarVersion:6,fromYear:1522,toYear:1523,
   sourceSnapshotId:snapshot,
   actor:'narrator',createdAt:'2026-11-20T00:00:00.000Z'});
  const list=await listAgeTransitions(mem.db,snapshot,registry,30);
  expect(list).toMatchObject([{from_year:1522,to_year:1523,calendar_version:6}]);
 });
 it('deduplica a mesma virada importada e operacional, preferindo o recibo do Firebase',async()=>{
  const mem=inMemory(),root='campaignCloudRuntime/'+snapshot;
  mem.values.set(root,{status:'active',private:true,
   sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,applicationEnabled:true});
  mem.values.set(root+'/characterYearTransitions/year-6-1522-1523',{
   id:'operational-id',calendarVersion:6,fromYear:1522,toYear:1523,
   sourceSnapshotId:snapshot,actor:'narrator',
   createdAt:'2026-11-20T00:00:00.000Z'});
  const imported={...registry,transitions:[{
   id:'imported-id',calendarVersion:6,fromYear:1522,toYear:1523,
   actor:'narrator',createdAt:'2026-11-19T00:00:00.000Z'}]};
  const transitions=await listAgeTransitions(mem.db,snapshot,imported,30);
  expect(transitions).toHaveLength(1);
  expect(transitions[0].id).toBe('operational-id');
 });
 it('recusa uma transição de ano com vínculo de snapshot adulterado',async()=>{
  const mem=inMemory(),root='campaignCloudRuntime/'+snapshot;
  mem.values.set(root,{status:'active',private:true,
   sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,applicationEnabled:true});
  mem.values.set(root+'/characterYearTransitions/year-6-1522-1523',{
   id:'event-id',calendarVersion:6,fromYear:1522,toYear:1523,
   sourceSnapshotId:'outro-snapshot',actor:'narrator',
   createdAt:'2026-11-20T00:00:00.000Z'});
  await expect(listAgeTransitions(mem.db,snapshot,registry,30))
   .rejects.toThrow('character_transition_invalid');
 });

});

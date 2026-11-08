import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {
 DND_CORMYR_DEFAULT_FILTERS,DND_CORMYR_300_STORAGE_KEY,
 parseDndCormyr300,filterDndCormyr300,dndCormyrCreature,
 type DndCormyrCatalog,
} from '@/lib/crusade/dnd-cormyr-300';
import {DndCormyr300Library} from '@/components/battle/DndCormyr300Library';
import {dndBattleReady} from '@/lib/crusade/dnd-battle';
import {DND_DEFAULT_STACKS} from '@/lib/crusade/dnd-battle';
import {CRZ_TRAINING_DEFAULTS} from '@/lib/crusade/training-demo';
import {crzReplayBegin,crzVerifyReplay} from '@/lib/crusade/replay';

const groups=['Dragões','Goblinoides','Humanoides','Constructos','Mortos-vivos'] as const;
function fixture():string{
 const monsters=Array.from({length:300},(_,n)=>({
  id:'fixture-'+String(n+1).padStart(3,'0'),
  name:'Criatura '+String(n+1).padStart(3,'0'),
  group:groups[n%5],
  source:n%2?'MM':'XMM',
  challenge_rating:n%21,
  hp:8+n,
  ac:11+(n%9),
  size:(['T','S','M','L','H','G'] as const)[n%6],
  speed_ft:30,melee:{bonus:4,damage:'1d8+2',name:'Garra'},
  ranged:n%2?null:{bonus:5,damage:'1d6+2',name:'Flecha',range_ft:80},
  special_abilities:['descartar meias medidas'],review:'Criatura de demonstração.',
 }));
 return JSON.stringify({metadata:{catalog:'Teste 300',count:300,version:1,
  groups:{'Dragões':60,'Goblinoides':60,'Humanoides':60,'Constructos':60,'Mortos-vivos':60}},
  monsters});
}
afterEach(()=>{cleanup();window.localStorage.clear();vi.restoreAllMocks();});
describe('Cormyr 300: arquivo do usuário, grupos, ND, conversão básica',()=>{
 it('valida exatamente 300, preserva 5 grupos e filtra por todos os critérios',()=>{
  const catalog=parseDndCormyr300(fixture());
  expect(catalog.monsters).toHaveLength(300);
  expect(new Set(catalog.monsters.map(m=>m.id)).size).toBe(300);
  expect(filterDndCormyr300(catalog.monsters,{
   ...DND_CORMYR_DEFAULT_FILTERS,group:'Dragões'})).toHaveLength(60);
  expect(filterDndCormyr300(catalog.monsters,{
   ...DND_CORMYR_DEFAULT_FILTERS,type:'construct'})).toHaveLength(60);
  expect(filterDndCormyr300(catalog.monsters,{
   ...DND_CORMYR_DEFAULT_FILTERS,search:'criatura 001'})).toHaveLength(1);
  expect(filterDndCormyr300(catalog.monsters,{
   ...DND_CORMYR_DEFAULT_FILTERS,size:'G'})).toHaveLength(50);
  expect(filterDndCormyr300(catalog.monsters,{
   ...DND_CORMYR_DEFAULT_FILTERS,source:'XMM'})).toHaveLength(150);
  expect(filterDndCormyr300(catalog.monsters,{
   ...DND_CORMYR_DEFAULT_FILTERS,minCr:19,maxCr:20}).length).toBeGreaterThan(0);
  const sorted=filterDndCormyr300(catalog.monsters,{
   ...DND_CORMYR_DEFAULT_FILTERS,order:'cr-desc'});
  expect(sorted[0]!.challenge_rating).toBe(20);
 });
 it('converte em PV/CA/ataques e não executa habilidades especiais da fonte',()=>{
  const sample=parseDndCormyr300(fixture()).monsters[0]!;
  const creature=dndCormyrCreature(sample);
  expect(creature.hp.average).toBe(8);
  expect(creature.ac).toBe(11);
  expect(creature.attacks.map(a=>a.kind)).toEqual(['melee','ranged']);
  expect(creature.abilityMods.dex).toBe(0);
  expect(creature.traits).toEqual([]);
  expect(creature.multiattack.steps).toEqual([]);
  expect(creature.flags.caster).toBe(false);
  expect(creature.provenance).toMatchObject({
   origin:'5etools',srd:false,license:'local-unverified',
  });
  expect(creature.tags).toContain('Dragões');
 });
 it('corrige deslocamento 0 com voo provisório auditável e deslocamento válido na arena',()=>{
  const raw=parseDndCormyr300(fixture()).monsters[0]!;
  const immobile=dndCormyrCreature({...raw,speed_ft:0});
  expect(immobile.speedFt.walk).toBe(0);
  expect(immobile.speedFt.fly).toBe(30);
  expect(immobile.flags.flying).toBe(true);
  expect(immobile.tags).toContain('provisional-flight');
  expect(immobile.warnings.join(' ')).toMatch(/PROVISÓRIO/);
  const ready=dndBattleReady({...CRZ_TRAINING_DEFAULTS,
   resolution:'rolled',seed:'c0ffee52'},[
   DND_DEFAULT_STACKS[0]!,
   {id:'immobile',side:'defender',templateId:immobile.id,
    count:1,training:'trained'},
  ],[immobile]);
  const deployed=ready.stacks.find(s=>s.id==='immobile')!;
  expect(deployed.movementHex).toBe(3);
 });
 it('não converte disparo sem alcance em golpe com dano original; usa ataque básico temporário',()=>{
  const raw=parseDndCormyr300(fixture()).monsters[0]!;
  const uncertain=dndCormyrCreature({...raw,melee:null,
   ranged:{name:'Raio sem alcance',bonus:12,damage:'4d8+6',range_ft:null}});
  expect(uncertain.attacks).toHaveLength(1);
  expect(uncertain.attacks[0]).toMatchObject({
   id:'basic',name:'Ataque básico provisório',kind:'melee',toHit:0,reachFt:5,
   damage:[{dice:'1d4',mod:0,avg:2,type:'bludgeoning'}],
  });
  expect(uncertain.tags).toContain('provisional-attack');
  expect(uncertain.warnings.join(' ')).toMatch(/disparo ignorado|Disparo ignorado/);
  const ready=dndBattleReady({...CRZ_TRAINING_DEFAULTS,
   resolution:'rolled',seed:'c0ffee52'},[
   DND_DEFAULT_STACKS[0]!,
   {id:'ranged-unknown',side:'defender',templateId:uncertain.id,
    count:2,training:'trained'},
  ],[uncertain]);
  const deployed=ready.stacks.find(s=>s.id==='ranged-unknown')!;
  expect(deployed.meleeRoutine?.steps[0]?.attackId).toBe('basic');
  expect(deployed.rangedRoutine).toBeNull();
  expect(crzVerifyReplay(crzReplayBegin(ready).replay).ok).toBe(true);
 });
 it('preserva o ataque corpo a corpo real quando o único disparo está incompleto',()=>{
  const raw=parseDndCormyr300(fixture()).monsters[0]!;
  const converted=dndCormyrCreature({...raw,
   ranged:{name:'Raio sem alcance',bonus:12,damage:'4d8+6',range_ft:null}});
  expect(converted.attacks).toHaveLength(1);
  expect(converted.attacks[0]?.id).toBe('melee');
  expect(converted.attacks[0]?.toHit).toBe(4);
  expect(converted.warnings.join(' ')).toContain('Disparo ignorado');
 });
 it('recusa registros duplicados, ataques inválidos, contagem diferente e arquivos maiores',()=>{
  const parsed=JSON.parse(fixture());
  parsed.monsters[1].id=parsed.monsters[0].id;
  expect(()=>parseDndCormyr300(JSON.stringify(parsed))).toThrow(/duplicado/);
  parsed.monsters[1].id='fixture-002';
  parsed.monsters[1].melee.damage='1d20+9000';
  expect(()=>parseDndCormyr300(JSON.stringify(parsed))).toThrow();
  parsed.monsters[1].melee.damage='1d8+2';
  parsed.monsters.splice(1,1);
  expect(()=>parseDndCormyr300(JSON.stringify(parsed))).toThrow();
  expect(()=>parseDndCormyr300('x'.repeat(600001))).toThrow(/600 KB/);
 });
 it('usa criatura importada como pilha D&D com hash verificável e d20',()=>{
  const catalog=parseDndCormyr300(fixture());
  const monster=dndCormyrCreature(catalog.monsters[0]!);
  const ready=dndBattleReady({...CRZ_TRAINING_DEFAULTS,resolution:'rolled',
   seed:'c0ffee52'},[
   DND_DEFAULT_STACKS[0]!,
   {id:'enemy-fixture',side:'defender',templateId:monster.id,
    count:7,training:'trained'},
  ],[monster]);
  const stack=ready.stacks.find(s=>s.id==='enemy-fixture')!;
  expect(stack.initialCount).toBe(7);
  expect(stack.hpPerCreature).toBe(8);
  expect(stack.hpPool).toBe(56);
  expect(stack.source.kind).toBe('monster-library');
  expect(stack.meleeRoutine).toBeTruthy();
  expect(crzVerifyReplay(crzReplayBegin(ready).replay).ok).toBe(true);
 });
});
describe('Cormyr 300: filtros e adição a exércitos pela interface',()=>{
 it('recupera catálogo privado e permite filtrar e adicionar pilha com quantidade',()=>{
  const original=parseDndCormyr300(fixture());
  window.localStorage.setItem(DND_CORMYR_300_STORAGE_KEY,JSON.stringify(original));
  const onCatalog=vi.fn(),onAdd=vi.fn();
  render(<DndCormyr300Library onCatalog={onCatalog} onAdd={onAdd}
   sideCounts={{attacker:2,defender:2}}/>);
  expect(onCatalog).toHaveBeenCalledOnce();
  expect(screen.getByText(/300 criaturas carregadas/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Filtrar grupo Cormyr'),
   {target:{value:'Mortos-vivos'}});
  expect(screen.getByText(/60 resultados do filtro/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar monstro Cormyr'),
   {target:{value:'Criatura 005'}});
  const table=screen.getByRole('region',{name:'Resultados do bestiário Cormyr'});
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Quantidade para adicionar monstro'),
   {target:{value:'13'}});
  fireEvent.click(within(table).getByRole('button',{name:/Adicionar Criatura 005 ao defensor/}));
  expect(onAdd).toHaveBeenCalledWith('cy-fixture-005|local','Criatura 005','defender',13);
 });
});

import {describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';
import {dndBattleReady,DND_DEFAULT_STACKS} from '@/lib/crusade/dnd-battle';
import {dndCormyrCreature,parseDndCormyr300,parseDndCustomMonster,
 applyDndCombatOverrides,type DndCormyrMonster} from '@/lib/crusade/dnd-cormyr-300';
import {DND_MILITARY_CREATURES} from '@/lib/crusade/dnd-military';
import {DndDeploymentGrid} from '@/components/battle/DndDeploymentGrid';
import {crzScenario,crzFootprintCells,crzFootprintDistance,
 crzReachable} from '@/lib/crusade/geometry';
import {crzReplayBegin,crzVerifyReplay,crzReplayRecord} from '@/lib/crusade/replay';
import {isDndV3,isDndBattle} from '@/lib/crusade/dnd-mode';
import {CRZ_TRAINING_DEFAULTS} from '@/lib/crusade/training-demo';

const monster=(id:string,opts:Partial<DndCormyrMonster>={}):DndCormyrMonster=>({
 id,name:id,group:'Dragões',source:'Manual autorizado',challenge_rating:2,
 hp:24,ac:14,size:'M',speed_ft:30,
 melee:{name:'Golpe',bonus:5,damage:'2d6+3'},ranged:null,
 ...opts,
});
const readyOpts={...CRZ_TRAINING_DEFAULTS,seed:'feedbabe',
 resolution:'rolled' as const,opponent:'human' as const};
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('Lote 2: dados verificados e catálogo versionado',()=>{
 it('V2 adiciona criaturas originais sem modificar os 300 legados',()=>{
  const base=Array.from({length:300},(_,i)=>monster('fixture-'+i));
  const v1={metadata:{catalog:'Teste',count:300,version:1},monsters:base};
  const parsed=parseDndCormyr300(JSON.stringify(v1));
  expect(parsed.monsters).toHaveLength(300);
  const extra=parseDndCustomMonster(monster('custom-nova'));
  const v2={metadata:{catalog:'Teste V2',count:301,version:2},
   monsters:[...base,extra]};
  expect(parseDndCormyr300(JSON.stringify(v2)).monsters).toHaveLength(301);
  expect(()=>parseDndCormyr300(JSON.stringify({
   ...v2,metadata:{...v2.metadata,version:1}}))).toThrow();
  expect(()=>parseDndCormyr300(JSON.stringify({
   ...v2,metadata:{...v2.metadata,count:300}}))).toThrow();
 });
 it('DES, dano e voo provêm do override auditável, não de suposições',()=>{
  const base=Array.from({length:300},(_,i)=>monster('fixture-'+i));
  const v1=parseDndCormyr300(JSON.stringify({
   metadata:{catalog:'Teste',count:300,version:1},monsters:base,
  }));
  const amended=applyDndCombatOverrides(v1,[{monsterId:'fixture-0',patch:{
   dex_mod:3,fly_ft:45,melee_damage_type:'fire',review_source:'Manual autorizado',
  }}]);
  expect(v1.monsters[0]!.dex_mod).toBeUndefined();
  const converted=dndCormyrCreature(amended.monsters[0]!);
  expect(converted.abilityMods.dex).toBe(3);
  expect(converted.speedFt.fly).toBe(45);
  expect(converted.attacks[0]!.damage[0]!.type).toBe('fire');
  expect(converted.warnings.join(' ')).toMatch(/Manual autorizado/);
  expect(dndCormyrCreature(v1.monsters[0]!).warnings.join(' '))
   .toMatch(/concussão neutra provisória/i);
 });
});
describe('Lote 3: identidade do motor, tamanho, voo e implantação',()=>{
 it('V3 guarda perfil explícito e não reinterpreta replay V2',()=>{
  const ready=dndBattleReady(readyOpts,DND_DEFAULT_STACKS);
  expect(ready.simulationProfile).toBe('dnd-v3');
  expect(isDndV3(ready)).toBe(true);
  expect(crzVerifyReplay(crzReplayBegin(ready).replay).ok).toBe(true);
  const {simulationProfile:_,...legacy}=ready;
  const replay=crzReplayBegin({...legacy,id:'dnd-training-v2-feedbabe'});
  expect(isDndBattle(replay.state)).toBe(true);
  expect(isDndV3(replay.state)).toBe(false);
  expect(crzVerifyReplay(replay.replay).ok).toBe(true);
 });
 it('Grande/Enorme/Gargantuesco ocupam 2x2/3x3/4x4 e usam bordas',()=>{
  const map=crzScenario('plain-open',11,'square');
  expect(crzFootprintCells(map,{q:1,r:4},'L')).toHaveLength(4);
  expect(crzFootprintCells(map,{q:1,r:4},'H')).toHaveLength(9);
  expect(crzFootprintCells(map,{q:1,r:4},'G')).toHaveLength(16);
  expect(crzFootprintDistance(map,{q:1,r:4},'G',
   {q:4,r:4},'M')).toBe(1);
 });
 it('não deixa duas pilhas ocuparem a mesma área de criatura grande',()=>{
  const giant=dndCormyrCreature(monster('giant-test',{size:'G'}));
  const stacks=[
   {id:'giant-a',templateId:giant.id,side:'attacker' as const,
    count:1,training:'trained' as const,position:{q:1,r:4}},
   {id:'infantry-a',templateId:DND_DEFAULT_STACKS[0]!.templateId,
    side:'attacker' as const,count:4,training:'trained' as const,
    position:{q:2,r:4}},
   {id:'defender',templateId:DND_DEFAULT_STACKS[2]!.templateId,
    side:'defender' as const,count:4,training:'trained' as const},
  ];
  expect(()=>dndBattleReady(readyOpts,stacks,[giant])).toThrow(/sobreposta|bloqueada/);
 });
 it('voo ignora barreiras, mas nunca pousa sobre a área de outra pilha',()=>{
  const map=crzScenario('plain-open',11,'square');
  const blockedMap={...map,tiles:map.tiles.map(t=>
   t.q===4?{...t,terrain:'rock' as const}:t)};
  const occupied=[{q:6,r:4}];
  const flying=crzReachable(blockedMap,{q:2,r:4},5,occupied,[],true,'L');
  expect(flying.some(p=>p.to.q===5&&p.to.r===4)).toBe(false);
  expect(flying.some(p=>p.to.q===4&&p.to.r===4)).toBe(true);
  const walking=crzReachable(blockedMap,{q:2,r:4},5,occupied,[],false,'L');
  expect(walking.some(p=>p.to.q===4&&p.to.r===4)).toBe(false);
 });
 it('replay aceita posicionamento manual legal, mantém ataque e estado auditável',()=>{
  const ready=dndBattleReady(readyOpts,[
   {...DND_DEFAULT_STACKS[0]!,position:{q:1,r:4}},
   {...DND_DEFAULT_STACKS[2]!,position:{q:9,r:4}},
  ]);
  const session=crzReplayBegin(ready);
  expect(session.state.stacks.find(s=>s.id==='army-infantry')?.position)
   .toEqual({q:1,r:4});
  const id=session.state.activeStackId!;
  const updated=crzReplayRecord(session,{type:'END_ACTIVATION',unitId:id},'human');
  expect(crzVerifyReplay(updated.replay).ok).toBe(true);
 });
 it('apresenta quadrados legais por lado no editor manual',()=>{
  const map=crzScenario('plain-open',11,'square');
  const onPlace=vi.fn(),onSelected=vi.fn();
  render(<DndDeploymentGrid map={map} drafts={DND_DEFAULT_STACKS}
   creatures={DND_MILITARY_CREATURES}
   selectedId="army-infantry" onSelected={onSelected} onPlace={onPlace}/>);
  const square=screen.getByRole('button',{name:'Quadrado 1, 4: livre'});
  fireEvent.click(square);
  expect(onPlace).toHaveBeenCalledWith('army-infantry',{q:1,r:4});
  expect(screen.getByRole('button',{name:'Quadrado 5, 4: indisponível'}))
   .toBeDisabled();
 });
});

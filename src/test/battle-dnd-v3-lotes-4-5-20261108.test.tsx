import {describe,expect,it,vi,afterEach} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {DndDeploymentGrid} from '@/components/battle/DndDeploymentGrid';
import {dndBattleReady,DND_DEFAULT_STACKS} from '@/lib/crusade/dnd-battle';
import {dndCormyrCreature} from '@/lib/crusade/dnd-cormyr-300';
import {DND_MILITARY_CREATURES} from '@/lib/crusade/dnd-military';
import {crzScenario,crzLineOfSight,crzFootprintLineOfSight,
 crzValidateMap} from '@/lib/crusade/geometry';
import {crzStart,crzLegalCommands} from '@/lib/crusade/turns';
import {CRZ_TRAINING_DEFAULTS} from '@/lib/crusade/training-demo';

afterEach(()=>{cleanup();vi.restoreAllMocks();});
const options={...CRZ_TRAINING_DEFAULTS,seed:'dadf00d0',
 resolution:'rolled' as const,opponent:'human' as const};
const flying=dndCormyrCreature({
 id:'test-voador',name:'Voador de teste',group:'Dragões',
 source:'Original do teste',challenge_rating:1,
 hp:20,ac:12,size:'M',speed_ft:0,fly_ft:40,
 melee:{name:'Garras',bonus:4,damage:'1d6+2'},ranged:null,
});
describe('D&D V3: lote 4, linha de visão de criaturas multicélula',()=>{
 it('permite raio desobstruído de uma borda, sem liberar tiro por muralha',()=>{
  const map=crzScenario('plain-open',11,'square');
  const block={...map,tiles:map.tiles.map(t=>
   t.q===5&&t.r===4?{...t,terrain:'rock' as const}:t)};
  expect(crzLineOfSight(block,{q:2,r:4},{q:8,r:4})).toBe(false);
  expect(crzFootprintLineOfSight(block,{q:2,r:4},'L',
   {q:8,r:4},'L')).toBe(true);
  const wall={...map,tiles:map.tiles.map(t=>
   t.q===5?{...t,terrain:'rock' as const}:t)};
  expect(crzFootprintLineOfSight(wall,{q:2,r:4},'L',
   {q:8,r:4},'L')).toBe(false);
 });
});
it('ações reais respeitam raios de borda, muralha e distância ilimitada',()=>{
 const archer=dndCormyrCreature({
  id:'archer-large',name:'Arqueiro gigante de teste',group:'Humanoides',
  source:'Original do teste',challenge_rating:2,hp:40,ac:13,
  size:'L',speed_ft:30,
  melee:null,ranged:{name:'Arco',bonus:5,damage:'1d8+2'},
 });
 const drafts=[
  {id:'archer-large-stack',side:'attacker' as const,templateId:archer.id,
   count:1,training:'trained' as const,position:{q:1,r:4}},
  {...DND_DEFAULT_STACKS[2]!,position:{q:9,r:4}},
 ];
 const ready=dndBattleReady(options,drafts,[archer]);
 const map=ready.map;
 const partiallyBlocked={...map,tiles:map.tiles.map(t=>
  t.q===5&&t.r===4?{...t,terrain:'rock' as const}:t)};
 const begin=crzStart({...ready,map:partiallyBlocked});
 const active={...begin,activeStackId:'archer-large-stack'};
 const canShoot=(state:typeof active)=>crzLegalCommands(state).some(cmd=>
  cmd.type==='ATTACK'&&cmd.unitId==='archer-large-stack'&&
  cmd.targetId===drafts[1]!.id&&cmd.mode==='ranged');
 expect(canShoot(active)).toBe(true);
 const wall={...map,tiles:map.tiles.map(t=>
  t.q===5?{...t,terrain:'rock' as const}:t)};
 expect(canShoot({...active,map:wall})).toBe(false);
});
describe('D&D V3: lote 5, implantação sobre barreiras para voadores',()=>{
 it('zona rochosa é válida apenas no mapa D&D, sem mudar regras legadas',()=>{
  const map=crzScenario('plain-open',11,'square');
  const rocky={...map,tiles:map.tiles.map(t=>
   t.q===1&&t.r===4?{...t,terrain:'rock' as const}:t)};
  expect(()=>crzValidateMap(rocky)).toThrow(/rochosa/);
  expect(()=>crzValidateMap(rocky,true)).toThrow(/rochosa/);
  expect(()=>crzValidateMap(rocky,true,true)).not.toThrow();
  const drafts=[
   {id:'flyer',side:'attacker' as const,templateId:flying.id,
    count:1,training:'trained' as const,position:{q:1,r:4}},
   {...DND_DEFAULT_STACKS[2]!,position:{q:9,r:4}},
  ];
  const ready=dndBattleReady(options,drafts,[flying]);
  expect(()=>crzStart({...ready,map:rocky})).not.toThrow();
  const walkerReady=dndBattleReady(options,[
   {...drafts[0]!,templateId:DND_DEFAULT_STACKS[0]!.templateId},drafts[1]!,
  ]);
  expect(()=>crzStart({...walkerReady,map:rocky})).toThrow(/caminhável|bloqueada/);
  render(<DndDeploymentGrid map={rocky} drafts={drafts}
   creatures={[flying,...DND_MILITARY_CREATURES]}
   selectedId="flyer" onSelected={vi.fn()} onPlace={vi.fn()}/>);
  expect(screen.getByRole('button',{name:'Quadrado 1, 4: livre'})).toBeEnabled();
 });
});

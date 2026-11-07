import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {previewBattleMapGridConversion,convertBattleMapGrid}
 from '@/lib/battle/geometry/map-conversion';
import {validateBattleMap} from '@/lib/battle/geometry/map-validation';
import {findPath} from '@/lib/battle/geometry/pathfinding';
import {makeBattleSetup,makeFictionalStack} from '@/lib/battle/domain/setup';
import {startBattle,applyBattleCommand,getLegalActions}
 from '@/lib/battle/domain/turns';
import {battleHash,captureReplay,verifyReplay}
 from '@/lib/battle/domain/replay';
import {parseBattleMapJson,serializeBattleMap}
 from '@/lib/battle/serialization/map-io';
import {BattleMapEditor} from '@/components/battle/BattleMapEditor';
import {crzScenario,crzValidateMap,crzReachable,crzGridDistance}
 from '@/lib/crusade/geometry';
import {crzTrainingReady,CRZ_TRAINING_DEFAULTS}
 from '@/lib/crusade/training-demo';
import {crzReplayBegin,crzReplayRecord,crzVerifyReplay}
 from '@/lib/crusade/replay';
import {crzLegalCommands} from '@/lib/crusade/turns';

describe('Cormyr · Lotes 3 e 4 · migração segura e replay',()=>{
 it('converte mapas personalizados sem perder terrenos, zonas ou metadados',()=>{
  for(const width of [11,15] as const){
   const base=createScenario('contested-woods',width,'hex');
   const marked={...base,id:'terras-evenhand',label:'Mapa personalizado de Hillmarch',
    tiles:base.tiles.map((t,i)=>i===25?{...t,terrain:'hill' as const}:t)};
   const preview=previewBattleMapGridConversion(marked,'square');
   expect(preview.issues).toEqual([]);
   expect(preview.tilesPreserved).toBe(marked.tiles.length);
   expect(preview.attackerZonesPreserved).toBe(marked.deployment.attacker.length);
   expect(preview.defenderZonesPreserved).toBe(marked.deployment.defender.length);
   expect(preview.repositionedCoordinates).toBeGreaterThan(0);
   const square=convertBattleMapGrid(marked,'square');
   expect(square.grid).toBe('square');
   expect(square.id).toBe(marked.id);
   expect(square.label).toBe(marked.label);
   expect(parseBattleMapJson(serializeBattleMap(square))).toEqual(square);
   expect(convertBattleMapGrid(square,'hex')).toEqual(marked);
  }
 });
 it('bloqueia conversão incompleta sem alterar a origem',()=>{
  const old=createScenario('plain-open',11,'hex');
  const malformed={...old,tiles:old.tiles.slice(1)};
  const snapshot=JSON.stringify(malformed);
  expect(previewBattleMapGridConversion(malformed,'square').issues).not.toHaveLength(0);
  expect(()=>convertBattleMapGrid(malformed,'square')).toThrow(/bloqueada/i);
  expect(JSON.stringify(malformed)).toBe(snapshot);
 });
 it('identifica falsas passagens conectadas apenas por cantos bloqueados',()=>{
  const square=createScenario('plain-open',11,'square');
  const bridge=new Set(['2,1','3,2','4,3','5,4','6,3','7,2','8,1']);
  const terrain=square.tiles.map(t=>({
   ...t,terrain:(t.q<=1||t.q>=9||bridge.has(t.q+','+t.r))?
    'plain' as const:'rock' as const,
  }));
  const disconnected={...square,tiles:terrain};
  expect(validateBattleMap(disconnected)).toContain('Não existe caminho caminhável entre as zonas');
  const crz=crzScenario('plain-open',11,'square');
  const cut={...crz,tiles:crz.tiles.map(t=>({
   ...t,terrain:(t.q<=1||t.q>=9||bridge.has(t.q+','+t.r))?
    'plain' as const:'rock' as const,
  }))};
  expect(()=>crzValidateMap(cut)).toThrow(/desconectados/);
 });
 it('custo diagonal e bloqueio por unidade são iguais no caminho e na validação',()=>{
  const map=createScenario('plain-open',11,'square');
  const from={q:2,r:2},to={q:3,r:3};
  expect(findPath(map,from,to,2)?.cost).toBe(1.5);
  const blocked=findPath(map,from,to,2,{occupied:[{q:3,r:2}]});
  expect(blocked?.cost).not.toBe(1.5);
 });
 it('editor apresenta prévia e aplica somente conversão validada',()=>{
  const map=createScenario('contested-woods',11,'hex');
  const onChange=vi.fn();
  render(<BattleMapEditor map={map} onChange={onChange}/>);
  fireEvent.click(screen.getByRole('button',{name:'Pré-visualizar conversão de malha'}));
  const preview=screen.getByRole('region',{name:'Prévia de conversão de malha'});
  expect(preview).toHaveTextContent('99 terrenos');
  expect(preview).toHaveTextContent('zonas A');
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Aplicar conversão validada'}));
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange.mock.calls[0]?.[0].grid).toBe('square');
  expect(map.grid).toBeUndefined();
 });
 it('PTE: replay quadrado verifica diagonal fracionária e não altera replays hex',()=>{
  const setup=(grid:'hex'|'square')=>{
   const map=createScenario('plain-open',11,grid);
   const position=(side:'attacker'|'defender')=>{
    const zone=map.deployment[side];
    return zone.find(p=>(grid==='square'?p.q:
     p.q+Math.floor((p.r-(p.r&1))/2))===(side==='attacker'?1:9))!;
   };
   const stacks=(['attacker','defender'] as const).map(side=>
    makeFictionalStack({id:side,name:side==='attacker'?'Aliados':'Adversários',
     side,typeId:'infantry',training:'trained',count:20,position:position(side)}));
   return makeBattleSetup({id:'replay-'+grid,name:'Simulação por malha',
    seed:'replay-grid-2026',map,
    controls:{attacker:'human',defender:'human'},stacks});
  };
  const square=setup('square');
  const state=startBattle(square);
  const active=state.stacks.find(s=>s.id===state.activeUnitId)!;
  const legal=getLegalActions(state);
  const move=legal.find(c=>c.type==='MOVE'&&
   c.to.r===active.position.r+1&&Math.abs(c.to.q-active.position.q)===1);
  expect(move).toBeDefined();
  if(!move||move.type!=='MOVE')throw new Error('Movimento diagonal indisponível.');
  const next=applyBattleCommand(state,move);
  expect(next.events.at(-1)?.delta['cost']).toBe(1.5);
  const replay=captureReplay(square,[move]);
  expect(verifyReplay(replay).state).toEqual(next);
  expect(battleHash(next)).toMatch(/^[a-f0-9]{64}$/);
  const hex=setup('hex');
  const hexReplay=captureReplay(hex,[]);
  expect(verifyReplay(hexReplay).state).toEqual(startBattle(hex));
  expect(hexReplay.initial.map.grid).toBeUndefined();
 });
 it('CRZ: distancia diagonal, movimento e replay square são determinísticos',()=>{
  const ready=crzTrainingReady({...CRZ_TRAINING_DEFAULTS,grid:'square',opponent:'human'});
  const one=crzReplayBegin(ready),two=crzReplayBegin(ready);
  const actor=one.state.stacks.find(s=>s.id===one.state.activeStackId)!;
  const move=crzLegalCommands(one.state).find(c=>c.type==='MOVE');
  expect(move).toBeDefined();
  if(!move)throw new Error('Treino CRZ sem movimento');
  const moved=crzReplayRecord(one,move,'human');
  const repeated=crzReplayRecord(two,move,'human');
  expect(moved.replay).toEqual(repeated.replay);
  expect(crzVerifyReplay(moved.replay).ok).toBe(true);
  expect(crzGridDistance(ready.map,{q:3,r:3},{q:4,r:4})).toBe(1);
  expect(crzReachable(ready.map,{q:3,r:3},2)
   .find(p=>p.to.q===4&&p.to.r===4)?.cost).toBe(1.5);
  expect(['attacker','defender']).toContain(actor.side);
 });
});

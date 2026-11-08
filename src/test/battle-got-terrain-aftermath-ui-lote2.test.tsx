import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {
 terrainAt,terrainCoverBonus,terrainMoveCost,movementSlow,visibilityPenalty,
} from '@/lib/battle/got/terrain';
import {createWarBattle,issueWarOrder,previewWarMovement} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {previewWarAftermath} from '@/lib/battle/got/aftermath';
import {BattleGotGame} from '@/components/battle/BattleGotGame';
import {GOT_LAB_SAVE_KEY,encodeGotLabSave} from '@/lib/battle/got/lab-save';

const army=(id:string,side:'attacker'|'defender',x:number,y:number,
 type:'infantry'|'archers'='infantry')=>
 modelWarUnit({id,name:id,side,position:{x,y},typeId:type});
const make=(terrain:'plain'|'dense-forest'='plain')=>
 createWarBattle({id:'terrain2',name:'Ensaio terreno',seed:'terrain-cover-comparison',
 width:12,height:7,units:[
  {...army('a','attacker',2,2,'archers'),discipline:0},
  {...army('d','defender',3,2),discipline:0},
 ],commanders:modelWarCommanders({attacker:12,defender:12}),
 tiles:terrain==='plain'?[]:[{x:3,y:2,terrain}],
 });
afterEach(()=>{cleanup();vi.restoreAllMocks();window.localStorage.clear();});

describe('P1 — terreno, clima, proteção e caminho consistente',()=>{
 it('chuva intensa: -2 no ataque, sem penalidade automática de pouca luz ou terreno',()=>{
  const stream={x:2,y:2,terrain:'stream' as const};
  const forest={x:2,y:2,terrain:'dense-forest' as const};
  expect(visibilityPenalty('clear','heavy-rain',true)).toBe(0);
  expect(movementSlow(stream,'clear','heavy-rain')).toBe(1);
  expect(terrainMoveCost(stream,'clear','heavy-rain')).toBe(2);
  expect(movementSlow({x:0,y:0,terrain:'hill'},'clear','light-snow')).toBe(1);
  expect(terrainCoverBonus(forest,true,false)).toBe(0);
  expect(terrainCoverBonus(forest,false,false)).toBe(0);
  expect(terrainCoverBonus(forest,false,true)).toBe(5);
  expect(terrainAt([],{x:10,y:10}).terrain).toBe('plain');
 });
 it('atiradores não recebem cobertura sem a ordem Defender (Tabela 10-3)',()=>{
  const plain={...make('plain'),turn:'attacker' as const};
  const forest={...make('dense-forest'),turn:'attacker' as const};
  const command={commanderId:'leader-attacker',unitId:'a',order:{
   kind:'attack' as const,targetId:'d',ranged:true,
  }};
  const plainResult=issueWarOrder(plain,command).battle;
  const forestResult=issueWarOrder(forest,command).battle;
  const plainRoll=plainResult.events.find(e=>e.kind==='attack')!;
  const forestRoll=forestResult.events.find(e=>e.kind==='attack')!;
  expect(forestRoll.difficulty).toBe(plainRoll.difficulty);
  expect(forest.units.find(u=>u.id==='d')?.defendRoll).toBeNull();
 });
 it('prévia de marcha usa o mesmo caminho da execução e não altera a batalha',()=>{
  const a=army('a','attacker',1,2);
  const d=army('d','defender',9,2);
  const b={...createWarBattle({id:'move2',name:'Rota',seed:'move2',
   width:12,height:7,units:[{...a,discipline:0},d],
   commanders:modelWarCommanders({attacker:12,defender:12}),
   tiles:[{x:2,y:2,terrain:'hill'}],
  }),turn:'attacker' as const};
  const original=JSON.stringify(b);
  const preview=previewWarMovement(b,'a',{x:2,y:2});
  expect(preview.legal).toBe(true);
  expect(preview.path).toEqual([{x:2,y:2}]);
  expect(preview.distanceMetres).toBe(10);
  expect(preview.costMetres).toBe(20);
  expect(preview.budgetMetres).toBeGreaterThanOrEqual(20);
  const performed=issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'move',to:{x:2,y:2}}});
  expect(performed.passed).toBe(true);
  expect(performed.battle.units.find(u=>u.id==='a')?.position).toEqual({x:2,y:2});
  expect(JSON.stringify(b)).toBe(original);
  expect(previewWarMovement(b,'a',{x:30,y:2}).legal).toBe(false);
 });
});

describe('P1 — resultado militar transparente sem gravar Casas',()=>{
 it('explica Glória e sobrevivência individual com graduação sugerida',()=>{
  const b=make('plain');
  const finished={...b,phase:'finished' as const,winner:'attacker' as const,
   units:b.units.map(u=>u.id==='d'?{...u,condition:'destroyed' as const,health:0}:u)};
  const before=JSON.stringify(finished);
  const proposal=previewWarAftermath(finished);
  expect(proposal.glory.attacker).toBe(
   proposal.gloryBreakdown.attacker.victory+
   proposal.gloryBreakdown.attacker.outnumberedBonus+
   proposal.gloryBreakdown.attacker.defeatConsolation,
  );
  expect(proposal.summary.defender.destroyedInBattle).toBe(1);
  expect(proposal.summary.defender.originalUnits).toBe(1);
  expect(proposal.survivors.every(u=>u.requiresNarratorApproval)).toBe(true);
  expect(proposal.survivors.every(u=>['green','trained','veteran','elite','destroyed']
   .includes(u.proposedTraining))).toBe(true);
  expect(proposal.appliedToHouse).toBe(false);
  expect(JSON.stringify(finished)).toBe(before);
 });
});

describe('P1 — interface de jogabilidade e revisão',()=>{
 it('amplia o tabuleiro, exibe inspeção de terreno e filtra o histórico',()=>{
  render(<BattleGotGame onBack={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Clima'),{target:{value:'heavy-rain'}});
  fireEvent.click(screen.getByRole('button',{name:/Iniciar simulação pelo livro/}));
  const map=screen.getByRole('region',{name:/Mapa em quadrados/});
  expect(within(map).getByText(/Cobertura ao Defender/)).toBeInTheDocument();
  expect(within(map).getByText(/Clima\/visibilidade/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Ampliar o mapa de batalha/}));
  expect(screen.getByRole('button',{name:/Restaurar painel lado a lado/})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Ordem do livro'),{target:{value:'move'}});
  expect(within(map).getByText(/Rota disponível:|Destino indisponível:/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Filtrar histórico'),{target:{value:'dice'}});
  expect(screen.getByText(/Mostrando as últimas/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Restaurar painel lado a lado/}));
  expect(screen.getByRole('button',{name:/Ampliar o mapa de batalha/})).toBeInTheDocument();
 });
 it('retoma batalha finalizada e permite filtrar o relatório de sobreviventes',()=>{
  const base=make('plain');
  const done={...base,phase:'finished' as const,winner:'attacker' as const,
   units:base.units.map(u=>u.id==='d'?{...u,condition:'destroyed' as const,health:0}:u)};
  window.localStorage.setItem(GOT_LAB_SAVE_KEY,encodeGotLabSave(done));
  render(<BattleGotGame onBack={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Retomar simulação salva'}));
  const result=screen.getByRole('region',{name:'Prévia de sobreviventes'});
  expect(within(result).getAllByText(/balanço militar/)).toHaveLength(2);
  fireEvent.change(within(result).getByLabelText('Filtrar resultados das tropas'),
   {target:{value:'defender'}});
  expect(within(result).getByText(/Treinamento:/)).toBeInTheDocument();
  expect(within(result).getByText(/decisão pendente do Narrador/)).toBeInTheDocument();
 });
});

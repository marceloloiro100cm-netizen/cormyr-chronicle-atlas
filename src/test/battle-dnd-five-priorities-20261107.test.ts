import {describe,expect,it} from 'vitest';
import {dndBattleReady,DND_DEFAULT_STACKS} from '@/lib/crusade/dnd-battle';
import {CRZ_TRAINING_DEFAULTS} from '@/lib/crusade/training-demo';
import {crzScenario,crzReachable,crzGridDistance} from '@/lib/crusade/geometry';
import {crzLegalCommands} from '@/lib/crusade/turns';
import {crzReplayBegin,crzReplayRecord,crzVerifyReplay} from '@/lib/crusade/replay';
import {crzCapable} from '@/lib/crusade/battle-state';
import {isDndBattle} from '@/lib/crusade/dnd-mode';

function sample(){
 const ready=dndBattleReady({...CRZ_TRAINING_DEFAULTS,resolution:'rolled',
  opponent:'human',seed:'c0ffee52'},DND_DEFAULT_STACKS);
 return crzReplayBegin(ready);
}
describe('D&D Cormyr: regras do Narrador e replay verificável',()=>{
 it('voo atravessa rochas/florestas e tropas, sem encerrar numa tropa ocupada',()=>{
  const original=crzScenario('plain-open',11,'square');
  const map={...original,tiles:original.tiles.map(t=>
   t.r===4&&t.q>=3&&t.q<=4?{...t,terrain:'rock' as const}:t)};
  const from={q:2,r:4},goal={q:5,r:4},occupied={q:3,r:4};
  const ground=crzReachable(map,from,3,[occupied],[]);
  expect(ground.some(p=>p.to.q===goal.q&&p.to.r===goal.r)).toBe(false);
  const flight=crzReachable(map,from,3,[occupied],[],true);
  expect(flight.some(p=>p.to.q===goal.q&&p.to.r===goal.r)).toBe(true);
  expect(flight.some(p=>p.to.q===occupied.q&&p.to.r===occupied.r)).toBe(false);
 });
 it('ataque à distância pode atingir além de seis quadrados com linha de visão',()=>{
  let session=sample();
  for(let i=0;i<30;i++){
   const unit=session.state.stacks.find(s=>s.id===session.state.activeStackId);
   if(unit?.id==='army-archers')break;
   if(!session.state.activeStackId)throw Error('Unidade ativa ausente');
   session=crzReplayRecord(session,{
    type:'END_ACTIVATION',unitId:session.state.activeStackId});
  }
  expect(isDndBattle(session.state)).toBe(true);
  const archer=session.state.stacks.find(s=>s.id==='army-archers')!;
  const enemy=session.state.stacks.find(s=>s.side==='defender'&&crzCapable(s))!;
  expect(crzGridDistance(session.state.map,archer.position,enemy.position)).toBeGreaterThan(6);
  expect(crzLegalCommands(session.state).some(c=>
   c.type==='ATTACK'&&c.mode==='ranged'&&c.targetId===enemy.id)).toBe(true);
 });
 it('registra mudança de quantidade, reforço e retirada sem falsificar baixas',()=>{
  let session=sample();
  const active=session.state.activeStackId!;
  const target=session.state.stacks.find(s=>s.id!==active)!;
  const before=target.alive;
  session=crzReplayRecord(session,{type:'DND_SET_COUNT',unitId:active,
   targetId:target.id,count:before+3},'human');
  expect(session.state.stacks.find(s=>s.id===target.id)?.alive).toBe(before+3);
  const template=session.state.stacks.find(s=>s.id===active)!.template;
  session=crzReplayRecord(session,{type:'DND_ADD_STACK',unitId:active,
   stackId:'dnd-test-reinforcement',side:'attacker',count:2,template},'human');
  expect(session.state.stacks.find(s=>s.id==='dnd-test-reinforcement')?.alive).toBe(2);
  session=crzReplayRecord(session,{type:'DND_WITHDRAW',unitId:active,
   targetId:'dnd-test-reinforcement'},'human');
  const withdrawn=session.state.stacks.find(s=>s.id==='dnd-test-reinforcement')!;
  expect(withdrawn.alive).toBe(2);
  expect(crzCapable(withdrawn)).toBe(false);
  expect(session.state.events.some(e=>e.type==='DND_STACK_ADDED')).toBe(true);
  expect(session.state.events.some(e=>e.type==='DND_STACK_WITHDRAWN')).toBe(true);
  expect(crzVerifyReplay(session.replay).ok).toBe(true);
 });
 it('não encerra automaticamente por dois turnos sem dano; permite fim pelo Narrador',()=>{
  let session=sample();
  for(let i=0;i<22;i++){
   if(session.state.round>=3)break;
   session=crzReplayRecord(session,{type:'END_ACTIVATION',
    unitId:session.state.activeStackId!},'human');
  }
  expect(session.state.round).toBeGreaterThanOrEqual(3);
  expect(session.state.phase).toBe('active');
  session=crzReplayRecord(session,{type:'DND_END_BATTLE',
   unitId:session.state.activeStackId!,winner:'attacker'},'human');
  expect(session.state.phase).toBe('completed');
  expect(session.state.resultReason).toBe('narrator-end');
  expect(crzVerifyReplay(session.replay).ok).toBe(true);
 });
 it('rejeita ajuste inválido e não disponibiliza magia ou poderes de Cruzada',()=>{
  const session=sample(),unitId=session.state.activeStackId!;
  expect(crzLegalCommands(session.state).filter(c=>
   c.type==='ABILITY'||c.type==='CAST')).toHaveLength(0);
  expect(()=>crzReplayRecord(session,{type:'DND_SET_COUNT',
   unitId,targetId:'army-infantry',count:1001},'human')).toThrow();
  expect(()=>crzReplayRecord(session,{type:'DND_ADD_STACK',unitId,
   stackId:'bad',side:'attacker',count:1001,
   template:session.state.stacks[0]!.template},'human')).toThrow();
 });
});

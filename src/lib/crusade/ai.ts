/** IA de treinamento CRZ Lote 4: determinística, sem efeitos externos.
 * Não usa redutor PTE nem acelera o tempo da campanha.
 */
import {crzLegalCommands,crzPlay,type CrzCommand} from './turns';
import {crzGridDistance} from './geometry';
import {crzCapable,type CrzBattleState} from './battle-state';

export function crzChooseAi(state:CrzBattleState):CrzCommand{
 if(state.phase!=='active'||!state.activeStackId)
  throw new Error('AI: batalha inativa.');
 const unit=state.stacks.find(s=>s.id===state.activeStackId);
 if(!unit||state.controls[unit.side]!=='ai')throw new Error('AI: lado humano.');
 const legal=crzLegalCommands(state);
 const enemies=state.stacks.filter(s=>s.side!==unit.side&&crzCapable(s));
 const attacks=legal.filter((c):c is Extract<CrzCommand,{type:'ATTACK'}>=>
  c.type==='ATTACK').sort((a,b)=>{
   const targetA=enemies.find(s=>s.id===a.targetId)!;
   const targetB=enemies.find(s=>s.id===b.targetId)!;
   return (a.mode==='melee'?0:1)-(b.mode==='melee'?0:1)||
    targetA.alive-targetB.alive||
    (a.targetId<b.targetId?-1:a.targetId>b.targetId?1:0);
  });
 if(attacks[0])return attacks[0];
 if(!unit.activation.moved){
  const moves=legal.filter((c):c is Extract<CrzCommand,{type:'MOVE'}>=>c.type==='MOVE');
  const distance=(q:number,r:number)=>Math.min(...enemies.map(s=>
   crzGridDistance(state.map,{q,r},s.position)));
  if(enemies.length&&moves.length){
   const oldDistance=distance(unit.position.q,unit.position.r);
   const closer=moves.filter(c=>distance(c.to.q,c.to.r)<oldDistance)
    .sort((a,b)=>distance(a.to.q,a.to.r)-distance(b.to.q,b.to.r)||
     a.to.r-b.to.r||a.to.q-b.to.q);
   if(closer[0])return closer[0];
  }
 }
 return legal.find(c=>c.type==='DEFEND')??
  legal.find(c=>c.type==='END_ACTIVATION')??(()=>{
   throw new Error('AI: sem comando legal.');
  })();
}
/** Executa até o próximo humano ou o término; um comando por transição auditável. */
export function crzRunAi(state:CrzBattleState,maxActions=1800):CrzBattleState{
 if(!Number.isSafeInteger(maxActions)||maxActions<1||maxActions>2000)
  throw new Error('AI: limite inválido.');
 let next=state;
 for(let n=0;n<maxActions;n++){
  if(next.phase==='completed')return next;
  const unit=next.stacks.find(s=>s.id===next.activeStackId);
  if(!unit)throw new Error('AI: ativação órfã.');
  if(next.controls[unit.side]==='human')return next;
  next=crzPlay(next,crzChooseAi(next),'ai');
 }
 throw new Error('AI: limite de ações excedido.');
}

/** CRZ-1.0 · máquina de estados própria, sem herdar o redutor PTE-2.0.
 * Referência 03 §§5–12; eventos explícitos para futuro replay do Lote 5.
 */
import type {CrzReady,CrzReadyStack,CrzLeader} from './setup';
import type {CrzHex,CrzSide} from './geometry';
import type {CrzRngState} from './rng';

export type CrzActivation=Readonly<{
 moved:boolean;attacked:boolean;guard:boolean;waited:boolean;
 retaliationRound:number|null;extraUsedRound:number|null;
 /** Registro por ativação, presente apenas quando houve MOVE ou ABILITY. */
 movedPath?:readonly CrzHex[];
 preparedAbility?:'CHARGE'|'VOLLEY'|'NIMBLE_ESCAPE';
}>;
export type CrzEffect=Readonly<{
 id:string;sourceId:string;kind:'attack'|'ac'|'morale'|'speed';
 amount:number;rounds:number;
}>;
export type CrzBattleStack=Omit<CrzReadyStack,'activation'|'effects'|'moraleState'> &
 Readonly<{
 activation:CrzActivation;effects:readonly CrzEffect[];
 moraleState:'steady'|'shaken'|'routed';
 defendActive:boolean;
 }>;
export type CrzEventData=
 |Readonly<{type:'BATTLE_STARTED'|'ROUND_STARTED'|'ROUND_ENDED';note:string}>
 |Readonly<{type:'ACTIVATION_STARTED'|'ACTIVATION_ENDED'|'TURN_SKIPPED'|
   'EXTRA_TURN_GRANTED'|'STACK_ROUTED'|'STACK_DESTROYED';unitId:string}>
 |Readonly<{type:'MOVED';unitId:string;from:CrzHex;to:CrzHex;
   cost:number;path:readonly CrzHex[]}>
 |Readonly<{type:'WAITED'|'DEFENDED';unitId:string}>
 |Readonly<{type:'DND_COUNT_CHANGED';unitId:string;previous:number;current:number}>
 |Readonly<{type:'DND_STACK_WITHDRAWN';unitId:string;survivors:number}>
 |Readonly<{type:'DND_STACK_ADDED';unitId:string;side:CrzSide;count:number}>
 |Readonly<{type:'ABILITY_USED';unitId:string;
   ability:'CHARGE'|'VOLLEY'|'NIMBLE_ESCAPE';uses:number}>
 |Readonly<{type:'ATTACK_RESOLVED'|'RETALIATION_RESOLVED';
   unitId:string;targetId:string;mode:'expected'|'rolled';
   attacks:number;hits:number;crits:number;rawDamage:number;
   appliedDamage:number;casualties:number;aliveBefore:number;
   aliveAfter:number;topHpAfter:number}>
 |Readonly<{type:'MORALE_CHANGED';unitId:string;
   from:'steady'|'shaken'|'routed';to:'steady'|'shaken'|'routed'}>
 |Readonly<{type:'SPELL_CAST';leaderId:string;spellId:string;
   side:CrzSide;targetId:string|null;cost:number}>
 |Readonly<{type:'SPELL_DAMAGE'|'SPELL_HEALED';leaderId:string;unitId:string;
   amount:number;casualties:number;aliveAfter:number}>
 |Readonly<{type:'EFFECT_APPLIED'|'EFFECT_EXPIRED';
   unitId:string;effectId:string;kind:CrzEffect['kind'];amount:number}>
 |Readonly<{type:'BATTLE_ENDED';winner:CrzSide|null;
   reason:'elimination'|'rout'|'mutual-defeat'|'stalemate'|'round-limit'}>;
export type CrzEvent=CrzEventData &Readonly<{seq:number;round:number}>;
export type CrzBattleState=Omit<CrzReady,'phase'|'stacks'|'rngState'|'leaders'> &
 Readonly<{
 phase:'active'|'completed';round:number;stacks:readonly CrzBattleStack[];
 leaders:Readonly<Record<CrzSide,CrzLeader|null>>;
 rngState:CrzRngState;
 activeStackId:string|null;activationQueue:readonly string[];
 waitingQueue:readonly string[];activeFromWait:boolean;
 winner:CrzSide|null;resultReason:Extract<CrzEventData,{type:'BATTLE_ENDED'}>['reason']|null;
 events:readonly CrzEvent[];
 progressThisRound:boolean;stagnantRounds:number;
 }>;
export function crzLog(state:CrzBattleState,event:CrzEventData):CrzBattleState{
 if(state.events.length>=5000)throw new Error('CRZ: limite de eventos atingido.');
 return {...state,events:[...state.events,{...event,
  seq:state.events.length+1,round:state.round}]};
}
export function crzReplaceStack(state:CrzBattleState,stack:CrzBattleStack):CrzBattleState{
 if(!state.stacks.some(s=>s.id===stack.id))throw new Error('CRZ: pilha ausente.');
 return {...state,stacks:state.stacks.map(s=>s.id===stack.id?stack:s)};
}
export const crzCapable=(s:CrzBattleStack):boolean=>
 s.alive>0&&s.moraleState!=='routed';
export function crzOrder(stacks:readonly CrzBattleStack[],pte=false):string[]{
 return stacks.filter(crzCapable).sort((a,b)=>{
  const ai=pte?a.movementHex+a.atkMod:a.initiative;
  const bi=pte?b.movementHex+b.atkMod:b.initiative;
  return bi-ai||(a.side===b.side?0:a.side==='attacker'?-1:1)||
   (pte?0:b.template.abilityMods.dex-a.template.abilityMods.dex)||
   (a.id<b.id?-1:a.id>b.id?1:0);
 }).map(s=>s.id);
}
export function crzMoraleState(s:CrzBattleStack):CrzBattleStack['moraleState']{
 if(s.moraleState==='routed')return 'routed';
 if(s.alive===0)return 'routed';
 const bonus=s.effects.filter(e=>e.kind==='morale').reduce((n,e)=>n+e.amount,0);
 const morale=Math.max(-100,Math.min(100,s.morale+bonus));
 const lost=Math.floor(100*(s.initialCount-s.alive)/s.initialCount);
 const shaken=Math.max(20,Math.min(70,40+Math.floor(morale/2)));
 const routed=Math.max(40,Math.min(95,70+Math.floor(morale/2)));
 return lost>=routed?'routed':lost>=shaken?'shaken':'steady';
}
export const crzEffectBonus=(s:CrzBattleStack,kind:CrzEffect['kind']):number=>
 s.effects.filter(e=>e.kind===kind).reduce((sum,e)=>sum+e.amount,0);

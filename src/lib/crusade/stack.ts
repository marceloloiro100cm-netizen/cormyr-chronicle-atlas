/** CRZ-1.0 · PV agregado de criaturas, manual 03 §§4 e 7.7–7.8; 02 T-PIL-06/07/10. */
import type {CrzRuleset} from './ruleset';
export type CrzSize='T'|'S'|'M'|'L'|'H'|'G';
export type CrzStack=Readonly<{
 id:string;size:CrzSize;initialCount:number;hpPerCreature:number;
 hpPool:number;alive:number;topHp:number;
}>;
export type CrzDamageReceipt=Readonly<{
 stack:CrzStack;damageRequested:number;damageApplied:number;
 wasted:number;casualties:number;
}>;
export function crzSafe(value:number,label:string):number{
 if(!Number.isSafeInteger(value))throw new Error('E_OVERFLOW: '+label);
 return value;
}
export function crzClamp(value:number,min:number,max:number):number{
 crzSafe(value,'clamp');return Math.min(max,Math.max(min,value));
}
export function crzMaxCount(config:CrzRuleset,size:CrzSize):number{
 return Math.min(config.stack.maxCount,config.stack.maxCountBySize[size]);
}
export function crzFromPool(stack:CrzStack,pool:number):CrzStack{
 const upper=crzSafe(stack.initialCount*stack.hpPerCreature,'pool maximum');
 if(!Number.isSafeInteger(pool)||pool<0||pool>upper)
  throw new Error('E_SETUP_COUNT: pool inválido.');
 const alive=pool===0?0:Math.ceil(pool/stack.hpPerCreature);
 const topHp=alive===0?0:crzSafe(pool-(alive-1)*stack.hpPerCreature,'top hp');
 if(alive>stack.initialCount||topHp<0||topHp>stack.hpPerCreature)
  throw new Error('E_OVERFLOW: estado inconsistente.');
 return {...stack,hpPool:pool,alive,topHp};
}
export function crzMakeStack(params:{
 id:string;size:CrzSize;count:number;hpPerCreature:number;ruleset:CrzRuleset;
}):CrzStack{
 const {id,size,count,hpPerCreature,ruleset}=params;
 if(!id||id.length>80||!Number.isSafeInteger(count)||count<1||
   count>crzMaxCount(ruleset,size)||
   !Number.isSafeInteger(hpPerCreature)||hpPerCreature<1||hpPerCreature>100000)
  throw new Error('E_SETUP_COUNT: pilha fora dos limites.');
 const initialCount=count,hpPool=crzSafe(count*hpPerCreature,'stack hp');
 return {id,size,initialCount,hpPerCreature,hpPool,alive:count,topHp:hpPerCreature};
}
export function crzValidateStack(stack:CrzStack):void{
 const {initialCount,hpPerCreature,alive,topHp,hpPool}=stack;
 const fields=[initialCount,hpPerCreature,alive,topHp,hpPool];
 if(fields.some(n=>!Number.isSafeInteger(n))||initialCount<1||
  hpPerCreature<1||alive<0||alive>initialCount||topHp<0||
  topHp>hpPerCreature||hpPool<0||
  hpPool!==((alive===0?0:(alive-1)*hpPerCreature+topHp))||
  (alive===0)!==(topHp===0)||hpPool>initialCount*hpPerCreature)
  throw new Error('E_SETUP_COUNT: PV/efetivo inconsistente.');
 crzSafe(initialCount*hpPerCreature,'validated hp');
}
export function crzApplyDamage(stack:CrzStack,damage:number,
 overkill:'carry'|'cap'|'waste'='carry'):CrzDamageReceipt{
 crzValidateStack(stack);crzSafe(damage,'damage');
 if(damage<0)throw new Error('E_SETUP_COUNT: dano negativo.');
 // waste representa UM único golpe discreto; excedente não atravessa o topo.
 const effective=overkill==='waste'?Math.min(damage,stack.topHp):damage;
 const applied=Math.min(effective,stack.hpPool);
 const after=crzFromPool(stack,stack.hpPool-applied);
 return {stack:after,damageRequested:damage,damageApplied:applied,
  wasted:damage-applied,casualties:stack.alive-after.alive};
}
export function crzHeal(stack:CrzStack,hp:number,revive:boolean):CrzStack{
 crzValidateStack(stack);crzSafe(hp,'healing');
 if(hp<0)throw new Error('E_SETUP_COUNT: cura negativa.');
 const limit=crzSafe((revive?stack.initialCount:stack.alive)*stack.hpPerCreature,'heal limit');
 // Somar só depois de limitar, evitando overflow antes de aplicar o teto.
 const added=Math.min(hp,limit-stack.hpPool);
 return crzFromPool(stack,crzSafe(stack.hpPool+added,'healed hp'));
}
export function crzSplitStack(stack:CrzStack,countA:number,
 idA:string,idB:string):readonly [CrzStack,CrzStack]{
 crzValidateStack(stack);
 if(stack.alive!==stack.initialCount)throw new Error(
  'Split de pilha com baixas exige política de repartição específica.');
 if(!Number.isSafeInteger(countA)||countA<1||countA>=stack.alive||
   !idA||!idB||idA===idB)throw new Error('E_SETUP_COUNT: divisão inválida.');
 const countB=stack.alive-countA;
 const missing=stack.alive*stack.hpPerCreature-stack.hpPool;
 const woundA=countA>=countB?missing:0,woundB=countB>countA?missing:0;
 const build=(id:string,count:number,wound:number):CrzStack=>{
  const maximum=crzSafe(count*stack.hpPerCreature,'split hp');
  return crzFromPool({...stack,id,initialCount:count,alive:count,
   topHp:stack.hpPerCreature,hpPool:maximum},maximum-wound);
 };
 const a=build(idA,countA,woundA),b=build(idB,countB,woundB);
 if(a.hpPool+b.hpPool!==stack.hpPool)throw new Error('E_OVERFLOW: split não conserva PV.');
 return [a,b];
}

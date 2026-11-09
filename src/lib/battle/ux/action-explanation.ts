/** Apenas strings de UI: usa os eventos já resolvidos. Não altera regras ou replay. */
import type {BattleEvent,BattleStack} from '@/lib/battle/domain/types';
import type {CrzEvent} from '@/lib/crusade/battle-state';
type Named=Readonly<{id:string;name:string}>;
const name=(id:string,stacks:readonly Named[])=>
 stacks.find(s=>s.id===id)?.name??'Unidade';

export function pteEventLabel(event:BattleEvent,stacks:readonly BattleStack[]):string{
 if(event.type==='DAMAGE'||event.type==='RETALIATION'){
  const a=event.delta['attackerId'];
  const d=event.delta['defenderId'];
  const actor=typeof a==='string'?name(a,stacks):'Atacante';
  const target=typeof d==='string'?name(d,stacks):'Alvo';
  return (event.type==='RETALIATION'?'Retaliação':'Ataque')+
   ' · '+actor+' → '+target;
 }
 const actor='unitId' in event.command?name(event.command.unitId,stacks):'Unidade';
 if(event.type==='MOVE')return 'Movimento · '+actor;
 if(event.type==='DEFEND')return 'Defesa · '+actor;
 if(event.type==='WAIT')return 'Espera · '+actor;
 return event.type;
}
export function crzEventLabel(event:CrzEvent,stacks:readonly Named[]):string{
 if(event.type==='ATTACK_RESOLVED'||event.type==='RETALIATION_RESOLVED'){
  return (event.type==='RETALIATION_RESOLVED'?'Retaliação':'Ataque')+
   ' · '+name(event.unitId,stacks)+' → '+name(event.targetId,stacks);
 }
 if(event.type==='SPELL_DAMAGE')return 'Magia · '+name(event.unitId,stacks);
 if(event.type==='SPELL_HEALED')return 'Cura · '+name(event.unitId,stacks);
 if('unitId' in event){
  const action=event.type==='MOVED'?'Movimento':event.type==='DEFENDED'?'Defesa':
   event.type==='WAITED'?'Espera':event.type==='ABILITY_USED'?'Habilidade':'Ação';
  return action+' · '+name(event.unitId,stacks);
 }
 return 'Ação';
}
export function mostRecentAction<T extends Readonly<{type:string}>>(
 events:readonly T[],types:readonly string[],
):T|undefined{
 // Iteração inversa sem copiar todo o log; relevante em replays longos.
 const allowed=new Set(types);
 for(let i=events.length-1;i>=0;i--){
  const event=events[i]!;
  if(allowed.has(event.type))return event;
 }
 return undefined;
}
export function pteAiActionDescription(commands:readonly {type:string}[]):string{
 const attacks=commands.filter(c=>c.type==='ATTACK').length;
 const moves=commands.filter(c=>c.type==='MOVE').length;
 return 'IA: '+attacks+' ataque(s) e '+moves+' movimento(s) legais realizados.';
}

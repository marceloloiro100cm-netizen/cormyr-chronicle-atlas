import type {WarBattle,WarEvent,WarPosition} from './types';
import {terrainAt,terrainEffect} from './terrain';
import {rollPersonalWithFate,consumePersonalFateRoll} from './personal-fate';
import {queuePersonalDamage} from './personal-injuries';
/** Montarias de combate individual, capítulo 9. Equipamento/modelos são locais e não persistidos. */
export type WarPersonalMount=Readonly<{
 id:string;name:string;athletics:number;movement:number;
 health:number;maxHealth:number;trainedForWar:boolean;
 defense:number;agility:number;
}>;
export function makeModelWarMount(input:{
 id:string;name:string;trainedForWar?:boolean;athletics?:number;movement?:number;
 defense?:number;agility?:number;endurance?:number;
}):WarPersonalMount{
 if(!input.id.trim()||!input.name.trim())throw new Error('Montaria sem identificação.');
 const athletics=input.athletics??4,movement=input.movement??8;
 const agility=input.agility??3,endurance=input.endurance??4,defense=input.defense??8;
 if(!Number.isInteger(athletics)||athletics<1||athletics>15||
  !Number.isInteger(movement)||movement<1||movement>30||
  !Number.isInteger(endurance)||endurance<1||endurance>15||
  !Number.isInteger(agility)||agility<1||agility>15||
  !Number.isInteger(defense)||defense<1||defense>50)
  throw new Error('Atletismo ou Movimento da montaria inválido.');
 return {id:input.id,name:input.name,athletics,movement,
  health:endurance*3,maxHealth:endurance*3,defense,agility,
  trainedForWar:input.trainedForWar??true};
}

/** Queda quando a montaria morre (cap. 9, p. 205).
 * Lidar com Animais Formidável (12) evita dano e faz pousar a 1 m.
 * Falha: dano direto igual ao Atletismo do animal e aprisionamento sob o corpo.
 * Não escreve em fichas oficiais.
 */
export function applyPersonalMountDamage(
 battle:WarBattle,input:{riderId:string;damage:number;source:string},
):WarBattle{
 const rider=battle.heroes.find(h=>h.id===input.riderId);
 if(!rider?.mount||rider.mount.health<=0)
  throw new Error('Montaria não encontrada ou já morta.');
 if(!Number.isInteger(input.damage)||input.damage<=0)
  throw new Error('Dano da montaria deve ser positivo.');
 const mount=rider.mount;
 const health=Math.max(0,mount.health-input.damage);
 const dead=health===0;
 let next:WarBattle={...battle,heroes:battle.heroes.map(h=>
  h.id===rider.id?{...h,mount:{...mount,health}}:h)};
 const event:WarEvent={seq:next.events.length+1,round:next.round,side:rider.side,
  kind:dead?'personal-mount-death':'personal-mount-wound',
  text:input.source+' causou '+input.damage+' de dano a '+mount.name+
   '; Saúde da montaria '+health+'/'+mount.maxHealth+'.'};
 next={...next,events:[...next.events,event]};
 if(!dead||!rider.mounted)return next;

 const roll=rollPersonalWithFate(next.seed,rider,rider.animalHandling??3,0,
  rider.injuries??0);
 const total=Math.max(0,roll.total-(rider.wounds??0));
 const saved=total>=12;
 const centre=rider.personalPosition??{x:rider.position.x*10+5,y:rider.position.y*10+5};
 let landing:WarPosition|null=null;
 if(saved){
  const neighbours=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1},
   {x:1,y:1},{x:-1,y:1},{x:1,y:-1},{x:-1,y:-1}];
  for(const dir of neighbours){
   const p={x:centre.x+dir.x,y:centre.y+dir.y};
   if(p.x<0||p.y<0||p.x>=battle.width*10||p.y>=battle.height*10)continue;
   const tile=terrainAt(battle.tiles,{x:Math.floor(p.x/10),y:Math.floor(p.y/10)});
   const effect=terrainEffect(tile);
   if(effect.blocked||(effect.water&&!tile.bridge))continue;
   if(battle.heroes.some(h=>h.id!==rider.id&&h.active&&
    (h.personalPosition?.x??h.position.x*10+5)===p.x&&
    (h.personalPosition?.y??h.position.y*10+5)===p.y))continue;
   landing=p;break;
  }
 }
 next={...next,seed:roll.nextSeed,heroes:next.heroes.map(h=>h.id===rider.id?{
  ...consumePersonalFateRoll(h),mounted:false,mountControlledTurn:undefined,
  pinnedByMount:!saved,prone:!saved,
  ...(landing?{position:{x:Math.floor(landing.x/10),y:Math.floor(landing.y/10)},
   personalPosition:landing}:{})
 }:h)};
 next={...next,events:[...next.events,{
  seq:next.events.length+1,round:next.round,side:rider.side,
  kind:saved?'personal-mount-fall-saved':'personal-mount-fall-trapped',
  text:rider.name+' testou Lidar com Animais '+total+' vs 12: '+
   (saved?'salto seguro a 1 metro.':'preso sob o cavalo; queda causa '+
    mount.athletics+' de dano ignorando VA.'),
  roll:roll.dice,total,difficulty:12,
 }]};
 if(!saved)next=queuePersonalDamage(next,{targetHeroId:rider.id,
  actorName:'Queda de '+mount.name,damage:mount.athletics,source:'personal'});
 return next;
}

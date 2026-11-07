import {makeModelWarHero} from './heroes';
import type {WarBattle,WarUnit} from './types';

export type WarSquad=Readonly<{
 id:string;unitId:string;memberIds:readonly string[];casualtyRecorded:boolean;
}>;
const alive=(u:WarUnit)=>u.condition==='organized'||u.condition==='disorganized';
/** Cap. 10, p. 230: uma unidade de 100 pode ser aproximada em grupos de dez. */
export function deployWarSquad(battle:WarBattle,input:{
 unitId:string;squadId:string;
}):WarBattle{
 if(battle.phase!=='heroes-first'&&battle.phase!=='heroes-second')
  throw new Error('Esquadrões pessoais só podem entrar nas fases de heróis.');
 if(battle.personalInitiative?.phase===battle.phase)
  throw new Error('Destaque o esquadrão antes de rolar a iniciativa pessoal.');
 if(battle.pendingPersonalDamage)throw new Error('Resolva o dano pessoal pendente.');
 const unit=battle.units.find(u=>u.id===input.unitId);
 if(!unit||!alive(unit))throw new Error('A unidade de origem precisa estar em combate.');
 if(!input.squadId.trim()||battle.squads?.some(s=>s.id===input.squadId))
  throw new Error('Identificador de esquadrão inválido ou repetido.');
 // Cem soldados podem ser representados por dez grupos de dez.
 // Um destaque continua sendo uma cópia da simulação: não reduz a ficha da Casa.
 const attached=(battle.squads??[]).filter(s=>s.unitId===unit.id);
 if(attached.length>=10)
  throw new Error('Cada unidade de cem soldados pode destacar no máximo dez esquadrões.');
 const currentIds=new Set(battle.heroes.map(h=>h.id));
 const ids=Array.from({length:10},(_,i)=>input.squadId+'-'+(i+1));
 if(ids.some(id=>currentIds.has(id)))throw new Error('Identificação de combatente duplicada.');
 const troops=ids.map((id,i)=>{
  const hero=makeModelWarHero({id,name:unit.name+' · soldado '+(i+1),
   side:unit.side,position:{...unit.position}});
  // Cada destacamento utiliza dez posições pessoais exclusivas da
  // área 10×10 m da unidade: evita sobrepor dez esquadrões no mesmo local.
  const ordinal=attached.length*10+i;
  const position={x:unit.position.x*10+(ordinal%10),
   y:unit.position.y*10+Math.floor(ordinal/10)};
  return {...hero,squadId:input.squadId,personalPosition:position,
   agility:unit.ability.agility,athletics:unit.ability.athletics,
   awareness:unit.ability.awareness,endurance:unit.ability.endurance,
   fighting:unit.ability.fighting,marksmanship:unit.ability.marksmanship,
   defense:unit.defense,armor:unit.armor,
   meleeDamage:unit.meleeDamage,rangedDamage:unit.rangedDamage,
   rangedRange:unit.range,
   health:unit.ability.endurance*3,maxHealth:unit.ability.endurance*3,
   quicknessBonusDice:0,fateAvailable:0,fateSpent:0,fateBurned:0};
 });
 return {...battle,heroes:[...battle.heroes,...troops],
  squads:[...(battle.squads??[]),{
   id:input.squadId,unitId:unit.id,memberIds:ids,casualtyRecorded:false,
  }],
  events:[...battle.events,{
   seq:battle.events.length+1,round:battle.round,side:unit.side,kind:'squad-deploy',
   text:unit.name+' destacou 10 soldados para combate individual.',
  }]};
}
/** Dez soldados derrotados = um ponto de Saúde da unidade; nunca debita duas vezes. */
export function settleWarSquadLosses(
 battle:WarBattle,applyOneLoss:(state:WarBattle,unit:WarUnit,squadName:string)=>WarBattle,
):WarBattle{
 let next=battle;
 for(const squad of battle.squads??[]){
  if(squad.casualtyRecorded||squad.memberIds.length!==10)continue;
  const members=squad.memberIds.map(id=>next.heroes.find(h=>h.id===id));
  if(members.some(h=>!h))continue;
  if(members.some(h=>h!.active&&!h!.surrendered))continue;
  const unit=next.units.find(u=>u.id===squad.unitId);
  next={...next,squads:(next.squads??[]).map(s=>s.id===squad.id?
   {...s,casualtyRecorded:true}:s)};
  if(!unit||!alive(unit))continue;
  next=applyOneLoss(next,unit,squad.id);
  next={...next,events:[...next.events,{
   seq:next.events.length+1,round:next.round,side:unit.side,kind:'squad-loss',
   text:'Os dez soldados de '+squad.id+
    ' foram derrotados; a unidade '+unit.name+' perdeu um ponto de Saúde.',
  }]};
 }
 return next;
}

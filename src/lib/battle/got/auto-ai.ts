import type {WarBattle,WarOrder,WarPosition,WarUnit} from './types';
import {advanceWarRound,completeWarHeroPhase,fireWarSiegeVolley,issueWarOrder,
 previewWarMovement,skipWarSiege} from './engine';
import {warSiegeReloadRemaining,warSiegeTargetInRange} from './siege';

/** Executes exactly one rules-engine transition. Neither AI side writes campaign data.
 * This is a deterministic tactical opponent, not a replacement for narrator judgement.
 */
export type GotAiStep=Readonly<{battle:WarBattle;description:string;needsNarrator?:boolean}>;
const onBoard=(u:WarUnit)=>!['destroyed','escaped','surrendered'].includes(u.condition);
const fighting=(u:WarUnit)=>u.condition==='organized'||u.condition==='disorganized';
const distance=(a:WarPosition,b:WarPosition)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const describe=(b:WarBattle,description:string):GotAiStep=>({battle:b,description});

function orderFor(b:WarBattle,unit:WarUnit):WarOrder{
 if(unit.condition==='routed')return {kind:'revive'};
 if(unit.condition==='disorganized')return {kind:'reorganize'};
 const enemies=b.units.filter(u=>u.side!==unit.side&&fighting(u)).sort((a,c)=>
  distance(unit.position,a.position)-distance(unit.position,c.position)||a.id.localeCompare(c.id));
 const visible=enemies.filter(e=>!e.hidden||distance(unit.position,e.position)<=1);
 const melee=visible.find(e=>distance(unit.position,e.position)===1);
 if(melee)return {kind:'attack',targetId:melee.id,ranged:false};
 const maxRange=unit.range==='long'?20:unit.range==='short'?2:0;
 const shooter=unit.range!=='none'&&unit.rangedDamage>0&&
  !['battle-ram','siege-tower'].includes(unit.fieldEquipment??'')?
  visible.find(e=>distance(unit.position,e.position)<=maxRange):undefined;
 if(shooter)return {kind:'attack',targetId:shooter.id,ranged:true};
 if(enemies.length){
  const nearest=enemies[0]!;
  const initialDistance=distance(unit.position,nearest.position);
  const destinations:WarPosition[]=[];
  for(let x=Math.max(0,unit.position.x-4);x<=Math.min(b.width-1,unit.position.x+4);x++)
   for(let y=Math.max(0,unit.position.y-4);y<=Math.min(b.height-1,unit.position.y+4);y++){
    const p={x,y};
    if(distance(p,nearest.position)>=initialDistance||distance(p,unit.position)===0)continue;
    destinations.push(p);
   }
  destinations.sort((a,c)=>distance(a,nearest.position)-distance(c,nearest.position)||
   distance(a,unit.position)-distance(c,unit.position)||a.x-c.x||a.y-c.y);
  for(const candidate of destinations){
   if(previewWarMovement(b,unit.id,candidate).legal)return {kind:'move',to:candidate};
  }
 }
 return {kind:'defend'};
}

export function nextGotAiStep(battle:WarBattle):GotAiStep{
 if(battle.phase==='finished')return describe(battle,'Confronto encerrado.');
 if(battle.pendingPersonalDamage||battle.pendingPersonalSplit||battle.pendingPersonalTrample||
  battle.pendingPersonalCounterattack)return {
   battle,description:'Decisão de dano pessoal exige intervenção do Narrador.',needsNarrator:true,
  };
 if(battle.phase==='heroes-first'||battle.phase==='heroes-second'){
  // Individual heroic choices are not fabricated by the auto-controller.
  return describe(completeWarHeroPhase(battle),'IA concluiu a fase de heróis sem emitir decisões pessoais.');
 }
 if(battle.phase==='siege'){
  const leader=battle.commanders.find(c=>c.side===battle.turn&&c.role==='commander'&&c.active);
  if(leader&&(battle.ordersRemaining[leader.id]??0)>0){
   const weapons=battle.siege.filter(w=>w.side===battle.turn&&w.health>0&&
    warSiegeReloadRemaining(w,battle.round)===0);
   const targets=battle.units.filter(u=>u.side!==battle.turn&&fighting(u)&&!u.hidden);
   for(const weapon of weapons){
    const target=targets.find(u=>warSiegeTargetInRange(weapon,u.position));
    if(!target)continue;
    try{
     const next=fireWarSiegeVolley(battle,{commanderId:leader.id,
      weaponIds:[weapon.id],targetId:target.id});
     return describe(next,'IA disparou '+weapon.name+' contra '+target.name+'.');
    }catch{/* outra máquina ou conclusão da fase sem disparo */}
   }
  }
  return describe(skipWarSiege(battle),'IA concluiu a etapa de cerco sem disparos.');
 }
 if(battle.phase!=='orders')return {battle,description:'Fase ainda não suportada.',needsNarrator:true};
 const commander=battle.commanders.find(c=>c.side===battle.turn&&c.active&&
  c.role==='commander'&&(battle.ordersRemaining[c.id]??0)>0);
 if(!commander){
  const canAdvance=battle.commanders.every(c=>!c.active||(battle.ordersRemaining[c.id]??0)===0);
  if(canAdvance)return describe(advanceWarRound(battle),'IA concluiu a rodada.');
  return {battle,description:'Comandante indisponível; intervenção necessária.',needsNarrator:true};
 }
 const active=battle.units.filter(u=>u.side===battle.turn&&onBoard(u));
 if(!active.length)return {battle,description:'Sem tropas comandáveis; intervenção necessária.',needsNarrator:true};
 // Prefer units that have not acted this round. Do not silently issue illegal orders.
 const units=[...active].sort((a,c)=>Number(a.actedThisRound)-Number(c.actedThisRound)||
  a.issuedThisRound-c.issuedThisRound||a.id.localeCompare(c.id));
 for(const unit of units){
  const preferred=orderFor(battle,unit);
  const alternatives:WarOrder[]=[preferred,{kind:'defend'}];
  for(const order of alternatives){
   if(unit.condition==='routed'&&order.kind!=='revive')continue;
   try{
    const result=issueWarOrder(battle,{commanderId:commander.id,unitId:unit.id,order});
    return describe(result.battle,commander.name+': '+unit.name+' · '+order.kind+
     (result.passed?' (ordem recebida).':' (falha no teste de Guerra).'));
   }catch{/* try next legal order or another unit */}
  }
 }
 return {battle,description:'Nenhuma ordem válida encontrada; Narrador deve decidir.',needsNarrator:true};
}

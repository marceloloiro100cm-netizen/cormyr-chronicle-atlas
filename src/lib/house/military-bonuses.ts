import {activeHoldings,TRAINING,UNIT_TYPES} from './engine';
import {UNIT_EQUIPMENT} from './equipment';
import type {Cost,HouseState,Holding,Resource,Skill,Unit} from './types';

export type MilitaryBonusLine={source:string;holdingId:string;description:string;kind:'combat'|'recruitment'|'battle'|'pending'};
export type MilitaryDiscount={source:string;holdingId:string;resource:Resource;amount:number;description:string};
const active=(state:HouseState,id:string)=>activeHoldings(state).filter(h=>h.itemId===id);
const line=(h:Holding,description:string,kind:MilitaryBonusLine['kind']='combat'):MilitaryBonusLine=>({source:h.name,holdingId:h.id,description,kind});

/** All discounts are applied once, at recruitment, before spending Power. */
export function quoteMilitaryUnit(state:HouseState,types:string[],training:keyof typeof TRAINING){
 const base:Cost[]=[{resource:'power',amount:TRAINING[training].power+types.reduce((n,id)=>n+(UNIT_TYPES.find(t=>t.id===id)?.cost??0),0),mode:'allocation'}];
 if(types.includes('levies'))base.push({resource:'population',amount:2,mode:'permanent'});
 if(types.includes('mercenaries'))base.push({resource:'wealth',amount:({green:1,trained:3,veteran:6,elite:9})[training],mode:'permanent'});
 const candidates:MilitaryDiscount[]=[];
 const add=(id:string,type:string,amount:number,description:string,resource:Resource='power')=>{
  if(!types.includes(type))return;
  for(const h of active(state,id))if(!candidates.some(d=>d.holdingId===h.id))candidates.push({source:h.name,holdingId:h.id,resource,amount,description});
 };
 add('pros-charcoal--tar-works','warships',1,'Unidade naval: custo −1 Poder');
 add('pros-fur-trade--trappers','guerrillas',2,'Guerrilheiros: custo −2 Poder');
 add('pros-horse-husbandry--war-horse-herds','cavalry',2,'Cavalaria: custo −2 Poder');
 add('pros-timber--ship-yards','warships',2,'Navios de Guerra: custo −2 Poder');
 add('pros-shipwright','warships',2,'Navios de Guerra: custo −2 Poder');
 add('pros-engineer--engineer-commander','engineers',1,'Engenheiros: custo −1 Poder');
 add('pros-abbey--warrior-brotherhood','crusaders',1,'Cruzados: custo −1 Poder');
 add('pros-gambling-dens--bloodsports','levies',2,'Plebeus recrutados: custo −2 Poder');
 add('pros-street-gangs','levies',2,'Recrutas Camponeses: custo −2 Poder');
 add('pros-gaol','criminals',2,'Criminosos: custo −2 Poder');
 add('pros-gaol','garrison',2,'Guarnição: custo −2 Poder');
 for(const h of active(state,'pros-master-of-arms--field-master'))if(h.militaryTypeId&&types.includes(h.militaryTypeId))candidates.push({source:h.name,holdingId:h.id,resource:'power',amount:1,description:'Mestre de Campo: especialidade '+h.militaryTypeId+' −1 Poder'});
 const costs=base.map(c=>({...c}));const discounts:MilitaryDiscount[]=[];
 for(const cost of costs)for(const d of candidates.filter(d=>d.resource===cost.resource)){
  const amount=Math.min(d.amount,Math.max(0,cost.amount-(cost.resource==='power'?1:0)));
  if(amount>0){cost.amount-=amount;discounts.push({...d,amount});}
 }
 return {base,costs,discounts};
}
export function quoteMilitarySiege(state:HouseState,resource:Resource,base:number,itemId=''){
 const eligible=['siege-tower','small-catapult','medium-catapult','large-catapult','fire-spitter','scorpion','mangonel','trebuchet'].includes(itemId);
 const h=eligible&&resource==='wealth'?active(state,'pros-engineer--siege-engineer')[0]:undefined;
 const quantity=h&&base===1?2:1;
 const amount=h?1:0;
 return {cost:h?Math.max(1,base-1):base,quantity,discounts:h&&amount?[{source:h.name,amount}]:[]};
}
export function militaryConstructionDuration(state:HouseState,itemId:string,category:string,duration:number){
 const fort=['tower','hall','small-castle','castle','superior-castle'].includes(itemId);
 const engineer=['fortification','estate','settlement'].includes(category)&&active(state,'pros-engineer').length?0.2:0;
 const mason=fort&&active(state,'pros-stonemason').length?0.1:0;
 return {months:Math.max(0,Math.ceil(duration*(1-engineer-mason))),discountPercent:Math.round((engineer+mason)*100)};
}
export function unitMilitaryBonuses(state:HouseState,unit:Unit){
 const entries:MilitaryBonusLine[]=[],conditional:MilitaryBonusLine[]=[];
 const skillBonuses:Partial<Record<Skill,number>>={};
 const add=(h:Holding,description:string,kind:MilitaryBonusLine['kind']='combat')=>entries.push(line(h,description,kind));
 const pending=(h:Holding,description:string)=>conditional.push(line(h,description,'pending'));
 let defense=0,armorRating=0,fightingDamage=0,marksmanshipDamage=0,meleeBonusDice=0,trackingBonusDice=0,discipline=0,warshipCasualtyMitigation=0;
 const stationed=unit.atHome!==false;
 const shields:{holding:Holding;value:number}[]=[];
 // Use activeHoldings to respect a parent's condition and other effect availability rules.
 if(stationed)for(const h of activeHoldings(state).filter(h=>h.domainId===unit.domainId)){
  const fort:Record<string,number>={tower:3,hall:4,'small-castle':6,castle:8,'superior-castle':12,'pros-gaol':4};
  const points=fort[h.itemId]??(
   (h.itemId==='pros-abbey--warrior-brotherhood'||h.itemId==='pros-trading-inn')&&h.militaryUnitId===unit.id?2:0
  );
  if(points>0)shields.push({holding:h,value:points});
 }
 if(shields.length){shields.sort((a,b)=>b.value-a.value);defense+=shields[0]!.value;add(shields[0]!.holding,'Defesa de fortificação +'+shields[0]!.value);}
 if(stationed&&shields.length)for(const h of active(state,'pros-engineer').slice(0,1)){defense+=1;add(h,'Defesa em fortificação +1');}
 if(stationed&&shields.length)for(const h of active(state,'pros-master-of-arms--prepared-for-siege').slice(0,1)){armorRating+=1;add(h,'Absorção de Armadura +1; provisões para seis meses de cerco');}
 if(unit.types.includes('scouts'))for(const h of active(state,'pros-dog-kennels--scouting-hounds').slice(0,1)){
  fightingDamage+=1;trackingBonusDice+=2;add(h,'Rastreamento +2B e dano corpo a corpo +1');
 }
 if(unit.warHoundsHoldingId&&!(unit.types.includes('cavalry')&&unit.mounted!==false)&&!unit.types.includes('warships')){
  const h=active(state,'pros-dog-kennels--war-hounds').find(h=>h.id===unit.warHoundsHoldingId);
  if(h){fightingDamage+=2;meleeBonusDice+=1;add(h,'Cães de Guerra equipados: ataque corpo a corpo +1B, dano +2');}
 }
 const equipment=UNIT_EQUIPMENT.find(e=>e.id===(unit.equipmentTypeId??unit.types[0]));
 let smithFighting=false,smithMarks=false;
 for(const h of active(state,'pros-bowyer-fletcher-or-weaponsmith')){
  if(h.weaponSpecialty==='fighting'&&!smithFighting){fightingDamage+=1;smithFighting=true;add(h,'Armas de Luta: dano +1');}
  else if(h.weaponSpecialty==='marksmanship'&&equipment&&equipment.initial.marksmanship!=='—'&&!smithMarks){marksmanshipDamage+=1;smithMarks=true;add(h,'Armas de Pontaria: dano +1');}
  else if(!h.weaponSpecialty)pending(h,'Especialização não cadastrada; definir Luta ou Pontaria.');
 }
 for(const h of active(state,'pros-military-academy--core-training')){
  if(h.militarySkill){skillBonuses[h.militarySkill]=Math.max(skillBonuses[h.militarySkill]??0,1);add(h,'Habilidade '+h.militarySkill+' +1 (Treinamento Fundamental)');}
  else pending(h,'Escolher habilidade do Treinamento Fundamental na posse.');
 }
 for(const h of active(state,'pros-master-of-arms').slice(0,1))add(h,'Primeira melhoria de equipamento gratuita; sobreviventes +1','battle');
 if(unit.types.includes('warships'))for(const h of active(state,'pros-port--drydocks').slice(0,1)){
  warshipCasualtyMitigation=2;add(h,'Ignora até 2 de penalidade na etapa Unidades e Baixas','battle');
 }
 for(const benefit of unit.recruitmentBenefits??[])add({id:benefit.holdingId,name:benefit.source} as Holding,benefit.description,'recruitment');
 for(const d of unit.recruitmentDiscounts??[])add({id:d.holdingId,name:d.source} as Holding,
  'Recrutamento: −'+d.amount+' '+(d.resource==='power'?'Poder':d.resource==='wealth'?'Riqueza':'População')+' (já aplicado)','recruitment');
 for(const h of active(state,'pros-military-academy--broad-training')){if(unit.broadTrainingSkill)add(h,'Quarta habilidade liberada: '+unit.broadTrainingSkill,'battle');else pending(h,'Treinamento Amplo exige ação da Casa e escolha de habilidade para a unidade.');}
 for(const h of active(state,'pros-master-of-arms--field-master'))if(!h.militaryTypeId)pending(h,'Mestre de Campo exige especialização do tipo de unidade.');
 for(const h of active(state,'pros-military-academy').slice(0,1))add(h,'Reduz em 1 a perda de graduação por dano de Guerra, quando aplicável','battle');
 return {defense,armorRating,fightingDamage,marksmanshipDamage,meleeBonusDice,trackingBonusDice,discipline,
  skillBonuses,warshipCasualtyMitigation,entries,conditional};
}

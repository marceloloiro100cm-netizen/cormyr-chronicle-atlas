import { RESOURCE_KEYS, SKILLS, zeroResources, type CatalogItem, type Cost, type Domain, type HouseState, type Ledger, type Resources, type Resource, type Unit, type Requirement, type Effect } from './types';
import { regionBonus } from './regions';
import { historyAdjustments, memberBonusAdjustments } from './creation-history';
import { holdingAllocation, legacyCatalogEffects, legacyDestroyedLosses } from './holding-accounting';
export type Balance = { total: Resources; allocated: Resources; committed: Resources; available: Resources; permanent: Resources };
/** Livro básico, Tabela 6-5: maximum status permitted by the HOUSE'S TOTAL Influence. */
export function maxHouseStatus(influence:number):number {
 if(!Number.isFinite(influence))throw new Error('Influência inválida.');
 if(influence<=10)return 2;
 if(influence<=20)return 3;
 if(influence<=40)return 4;
 if(influence<=50)return 5;
 if(influence<=60)return 6;
 if(influence<=70)return 7;
 return 8;
}
export function heirHouseStatus(influence:number,order:number):number {
 if(!Number.isInteger(order)||order<1)throw new Error('Ordem do herdeiro inválida.');
 return Math.max(0,maxHouseStatus(influence)-Math.min(3,order));
}
export function balances(state: HouseState): Balance {
  const regional = state.regionalApplied && state.method !== 'import' ? regionBonus(state.identity.region) : zeroResources();
  const total = zeroResources(), allocated = zeroResources(), committed = zeroResources(), available = zeroResources();
  const historic = historyAdjustments(state),personal=memberBonusAdjustments(state);
  const legacyLosses=legacyDestroyedLosses(state);
  const effectivePermanent=zeroResources();
  for (const r of RESOURCE_KEYS) {
    effectivePermanent[r]=state.permanent[r]-legacyLosses[r];
    total[r] = state.base[r] + effectivePermanent[r] + regional[r] + historic[r] + personal[r];
  }
  for (const holding of state.holdings) {
    if(holding.status!=='active'&&holding.status!=='building')continue;
    const target=holding.status==='building'?committed:allocated;
    const ac=holdingAllocation(holding);
    for(const r of RESOURCE_KEYS)target[r]+=ac[r];
  }
  for (const unit of state.units) {
    if (unit.destroyed) continue;
    const ac = unit.allocatedCosts;
    if (ac) {
      for (const r of RESOURCE_KEYS) allocated[r] += ac[r] ?? 0;
    } else {
      const costs = unit.costs;
      for (const cost of costs) {
        if (cost.mode === 'allocation') allocated[cost.resource] += cost.amount;
      }
    }
  }
  for (const r of RESOURCE_KEYS) {
    available[r] = total[r] - allocated[r] - committed[r];
  }
  return {total, allocated, committed, available, permanent: effectivePermanent};
}
export function validateResources(values: Resources) { for (const r of RESOURCE_KEYS) if (!Number.isFinite(values[r]) || Math.abs(values[r]) > 100000) throw new Error('Valor de recurso inválido.'); }
/** Harptos calendar: Hammer/Alturiak/Nightal winter; Ches–Mirtul spring;
 * Kythorn–Eleasis summer; Eleint–Uktar autumn. */
export function houseSeason(month:number):'winter'|'spring'|'summer'|'autumn' {
 const m=((month%12)+12)%12;
 return m===11||m<2?'winter':m<5?'spring':m<8?'summer':'autumn';
}
export function effectActiveForMonth(effect:Effect,state:HouseState):boolean {
 if(effect.seasons?.length&&!effect.seasons.includes(houseSeason(state.month)))return false;
 if(effect.maxResource&&balances(state).total[effect.maxResource.resource]>effect.maxResource.maximum)return false;
 return true;
}
export function activeHoldings(state:HouseState) {
 const enabled=(id:string,seen:Set<string>):boolean=>{if(seen.has(id))return false;const h=state.holdings.find(h=>h.id===id);if(!h||h.status!=='active')return false;if(!h.parentId)return true;return enabled(h.parentId,new Set([...seen,id]));};
 return state.holdings.filter(h=>enabled(h.id,new Set())).map(h=>{
   const effects=h.effects.length?h.effects:legacyCatalogEffects(h);
   return {...h,effects:effects.filter(e=>effectActiveForMonth(e,state))};
 });
}
export function settlementCapacity(state:HouseState,domainId:string,supportId?:string):{capacity:number;used:number;error?:string} {
 const domain=state.domains.find(d=>d.id===domainId);
 const support=state.holdings.find(h=>h.id===supportId&&h.domainId===domainId&&h.status==='active');
 let capacity=0;
 if(supportId){
  if(!support)return {capacity:0,used:0,error:'Escolha um suporte ativo no mesmo domínio.'};
  const capacities:Record<string,number>={tower:1,hall:2,'small-castle':3,castle:4,'superior-castle':5,hamlet:1,'small-town':2,'large-town':4,'small-city':Infinity,'large-city':Infinity};
  if(support.itemId==='pros-trading-inn')capacity=2*state.holdings.filter(h=>h.parentId===support.id&&h.itemId==='pros-trading-inn--growth'&&h.status==='active').length;
  else if(capacities[support.itemId]!==undefined)capacity=capacities[support.itemId]??0;
  else return {capacity:0,used:0,error:'Este suporte exige adaptação explícita de capacidade; não somar suportes.'};
 } else {const capacities:Record<string,number>={hamlet:1,'small-town':2,'large-town':4,'small-city':Infinity,'large-city':Infinity};capacity=capacities[domain?.community??'']??0;}
 const used=state.holdings.filter(h=>h.domainId===domainId&&h.category==='settlement'&&!['pros-abbey','pros-tolls','pros-trading-inn'].includes(h.itemId)&&['active','building'].includes(h.status)&&(h.supportId??'')===(supportId??'')).length;
 return {capacity,used};
}
export function requirements(item: CatalogItem, state: HouseState, domain?: Domain, parentId?: string,supportId?:string,replaceId?:string): string[] {
  const errors: string[] = [];
  // Pending source notes are warnings; concrete requirements still apply.
  if (['terrain','feature','community','fortification','estate','settlement'].includes(item.category) && !domain) errors.push('Escolha um domínio.');
  if (item.category === 'terrain' && domain?.terrain) errors.push('O domínio já possui terreno principal.');
  if (item.category === 'community' && domain?.community && !replaceId) errors.push('O domínio já possui uma comunidade. Escolha a evolução.');
  const parent=state.holdings.find(h=>h.id===parentId);
  if(item.category==='improvement'&&parent&&parent.domainId!==(domain?.id??'')) errors.push('A melhoria deve ficar no mesmo domínio da posse principal.');
  if (!item.repeatable && item.id!=='tower' && state.holdings.some(h=>h.itemId===item.id && (item.category==='improvement'?h.parentId===parentId:h.domainId === (domain?.id ?? '')) && ['active','building'].includes(h.status))) errors.push('Esta posse já existe neste local.');
  if(item.category==='estate'&&state.holdings.some(h=>h.domainId===domain?.id&&['active','building'].includes(h.status)&&(h.category==='estate'||h.source.startsWith('Prosperidade')&&h.itemId.startsWith('pros-')&&!h.itemId.includes('--')&&['animal-husbandry','apiary','charcoal','dog-kennels','fishery','food-agriculture','fur-trade','herb-fields','horse-husbandry','basic-mine','valuable-mine','rich-mine','basic-quarry','valuable-quarry','salt-works','textile-agriculture','timber'].some(id=>h.itemId==='pros-'+id))))errors.push('O domínio permite somente uma exploração Estate.');
  if(item.category==='settlement'&&!['pros-abbey','pros-tolls','pros-trading-inn'].includes(item.id)){const c=settlementCapacity(state,domain?.id??'',supportId);if(c.error)errors.push(c.error);else if(c.used>=c.capacity)errors.push(`Sem espaço no suporte: ${c.used} de ${c.capacity} ocupado(s).`);}
  if(item.category==='improvement'&&!item.coexists&&!item.repeatable&&state.holdings.some(h=>h.parentId===parentId&&!h.coexists&&['active','building'].includes(h.status)))errors.push('Esta melhoria não pode ser combinada com outra melhoria exclusiva.');
  if(item.category==='fortification'){
    const major=['hall','small-castle','castle','superior-castle'],order=['tower',...major];
    const existing=state.holdings.filter(h=>h.domainId===domain?.id&&order.includes(h.itemId)&&['active','building'].includes(h.status));
    const majors=existing.filter(h=>major.includes(h.itemId));
    const replacing=existing.find(h=>h.id===replaceId);
    if(replaceId){
      if(!replacing||replacing.status!=='active')errors.push('Fortificação ativa a evoluir não encontrada.');
      else if(order.indexOf(item.id)<=order.indexOf(replacing.itemId))errors.push('A nova fortificação deve ser maior que a existente.');
      if(major.includes(item.id)&&majors.some(h=>h.id!==replaceId))errors.push('O domínio já possui uma fortificação principal.');
    }else if(major.includes(item.id)&&majors.length)errors.push('A fortificação principal exige evolução da existente.');
    // Secondary towers may coexist with a hall/castle, and multiple towers may be erected.
  }
  if(item.category==='community'&&replaceId){
    const order=['hamlet','small-town','large-town','small-city','large-city'];
    const previous=state.holdings.find(h=>h.id===replaceId&&h.domainId===domain?.id&&h.status==='active'&&h.category==='community');
    if(!previous||previous.itemId!==domain?.community)errors.push('Comunidade ativa a evoluir não encontrada.');
    else if(order.indexOf(item.id)<=order.indexOf(previous.itemId))errors.push('A nova comunidade deve ser maior que a atual.');
  }
  if(replaceId&&!['fortification','community'].includes(item.category))errors.push('Esta posse não permite evolução.');
  if(replaceId&&state.holdings.some(h=>h.replacesId===replaceId&&h.status==='building'))errors.push('Esta posse já possui uma evolução em obra.');
  const communityOrder=['','hamlet','small-town','large-town','small-city','large-city'];
  const hasHolding=(values:string[]|undefined)=>(values?.length??0)>0&&state.holdings.some(h=>
    h.domainId===domain?.id&&h.status==='active'&&values?.includes(h.itemId));
  const hasFortification=(values:string[]|undefined)=>(values?.length??0)>0&&state.holdings.some(h=>
    h.domainId===domain?.id&&h.status==='active'&&values?.includes(h.itemId));
  const matchAlternative=(alternative:NonNullable<Requirement['alternatives']>[number]):boolean=>{
    if(!domain)return false;
    if(alternative.kind==='terrain')return Boolean(domain.terrain&&alternative.values?.includes(domain.terrain));
    if(alternative.kind==='feature')return Boolean(alternative.values?.some(v=>domain.features.includes(v)));
    if(alternative.kind==='community')return Boolean(alternative.values?.includes(domain.community??''));
    if(alternative.kind==='holding')return hasHolding(alternative.values);
    if(alternative.kind==='fortification')return hasFortification(alternative.values);
    if(alternative.kind==='water')return domain.features.some(f=>['coast','river','stream','lake-small','lake-large','pond','island'].includes(f));
    return false;
  };
  for (const req of item.requirements) {
    if (req.kind==='terrain' && (!domain?.terrain || (req.values?.length && !req.values.includes(domain.terrain)))) errors.push('Terreno necessário: '+(req.values?.join(', ') || 'um terreno principal adquirido'));
    if (req.kind==='feature' && !req.values?.some(v=>domain?.features.includes(v))) errors.push('Característica necessária: '+req.values?.join(', '));
    if (req.kind==='water' && !domain?.features.some(f=>['coast','river','stream','lake-small','lake-large','pond'].includes(f))) errors.push('Exige acesso à água.');
    if (req.kind==='parent' && !state.holdings.some(h=>h.id===parentId&&h.status==='active'&&req.values?.includes(h.itemId))) errors.push('A melhoria exige sua posse principal ativa.');
    if (req.kind==='resource' && req.resource && balances(state).total[req.resource] < (req.minimum ?? 0)) errors.push('Recurso mínimo não atingido.');
    if (req.kind==='community' && !req.values?.includes(domain?.community??'')) errors.push('Comunidade exigida: '+req.values?.join(', '));
    if (req.kind==='fortification' && !state.holdings.some(h=>h.domainId===domain?.id&&h.status==='active'&&req.values?.includes(h.itemId))) errors.push('Fortificação compatível ativa necessária.');
    if(req.kind==='max_community' && (!domain||communityOrder.indexOf(domain.community??'')<0||
      communityOrder.indexOf(domain.community??'')>communityOrder.indexOf(req.values?.[0]??'')))
      errors.push('Comunidade maior que o limite permitido: '+(req.values?.[0]??'nenhuma')+'.');
    if(req.kind==='max_resource'&&req.resource&&balances(state).total[req.resource]>(req.maximum??Infinity))
      errors.push('Recurso acima do máximo permitido: '+req.resource+' '+(req.maximum??'')+'.');
    if(req.kind==='forbidden_feature'&&domain?.features.some(f=>req.values?.includes(f)))
      errors.push('O domínio possui característica proibida: '+(req.values?.join(', ')??'')+'.');
    if(req.kind==='holding'&&!hasHolding(req.values))
      errors.push('Exige posse ativa no mesmo domínio: '+(req.values?.join(', ')??'')+'.');
    // Starting a historical house at character creation is not a calendar-bound construction order.
    if(req.kind==='forbidden_season'&&state.phase==='active'&&req.values?.includes(houseSeason(state.month)))
      errors.push('Esta posse não pode ser iniciada nesta estação: '+houseSeason(state.month)+'.');
    if(req.kind==='any_of'&&(!req.alternatives?.length||!req.alternatives.some(matchAlternative)))
      errors.push('Exige ao menos uma das alternativas de local ou posse indicadas na ficha.');

  }
  return errors;
}
export function quote(item:CatalogItem,state:HouseState,domainId:string,parentId?:string,supportId?:string,replaceId?:string,extraAreas=0){
 const before=balances(state),domain=state.domains.find(d=>d.id===domainId),costs=item.costs.map(c=>({...c}));
 const errors=requirements(item,state,domain,parentId,supportId,replaceId);
 if(!Number.isInteger(extraAreas)||extraAreas<0||extraAreas>20)errors.push('Número de áreas adicionais inválido.');
 if(item.id==='pros-standard-of-living--entourage'){
  const parent=state.holdings.find(h=>h.id===parentId&&h.status==='active');
  const price:Record<string,number>={'pros-comfortable':5,'pros-rich':10,'pros-lavish':20};
  if(!parent||price[parent.itemId]===undefined)errors.push('Séquito exige padrão de vida Confortável, Rico ou Luxuoso.');
  else costs.splice(0,costs.length,{resource:'wealth',amount:price[parent.itemId]!,mode:'allocation'});
 }
 if(item.id==='pros-townhouse'){
  const price:Record<string,number>={'small-town':5,'large-town':5,'small-city':10,'large-city':15};
  if(!domain||price[domain.community??'']===undefined)errors.push('Residência urbana exige Vila Pequena ou maior.');
  else costs.splice(0,costs.length,{resource:'wealth',amount:price[domain.community??'']!,mode:'allocation'});
 }
 if(item.id==='pros-minstrel-s-seat--speakers-listeners')
  costs.splice(0,costs.length,{resource:'wealth',amount:3+2*extraAreas,mode:'allocation'});
 else if(extraAreas)errors.push('Áreas adicionais não aplicáveis a esta posse.');
 // Multiple independent discounts stack. A positive nominal cost retains a floor of one point.
 const discounts:{source:string;resource:Resource;amount:number}[]=[];
 for(const cost of costs){
  const effects=activeHoldings(state).flatMap(h=>h.effects.filter(e=>e.kind==='discount'&&e.target===item.id&&e.resource===cost.resource).map(e=>({source:h.name,resource:cost.resource,amount:e.amount??0})));
  let reduction=Math.min(effects.reduce((n,e)=>n+Math.max(0,e.amount),0),Math.max(0,cost.amount-1));
  cost.amount-=reduction;
  for(const source of effects){const applied=Math.min(source.amount,reduction);if(applied>0){discounts.push({...source,amount:applied});reduction-=applied;}}
 }
 const old=replaceId?state.holdings.find(h=>h.id===replaceId):undefined;
 const replacedCosts:Partial<Record<Resource,number>>={};
 if(old&&old.status==='active'){
  const invested=holdingAllocation(old);
  for(const r of RESOURCE_KEYS)if(invested[r])replacedCosts[r]=invested[r];
 }
 const after={...before.available},reserved=costs.map(c=>({...c}));
 if(old&&['community','fortification'].includes(item.category)){
  // A construction upgrade commits only the positive difference until completion.
  for(const cost of reserved)if(cost.mode==='allocation')
   cost.amount=Math.max(0,cost.amount-(replacedCosts[cost.resource]??0));
 }
 for(const cost of reserved){if(!Number.isFinite(cost.amount)||cost.amount<0)errors.push('Custo inválido.');
  after[cost.resource]-=cost.amount;}
 for(const r of RESOURCE_KEYS)if(after[r]<0)errors.push('Saldo insuficiente: '+r+'.');
 return {before:before.available,after,costs,original:item.costs,discounts,errors,replacedCosts,reservedCosts:reserved};
}
export function purchase(state:HouseState,item:CatalogItem,args:{
 id:string;domainId:string;name:string;parentId?:string|undefined;supportId?:string|undefined;dice:number[];
 replaceId?:string|undefined;extraAreas?:number|undefined;
}):HouseState {
 const q=quote(item,state,args.domainId,args.parentId,args.supportId,args.replaceId,args.extraAreas??0);
 if(q.errors.length)throw new Error(q.errors.join(' '));
 const next=structuredClone(state),old=args.replaceId?next.holdings.find(h=>h.id===args.replaceId):undefined;
 const upgrading=Boolean(old),building=state.phase==='active'&&(upgrading||item.duration.months>0||Boolean(item.duration.dice));
 const expected=building?(item.duration.dice??0):0;
 if(args.dice.length!==expected||args.dice.some(v=>!Number.isInteger(v)||v<1||v>(item.duration.sides??6)))
  throw new Error('Dados de duração inválidos.');
 if(next.holdings.some(h=>h.id===args.id))throw new Error('Identificador de compra já utilizado.');
 const currentCosts=building&&upgrading?q.reservedCosts:q.costs;
 const allocatedCosts:Partial<Record<Resource,number>>={};
 for(const c of currentCosts)if(c.mode==='allocation')allocatedCosts[c.resource]=(allocatedCosts[c.resource]??0)+c.amount;
 // Active castles remain in service until the replacement project is completed.
 const holdOld=upgrading&&building;
 if(upgrading&&!holdOld){
  for(const h of next.holdings)if(h.supportId===args.replaceId)h.supportId=args.id;
  next.holdings=next.holdings.filter(h=>h.id!==args.replaceId);
 }
 next.holdings.push({id:args.id,itemId:item.id,name:args.name||item.name,domainId:args.domainId,
 parentId:args.parentId,supportId:args.supportId,replacesId:holdOld?args.replaceId:undefined,upgradeFinalCosts:holdOld?q.costs:undefined,
 coexists:item.coexists,costs:currentCosts,originalCosts:structuredClone(item.costs),discounts:q.discounts,
 category:item.category,effects:structuredClone(item.effects),ruleVersion:item.version,source:item.source+' · '+item.section,
 status:building?'building':'active',allocatedCosts});
 for(const cost of currentCosts)if(cost.mode==='permanent')next.permanent[cost.resource]-=cost.amount;
 const domain=next.domains.find(d=>d.id===args.domainId);
 if(domain){if(item.category==='terrain')domain.terrain=item.id;
 if(item.category==='feature')domain.features.push(item.id);
 if(item.category==='community'&&!holdOld)domain.community=item.id;}
 if(building){
  let duration=item.duration.months+args.dice.reduce((a,b)=>a+b,0);
  if(upgrading){
   const nominal=q.costs.filter(c=>c.mode==='allocation').reduce((sum,c)=>sum+c.amount,0);
   const difference=q.reservedCosts.filter(c=>c.mode==='allocation').reduce((sum,c)=>sum+c.amount,0);
   duration=Math.max(1,Math.ceil(duration*(nominal?difference/nominal:1)));
  }
  next.projects.push({id:args.id,holdingId:args.id,name:args.name||item.name,start:state.month,duration,dice:args.dice,status:'building',modifier:0});
 }
 return next;
}
export const TRAINING = { green:{name:'Verde',power:1,xp:20,discipline:9}, trained:{name:'Treinada',power:3,xp:60,discipline:6}, veteran:{name:'Veterana',power:5,xp:100,discipline:3}, elite:{name:'Elite',power:7,xp:140,discipline:0} };
export type UnitType = {id:string;name:string;cost:number;discipline:number;skills:string[];description:string;source:string;armor?:number;penalty?:number;strength?:number;pending?:string};
export const UNIT_TYPES: UnitType[] = ([
  ['support','Apoio',2,3,['healing','animalHandling','endurance'],0,0],
  ['archers','Arqueiros',3,3,['agility','awareness','marksmanship'],2,1],
  ['scouts','Batedores',2,3,['stealth','awareness','endurance'],2,1],
  ['cavalry','Cavalaria',5,-3,['agility','animalHandling','fighting'],5,3],
  ['criminals','Criminosos',1,6,['stealth','fighting','endurance'],1,0],
  ['crusaders','Cruzados',4,0,['athletics','fighting','endurance'],3,2],
  ['engineers','Engenheiros',2,3,['warfare','fighting','endurance'],2,1],
  ['special','Especial',5,0,['agility','athletics','awareness','endurance','fighting','marksmanship','stealth','cunning','healing','animalHandling','warfare','survival'],2,1],
  ['personal-guard','Guarda pessoal',6,-6,['athletics','fighting','endurance'],6,3],
  ['garrison','Guarnição',2,-3,['fighting','awareness','endurance'],3,2],
  ['guerrillas','Guerrilheiros',2,3,['athletics','stealth','marksmanship'],1,0],
  ['infantry','Infantaria',4,0,['athletics','fighting','endurance'],3,2],
  ['sailors','Marinheiros',4,0,['agility','fighting','awareness'],0,0],
  ['mercenaries','Mercenários',1,3,['athletics','fighting','endurance'],4,2],
  ['warships','Navios de guerra',7,0,['fighting','awareness','marksmanship'],5,0],
  ['levies','Plebeus recrutados',0,6,['animalHandling','awareness','survival'],0,0],
  ['raiders','Saqueadores',3,3,['agility','fighting','endurance'],2,1],
] as const).map(([id,name,cost,discipline,skills,armor,penalty])=>({id,name,cost,discipline,skills:[...skills],armor,penalty,strength:id==='cavalry'?20:id==='warships'?5:100,description:id==='garrison'?'Disciplina −3 em seu lar, +3 fora dele.':id==='cavalry'?'20 cavaleiros e montarias; Atletismo e Vigor das montarias.':id==='mercenaries'?'Contrato com custo adicional de Riqueza segundo treinamento, sem manutenção mensal presumida.':id==='warships'?'Cinco navios; exige água e transporta uma unidade.':'100 soldados; custo do tipo soma ao treinamento.',source:'Guerra dos Tronos RPG · tabela 6-8, pp. 136–139; tabela 10-1, p. 219'}));
export function unitStats(unit: Unit) {
  const training = TRAINING[unit.training as keyof typeof TRAINING];
  if(!training) throw new Error('Treinamento inválido.');
  const mounted=unit.types.includes('cavalry')&&unit.mounted!==false;
  const endurance=mounted&&unit.mount?unit.mount.endurance:unit.skills.endurance,athletics=mounted&&unit.mount?unit.mount.athletics:unit.skills.athletics;
  const movement=Math.max(0,(unit.types.includes('warships')?60:mounted?80:40)-(unit.bulk??0)*10);
  const garrisonAway=unit.types.includes('garrison')&&unit.atHome===false?6:0;
  return { movement,maxHealth:endurance*3, health:Math.max(0,Math.min(unit.health,endurance*3)), defense:unit.skills.agility+athletics+unit.skills.awareness-unit.armorPenalty, discipline:Math.max(0,training.discipline+unit.disciplineModifier+garrisonAway), xpSpent:SKILLS.reduce((sum,key)=>sum+Math.max(0,unit.skills[key]-2)*20,0) };
}
export function validateUnit(unit: Unit, state: HouseState, types: UnitType[]) {
  const training = TRAINING[unit.training as keyof typeof TRAINING]; if(!training)throw new Error('Treinamento inválido.');
  if(!unit.types.length || new Set(unit.types).size!==unit.types.length) throw new Error('Selecione tipos distintos.');
  const selected = unit.types.map(id=>types.find(t=>t.id===id));
  if(selected.some(t=>!t||t.pending))throw new Error('Tipo de unidade indisponível.');
  if(unit.types.includes('cavalry')&&(!unit.mount||!unit.mount.name.trim()||!unit.mount.source.trim()||![unit.mount.athletics,unit.mount.endurance].every(v=>Number.isInteger(v)&&v>=1&&v<=12)))throw new Error('Cavalaria exige montaria identificada, atributos e fonte.');
  if(unit.types.length>1&&!unit.types.includes(unit.equipmentTypeId??''))throw new Error('Escolha um conjunto completo de equipamento entre os tipos da unidade.');
  if(!state.domains.some(d=>d.id===unit.domainId))throw new Error('Domínio da unidade não encontrado.');
  if(unit.types.length>1&&!unit.mixedRule?.justification.trim())throw new Error('Tipos mistos exigem decisão explícita do Narrador sobre habilidades e Disciplina.');
  if(unit.mixedRule&&(!unit.mixedRule.allowedSkills.length||unit.mixedRule.allowedSkills.some(s=>!SKILLS.includes(s))||!Number.isInteger(unit.mixedRule.disciplineModifier)||Math.abs(unit.mixedRule.disciplineModifier)>30))throw new Error('Adaptação militar inválida.');
  const allowed = new Set(unit.types.length>1?unit.mixedRule?.allowedSkills:selected.flatMap(t=>t?.skills??[]));
  for(const s of SKILLS) { if(!Number.isInteger(unit.skills[s])||unit.skills[s]<2)throw new Error('Habilidade começa em 2.'); if(unit.skills[s]>2&&!allowed.has(s))throw new Error('Habilidade fora das opções deste tipo.'); }
  const spent = unitStats(unit).xpSpent; if(spent>training.xp) throw new Error('XP insuficiente.');
  if(unit.types.includes('special')&&SKILLS.filter(s=>unit.skills[s]>2).length>3)throw new Error('Unidade especial escolhe somente três habilidades.');
  if(unit.types.includes('warships')&&!state.domains.find(d=>d.id===unit.domainId)?.features.some(f=>['coast','river','lake-small','lake-large','island'].includes(f))) throw new Error('Navios exigem água navegável.');
  return selected;
}
export function createUnit(state: HouseState, unit: Unit, types: UnitType[]): HouseState {
  const selected = validateUnit(unit,state,types), training = TRAINING[unit.training as keyof typeof TRAINING];
  const costs:Cost[]=[{resource:'power',amount:training.power+selected.reduce((n,t)=>n+(t?.cost??0),0),mode:'allocation'}];
  if(unit.types.includes('levies')) costs.push({resource:'population',amount:2,mode:'permanent'});
  if(unit.types.includes('mercenaries')) costs.push({resource:'wealth',amount:({green:1,trained:3,veteran:6,elite:9})[unit.training as keyof typeof TRAINING],mode:'permanent'});
  for(const cost of costs){const discounts=activeHoldings(state).flatMap(h=>h.effects.filter(e=>e.kind==='discount'&&e.resource===cost.resource&&unit.types.some(t=>e.target==='unit:'+t)));const sum=discounts.reduce((a,b)=>a+(b.amount??0),0);cost.amount=Math.max(cost.amount>0?1:0,cost.amount-sum);}
  const available = balances(state).available;
  for(const cost of costs) {available[cost.resource]-=cost.amount;if(available[cost.resource]<0)throw new Error('Saldo insuficiente para a unidade.');}
  if(state.units.some(u=>u.id===unit.id))throw new Error('Identificador da unidade já utilizado.');
  const next=structuredClone(state), maxHealth=unitStats(unit).maxHealth;
  const allocatedCosts: Partial<Record<Resource, number>> = {};
  for(const c of costs) if(c.mode === 'allocation') allocatedCosts[c.resource] = (allocatedCosts[c.resource] || 0) + c.amount;
  next.units.push({...unit,costs,xp:training.xp-unitStats(unit).xpSpent,health:maxHealth,casualties:0,disciplineModifier:unit.types.length>1?(unit.mixedRule?.disciplineModifier??0):(selected[0]?.discipline??0),allocatedCosts});
  for(const c of costs)if(c.mode==='permanent')next.permanent[c.resource]-=c.amount;
  return next;
}
export function advance(state:HouseState,target:number):HouseState { if(!Number.isInteger(target)||target<state.month||target>state.month+120)throw new Error('Período inválido.');const next=structuredClone(state);next.month=target;for(const p of next.projects)if(p.status==='building'&&p.start+p.duration+p.modifier<=target){const h=next.holdings.find(h=>h.id===p.holdingId);if(!h||h.status!=='building'){p.status='cancelled';continue;}const parent=h.parentId?next.holdings.find(parent=>parent.id===h.parentId):undefined;if(h.parentId&&parent?.status!=='active')continue;if(h.replacesId){
   const old=next.holdings.find(x=>x.id===h.replacesId);
   if(!old||old.status!=='active'){p.status='cancelled';h.status='cancelled';continue;}
   const oldAlloc=holdingAllocation(old);
   for(const r of RESOURCE_KEYS)h.allocatedCosts={...h.allocatedCosts,[r]:(h.allocatedCosts?.[r]??0)+oldAlloc[r]};
   h.costs=h.upgradeFinalCosts??h.costs;
   delete h.upgradeFinalCosts;
   for(const dependent of next.holdings)if(dependent.supportId===old.id)dependent.supportId=h.id;
   const domain=next.domains.find(d=>d.id===h.domainId);
   if(domain&&h.category==='community')domain.community=h.itemId;
   next.holdings=next.holdings.filter(x=>x.id!==old.id);
   delete h.replacesId;
  }
  p.status='completed';h.status='active';}return next; }
export function alternativeFortune(state:HouseState,resource:Resource):HouseState {if(state.fortunes.some(f=>f.month===state.month))throw new Error('A Sorte deste mês já foi resolvida.');const lastRoll=[...state.fortunes].reverse().find(f=>f.mode==='roll');const first=state.fortunes[0];if((lastRoll&&state.month-lastRoll.month>=3)||(!lastRoll&&first&&state.month-first.month>=2))throw new Error('É necessário rolar Sorte ao menos uma vez a cada três meses.');const next=structuredClone(state);next.permanent[resource]+=1;next.fortunes.push({month:state.month,mode:'alternative',dice:[],bonusDice:[],modifier:0,result:0,outcome:'+1 recurso sem rolagem',resource,changes:{[resource]:1},source:'Livro básico · Sorte da casa; Prosperidade · Resource Gain Bonus'});return next; }
export function gainFromFortune(state:HouseState,resource:Resource,amount:number,rolled:boolean) { if(!rolled||amount<=0)return amount;const effects=activeHoldings(state).flatMap(h=>h.effects).filter(e=>e.kind==='gain'&&e.resource===resource);if(effects.length>1)throw new Error('Empilhamento exige dados registrados; não some bônus fixos.');return amount+(effects[0]?.amount??0); }
export function ledgerEntry(before:HouseState,after:HouseState,action:string,key:string,explanation:string,rule:string):Ledger {return {id:key,key,action,explanation,rule,campaignMonth:after.month,before:balances(before).total,after:balances(after).total};}

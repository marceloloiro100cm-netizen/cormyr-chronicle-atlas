import { RESOURCE_KEYS, SKILLS, zeroResources, type CatalogItem, type Cost, type Domain, type HouseState, type Ledger, type Resources, type Resource, type Unit } from './types';
import { regionBonus } from './regions';
export type Balance = { total: Resources; allocated: Resources; committed: Resources; available: Resources; permanent: Resources };
export function balances(state: HouseState): Balance {
  const regional = state.regionalApplied && state.method !== 'import' ? regionBonus(state.identity.region) : zeroResources();
  const total = zeroResources(), allocated = zeroResources(), committed = zeroResources(), available = zeroResources();
  for (const r of RESOURCE_KEYS) total[r] = state.base[r] + state.permanent[r] + regional[r];
  for (const holding of state.holdings) {
    if (holding.status === 'cancelled' || holding.status === 'sold') continue;
    for (const cost of holding.costs) if (cost.mode === 'allocation') {
      if (holding.status === 'building') committed[cost.resource] += cost.amount;
      else allocated[cost.resource] += cost.amount;
    }
  }
  for (const unit of state.units) for (const cost of unit.costs) if (cost.mode === 'allocation') allocated[cost.resource] += cost.amount;
  for (const r of RESOURCE_KEYS) available[r] = total[r] - allocated[r] - committed[r];
  return {total, allocated, committed, available, permanent: state.permanent};
}
export function validateResources(values: Resources) { for (const r of RESOURCE_KEYS) if (!Number.isFinite(values[r]) || Math.abs(values[r]) > 100000) throw new Error('Valor de recurso inválido.'); }
export function requirements(item: CatalogItem, state: HouseState, domain?: Domain, parentId?: string): string[] {
  const errors: string[] = [];
  if (item.pending) errors.push(item.pending);
  if (['terrain','feature','community','fortification','estate','settlement'].includes(item.category) && !domain) errors.push('Escolha um domínio.');
  if (item.category === 'terrain' && domain?.terrain) errors.push('O domínio já possui terreno principal.');
  if (item.category === 'community' && domain?.community) errors.push('O domínio já possui uma comunidade.');
  if (!item.repeatable && state.holdings.some(h=>h.itemId===item.id && h.domainId === (domain?.id ?? '') && ['active','building'].includes(h.status))) errors.push('Esta posse já existe neste local.');
  for (const req of item.requirements) {
    if (req.kind==='terrain' && (!domain?.terrain || (req.values?.length && !req.values.includes(domain.terrain)))) errors.push('Terreno necessário: '+(req.values?.join(', ') || 'um terreno principal adquirido'));
    if (req.kind==='feature' && !req.values?.some(v=>domain?.features.includes(v))) errors.push('Característica necessária: '+req.values?.join(', '));
    if (req.kind==='water' && !domain?.features.some(f=>['coast','river','stream','lake-small','lake-large','pond'].includes(f))) errors.push('Exige acesso à água.');
    if (req.kind==='parent' && !state.holdings.some(h=>h.id===parentId&&h.status==='active'&&req.values?.includes(h.itemId))) errors.push('A melhoria exige sua posse principal ativa.');
    if (req.kind==='resource' && req.resource && balances(state).total[req.resource] < (req.minimum ?? 0)) errors.push('Recurso mínimo não atingido.');
    if (req.kind==='community' && !req.values?.includes(domain?.community??'')) errors.push('Comunidade exigida: '+req.values?.join(', '));
    if (req.kind==='fortification' && !state.holdings.some(h=>h.domainId===domain?.id&&h.status==='active'&&req.values?.includes(h.itemId))) errors.push('Fortificação compatível ativa necessária.');
  }
  return errors;
}
export function quote(item: CatalogItem, state: HouseState, domainId: string, parentId?: string) {
  const before = balances(state), costs = item.costs.map(c=>({...c}));
  const errors = requirements(item, state, state.domains.find(d=>d.id===domainId), parentId);
  const discounts: { source: string; resource: Resource; amount: number }[] = [];
  for (const cost of costs) {
    const discountEffects = state.holdings.filter(h=>h.status==='active').flatMap(h=>h.effects.filter(e=>e.kind==='discount'&&e.target===item.id&&e.resource===cost.resource).map(e=>({source:h.name, amount:e.amount??0})));
    // No implicit stacking: largest explicit discount only, never below zero.
    const best = discountEffects.sort((a,b)=>b.amount-a.amount)[0];
    if (best) { const amount = Math.min(best.amount,cost.amount); cost.amount -= amount; discounts.push({source:best.source,resource:cost.resource,amount}); }
  }
  const after = {...before.available};
  for (const cost of costs) { if (!Number.isFinite(cost.amount)||cost.amount<0) errors.push('Custo inválido.'); after[cost.resource]-=cost.amount; }
  for (const r of RESOURCE_KEYS) if (after[r]<0) errors.push(`Saldo insuficiente: ${r}.`);
  return {before:before.available,after,costs,original:item.costs,discounts,errors};
}
export function purchase(state: HouseState, item: CatalogItem, args: {id:string;domainId:string;name:string;parentId?:string;dice:number[]}): HouseState {
  const q = quote(item,state,args.domainId,args.parentId); if(q.errors.length) throw new Error(q.errors.join(' '));
  const next = structuredClone(state), building = state.phase==='active' && (item.duration.months>0||Boolean(item.duration.dice));
  const expected = building ? (item.duration.dice??0) : 0;
  if(args.dice.length!==expected || args.dice.some(v=>!Number.isInteger(v)||v<1||v>(item.duration.sides??6))) throw new Error('Dados de duração inválidos.');
  next.holdings.push({id:args.id,itemId:item.id,name:args.name||item.name,domainId:args.domainId,parentId:args.parentId,costs:q.costs,effects:item.effects,ruleVersion:item.version,source:item.source+' · '+item.section,status:building?'building':'active'});
  for(const cost of q.costs) if(cost.mode==='permanent') next.permanent[cost.resource]-=cost.amount;
  const domain = next.domains.find(d=>d.id===args.domainId);
  if(domain) { if(item.category==='terrain') domain.terrain=item.id; if(item.category==='feature') domain.features.push(item.id); if(item.category==='community') domain.community=item.id; }
  if(building) next.projects.push({id:args.id,holdingId:args.id,name:args.name||item.name,start:state.month,duration:item.duration.months+args.dice.reduce((a,b)=>a+b,0),dice:args.dice,status:'building',modifier:0});
  return next;
}
export const TRAINING = { green:{name:'Verde',power:1,xp:20,discipline:9}, trained:{name:'Treinada',power:3,xp:60,discipline:6}, veteran:{name:'Veterana',power:5,xp:100,discipline:3}, elite:{name:'Elite',power:7,xp:140,discipline:0} };
export type UnitType = {id:string;name:string;cost:number;discipline:number;skills:string[];description:string;source:string;armor?:number;penalty?:number;strength?:number;pending?:string};
export const UNIT_TYPES: UnitType[] = [];
export function unitStats(unit: Unit) {
  const training = TRAINING[unit.training as keyof typeof TRAINING];
  if(!training) throw new Error('Treinamento inválido.');
  return { maxHealth:unit.skills.endurance*3, health:Math.max(0,Math.min(unit.health,unit.skills.endurance*3)), defense:unit.skills.agility+unit.skills.athletics+unit.skills.awareness-unit.armorPenalty, discipline:Math.max(0,training.discipline+unit.disciplineModifier), xpSpent:SKILLS.reduce((sum,key)=>sum+Math.max(0,unit.skills[key]-2)*20,0) };
}
export function validateUnit(unit: Unit, state: HouseState, types: UnitType[]) {
  const training = TRAINING[unit.training as keyof typeof TRAINING]; if(!training)throw new Error('Treinamento inválido.');
  if(!unit.types.length || new Set(unit.types).size!==unit.types.length) throw new Error('Selecione tipos distintos.');
  const selected = unit.types.map(id=>types.find(t=>t.id===id));
  if(selected.some(t=>!t||t.pending))throw new Error('Tipo de unidade indisponível.');
  const allowed = new Set(selected.flatMap(t=>t?.skills??[]));
  for(const s of SKILLS) { if(!Number.isInteger(unit.skills[s])||unit.skills[s]<2)throw new Error('Habilidade começa em 2.'); if(unit.skills[s]>2&&!allowed.has(s))throw new Error('Habilidade fora das opções deste tipo.'); }
  const spent = unitStats(unit).xpSpent; if(spent>training.xp) throw new Error('XP insuficiente.');
  if(unit.types.includes('warships')&&!state.domains.find(d=>d.id===unit.domainId)?.features.some(f=>['coast','river','lake-large'].includes(f))) throw new Error('Navios exigem água navegável.');
  return selected;
}
export function createUnit(state: HouseState, unit: Unit, types: UnitType[]): HouseState {
  const selected = validateUnit(unit,state,types), training = TRAINING[unit.training as keyof typeof TRAINING];
  const costs:Cost[]=[{resource:'power',amount:training.power+selected.reduce((n,t)=>n+(t?.cost??0),0),mode:'allocation'}];
  if(unit.types.includes('levies')) costs.push({resource:'population',amount:2,mode:'permanent'});
  if(unit.types.includes('mercenaries'))throw new Error('Mercenários exigem contrato e conciliação do custo; não trate como Poder comum.');
  const available = balances(state).available;
  for(const cost of costs) {available[cost.resource]-=cost.amount;if(available[cost.resource]<0)throw new Error('Saldo insuficiente para a unidade.');}
  const next=structuredClone(state), maxHealth=unit.skills.endurance*3;
  next.units.push({...unit,costs,xp:training.xp-unitStats(unit).xpSpent,health:maxHealth,casualties:0,disciplineModifier:selected.reduce((n,t)=>n+(t?.discipline??0),0)});
  for(const c of costs)if(c.mode==='permanent')next.permanent[c.resource]-=c.amount;
  return next;
}
export function advance(state:HouseState,target:number):HouseState { if(!Number.isInteger(target)||target<state.month||target>state.month+120)throw new Error('Período inválido.');const next=structuredClone(state);next.month=target;for(const p of next.projects)if(p.status==='building'&&p.start+p.duration+p.modifier<=target){p.status='completed';const h=next.holdings.find(h=>h.id===p.holdingId);if(h)h.status='active';}return next; }
export function alternativeFortune(state:HouseState,resource:Resource):HouseState {if(state.fortunes.some(f=>f.month===state.month))throw new Error('A Sorte deste mês já foi resolvida.');const lastRoll=[...state.fortunes].reverse().find(f=>f.mode==='roll');const first=state.fortunes[0];if((lastRoll&&state.month-lastRoll.month>=3)||(!lastRoll&&first&&state.month-first.month>=2))throw new Error('É necessário rolar Sorte ao menos uma vez a cada três meses.');const next=structuredClone(state);next.permanent[resource]+=1;next.fortunes.push({month:state.month,mode:'alternative',dice:[],bonusDice:[],modifier:0,result:0,outcome:'+1 recurso sem rolagem',resource,changes:{[resource]:1},source:'Livro básico · Sorte da casa; Prosperidade · Resource Gain Bonus'});return next; }
export function gainFromFortune(state:HouseState,resource:Resource,amount:number,rolled:boolean) { if(!rolled)return amount;const effects=state.holdings.filter(h=>h.status==='active').flatMap(h=>h.effects).filter(e=>e.kind==='gain'&&e.resource===resource);if(effects.length>1)throw new Error('Empilhamento exige dados registrados; não some bônus fixos.');return amount+(effects[0]?.amount??0); }
export function ledgerEntry(before:HouseState,after:HouseState,action:string,key:string,explanation:string,rule:string):Ledger {return {id:key,key,action,explanation,rule,campaignMonth:after.month,before:balances(before).total,after:balances(after).total};}
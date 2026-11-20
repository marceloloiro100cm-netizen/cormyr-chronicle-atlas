import {z} from 'zod';
import {removeCourtAssignment} from './court';
import {renameMilitaryHolding,editUnitProfile} from './unit-progression';
import {setVassalLoyalty} from './military';
import {unitSchema} from './schemas';
import {operationSchema} from './schemas';
import {isMonthSensitiveHouseAction} from './monthly-operation-policy';
import {RESOURCE_KEYS,SKILLS,type HouseState} from './types';
import {createUnit,balances,activeHoldings,UNIT_TYPES} from './engine';
import {equipUnit,changeUnitState,resolveSurvivors,
 SURVIVOR_CONDITIONS} from './military';
import {changeSiegeAssignment} from './siege';
import {grantUnitXp,unitAllowedSkills} from './unit-progression';
import {resourcesSchema} from './schemas';
import {depositGold,donateGold,donateGlory,spendInfluence,
 redeemIntrigueBonus} from './resource-transactions';
import {alternativeFortune} from './engine';
import {convertResources} from './fortune';
import {improveEquipment} from './equipment';
import {trainUnit,endVassal} from './military';
import {buySiege} from './siege';

export type HouseAction=z.infer<typeof operationSchema>['action'];
export const HOUSE_ACTIONS=operationSchema.shape.action.options;
const narratorOnly=new Set<HouseAction>([
 'admin_edit','restore_legacy_effects','reconcile_legacy_costs',
 'treasury_deposit','donate_glory','approve','advance','import','correct',
 'fortune','survivors','grant_unit_xp','vassal_approve','vassal_end',
 'vassal_loyalty','vassal_npcs','sync_calendar','return_to_draft',
 'clear_pending',
]);
const allowedOnReview=new Set<HouseAction>([
 'admin_edit','restore_legacy_effects','reconcile_legacy_costs',
 'treasury_deposit','donate_gold','donate_glory','spend_influence',
 'redeem_intrigue','crest_import','approve','correct',
 'return_to_draft','clear_pending',
]);

/** Política de permissão, fase e sincronização independente de banco. */
export function requireHouseOperationRole(action:HouseAction,admin:boolean):void{
 if(narratorOnly.has(action)&&!admin)
  throw Error('Somente o Narrador pode confirmar esta operação.');
}
export function requireHouseOperationPhase(state:HouseState,action:HouseAction):void{
 if(action==='advance')
  throw Error('Avanço individual desativado: publique a data no Calendário global do Narrador.');
 if(state.phase==='review'&&!allowedOnReview.has(action))
  throw Error('Criação em revisão; aguarde aprovação ou correção do Narrador.');
}
export function needsHouseOperationCalendar(state:HouseState,action:HouseAction):boolean{
 return state.phase==='active'&&isMonthSensitiveHouseAction(action);
}

/** Primeira extração de transições puras, sem I/O nem estado compartilhado.
 * A implementação original ainda mantém os demais grupos de ações. */
export function applyHouseDomainOperation(
 state:HouseState,
 action:'domain'|'domain_edit'|'domain_delete',
 args:Record<string,unknown>,
):{state:HouseState;rule:string}{
 const next=structuredClone(state);
 let rule='Cormyr · gestão auditada';
 if(action==='domain'){
  const domain=z.object({id:z.string().uuid(),name:z.string().min(1).max(160),
   notes:z.string().max(4000)}).parse(args);
  if(state.domains.some(d=>d.id===domain.id))
   throw Error('Domínio já cadastrado.');
  next.domains.push({...domain,terrain:'',features:[]});
 }
 if(action==='domain_edit'){
  const input=z.object({id:z.string(),name:z.string().trim().min(1).max(160),
   notes:z.string().max(4000)}).parse(args);
  const d=next.domains.find(d=>d.id===input.id);
  if(!d)throw Error('Domínio não encontrado.');
  d.name=input.name;d.notes=input.notes;
  rule='Correção de nome e notas do domínio, sem alterar posses';
 }
 if(action==='domain_delete'){
  const {id}=z.object({id:z.string()}).parse(args);
  if(state.phase!=='draft')
   throw Error('A exclusão de domínio só é permitida na criação; em campanha exige conciliação auditada.');
  const d=state.domains.find(d=>d.id===id);
  if(!d)throw Error('Domínio não encontrado.');
  if(state.holdings.some(h=>h.domainId===id)||state.units.some(u=>u.domainId===id))
   throw Error('O domínio possui bens ou tropas; não pode ser excluído.');
  next.domains=next.domains.filter(d=>d.id!==id);
  rule='Exclusão de domínio vazio na criação';
 }
 return {state:next,rule};
}

/**
 * Segunda fatia pura das operações da Casa.
 * São apenas ações sem alteração econômica; compras e alterações de recursos
 * continuam bloqueadas até o motor transacional ter paridade comprovada.
 */
export const HOUSE_NON_ECONOMIC_ACTIONS=[
 'military_rename','court_remove','return_to_draft','clear_pending','approve',
 'unit_edit','vassal_loyalty',
] as const;
export type HouseNonEconomicAction=typeof HOUSE_NON_ECONOMIC_ACTIONS[number];

export function applyHouseNonEconomicOperation(
 state:HouseState,action:HouseNonEconomicAction,
 args:Record<string,unknown>,explanation:string,
):{state:HouseState;rule:string;explanation:string}{
 if(action==='military_rename'){
  const input=z.object({holdingId:z.string(),
   name:z.string().min(2).max(160)}).parse(args);
  return {state:renameMilitaryHolding(state,input),
   rule:'Cormyr · nome de instalação militar sem alteração de custo, efeitos ou alocações',
   explanation};
 }
 if(action==='court_remove'){
  const {id}=z.object({id:z.string().uuid()}).parse(args);
  return {state:removeCourtAssignment(state,id),
   rule:'Corte · vínculo removido; personagem e histórico preservados',
   explanation};
 }
 if(action==='unit_edit'){
  const input=z.object({unitId:z.string(),
   name:z.string().trim().min(1).max(160),origin:z.string().max(160),
   situation:z.string().max(1000),notes:z.string().max(4000),
   skills:unitSchema.shape.skills,extraSkills:unitSchema.shape.extraSkills,
   mount:unitSchema.shape.mount.optional()}).parse(args);
  return {state:editUnitProfile(state,input),
   rule:'Guerra dos Tronos RPG · edição de unidade e habilidades, 20 XP por graduação e déficit registrado',
   explanation};
 }
 if(action==='vassal_loyalty'){
  const input=z.object({id:z.string(),
   loyalty:z.enum(['loyal','neutral','rebellious'])}).parse(args);
  return {state:setVassalLoyalty(state,input.id,input.loyalty,explanation),
   rule:'Lealdade da vassala: '+input.loyalty+'; decisão narrativa auditada',
   explanation};
 }
 if(action==='return_to_draft'){
  if(state.phase!=='review')throw Error('A criação não está em revisão.');
  if(explanation.trim().length<5)throw Error('Registre o motivo da devolução.');
  return {state:{...structuredClone(state),phase:'draft'},
   rule:'Cormyr · revisão devolvida para rascunho',explanation};
 }
 if(action==='clear_pending'){
  const {indices}=z.object({indices:z.array(z.number().int().nonnegative()).min(1)}).parse(args);
  if(explanation.trim().length<10)throw Error('Registre como as pendências foram resolvidas.');
  if(indices.some(i=>i>=state.pending.length))throw Error('Pendência indisponível.');
  const next=structuredClone(state);
  next.pending=state.pending.filter((_,i)=>!indices.includes(i));
  return {state:next,rule:'Cormyr · pendências de conciliação resolvidas',
   explanation:explanation+' · Resolvidas: '+indices.map(i=>state.pending[i]).join('; ')};
 }
 if(action==='approve'){
  if(state.phase!=='review')throw Error('Envie a criação para revisão primeiro.');
  if(state.pending.length)throw Error('Resolva as pendências de conciliação.');
  return {state:{...structuredClone(state),phase:'active'},
   rule:'Cormyr · criação aprovada pelo Narrador',explanation};
 }
 throw Error('Ação não coberta pelo núcleo não econômico.');
}

/**
 * Transições econômicas já implementadas no motor original, sem I/O.
 * O serviço transacional valida estado, acesso, livro-caixa e versão
 * antes de persistir o resultado em campaignCloudRuntime.
 */
export const HOUSE_ECONOMIC_ACTIONS=[
 'treasury_deposit','donate_gold','donate_glory','spend_influence',
 'redeem_intrigue','correct','convert','alternative','equipment',
 'train_unit','siege','vassal_end',
] as const;
export type HouseEconomicAction=typeof HOUSE_ECONOMIC_ACTIONS[number];
export type HouseEconomicContext={admin:boolean;key:string;explanation:string};

export function applyHouseEconomicOperation(
 state:HouseState,action:HouseEconomicAction,args:Record<string,unknown>,
 ctx:HouseEconomicContext,
):{state:HouseState;rule:string}{
 const {admin,explanation}=ctx;
 if(action==='treasury_deposit'){
  if(!admin)throw Error('Somente o Narrador credita ouro no cofre.');
  const input=z.object({coins:z.number().int().positive().max(1_000_000),
   source:z.string().trim().min(6).max(500)}).parse(args);
  if(explanation.trim().length<10)
   throw Error('Registre a origem das moedas e a aprovação.');
  return {state:depositGold(state,input.coins),
   rule:'Cofre da Casa · '+input.coins+' DO creditados com comprovação '+input.source};
 }
 if(action==='donate_gold'){
  if(state.phase!=='active')throw Error('Doações em campanha exigem Casa ativa.');
  const {points}=z.object({points:z.number().int().min(1).max(10000)}).parse(args);
  return {state:donateGold(state,points),
   rule:'Livro básico p. 153 · '+points*200+' DO gastos do cofre = +'+points+' Riqueza permanente'};
 }
 if(action==='donate_glory'){
  if(!admin)throw Error('Glória individual exige verificação e aprovação do Narrador.');
  if(state.phase!=='active')throw Error('Doações em campanha exigem Casa ativa.');
  const input=z.object({resource:z.enum(RESOURCE_KEYS),
   points:z.number().int().min(1).max(100),
   character:z.string().trim().min(2).max(160),
   source:z.string().trim().min(8).max(500)}).parse(args);
  if(explanation.trim().length<10)
   throw Error('Documente o gasto de Glória pelo personagem.');
  return {state:donateGlory(state,input.resource,input.points),
   rule:'Livro básico p. 153 · '+input.points+' Glória de '+input.character+
    ' ('+input.source+') = +'+input.points+' '+input.resource+
    ' permanente; consumo individual deve constar na ficha do personagem'};
 }
 if(action==='spend_influence'){
  const input=z.object({kind:z.enum(['fortune','intrigue'])}).parse(args);
  return {state:spendInfluence(state,input.kind,ctx.key),
   rule:input.kind==='fortune'
    ?'Livro básico p. 134 · 5 Influência permanentes por +1D no teste da Sorte do mês'
    :'Livro básico p. 134 · 2 Influência permanentes por 1B em um teste de Intriga; vale pendente de uso'};
 }
 if(action==='redeem_intrigue'){
  const input=z.object({benefitId:z.string().uuid()}).parse(args);
  if(explanation.trim().length<10)
   throw Error('Registre qual Intriga utilizou o dado de bônus.');
  return {state:redeemIntrigueBonus(state,input.benefitId),
   rule:'Livro básico p. 134 · 1B de Intriga resgatado, sem novo custo'};
 }
 if(action==='correct'){
  if(!admin)throw Error('Correção de recursos exclusiva do Narrador.');
  if(explanation.trim().length<10)
   throw Error('Justificativa auditada exige pelo menos dez caracteres.');
  const changes=resourcesSchema.parse(args['changes']);
  if(RESOURCE_KEYS.every(r=>changes[r]===0))
   throw Error('Indique ao menos uma alteração.');
  if(RESOURCE_KEYS.some(r=>!Number.isSafeInteger(changes[r])))
   throw Error('Correção de recursos exige valores inteiros.');
  const next=structuredClone(state);
  for(const resource of RESOURCE_KEYS)next.permanent[resource]+=changes[resource];
  return {state:next,rule:'Correção ou estorno de recursos auditado pelo Narrador · variação: '+JSON.stringify(changes)};
 }
 if(action==='convert'){
  const input=z.object({from:z.enum(RESOURCE_KEYS),to:z.enum(RESOURCE_KEYS),
   amount:z.number().int().positive(),rushed:z.boolean(),
   rate:z.number().positive().optional()}).parse(args);
  if(state.phase!=='active')throw Error('Casa não ativa.');
  return {state:convertResources(state,input.from,input.to,input.amount,input.rushed,input.rate),
   rule:'Livro básico · tabela 6-19; ação mensal compartilhada'};
 }
 if(action==='alternative'){
  if(state.phase!=='active')throw Error('A casa precisa estar ativa.');
  return {state:alternativeFortune(state,z.enum(RESOURCE_KEYS).parse(args['resource'])),
   rule:'Cormyr · gestão auditada'};
 }
 if(action==='equipment'){
  const input=z.object({unitId:z.string(),
   category:z.enum(['armor','fighting','marksmanship'])}).parse(args);
  return {state:improveEquipment(state,input.unitId,input.category),
   rule:'Livro básico · tabelas10-1/10-2; 1 Riqueza permanente por categoria, limite uma'};
 }
 if(action==='train_unit'){
  if(state.phase!=='active')throw Error('Treinamento exige campanha ativa.');
  if(explanation.trim().length<10)throw Error('Justifique o treinamento.');
  const {unitId}=z.object({unitId:z.string()}).parse(args);
  return {state:trainUnit(state,unitId),
   rule:'Treinamento auditado da unidade; Poder adicional alocado'};
 }
 if(action==='siege'){
  const input=z.object({id:z.string().uuid(),itemId:z.string(),
   engineerId:z.string(),carrierId:z.string(),domainId:z.string(),
   name:z.string().max(160)}).parse(args);
  return {state:buySiege(state,input),
   rule:'Livro básico · Cerco e operadores,pp.223–230'};
 }
 if(action==='vassal_end'){
  if(!admin)throw Error('Encerrar a vassalagem exige decisão do Narrador.');
  if(explanation.trim().length<10)throw Error('Justificativa de rompimento necessária.');
  const input=z.object({id:z.string(),
   forfeitPower:z.boolean().default(false)}).parse(args);
  return {state:endVassal(state,input.id,explanation,input.forfeitPower),
   rule:'Rompimento auditado: '+(input.forfeitPower?'perda permanente':'liberação')+
    ' de Poder e término da penalidade de Influência'};
 }
 throw Error('Ação econômica não coberta pelo núcleo.');
}

/**
 * Operações militares puras: o ID de comandante e o evento de XP
 * são derivados da chave UUID transacional, nunca de sorteio interno.
 */
export const HOUSE_MILITARY_ACTIONS=[
 'unit','unit_state','grant_unit_xp','military_config','war_hounds',
 'broad_training','survivors','siege_state',
] as const;
export type HouseMilitaryAction=typeof HOUSE_MILITARY_ACTIONS[number];
export type HouseMilitaryContext={admin:boolean;key:string;explanation:string};
export function applyHouseMilitaryOperation(
 state:HouseState,action:HouseMilitaryAction,
 args:Record<string,unknown>,ctx:HouseMilitaryContext,
):{state:HouseState;rule:string;explanation?:string}{
 const {admin,explanation,key}=ctx;
 if(action==='unit'){
  const parsed=unitSchema.parse(args['unit']);
  if(parsed.types.length>1&&!admin)
   throw Error('O Narrador precisa confirmar a adaptação dos tipos mistos.');
  const unit=equipUnit({...parsed,costs:[],xp:0,equipment:[]});
  const next=createUnit(state,unit,UNIT_TYPES);
  if(parsed.commanderName&&!next.court.some(c=>c.name===parsed.commanderName))
   next.court.push({id:key,name:parsed.commanderName,
    role:'Comandante de Exército',notes:'Comandante gerado na tropa'});
  return {state:next,rule:'Livro básico · Tipos mistos e tabelas10-1/10-2'};
 }
 if(action==='unit_state'){
  const input=z.object({unitId:z.string(),mounted:z.boolean(),
   atHome:z.boolean(),health:z.number(),casualties:z.number().int(),
   situation:z.string().max(1000),commanderName:z.string().trim().max(160).optional(),
   domainId:z.string().optional(),disband:z.boolean().optional()}).parse(args);
  const next=changeUnitState(state,input);
  if(input.commanderName&&!next.court.some(c=>c.name===input.commanderName))
   next.court.push({id:key,name:input.commanderName,
    role:'Comandante de Exército',notes:'Comandante gerado na tropa'});
  return {state:next,rule:'Livro básico · Condição, cavalaria e guarnição'};
 }
 if(action==='grant_unit_xp'){
  if(!admin)throw Error('Somente o Narrador concede XP às unidades.');
  const input=z.object({unitId:z.string(),
   amount:z.number().int().min(1).max(1000),
   reason:z.string().trim().min(10).max(1000)}).parse(args);
  return {state:grantUnitXp(state,input,key),
   rule:'Cormyr · prêmio de experiência livre pelo Narrador, sem alterar treinamento nem habilidades',
   explanation:input.reason};
 }
 if(action==='military_config'){
  const input=z.object({holdingId:z.string(),kind:z.enum(['skill','unit','type']),
   value:z.string().max(160)}).parse(args);
  const next=structuredClone(state);
  const h=next.holdings.find(x=>x.id===input.holdingId&&x.status==='active');
  if(!h||!activeHoldings(state).some(x=>x.id===h.id))
   throw Error('Posse militar ativa não encontrada.');
  if(input.kind==='skill'){
   if(h.itemId!=='pros-military-academy--core-training')
    throw Error('Esta posse não permite selecionar habilidade.');
   const newSkill=z.enum(SKILLS).parse(input.value);
   if(h.militarySkill&&h.militarySkill!==newSkill&&!admin)
    throw Error('Somente o Narrador pode mudar a habilidade já designada.');
   h.militarySkill=newSkill;
  }else if(input.kind==='type'){
   if(h.itemId!=='pros-master-of-arms--field-master')
    throw Error('Especialidade inválida para esta posse.');
   if(!UNIT_TYPES.some(t=>t.id===input.value))
    throw Error('Tipo de unidade não encontrado.');
   if(h.militaryTypeId&&h.militaryTypeId!==input.value&&!admin)
    throw Error('Somente o Narrador pode trocar a especialização de Mestre de Campo.');
   h.militaryTypeId=input.value;
  }else{
   if(!['pros-trading-inn','pros-abbey--warrior-brotherhood'].includes(h.itemId))
    throw Error('A posse não permite designar uma unidade.');
   if(input.value&&!next.units.some(u=>u.id===input.value&&!u.destroyed&&
     u.domainId===h.domainId))
    throw Error('Unidade não pertence ao domínio da posse.');
   h.militaryUnitId=input.value||undefined;
  }
  return {state:next,
   rule:'Configuração auditada de bônus militar: '+h.name+' · '+input.kind+' '+input.value};
 }
 if(action==='war_hounds'){
  const input=z.object({unitId:z.string(),holdingId:z.string()}).parse(args);
  const next=structuredClone(state);
  const unit=next.units.find(u=>u.id===input.unitId&&!u.destroyed);
  const h=activeHoldings(state).find(h=>h.id===input.holdingId&&
    h.itemId==='pros-dog-kennels--war-hounds');
  if(!unit||!h)throw Error('Unidade ou Cães de Guerra indisponíveis.');
  if(unit.types.includes('warships')||
    (unit.types.includes('cavalry')&&unit.mounted!==false))
   throw Error('Cães de Guerra exigem unidade não montada e não naval.');
  if(unit.warHoundsHoldingId)
   throw Error('Unidade já equipada com cães de guerra.');
  if(balances(state).available.wealth<2)
   throw Error('Sem recursos: exigem 2 Riqueza para equipar os cães.');
  unit.warHoundsHoldingId=h.id;
  unit.costs.push({resource:'wealth',amount:2,mode:'permanent'});
  next.permanent.wealth-=2;
  return {state:next,rule:'Cães de Guerra equipados na unidade por 2 Riqueza permanente · '+h.name};
 }
 if(action==='broad_training'){
  const input=z.object({unitId:z.string(),skill:z.enum(SKILLS)}).parse(args);
  if(!activeHoldings(state).some(h=>h.itemId==='pros-military-academy--broad-training'))
   throw Error('Treinamento Amplo não está ativo.');
  const next=structuredClone(state);
  const unit=next.units.find(u=>u.id===input.unitId&&!u.destroyed);
  if(!unit||unit.broadTrainingSkill)
   throw Error('Unidade indisponível ou já treinada.');
  if(unitAllowedSkills(unit).has(input.skill))
   throw Error('Escolha a quarta habilidade fora das disponíveis originalmente.');
  unit.broadTrainingSkill=input.skill;
  next.actions.push({month:state.month,type:'broad_training',
   notes:unit.name+' · Treinamento Amplo: '+input.skill});
  return {state:next,
   rule:'Ação da Casa: Treinamento Amplo concede quarta habilidade elegível à unidade'};
 }
 if(action==='survivors'){
  const input=z.object({id:z.string().uuid(),unitId:z.string(),
   roll:z.number().int(),condition:z.enum(SURVIVOR_CONDITIONS),
   disorganizations:z.number().int().nonnegative(),skills:unitSchema.shape.skills,
   justification:z.string().min(1)}).parse(args);
  return {state:resolveSurvivors(state,input),
   rule:'Livro básico · tabela10-6 Sobreviventes'};
 }
 if(action==='siege_state'){
  if(!admin)throw Error('Reatribuição e baixa de equipamento de cerco requerem o Narrador.');
  if(explanation.trim().length<10)throw Error('Registre a decisão de cerco.');
  const input=z.object({id:z.string(),engineerId:z.string(),
   carrierId:z.string(),destroyed:z.boolean()}).parse(args);
  return {state:changeSiegeAssignment(state,input),
   rule:'Cerco: '+(input.destroyed?'destruição permanente':
    'mudança de operadores')+' auditada'};
 }
 throw Error('Ação militar não coberta pelo núcleo.');
}

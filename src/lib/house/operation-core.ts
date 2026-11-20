import {z} from 'zod';
import {removeCourtAssignment,assignCourt,validateCourtRecord} from './court';
import {isNarrativeNpc} from './narrative-npc';
import {validateVassalNpcs,linkVassalNpcs} from './vassal-links';
import {attachVassal} from './vassals';
import {renameMilitaryHolding,editUnitProfile} from './unit-progression';
import {setCustomImage} from './custom-images';
import {setVassalLoyalty} from './military';
import {unitSchema} from './schemas';
import {operationSchema} from './schemas';
import {isMonthSensitiveHouseAction} from './monthly-operation-policy';
import {RESOURCE_KEYS,SKILLS,type HouseState} from './types';
import {createUnit,balances,activeHoldings,UNIT_TYPES,purchase} from './engine';
import {vassalState} from './vassals';
import type {CatalogItem} from './types';
import {equipUnit,changeUnitState,resolveSurvivors,
 SURVIVOR_CONDITIONS} from './military';
import {changeSiegeAssignment} from './siege';
import {grantUnitXp,unitAllowedSkills} from './unit-progression';
import {resourcesSchema} from './schemas';
import {depositGold,donateGold,donateGlory,spendInfluence,
 redeemIntrigueBonus} from './resource-transactions';
import {alternativeFortune} from './engine';
import {convertResources,confirmFortune,runTournament} from './fortune';
import {reconcileHouseCalendar,calendarMonthIndex} from './calendar-consistency';
import {legacyCostIssues,reconcileLegacyCosts} from './legacy-cost-reconciliation';
import {validateResources} from './engine';
import {changeHoldingCondition,legacyEffectCandidates,legacyCatalogEffects} from './holding-accounting';
import {historyAdjustments,memberBonusAdjustments,rollFoundation,
 rollHistoricalEvent,historicalFoundationYear} from './creation-history';
import {createVassal} from './vassals';
import type {Resource} from './types';
import {improveEquipment} from './equipment';
import {trainUnit,endVassal,approveVassal} from './military';
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

/** 4a: associação pura de brasão previamente validado pelo Storage Firebase.
 * O envio da imagem é externo à transação e a autorização do manifesto
 * é verificada novamente pelo servidor antes de gravar na Ficha. */
export function applyHouseCrestOperation(
 state:HouseState,args:Record<string,unknown>,
 context:{admin:boolean;snapshotId:string;actorUid:string},
):{state:HouseState;rule:string}{
 const {path}=z.object({path:z.string().min(1).max(400)}).parse(args);
 const match=/^private\/([a-f0-9]{64})\/([^/\u0000-\u001f\u007f]{1,128})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i.exec(path);
 if(!match||match[1]!==context.snapshotId||match[2]!==context.actorUid)
  throw Error('Brasão privado não pertence à sessão Firebase atual.');
 if(state.phase!=='draft'&&!context.admin)
  throw Error('Brasão de casa ativa exige edição do Narrador.');
 if(!context.admin&&state.importSources.length)
  throw Error('Brasão de ficha importada exige revisão do Narrador.');
 const next=structuredClone(state);
 next.identity={...state.identity,crestPath:path};
 return {state:next,
  rule:'Cormyr · importação de imagem de brasão (privada, vinculada à ficha e auditada)'};
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
 'unit_edit','vassal_loyalty','vassal_domain','custom_image',
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
 if(action==='custom_image'){
  return {state:setCustomImage(state,args),
   rule:'Cormyr · retrato próprio de espião ou unidade, sem efeito em regras ou recursos',
   explanation};
 }
 if(action==='vassal_loyalty'){
  const input=z.object({id:z.string(),
   loyalty:z.enum(['loyal','neutral','rebellious'])}).parse(args);
  return {state:setVassalLoyalty(state,input.id,input.loyalty,explanation),
   rule:'Lealdade da vassala: '+input.loyalty+'; decisão narrativa auditada',
   explanation};
 }
 if(action==='vassal_domain'){
  const vassalId=z.string().parse(args['vassalId']);
  const next=structuredClone(state);
  const vassal=next.vassals?.find(v=>v.id===vassalId&&v.status==='approved');
  if(!vassal?.sheet)throw Error('Mini-ficha indisponível.');
  const domain=z.object({id:z.string().uuid(),
   name:z.string().trim().min(1).max(160)}).parse(args);
  if(vassal.sheet.domains.some(x=>x.id===domain.id))
   throw Error('Domínio já cadastrado.');
  vassal.sheet.domains.push({...domain,terrain:'',features:[],notes:''});
  return {state:next,rule:'Mini-ficha da vassala · recursos independentes da suserana',
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

/**
 * Criação e conciliação puras, sem I/O ou alteração do acervo histórico.
 * Autorizações de atributos são resolvidas na transação, não pela interface.
 */
export const HOUSE_CREATION_ACTIONS=[
 'draft','admin_edit','condition','submit','fortune','restore_legacy_effects',
] as const;
export type HouseCreationAction=typeof HOUSE_CREATION_ACTIONS[number];
export type HouseCreationContext={admin:boolean;mayBuyAttributes:boolean;
 explanation:string};
export function applyHouseCreationOperation(
 state:HouseState,action:HouseCreationAction,args:Record<string,unknown>,
 ctx:HouseCreationContext,
):{state:HouseState;rule:string}{
 const {admin,mayBuyAttributes,explanation}=ctx;
 const next=structuredClone(state);
 let rule='Cormyr · gestão auditada';
 if(action==='draft'){
  if(state.phase!=='draft')
   throw Error('Ficha em revisão ou ativa exige edição auditada do Narrador.');
  const values=resourcesSchema.parse(args['base']);validateResources(values);
  const identity=z.object({region:z.string(),motto:z.string().max(500),
   foundation:z.number().int().optional(),history:z.array(z.string()).max(100),
   notes:z.string().max(10000),crestPath:z.string().max(600).optional()})
   .parse(args['identity']);
  if(identity.crestPath!==state.identity.crestPath)
   throw Error('Importe a imagem do brasão pela ferramenta segura, não pela edição de identidade.');
  const method=z.enum(['budget','roll','import']).parse(args['method']);
  const pristine=state.phase==='draft'&&state.rolls.length===0&&
   !state.importSources.length&&state.holdings.length===0&&state.units.length===0&&
   RESOURCE_KEYS.every(r=>state.base[r]===0);
  if(admin){
   next.method=method;
   next.budget=z.number().finite().nonnegative().nullable().parse(args['budget']);
  }else if(method!==state.method){
   if(!pristine||method==='import'||(method==='budget'&&!mayBuyAttributes))
    throw Error('A escolha do método não está autorizada para esta Casa.');
   next.method=method;next.budget=method==='budget'?210:null;
  }else if(method==='budget'&&mayBuyAttributes&&state.budget===null&&pristine){
   next.budget=210;
  }
  const changed=RESOURCE_KEYS.some(r=>state.base[r]!==values[r]);
  if(changed){
   if(!admin){
    if(next.method!=='budget'||!mayBuyAttributes)
     throw Error('Compra de atributos bloqueada pelo Narrador.');
    if(state.rolls.length||state.importSources.length)
     throw Error('Atributos rolados ou importados não podem ser redistribuídos.');
    if(RESOURCE_KEYS.some(r=>!Number.isInteger(values[r])||values[r]<0))
     throw Error('Point buy exige valores inteiros não negativos por atributo.');
   }
   next.base=values;
  }
  next.identity=identity;
  next.creationStep=z.number().int().min(0).max(9).parse(args['creationStep']);
  next.regionalApplied=next.method!=='import'&&next.importSources.length===0;
  if(next.method==='budget'){
   if(next.budget===null&&!admin&&changed)
    throw Error('Orçamento não autorizado.');
   if(next.budget!==null&&RESOURCE_KEYS.reduce((sum,r)=>sum+next.base[r],0)>next.budget)
    throw Error('Pontos-base excedem a reserva de point buy autorizada.');
  }
  rule='Cormyr · criação tradicional/point buy · autorização de atributos conferida';
 }
 if(action==='admin_edit'){
  if(!admin)throw Error('Somente o Narrador pode editar fichas sem restrições de fase.');
  if(explanation.trim().length<10)
   throw Error('Justifique a edição administrativa (mínimo 10 caracteres).');
  const input=z.object({base:resourcesSchema,permanent:resourcesSchema,
   identity:z.object({region:z.string().max(120),motto:z.string().max(500),
    foundation:z.number().int().optional(),history:z.array(z.string()).max(100),
    notes:z.string().max(10000)})}).parse(args);
  validateResources(input.base);validateResources(input.permanent);
  next.base=input.base;next.permanent=input.permanent;
  next.identity={...state.identity,...input.identity};
  rule='Cormyr · edição administrativa de ficha, auditoria e justificativa obrigatórias';
 }
 if(action==='condition'){
  if(!admin&&state.phase==='active')
   throw Error('A baixa em campanha exige decisão do Narrador.');
  const input=z.object({id:z.string(),
   status:z.enum(['destroyed','abandoned','sold','cancelled'])}).parse(args);
  if(state.phase==='active'&&explanation.trim().length<10)
   throw Error('O Narrador deve justificar a baixa em campanha.');
  return {state:changeHoldingCondition(state,input.id,input.status),
   rule:input.status==='destroyed'
    ?'Livro básico · perda permanente do investimento na posse destruída (sem restituição)'
    :'Livro básico · liberação da alocação por baixa auditada, sem reembolsar custos permanentes'};
 }
 if(action==='submit'){
  if(state.phase!=='draft')throw Error('Criação já enviada.');
  if(state.method==='budget'&&state.budget===null)
   throw Error('Escolha o método tradicional (7d6) ou obtenha autorização para point buy.');
  if(state.method==='roll'&&state.rolls.length!==RESOURCE_KEYS.length)
   throw Error('Registre todas as sete rolagens iniciais da Casa.');
  if(!state.domains.length)throw Error('Adicione ao menos um domínio.');
  if(!state.regionalApplied&&state.method!=='import')
   throw Error('Revise os recursos.');
  if(state.creationHistory&&!state.creationHistory.applied&&
   state.creationHistory.events.length!==state.creationHistory.limit)
   throw Error('Registre todos os eventos históricos previstos antes de enviar.');
  if(!state.creationHistory?.applied||!state.creationBonusesApplied){
   const history=historyAdjustments(state),bonuses=memberBonusAdjustments(state);
   for(const r of RESOURCE_KEYS)next.permanent[r]+=history[r]+bonuses[r];
   if(state.creationHistory)
    next.creationHistory={...state.creationHistory,applied:true};
   next.creationBonusesApplied=true;
  }
  next.phase='review';
 }
 if(action==='fortune'){
  const input=z.object({status:z.number().int(),
   testDice:z.array(z.number().int()),bonusDice:z.array(z.number().int()),
   modifier:z.number(),resource:z.enum(RESOURCE_KEYS),changes:resourcesSchema,
   fortuneStackDice:z.array(z.number().int().min(1).max(6)).optional(),
   resourceStackDice:z.record(z.enum(RESOURCE_KEYS),
    z.array(z.number().int().min(1).max(6))).optional(),
   justification:z.string().min(1)}).parse(args);
  return {state:confirmFortune(state,input),rule:'Livro básico · tabela 6-18'};
 }
 if(action==='restore_legacy_effects'){
  if(!admin)throw Error('A restauração dos benefícios legados exige o Narrador.');
  if(explanation.trim().length<10)
   throw Error('Justifique a conciliação dos benefícios legados.');
  const ids=z.array(z.string().min(1)).min(1).max(500).parse(args['holdingIds']);
  if(new Set(ids).size!==ids.length)
   throw Error('Posse repetida na conciliação.');
  const candidates=legacyEffectCandidates(state);
  if(ids.some(id=>!candidates.some(h=>h.id===id)))
   throw Error('Posse sem correspondência segura no catálogo: nenhuma ficha foi alterada.');
  next.holdings=state.holdings.map(h=>ids.includes(h.id)
   ?{...h,effects:structuredClone(legacyCatalogEffects(h))}:h);
  rule='Conciliação de benefícios importados · correspondência explícita de itemId com catálogo versionado da aplicação';
 }
 validateResources(next.base);validateResources(next.permanent);
 return {state:next,rule};
}

/**
 * Sorteios servidor-side fornecidos como dados imutáveis da operação.
 * A mesma matriz será reutilizada em cada retry da transação Firestore.
 */
export const HOUSE_DICE_ACTIONS=[
 'roll','foundation_roll','history_roll','member_bonus','vassal_create',
] as const;
export type HouseDiceAction=typeof HOUSE_DICE_ACTIONS[number];
export type HouseDiceContext={admin:boolean;key:string;playerId:string|null;
 dice:readonly number[]};
export function applyHouseDiceOperation(
 state:HouseState,action:HouseDiceAction,args:Record<string,unknown>,
 ctx:HouseDiceContext,
):{state:HouseState;rule:string}{
 const next=structuredClone(state);
 let cursor=0;
 const die=()=>{
  const value=ctx.dice[cursor++];
  if(!Number.isInteger(value)||value===undefined||value<1||value>6)
   throw Error('Sorteio do servidor não foi validado.');
  return value;
 };
 if(action==='roll'){
  if(state.phase!=='draft'||state.rolls.length||state.method==='import'||
    state.importSources.length)
   throw Error('Rolagens já registradas, importadas ou criação encerrada.');
  if(!ctx.admin&&!(state.method==='roll'||(state.method==='budget'&&
    state.budget===null&&RESOURCE_KEYS.every(r=>state.base[r]===0)&&
    !state.holdings.length&&!state.units.length)))
   throw Error('Método por orçamento autorizado; somente o Narrador pode alterá-lo.');
  next.method='roll';next.budget=null;
  next.rolls=RESOURCE_KEYS.map(()=>Array.from({length:7},die));
  RESOURCE_KEYS.forEach((r,i)=>{
   next.base[r]=(next.rolls[i]??[]).reduce((a,b)=>a+b,0);
  });
  next.regionalApplied=true;
  return {state:next,rule:'Livro básico · 7d6 por recurso, p. 126 · rolagem imutável'};
 }
 if(action==='foundation_roll'){
  if(state.phase!=='draft'||state.method==='import'||
    state.importSources.length||state.creationHistory)
   throw Error('Fundação já registrada, importada ou criação encerrada.');
  const history=rollFoundation(die);
  next.creationHistory=history;
  if(next.identity.foundation===undefined)
   next.identity.foundation=historicalFoundationYear(history.foundationRoll);
  return {state:next,rule:'Livro básico · tabela 6-3 · fundação e número de eventos registrados'};
 }
 if(action==='history_roll'){
  const history=state.creationHistory;
  if(state.phase!=='draft'||state.method==='import'||state.importSources.length||
    !history||history.applied||history.events.length>=history.limit)
   throw Error('Rolagem de evento indisponível, completa ou criação importada.');
  const input=z.object({infrastructure:z.tuple([z.enum(RESOURCE_KEYS),
    z.enum(RESOURCE_KEYS)])}).parse(args);
  if(input.infrastructure[0]===input.infrastructure[1])
   throw Error('Escolha dois recursos distintos para Infraestrutura.');
  const result=rollHistoricalEvent(die,input.infrastructure,ctx.key);
  next.creationHistory={...history,events:[...history.events,result]};
  return {state:next,rule:'Livro básico · tabela 6-4 · 3d6 e modificadores por recurso (piso zero)'};
 }
 if(action==='member_bonus'){
  if(state.phase!=='draft'||state.method==='import'||state.importSources.length||
    state.creationBonusesApplied)
   throw Error('Bônus pessoal disponível apenas durante a criação não importada.');
  const {resource}=z.object({resource:z.enum(RESOURCE_KEYS)}).parse(args);
  const playerId=ctx.playerId;
  if(!playerId)throw Error('Somente um jogador cadastrado pode contribuir com o bônus.');
  if((state.creationBonuses??[]).some(b=>b.playerId===playerId))
   throw Error('Cada jogador pode aplicar seu bônus apenas uma vez.');
  next.creationBonuses=[...(state.creationBonuses??[]),
   {playerId,resource,die:die()}];
  return {state:next,rule:'Livro básico · ajuste inicial de jogador vinculado, +1d6 auditado'};
 }
 if(action==='vassal_create'){
  const input=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(160),
   region:z.string().min(1).max(100),motto:z.string().max(500),
   lordName:z.string().max(160)}).parse(args);
  const rolls=Object.fromEntries(RESOURCE_KEYS.map(r=>[r,
   Array.from({length:5},die)])) as Record<Resource,number[]>;
  return {state:createVassal(state,input,rolls),
   rule:'Vassala · cinco d6 registrados por recurso; custo 20/10/5 Poder da suserana'};
 }
 throw Error('Ação de sorteio não coberta.');
}

/** Ações dependentes do calendário ou do nome canônico da Casa.
 * Os fatos externos são conferidos dentro da transação e passados explicitamente.
 */
export const HOUSE_CONTEXT_ACTIONS=['sync_calendar','reconcile_legacy_costs','action'] as const;
export type HouseContextAction=typeof HOUSE_CONTEXT_ACTIONS[number];
export type HouseContext={
 admin:boolean;explanation:string;houseName:string;
 calendar:{year:number;month:number};dice:readonly number[];
};
export function applyHouseContextOperation(
 state:HouseState,action:HouseContextAction,args:Record<string,unknown>,
 ctx:HouseContext,
):{state:HouseState;rule:string}{
 if(action==='sync_calendar'){
  if(!ctx.admin)throw Error('Somente o Narrador pode conciliar o calendário de uma Casa.');
  const next=reconcileHouseCalendar(state,ctx.calendar,ctx.explanation);
  return {state:next,rule:'Conciliação auditada com o mês global de Harptos '+
   calendarMonthIndex(ctx.calendar)+'; obras conferidas; sem retrocesso'};
 }
 if(action==='reconcile_legacy_costs'){
  if(!ctx.admin)throw Error('Conciliação legada exclusiva do Narrador.');
  if(ctx.explanation.trim().length<10)
   throw Error('Justifique a conferência da fonte histórica.');
  if(!ctx.houseName.trim())throw Error('Nome canônico da Casa indisponível.');
  const ids=z.array(z.string().min(1)).min(1).max(6).parse(args['ids']);
  const candidates=legacyCostIssues(state,ctx.houseName);
  if(ids.some(id=>!candidates.some(row=>row.id===id)))
   throw Error('Divergência entre a ficha e a fonte legada. Nada foi alterado.');
  const next=reconcileLegacyCosts(state,ctx.houseName,ids);
  return {state:next,rule:'Conciliação pontual da auditoria 16; itens '+
   ids.join(', ')+'; antes '+JSON.stringify(balances(state))+
   '; depois '+JSON.stringify(balances(next))};
 }
 if(action==='action'){
  if(state.phase!=='active')throw Error('Casa não ativa.');
  const input=z.object({type:z.string().min(1).max(100),
   notes:z.string().min(1).max(4000),
   scale:z.enum(['local','regional','grand']).optional(),
   competitions:z.number().int().min(1).max(30).optional()}).parse(args);
  if(state.actions.some(a=>a.month===state.month))
   throw Error('A Casa já utilizou sua ação mensal (inclusive conversões).');
  if(input.type==='Torneio'){
   if(!input.scale||!input.competitions)
    throw Error('Informe porte e competições do torneio.');
   const sides=input.scale==='local'?1:input.scale==='regional'?3:6;
   const roll=ctx.dice[0];
   if(!Number.isInteger(roll)||roll===undefined||roll<1||roll>sides)
    throw Error('Sorteio de torneio inválido.');
   return {state:runTournament(state,input.scale,input.competitions,roll,input.notes),
    rule:'Livro básico pp. 155–156 · torneio '+input.scale+'; Influência rolada '+roll};
  }
  const next=structuredClone(state);
  next.actions.push({month:state.month,type:input.type,notes:input.notes});
  return {state:next,rule:'Livro básico p. 153 · ação mensal auditada'};
 }
 throw Error('Ação de contexto não implementada.');
}

/** Compras utilizam catálogo canônico confirmado na MESMA transação que grava.
 * Sorteios econômicos entram como números de 32 bits do servidor, sem I/O.
 */
export const HOUSE_PURCHASE_ACTIONS=['purchase','vassal_purchase'] as const;
export type HousePurchaseAction=typeof HOUSE_PURCHASE_ACTIONS[number];
export type HousePurchaseContext={item:CatalogItem;rawRolls:readonly number[]};
const drawDuration=(count:number,sides:number,rolls:readonly number[]):number[]=>{
 if(!Number.isSafeInteger(count)||count<0||count>100||
    !Number.isSafeInteger(sides)||sides<1||sides>10000)
  throw Error('Duração de construção fora do catálogo autorizado.');
 const output:number[]=[];let i=0;
 const max=2**32,limit=Math.floor(max/sides)*sides;
 while(output.length<count){
  const value=rolls[i++];
  if(value===undefined||!Number.isSafeInteger(value)||value<0||value>=max)
   throw Error('Dados do servidor insuficientes para a obra.');
  if(value<limit)output.push(value%sides+1);
 }
 return output;
};
export function applyHousePurchaseOperation(
 state:HouseState,action:HousePurchaseAction,args:Record<string,unknown>,
 ctx:HousePurchaseContext,
):{state:HouseState;rule:string}{
 if(action==='purchase'){
  const input=z.object({id:z.string().uuid(),itemId:z.string(),
   domainId:z.string(),name:z.string().max(160),
   parentId:z.string().optional(),supportId:z.string().optional(),
   replaceId:z.string().optional(),
   weaponSpecialty:z.enum(['fighting','marksmanship']).optional()}).parse(args);
  if(ctx.item?.id!==input.itemId)
   throw Error('Catálogo indisponível para a posse selecionada.');
  const dice=state.phase==='active'?
   drawDuration(ctx.item.duration.dice??0,ctx.item.duration.sides??6,ctx.rawRolls):[];
  return {state:purchase(state,ctx.item,{...input,dice}),
   rule:ctx.item.source+' · '+ctx.item.section+' · '+ctx.item.version};
 }
 if(action==='vassal_purchase'){
  const vassalId=z.string().parse(args['vassalId']);
  const next=structuredClone(state);
  const vassal=next.vassals?.find(v=>v.id===vassalId&&v.status==='approved');
  if(!vassal?.sheet)throw Error('Mini-ficha indisponível.');
  const input=z.object({itemId:z.string(),id:z.string().uuid(),
   domainId:z.string(),name:z.string().max(160),
   parentId:z.string().optional(),supportId:z.string().optional()}).parse(args);
  if(ctx.item?.id!==input.itemId)
   throw Error('Catálogo indisponível para a posse selecionada.');
  const result=purchase(vassalState(next,vassal),ctx.item,{...input,dice:[]});
  vassal.sheet.holdings=result.holdings;
  vassal.sheet.permanent=result.permanent;
  vassal.sheet.domains=result.domains;
  return {state:next,rule:'Mini-ficha da vassala · recursos independentes da suserana'};
 }
 throw Error('Compra não implementada.');
}

/**
 * Corte e vassalagem somente por registros privados verificados.
 * Referências a NPCs e nomes oficiais são resolvidas pelo servidor na transação.
 */
export const HOUSE_LINK_ACTIONS=['court','vassal','vassal_approve','vassal_npcs'] as const;
export type HouseLinkAction=typeof HOUSE_LINK_ACTIONS[number];
export type HouseLinkRecord={id:string;house_id:string|null;kind:string;
 title:string;content:string;visibility:'player'|'house'|'gm'};
export type HouseLinkContext={houseId:string;actorUid:string;narrator:boolean;
 houseName:string;npcIds:string[];records:HouseLinkRecord[];explanation:string};
export function applyHouseLinkOperation(
 state:HouseState,action:HouseLinkAction,args:Record<string,unknown>,
 ctx:HouseLinkContext,
):{state:HouseState;rule:string}{
 if(action==='court'){
  const member=z.object({id:z.string().uuid(),npcId:z.string().uuid(),
   role:z.string().min(1).max(160),notes:z.string().max(4000)}).parse(args);
  const record=ctx.records.find(x=>x.id===member.npcId)??null;
  validateCourtRecord(ctx.houseId,record);
  if(!record||!isNarrativeNpc(record))
   throw Error('Selecione um NPC narrativo, não uma ficha técnica.');
  return {state:assignCourt(state,{...member,name:record.visibility==='house'?
    record.title:'Integrante restrito'}),
   rule:'Corte · cargo ligado a registro existente, sem copiar personagem'};
 }
 if(action==='vassal'){
  const input=z.object({id:z.string().uuid(),houseId:z.string(),
   notes:z.string().min(1).max(4000)}).parse(args);
  if(!ctx.houseName.trim())throw Error('Casa oficial não encontrada.');
  const ids=validateVassalNpcs(ctx.houseId,ctx.npcIds,ctx.records);
  return {state:attachVassal(state,{...input,name:ctx.houseName,npcIds:ids}),
   rule:'Vassalagem imediata · 20/10/5 Poder; sem acesso à ficha da outra casa'};
 }
 if(action==='vassal_approve'){
  if(!ctx.narrator)throw Error('Somente o Narrador aprova vassalagens.');
  const input=z.object({id:z.string(),
   influencePenalty:z.number().int().nonnegative()}).parse(args);
  if(!ctx.explanation.trim())throw Error('Registre a decisão de vínculo e Influência.');
  const ids=validateVassalNpcs(ctx.houseId,ctx.npcIds,ctx.records);
  const next=linkVassalNpcs(approveVassal(state,input.id,input.influencePenalty),
   input.id,ids);
  const vassal=next.vassals?.find(v=>v.id===input.id);
  if(vassal){vassal.approvalNote=ctx.explanation;vassal.approvedBy=ctx.actorUid;}
  return {state:next,
   rule:'Livro básico · Brasões vassalos20/10/5Poder; decisão e NPCs confirmados pelo Narrador'};
 }
 if(action==='vassal_npcs'){
  if(!ctx.narrator)throw Error('Somente o Narrador altera referências vassalas.');
  const id=z.string().parse(args['id']);
  if(!ctx.explanation.trim())
   throw Error('Registre a decisão de alteração dos NPCs.');
  const ids=validateVassalNpcs(ctx.houseId,ctx.npcIds,ctx.records);
  return {state:linkVassalNpcs(state,id,ids),
   rule:'Referências a NPCs existentes alteradas pelo Narrador; sem duplicação ou novo custo'};
 }
 throw Error('Vínculo não implementado.');
}

import {z} from 'zod';
import {removeCourtAssignment} from './court';
import {renameMilitaryHolding,editUnitProfile} from './unit-progression';
import {setVassalLoyalty} from './military';
import {unitSchema} from './schemas';
import {operationSchema} from './schemas';
import {isMonthSensitiveHouseAction} from './monthly-operation-policy';
import {RESOURCE_KEYS,type HouseState} from './types';
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

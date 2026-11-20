import {z} from 'zod';
import {removeCourtAssignment} from './court';
import {renameMilitaryHolding,editUnitProfile} from './unit-progression';
import {setVassalLoyalty} from './military';
import {unitSchema} from './schemas';
import {operationSchema} from './schemas';
import {isMonthSensitiveHouseAction} from './monthly-operation-policy';
import type {HouseState} from './types';

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

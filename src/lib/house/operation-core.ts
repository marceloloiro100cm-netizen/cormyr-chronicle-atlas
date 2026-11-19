import {z} from 'zod';
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

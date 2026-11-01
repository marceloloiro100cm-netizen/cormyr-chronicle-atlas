import {calendarDrift,type CalendarReference} from './calendar-consistency';
import type {HouseState} from './types';

/**
 * Actions whose cost, monthly slot, project start or army capacity depend
 * on the authoritative campaign period. Never use HouseState.month as a
 * substitute for an absent or divergent official calendar when active.
 *
 * The server must independently fetch the official RPC before writing;
 * this list is shared solely to keep client and server policy aligned.
 */
export const MONTH_SENSITIVE_HOUSE_ACTIONS=[
 'fortune','alternative','convert','action','spend_influence',
 'redeem_intrigue','purchase','vassal_purchase',
 'unit','equipment','train_unit','war_hounds','broad_training','siege',
] as const;

const restricted=new Set<string>(MONTH_SENSITIVE_HOUSE_ACTIONS);
export function isMonthSensitiveHouseAction(action:string):boolean{
 return restricted.has(action);
}

export type MonthlyOperationReadiness={
 allowed:boolean;
 status:'draft'|'aligned'|'waiting'|'behind'|'ahead'|'review';
 message:string;
};

/**
 * This is only a UI preflight. All writes remain protected by the
 * server's own authenticated canonical-calendar check.
 */
export function houseMonthlyOperationReadiness(
 state:Pick<HouseState,'phase'|'month'>,
 calendar:CalendarReference|null,
):MonthlyOperationReadiness{
 if(state.phase==='draft')
  return {allowed:true,status:'draft',message:'Criação em rascunho, ainda sem processamento mensal.'};
 if(state.phase!=='active')
  return {allowed:false,status:'review',
   message:'Casa ainda não ativa. Compras e ações mensais aguardam aprovação.'};
 if(!calendar)
  return {allowed:false,status:'waiting',
   message:'Data oficial indisponível. Aguarde a sincronização com o Calendário do Narrador.'};
 const delta=calendarDrift(state.month,calendar).delta;
 if(delta>0)
  return {allowed:false,status:'behind',
   message:'Casa atrasada em relação ao calendário oficial. Solicite a conciliação ao Narrador antes de comprar, agir ou recrutar.'};
 if(delta<0)
  return {allowed:false,status:'ahead',
   message:'Casa adiantada em relação ao calendário oficial. Revisão manual do Narrador obrigatória antes de novas operações.'};
 return {allowed:true,status:'aligned',
  message:'Ficha alinhada ao mês oficial; validação final será feita no servidor.'};
}

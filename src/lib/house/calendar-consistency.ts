import {advance} from './engine';
import type {HouseState} from './types';

export type CalendarReference={year:number;month:number};

/** Calendar is the only source of campaign month. House-local month is a historical snapshot. */
export function calendarMonthIndex(calendar:CalendarReference):number {
 if(!Number.isInteger(calendar.year)||calendar.year<1||calendar.year>9999||
    !Number.isInteger(calendar.month)||calendar.month<0||calendar.month>11)
  throw new Error('Calendário global de Harptos inválido.');
 return calendar.year*12+calendar.month;
}
export function calendarDrift(houseMonth:number,calendar:CalendarReference){
 if(!Number.isInteger(houseMonth))throw new Error('Mês da Casa inválido.');
 const current=calendarMonthIndex(calendar),delta=current-houseMonth;
 return {current,delta,status:delta===0?'synced':delta>0?'behind':'ahead'} as const;
}
/** Fails closed for month-sensitive operations rather than recording them in a stale turn. */
export function requireCalendarAlignment(state:Pick<HouseState,'phase'|'month'>,calendar:CalendarReference):void {
 if(state.phase!=='active')return;
 const {delta}=calendarDrift(state.month,calendar);
 if(delta!==0)throw new Error(
  delta>0?'Ficha da Casa atrasada em relação ao calendário global. Solicite conciliação ao Narrador.':
   'Ficha da Casa adiantada em relação ao calendário global. Revisão manual obrigatória pelo Narrador.'
 );
}
/** Audited catch-up is forward-only; reverse movement could undo completed projects. */
export function reconcileHouseCalendar(state:HouseState,calendar:CalendarReference,explanation:string):HouseState {
 if(state.phase!=='active')throw new Error('Conciliação do mês disponível apenas para Casa ativa.');
 if(explanation.trim().length<10)throw new Error('O Narrador deve registrar uma justificativa para conciliar os meses.');
 const {current,delta}=calendarDrift(state.month,calendar);
 if(delta===0)throw new Error('Ficha já está sincronizada ao Calendário global.');
 if(delta<0)throw new Error('A Casa está à frente do Reino. Revise o histórico; retrocesso automático proibido.');
 if(delta>120)throw new Error('Mais de 120 meses de diferença exigem conferência manual.');
 return advance(state,current);
}

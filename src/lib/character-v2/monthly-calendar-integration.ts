import type {CharacterV2} from './schema';
import {calendarMonthIndex,type CalendarReference} from '@/lib/house/calendar-consistency';
import {listMonthlyTraitWindows,quoteWealthyMonthlyIncome,type MonthlyIncomeQuote} from './trait-monthly';

export type MonthlyIncomePlan=Readonly<{
 due:readonly MonthlyIncomeQuote[];
 skipped:readonly string[];
 /** Sem RPC de autorização, estas entradas são propostas, nunca créditos efetivos. */
 requiresAuthorizedLedger:true;
}>;
/** Ponto de conexão com o Hub Temporal.
 *
 * O backend deve usar uma fonte de D6 segura/auditável e confirmar o mesmo
 * eventKey no ledger da Casa numa ÚNICA transação. Não use este módulo cliente
 * para depositar ouro. Saltos de vários meses produzem uma oportunidade/mês.
 */
export function planMonthlyTraitIncome(args:{
 from:CalendarReference;to:CalendarReference;
 characters:readonly CharacterV2[];
 settledKeys:ReadonlySet<string>;
 drawDice:(characterId:string,monthKey:number,rank:number)=>readonly number[];
}):MonthlyIncomePlan{
 const from=calendarMonthIndex(args.from),to=calendarMonthIndex(args.to);
 const months=listMonthlyTraitWindows(from,to);
 const due:MonthlyIncomeQuote[]=[],skipped:string[]=[];
 for(const character of args.characters){
  if(character.review.status!=='approved'){
   skipped.push(character.id+': ficha sem revisão concluída');continue;
  }
  const wealthy=character.traits.filter(t=>t.traitId==='abastado'&&t.status==='approved');
  if(wealthy.length!==1){
   if(wealthy.length>1)skipped.push(character.id+': benefício duplicado exige conciliação');
   continue;
  }
  if(!character.houseId||!character.id){
   skipped.push('Identidade ou Casa ausente');continue;
  }
  // Regra admite Astúcia OU Status: para execução automática, a escolha
  // benéfica e determinística é a maior graduação homologada.
  const skill=character.skillRanks.cunning>=character.skillRanks.status?'cunning':'status';
  const rank=character.skillRanks[skill];
  for(const monthKey of months){
   const eventKey=character.id+':'+monthKey+':abastado-got-pt-ch5-2026-11-01-v1';
   if(args.settledKeys.has(eventKey))continue;
   const dice=args.drawDice(character.id,monthKey,rank);
   due.push(quoteWealthyMonthlyIncome({
    characterId:character.id,houseId:character.houseId,
    traitId:'abastado',approved:true,monthKey,skill,skillRank:rank,dice,
   }));
  }
 }
 return{due,skipped,requiresAuthorizedLedger:true};
}

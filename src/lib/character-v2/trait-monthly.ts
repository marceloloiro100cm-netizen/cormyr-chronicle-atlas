/** Recompensa temporal de Abastado — livro básico, cap. 5, p. 100.
 * Teste no início de cada mês: Astúcia ou Status Fácil (3), e 10 DO por grau.
 * Os dados devem vir de uma rolagem autorizada; cliente não pode creditar ouro.
 */
export const WEALTHY_MONTHLY_RULE_VERSION='abastado-got-pt-ch5-2026-11-01-v1';
export type MonthlyTraitRuleKey='abastado';
export type MonthlyIncomeContext=Readonly<{
 characterId:string;houseId:string;monthKey:number;traitId:MonthlyTraitRuleKey;
 approved:boolean;skill:'cunning'|'status';skillRank:number;
 dice:readonly number[];
}>;
export type MonthlyIncomeQuote=Readonly<{
 eventKey:string;characterId:string;houseId:string;monthKey:number;
 result:number;difficulty:3;success:boolean;degrees:number;
 coins:number;currency:'DO';ruleVersion:typeof WEALTHY_MONTHLY_RULE_VERSION;
 status:'pending_authorized_settlement';
}>;
export function degreeOfSuccess(testResult:number,difficulty:number):number{
 if(!Number.isSafeInteger(testResult)||!Number.isSafeInteger(difficulty)||difficulty<0)
  throw new Error('Teste inválido');
 return testResult<difficulty?0:Math.min(4,Math.floor((testResult-difficulty)/5)+1);
}
export function quoteWealthyMonthlyIncome(input:MonthlyIncomeContext):MonthlyIncomeQuote{
 if(!input.approved)throw new Error('Abastado precisa estar homologado para gerar renda.');
 if(!/^[0-9a-f-]{36}$/i.test(input.characterId)||!input.houseId.trim())
  throw new Error('Identidade canônica e Casa são obrigatórias.');
 if(!Number.isInteger(input.monthKey)||input.monthKey<1)
  throw new Error('Mês absoluto de Harptos inválido.');
 if(!Number.isInteger(input.skillRank)||input.skillRank<1||input.skillRank>10||
   input.dice.length!==input.skillRank||input.dice.some(n=>!Number.isInteger(n)||n<1||n>6))
  throw new Error('Rolagem D6 precisa corresponder à graduação homologada.');
 const result=input.dice.reduce((a,b)=>a+b,0),difficulty=3 as const;
 const degrees=degreeOfSuccess(result,difficulty);
 return{
  eventKey:input.characterId+':'+input.monthKey+':'+WEALTHY_MONTHLY_RULE_VERSION,
  characterId:input.characterId,houseId:input.houseId,monthKey:input.monthKey,
  result,difficulty,success:degrees>0,degrees,coins:degrees*10,
  currency:'DO',ruleVersion:WEALTHY_MONTHLY_RULE_VERSION,
  status:'pending_authorized_settlement',
 };
}
export function listMonthlyTraitWindows(fromMonth:number,toMonth:number,limit=120):number[]{
 if(!Number.isSafeInteger(fromMonth)||!Number.isSafeInteger(toMonth)||
  toMonth<fromMonth||toMonth-fromMonth>limit)throw new Error('Janela de meses inválida.');
 return Array.from({length:toMonth-fromMonth},(_,i)=>fromMonth+i+1);
}
/** Idempotência sem efetuar crédito: somente eventos ainda não contabilizados. */
export function pendingMonthlyCredits(quotes:readonly MonthlyIncomeQuote[],postedKeys:ReadonlySet<string>){
 const seen=new Set<string>();
 return quotes.filter(q=>{
  if(postedKeys.has(q.eventKey)||seen.has(q.eventKey))return false;
  seen.add(q.eventKey);return true;
 });
}

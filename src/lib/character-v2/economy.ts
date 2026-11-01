import {z} from 'zod';
import {CHARACTER_CATALOG_VERSION,findCharacterTrait} from './catalog';

/**
 * Lote 06 — livro-razão PURO e independente da persistência.
 * Distinções: XP de criação ≠ XP de campanha; gastar Destino ≠ queimá-lo ≠ investi-lo.
 * Toda transação real exigirá RPC atômica e RLS no lote 11. Esta API NÃO salva dados.
 * Fontes: cap. 3 Evolução (especialidade 10 XP, Destino 50 XP);
 * cap. 5 Pontos de Destino.
 */
export const CHARACTER_ECONOMY_VERSION='character-economy-v1';
const OperationSchema=z.enum([
 'award_xp','purchase_specialty','purchase_destiny',
 'award_destiny','spend_destiny','burn_destiny',
 'invest_destiny','release_destiny','refresh_destiny','reverse_purchase',
]);
export type CharacterEconomyOperation=z.infer<typeof OperationSchema>;
const BalancesSchema=z.object({
 xp:z.number().int().min(0),
 destinyTotal:z.number().int().min(0),
 destinySpent:z.number().int().min(0),
 destinyBurned:z.number().int().min(0),
 investments:z.record(z.string(),z.number().int().min(1)),
 destinyAvailable:z.number().int().min(0),
});
export type EconomyBalances=z.infer<typeof BalancesSchema>;
const EventSchema=z.object({
 id:z.string().min(1),key:z.string().min(1),
 operation:OperationSchema,actorId:z.string().min(1),
 reason:z.string().min(10),campaignDate:z.string().min(1),
 amount:z.number().int().min(0),
 target:z.string().nullable(),reversalOf:z.string().nullable(),
 reversedEventId:z.string().nullable(),
 ruleVersion:z.string().min(1),
 before:BalancesSchema,after:BalancesSchema,
});
export type CharacterEconomyEvent=z.infer<typeof EventSchema>;
export const EconomyLedgerSchema=z.object({
 schemaVersion:z.literal(1),
 characterId:z.string().uuid(),version:z.number().int().min(0),
 ruleVersion:z.string().min(1),
 openingXp:z.number().int().min(0),
 openingDestiny:z.number().int().min(0),
 events:z.array(EventSchema),
});
export type EconomyLedger=z.infer<typeof EconomyLedgerSchema>;
export const EconomyCommandSchema=z.object({
 id:z.string().min(1),key:z.string().min(1),
 expectedVersion:z.number().int().min(0),
 actorId:z.string().min(1),isNarrator:z.boolean(),
 campaignDate:z.string().min(1),
 reason:z.string().trim().min(10),
 operation:OperationSchema,
 amount:z.number().int().min(1).max(10000).default(1),
 target:z.string().nullable().default(null),
 reversalOf:z.string().nullable().default(null),
 /** Checado por RPC quando existir; neste lote não basta para autorizar compras. */
 narratorApproved:z.boolean().default(false),
});
export type EconomyCommand=z.input<typeof EconomyCommandSchema>;
const investmentTotal=(map:Readonly<Record<string,number>>)=>Object.values(map).reduce((a,b)=>a+b,0);
function availability(s:Pick<EconomyBalances,'destinyTotal'|'destinySpent'|'investments'>){
 return s.destinyTotal-s.destinySpent-investmentTotal(s.investments);
}
function freezeBalance(s:Omit<EconomyBalances,'destinyAvailable'>):EconomyBalances{
 const available=availability(s);
 if(s.xp<0||s.destinyTotal<0||s.destinySpent<0||available<0)
  throw new Error('Saldo XP/Destino insuficiente.');
 return {...s,destinyAvailable:available};
}
export function openEconomyLedger(characterId:string,openingXp=0,openingDestiny=0):EconomyLedger{
 return EconomyLedgerSchema.parse({
  schemaVersion:1,characterId,version:0,ruleVersion:CHARACTER_CATALOG_VERSION,
  openingXp,openingDestiny,events:[],
 });
}
/** Reprocessa eventos e detecta alterações no passado ou sequências incompatíveis. */
export function replayEconomyLedger(ledger:EconomyLedger):EconomyBalances{
 const doc=EconomyLedgerSchema.parse(ledger);
 let state=freezeBalance({xp:doc.openingXp,destinyTotal:doc.openingDestiny,
  destinySpent:0,destinyBurned:0,investments:{}});
 const seen=new Set<string>(),reversals=new Set<string>();
 for(const event of doc.events){
  if(seen.has(event.id)||seen.has(event.key))throw new Error('Evento duplicado no livro-razão.');
  seen.add(event.id);seen.add(event.key);
  if(JSON.stringify(event.before)!==JSON.stringify(state))
   throw new Error('Cadeia de saldos inválida, evento: '+event.id);
  const expected=transition(state,event,doc.events.slice(0,doc.events.indexOf(event)),reversals);
  if(JSON.stringify(expected)!==JSON.stringify(event.after))
   throw new Error('Evento foi adulterado ou possui resultado inválido.');
  state=expected;
 }
 if(doc.events.length!==doc.version)throw new Error('Versão do ledger divergente.');
 return state;
}
function transition(
 old:EconomyBalances,
 cmd:Pick<CharacterEconomyEvent,'operation'|'amount'|'target'|'reversalOf'|'reason'>,
 prior:readonly CharacterEconomyEvent[],
 reversals:Set<string>,
):EconomyBalances{
 const state={
  xp:old.xp,destinyTotal:old.destinyTotal,
  destinySpent:old.destinySpent,destinyBurned:old.destinyBurned,
  investments:{...old.investments},
 };
 const amount=cmd.amount;
 switch(cmd.operation){
  case 'award_xp':state.xp+=amount;break;
  case 'purchase_specialty':
   if(!cmd.target)throw new Error('Compra exige identificador da especialidade.');
   state.xp-=amount*10;break;
  case 'purchase_destiny':state.xp-=amount*50;state.destinyTotal+=amount;break;
  case 'award_destiny':state.destinyTotal+=amount;break;
  case 'spend_destiny':state.destinySpent+=amount;break;
  case 'burn_destiny':
   state.destinyTotal-=amount;state.destinyBurned+=amount;break;
  case 'invest_destiny':{
   if(!cmd.target)throw new Error('Investimento exige benefício identificado.');
   const trait=findCharacterTrait(cmd.target);
   if(!trait||trait.kind!=='benefit')throw new Error('Destino só pode ser investido em benefício do catálogo.');
   state.investments[trait.id]=(state.investments[trait.id]??0)+amount;
   break;
  }
  case 'release_destiny':{
   if(!cmd.target)throw new Error('Devolução exige benefício identificado.');
   const trait=findCharacterTrait(cmd.target);
   const id=trait?.id??cmd.target, invested=state.investments[id]??0;
   if(invested<amount)throw new Error('Investimento inexistente.');
   if(invested===amount)delete state.investments[id];else state.investments[id]=invested-amount;
   break;
  }
  case 'refresh_destiny':
   if(cmd.amount!==1)throw new Error('Renovação usa ação única de marco narrativo.');
   state.destinySpent=0;break;
  case 'reverse_purchase':{
   if(!cmd.reversalOf)throw new Error('Estorno exige evento de origem.');
   const source=prior.find(e=>e.id===cmd.reversalOf);
   if(!source||!['purchase_specialty','purchase_destiny'].includes(source.operation))
    throw new Error('Somente compra registrada pode ser estornada.');
   if(reversals.has(source.id))throw new Error('Compra já estornada.');
   if(cmd.amount!==source.amount||cmd.target!==source.target)
    throw new Error('Estorno deve corresponder exatamente à compra original.');
   if(source.operation==='purchase_specialty')state.xp+=amount*10;
   else {state.xp+=amount*50;state.destinyTotal-=amount;}
   reversals.add(source.id);
   break;
  }
 }
 return freezeBalance(state);
}
export function applyEconomyCommand(
 ledger:EconomyLedger,input:EconomyCommand,
):{ledger:EconomyLedger;balances:EconomyBalances;event:CharacterEconomyEvent}{
 const command=EconomyCommandSchema.parse(input);
 const prior=EconomyLedgerSchema.parse(ledger);
 // Idempotência de chave: mesmo comando repetido NÃO cria novo lançamento.
 const existing=prior.events.find(e=>e.key===command.key);
 if(existing){
  if(existing.operation!==command.operation||existing.amount!==command.amount||
    existing.target!==command.target||existing.reversalOf!==command.reversalOf||
    existing.actorId!==command.actorId)throw new Error('Chave de idempotência reutilizada com outra operação.');
  return{ledger:prior,balances:replayEconomyLedger(prior),event:existing};
 }
 if(prior.version!==command.expectedVersion)throw new Error('Versão defasada; recarregue a ficha.');
 if(prior.events.some(e=>e.id===command.id))throw new Error('Identificador do evento já utilizado.');
 if(['award_xp','award_destiny','release_destiny','refresh_destiny','reverse_purchase'].includes(command.operation)
   &&(!command.isNarrator||!command.narratorApproved))
  throw new Error('Operação exige aprovação e autorização do Narrador.');
 if(['purchase_specialty','purchase_destiny','invest_destiny','burn_destiny','spend_destiny'].includes(command.operation)
   &&command.amount!==1)throw new Error('Operações individuais não podem agrupar gastos.');
 if(command.operation==='refresh_destiny'&&command.target===null)
  throw new Error('Renovação de Destino exige identificador do marco narrativo.');
 if(command.operation==='release_destiny'&&command.reason.length<10)
  throw new Error('Restituição exige justificativa.');
 if(command.operation==='reverse_purchase'&&(!command.reversalOf||!command.isNarrator))
  throw new Error('Estorno controlado exige documento e Narrador.');
 const before=replayEconomyLedger(prior);
 const reversals=new Set(prior.events.filter(e=>e.operation==='reverse_purchase')
   .map(e=>e.reversalOf).filter((x):x is string=>Boolean(x)));
 const after=transition(before,command,prior.events,reversals);
 const event:CharacterEconomyEvent={
  id:command.id,key:command.key,operation:command.operation,actorId:command.actorId,
  reason:command.reason,campaignDate:command.campaignDate,amount:command.amount,
  target:command.target,reversalOf:command.reversalOf,reversedEventId:null,
  ruleVersion:prior.ruleVersion,before,after,
 };
 const next=EconomyLedgerSchema.parse({...prior,version:prior.version+1,events:[...prior.events,event]});
 const verified=replayEconomyLedger(next);
 return{ledger:next,balances:verified,event};
}

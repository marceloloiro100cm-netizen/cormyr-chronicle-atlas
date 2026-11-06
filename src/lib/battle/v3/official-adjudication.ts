import {z} from 'zod';
import {battleHash} from '../domain/replay';
import {casualtyCount} from '../domain/morale';
import {officialAvailableCount} from '../domain/rulebook-v2';
import type {BattleState,Side} from '../domain/types';
import type {HouseState} from '@/lib/house/types';

export const V35_POLICY_VERSION='CCA-V35-MANUAL-LOSSES-1' as const;
export type V35Source=Readonly<{
 stackId:string;houseId:string;unitId:string;sourceVersion:number;
 name:string;side:Side;initialCount:number;tacticalCasualties:number;
}>;
export type V35Decision=Readonly<{stackId:string;losses:number;note:string}>;
export type V35Outcome=Readonly<{sources:readonly V35Source[];battleHash:string;
 policyVersion:typeof V35_POLICY_VERSION;decisions:readonly V35Decision[];planHash:string}>;
export const v35DecisionSchema=z.object({
 stackId:z.string().min(1).max(80),
 losses:z.number().int().min(0).max(1000),
 note:z.string().trim().min(10).max(500),
}).strict();
export const v35DecisionsSchema=z.array(v35DecisionSchema).min(2).max(10);
/** Nunca utilizar batalhas de casas-modelo como origem de baixas oficiais. */
export function v35OfficialSources(initial:BattleState,final:BattleState):readonly V35Source[]{
 if(initial.rulesVersion!=='PTE-2.0'||final.rulesVersion!=='PTE-2.0'||
   initial.phase!=='ready'||final.phase!=='completed')
  throw new Error('Apenas replay oficial PTE-2.0 concluído pode ser homologado.');
 if(initial.stacks.length!==final.stacks.length)
  throw new Error('Elenco alterado após a origem.');
 const houses:Record<Side,Set<string>>={attacker:new Set(),defender:new Set()};
 const sources:V35Source[]=[];
 const key=new Set<string>();
 for(const original of initial.stacks){
  if(original.source.kind!=='house-readonly'||!original.source.houseId||
    !original.source.unitId||original.source.sourceVersion===undefined)
   throw new Error('Treino fictício não pode provocar baixas reais.');
  const end=final.stacks.find(s=>s.id===original.id);
  if(!end||end.side!==original.side||end.initialCount!==original.initialCount||
   end.primaryTypeId!==original.primaryTypeId||
   end.source.kind!=='house-readonly'||
   end.source.houseId!==original.source.houseId||
   end.source.unitId!==original.source.unitId)
   throw new Error('Origem do agrupamento não corresponde ao resultado.');
  const sourceKey=original.source.houseId+':'+original.source.unitId;
  if(key.has(sourceKey))throw new Error('Unidade oficial duplicada no replay.');
  key.add(sourceKey);
  houses[original.side].add(original.source.houseId);
  sources.push({
   stackId:original.id,houseId:original.source.houseId,unitId:original.source.unitId,
   sourceVersion:original.source.sourceVersion,name:original.name,side:original.side,
   initialCount:original.initialCount,tacticalCasualties:casualtyCount(end),
  });
 }
 if(houses.attacker.size!==1||houses.defender.size!==1)
  throw new Error('A homologação exige uma casa oficial por lado.');
 if([...houses.attacker][0]===[...houses.defender][0])
  throw new Error('As duas casas oficiais devem ser distintas.');
 return sources.sort((a,b)=>a.stackId.localeCompare(b.stackId));
}
export function v35ManualOutcome(initial:BattleState,final:BattleState,
 raw:unknown):V35Outcome{
 const sources=v35OfficialSources(initial,final);
 const decisions=v35DecisionsSchema.parse(raw).slice()
  .sort((a,b)=>a.stackId.localeCompare(b.stackId));
 if(decisions.length!==sources.length)
  throw new Error('É preciso decidir sobre cada unidade oficial.');
 const ids=new Set<string>();
 for(const decision of decisions){
  if(ids.has(decision.stackId))throw new Error('Decisão duplicada sobre uma unidade.');
  ids.add(decision.stackId);
  const source=sources.find(s=>s.stackId===decision.stackId);
  if(!source)throw new Error('Decisão refere-se a uma unidade não participante.');
  if(decision.losses>source.tacticalCasualties)
   throw new Error('Baixas aprovadas excedem as perdas observadas no replay.');
 }
 const endHash=battleHash(final);
 const planHash=battleHash({policyVersion:V35_POLICY_VERSION,endHash,decisions});
 return {sources,battleHash:endHash,policyVersion:V35_POLICY_VERSION,decisions,planHash};
}
export type V35HouseSnapshot=Readonly<{houseId:string;version:number;state:HouseState}>;
/** Não muda o objeto de origem, XP, saúde, equipamento, comando, tesouro nem Poder.
 * A decisão é um número EXPLÍCITO do Narrador, nunca uma conversão automática.
 */
export function v35ApplyManualLosses(before:readonly V35HouseSnapshot[],
 outcome:V35Outcome,caseId:string):V35HouseSnapshot[]{
 if(!/^[0-9a-f-]{36}$/i.test(caseId))throw new Error('Processo oficial inválido.');
 const expectedHouses=new Set(outcome.sources.map(s=>s.houseId));
 if(before.length!==2||expectedHouses.size!==2||
   new Set(before.map(h=>h.houseId)).size!==2||
   before.some(h=>!expectedHouses.has(h.houseId)))
  throw new Error('É obrigatório apresentar exatamente as duas casas da batalha.');
 return before.map(snapshot=>{
  if(snapshot.state.houseId!==snapshot.houseId||!Number.isInteger(snapshot.version))
   throw new Error('Snapshot da casa incompatível.');
  const updated=structuredClone(snapshot.state);
  for(const source of outcome.sources.filter(s=>s.houseId===snapshot.houseId)){
   if(source.sourceVersion!==snapshot.version)
    throw new Error('A versão oficial mudou desde a importação.');
   const unit=updated.units.find(u=>u.id===source.unitId&&!u.destroyed);
   if(!unit)throw new Error('Unidade oficial indisponível.');
   if(officialAvailableCount(unit.strength,unit.casualties)!==source.initialCount)
    throw new Error('O contingente oficial difere do snapshot importado.');
   const decision=outcome.decisions.find(d=>d.stackId===source.stackId)!;
   const available=unit.strength-unit.casualties;
   if(decision.losses>available||unit.casualties<0||!Number.isSafeInteger(unit.casualties))
    throw new Error('Baixas ultrapassam o efetivo oficial disponível.');
   if(decision.losses>0){
    unit.casualties+=decision.losses;
    unit.notes=(unit.notes?unit.notes+'\n':'')+
     'Batalha oficial '+caseId+': '+decision.losses+' baixas aprovadas. '+decision.note;
   }
  }
  return {...snapshot,state:updated};
 });
}

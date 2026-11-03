import {describe,it,expect} from 'vitest';
import {spyAgentTier,spyDiscoveryConsequence,spyActiveCellCapacity,SPY_AGENT_UPGRADES}
 from '@/lib/espionage/spy-agent-progression';
import {spyDiceSuccessPercent} from '@/lib/espionage/spy-mission-probability';

describe('Cormyr · evolução individual dos espiões',()=>{
 it('cada três sucessos sobe um grau de Astúcia, até Elite 6D6',()=>{
  const ranks=Array.from({length:13},(_,n)=>spyAgentTier(n));
  expect(ranks.map(r=>r.rank)).toEqual([
   'Verde','Verde','Verde','Treinada','Treinada','Treinada',
   'Veterana','Veterana','Veterana','Elite','Elite','Elite','Elite']);
  expect(ranks.map(r=>r.cunning)).toEqual([3,3,3,4,4,4,5,5,5,6,6,6,6]);
  expect(spyAgentTier(2).toNextRank).toBe(1);
  expect(spyAgentTier(9).toNextRank).toBe(0);
 });
 it('probabilidade cresce de forma correta com maior graduação',()=>{
  expect(spyDiceSuccessPercent(3,15)).toBeLessThan(spyDiceSuccessPercent(4,15));
  expect(spyDiceSuccessPercent(4,15)).toBeLessThan(spyDiceSuccessPercent(5,15));
  expect(spyDiceSuccessPercent(5,15)).toBeLessThan(spyDiceSuccessPercent(6,15));
 });
 it('uma falha por apenas um grau permite fuga',()=>{
  expect(spyDiscoveryConsequence({
   difficulty:18,result:14,law:55,guardPresent:true,prisonPresent:true,discovered:true,
  }).outcome).toBe('escaped');
 });
 it('com guarda e cadeia, falha intermediária causa prisão',()=>{
  expect(spyDiscoveryConsequence({
   difficulty:18,result:11,law:20,guardPresent:true,prisonPresent:true,discovered:true,
  }).outcome).toBe('captured');
 });
 it('falha muito grave, Lei alta e guarda pode matar',()=>{
  expect(spyDiscoveryConsequence({
   difficulty:21,result:5,law:40,guardPresent:true,prisonPresent:true,discovered:true,
  }).outcome).toBe('dead');
 });
 it('Documentos falsificados melhora a chance de fuga em um grau de consequência',()=>{
  const caseBase={
   difficulty:18,result:11,law:25,guardPresent:true,prisonPresent:true,discovered:true,
  };
  expect(spyDiscoveryConsequence(caseBase).outcome).toBe('captured');
  expect(spyDiscoveryConsequence({...caseBase,forgedDocuments:true}).outcome).toBe('escaped');
  expect(SPY_AGENT_UPGRADES.forged_documents.cost).toBe(1);
 });
 it('Uma carta na manga proíbe morte e converte em prisão',()=>{
  const doomed={
   difficulty:21,result:4,law:50,guardPresent:true,prisonPresent:false,discovered:true,
  };
  expect(spyDiscoveryConsequence(doomed).outcome).toBe('dead');
  expect(spyDiscoveryConsequence({...doomed,aceInTheHole:true}).outcome).toBe('captured');
  expect(SPY_AGENT_UPGRADES.ace_in_the_hole.cost).toBe(1);
 });
 it('os dois recursos têm efeitos combináveis, sem elevar Astúcia por si só',()=>{
  const ctx={difficulty:21,result:3,law:50,guardPresent:true,prisonPresent:true,
   discovered:true,forgedDocuments:true,aceInTheHole:true};
  expect(spyDiscoveryConsequence(ctx).outcome).toBe('captured');
  expect(spyAgentTier(0).cunning).toBe(3);
 });
 it('missão fracassada sem descoberta não elimina agente',()=>{
  expect(spyDiscoveryConsequence({
   difficulty:18,result:9,law:50,guardPresent:true,prisonPresent:true,discovered:false,
   aceInTheHole:true,
  }).outcome).toBe('failed_undetected');
 });
 it('vagas são ligadas às células registradas, não criadas sem posse',()=>{
  expect(spyActiveCellCapacity('pros-spy-network')).toBe(1);
  expect(spyActiveCellCapacity('pros-spy-network--expanded-network')).toBe(2);
  expect(spyActiveCellCapacity('pros-gaol')).toBe(0);
 });
 it('dados negativos ou não inteiros não criam promoções/fugas',()=>{
  expect(()=>spyAgentTier(-1)).toThrow();
  expect(()=>spyAgentTier(1.5)).toThrow();
 });
});

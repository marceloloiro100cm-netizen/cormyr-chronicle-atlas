/** Cormyr homebrew · classificação, Astúcia e consequências de espionagem.
 * Valores aprovados pelo Narrador. Não são uma atribuição automática do livro Prosperidade.
 * Uma missão é premiada somente depois de resolução autorizada e idempotente no servidor.
 */
export const SPY_AGENT_RULES_VERSION='cormyr-agent-tiers-v1' as const;
export const SPY_AGENT_RANKS=['Verde','Treinada','Veterana','Elite'] as const;
export type SpyAgentRank=typeof SPY_AGENT_RANKS[number];
export const SUCCESSES_PER_RANK=3 as const;
export function spyAgentTier(successes:number){
 if(!Number.isSafeInteger(successes)||successes<0)
  throw new Error('Total de missões bem-sucedidas inválido.');
 const index=Math.min(3,Math.floor(successes/SUCCESSES_PER_RANK));
 return {
  index,rank:SPY_AGENT_RANKS[index]!,
  cunning:3+index,
  successes,
  inCurrentRank:index===3?3:successes%SUCCESSES_PER_RANK,
  toNextRank:index===3?0:SUCCESSES_PER_RANK-successes%SUCCESSES_PER_RANK,
 } as const;
}
export function spyFailureDegrees(difficulty:number,result:number){
 if(!Number.isSafeInteger(difficulty)||!Number.isSafeInteger(result)||
  difficulty<0||result<0)throw new Error('Resultado ou dificuldade inválidos.');
 return Math.ceil(Math.max(0,difficulty-result)/5);
}
export type SpyDiscoveryFate='escaped'|'captured'|'dead';
export const SPY_AGENT_UPGRADES={
 forged_documents:{name:'Documentos falsificados',cost:1,description:'Diminui em um grau a gravidade da falha descoberta, aumentando a possibilidade de fuga.'},
 ace_in_the_hole:{name:'Uma carta na manga',cost:1,description:'O agente não pode morrer por descoberta; qualquer resultado de morte se converte em prisão.'},
} as const;
export type SpyAgentUpgrade=keyof typeof SPY_AGENT_UPGRADES;
export type SpyFateContext={
 difficulty:number;result:number;
 law:number;guardPresent:boolean;prisonPresent:boolean;discovered:boolean;
 forgedDocuments?:boolean;aceInTheHole?:boolean;
};
/** "Um grau" = até 5 pontos abaixo da dificuldade (regra adaptada).
 * Primeiro grau sempre foge. Dois graus exigem aparato de captura.
 * Três ou mais graus e Lei alta com guardas levam a morte; sem aparato
 * suficiente a consequência não é inventada e o espião escapa.
 * Os patamares Lei 15/30 são escolha de Cormyr, NÃO do livro.
 */
export function spyDiscoveryConsequence(ctx:SpyFateContext):
 {outcome:'success'|'failed_undetected'|SpyDiscoveryFate;degrees:number}{
 if(!Number.isSafeInteger(ctx.law)||ctx.law<0||
  !Number.isSafeInteger(ctx.difficulty)||!Number.isSafeInteger(ctx.result))
  throw new Error('Contexto de espionagem inválido.');
 const degrees=spyFailureDegrees(ctx.difficulty,ctx.result);
 if(degrees===0)return {outcome:'success',degrees};
 if(!ctx.discovered)return {outcome:'failed_undetected',degrees};
 // Documents are a +1 degree escape improvement. Keep original
 // failure degrees for the archive, and only adapt the consequence.
 const effectiveDegrees=Math.max(1,degrees-(ctx.forgedDocuments?1:0));
 if(effectiveDegrees===1)return {outcome:'escaped',degrees};
 if(effectiveDegrees>=3&&ctx.law>=30&&ctx.guardPresent)
  return {outcome:ctx.aceInTheHole?'captured':'dead',degrees};
 if(effectiveDegrees>=2&&ctx.law>=15&&ctx.guardPresent&&ctx.prisonPresent)
  return {outcome:'captured',degrees};
 return {outcome:'escaped',degrees};
}
export function spyActiveCellCapacity(itemId:string){
 return itemId==='pros-spy-network'?3:
  itemId==='pros-spy-network--expanded-network'?2:0;
}

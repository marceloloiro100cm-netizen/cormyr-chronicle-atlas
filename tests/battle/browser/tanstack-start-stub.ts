/** Apenas para o harness Chromium sintético. Nenhum servidor/conta real é acessado. */
export function useServerFn<T>(fn:T):T{return fn;}
const disabled=async()=>{throw new Error('Função de servidor bloqueada no teste sintético.');};
type StubBuilder={middleware:(...args:unknown[])=>StubBuilder;validator:(...args:unknown[])=>StubBuilder;
 inputValidator:(...args:unknown[])=>StubBuilder;handler:(...args:unknown[])=>typeof disabled};
const builder:StubBuilder={
 middleware:()=>builder,validator:()=>builder,inputValidator:()=>builder,handler:()=>disabled,
};
export const createServerFn=(_options?:unknown):StubBuilder=>builder;

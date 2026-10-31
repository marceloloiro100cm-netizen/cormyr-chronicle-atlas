import {describe,it,expect} from 'vitest';
import {QueryClient} from '@tanstack/react-query';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {isNarratorAccessRevoked,purgeRevokedNarratorCache} from '@/lib/auth/narrator-revocation';

describe('Lote 33 · ocultação administrativa após perda de privilégios',()=>{
 it('classifica negação administrativa sem tratar erro de rede como revogação',()=>{
  for(const e of [
   {code:'42501',message:'Forbidden'},
   new Error('Permissão de Narrador revogada. Recarregue as autorizações.'),
   new Error('Somente o Narrador pode confirmar esta operação.'),
   new Error('Apenas o Narrador pode consultar esse relatório.'),
  ])expect(isNarratorAccessRevoked(e)).toBe(true);
  for(const e of [null,undefined,new Error('Falha de rede'),{code:'PGRST500',message:'timeout'}])
   expect(isNarratorAccessRevoked(e)).toBe(false);
 });
 it('remove todas as consultas privadas e preserva apenas a verificação do escopo',()=>{
  const qc=new QueryClient();
  const keys=[
   ['campaign-panel'],['campaign-calendar'],['campaign-time-preview',1],
   ['campaign-schedule-drafts'],['campaign-time-history'],
   ['temporal-consumer-dashboard'],['temporal-release-preflight'],
   ['noble-house','evenhand'],['mail-overview-grouped'],
  ];
  qc.setQueryData(['campaign-access-scope'],{userId:'gm',admin:false,fingerprint:'demoted'});
  for(const k of keys)qc.setQueryData(k,{private:true});
  purgeRevokedNarratorCache(qc);
  expect(qc.getQueryData(['campaign-access-scope'])).toMatchObject({admin:false});
  for(const k of keys)expect(qc.getQueryData(k)).toBeUndefined();
  expect(qc.getQueryCache().getAll().length).toBe(1);
 });
 it('ambos os painéis bloqueiam renderização e limpam cache na recusa do RPC',()=>{
  const calendar=readFileSync(resolve(process.cwd(),'src/components/calendar/narrator-calendar.tsx'),'utf8');
  const hub=readFileSync(resolve(process.cwd(),'src/components/calendar/temporal-consumer-hub.tsx'),'utf8');
  for(const text of [calendar,hub]){
   expect(text).toContain('if(accessRevoked)return <section role="alert">');
   expect(text).toContain('purgeRevokedNarratorCache(qc)');
   expect(text).toContain('setAccessRevoked(true)');
   expect(text).toContain('await requireFreshNarratorAccess()');
  }
 });
});

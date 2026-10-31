import {describe,it,expect} from 'vitest';
import {QueryClient} from '@tanstack/react-query';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 NARRATOR_ACCESS_REVOKED_KEY,isNarratorPrivateQueryKey,
 watchNarratorPrivateReadRevocations,
} from '@/lib/auth/narrator-revocation';

const client=()=>new QueryClient({defaultOptions:{queries:{retry:false}}});

describe('Lote 35 · consultas temporais e revogação de leitura',()=>{
 it('classifica apenas raízes explícitas de dados administrativos',()=>{
  for(const key of [['noble-character-registry'],['character-age-dashboard',1522,1523],
   ['campaign-schedule-drafts'],['temporal-consumer-dashboard'],['campaign-chronology',1522,1]])
   expect(isNarratorPrivateQueryKey(key)).toBe(true);
  for(const key of [['campaign-calendar'],['campaign-panel'],['mail-page','player'],[],[null]])
   expect(isNarratorPrivateQueryKey(key)).toBe(false);
 });
 it('resposta 42501 numa leitura revoga a interface e expurga outros caches',async()=>{
  const qc=client();
  qc.setQueryData(['campaign-access-scope'],{admin:true});
  qc.setQueryData(['campaign-panel'],{secret:true});
  qc.setQueryData(['noble-house','private'],{resources:100});
  const unwatch=watchNarratorPrivateReadRevocations(qc);
  await qc.fetchQuery({queryKey:['noble-character-registry'],queryFn:async()=>Promise.reject({
   code:'42501',message:'permission denied for function get_character_registry_hub',
  })}).catch(()=>undefined);
  expect(qc.getQueryData(NARRATOR_ACCESS_REVOKED_KEY)).toMatchObject({revokedAt:expect.any(Number)});
  expect(qc.getQueryData(['campaign-panel'])).toBeUndefined();
  expect(qc.getQueryData(['noble-house','private'])).toBeUndefined();
  expect(qc.getQueryData(['campaign-access-scope'])).toEqual({admin:true});
  unwatch();qc.clear();
 });
 it('falha de rede privada não afirma perda do papel',async()=>{
  const qc=client();
  const unwatch=watchNarratorPrivateReadRevocations(qc);
  await qc.fetchQuery({queryKey:['temporal-release-preflight'],queryFn:async()=>{
   throw new Error('network timeout');
  }}).catch(()=>undefined);
  expect(qc.getQueryData(NARRATOR_ACCESS_REVOKED_KEY)).toBeUndefined();
  unwatch();qc.clear();
 });
 it('um erro público não desliga a área administrativa',async()=>{
  const qc=client();
  const unwatch=watchNarratorPrivateReadRevocations(qc);
  await qc.fetchQuery({queryKey:['campaign-calendar'],queryFn:async()=>Promise.reject({
   code:'42501',message:'permission denied',
  })}).catch(()=>undefined);
  expect(qc.getQueryData(NARRATOR_ACCESS_REVOKED_KEY)).toBeUndefined();
  unwatch();qc.clear();
 });
 it('cancelar assinatura elimina efeitos após desmontagem',async()=>{
  const qc=client();
  const unwatch=watchNarratorPrivateReadRevocations(qc);
  unwatch();
  await qc.fetchQuery({queryKey:['character-year-transitions'],queryFn:async()=>Promise.reject({
   code:'42501',message:'forbidden',
  })}).catch(()=>undefined);
  expect(qc.getQueryData(NARRATOR_ACCESS_REVOKED_KEY)).toBeUndefined();
  qc.clear();
 });
 it('a rota instala guarda apenas sob escopo administrativo confirmado',()=>{
  const s=readFileSync(resolve(process.cwd(),'src/routes/_authenticated/jogadores.tsx'),'utf8');
  expect(s).toContain('if(!scope.data?.admin||revoked.data)return;');
  expect(s).toContain('return watchNarratorPrivateReadRevocations(qc);');
  expect(s).toContain('if(revoked.data)return <section role="alert">');
 });
});

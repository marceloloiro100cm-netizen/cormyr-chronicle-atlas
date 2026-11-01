import {describe,expect,it} from 'vitest';
import {QueryClient} from '@tanstack/react-query';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 NARRATOR_ACCESS_REVOKED_KEY,canReleaseNarratorLock,purgeRevokedNarratorCache,
} from '@/lib/auth/narrator-revocation';
import {CAMPAIGN_ACCESS_SCOPE_KEY} from '@/lib/auth/campaign-access-scope';

describe('Lote 34 · bloqueio global após revogação do Narrador',()=>{
 it('bloqueia a rota no mesmo instante e elimina dados privados de todas as abas',()=>{
  const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
  qc.setQueryData(CAMPAIGN_ACCESS_SCOPE_KEY,{userId:'gm',admin:true,fingerprint:'before'});
  for(const key of [['campaign-panel'],['mail-overview-grouped'],['campaign-schedule-drafts'],
   ['temporal-consumer-dashboard'],['character-registry-hub'],['campaign-time-history']])
   qc.setQueryData(key,{private:true});
  purgeRevokedNarratorCache(qc);
  expect(qc.getQueryData(NARRATOR_ACCESS_REVOKED_KEY)).toMatchObject({revokedAt:expect.any(Number)});
  expect(qc.getQueryData(CAMPAIGN_ACCESS_SCOPE_KEY)).toMatchObject({admin:true});
  expect(qc.getQueryData(['campaign-panel'])).toBeUndefined();
  expect(qc.getQueryData(['mail-overview-grouped'])).toBeUndefined();
  expect(qc.getQueryData(['campaign-schedule-drafts'])).toBeUndefined();
  expect(qc.getQueryData(['temporal-consumer-dashboard'])).toBeUndefined();
 });
 it('não libera com snapshot antigo, consulta em voo, erro ou ausência de papel',()=>{
  const marker={revokedAt:500};
  for(const scenario of [
   {dataUpdatedAt:499,hasData:true,isError:false,isFetching:false},
   {dataUpdatedAt:500,hasData:true,isError:false,isFetching:false},
   {dataUpdatedAt:501,hasData:true,isError:false,isFetching:true},
   {dataUpdatedAt:501,hasData:false,isError:false,isFetching:false},
   {dataUpdatedAt:501,hasData:true,isError:true,isFetching:false},
  ])expect(canReleaseNarratorLock(marker,scenario)).toBe(false);
  expect(canReleaseNarratorLock(marker,{
   dataUpdatedAt:501,hasData:true,isError:false,isFetching:false,
  })).toBe(true);
 });
 it('a rota observa o bloqueio antes de montar qualquer workspace privado',()=>{
  const source=readFileSync(resolve(process.cwd(),'src/routes/_authenticated/jogadores.tsx'),'utf8');
  const lock=source.indexOf('if(revoked.data)return <section role="alert">');
  const workspace=source.indexOf('return <PlayersWorkspace key={approved}');
  expect(source).toContain('queryKey:NARRATOR_ACCESS_REVOKED_KEY');
  expect(source).toContain('canReleaseNarratorLock(revoked.data');
  expect(source).toContain('dataUpdatedAt:scope.dataUpdatedAt');
  expect(source).toContain('isFetching:scope.isFetching');
  expect(lock).toBeGreaterThan(0);
  expect(workspace).toBeGreaterThan(lock);
  expect(source).toContain('<Button onClick={()=>void scope.refetch()}>Verificar permissões novamente</Button>');
 });
 it('o limpador exige reconsulta da permissão, nunca reusa o resultado anterior',()=>{
  const source=readFileSync(resolve(process.cwd(),'src/lib/auth/narrator-revocation.ts'),'utf8');
  const cancel=source.indexOf('client.cancelQueries({queryKey:CAMPAIGN_ACCESS_SCOPE_KEY,exact:true})');
  const recheck=source.indexOf('client.invalidateQueries({queryKey:CAMPAIGN_ACCESS_SCOPE_KEY,exact:true})');
  expect(source).toContain('clearRevokedAccessCache(client)');
  expect(source).toContain('client.setQueryData<NarratorRevocationMarker>(NARRATOR_ACCESS_REVOKED_KEY');
  expect(cancel).toBeGreaterThan(0);
  expect(recheck).toBeGreaterThan(cancel);
 });
});

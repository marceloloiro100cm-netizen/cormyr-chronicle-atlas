import {describe,it,expect} from 'vitest';
import {QueryClient} from '@tanstack/react-query';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 decideSessionBoundary,clearSessionQueryCache,clearRepresentationQueryCache,
} from '@/lib/auth/session-boundary';

const A='30000000-0000-0000-0000-000000002601';
const B='30000000-0000-0000-0000-000000002602';
function clientWithPrivateCache(){
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 qc.setQueryData(['campaign-calendar'],{year:1522,month:0,day:1,version:10});
 qc.setQueryData(['campaign-panel'],{user:{id:A},admin:true,records:['segredo A']});
 qc.setQueryData(['mail-page',A,'drafts',0],{letters:['carta confidencial de A']});
 qc.setQueryData(['campaign-chronology',1522,0],{events:['carta de A']});
 qc.setQueryData(['noble-house','evenhand'],{state:{treasury:100}});
 qc.setQueryData(['temporal-consumer-dashboard'],{private:'avisos do Narrador A'});
 qc.setQueryData(['mail-overview-grouped'],{total:9});
 return qc;
}

describe('Lote 26 · isolamento de cache na troca de identidade',()=>{
 it('trocar jogador A → B remove imediatamente TODO o cache, inclusive data e projeções',()=>{
  const qc=clientWithPrivateCache();
  const boundary=decideSessionBoundary(A,'SIGNED_IN',B);
  expect(boundary).toMatchObject({
   userId:B,clearPrivateCache:true,remountPrivateScreens:true,
   clearSelectedHouse:true,recheckRoute:true,reason:'identity_changed',
  });
  clearSessionQueryCache(qc);
  expect(qc.getQueryCache().getAll()).toHaveLength(0);
  for(const key of [['campaign-calendar'],['campaign-panel'],
   ['mail-page',A,'drafts',0],['noble-house','evenhand'],
   ['temporal-consumer-dashboard'],['campaign-chronology',1522,0]])
   expect(qc.getQueryData(key)).toBeUndefined();
  qc.setQueryData(['campaign-panel'],{user:{id:B},admin:false});
  expect(qc.getQueryData(['campaign-panel'])).toEqual({user:{id:B},admin:false});
  expect(qc.getQueryData(['mail-page',A,'drafts',0])).toBeUndefined();
 });
 it('sair sempre limpa os dados, mesmo se o usuário autenticado anterior é desconhecido',()=>{
  for(const old of [A,B,null,undefined]){
   const qc=clientWithPrivateCache();
   const transition=decideSessionBoundary(old,'SIGNED_OUT',null);
   expect(transition.clearPrivateCache).toBe(true);
   expect(transition.clearSelectedHouse).toBe(true);
   expect(transition.userId).toBe(null);
   clearSessionQueryCache(qc);
   expect(qc.getQueryCache().getAll()).toHaveLength(0);
  }
 });
 it('atualização de usuário invalida permissões de administrador sem reter dados da sessão',()=>{
  const qc=clientWithPrivateCache();
  const decision=decideSessionBoundary(A,'USER_UPDATED',A);
  expect(decision).toMatchObject({clearPrivateCache:true,remountPrivateScreens:true,
   recheckRoute:true,clearSelectedHouse:false});
  clearSessionQueryCache(qc);
  expect(qc.getQueryData(['temporal-consumer-dashboard'])).toBeUndefined();
  expect(qc.getQueryData(['campaign-panel'])).toBeUndefined();
 });
 it('inicialização e token renovado do mesmo jogador não causam resets recorrentes',()=>{
  expect(decideSessionBoundary(undefined,'INITIAL_SESSION',A)).toMatchObject({
   clearPrivateCache:false,userId:A,reason:'initial',
  });
  for(const event of ['SIGNED_IN','TOKEN_REFRESHED','INITIAL_SESSION']){
   const result=decideSessionBoundary(A,event,A);
   expect(result.clearPrivateCache).toBe(false);
   expect(result.remountPrivateScreens).toBe(false);
  }
  expect(decideSessionBoundary(undefined,'SIGNED_IN',A).clearPrivateCache).toBe(true);
  expect(decideSessionBoundary(null,'SIGNED_IN',A).clearPrivateCache).toBe(true);
 });
 it('token de identidade diferente e evento de login sem usuário falham fechados',()=>{
  const switched=decideSessionBoundary(A,'TOKEN_REFRESHED',B);
  expect(switched).toMatchObject({clearPrivateCache:true,userId:B});
  expect(decideSessionBoundary(A,'SIGNED_IN',null)).toMatchObject({
   clearPrivateCache:true,userId:null,reason:'signed_out',
  });
  const unknown=decideSessionBoundary(A,'UNRECOGNIZED_EVENT',B);
  expect(unknown).toMatchObject({
   clearPrivateCache:false,userId:A,recheckRoute:false,reason:'ignored',
  });
 });
 it('limpeza cancela o resultado de requisição privada pendente da conta antiga',async()=>{
  const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
  let release:(v:unknown)=>void=()=>{};
  const pending=qc.fetchQuery({
   queryKey:['mail-page',A],
   queryFn:()=>new Promise(resolve=>{release=resolve;}),
  }).catch(()=>undefined);
  expect(qc.getQueryCache().getAll()).toHaveLength(1);
  clearSessionQueryCache(qc);
  release({letters:['conteúdo da conta A que chegou atrasado']});
  await pending;
  expect(qc.getQueryData(['mail-page',A])).toBeUndefined();
  expect(qc.getQueryCache().getAll()).toHaveLength(0);
 });
 it('representação administrativa preserva o painel-base e descarta cache de outras Casas',()=>{
  const qc=clientWithPrivateCache();
  clearRepresentationQueryCache(qc);
  expect(qc.getQueryData(['campaign-panel'])).toMatchObject({admin:true});
  expect(qc.getQueryData(['noble-house','evenhand'])).toBeUndefined();
  expect(qc.getQueryData(['mail-page',A,'drafts',0])).toBeUndefined();
  expect(qc.getQueryData(['campaign-calendar'])).toBeUndefined();
  qc.setQueryData(['mail-page',B],{letters:['correspondência da representação B']});
  clearRepresentationQueryCache(qc);
  expect(qc.getQueryData(['mail-page',B])).toBeUndefined();
  const players=readFileSync(resolve(process.cwd(),'src/routes/_authenticated/jogadores.tsx'),'utf8');
  expect(players).toContain('clearRepresentationQueryCache(qc);setRepresenting(true)');
  expect(players).toContain('clearRepresentationQueryCache(qc);setRepresentedTheme(null);setRepresenting(false)');
 });
 it('o shell aplica a transição, limpa a seleção de Casa e desmonta telas privadas',()=>{
  const root=readFileSync(resolve(process.cwd(),'src/routes/__root.tsx'),'utf8');
  expect(root).toContain('decideSessionBoundary(knownUserId.current,event,session?.user?.id)');
  expect(root).toContain('clearSessionQueryCache(queryClient)');
  expect(root).toContain('setSessionEpoch(epoch=>epoch+1)');
  expect(root).toContain('sessionStorage.removeItem(\'campaign-selected-house\')');
  expect(root).toContain('<Outlet key={sessionEpoch} />');
  expect(root).toContain('void router.invalidate()');
  const header=readFileSync(resolve(process.cwd(),'src/components/campaign-shell.tsx'),'utf8');
  expect(header).toContain('clock.data&&!clock.isError');
 });
});

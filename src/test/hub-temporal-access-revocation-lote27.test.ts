import {beforeEach,describe,expect,it,vi} from 'vitest';
import {QueryClient} from '@tanstack/react-query';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 accessScopeFingerprint,loadCampaignAccessScope,clearRevokedAccessCache,
 CAMPAIGN_ACCESS_SCOPE_POLL_MS,CAMPAIGN_ACCESS_SCOPE_KEY,
} from '@/lib/auth/campaign-access-scope';

const mock=vi.hoisted(()=>({
 userId:'player-a',admin:false,playerId:'player-record',active:true,
 passwordChangeRequired:false,
 members:[{house_id:'evenhand',can_edit:true,can_edit_attributes:false}],
 failRole:false,failMembers:false,fetches:[] as string[],
}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{
  auth:{getUser:async()=>({data:{user:{id:mock.userId}},error:null})},
  rpc:async(name:string)=>{
   mock.fetches.push(name);
   return {data:mock.admin,error:mock.failRole?{message:'role unavailable'}:null};
  },
  from:(table:string)=>({
   select:(_columns:string)=>({
    eq:(_col:string,_value:string)=>({
     maybeSingle:async()=>({data:table==='campaign_players'&&mock.playerId?{
      id:mock.playerId,active:mock.active,
      require_password_change:mock.passwordChangeRequired,
     }:null,error:null}),
     then:(resolve:(value:unknown)=>unknown)=>resolve({
      data:mock.members,error:mock.failMembers?{message:'RLS error'}:null,
     }),
    }),
   }),
  }),
 },
}));
beforeEach(()=>{
 mock.userId='player-a';mock.admin=false;mock.playerId='player-record';
 mock.active=true;mock.passwordChangeRequired=false;
 mock.members=[{house_id:'evenhand',can_edit:true,can_edit_attributes:false}];
 mock.failRole=false;mock.failMembers=false;mock.fetches.length=0;
});

describe('Lote 27 · revogação e alteração de escopo durante sessão',()=>{
 it('aceita associações ordenadas independentemente da ordem de resposta SQL',()=>{
  const first={
   userId:'player-a',admin:false,playerId:'record',active:true,
   passwordChangeRequired:false,
   memberships:[
    {house_id:'b',can_edit:false,can_edit_attributes:false},
    {house_id:'a',can_edit:true,can_edit_attributes:true},
   ],
  };
  expect(accessScopeFingerprint(first)).toBe(accessScopeFingerprint({
   ...first,memberships:[...first.memberships].reverse(),
  }));
  expect(accessScopeFingerprint({...first,memberships:first.memberships.slice(0,1)}))
   .not.toBe(accessScopeFingerprint(first));
 });
 it('revogar membro, poder de compra ou atributos altera a assinatura',async()=>{
  const initial=await loadCampaignAccessScope();
  expect(initial.memberships).toHaveLength(1);
  mock.members=[{house_id:'evenhand',can_edit:false,can_edit_attributes:false}];
  const readOnly=await loadCampaignAccessScope();
  expect(readOnly.fingerprint).not.toBe(initial.fingerprint);
  mock.members=[];
  const revoked=await loadCampaignAccessScope();
  expect(revoked.fingerprint).not.toBe(readOnly.fingerprint);
  expect(revoked.memberships).toEqual([]);
  mock.members=[{house_id:'evenhand',can_edit:true,can_edit_attributes:true}];
  expect((await loadCampaignAccessScope()).fingerprint).not.toBe(initial.fingerprint);
  expect(mock.fetches).toEqual(['is_campaign_admin','is_campaign_admin',
   'is_campaign_admin','is_campaign_admin']);
 });
 it('demover Narrador e inativar jogador invalida o mesmo escopo',async()=>{
  mock.admin=true;
  const gm=await loadCampaignAccessScope();
  mock.admin=false;
  const demoted=await loadCampaignAccessScope();
  expect(gm.fingerprint).not.toBe(demoted.fingerprint);
  mock.active=false;
  const inactive=await loadCampaignAccessScope();
  expect(inactive.fingerprint).not.toBe(demoted.fingerprint);
  mock.passwordChangeRequired=true;
  expect((await loadCampaignAccessScope()).fingerprint).not.toBe(inactive.fingerprint);
 });
 it('falha fechada se RPC da função, vínculo ou autorização não responder',async()=>{
  mock.failRole=true;
  await expect(loadCampaignAccessScope()).rejects.toThrow('Narrador');
  mock.failRole=false;mock.failMembers=true;
  await expect(loadCampaignAccessScope()).rejects.toThrow('Vínculos');
 });
 it('limpa missivas, fichas e operações mas conserva o verificador de permissão',()=>{
  const qc=new QueryClient();
  qc.setQueryData(CAMPAIGN_ACCESS_SCOPE_KEY,{fingerprint:'a'});
  qc.setQueryData(['mail-page','player-a'],{letters:['carta privada']});
  qc.setQueryData(['noble-house','evenhand'],{treasury:10});
  qc.setQueryData(['campaign-calendar'],{year:1522});
  qc.setQueryData(['temporal-consumer-dashboard'],{pending:9});
  qc.setQueryData(['campaign-panel'],{admin:true,records:['segredo']});
  clearRevokedAccessCache(qc);
  expect(qc.getQueryData(CAMPAIGN_ACCESS_SCOPE_KEY)).toEqual({fingerprint:'a'});
  for(const key of [['mail-page','player-a'],['noble-house','evenhand'],
   ['campaign-calendar'],['temporal-consumer-dashboard'],['campaign-panel']])
   expect(qc.getQueryData(key)).toBeUndefined();
 });
 it('rota impede mostrar documentos antigos antes de verificação nova',()=>{
  const src=readFileSync(resolve(process.cwd(),
   'src/routes/_authenticated/jogadores.tsx'),'utf8');
  expect(src).toContain('queryFn:loadCampaignAccessScope');
  expect(src).toContain('refetchInterval:CAMPAIGN_ACCESS_SCOPE_POLL_MS');
  expect(src).toContain("refetchOnWindowFocus:'always'");
  expect(src).toContain("refetchOnReconnect:'always'");
  expect(src).toContain('clearRevokedAccessCache(qc)');
  expect(src).toContain("sessionStorage.removeItem('campaign-selected-house')");
  expect(src).toContain('approved!==scope.data.fingerprint');
  expect(src).toContain('<PlayersWorkspace key={approved}');
  expect(src).toContain('data.user.id!==expectedUserId');
  expect(CAMPAIGN_ACCESS_SCOPE_POLL_MS).toBe(15_000);
 });
});

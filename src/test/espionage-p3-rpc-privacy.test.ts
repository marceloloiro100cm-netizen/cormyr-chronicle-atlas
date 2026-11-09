import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
 session:true,denied:false,calls:[] as string[],result:null as unknown,
}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{
  auth:{getSession:async()=>({error:null,
   data:{session:state.session?{access_token:'session-test'}:null}})},
  rpc(this:{rest?:boolean},name:string){
   if(!this.rest)throw Error('Supabase receiver lost');
   state.calls.push(name);
   return Promise.resolve({
    data:state.result,error:state.denied?{message:'denied by RLS'}:null,
   });
  },
  rest:true,
 },
}));
import {readSpyNarratorIncidentsBrowser}
 from '@/lib/espionage/spy-operations-browser';
const good={id:'11111111-1111-4111-8111-111111111111',
 dateKey:'1522-01-21',outcome:'captured',ownerHouseName:'Ashkar',
 targetHouseName:'Evenhand',agentName:'Corvo',targetRegion:'helmlands',
 detail:'Capturado em patrulha'};
beforeEach(()=>{
 state.session=true;state.denied=false;state.calls.length=0;state.result=[];
});
describe('Espionagem P3 · autorização do livro de incidentes',()=>{
 it('sem login não executa RPC',async()=>{
  state.session=false;
  await expect(readSpyNarratorIncidentsBrowser()).rejects.toThrow('Sessão expirada');
  expect(state.calls).toHaveLength(0);
 });
 it('role não autorizado fica bloqueado no banco',async()=>{
  state.denied=true;
  await expect(readSpyNarratorIncidentsBrowser()).rejects.toThrow('não autorizada');
  expect(state.calls).toEqual(['spy_narrator_incident_history']);
 });
 it('sucesso apresenta apenas campos previstos e fecha a enumeração',async()=>{
  state.result=[good];
  await expect(readSpyNarratorIncidentsBrowser()).resolves.toEqual([good]);
  expect(state.calls).toEqual(['spy_narrator_incident_history']);
 });
 it('não aceita dados extras ou evento não homologado',async()=>{
  state.result=[{...good,ownerHouseId:'secret'}];
  await expect(readSpyNarratorIncidentsBrowser()).rejects.toThrow();
  state.result=[{...good,outcome:'detected_unconfirmed'}];
  await expect(readSpyNarratorIncidentsBrowser()).rejects.toThrow();
 });
});

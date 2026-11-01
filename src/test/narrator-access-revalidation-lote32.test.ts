import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const spy=vi.hoisted(()=>({admin:true,error:false,rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{rpc:spy.rpc},
}));
import {requireFreshNarratorAccess} from '@/lib/auth/campaign-access-scope';
describe('Lote 32 · verificação de privilégios antes de comandos de calendário',()=>{
 it('só permite a autorização quando a função do banco retornar true',async()=>{
  spy.rpc.mockImplementation(async(name:string)=>({
   data:name==='is_campaign_admin'&&spy.admin,
   error:spy.error?{message:'Permissão indisponível'}:null,
  }));
  spy.admin=true;spy.error=false;
  await expect(requireFreshNarratorAccess()).resolves.toBeUndefined();
  spy.admin=false;
  await expect(requireFreshNarratorAccess()).rejects.toThrow('Permissão de Narrador revogada');
  spy.error=true;
  await expect(requireFreshNarratorAccess()).rejects.toThrow('Permissões do Narrador indisponíveis');
  expect(spy.rpc.mock.calls.every(([name])=>name==='is_campaign_admin')).toBe(true);
 });
 it('revalida antes de salvar rascunho, publicar e decidir/reproduzir entregas',()=>{
  const calendar=readFileSync(resolve(process.cwd(),'src/components/calendar/narrator-calendar.tsx'),'utf8');
  const hub=readFileSync(resolve(process.cwd(),'src/components/calendar/temporal-consumer-hub.tsx'),'utf8');
  for(const rpc of ["rpc('save_campaign_schedule_event'","rpc('publish_campaign_time_change'"]){
   const i=calendar.indexOf(rpc);
   expect(i).toBeGreaterThan(0);
   expect(calendar.slice(Math.max(0,i-270),i)).toContain('await requireFreshNarratorAccess()');
  }
  for(const rpc of ["rpc('resolve_temporal_delivery'","rpc('replay_temporal_delivery'"]){
   const i=hub.indexOf(rpc);
   expect(i).toBeGreaterThan(0);
   expect(hub.slice(Math.max(0,i-190),i)).toContain('await requireFreshNarratorAccess()');
  }
 });
});

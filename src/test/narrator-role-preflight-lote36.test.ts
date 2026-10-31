import {describe,it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({response:{data:true as boolean|null,error:null as null|{code:string;message:string}},rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
import {requireFreshNarratorAccess} from '@/lib/auth/campaign-access-scope';
import {isNarratorAccessRevoked} from '@/lib/auth/narrator-revocation';

beforeEach(()=>{
 mock.response={data:true,error:null};
 mock.rpc.mockReset().mockImplementation(async()=>mock.response);
});
describe('Lote 36 · pré-voo distingue falha transitória e revogação',()=>{
 it('apenas autorização explícita permite chegar ao RPC de gravação',async()=>{
  await expect(requireFreshNarratorAccess()).resolves.toBeUndefined();
  expect(mock.rpc).toHaveBeenCalledWith('is_campaign_admin');
 });
 it('timeout bloqueia comando sem afirmar revogação',async()=>{
  mock.response={data:null,error:{code:'PGRST500',message:'timeout'}};
  await expect(requireFreshNarratorAccess()).rejects.toThrow('Permissões do Narrador indisponíveis');
  expect(isNarratorAccessRevoked(new Error('Permissões do Narrador indisponíveis'))).toBe(false);
 });
 it('negação do banco sinaliza revogação de cargo',async()=>{
  mock.response={data:null,error:{code:'42501',message:'permission denied'}};
  await expect(requireFreshNarratorAccess()).rejects.toThrow('Permissão de Narrador revogada');
 });
 it('resposta false também bloqueia como revogação',async()=>{
  mock.response={data:false,error:null};
  await expect(requireFreshNarratorAccess()).rejects.toThrow('Permissão de Narrador revogada');
 });
 it('resposta nula sem erro falha fechada',async()=>{
  mock.response={data:null,error:null};
  await expect(requireFreshNarratorAccess()).rejects.toThrow('Permissão de Narrador revogada');
 });
});

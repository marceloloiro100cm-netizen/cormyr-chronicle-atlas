import { beforeEach,describe,it,expect,vi } from 'vitest';
import { newHouseState } from '@/lib/house/types';
const mock=vi.hoisted(()=>({admin:false,member:false,rows:new Map<string,unknown>(),commit:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const chain={middleware:()=>chain,inputValidator:()=>chain,handler:(handler:unknown)=>handler};return chain;}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
function from(table:string){const chain={select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,maybeSingle:async()=>({data:mock.rows.get(table)??null,error:null}),single:async()=>({data:mock.rows.get(table)??null,error:null})};return chain;}
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{from:(table:string)=>from(table),rpc:(name:string,args:unknown)=>mock.commit(name,args)}}));
import { houseOperation } from '@/lib/house/house.functions';
type Call=(input:{data:Record<string,unknown>;context:{supabase:{rpc:(name:string)=>Promise<{data:boolean;error:null}>;from:typeof from};userId:string}})=>Promise<unknown>;
const execute=houseOperation as unknown as Call;
const context={userId:'actor',supabase:{rpc:async(name:string)=>({data:name==='is_campaign_admin'?mock.admin:mock.member,error:null}),from}};
const input=(action='domain',args:Record<string,unknown>={id:'00000000-0000-4000-8000-000000000002',name:'Domínio isolado',notes:''})=>({data:{houseId:'isolated',version:0,key:'00000000-0000-4000-8000-000000000001',action,args,explanation:''},context});
beforeEach(()=>{mock.admin=false;mock.member=false;mock.rows.clear();mock.rows.set('campaign_houses',{region:'helmlands'});mock.commit.mockReset().mockResolvedValue({data:{state:newHouseState('isolated'),version:1,duplicate:false},error:null});});
describe('fronteira autenticada da ficha',()=>{
 it('acesso cruzado negado antes de ler ou gravar ficha',async()=>{await expect(execute(input())).rejects.toThrow('não autorizada');expect(mock.commit).not.toHaveBeenCalled();});
 it('jogador não aprova criação nem avança mês',async()=>{mock.member=true;await expect(execute(input('approve',{}))).rejects.toThrow('Narrador');await expect(execute(input('advance',{month:18265}))).rejects.toThrow('Narrador');expect(mock.commit).not.toHaveBeenCalled();});
 it('versão concorrente rejeita sem commit',async()=>{mock.member=true;mock.rows.set('noble_house_sheets',{version:1,state:newHouseState('isolated')});await expect(execute(input())).rejects.toThrow('outra janela'=== ''?'':'mudou');expect(mock.commit).not.toHaveBeenCalled();});
 it('duplo envio retorna operação anterior sem novo commit',async()=>{mock.member=true;mock.rows.set('noble_house_ledger',{actor:'actor',action:'domain',version:1,after_state:newHouseState('isolated')});const result=await execute(input());expect(result).toMatchObject({version:1,duplicate:true});expect(mock.commit).not.toHaveBeenCalled();});
 it('saldo insuficiente não chega à transação',async()=>{mock.member=true;mock.rows.set('noble_house_rule_overrides',null);const call=input('correct',{changes:{defense:1}});await expect(execute(call)).rejects.toThrow('Narrador');expect(mock.commit).not.toHaveBeenCalled();});
 it('domínio válido usa uma única transação',async()=>{mock.member=true;await execute(input());expect(mock.commit).toHaveBeenCalledTimes(1);expect(mock.commit.mock.calls[0]?.[0]).toBe('commit_noble_house_operation');});
});
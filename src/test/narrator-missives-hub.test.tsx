import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {NARRATOR_MENU,NarratorMissivasHub,mailHouseRegion} from '@/components/players/narrator-missives-hub';
import type {Panel} from '@/components/players/panel-data';

const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
vi.mock('@/components/players/missivas-tab',()=>({
 MissivasTab:({data,onManage,groupHouseIds}:{data:Panel;onManage:(house:string)=>void;groupHouseIds?:string[]})=>
 <div data-testid="all-house-mail" data-admin={String(data.admin)} data-groups={groupHouseIds?.join(',')}>
  <button type="button" onClick={()=>onManage('everlost')}>Abrir ficha da casa</button>
 </div>,
}));
afterEach(()=>{cleanup();mock.rpc.mockReset();});

const panel={
 admin:true,user:{id:'narrator'},players:[],members:[],
 houses:[
  {id:'ashkar',name:'Ashkar',region:'Dragoncoast',active:true,season:2},
  {id:'grantass',name:'Grantass',region:'Dragon Coast',active:true,season:2},
  {id:'everlost',name:'Everlost',region:'Horselands',active:true,season:2},
  {id:'harcourt',name:'Harcourt',region:'Horselands',active:true,season:2},
 ],
 letters:[],
 rounds:[{number:2,status:'closed'},{number:3,status:'open'}],
} as unknown as Panel;
function mount(){
 mock.rpc.mockImplementation(async(name:string,args?:{p_house_ids:string[]})=>{
  if(name!=='mail_overview_grouped')throw Error('RPC inesperada: '+name);
  const ids=args?.p_house_ids??[];
  return {data:{total:ids.length,scheduled:ids.filter(x=>x==='ashkar').length,drafts:ids.filter(x=>x==='harcourt').length,delivered:0},error:null};
 });
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const onManage=vi.fn();
 render(<QueryClientProvider client={client}>
  <NarratorMissivasHub data={panel} me={undefined} onSave={vi.fn()} onError={vi.fn()} onManage={onManage}/>
 </QueryClientProvider>);
 return onManage;
}

describe('menu e grupos do Narrador',()=>{
 it('ordena Missivas acima de Calendário',()=>{
  expect(NARRATOR_MENU.map(([id])=>id)).toEqual(['painel','missivas','calendario','eventos','aventuras']);
 });
 it('interpreta Dragon Coast e Horselands mesmo com grafias diferentes',()=>{
  expect(mailHouseRegion('Dragoncoast')).toBe('dragon-coast');
  expect(mailHouseRegion('Dragon Coast')).toBe('dragon-coast');
  expect(mailHouseRegion('Horse Lands')).toBe('horselands');
  expect(mailHouseRegion('Horselands')).toBe('horselands');
 });
 it('permite selecionar os dois grupos simultaneamente, atualizando indicadores e consulta',async()=>{
  const onManage=mount();
  const all=screen.getByTestId('all-house-mail');
  expect(all).toHaveAttribute('data-groups','ashkar,everlost,grantass,harcourt');
  expect(await screen.findByText('4',{selector:'strong'})).toBeInTheDocument();
  const dragon=screen.getByRole('checkbox',{name:/Grupo 1 · Dragon Coast/});
  const horse=screen.getByRole('checkbox',{name:/Grupo 2 · Horselands/});
  expect(dragon).toBeChecked();expect(horse).toBeChecked();
  fireEvent.click(dragon);
  expect(horse).toBeChecked();
  expect(all).toHaveAttribute('data-groups','everlost,harcourt');
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('mail_overview_grouped',{p_house_ids:['everlost','harcourt']}));
  expect(await screen.findByText('2',{selector:'strong'})).toBeInTheDocument();
  fireEvent.click(dragon);
  expect(all).toHaveAttribute('data-groups','ashkar,everlost,grantass,harcourt');
  fireEvent.click(horse);
  expect(all).toHaveAttribute('data-groups','ashkar,grantass');
  fireEvent.click(dragon);
  expect(all).toHaveAttribute('data-groups','');
  await waitFor(()=>expect(screen.getByText('Entregas dos grupos').previousElementSibling).toHaveTextContent('0'));
  fireEvent.click(screen.getByRole('button',{name:'Abrir ficha da casa'}));
  expect(onManage).toHaveBeenCalledWith('everlost');
 });
});

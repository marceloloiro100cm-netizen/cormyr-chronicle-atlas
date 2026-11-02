import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {VassalSheetPreview} from '@/components/house/vassal-sheet-preview';
import {newHouseState} from '@/lib/house/types';
import type {Vassal} from '@/lib/house/types';

vi.mock('@tanstack/react-start',()=>({
 useServerFn:()=>async()=>{throw new Error('Casa oficial não encontrada.');},
}));
vi.mock('@/lib/house/house.functions',()=>({loadHouseHub:vi.fn(),loadHouseLedger:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{from:(table:string)=>{
  if(table!=='house_catalog')throw new Error('Unexpected private table read');
  return {select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({
   data:{id:'qazir',name:'Qazir',region:'Dragon Coast',public_reviewed:true,
    archive_data:{leader:'Rashid Qazir',crest:'assets/dragoncoast-qazir.webp',castle:'Alcácer da Vigília',motto:'Fire Finds a Way',city:'Safraya'}},
   error:null,
  })})})})};
 }},
}));
const vassal:Vassal={id:'link',houseId:'qazir',name:'Qazir',status:'approved',cost:20,influencePenalty:0,notes:'Casa Vassala'};
describe('ficha histórica pública de vassalo anexado',()=>{
 it('abre a ficha Qazir mesmo sem campanha_houses e sem inventar atributos',async()=>{
  const parent=newHouseState('ashkar');
  parent.vassals=[vassal];
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
   <VassalSheetPreview parent={parent} vassal={vassal}
    officialHouse={{id:'qazir',name:'Qazir',crest:'assets/dragoncoast-qazir.webp',region:'Dragon Coast'}}
    catalog={[]}/>
  </QueryClientProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Ficha resumida · Casa Qazir'}));
  await waitFor(()=>expect(screen.getByText('Rashid Qazir')).toBeInTheDocument());
  expect(screen.getByText('Alcácer da Vigília')).toBeInTheDocument();
  expect(screen.getAllByText('Não cadastrado')).toHaveLength(7);
  expect(screen.getByRole('button',{name:/Baixar ficha completa/})).toBeEnabled();
  expect(screen.queryByText(/não está acessível com as permissões atuais/)).not.toBeInTheDocument();
 });
});

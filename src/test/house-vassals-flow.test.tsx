import { useState } from 'react';
import { describe,it,expect,vi } from 'vitest';
import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import { Vassals } from '@/components/house/vassals';
import { newHouseState } from '@/lib/house/types';
import { proposeVassal,approveVassal } from '@/lib/house/military';
import { linkVassalNpcs } from '@/lib/house/vassal-links';
vi.mock('@tanstack/react-start',()=>({useServerFn:()=>async()=>({state:{...newHouseState('target'),base:{defense:10,influence:10,lands:10,law:10,population:10,power:10,wealth:10}},catalog:[]})}));
vi.mock('@/lib/house/house.functions',()=>({loadHouseHub:vi.fn(),loadHouseLedger:vi.fn()}));
function Harness(){const [state,setState]=useState(()=>{const s=newHouseState('isolated');s.base.power=100;return s;});return <Vassals catalog={[]} onCreate={async()=>true} onPurchase={async()=>true} onDomain={async()=>true} state={state} houses={[{id:'target',name:'Casa isolada',crest:null}]} npcs={[{id:'npc',title:'NPC original'}]} admin canEdit busy={false} onPropose={async args=>{setState(proposeVassal(state,args as Parameters<typeof proposeVassal>[1]));return true;}} onApprove={async args=>{setState(linkVassalNpcs(approveVassal(state,String(args['id']),0),String(args['id']),args['npcIds'] as string[]));return true;}} onEnd={async()=>true} onLoyalty={async()=>true}/>;}
describe('fluxo isolado de vassalos',()=>{
 it('propõe e aprova vassalo, substitui corte associada por ficha resumida',async()=>{render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Harness/></QueryClientProvider>);fireEvent.click(screen.getByText('Anexar Casa Existente'));fireEvent.change(screen.getByLabelText('Casa oficial'),{target:{value:'target'}});fireEvent.click(screen.getByLabelText('NPC original'));fireEvent.change(screen.getByLabelText('Fundamentação narrativa'),{target:{value:'Decisão isolada'}});fireEvent.click(screen.getByRole('button',{name:'Anexar casa · 20 Poder'}));await waitFor(()=>expect(screen.getByText('Aguardando decisão do Narrador')).toBeInTheDocument());fireEvent.click(screen.getByText('Revisar e aprovar vínculo'));fireEvent.change(screen.getByLabelText('Decisão do Narrador'),{target:{value:'Aprovado isoladamente'}});fireEvent.click(screen.getByRole('button',{name:'Aprovar vínculo e investimento'}));await waitFor(()=>expect(screen.getByText('Vínculo ativo')).toBeInTheDocument());expect(screen.getByText(/20 Poder alocado/)).toBeInTheDocument();expect(screen.queryByText('Corte associada')).not.toBeInTheDocument();
 expect(screen.queryByText('Alterar Corte associada')).not.toBeInTheDocument();
 expect(screen.queryByText('Regra de criação e Sorte')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/Ficha resumida/}));
 await waitFor(()=>expect(screen.getByText('Atributos e recursos')).toBeInTheDocument());
 expect(screen.getByRole('button',{name:/Baixar ficha completa/})).toBeInTheDocument();});
});

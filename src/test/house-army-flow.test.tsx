import { useState } from 'react';
import { describe,it,expect } from 'vitest';
import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import { Army } from '@/components/house/army';
import { newHouseState,type HouseState,type Unit } from '@/lib/house/types';
import { createUnit,UNIT_TYPES } from '@/lib/house/engine';
import { equipUnit } from '@/lib/house/military';
function Harness(){const [state,setState]=useState<HouseState>(()=>{const s=newHouseState('isolated');s.base.power=100;s.base.wealth=100;s.domains=[{id:'d',name:'Local isolado',terrain:'hills',features:[],notes:''}];return s;});return <Army state={state} admin canEdit busy={false} onCreate={async args=>{setState(createUnit(state,equipUnit(args['unit'] as Unit),UNIT_TYPES));return true;}} onEquipment={async()=>true} onState={async()=>true} onSurvivors={async()=>true} onSiege={async()=>true} onSiegeState={async()=>true} onTrain={async()=>true}/>;}
describe('criação visual militar isolada',()=>{
 it('cria cavalaria com montaria, lê saúde15 e conjunto completo',async()=>{render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Criar unidade'}));fireEvent.change(screen.getByLabelText('Nome da unidade',{exact:true}),{target:{value:'Unidade isolada'}});fireEvent.click(screen.getByLabelText('Cavalaria +5'));fireEvent.change(screen.getByLabelText('Nome da montaria'),{target:{value:'Montaria de teste'}});fireEvent.change(screen.getByLabelText('Vigor da montaria'),{target:{value:'5'}});fireEvent.change(screen.getByLabelText('Fonte dos atributos'),{target:{value:'Fonte autorizada isolada'}});fireEvent.change(screen.getByLabelText('Localização'),{target:{value:'d'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar unidade'}));await waitFor(()=>expect(screen.getByRole('heading',{name:'Unidade isolada'})).toBeInTheDocument());expect(screen.getByText('15 / 15')).toBeInTheDocument();expect(screen.getByText('20 / 20')).toBeInTheDocument();});
});
import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {UnitCommanderAssignment} from '@/components/house/unit-commander-assignment';
import {newHouseState,SKILLS,type Unit} from '@/lib/house/types';

function fixture(){
 const state=newHouseState('ashkar');
 state.court=[
  {id:'court-one',npcId:'npc-one',name:'Mestre de Armas',role:'Membro da Corte',notes:''},
  {id:'court-two',npcId:'npc-two',name:'Capitão da Guarda',role:'Comandante',notes:''}
 ];
 const unit:Unit={
  id:'unit-ashkar',name:'Companhia de Apoio de Cinzaria',types:['support'],
  training:'trained',origin:'Cinzaria',domainId:'domain-one',
  skills:Object.fromEntries(SKILLS.map(k=>[k,2])) as Unit['skills'],
  xp:0,costs:[],armor:0,armorPenalty:0,health:9,
  casualties:2,strength:100,disciplineModifier:0,
  equipment:[],situation:'Guardando Cinzaria',notes:'',mounted:true,atHome:true
 };
 const commanders=[
  {id:'npc-one',title:'Adelina, Mestra das Armas'},
  {id:'npc-two',title:'Thoran, Capitão'}
 ];
 return {state,unit,commanders};
}

describe('Comandante da unidade na ficha e no card',()=>{
 it('abre o botão de comandante e escolhe um NPC já vinculado à Corte',async()=>{
  const {state,unit,commanders}=fixture();
  const onAssign=vi.fn(async()=>true);
  render(<UnitCommanderAssignment unit={unit} court={state.court} commanders={commanders}
    canEdit busy={false} onAssign={onAssign}/>);
  const button=screen.getByRole('button',{name:'Sem comandante'});
  expect(button).toHaveAttribute('aria-expanded','false');
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded','true');
  fireEvent.change(screen.getByLabelText('Integrante da Corte'),{target:{value:'court-two'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirmar comandante'}));
  await waitFor(()=>expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({
   unitId:'unit-ashkar',commanderName:'Thoran, Capitão',
   domainId:'domain-one',health:9,casualties:2,
   situation:'Guardando Cinzaria',mounted:true,atHome:true,disband:false
  })));
  expect(button).toHaveAttribute('aria-expanded','false');
 });
 it('permite criar novo comandante no mesmo local, sem trocar características da unidade',async()=>{
  const {state,unit,commanders}=fixture();
  const onAssign=vi.fn(async()=>true);
  render(<UnitCommanderAssignment unit={unit} court={state.court} commanders={commanders}
    canEdit busy={false} emptyLabel="Não definido" onAssign={onAssign}/>);
  fireEvent.click(screen.getByRole('button',{name:'Não definido'}));
  fireEvent.click(screen.getByRole('button',{name:'Criar novo'}));
  fireEvent.change(screen.getByLabelText('Nome do novo comandante'),{target:{value:'Senhora Meris de Cinzaria'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirmar comandante'}));
  await waitFor(()=>expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({
   commanderName:'Senhora Meris de Cinzaria',
   unitId:unit.id,health:unit.health,casualties:unit.casualties
  })));
 });
 it('preserva a leitura sem edição quando a Casa não pode alterar unidades',()=>{
  const {state,unit,commanders}=fixture();
  const onAssign=vi.fn(async()=>true);
  render(<UnitCommanderAssignment unit={unit} court={state.court} commanders={commanders}
    canEdit={false} busy={false} onAssign={onAssign}/>);
  expect(screen.getByText('Sem comandante')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Sem comandante'})).not.toBeInTheDocument();
  expect(onAssign).not.toHaveBeenCalled();
 });
});

import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {Creation} from '@/components/house/creation';
import {newHouseState} from '@/lib/house/types';
import {rollFoundation} from '@/lib/house/creation-history';

afterEach(()=>cleanup());
function view(step:number,overrides:Partial<ReturnType<typeof newHouseState>>={}){
 const state=newHouseState('new-house');state.creationStep=step;Object.assign(state,overrides);
 const onSave=vi.fn(async()=>true),onRoll=vi.fn(async()=>true),onCreationAction=vi.fn(async()=>true),onNavigate=vi.fn();
 render(<Creation state={state} admin={false} busy={false} onSave={onSave} onRoll={onRoll}
  onCreationAction={onCreationAction} onNavigate={onNavigate}/>);
 return {onSave,onRoll,onCreationAction,onNavigate};
}
describe('creation wizard player workflow',()=>{
 it('allows editing identity without narrator budget and auto-saving',async()=>{
  const {onSave}=view(0);
  fireEvent.change(screen.getByRole('textbox',{name:'Lema'}),{target:{value:'Concordia'}});
  fireEvent.click(screen.getByRole('button',{name:/Salvar e continuar/}));
  await waitFor(()=>expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
   identity:expect.objectContaining({motto:'Concordia'}),creationStep:1,
  })));
 });
 it('allows a new player to start 7d6 without a narrator budget',async()=>{
  const {onRoll}=view(1);
  fireEvent.click(screen.getByRole('button',{name:/Rolar recursos da Casa/}));
  await waitFor(()=>expect(onRoll).toHaveBeenCalledTimes(1));
 });
 it('prevents rerolls after a previous 7d6',()=>{
  view(1,{method:'roll',rolls:Array.from({length:7},()=>Array(7).fill(3))});
  expect(screen.getByRole('button',{name:'Rolagens já registradas'})).toBeDisabled();
 });
 it('shows full historical event table and runs first foundation roll',async()=>{
  const {onCreationAction}=view(2);
  expect(screen.getByText(/Derrocada/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Rolar Fundação/}));
  await waitFor(()=>expect(onCreationAction).toHaveBeenCalledWith('foundation_roll',{}));
 });
 it('offers the 3d6 event with choices and blocks duplicate infrastructure selection',async()=>{
  const history=rollFoundation(()=>3);
  view(2,{creationHistory:history});
  const first=screen.getByRole('combobox',{name:'Primeiro recurso'});
  const second=screen.getByRole('combobox',{name:'Segundo recurso'});
  fireEvent.change(second,{target:{value:'defense'}});
  expect(screen.getByRole('button',{name:/Rolar evento 1/})).toBeDisabled();
  fireEvent.change(first,{target:{value:'wealth'}});
  expect(screen.getByRole('button',{name:/Rolar evento 1/})).toBeEnabled();
 });
 it('allows each linked player to request their own bonus from the resource step',async()=>{
  const {onCreationAction}=view(3);
  fireEvent.click(screen.getByRole('button',{name:/Aplicar meu bônus/}));
  await waitFor(()=>expect(onCreationAction).toHaveBeenCalledWith('member_bonus',{resource:'influence'}));
 });
 it('does not navigate away if autosave rejects changes',async()=>{
  const state=newHouseState('h');state.creationStep=4;
  const onSave=vi.fn(async()=>false),onNavigate=vi.fn();
  render(<Creation state={state} admin={false} busy={false} onSave={onSave}
   onRoll={async()=>true} onCreationAction={async()=>true} onNavigate={onNavigate}/>);
  fireEvent.click(screen.getByRole('button',{name:/Salvar e continuar/}));
  await waitFor(()=>expect(onSave).toHaveBeenCalled());
  expect(onNavigate).not.toHaveBeenCalled();
 });
});

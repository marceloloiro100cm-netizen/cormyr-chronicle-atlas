import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import { PurchaseDrawer } from '@/components/house/purchase-drawer';
import { CORE_CATALOG } from '@/lib/house/catalog';
import { newHouseState } from '@/lib/house/types';
describe('compra isolada sem alterar casas reais',()=>{
 it('escolhe Castelo, localiza, confere e confirma uma vez',async()=>{
  const state=newHouseState('isolated');state.base.defense=50;state.domains=[{id:'domain',name:'Domínio isolado',terrain:'hills',features:[],notes:''}];
  const confirm=vi.fn().mockResolvedValue(true);
  render(<PurchaseDrawer open onClose={()=>{}} state={state} catalog={CORE_CATALOG.filter(i=>i.id==='castle')} busy={false} onConfirm={confirm}/>);
  fireEvent.click(screen.getByRole('button',{name:/Castelo Castle/}));
  fireEvent.click(screen.getByRole('button',{name:'Escolher local'}));
  fireEvent.change(screen.getByLabelText('Domínio'),{target:{value:'domain'}});
  fireEvent.click(screen.getByRole('button',{name:'Conferir compra'}));
  fireEvent.click(screen.getByRole('button',{name:'Confirmar compra'}));
  await waitFor(()=>expect(confirm).toHaveBeenCalledTimes(1));
  expect(confirm.mock.calls[0]?.[0]).toMatchObject({itemId:'castle',domainId:'domain'});
  expect(state.holdings).toHaveLength(0);
 });
});
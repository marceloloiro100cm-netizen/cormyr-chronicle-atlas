import {afterEach,describe,expect,fireEvent,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {NARRATOR_MENU,NarratorMissivasHub} from '@/components/players/narrator-missives-hub';
import type {Panel} from '@/components/players/panel-data';

vi.mock('@/components/players/missivas-tab',()=>({
 MissivasTab:({data,onManage}:{data:Panel;onManage:(house:string)=>void})=><div data-testid="all-house-mail" data-admin={String(data.admin)}>
  <button type="button" onClick={()=>onManage('house-b')}>Abrir ficha da casa</button>
 </div>,
}));
afterEach(cleanup);

const panel={
 admin:true,user:{id:'narrator'},players:[],members:[],
 houses:[{id:'house-a',name:'Ashkar'},{id:'house-b',name:'Harcourt'}],
 letters:[
  {id:'delivered',publication_state:'delivered',deleted_at:null},
  {id:'scheduled',publication_state:'scheduled',deleted_at:null},
  {id:'draft',publication_state:'draft',deleted_at:null},
  {id:'removed',publication_state:'deleted',deleted_at:'2026-10-30'},
 ],
 rounds:[{number:2,status:'closed'},{number:3,status:'open'}],
} as unknown as Panel;

describe('menu do Narrador',()=>{
 it('apresenta Missivas imediatamente acima de Calendário sem afetar outras áreas',()=>{
  expect(NARRATOR_MENU.map(([id])=>id)).toEqual(['painel','missivas','calendario','eventos','aventuras']);
  expect(NARRATOR_MENU.map(([,label])=>label)).toEqual([
   'Conselho das casas','Missivas','Calendário','Eventos','Aventuras',
  ]);
 });
 it('abre a central de todas as casas com recursos da aba existente e encaminha navegação para a ficha',()=>{
  const onManage=vi.fn();
  render(<NarratorMissivasHub data={panel} me={undefined} onSave={vi.fn()} onError={vi.fn()} onManage={onManage}/>);
  expect(screen.getByRole('region',{name:'Central de missivas do Narrador'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Central de missivas'})).toBeInTheDocument();
  expect(screen.getByText('Entregas cadastradas').previousElementSibling).toHaveTextContent('3');
  expect(screen.getByText('Programadas').previousElementSibling).toHaveTextContent('1');
  expect(screen.getByText('Rascunhos').previousElementSibling).toHaveTextContent('1');
  expect(screen.getByText('Rodada atual').previousElementSibling).toHaveTextContent('3');
  expect(screen.getByTestId('all-house-mail')).toHaveAttribute('data-admin','true');
  fireEvent.click(screen.getByRole('button',{name:'Abrir ficha da casa'}));
  expect(onManage).toHaveBeenCalledWith('house-b');
 });
});

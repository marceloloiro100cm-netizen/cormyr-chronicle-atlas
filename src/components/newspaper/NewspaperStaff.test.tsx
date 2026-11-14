import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NewspaperStaff} from './NewspaperStaff';
import type {NewspaperStaffMember} from '@/lib/newspaper/model';

vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:null,isError:false})}));
vi.mock('@/lib/newspaper/data',()=>({signedStaffPhoto:vi.fn()}));
afterEach(cleanup);

const member=(id:string,name:string):NewspaperStaffMember=>({
 id,name,specialty:'',bio:'',photo_path:null,created_at:'',updated_at:'',
});
const staff=[member('a','Ana'),member('b','Bia'),member('c','Carla')];

describe('Redação: ordem da equipe para o Editor-Chefe',()=>{
 it('sobe e desce pelos botões chamando onReorder com o vizinho',()=>{
  const onReorder=vi.fn();
  render(<NewspaperStaff staff={staff} busy={false} onSave={vi.fn(async()=>true)} onDelete={vi.fn()} onReorder={onReorder}/>);
  fireEvent.click(screen.getByRole('button',{name:'Subir Bia'}));
  expect(onReorder).toHaveBeenCalledWith('b','a');
  fireEvent.click(screen.getByRole('button',{name:'Descer Bia'}));
  expect(onReorder).toHaveBeenCalledWith('b','c');
  expect(screen.getByRole('button',{name:'Subir Ana'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Descer Carla'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Arrastar Ana para mudar a ordem'})).toHaveAttribute('draggable','true');
 });
 it('sem onReorder não mostra controles de ordem', ()=>{
  render(<NewspaperStaff staff={staff} busy={false} onSave={vi.fn(async()=>true)} onDelete={vi.fn()}/>);
  expect(screen.queryByRole('button',{name:/Arrastar|Subir|Descer/})).toBeNull();
 });
});

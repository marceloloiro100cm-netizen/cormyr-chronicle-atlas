import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {NewspaperTeam} from './NewspaperTeam';
import type {NewspaperStaffMember} from '@/lib/newspaper/model';

vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:null,isError:false})}));
vi.mock('@/lib/newspaper/data',()=>({signedStaffPhoto:vi.fn()}));
afterEach(cleanup);

const member=(over:Partial<NewspaperStaffMember>):NewspaperStaffMember=>({
 id:'1',name:'Elara Voss',specialty:'Correspondente de guerra',bio:'Cobre a fronteira.',
 photo_path:null,created_at:'',updated_at:'',...over,
});

describe('Conheça Nossa Equipe (visão do jogador)',()=>{
 it('mostra nome, cargo e texto de cada membro, sem controles de edição',()=>{
  render(<NewspaperTeam staff={[member({}),member({id:'2',name:'Bran Tolley',specialty:'',bio:''})]}/>);
  expect(screen.getByRole('heading',{name:'Conheça Nossa Equipe'})).toBeInTheDocument();
  expect(screen.getByText('Elara Voss')).toBeInTheDocument();
  expect(screen.getByText('Correspondente de guerra')).toBeInTheDocument();
  expect(screen.getByText('Cobre a fronteira.')).toBeInTheDocument();
  expect(screen.getByText('Bran Tolley')).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
 });
 it('não ocupa espaço quando a Redação ainda não tem funcionários',()=>{
  const {container}=render(<NewspaperTeam staff={[]}/>);
  expect(container).toBeEmptyDOMElement();
 });
});

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
 it('mostra na ordem definida pelo Editor-Chefe, não por nome',()=>{
  render(<NewspaperTeam staff={[member({id:'1',name:'Ana',sort_order:2}),member({id:'2',name:'Zeca',sort_order:0}),member({id:'3',name:'Bia',sort_order:1})]}/>);
  expect(screen.getAllByRole('listitem').map(li=>li.querySelector('strong')?.textContent)).toEqual(['Zeca','Bia','Ana']);
 });
 it('restaura os quatro retratos históricos na vista pública sem Storage',()=>{
  render(<NewspaperTeam staff={[
   member({id:'a21815c4-569c-48cb-aa32-cc405753e548',name:'Parkxs Altenbuch'}),
   member({id:'3a351c4f-4972-41a3-b5c4-669bf79a2ba4',name:'Astarion Ancunin'}),
   member({id:'e1d07694-49e8-4703-bb4f-53ed1b3fbdb3',name:'Charlotte, o famoso gourmet'}),
   member({id:'987fa6a4-b052-41b8-b13e-fd50fa8f609a',name:'Edwina'}),
  ]}/>);
  expect(screen.getAllByRole('img',{name:/Foto histórica de/})).toHaveLength(4);
  for(const portrait of screen.getAllByRole('img',{name:/Foto histórica de/})){
   expect(portrait).toHaveClass('folha-staff-photo-historical');
   expect((portrait as HTMLElement).style.backgroundImage).toContain('data:image/webp;base64,');
  }
 });

});

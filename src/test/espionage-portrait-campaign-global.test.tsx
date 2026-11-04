import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {SpyPortraitPicker} from '@/components/house/espionage/spy-portrait-picker';

afterEach(cleanup);

const portraits=[
 {id:'occupied',label:'Tillet',imageUrl:'https://example.com/tillet.jpg',
  assignedAgentId:null,occupied:true},
 {id:'free',label:'Caçador',imageUrl:'https://example.com/cacador.jpg',
  assignedAgentId:null,occupied:false},
];
const agentId='a93c16f4-c5dc-4205-8a74-d9e6c9a346b2';

describe('Galeria de espiões · exclusividade entre Casas',()=>{
 it('não permite clicar retrato reservado por outro jogador sem expor sua identidade',()=>{
  const onChange=vi.fn();
  render(<SpyPortraitPicker portraits={portraits} selected={null}
   onChange={onChange}/>);
  const occupied=screen.getByRole('button',{name:'Tillet — indisponível'});
  expect(occupied).toBeDisabled();
  expect(occupied).toHaveAttribute('title','Tillet — já reservada por outro agente');
  expect(occupied).toHaveTextContent('Em uso');
  fireEvent.click(occupied);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Caçador'}));
  expect(onChange).toHaveBeenCalledExactlyOnceWith('free');
 });
 it('permite ao agente manter sua própria imagem reservada',()=>{
  const onChange=vi.fn();
  render(<SpyPortraitPicker portraits={[{
   ...portraits[0],assignedAgentId:agentId
  }]} selected="occupied" onChange={onChange} currentAgentId={agentId}/>);
  const own=screen.getByRole('button',{name:'Tillet'});
  expect(own).not.toBeDisabled();
  expect(own).toHaveAttribute('aria-pressed','true');
  fireEvent.click(own);
  expect(onChange).toHaveBeenCalledWith('occupied');
 });
 it('bloqueia também o vínculo antigo com outro agente da própria Casa',()=>{
  render(<SpyPortraitPicker portraits={[{
   ...portraits[0],assignedAgentId:agentId,occupied:false
  }]} selected={null} currentAgentId="4e27c90b-0814-48c7-aa62-e8ed62ed0481"
   onChange={vi.fn()}/>);
  expect(screen.getByRole('button',{name:'Tillet — indisponível'})).toBeDisabled();
 });
});

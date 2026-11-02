import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {HouseIdentity} from '@/components/players/house-identity';

afterEach(cleanup);

describe('cabeçalho da casa do jogador',()=>{
 it('mostra brasão e nome sem seletor ou rótulo de autorização',()=>{
  render(<HouseIdentity house={{id:'harcourt',name:'Harcourt',crest:'/cormyr/assets/horselands-harcourt.webp'}}/>);
  expect(screen.getByRole('img',{name:'Brasão da Casa Harcourt'})).toHaveAttribute('src','/cormyr/assets/horselands-harcourt.webp');
  expect(screen.getByRole('heading',{name:'Harcourt'})).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByText('Casa autorizada')).not.toBeInTheDocument();
 });
 it('exibe substituto quando o brasão não está cadastrado ou falha',()=>{
  const {rerender}=render(<HouseIdentity house={{id:'other',name:'Casa Exemplo',crest:null}}/>);
  expect(screen.getByRole('img',{name:'Brasão indisponível para Casa Exemplo'})).toBeInTheDocument();
  rerender(<HouseIdentity house={{id:'harcourt',name:'Harcourt',crest:'assets/horselands-harcourt.webp'}}/>);
  const crest=screen.getByRole('img',{name:'Brasão da Casa Harcourt'});
  expect(crest).toHaveAttribute('src','/cormyr/assets/horselands-harcourt.webp');
  fireEvent.error(crest);
  expect(screen.getByRole('img',{name:'Brasão indisponível para Harcourt'})).toBeInTheDocument();
 });
});

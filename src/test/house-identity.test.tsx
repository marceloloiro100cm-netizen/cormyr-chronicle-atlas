import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {HouseIdentity} from '@/components/players/house-identity';

afterEach(cleanup);

describe('cabeçalho da casa do jogador',()=>{
 it('prioriza o brasão original cadastrado sem criar seletor ou campo novo',()=>{
  render(<HouseIdentity house={{id:'harcourt',name:'Harcourt',crest:'/cormyr/assets/horselands-harcourt.webp'}}/>);
  expect(screen.getByRole('img',{name:'Brasão da Casa Harcourt'})).toHaveAttribute('src','/cormyr/assets/horselands-harcourt.webp');
  expect(screen.getByRole('heading',{name:'Harcourt'})).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByText('Casa autorizada')).not.toBeInTheDocument();
 });
 it('usa bandeira temática somente depois que a imagem oficial falhar',()=>{
  render(<HouseIdentity house={{id:'harcourt',name:'Harcourt',crest:'assets/horselands-harcourt.webp'}}/>);
  const crest=screen.getByRole('img',{name:'Brasão da Casa Harcourt'});
  fireEvent.error(crest);
  expect(screen.getByRole('img',{name:'Brasão da Casa Harcourt'})).toHaveAttribute('src','/house-flags/player-harcourt.webp');
  fireEvent.error(screen.getByRole('img',{name:'Brasão da Casa Harcourt'}));
  expect(screen.getByRole('img',{name:'Brasão indisponível para Harcourt'})).toBeInTheDocument();
 });
 it('não reutiliza falhas de outra Casa quando o jogador muda',()=>{
  const {rerender}=render(<HouseIdentity house={{id:'other',name:'Casa Exemplo',crest:null}}/>);
  expect(screen.getByRole('img',{name:'Brasão indisponível para Casa Exemplo'})).toBeInTheDocument();
  rerender(<HouseIdentity house={{id:'harcourt',name:'Harcourt',crest:'/cormyr/assets/horselands-harcourt.webp'}}/>);
  expect(screen.getByRole('img',{name:'Brasão da Casa Harcourt'})).toHaveAttribute('src','/cormyr/assets/horselands-harcourt.webp');
 });
});

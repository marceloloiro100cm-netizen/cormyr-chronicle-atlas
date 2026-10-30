import React,{useState} from 'react';
import {describe,it,expect,afterEach} from 'vitest';
import {render,screen,within,fireEvent,cleanup} from '@testing-library/react';
import {MailRecipientPicker} from '@/components/players/mail-recipients';
import type {Panel} from '@/components/players/panel-data';

const panel={
 admin:true,
 houses:[
  {id:'harcourt',name:'Harcourt',region:'Horselands',active:true,season:2},
  {id:'silver',name:'Silversky',region:'Dragon Coast',active:true,season:2},
  {id:'other-coast',name:'Grantass',region:'Dragon Coast',active:true,season:2},
  {id:'other',name:'Other House',region:'Volkumburgh',active:true,season:2},
 ],
 members:[],players:[],
} as unknown as Panel;
const options={players:[
 {id:'carlos',name:'Carlos Castellan',houses:['harcourt']},
 {id:'isaias',name:'Isaías Weber',houses:['silver']},
 {id:'gabriel',name:'Gabriel Chiomento',houses:['other-coast']},
 {id:'unassigned',name:'Sem casa',houses:[]},
]};
function Example(){
 const [targets,setTargets]=useState<string[]>([]);
 return <><MailRecipientPicker data={panel} options={options} me={undefined} targets={targets} onChange={setTargets}/>
  <output data-testid="targets">{targets.join(',')}</output></>;
}
afterEach(cleanup);

describe('seletor regional compacto para missivas',()=>{
 it('mostra Dragon Coast à esquerda e Horselands à direita, com casas e jogadores',()=>{
  render(<Example/>);
  const regions=screen.getAllByRole('region');
  expect(regions.map(r=>r.getAttribute('aria-label'))).toEqual([
   'Destinatários de Dragon Coast','Destinatários de Horselands','Destinatários de Outras regiões / sem vínculo'
  ]);
  expect(within(regions[0]!).getByRole('checkbox',{name:/Isaías Weber/})).toBeInTheDocument();
  expect(within(regions[1]!).getByRole('checkbox',{name:/Carlos Castellan/})).toBeInTheDocument();
 });
 it('seleciona casas de toda uma região sem misturar a outra',()=>{
  render(<Example/>);
  const coast=screen.getByRole('region',{name:'Destinatários de Dragon Coast'});
  fireEvent.click(within(coast).getByRole('button',{name:'Selecionar região inteira'}));
  expect(screen.getByTestId('targets').textContent).toBe('h:silver,h:other-coast');
  fireEvent.click(within(coast).getByRole('button',{name:'Desmarcar região'}));
  expect(screen.getByTestId('targets').textContent).toBe('');
 });
 it('impede seleção simultânea da casa inteira e do mesmo jogador',()=>{
  render(<Example/>);
  const coast=screen.getByRole('region',{name:'Destinatários de Dragon Coast'});
  fireEvent.click(within(coast).getByRole('button',{name:'Selecionar região inteira'}));
  fireEvent.click(within(coast).getByRole('checkbox',{name:/Isaías Weber/}));
  expect(screen.getByTestId('targets').textContent).toBe('h:other-coast,p:isaias');
  fireEvent.click(within(coast).getByRole('checkbox',{name:/Grantass/}));
  expect(screen.getByTestId('targets').textContent).toBe('p:isaias');
  fireEvent.click(within(coast).getByRole('checkbox',{name:/Gabriel Chiomento/}));
  expect(screen.getByTestId('targets').textContent).toBe('p:isaias,p:gabriel');
  fireEvent.click(within(coast).getByRole('checkbox',{name:/Grantass/}));
  expect(screen.getByTestId('targets').textContent).toBe('p:isaias,h:other-coast');
 });
 it('permite busca sem perder as escolhas existentes',()=>{
  render(<Example/>);
  const horse=screen.getByRole('region',{name:'Destinatários de Horselands'});
  fireEvent.click(within(horse).getByRole('checkbox',{name:/Carlos Castellan/}));
  fireEvent.change(screen.getByRole('searchbox',{name:'Buscar pessoa ou casa'}),{target:{value:'Silversky'}});
  expect(screen.getByTestId('targets').textContent).toBe('p:carlos');
  expect(screen.getByRole('checkbox',{name:/Isaías Weber/})).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox',{name:'Buscar pessoa ou casa'}),{target:{value:''}});
  expect(within(horse).getByRole('checkbox',{name:/Carlos Castellan/})).toBeChecked();
 });
});

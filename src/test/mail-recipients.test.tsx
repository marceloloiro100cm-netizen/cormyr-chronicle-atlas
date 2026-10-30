import React,{useState} from 'react';
import {describe,it,expect,afterEach} from 'vitest';
import {render,screen,within,fireEvent,cleanup} from '@testing-library/react';
import {MailRecipientPicker,recipientHouseRegion} from '@/components/players/mail-recipients';
import type {Panel} from '@/components/players/panel-data';

const panel={
 admin:true,
 houses:[
  {id:'ashkar',name:'Ashkar',region:null,active:true,season:2},
  {id:'fewmerry',name:'Fewmerry',region:'',active:true,season:2},
  {id:'goldfin',name:'Goldfin',region:'Volkumburgh',active:true,season:2},
  {id:'grantass',name:'Grantass',region:'Dragoncoast',active:true,season:2},
  {id:'erdenor',name:'Erdenor',region:'Horselands',active:true,season:2},
  {id:'everlost',name:'Everlost',region:'Horseland',active:true,season:2},
  {id:'harcourt',name:'Harcourt',region:'Horselands',active:true,season:2},
  {id:'silversky',name:'Silversky',region:'Horselands',active:true,season:2},
 ],
 members:[],players:[],
} as unknown as Panel;

function Example({source=panel,initial=[]}:{source?:Panel;initial?:string[]}){
 const [targets,setTargets]=useState<string[]>(initial);
 return <><MailRecipientPicker data={source} me={undefined} targets={targets} onChange={setTargets}/>
  <output data-testid="targets">{targets.join(',')}</output></>;
}
const chosen=()=>screen.getByTestId('targets').textContent??'';
afterEach(cleanup);

describe('destinatários por região e seleção individual reservada',()=>{
 it('classifica as quatro casas confirmadas na Dragon Coast mesmo com região ausente ou incorreta',()=>{
  for(const id of ['ashkar','fewmerry','goldfin','grantass'])
   expect(recipientHouseRegion({id,region:null})).toBe('dragon-coast');
  expect(recipientHouseRegion({id:'erdenor',region:'Horselands'})).toBe('horselands');
  expect(recipientHouseRegion({id:'nova-casa',region:'Volkumburgh'})).toBe('other');
 });
 it('mostra Dragon Coast à esquerda e Horselands à direita, sem nomes dos jogadores nem grupo extra',()=>{
  render(<Example/>);
  const regions=screen.getAllByRole('region');
  expect(regions.map(r=>r.getAttribute('aria-label'))).toEqual([
   'Destinatários individuais','Destinatários de Dragon Coast','Destinatários de Horselands'
  ]);
  const coast=regions[1]!,horse=regions[2]!;
  for(const house of ['Ashkar','Fewmerry','Goldfin','Grantass'])
   expect(within(coast).getByRole('checkbox',{name:house})).toBeInTheDocument();
  for(const house of ['Erdenor','Everlost','Harcourt','Silversky'])
   expect(within(horse).getByRole('checkbox',{name:house})).toBeInTheDocument();
  for(const person of ['Carlos Castellan','Cla Vasconcellos','Douglas Tondo','Gabriel Chiomento'])
   expect(screen.queryByText(person)).not.toBeInTheDocument();
 });
 it('seleção rápida do Grupo 1 nunca inclui o Grupo 2',()=>{
  render(<Example/>);
  fireEvent.click(screen.getByRole('button',{name:'Selecionar Grupo 1'}));
  expect(chosen().split(',').sort()).toEqual(['h:erdenor','h:everlost','h:harcourt','h:silversky'].sort());
  expect(chosen()).not.toContain('fewmerry');
 });
 it('Grupo 2 substitui o Grupo 1 para evitar envio geral regional acidental',()=>{
  render(<Example/>);
  fireEvent.click(screen.getByRole('button',{name:'Selecionar Grupo 1'}));
  fireEvent.click(screen.getByRole('button',{name:'Selecionar Grupo 2'}));
  expect(chosen()).toBe('h:fewmerry,h:grantass');
 });
 it('permite selecionar todas as casas de Dragon Coast pelo flag e depois desmarcar',()=>{
  render(<Example/>);
  const coast=screen.getByRole('region',{name:'Destinatários de Dragon Coast'});
  const flag=within(coast).getByRole('checkbox',{name:'Selecionar todas as casas de Dragon Coast'});
  fireEvent.click(flag);
  expect(chosen()).toBe('h:ashkar,h:fewmerry,h:goldfin,h:grantass');
  expect(flag).toBeChecked();
  fireEvent.click(flag);
  expect(chosen()).toBe('');
 });
 it('mostra estado parcial no flag e permite escolher casas individuais',()=>{
  render(<Example/>);
  const horse=screen.getByRole('region',{name:'Destinatários de Horselands'});
  const flag=within(horse).getByRole('checkbox',{name:'Selecionar todas as casas de Horselands'}) as HTMLInputElement;
  fireEvent.click(within(horse).getByRole('checkbox',{name:'Harcourt'}));
  expect(chosen()).toBe('h:harcourt');
  expect(flag.indeterminate).toBe(true);
  fireEvent.click(flag);
  expect(chosen()).toContain('h:harcourt');
  expect(chosen()).toContain('h:erdenor');
  expect(flag).toBeChecked();
 });
 it('flag regional seleciona inclusive casas ocultas pela busca, sem mexer em outra região',()=>{
  render(<Example/>);
  fireEvent.change(screen.getByRole('searchbox',{name:'Buscar casa'}),{target:{value:'Ashkar'}});
  const coast=screen.getByRole('region',{name:'Destinatários de Dragon Coast'});
  fireEvent.click(within(coast).getByRole('checkbox',{name:'Selecionar todas as casas de Dragon Coast'}));
  expect(chosen()).toBe('h:ashkar,h:fewmerry,h:goldfin,h:grantass');
  expect(chosen()).not.toContain('h:harcourt');
 });
 it('mantém grupo de revisão apenas para futuras casas de outra região',()=>{
  const source={...panel,houses:[...panel.houses,
   {id:'nova',name:'Nova Casa',region:'Shieldmark',active:true,season:2}]} as Panel;
  render(<Example source={source}/>);
  expect(screen.getByRole('region',{name:'Destinatários de Outras regiões (verificar cadastro)'})).toBeInTheDocument();
 });
 it('permite escolher apenas um jogador e não selecionar sua casa inteira',()=>{
  const source={...panel,players:[{id:'p-carlos',user_id:'login-carlos',name:'Carlos Castellan',
   active:true,require_password_change:false,roster_house_id:'harcourt'},
   {id:'p-anon',user_id:null,name:'Sem conta',active:true,require_password_change:false}]} as Panel;
  render(<Example source={source}/>);
  fireEvent.click(within(screen.getByRole('region',{name:'Destinatários individuais'}))
    .getByRole('checkbox',{name:'Carlos Castellan'}));
  expect(chosen()).toBe('p:p-carlos');
  expect(chosen()).not.toContain('h:harcourt');
  expect(screen.queryByRole('checkbox',{name:'Sem conta'})).not.toBeInTheDocument();
 });
 it('jogadores não recebem acesso ao seletor de pessoas individuais',()=>{
  const source={...panel,admin:false,players:[{id:'p-carlos',user_id:'login-carlos',name:'Carlos Castellan',active:true,require_password_change:false}]} as Panel;
  render(<Example source={source}/>);
  expect(screen.queryByRole('region',{name:'Destinatários individuais'})).not.toBeInTheDocument();
 });
 it('preserva destinos individuais de rascunhos anteriores no controle do Narrador',()=>{
  const source={...panel,players:[{id:'p-carlos',user_id:'login-carlos',name:'Carlos Castellan',active:true,require_password_change:false}]} as Panel;
  render(<Example source={source} initial={['p:p-carlos','h:ashkar']}/>);
  expect(chosen()).toBe('p:p-carlos,h:ashkar');
  expect(screen.getByRole('checkbox',{name:'Carlos Castellan'})).toBeChecked();
 });
});

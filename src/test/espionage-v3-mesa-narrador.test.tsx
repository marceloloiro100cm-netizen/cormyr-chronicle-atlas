import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import type {SpyNarratorOperation} from '@/lib/espionage/spy-operations-browser';
import {SpyNarratorOperationalMap,spyNarratorUniqueMapRegion}
 from '@/components/house/espionage/spy-narrator-operational-map';
import {spyNarratorClockAlerts}
 from '@/components/house/espionage/spy-narrator-operations-center';

const op=(override:Partial<SpyNarratorOperation>={}):SpyNarratorOperation=>({
 operationId:'11111111-1111-4111-8111-111111111111',
 ownerHouseId:'ashkar',ownerHouseName:'Ashkar',
 targetHouseId:'fewmerry',targetHouseName:'Fewmerry',
 agentName:'Feito Areia',agentStatus:'traveling',status:'traveling',
 objective:'house_resources',departureKey:'1522-01-11',
 arrivalKey:'1522-01-20',investigationEndKey:'1522-01-30',
 outcome:null,intelligenceStatus:null,createdAt:'2026-11-21T00:00:00Z',
 ...override,
});
afterEach(cleanup);

describe('Espionagem V3 · cartografia exclusivamente consultiva do Narrador',()=>{
 it('reaproveita as onze regiões sem inventar localização ambígua',()=>{
  expect(spyNarratorUniqueMapRegion('Ashkar')).toBe('dragoncoast');
  expect(spyNarratorUniqueMapRegion('Harcourt')).toBe('horselands');
  expect(spyNarratorUniqueMapRegion('Mareforte')).toBeNull();
  expect(spyNarratorUniqueMapRegion('Casa não identificada')).toBeNull();
 });
 it('reutiliza as dimensões reais e os marcadores das Casas no mesmo mapa',()=>{
  const {container}=render(<SpyNarratorOperationalMap operation={op()}/>);
  expect(screen.getByAltText('Mapa oficial ilustrado de Costa do Dragão'))
   .toHaveAttribute('src','/maps/espionage/dragoncoast.webp');
  expect(container.querySelector('svg[viewBox="0 0 1709 920"]')).not.toBeNull();
  expect(container.querySelectorAll('.spy-narrator-map-origin circle')).toHaveLength(1);
  expect(container.querySelectorAll('.spy-narrator-map-target circle')).toHaveLength(1);
  expect(screen.getByText(/não a posição atual do agente/)).toBeInTheDocument();
 });
 it('troca a região de visualização sem alterar a operação',()=>{
  const {container}=render(<SpyNarratorOperationalMap operation={op()}/>);
  fireEvent.change(screen.getByLabelText('Mapa'),{target:{value:'horselands'}});
  expect(screen.getByAltText('Mapa oficial ilustrado de Horselands'))
   .toHaveAttribute('src','/maps/espionage/horselands.webp');
  expect(container.querySelectorAll('.spy-narrator-map-origin circle')).toHaveLength(0);
  expect(container.querySelectorAll('.spy-narrator-map-target circle')).toHaveLength(0);
  expect(screen.getByText(/Nenhuma posição será inventada/)).toBeInTheDocument();
 });
 it('mostra dados ausentes como ausentes, sem fabricá-los',()=>{
  render(<SpyNarratorOperationalMap operation={op({arrivalKey:null,
   departureKey:null,investigationEndKey:null})}/>);
  expect(screen.getAllByText('Não informada')).toHaveLength(3);
 });
});

describe('Espionagem V3 · alertas do relógio oficial Harptos',()=>{
 it('considera dia intercalar, sem avançar a missão por progresso fictício',()=>{
  const traveling=op({arrivalKey:'1522-01-30'});
  const operating=op({operationId:'22222222-2222-4222-8222-222222222222',
   status:'operating',investigationEndKey:'1522-02-20'});
  expect(spyNarratorClockAlerts([traveling,operating],'1522-F-midwinter'))
   .toEqual([traveling]);
  expect(spyNarratorClockAlerts([traveling,operating],'1522-02-20'))
   .toEqual([traveling]);
 });
 it('não alerta sem data oficial ou para missões encerradas',()=>{
  const completed=op({status:'completed'});
  expect(spyNarratorClockAlerts([op()],null)).toEqual([]);
  expect(spyNarratorClockAlerts([completed],'1522-04-10')).toEqual([]);
  expect(spyNarratorClockAlerts([op()],'1522-01-11')).toEqual([]);
 });
});

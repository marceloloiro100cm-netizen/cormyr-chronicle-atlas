import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {BattleBoard} from '@/components/battle/BattleBoard';
import {BattleCrzLab,CRZ_MODEL_MILITARY_TYPE,crzUnitMilitarySymbol}
 from '@/components/battle/BattleCrzLab';
import {MilitaryUnitSymbol,militaryUnitSymbolSrc} from '@/components/house/military-unit-symbol';

afterEach(()=>{cleanup();vi.restoreAllMocks();window.localStorage.clear();});
describe('Tokens e mapas compartilhados entre os três sistemas',()=>{
 it('os brasões nas fichas usam o arquivo original sem deformação ou recorte de texto',()=>{
  const {container}=render(<MilitaryUnitSymbol typeId="infantry" size="small"/>);
  const image=container.querySelector('img');
  expect(image).not.toBeNull();
  expect(image?.getAttribute('src')).toBe(militaryUnitSymbolSrc('infantry'));
  expect(image?.className).toContain('military-unit-artwork');
 });
 it('o tabuleiro Adaptado usa 99 quadrados e token com emblema completo',()=>{
  const map=createScenario('plain-open',11,'square');
  const {container}=render(<BattleBoard map={map} stacks={[{
   id:'inf',name:'Infantaria',side:'attacker',position:{q:1,r:2},
   primaryTypeId:'infantry',initialCount:100,hpPerSoldier:3,currentHp:300,
   moraleState:'steady',
  }]}/>);
  expect(container.querySelectorAll('[data-battle-cell-shape="square"]')).toHaveLength(99);
  expect(container.querySelectorAll('[data-battle-cell-shape="hex"]')).toHaveLength(0);
  const insignia=container.querySelector('image');
  expect(insignia?.getAttribute('href')).toBe(militaryUnitSymbolSrc('infantry'));
  expect(insignia?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
 });
 it('o D&D simplificado é independente e fixa quadrados e regras CRZ-5E',()=>{
  render(<BattleCrzLab mode="dnd" onBack={vi.fn()}/>);
  expect(screen.getByRole('heading',{name:/D&D · Combate simplificado/})).toBeInTheDocument();
  expect(screen.queryByLabelText('Formato da malha CRZ')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Preset CRZ')).not.toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Mapas quadrados compartilhados'}))
   .toBeInTheDocument();
 });
 it('tropas fictícias 5e recebem ícones coerentes, sem inventar brasões de monstros',()=>{
  expect(Object.keys(CRZ_MODEL_MILITARY_TYPE)).toHaveLength(4);
  expect(crzUnitMilitarySymbol('archer-cca|original'))
   .toBe(militaryUnitSymbolSrc('archers'));
  expect(crzUnitMilitarySymbol('guard-cca|original'))
   .toBe(militaryUnitSymbolSrc('garrison'));
  expect(crzUnitMilitarySymbol('fictional-dragon-unknown')).toBeUndefined();
 });
});

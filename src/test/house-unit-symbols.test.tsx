import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {MilitaryUnitSymbol,MILITARY_SYMBOL_TYPES,missingMilitarySymbols,unitSymbolType} from '@/components/house/military-unit-symbol';
import {UnitSheet} from '@/components/house/unit-sheet';
import {UNIT_TYPES} from '@/lib/house/engine';
import {newHouseState,UNIT_SKILLS,UNIT_SKILL_NAMES,SKILLS,type Unit} from '@/lib/house/types';
import {unitXpSummary} from '@/lib/house/unit-progression';

describe('17 military heraldic emblems',()=>{
 it('provides an emblem for each canonical type, with no orphaned or duplicate symbol',()=>{
  expect(UNIT_TYPES).toHaveLength(17);
  expect(MILITARY_SYMBOL_TYPES).toHaveLength(17);
  expect(new Set(MILITARY_SYMBOL_TYPES).size).toBe(17);
  expect(missingMilitarySymbols()).toEqual([]);
  expect(new Set(UNIT_TYPES.map(x=>x.id))).toEqual(new Set(MILITARY_SYMBOL_TYPES));
 });
 it('renders the exact symbol of each type and respects equipment choice for mixed troops',()=>{
  for(const type of UNIT_TYPES){
   const {container,unmount}=render(<MilitaryUnitSymbol typeId={type.id}/>);
   const badge=container.querySelector('[role="img"]');
   expect(badge?.getAttribute('aria-label')).toContain(type.name);
   expect(badge?.getAttribute('style')).toContain('background-color');
   unmount();
  }
  expect(unitSymbolType(['infantry','archers'],'archers')).toBe('archers');
  expect(unitSymbolType(['cavalry','archers'],'unknown')).toBe('cavalry');
 });
});
describe('complete unit character sheet',()=>{
 function subject(){
  const state=newHouseState('test-house');
  const skills=Object.fromEntries(SKILLS.map(key=>[key,2])) as Unit['skills'];
  skills.agility=3;skills.fighting=5;
  const unit:Unit={
   id:'first',name:'Cavalaria de Cinzaria',types:['special'],training:'elite',
   origin:'Cinzaria',domainId:'d',skills,extraSkills:{knowledge:4},xp:20,
   costs:[],armor:5,armorPenalty:3,health:6,casualties:0,strength:100,
   disciplineModifier:0,equipment:[],situation:'Pronta',notes:'',
  };
  state.units=[unit];return {state,unit};
 }
 it('shows house owner and all 20 abilities with the matching number of filled pips',()=>{
  const {state,unit}=subject();
  const {container}=render(<UnitSheet houseName="Evenhand" state={state} unit={unit}
   canEdit={true} admin={false} busy={false} onEdit={async()=>true}
   onGrant={async()=>true} onEquipment={async()=>true}/>);
  fireEvent.click(screen.getByRole('button',{name:'Ver ficha gráfica de Cavalaria de Cinzaria'}));
  expect(screen.getByText('CASA EVENHAND · FICHA DE UNIDADE')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Baixar ficha \(PDF\)/})).toBeInTheDocument();
  expect(screen.getByRole('img',{name:/Símbolo militar: Especial/})).toBeInTheDocument();
  for(const skill of UNIT_SKILLS)expect(screen.getByText(UNIT_SKILL_NAMES[skill])).toBeInTheDocument();
  expect(UNIT_SKILLS).toHaveLength(20);
  const fighting=container.querySelector('[aria-label="Luta: graduação 5"]');
  const awareness=container.querySelector('[aria-label="Percepção: graduação 2"]');
  const knowledge=container.querySelector('[aria-label="Conhecimento: graduação 4"]');
  expect(fighting?.querySelectorAll('.military-pip')).toHaveLength(12);
  expect(fighting?.querySelectorAll('.military-pip.filled')).toHaveLength(5);
  expect(awareness?.querySelectorAll('.military-pip.filled')).toHaveLength(2);
  expect(knowledge?.querySelectorAll('.military-pip.filled')).toHaveLength(4);
  expect(unitXpSummary(unit).spent).toBe(120);
  expect(unitXpSummary(unit).available).toBe(20);
 });
 it('never inserts a fictional house name when the real owner is passed in',()=>{
  const {state,unit}=subject();
  render(<UnitSheet houseName="Goldfin" state={state} unit={unit} canEdit={false}
   admin={false} busy={false} onEdit={async()=>false} onGrant={async()=>false} onEquipment={async()=>false}/>);
  fireEvent.click(screen.getByRole('button',{name:'Ver ficha gráfica de Cavalaria de Cinzaria'}));
  expect(screen.getByText('CASA GOLDFIN · FICHA DE UNIDADE')).toBeInTheDocument();
 });
});

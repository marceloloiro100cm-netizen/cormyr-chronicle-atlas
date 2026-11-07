import {describe,it,expect} from 'vitest';
import {battleHouseDirectory,battleHouseRegions,battleRegionId,battleRosterEligible}
 from '@/lib/battle/adapters/house-directory';
import {readFileSync} from 'node:fs';

describe('Batalha · seleção de Região, Casa e unidades oficiais',()=>{
 it('lista todas as casas revisadas, inclusive fora da campanha de jogadores',()=>{
  const catalog=[
   {id:'ashkar',name:'Ashkar (catálogo)',region:'Dragon Coast'},
   {id:'stonecastle',name:'Stonecastle',region:'Helmlands'},
   {id:'phelles',name:'Phelles',region:'Crownland'},
  ];
  const campaign=[{id:'ashkar',name:'Ashkar',region:'dragoncoast'},
   {id:'erdenor',name:'Erdenor',region:'Horselands'}];
  const rows=battleHouseDirectory(catalog,campaign);
  expect(rows).toHaveLength(4);
  expect(rows.find(h=>h.id==='ashkar')).toEqual({
   id:'ashkar',name:'Ashkar',region:'dragoncoast',
  });
  expect(rows.find(h=>h.id==='phelles')?.region).toBe('crownlands');
  const regions=battleHouseRegions(rows);
  expect(regions.find(r=>r.id==='dragoncoast')?.houseCount).toBe(1);
  expect(regions.find(r=>r.id==='horselands')?.houseCount).toBe(1);
  expect(regions.find(r=>r.id==='helmlands')?.houseCount).toBe(1);
  expect(regions.find(r=>r.id==='crownlands')?.houseCount).toBe(1);
 });
 it('preserva casas sem classificação e normaliza regiões do catálogo',()=>{
  expect(battleRegionId('Dragon Coast')).toBe('dragoncoast');
  expect(battleRegionId('Crownland')).toBe('crownlands');
  expect(battleRegionId('Swordmark')).toBe('swordmark');
  expect(battleRegionId('Outra terra')).toBe('unclassified');
  const houses=battleHouseDirectory([{id:'x',name:'Casa X',region:'Outra terra'}],[]);
  expect(battleHouseRegions(houses)[0]?.name).toBe('Sem região classificada');
 });
 it('filtra apenas tropas terrestres vivas, sem inventar tipos ou efetivos',()=>{
  const base={id:'u',name:'Guarda',types:['infantry'],training:'trained',
   strength:100,casualties:0,destroyed:false};
  expect(battleRosterEligible(base)).toBe(true);
  expect(battleRosterEligible({...base,casualties:100})).toBe(false);
  expect(battleRosterEligible({...base,destroyed:true})).toBe(false);
  expect(battleRosterEligible({...base,types:['warships']})).toBe(false);
 });
 it('somente Narrador consulta roster; a ficha é convertida no servidor e a Casa histórica vazia não gera tropas',()=>{
  const source=readFileSync('src/lib/battle/adapters/readonly-source.functions.ts','utf8');
  expect(source).toContain("db.from('house_catalog').select('id,name,region,classification,crest:archive_data->>crest')");
  expect(source).toContain(".eq('public_reviewed',true)");
  expect(source).toContain("db.from('campaign_houses').select('id,name,region,crest')");
  expect(source).toContain("await requireNarrator(db)");
  expect(source).toContain("'no-military-sheet' as const");
  expect(source).toContain("sourceStatus:'scenario-roster' as const");
  expect(source).toContain('adaptOfficialUnit(state,unit');
  expect(source).not.toMatch(/houseOperation\(|changeUnitState\(|resolveSurvivors\(/);
 });
 it('PTE e V3 permitem usar Casas e continuam com limites de cinco por lado',()=>{
  const pte=readFileSync('src/components/battle/BattleSetup.tsx','utf8');
  const v3=readFileSync('src/components/battle/BattleV3NarratorEntry.tsx','utf8');
  const picker=readFileSync('src/components/battle/BattleSourcePicker.tsx','utf8');
  expect(pte).toContain("quickSource==='houses'");
  expect(pte).toContain("u.imported?{...u.imported,position,side:u.side}");
  expect(v3).toContain('isBattleTrainingCopy');
  expect(readFileSync('src/lib/battle/adapters/imported-npc-roster.ts','utf8')).toContain("stack.source.kind==='house-readonly'");
  expect(v3).toContain('officialHouseNames={officialHouseNames}');
  expect(picker).toContain('Região das casas');
  expect(picker).toContain('Casa de origem militar');
  expect(picker).toContain('Carregar {legalMarked.length} unidades na batalha');
  expect(picker).not.toMatch(/houseOperation\(|changeUnitState\(|resolveSurvivors\(/);
 });
});

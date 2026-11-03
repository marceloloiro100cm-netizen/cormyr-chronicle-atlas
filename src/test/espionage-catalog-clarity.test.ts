import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {SPY_HOLDING_IDS,calculateSpyDefense} from '@/lib/espionage/spy-defense';
import {spyCatalogExplanation,SPY_CATALOG_EXPLANATIONS}
 from '@/lib/espionage/spy-catalog-copy';
import {newHouseState,type Holding} from '@/lib/house/types';
import {CORE_CATALOG} from '@/lib/house/catalog';

const textFile=(name:string)=>readFileSync(resolve(name),'utf8');
describe('Espionagem · construções ao final e textos claros',()=>{
 it('ordena defesa, agentes e planejamento antes de construções',()=>{
  const hub=textFile('src/components/house/hub.tsx');
  const defense=hub.indexOf('<SpyDefensePanel state={state}/>');
  const agents=hub.indexOf('<SpyAgentManagement houseId={house.id}');
  const planner=hub.indexOf('<SpyRegionalTurnsPanel houseId={house.id}');
  const constructions=hub.indexOf('<HouseAssetCatalog section="spy"');
  expect(defense).toBeGreaterThan(-1);
  expect(agents).toBeGreaterThan(defense);
  expect(planner).toBeGreaterThan(agents);
  expect(constructions).toBeGreaterThan(planner);
 });
 it('cada uma das 14 posses de espionagem tem resumo, explicação, efeitos e alcance',()=>{
  expect(Object.keys(SPY_CATALOG_EXPLANATIONS).sort()).toEqual([...SPY_HOLDING_IDS].sort());
  for(const id of SPY_HOLDING_IDS){
   const item=spyCatalogExplanation(id);
   expect(item?.summary.length).toBeGreaterThan(20);
   expect(item?.purpose.length).toBeGreaterThan(30);
   expect(item?.reach.length).toBeGreaterThan(20);
   expect(item?.effects.length).toBeGreaterThan(0);
   const visible=[item!.summary,item!.purpose,item!.reach,...item!.effects].join(' ');
   expect(visible).not.toMatch(/\bSF\b|\bWarfare\b|\bConnections\b|\bSpy Cell Infiltration\b|\bSecret Police Infiltration\b/);
  }
 });
 it('Polícia Secreta tem a descrição do livro (+6) e não inventa aumentos de Lei',()=>{
  const police=CORE_CATALOG.find(c=>c.id==='pros-secret-police');
  expect(police?.description).toContain('+6');
  expect(police?.effects.some(e=>e.kind==='gain'&&e.resource==='law')).toBe(false);
  expect(police?.effects.some(e=>e.kind==='mitigation'&&e.resource==='law')).toBe(false);
  expect(spyCatalogExplanation('pros-secret-police')?.effects.join(' ')).toContain('+6');
 });
 it('Rede tem três células iniciais e o prazo correto de 6 meses mais dois dados',()=>{
  const network=CORE_CATALOG.find(c=>c.id==='pros-spy-network');
  expect(network?.description).toContain('três células');
  expect(network?.duration).toEqual({months:6,dice:2,sides:6});
  const sql=textFile('docs/espionage/sql/0094_spy_network_three_initial_cells.sql');
  expect(sql).toContain("WHEN 'pros-spy-network' THEN 3 ELSE 2");
  expect(sql).toContain('CREATE OR REPLACE FUNCTION public.spy_recruit_agent(');
 });
 it('Gangues de Rua reduz o custo de recrutamento em Poder, não em População',()=>{
  const gangs=CORE_CATALOG.find(c=>c.id==='pros-street-gangs');
  const levy=gangs?.effects.find(e=>e.kind==='discount'&&e.target==='unit:levies');
  expect(levy?.resource).toBe('power');
  expect(levy?.amount).toBe(2);
 });
 it('as funções protegidas consideram Polícia Secreta e Cães de Guarda',()=>{
  const sql=textFile('docs/espionage/sql/0093_correct_law_to_spy_difficulty.sql');
  expect(sql.split("'pros-secret-police'").length).toBeGreaterThanOrEqual(3);
  expect(sql.split("'pros-dog-kennels--guard-dogs'").length).toBeGreaterThanOrEqual(3);
  expect(sql.split("THEN 6 ELSE 0").length).toBeGreaterThanOrEqual(3);
  expect(sql).toContain("greatest(0,v_law-30)/5");
  expect(sql).not.toContain('least(5,v_defense/20)');
 });
 it('bônus +6 é aplicado à dificuldade e não à Lei, apenas com posse ativa',()=>{
  const state=newHouseState('auditoria','dragoncoast');
  state.method='import';
  state.base.law=30;
  state.domains=[{id:'d1',name:'Capital',terrain:'plain',features:[],notes:''}];
  const police:Holding={
   id:'police-1',itemId:'pros-secret-police',name:'Polícia Secreta',
   domainId:'d1',source:'Prosperidade',status:'active',
   costs:[],effects:[],ruleVersion:'test',
  };
  state.holdings=[police];
  let result=calculateSpyDefense(state);
  expect(result.law).toBe(30);
  expect(result.baseDifficulty).toBe(6);
  expect(result.globalBonuses).toBe(6);
  expect(result.domains[0]?.difficulty).toBe(12);
  state.holdings[0]={...police,status:'building'};
  result=calculateSpyDefense(state);
  expect(result.globalBonuses).toBe(0);
  expect(result.domains[0]?.difficulty).toBe(6);
 });
});

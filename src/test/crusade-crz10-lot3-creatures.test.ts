import {describe,it,expect} from 'vitest';
import {crzPreset} from '@/lib/crusade/ruleset';
import {crzSealCreature,crzReadCreature,crzCreaturePlayable}
 from '@/lib/crusade/creatures';
import {crzBuildCatalog,crzCatalogReport,crzGetCreature,CRZ_EMPTY_CATALOG}
 from '@/lib/crusade/catalog';
import {crzPrepareStack,crzPrepareArmy,crzRangeHex}
 from '@/lib/crusade/convert';

const rules=crzPreset('CRZ-5E');
function synthetic(overrides:Record<string,unknown>={}){
 return {
  schemaVersion:1,id:'sentinela-sintetico|test',name:'Sentinela sintético',
  source:'Material sintético de teste',size:'M',creatureType:'humanoid',
  tags:['synthetic','training'],cr:0.125,xp:25,proficiencyBonus:2,
  abilityMods:{str:1,dex:2,con:1,int:0,wis:0,cha:0},
  hp:{average:11,formula:'2d8+2'},ac:13,speedFt:{walk:30},
  attacks:[
   {id:'blade',name:'Lâmina de teste',kind:'melee',toHit:4,reachFt:5,
    damage:[{dice:'1d6',mod:2,avg:5,type:'slashing'}]},
   {id:'bow',name:'Arco de teste',kind:'ranged',toHit:3,
    rangeFt:{normal:80,long:320},
    damage:[{dice:'1d8',mod:1,avg:5,type:'piercing'}]},
  ],
  multiattack:{origin:'fallback',steps:[]},
  damageMods:{resist:[],immune:[],vulnerable:[]},
  conditionImmunities:[],traits:[],
  flags:{flying:false,ranged:true,caster:false,legendary:false,swarm:false},
  provenance:{origin:'manual',srd:false,license:'original-authorized',
   attribution:'Material sintético produzido exclusivamente para testes CRZ',
   permissionEvidence:'Criação ficcional original; nenhuma ficha licenciada copiada.'},
  warnings:['Magias e ações extras não modeladas nesta ficha sintética.'],
  ...overrides,
 };
}
function catalog(){
 return crzBuildCatalog([crzSealCreature(synthetic())]);
}
function setup(overrides:Record<string,unknown>={}){
 return {
  id:'stack-a',templateId:'sentinela-sintetico|test',count:12,
  source:{kind:'fictional'},training:'veteran',
  modifiers:{attack:2,ac:1,hpPct:20,dmgPct:10},
  ...overrides,
 };
}
describe('CRZ Lote 3 · catálogo local, proveniência e conversor',()=>{
 it('sela e verifica ficha original com ND fracionário (1/8), hash e licença',()=>{
  const creature=crzSealCreature(synthetic());
  expect(creature.cr).toBe(0.125);
  expect(creature.provenance.contentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(crzReadCreature(creature)).toEqual(creature);
  const modified={...creature,hp:{...creature.hp,average:99}};
  expect(()=>crzReadCreature(modified)).toThrow(/contentHash adulterado/);
  expect(()=>crzSealCreature(synthetic({cr:-1}))).toThrow();
 });
 it('recusa material não-SRD sem permissão e configurações que presumem direitos',()=>{
  const raw=synthetic() as ReturnType<typeof synthetic>;
  const provenance=raw.provenance;
  expect(()=>crzSealCreature(synthetic({provenance:{
   ...provenance,permissionEvidence:undefined,
  }}))).toThrow();
  expect(()=>crzSealCreature(synthetic({provenance:{
   ...provenance,origin:'srd',srd:false,
  }}))).toThrow();
  expect(()=>crzSealCreature(synthetic({attacks:[{
   id:'bad',name:'Desconhecido',kind:'melee',reachFt:5,
   damage:[{dice:'1d6',mod:0,avg:3,type:'slashing'}],
  }]}))).toThrow(/toHit/);
  expect(()=>crzSealCreature(synthetic({arbitraryField:'hidden'}))).toThrow();
 });
 it('catálogo tem ordem determinística, rejeita duplicatas e informa suporte',()=>{
  const one=crzSealCreature(synthetic());
  const two=crzSealCreature(synthetic({id:'bestiario-sintetico|test',
   name:'Bestiário sintético'}));
  const first=crzBuildCatalog([one,two]);
  const second=crzBuildCatalog([two,one]);
  expect(first).toEqual(second);
  expect(crzCatalogReport(first)).toMatchObject({
   total:2,playable:2,unsupported:0,warningCount:2,
  });
  expect(()=>crzBuildCatalog([one,one])).toThrow(/E_SETUP_DUP/);
  expect(crzCatalogReport(CRZ_EMPTY_CATALOG).total).toBe(0);
  expect(()=>crzGetCreature(first,'intruso|test')).toThrow(/E_SETUP_TEMPLATE/);
  expect(Object.isFrozen(first.templates)).toBe(true);
 });
 it('bloqueia criatura com apenas habilidade não convertida',()=>{
  const unsupported=crzSealCreature(synthetic({
   attacks:[{id:'breath',name:'Sopro sintético',kind:'area',
    save:{ability:'dex',dc:12,onSave:'half'},
    area:{shape:'cone',sizeFt:15},
    damage:[{dice:'2d6',mod:0,avg:7,type:'fire'}]}],
   multiattack:{origin:'fallback',steps:[]},
  }));
  expect(crzCreaturePlayable(unsupported)).toBe(false);
  const registry=crzBuildCatalog([unsupported]);
  expect(crzCatalogReport(registry).unsupported).toBe(1);
  expect(()=>crzGetCreature(registry,unsupported.id)).toThrow(/sem ataque/);
 });
 it('converte ficha, treino relativo, movimento, alcance, valor e rotinas uma vez',()=>{
  const unit=crzPrepareStack({ruleset:rules,catalog:catalog(),side:'attacker',
   setup:setup(),leaderModifiers:{attackBonus:1,initBonus:2,moraleAura:5}});
  expect(unit).toMatchObject({
   hpPerCreature:13,initialCount:12,alive:12,hpPool:156,topHp:13,
   acBase:14,atkMod:4,movementHex:3,rangeHex:3,
   initiative:11,stackValue:300,valuePerCreature:25,morale:15,
   training:'veteran',moraleState:'steady',
  });
  expect(unit.meleeRoutine).toMatchObject({
   origin:'fallback',steps:[{attackId:'blade',count:1}],
  });
  expect(unit.rangedRoutine).toMatchObject({
   origin:'fallback',steps:[{attackId:'bow',count:1}],
  });
  expect(unit.damageBonusBP).toBe(1000);
  expect(unit.warnings).toContain('Magias e ações extras não modeladas nesta ficha sintética.');
  expect(unit.activation).toEqual({
   moved:false,attacked:false,guard:false,waited:false,retaliationRound:null,
  });
  expect(unit.effects).toEqual([]);
  expect(unit.usage).toEqual({});
 });
 it('seleciona Multiattack coerente, sem somar ataque corpo a corpo a tiros',()=>{
  const template=crzSealCreature(synthetic({multiattack:{
   origin:'override',steps:[{attackId:'blade',count:2},{attackId:'bow',count:1}],
  }}));
  const out=crzPrepareStack({ruleset:rules,catalog:crzBuildCatalog([template]),
   setup:setup(),side:'attacker'});
  expect(out.meleeRoutine?.origin).toBe('fallback');
  expect(out.rangedRoutine?.origin).toBe('fallback');
  expect(out.warnings.some(w=>w.includes('Multiattack misto'))).toBe(true);
  const onlyMelee=crzSealCreature(synthetic({multiattack:{
   origin:'override',steps:[{attackId:'blade',count:2}],
  }}));
  const converted=crzPrepareStack({ruleset:rules,
   catalog:crzBuildCatalog([onlyMelee]),setup:setup(),side:'attacker'});
  expect(converted.meleeRoutine?.steps).toEqual([{attackId:'blade',count:2}]);
 });
 it('não interpreta traços mágicos desconhecidos silenciosamente',()=>{
  const creature=crzSealCreature(synthetic({
   traits:['pack-tactics'],conditionImmunities:['frightened'],
   flags:{flying:false,ranged:true,caster:true,legendary:true,swarm:false},
  }));
  const prepared=crzPrepareStack({ruleset:rules,
   catalog:crzBuildCatalog([creature]),setup:setup(),side:'attacker'});
  expect(prepared.warnings).toEqual(expect.arrayContaining([
   expect.stringContaining('pack-tactics'),
   expect.stringContaining('Magias da criatura'),
   expect.stringContaining('Ações lendárias'),
   expect.stringContaining('Imunidades de condição'),
  ]));
 });
 it('rejeita unidades oficiais não autorizadas e catálogo incorreto',()=>{
  const registry=catalog();
  expect(()=>crzPrepareStack({ruleset:rules,catalog:registry,
   setup:setup({source:{kind:'house-readonly',
    houseId:'evenhand',unitId:'unit-1',version:1}}),
   side:'attacker'})).toThrow(/E_SETUP_SOURCE/);
  expect(()=>crzPrepareStack({ruleset:rules,catalog:registry,
   setup:setup({source:{kind:'monster-library',
    catalogHash:'0'.repeat(64)}}),
   side:'attacker'})).toThrow(/E_SETUP_SOURCE/);
  const playable=crzPrepareStack({ruleset:rules,catalog:registry,
   setup:setup({source:{kind:'monster-library',
    catalogHash:registry.catalogHash}}),
   side:'attacker'});
  expect(playable.source.kind).toBe('monster-library');
 });
 it('valida teto por tamanho, duplicatas e limite de exército',()=>{
  const registry=catalog();
  expect(()=>crzPrepareStack({ruleset:rules,catalog:registry,
   setup:setup({count:1001}),side:'attacker'})).toThrow();
  expect(()=>crzPrepareArmy({ruleset:rules,catalog:registry,
   setup:{side:'attacker',name:'Teste',stacks:[
    setup({id:'a',position:{q:1,r:2}}),
    setup({id:'b',position:{q:1,r:2}}),
   ]}})).toThrow(/E_SETUP_DUP/);
  expect(()=>crzPrepareArmy({ruleset:rules,catalog:registry,
   setup:{side:'attacker',name:'Teste',stacks:[
    setup({id:'dup'}),setup({id:'dup'}),
   ]}})).toThrow(/E_SETUP_DUP/);
  const army=crzPrepareArmy({ruleset:rules,catalog:registry,
   setup:{side:'attacker',name:'Grupo sintético',
    stacks:[setup({id:'a'}),setup({id:'b'})]}});
  expect(army.totalValue).toBe(600);
  expect(army.warnings).toHaveLength(2);
 });
 it('mantém ajustes de terreno/range e regras oficiais intactos',()=>{
  expect([30,31,80,81,150,151,300,301].map(crzRangeHex))
   .toEqual([2,3,3,4,4,5,5,6]);
  const two=crzPrepareStack({ruleset:crzPreset('CRZ-WOTR'),
   catalog:catalog(),setup:setup({training:'trained',modifiers:{}}),
   side:'defender'});
  expect(two.morale).toBe(0);
  expect(two.atkMod).toBe(0);
  expect(two.stackValue).toBe(300);
  const oldRules=crzPreset('CRZ-5E');
  expect(oldRules.training.veteran.attack).toBe(1);
  expect(oldRules.training.trained.attack).toBe(0);
 });
});

import {describe,expect,it} from 'vitest';
import {createWarBattle,issueWarOrder,advanceWarRound,previewWarAttack} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {autoResolveWarBattle,chooseWarAiOrder} from '@/lib/battle/got/ai-commander';
import {makeWarFortification,WAR_FORT_PROFILES} from '@/lib/battle/got/fortifications';
import {buildAlliedWarForce,WAR_FORCE_MAX_UNITS} from '@/lib/battle/got/force-builder';
import {DEFAULT_WAR_BANNERS,bannerUnitNames,readUnitBanners} from '@/lib/battle/got/house-banner';
import {WAR_FIELD_SIZES,WAR_MAP_PRESETS,WAR_TERRAIN_CATALOG,autoDeployWarUnits,emptyWarMap,fortAt,
 fortFootprint,mapRuleSummary,paintWarTerrain,placeWarFort,removeWarFortAt,terrainRules,
 type WarMapDraft} from '@/lib/battle/got/map-builder';
import {WAR_TERRAIN,terrainEffect} from '@/lib/battle/got/terrain';
import type {WarBattle} from '@/lib/battle/got/types';

const rows=(draft:WarMapDraft)=>[
 {id:'attacker-1',side:'attacker' as const,position:{x:1,y:2},typeId:'infantry'},
 {id:'attacker-2',side:'attacker' as const,position:{x:1,y:4},typeId:'cavalry'},
 {id:'defender-1',side:'defender' as const,position:{x:draft.width-2,y:2},typeId:'infantry'},
 {id:'defender-2',side:'defender' as const,position:{x:draft.width-2,y:4},typeId:'archers'},
 {id:'defender-3',side:'defender' as const,position:{x:draft.width-2,y:0},typeId:'cavalry'},
 {id:'defender-4',side:'defender' as const,position:{x:draft.width-2,y:1},typeId:'archers'},
];
/** Batalha num mapa pronto, com as tropas já posicionadas pelo próprio mapa. */
function onMap(draft:WarMapDraft,seed='mapa'):WarBattle{
 const list=rows(draft),spots=autoDeployWarUnits(list,draft);
 return createWarBattle({id:'map-test',name:'Teste de mapa',seed,width:draft.width,height:draft.height,
  tiles:draft.tiles,strictLineOfSight:true,commanders:modelWarCommanders({attacker:4,defender:4}),
  fortifications:draft.forts.map(f=>makeWarFortification({id:f.id,name:WAR_FORT_PROFILES[f.kind].label,
   side:f.side,kind:f.kind,cells:f.cells,engineerBuilt:false,hoursBuilt:24})),
  units:list.map(r=>modelWarUnit({id:r.id,name:r.id,side:r.side,position:spots[r.id]!,
   typeId:r.typeId as 'infantry'}))});
}

describe('GOT · construtor de mapas',()=>{
 it('cataloga todos os terrenos da Tabela 10-3 e descreve os efeitos do motor',()=>{
  expect(WAR_TERRAIN_CATALOG.map(t=>t.id).sort()).toEqual(Object.keys(WAR_TERRAIN).sort());
  expect(terrainRules('plain')).toEqual(['Sem efeito']);
  expect(terrainRules('hill').join(' ')).toMatch(/−10 m.*\+1B/);
  expect(terrainRules('mountain').join(' ')).toMatch(/−20 m.*\+2B.*Sem cavalaria.*linha de tiro/);
  expect(terrainRules('dense-forest')).toContain('Defesa +5 ao Defender');
  expect(terrainRules('river')[0]).toMatch(/Intransponível/);
  expect(terrainRules('river',{bridge:true}).join(' ')).not.toMatch(/Intransponível/);
 });
 it('pinta terreno, ponte e estrada e volta a planície sem deixar resto',()=>{
  let draft=paintWarTerrain(emptyWarMap(12,7),'river',{x:5,y:3});
  expect(draft.tiles).toEqual([{x:5,y:3,terrain:'river'}]);
  draft=paintWarTerrain(draft,'river',{x:5,y:3},{bridge:true});
  expect(terrainEffect(draft.tiles[0]!).blocked).toBe(false);
  draft=paintWarTerrain(draft,'plain',{x:5,y:3});
  expect(draft.tiles).toEqual([]);
  expect(paintWarTerrain(draft,'hill',{x:99,y:0})).toBe(draft);
 });
 it('construções respeitam a capacidade do livro e cabem no mapa',()=>{
  for(const kind of Object.keys(WAR_FORT_PROFILES) as (keyof typeof WAR_FORT_PROFILES)[]){
   for(const at of [{x:0,y:0},{x:11,y:6},{x:6,y:3}]){
    const cells=fortFootprint(kind,at,{width:12,height:7});
    expect(cells.length).toBe(WAR_FORT_PROFILES[kind].capacity);
    expect(cells.every(c=>c.x>=0&&c.y>=0&&c.x<12&&c.y<7)).toBe(true);
   }
  }
  let draft=placeWarFort(paintWarTerrain(emptyWarMap(12,7),'wall',{x:9,y:3}),'castle','defender',{x:9,y:3});
  expect(draft.forts).toHaveLength(1);
  expect(draft.tiles).toEqual([]);
  expect(fortAt(draft,{x:9,y:2})?.kind).toBe('castle');
  draft=placeWarFort(draft,'tower','attacker',{x:9,y:3});
  expect(draft.forts.map(f=>f.kind)).toEqual(['tower']);
  expect(removeWarFortAt(draft,{x:9,y:3}).forts).toEqual([]);
 });
 it('todo cenário pronto gera uma batalha válida em todos os tamanhos',()=>{
  for(const size of WAR_FIELD_SIZES)for(const preset of WAR_MAP_PRESETS){
   const draft=preset.build(size.width,size.height);
   expect(draft.tiles.every(t=>t.x>=0&&t.y>=0&&t.x<size.width&&t.y<size.height)).toBe(true);
   expect(new Set(draft.tiles.map(t=>t.x+':'+t.y)).size).toBe(draft.tiles.length);
   const battle=onMap(draft,preset.id+size.id);
   expect(battle.units).toHaveLength(6);
   if(preset.id!=='open')expect(mapRuleSummary(draft).length).toBeGreaterThan(0);
  }
 });
 it('o mapa posiciona a guarnição: atiradores dentro da construção, ninguém sobre rio ou muralha',()=>{
  const castle=WAR_MAP_PRESETS.find(p=>p.id==='castle')!.build(12,7);
  const spots=autoDeployWarUnits(rows(castle),castle);
  const inFort=(id:string)=>Boolean(fortAt(castle,spots[id]!));
  expect(inFort('defender-2')&&inFort('defender-4')&&inFort('defender-1')).toBe(true);
  expect(inFort('defender-3')).toBe(false);
  expect(inFort('attacker-1')).toBe(false);
  expect(new Set(Object.values(spots).map(p=>p.x+':'+p.y)).size).toBe(6);
  let river=emptyWarMap(12,7);
  for(let y=0;y<7;y++)river=paintWarTerrain(river,'river',{x:1,y});
  const moved=autoDeployWarUnits(rows(river),river);
  expect(moved['attacker-1']!.x).not.toBe(1);
  expect(moved['attacker-1']!.x).toBeLessThan(6);
  // Posição escolhida à mão é respeitada quando é possível.
  expect(autoDeployWarUnits(rows(castle),castle,true)['defender-2']).toEqual({x:10,y:4});
  // Campos altos centralizam a linha inicial.
  expect(autoDeployWarUnits(rows(emptyWarMap(28,12)),emptyWarMap(28,12))['attacker-1']).toEqual({x:1,y:4});
 });
 it('a fortificação e o terreno alto entram no ataque sem ajuste manual',()=>{
  const open=onMap(emptyWarMap(12,7)),castle=onMap(WAR_MAP_PRESETS.find(p=>p.id==='castle')!.build(12,7));
  const archer=(b:WarBattle)=>b.units.find(u=>u.id==='defender-2')!;
  const near=(b:WarBattle)=>({...b,units:b.units.map(u=>u.id==='attacker-1'?
   {...u,position:{x:archer(b).position.x-1,y:archer(b).position.y}}:u)});
  const plain=previewWarAttack(near(open),'attacker-1','defender-2');
  const walled=previewWarAttack(near(castle),'attacker-1','defender-2');
  expect(walled.defense-plain.defense).toBe(WAR_FORT_PROFILES.castle.defense);
 });
});

describe('GOT · alcance de tiro pelo livro',()=>{
 it('longo alcance vale 200 m (20 quadrados) e a muralha bloqueia a linha de tiro',()=>{
  const wide=emptyWarMap(28,12);
  const base=onMap(wide);
  const place=(b:WarBattle,ax:number)=>({...b,units:b.units.map(u=>u.id==='attacker-1'?
   {...u,position:{x:ax,y:5}}:u.id==='defender-2'?{...u,position:{x:26,y:5}}:u)});
  expect(previewWarAttack(place(base,6),'defender-2','attacker-1',{ranged:true}).legal).toBe(true);
  expect(previewWarAttack(place(base,5),'defender-2','attacker-1',{ranged:true}).legal).toBe(false);
  const walled=onMap(paintWarTerrain(wide,'wall',{x:15,y:5}));
  expect(previewWarAttack(place(walled,10),'defender-2','attacker-1',{ranged:true}).reason)
   .toMatch(/Linha de visão/);
 });
});

describe('GOT · Casas aliadas',()=>{
 it('soma as tropas de cada Casa, respeita o limite do campo e usa o melhor comandante',()=>{
  const solo=buildAlliedWarForce([38]);
  expect(solo.units.every(u=>u.owner===0)).toBe(true);
  const allied=buildAlliedWarForce([38,20]);
  expect(allied.units.length).toBeGreaterThan(solo.units.length);
  expect(allied.units.filter(u=>u.owner===1).length).toBeGreaterThanOrEqual(2);
  expect(allied.units.map(u=>u.owner)).toEqual([...allied.units.map(u=>u.owner)].sort());
  const huge=buildAlliedWarForce([75,75,75]);
  expect(huge.units).toHaveLength(WAR_FORCE_MAX_UNITS);
  expect(new Set(huge.units.map(u=>u.owner)).size).toBe(3);
  expect(huge.warfare).toBe(5);
  expect(()=>buildAlliedWarForce([])).toThrow();
 });
 it('cada tropa aliada leva a bandeira e o nome da sua Casa',()=>{
  const ally={houseId:'alsevir',houseName:'Alsevir',crest:null,primary:'#5aa9e6',secondary:'#f2efe6',ink:'#ffffff'};
  const main={...DEFAULT_WAR_BANNERS.attacker,houseId:'phelles',houseName:'Phelles'};
  const names=bannerUnitNames([
   {id:'attacker-1',side:'attacker',typeLabel:'Infantaria'},
   {id:'attacker-2',side:'attacker',typeLabel:'Infantaria',banner:ally},
  ],{attacker:main,defender:DEFAULT_WAR_BANNERS.defender});
  expect(names).toEqual({'attacker-1':'Infantaria I de Phelles','attacker-2':'Infantaria I de Alsevir'});
  const battle={...onMap(emptyWarMap(12,7)),banners:{attacker:main,defender:DEFAULT_WAR_BANNERS.defender},
   unitBanners:{'attacker-2':ally,'defender-1':{primary:'vermelho'}}} as unknown as WarBattle;
  const read=readUnitBanners(battle);
  expect(read['attacker-1']!.houseName).toBe('Phelles');
  expect(read['attacker-2']!.houseName).toBe('Alsevir');
  expect(read['defender-1']).toEqual(DEFAULT_WAR_BANNERS.defender);
 });
});

describe('GOT · comando automático de guarnição',()=>{
 const castle=()=>onMap(WAR_MAP_PRESETS.find(p=>p.id==='castle')!.build(12,7),'guarnicao');
 it('quem defende a construção nunca sai dela; arqueiros atiram ou se protegem',()=>{
  let battle=castle();
  const start=new Map(battle.units.map(u=>[u.id,u.position]));
  const garrison=['defender-1','defender-2','defender-4'];
  let guard=0;
  while(battle.phase==='orders'&&battle.round<=6&&guard++<400){
   const decision=chooseWarAiOrder(battle,battle.turn);
   if(!decision){battle=advanceWarRound(battle);continue;}
   if(garrison.includes(decision.unitId))
    expect(['attack','defend','rally','reorganize','revive']).toContain(decision.order.kind);
   battle=issueWarOrder(battle,decision).battle;
   if(battle.phase==='orders'&&Object.values(battle.ordersRemaining).every(n=>n<1))battle=advanceWarRound(battle);
  }
  for(const id of garrison){
   const unit=battle.units.find(u=>u.id===id)!;
   if(unit.condition==='organized'||unit.condition==='disorganized')
    expect(unit.position).toEqual(start.get(id));
  }
 });
 it('a batalha de cerco se resolve sozinha e de forma reproduzível',()=>{
  const first=autoResolveWarBattle(castle(),60);
  expect(first.finished).toBe(true);
  expect(autoResolveWarBattle(castle(),60).battle.events).toEqual(first.battle.events);
 });
 it('sem construção o comando automático continua avançando',()=>{
  const open=onMap(emptyWarMap(12,7),'aberto');
  const decision=chooseWarAiOrder({...open,turn:'defender'},'defender')!;
  expect(decision).not.toBeNull();
  expect(autoResolveWarBattle(open).finished).toBe(true);
 });
});

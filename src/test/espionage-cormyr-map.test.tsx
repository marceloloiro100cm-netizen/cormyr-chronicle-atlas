import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';
import {REGIONS} from '@/lib/house/regions';
import {
 CORMYR_MAPPED_REGIONS,CORMYR_CARTOGRAPHIC_BORDERS,
 CORMYR_CARTOGRAPHIC_LAND_LINKS,CORMYR_NARRATOR_APPROVED_SEA_LINKS,
 CORMYR_DRAGONMERE_COASTAL_REGIONS,
 cormyrPreviewLinks,CORMYR_MAP_SOURCE,
} from '@/lib/espionage/cormyr-map';
import {planSpyRegionalMission,type SpyRegionalConnection} from '@/lib/espionage/region-turns';
import {CormyrInteractiveMap} from '@/components/house/espionage/cormyr-interactive-map';

const agent={id:'11111111-1111-4111-8111-111111111111',
 codename:'Agente',status:'available' as const,currentRegion:'dragoncoast'};
const travel=(from:string,to:string,extra:SpyRegionalConnection[]=[],seaAllowed=false)=>
 planSpyRegionalMission({agent:{...agent,currentRegion:from},destinationRegion:to,
  links:cormyrPreviewLinks(extra),seaAllowed});

describe('Mapa político narratorial · 11 regiões e deslocamento em désdias',()=>{
 it('digitaliza exatamente as onze regiões do catálogo, com áreas e pontos de seleção',()=>{
  expect(Object.keys(CORMYR_MAPPED_REGIONS).sort()).toEqual(Object.keys(REGIONS).sort());
  for(const item of Object.values(CORMYR_MAPPED_REGIONS)){
   expect(item.path.startsWith('M')).toBe(true);
   expect(item.path.includes('Z')).toBe(true);
   expect(item.centerX).toBeGreaterThan(0);
   expect(item.centerY).toBeGreaterThan(0);
  }
  expect(CORMYR_MAP_SOURCE).toContain('Narrador');
 });
 it('declara 19 fronteiras terrestres distintas, sem inventar atalhos marítimos',()=>{
  expect(CORMYR_CARTOGRAPHIC_BORDERS).toHaveLength(19);
  expect(CORMYR_CARTOGRAPHIC_LAND_LINKS).toHaveLength(19);
  expect(CORMYR_CARTOGRAPHIC_LAND_LINKS.every(x=>
   x.passage==='land_neighbor'&&x.bidirectional&&x.version===1)).toBe(true);
  const pairs=CORMYR_CARTOGRAPHIC_BORDERS.map(p=>p.slice().sort().join('/'));
  expect(new Set(pairs).size).toBe(19);
  for(const [a,b] of CORMYR_CARTOGRAPHIC_BORDERS){
   expect(REGIONS[a]).toBeTruthy();expect(REGIONS[b]).toBeTruthy();expect(a).not.toBe(b);
  }
 });
 it('todos os 121 pares ordenados são alcançáveis sem conexões por mar',()=>{
  for(const from of Object.keys(REGIONS))for(const to of Object.keys(REGIONS)){
   const s=travel(from,to);
   expect(s.status,`${from}->${to}`).toBe('ready');
   if(s.status==='ready'){
    expect(s.travelRounds).toBe(s.legs.length);
    expect(s.totalRounds).toBe(s.travelRounds+1);
    expect(s.totalRounds*10).toBe((s.travelRounds+1)*10);
   }
  }
 });
 it('Dragon Coast: Horselands=1, Ferlin=2, Swordmarch=2, Crownlands=3 deslocamentos',()=>{
  for(const [dest,count] of Object.entries({
   dragoncoast:0,horselands:1,ferlin:2,swordmark:2,crownlands:3,
   helmlands:3,shieldmark:4,volkumburgh:5,
  })){
   const result=travel('dragoncoast',dest);
   expect(result.status).toBe('ready');
   if(result.status==='ready')expect(result.travelRounds,dest).toBe(count);
  }
 });
 it('espia que saiu de Dragon Coast muda prazo conforme sua posição corrente',()=>{
  const fromHouse=travel('dragoncoast','volkumburgh');
  const moved=travel('elfhold','volkumburgh');
  expect(fromHouse.status).toBe('ready');
  expect(moved.status).toBe('ready');
  if(fromHouse.status==='ready'&&moved.status==='ready'){
   expect(fromHouse.travelRounds).toBe(5);
   expect(moved.travelRounds).toBe(1);
  }
 });
 it('Dragonmere homologado: qualquer par de regiões litorâneas = 1 désdia por mar',()=>{
  expect(CORMYR_NARRATOR_APPROVED_SEA_LINKS).toHaveLength(3);
  expect(CORMYR_DRAGONMERE_COASTAL_REGIONS).toEqual(['crownlands','shieldmark','dragoncoast']);
  expect(CORMYR_NARRATOR_APPROVED_SEA_LINKS[0]).toMatchObject({
   fromRegion:'dragoncoast',toRegion:'crownlands',
   passage:'sea_passage',bidirectional:true,version:1,
  });
  expect(cormyrPreviewLinks([])).toHaveLength(22);
  const coastal=CORMYR_DRAGONMERE_COASTAL_REGIONS;
  for(const from of coastal)for(const to of coastal){
   if(from===to)continue;
   const landOnly=travel(from,to,[],false);
   const withSea=travel(from,to,[],true);
   if(landOnly.status!=='ready'||withSea.status!=='ready')throw new Error('Map route missing');
   if(new Set([from,to]).has('dragoncoast'))
    expect(landOnly.travelRounds).toBeGreaterThan(1);
   expect(withSea.travelRounds).toBe(1);
   expect(withSea.totalRounds).toBe(2);
   expect(withSea.totalRounds*10).toBe(20);
   expect(withSea.legs[0]?.passage).toBe('sea_passage');
   if(from==='crownlands'&&to==='shieldmark')
    expect(landOnly.legs[0]?.passage).toBe('land_neighbor');
  }
 });
 it('o atalho de Dragonmere encurta também rotas a partir de Dragon Coast',()=>{
  for(const [dest,rounds] of Object.entries({
   crownlands:1,shieldmark:1,helmlands:2,elfhold:2,volkumburgh:2,
  })){
   const plan=travel('dragoncoast',dest,[],true);
   expect(plan.status).toBe('ready');
   if(plan.status==='ready')expect(plan.travelRounds,dest).toBe(rounds);
  }
 });
 it('não inventa outras passagens marítimas; novas ligações precisam de homologação',()=>{
  expect(cormyrPreviewLinks([]).filter(x=>x.passage==='sea_passage')).toHaveLength(3);
  const approved:SpyRegionalConnection={
   id:'33333333-3333-4333-8333-333333333333',fromRegion:'dragoncoast',
   toRegion:'volkumburgh',passage:'sea_passage',bidirectional:true,version:1,
  };
  const without=travel('dragoncoast','volkumburgh',[],true);
  const withAnotherApproved=travel('dragoncoast','volkumburgh',[approved],true);
  if(without.status==='ready'&&withAnotherApproved.status==='ready'){
   expect(without.travelRounds).toBe(2);
   expect(withAnotherApproved.travelRounds).toBe(1);
  }else throw new Error('Fixture route not found');
 });
});

afterEach(cleanup);
describe('Seleção acessível em mapa de Cormyr',()=>{
 it('clica uma região vetorial, seleciona destino e permite teclado',()=>{
  const onSelect=vi.fn();
  render(<CormyrInteractiveMap selectedRegion="" originRegion="dragoncoast"
   plan={null} onSelect={onSelect}/>);
  const elf=screen.getByRole('button',{name:/Elfhold; selecionar região/});
  fireEvent.click(elf);expect(onSelect).toHaveBeenCalledWith('elfhold');
  const ferlin=screen.getByRole('button',{name:/Ferlin; selecionar região/});
  fireEvent.keyDown(ferlin,{key:'Enter'});expect(onSelect).toHaveBeenCalledWith('ferlin');
  fireEvent.keyDown(ferlin,{key:' '});expect(onSelect).toHaveBeenCalledTimes(3);
 });
 it('oferece seleção alternativa no celular e região com aria-pressed',()=>{
  const onSelect=vi.fn();
  render(<CormyrInteractiveMap selectedRegion="crownlands" originRegion="helmlands"
   plan={null} onSelect={onSelect}/>);
  const item=screen.getByRole('button',{name:/Crownlands; selecionar região/});
  expect(item).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:'Volkumburgh'}));
  expect(onSelect).toHaveBeenCalledWith('volkumburgh');
 });
});

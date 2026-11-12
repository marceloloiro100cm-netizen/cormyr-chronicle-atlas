import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {readFileSync,statSync} from 'node:fs';
import {
 SPY_NOBLE_DETAIL_MAPS,nobleMapKey,spyHouseMapPoint,
} from '@/lib/espionage/spy-noble-detail-maps';
import {SpyLocalHouseMap} from '@/components/house/espionage/spy-local-house-map';

afterEach(cleanup);
describe('Cartografia detalhada no planejador de espionagem',()=>{
 it('preserva os seis mapas e as dimensões originais do Narrador',()=>{
  expect(Object.keys(SPY_NOBLE_DETAIL_MAPS).sort()).toEqual(
   ['crownlands','dragoncoast','elfhold','ferlin','helmlands','horselands','shieldmark','stonelands','swordmark','veilstone','volkumburgh']);
  for(const region of ['crownlands','helmlands','shieldmark']){
   expect(SPY_NOBLE_DETAIL_MAPS[region]).toMatchObject({
    width:1536,height:1024,src:'/maps/espionage/'+region+'.webp'});
  }
  expect(SPY_NOBLE_DETAIL_MAPS['dragoncoast']).toMatchObject({
   width:1709,height:920,src:'/maps/espionage/dragoncoast.webp'});
  expect(SPY_NOBLE_DETAIL_MAPS['horselands']).toMatchObject({
   width:1024,height:1536,src:'/maps/espionage/horselands.webp'});
  expect(SPY_NOBLE_DETAIL_MAPS['ferlin']).toMatchObject({
   width:1183,height:1329,src:'/maps/espionage/ferlin.webp'});
  expect(SPY_NOBLE_DETAIL_MAPS['stonelands']).toMatchObject({
   width:1536,height:1024,src:'/maps/espionage/stonelands.webp'});
  expect(SPY_NOBLE_DETAIL_MAPS['volkumburgh']).toMatchObject({
   width:1536,height:1024,src:'/maps/espionage/volkumburgh.webp'});
 });
 it('resolve Casas nomeadas e grafias equivalentes, sem inventar posições',()=>{
  expect(nobleMapKey('Grândragon')).toBe('grandragon');
  expect(spyHouseMapPoint('dragoncoast','Ashkar')).toEqual({x:749,y:597});
  expect(spyHouseMapPoint('dragoncoast','Qazir')).toEqual({x:1156,y:604});
  expect(spyHouseMapPoint('horselands','Harcourt')).toEqual({x:243,y:578});
  expect(spyHouseMapPoint('horselands','Hardcourt')).toEqual({x:243,y:578});
  expect(spyHouseMapPoint('volkumburgh','Casa sem nome na bandeira')).toBeNull();
  expect(spyHouseMapPoint('ferlin','Huntinghorn')).toEqual({x:583,y:872});
  expect(spyHouseMapPoint('stonelands','Rowanmantle')).toEqual({x:1109,y:161});
  expect(spyHouseMapPoint('crownlands','Von der Harten')).toEqual({x:166,y:518});
  expect(spyHouseMapPoint('helmlands','Evenhand')).toEqual({x:993,y:475});
  expect(spyHouseMapPoint('shieldmark','Mareforte')).toEqual({x:1179,y:846});
  expect(spyHouseMapPoint('helmlands','Marliir')).toBeNull();
  expect(spyHouseMapPoint('elfhold','Ashkar')).toBeNull();
 });
 it('exibe um mapa encaixado sem modal, carrossel nem controles de seta',()=>{
  const {container}=render(<SpyLocalHouseMap regionId="dragoncoast"
   originHouseId="ashkar" originHouseName="Ashkar"
   destinationHouseId="qazir" destinationHouseName="Qazir"
   plan={null} onSelectRegion={vi.fn()}/>);
  const img=screen.getByRole('img',{name:/Mapa detalhado de Costa do Dragão/});
  expect(img).toHaveAttribute('src','/maps/espionage/dragoncoast.webp');
  expect(container.querySelector('.spy-noble-local-route')).toBeTruthy();
  expect(container.querySelectorAll('.spy-noble-local-pin')).toHaveLength(2);
  expect(container.querySelector('.spy-noble-map-stage')).toBeTruthy();
  expect(container.querySelector('button')).toBeNull();
 });
 it('bolinhas semitransparentes são selecionáveis por clique e teclado',()=>{
  const onSelectHouse=vi.fn();
  const {container}=render(<SpyLocalHouseMap regionId="horselands"
   originHouseId="harcourt" originHouseName="Harcourt"
   destinationHouseId="erdenor" destinationHouseName="Erdenor"
   plan={null} onSelectRegion={vi.fn()} onSelectHouse={onSelectHouse}/>);
  const origin=screen.getByRole('button',{name:'Selecionar Casa de origem: Harcourt'});
  const target=screen.getByRole('button',{name:'Selecionar Casa-alvo: Erdenor'});
  expect(origin).toHaveAttribute('aria-pressed','false');
  expect(target).toHaveAttribute('aria-pressed','false');
  fireEvent.click(origin);
  expect(origin).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('status')).toHaveTextContent('Casa selecionada: Harcourt');
  expect(onSelectHouse).not.toHaveBeenCalled();
  fireEvent.keyDown(target,{key:'Enter'});
  expect(target).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('status')).toHaveTextContent('Casa selecionada: Erdenor');
  expect(onSelectHouse).toHaveBeenCalledTimes(1);
  expect(onSelectHouse).toHaveBeenCalledWith('erdenor');
  fireEvent.keyDown(origin,{key:' '});
  expect(origin).toHaveAttribute('aria-pressed','true');
  expect(onSelectHouse).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.spy-noble-local-route-outline')).toBeTruthy();
  expect(container.querySelector('.spy-noble-local-route')).not.toHaveAttribute('marker-end');
 });
 it('os mapas de Ferlin e Stonelands têm pontos válidos e proporções distintas',()=>{
  for(const [region,house,expectedWidth,expectedHeight,count] of ([
   ['ferlin','Huntinghorn',1183,1329,10],
   ['stonelands','Rowanmantle',1536,1024,8]
  ] as const)){
   const map=SPY_NOBLE_DETAIL_MAPS[region]!;
   const coords=Object.values(map.houses);
   expect(coords).toHaveLength(count);
   expect(new Set(coords.map(p=>p.x+','+p.y)).size).toBe(count);
   for(const {x,y} of coords){
    expect(x).toBeGreaterThan(0);expect(x).toBeLessThan(map.width);
    expect(y).toBeGreaterThan(0);expect(y).toBeLessThan(map.height);
   }
   const {container,unmount}=render(<SpyLocalHouseMap regionId={region}
    originHouseId={house.toLowerCase()} originHouseName={house}
    destinationHouseId={region==='ferlin'?'jabari':'misrim'}
    destinationHouseName={region==='ferlin'?'Jabari':'Misrim'}
    plan={null} onSelectRegion={vi.fn()}/>);
   expect(container.querySelector('img')).toHaveAttribute('src',map.src);
   expect(container.querySelector('svg.spy-noble-map-overlay'))
    .toHaveAttribute('viewBox',`0 0 ${expectedWidth} ${expectedHeight}`);
   expect(container.querySelectorAll('.spy-noble-local-pin')).toHaveLength(2);
   expect(container.querySelector('.spy-noble-local-route')).not.toBeNull();
   unmount();
  }
 });
 it('inclui os binários otimizados antes de liberar a publicação',()=>{
  for(const name of ['ferlin','stonelands']){
   const map=SPY_NOBLE_DETAIL_MAPS[name]!;
   const binary=statSync('public'+map.src);
   expect(binary.size).toBeGreaterThan(200_000);
  }
 });

 it('Swordmark e Veilstone usam mapas oficiais e marcadores das Casas nomeadas',()=>{
  for(const [region,origin,destination,count] of ([
   ['swordmark','Thundersword','Creth',11],
   ['veilstone','Ammaeth','Iverson',9]
  ] as const)){
   const map=SPY_NOBLE_DETAIL_MAPS[region]!;
   expect(map).toMatchObject({width:1536,height:1024,src:'/maps/espionage/'+region+'.png'});
   expect(Object.values(map.houses)).toHaveLength(count);
   expect(new Set(Object.values(map.houses).map(p=>p.x+','+p.y)).size).toBe(count);
   for(const {x,y} of Object.values(map.houses)){
    expect(x).toBeGreaterThan(0);expect(x).toBeLessThan(1536);
    expect(y).toBeGreaterThan(0);expect(y).toBeLessThan(1024);
   }
   expect(spyHouseMapPoint(region,origin)).not.toBeNull();
   expect(spyHouseMapPoint(region,destination)).not.toBeNull();
   expect(spyHouseMapPoint(region,'Casa desconhecida')).toBeNull();
   const {container,unmount}=render(<SpyLocalHouseMap regionId={region}
    originHouseId={origin.toLowerCase()} originHouseName={origin}
    destinationHouseId={destination.toLowerCase()} destinationHouseName={destination}
    plan={null} onSelectRegion={vi.fn()}/>);
   expect(container.querySelector('img')).toHaveAttribute('src',map.src);
   expect(container.querySelector('svg.spy-noble-map-overlay'))
    .toHaveAttribute('viewBox','0 0 1536 1024');
   expect(container.querySelectorAll('.spy-noble-local-pin')).toHaveLength(2);
   expect(container.querySelector('.spy-noble-local-route')).not.toBeNull();
   unmount();
  }
 });
 it('associa o mesmo arquivo de mapa nas visões do Reino e da Espionagem',()=>{
  const raw=readFileSync('public/cormyr/data.js','utf8');
  const catalog=JSON.parse(raw.replace(/^window\.CORMYR_DATA\s*=\s*/,'').replace(/;\s*$/,''));
  for(const region of ['swordmark','veilstone']){
   const kingdom=catalog.regions.find((r:{name:string})=>
    nobleMapKey(r.name)===region);
   expect(kingdom?.map?.src).toBe(SPY_NOBLE_DETAIL_MAPS[region]!.src);
   const p='public'+SPY_NOBLE_DETAIL_MAPS[region]!.src;
   const bytes=readFileSync(p);
   expect(bytes.length).toBeGreaterThan(200_000);
   expect([...bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  }
 });
 it('Elfhold exibe as 12 Casas e compartilha a imagem entre Reino e Espionagem',()=>{
  const map=SPY_NOBLE_DETAIL_MAPS['elfhold']!;
  expect(map).toMatchObject({
   src:'/maps/espionage/elfhold.jpg',width:1536,height:1024,
  });
  const names=[
   'Thalthallow','Drauthglas','Sauvrurn','Melliholli',
   'Lorelei','Tathcrown','Haldoneir','Arcantlet',
   'Vaylan','Dagohnlar','Ridinghound','Roaringhorn',
  ];
  expect(Object.keys(map.houses)).toHaveLength(12);
  for(const name of names){
   const point=spyHouseMapPoint('elfhold',name)!;
   expect(point).not.toBeNull();
   expect(point.x).toBeGreaterThan(0);
   expect(point.x).toBeLessThan(map.width);
   expect(point.y).toBeGreaterThan(0);
   expect(point.y).toBeLessThan(map.height);
  }
  expect(new Set(Object.values(map.houses).map(p=>p.x+','+p.y)).size).toBe(12);
  expect(spyHouseMapPoint('elfhold','Casa desconhecida')).toBeNull();
  const catalog=JSON.parse(readFileSync('public/cormyr/data.js','utf8')
   .replace(/^window\.CORMYR_DATA\s*=\s*/,'').replace(/;\s*$/,''));
  expect(catalog.regions.find((region:{name:string})=>region.name==='Elfhold')
   ?.map?.src).toBe(map.src);
  const bytes=readFileSync('public'+map.src);
  expect(bytes.length).toBeGreaterThan(200_000);
  expect([...bytes.subarray(0,3)]).toEqual([255,216,255]);
  const {container}=render(<SpyLocalHouseMap regionId="elfhold"
   originHouseId="vaylan" originHouseName="Vaylan"
   destinationHouseId="arcantlet" destinationHouseName="Arcantlet"
   plan={null} onSelectRegion={vi.fn()}/>);
  expect(container.querySelector('img')).toHaveAttribute('src',map.src);
  expect(container.querySelector('svg.spy-noble-map-overlay'))
   .toHaveAttribute('viewBox','0 0 1536 1024');
  expect(container.querySelectorAll('.spy-noble-local-pin')).toHaveLength(2);
  expect(container.querySelector('.spy-noble-local-route')).not.toBeNull();
 });
 it('usa linha fina, marfim e dourado, sem seta vermelha',()=>{
  const css=readFileSync('src/components/house/espionage/spy-local-house-map.css','utf8');
  const src=readFileSync('src/components/house/espionage/spy-local-house-map.tsx','utf8');
  expect(src).not.toContain('markerEnd');
  expect(src).not.toContain('arrowId');
  expect(css).toContain('stroke:#fff0c8');
  expect(css).toContain('stroke:#665033');
  expect(css).toContain('fill:rgba(255,249,226,.42)');
  expect(css).toContain('fill:rgba(218,183,103,.32)');
  expect(css).toContain('pointer-events:auto');
  expect(css).toContain('pointer-events:all');
 });
 it('mostra o mapa, mas não inventa uma linha quando a posição é desconhecida',()=>{
  const {container}=render(<SpyLocalHouseMap regionId="volkumburgh"
   originHouseId="major" originHouseName="Major"
   destinationHouseId="vassalo" destinationHouseName="Vassalo"
   plan={null} onSelectRegion={vi.fn()}/>);
  expect(screen.getByRole('note')).toHaveTextContent('não têm posição cartográfica');
  expect(container.querySelector('.spy-noble-local-route')).toBeNull();
  expect(screen.getByRole('img',{name:/Mapa detalhado de Volkumburgh/})).toBeTruthy();
 });

 it('mantém os dois pontos e a rota responsiva nas três regiões novas',()=>{
  for(const [region,origin,target] of ([
   ['crownlands','Phelles','Wyvernspur'],
   ['helmlands','Evenhand','Emmarask'],
   ['shieldmark','Mareforte','Dauntinghorn']
  ] as const)){
   const {container,unmount}=render(<SpyLocalHouseMap
    regionId={region} originHouseId={origin.toLowerCase()} originHouseName={origin}
    destinationHouseId={target.toLowerCase()} destinationHouseName={target}
    plan={null} onSelectRegion={vi.fn()}/>);
   const stage=container.querySelector<HTMLElement>('.spy-noble-map-stage');
   expect(stage).not.toBeNull();
   expect(stage!.style.aspectRatio).toBe('1536 / 1024');
   expect(stage!.style.maxWidth).toContain('vh');
   const image=container.querySelector('img');
   const overlay=container.querySelector('svg.spy-noble-map-overlay');
   expect(image).toHaveAttribute('src','/maps/espionage/'+region+'.webp');
   expect(overlay).toHaveAttribute('viewBox','0 0 1536 1024');
   expect(container.querySelectorAll('.spy-noble-local-pin')).toHaveLength(2);
   expect(container.querySelector('.spy-noble-local-route')).not.toBeNull();
   unmount();
  }
 });
 it('as casas cartográficas publicadas têm pontos dentro da imagem, sem duplicatas',()=>{
  const expected={crownlands:24,helmlands:25,shieldmark:30};
  for(const [key,count] of Object.entries(expected)){
   const map=SPY_NOBLE_DETAIL_MAPS[key]!;
   const points=Object.values(map.houses);
   expect(points).toHaveLength(count);
   const unique=new Set(points.map(p=>p.x+','+p.y));
   expect(unique.size).toBe(points.length);
   for(const p of points){expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(map.width);expect(p.y).toBeGreaterThan(0);expect(p.y).toBeLessThan(map.height);}
  }
 });
 it('se o arquivo ainda não estiver publicado, preserva o mapa geral',()=>{
  const onSelect=vi.fn();
  render(<SpyLocalHouseMap regionId="horselands"
   originHouseId="harcourt" originHouseName="Harcourt"
   destinationHouseId="erdenor" destinationHouseName="Erdenor"
   plan={null} onSelectRegion={onSelect}/>);
  fireEvent.error(screen.getByRole('img',{name:/Mapa detalhado de Horselands/}));
  expect(screen.getByRole('status')).toHaveTextContent('ainda não está publicado');
  expect(screen.getByRole('group',{name:/Mapa regional ilustrado/})).toBeTruthy();
 });
 it('não troca as rotas entre regiões e não altera cálculo de tempo',()=>{
  const panel=readFileSync('src/components/house/espionage/spy-regional-turns-panel.tsx','utf8');
  expect(panel).toContain('destination===originRegion');
  expect(panel).toContain('<SpyLocalHouseMap');
  expect(panel).toContain('<CormyrInteractiveMap');
  expect(panel).toContain('planSpyRegionalMission');
  expect(panel).toContain('projectSpyHarptosSchedule');
 });
});

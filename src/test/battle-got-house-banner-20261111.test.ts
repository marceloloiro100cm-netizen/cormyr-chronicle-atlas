import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createWarBattle} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {autoResolveWarBattle} from '@/lib/battle/got/ai-commander';
import {decodeGotLabSave,encodeGotLabSave} from '@/lib/battle/got/lab-save';
import {
 DEFAULT_WAR_BANNERS,bannerColorDistance,bannerUnitNames,contrastWarBanners,houseWarBanner,
 parseHouseColors,parsePublicWarHouseScript,parsePublicWarHouses,readWarBanners,safeCrestPath,
} from '@/lib/battle/got/house-banner';

const catalog=()=>parsePublicWarHouseScript(readFileSync('public/cormyr/data.js','utf8'));
const field=(seed='bandeiras')=>createWarBattle({
 id:'banner-test',name:'Teste de bandeiras',seed,width:12,height:7,
 commanders:modelWarCommanders({attacker:4,defender:3}),
 units:[
  modelWarUnit({id:'a1',name:'Lanceiros',side:'attacker',position:{x:1,y:2},typeId:'infantry'}),
  modelWarUnit({id:'a2',name:'Arqueiros',side:'attacker',position:{x:1,y:4},typeId:'archers'}),
  modelWarUnit({id:'a3',name:'Cavaleiros',side:'attacker',position:{x:1,y:6},typeId:'cavalry'}),
  modelWarUnit({id:'d1',name:'Guarda',side:'defender',position:{x:10,y:2},typeId:'infantry'}),
  modelWarUnit({id:'d2',name:'Batedores',side:'defender',position:{x:10,y:4},typeId:'scouts'}),
 ],
});

describe('GOT · cores das Casas',()=>{
 it('lê as cores do cadastro na ordem escrita, preferindo o nome composto',()=>{
  expect(parseHouseColors('Roxo & dourado')).toEqual(['#6a3d9a','#d4a82a']);
  expect(parseHouseColors('Azul celeste, branco, dourado')).toEqual(['#5aa9e6','#f2efe6','#d4a82a']);
  expect(parseHouseColors('Verde escuro e prata')).toEqual(['#1f5130','#c3c9d1']);
  expect(parseHouseColors('Azul-marinho / Âmbar')).toEqual(['#14274f','#d99a22']);
  expect(parseHouseColors('Ouro, dourado')).toEqual(['#d4a82a']);
  expect(parseHouseColors('—')).toEqual([]);
  expect(parseHouseColors(null)).toEqual([]);
 });
 it('aceita apenas brasões do acervo público do site',()=>{
  expect(safeCrestPath('assets/crownlands-phelles.webp')).toBe('/cormyr/assets/crownlands-phelles.webp');
  expect(safeCrestPath('/cormyr/assets/x.png')).toBe('/cormyr/assets/x.png');
  expect(safeCrestPath('https://exemplo.com/x.png')).toBeNull();
  expect(safeCrestPath('assets/../segredo.png')).toBeNull();
  expect(safeCrestPath('javascript:alert(1)')).toBeNull();
  expect(safeCrestPath(null)).toBeNull();
 });
});

describe('GOT · Casas do cadastro público',()=>{
 it('carrega as Casas com região, brasão seguro e porte pela hierarquia',()=>{
  const houses=catalog();
  expect(houses.length).toBeGreaterThan(150);
  expect(new Set(houses.map(h=>h.id)).size).toBe(houses.length);
  expect(houses.every(h=>h.name&&h.region&&(h.crest===null||h.crest.startsWith('/cormyr/assets/')))).toBe(true);
  const phelles=houses.find(h=>h.id==='phelles')!;
  expect(phelles.tier).toBe('major');
  expect(phelles.crest).toBe('/cormyr/assets/crownlands-phelles.webp');
  expect(houses.filter(h=>h.tier==='strong').length).toBeGreaterThanOrEqual(8);
  expect(houses.some(h=>h.tier==='minor')).toBe(true);
  // O cadastro público nunca traz recursos nem unidades.
  expect(Object.keys(phelles).sort()).toEqual(['colorsText','crest','id','name','region','symbol','tier']);
 });
 it('ignora dados malformados sem lançar erro',()=>{
  expect(parsePublicWarHouses(null)).toEqual([]);
  expect(parsePublicWarHouses({regions:[{name:'X',houses:[null,{name:''},{name:'Casa Um'}]}]}))
   .toHaveLength(1);
  expect(parsePublicWarHouseScript('window.CORMYR_DATA = {quebrado')).toEqual([]);
 });
 it('toda Casa recebe cores próprias e os dois lados nunca ficam iguais',()=>{
  const houses=catalog();
  for(const house of houses){
   const banner=houseWarBanner(house,'attacker');
   expect(banner.primary).toMatch(/^#[0-9a-f]{6}$/);
   expect(banner.secondary).toMatch(/^#[0-9a-f]{6}$/);
   expect(banner.houseName).toBe(house.name);
   const mirror=contrastWarBanners(banner,houseWarBanner(house,'defender'));
   expect(bannerColorDistance(mirror.attacker.primary,mirror.defender.primary)).toBeGreaterThanOrEqual(90);
  }
  expect(houseWarBanner(null,'defender')).toBe(DEFAULT_WAR_BANNERS.defender);
 });
});

describe('GOT · bandeiras gravadas na batalha',()=>{
 it('revalida cores e brasão de um salvamento local',()=>{
  expect(readWarBanners(null)).toEqual(DEFAULT_WAR_BANNERS);
  const dirty={banners:{
   attacker:{houseId:'x',houseName:'Casa X',crest:'https://fora.do.site/x.png',primary:'#112233',secondary:'#ddeeff',ink:'red'},
   defender:{houseId:'y',houseName:'Casa Y',crest:null,primary:'url(javascript:1)',secondary:'#000000',ink:'#fff'},
  }} as unknown as Parameters<typeof readWarBanners>[0];
  const clean=readWarBanners(dirty);
  expect(clean.attacker).toMatchObject({houseName:'Casa X',crest:null,primary:'#112233',secondary:'#ddeeff'});
  expect(clean.attacker.ink).toMatch(/^#[0-9a-f]{6}$/);
  expect(clean.defender).toEqual(DEFAULT_WAR_BANNERS.defender);
 });
 it('as bandeiras acompanham o salvamento e não mudam o resultado da batalha',()=>{
  const houses=catalog();
  const banners=contrastWarBanners(houseWarBanner(houses[0]!,'attacker'),houseWarBanner(houses[1]!,'defender'));
  const plain=field(),dressed={...field(),banners};
  expect(decodeGotLabSave(encodeGotLabSave(dressed)).banners).toEqual(banners);
  const a=autoResolveWarBattle(plain),b=autoResolveWarBattle(dressed);
  expect(b.battle.banners).toEqual(banners);
  expect(b.battle.winner).toBe(a.battle.winner);
  expect(b.battle.events).toEqual(a.battle.events);
 });
 it('nomeia tropas montadas pelo Poder com o tipo e a Casa',()=>{
  const houses=catalog();
  const banners=contrastWarBanners(houseWarBanner(houses.find(h=>h.id==='phelles')!,'attacker'),
   DEFAULT_WAR_BANNERS.defender);
  const names=bannerUnitNames([
   {id:'attacker-1',side:'attacker',typeLabel:'Infantaria'},
   {id:'attacker-2',side:'attacker',typeLabel:'Arqueiros'},
   {id:'attacker-3',side:'attacker',typeLabel:'Infantaria'},
   {id:'defender-1',side:'defender',typeLabel:'Infantaria'},
  ],banners);
  expect(names).toEqual({'attacker-1':'Infantaria I de Phelles','attacker-2':'Arqueiros I de Phelles',
   'attacker-3':'Infantaria II de Phelles','defender-1':'Infantaria I defensor'});
  expect(new Set(Object.values(names)).size).toBe(4);
 });
});

describe('GOT · resolver a batalha de uma vez',()=>{
 it('chega ao fim pelas mesmas regras e é reproduzível',()=>{
  for(const seed of ['auto-1','auto-2','auto-3','auto-4']){
   const first=autoResolveWarBattle(field(seed));
   expect(first.finished).toBe(true);
   expect(first.battle.phase).toBe('finished');
   expect(first.orders).toBeGreaterThan(0);
   expect(autoResolveWarBattle(field(seed)).battle).toEqual(first.battle);
  }
 });
 it('respeita o limite de rodadas e não mexe em batalha já encerrada',()=>{
  const short=autoResolveWarBattle(field('auto-limite'),1);
  expect(short.battle.round).toBeLessThanOrEqual(2);
  const done=autoResolveWarBattle(field('auto-1')).battle;
  const again=autoResolveWarBattle(done);
  expect(again.orders).toBe(0);
  expect(again.battle).toBe(done);
 });
});

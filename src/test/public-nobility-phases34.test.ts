import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {runInNewContext} from 'node:vm';

const publicFile=(path:string)=>readFileSync(resolve(process.cwd(),'public/cormyr',path),'utf8');
type House={nobleId:string;name:string;region:string;crest:string;portrait?:string;historyPath?:string;hierarchy?:{kind?:string;parent?:string|null};catalogClassification?:string};
type Navigator={
 TYPES:{value:string;label:string}[];
 kindOf:(h:House)=>string;
 matchesKind:(h:House,k:string)=>boolean;
 relations:(houses:House[],h:House)=>{parent:House|null;direct:House[];historical:House[];pending:House[]};
 outline:(body:{type:string;text:string}[])=>{entries:{index:number;id:string;title:string}[];show:boolean};
};
type Formatter={parseHistory:(source:string,house:House)=>{preface:string[];supplemental:{label:string;value:string}[];body:{type:string;text:string}[]}};
const houses=():House[]=>JSON.parse(publicFile('data.js').replace(/^window\.CORMYR_DATA\s*=\s*/,'').replace(/;\s*$/,'')).regions.flatMap((r:{houses:House[]})=>r.houses);
function helpers(){
 const context:{window:{CORMYR_NOBILITY_NAV?:Navigator;CORMYR_NOBILITY_FORMAT?:Formatter}}={window:{}};
 runInNewContext(publicFile('nobility-navigation.js'),context);
 runInNewContext(publicFile('nobility-format.js'),context);
 return {nav:context.window.CORMYR_NOBILITY_NAV!,format:context.window.CORMYR_NOBILITY_FORMAT!};
}
const byName=(all:House[],name:string)=>{const h=all.find(x=>x.name===name);if(!h)throw new Error('Casa não localizada: '+name);return h;};

describe('Nobreza — fase 3, navegação sem inferência política',()=>{
 it('oferece classificação política e preserva os filtros na URL',()=>{
  const {nav}=helpers(),all=houses(),app=publicFile('app.js'),html=publicFile('index.html');
  expect(nav.TYPES.map(x=>x.value)).toEqual(['','royal','major','vassal','historical','unconfirmed']);
  const counts=all.reduce((result,h)=>{const type=nav.kindOf(h);result[type]=(result[type]||0)+1;return result;},{} as Record<string,number>);
  expect(counts).toEqual({royal:1,vassal:141,major:10,historical:16,unconfirmed:4});
  expect(nav.matchesKind(byName(all,'Phelles'),'royal')).toBe(true);
  expect(nav.matchesKind(byName(all,'Obarskyr'),'unconfirmed')).toBe(true);
  expect(html).toContain('id="noble-kind"');
  expect(html).toContain('nobility-navigation.js?v=20261127p34');
  expect(app).toContain("kind:params.get('kind')||''");
  expect(app).toContain("state.noble.kind=e.target.value");
  expect(app).toContain("params.set(key,String(value))");
  expect(app).toContain('restoreNobleCatalogPosition');
  expect(app).toContain("history.replaceState({...history.state,[nobleCatalogReturnKey]");
  expect(app).toContain("window.addEventListener('popstate'");
 });
 it('resolve todos os vínculos explícitos do catálogo sem inventar Casas',()=>{
  const {nav}=helpers(),all=houses();
  expect(all).toHaveLength(172);
  expect(new Set(all.map(h=>h.nobleId)).size).toBe(all.length);
  expect(new Set(all.map(h=>h.name)).size).toBe(all.length);
  for(const house of all){
   const parentName=house.hierarchy?.parent;
   const relation=nav.relations(all,house);
   if(parentName)expect(relation.parent?.name,house.name+' -> '+parentName).toBe(parentName);
   const allChildren=[...relation.direct,...relation.historical,...relation.pending];
   for(const child of allChildren){
    expect(child.hierarchy?.parent,child.name+' -> '+house.name).toBe(house.name);
    expect(child.nobleId).not.toBe(house.nobleId);
   }
  }
 });
 it('diferencia vassalos documentados de vínculos históricos',()=>{
  const {nav}=helpers(),all=houses();
  const torchwinter=nav.relations(all,byName(all,'Torchwinter'));
  expect(torwinterNames(torchwinter.direct)).toEqual(['Barelder','Paertrover','Silversword']);
  expect(torchwinter.historical).toHaveLength(0);
  const marliir=nav.relations(all,byName(all,'Marliir'));
  expect(marliir.historical.length).toBe(10);
  expect(marliir.direct).toHaveLength(0);
  expect(nav.relations(all,byName(all,'Phelles')).direct.some(h=>h.name==='Huntinghorn')).toBe(true);
  const app=publicFile('app.js');
  expect(app).toContain('Casas sob suserania documentada');
  expect(app).toContain('Vínculos históricos registrados');
  expect(app).toContain('data-noble-related=');
  expect(app).toContain('Suserania (registro histórico)');
 });
 it('cria índice só a partir dos cabeçalhos existentes e oferece foco acessível',()=>{
  const {nav,format}=helpers(),all=houses(),h=byName(all,'Huntinghorn');
  const original=JSON.parse(publicFile(h.historyPath!)).text as string;
  const parsed=format.parseHistory(original,h);
  const toc=nav.outline(parsed.body);
  expect(toc.show).toBe(true);
  expect(toc.entries.length).toBeGreaterThan(6);
  expect(new Set(toc.entries.map(e=>e.id)).size).toBe(toc.entries.length);
  for(const entry of toc.entries){
   expect(entry.title).toBe(parsed.body[entry.index]?.text);
   expect(entry.id).toBe('noble-history-section-'+entry.index);
  }
  expect(nav.outline([{type:'paragraph',text:'Texto sem capítulo'}]).show).toBe(false);
  const app=publicFile('app.js');
  expect(app).toContain('Índice do histórico');
  expect(app).toContain('data-noble-section');
  expect(app).toContain('heading.focus({preventScroll:true})');
  expect(app).toContain("if(story)story.open=false");
 });
});
function torwinterNames(houses:House[]){return houses.map(h=>h.name).sort((a,b)=>a.localeCompare(b,'pt-BR'));}

describe('Nobreza — fase 4, integridade de todo o acervo público',()=>{
 it('mantém 172 bandeiras webp válidas, 98 retratos e 170 arquivos históricos acessíveis',()=>{
  const all=houses();
  expect(all).toHaveLength(172);
  expect(all.filter(h=>h.portrait)).toHaveLength(98);
  expect(all.filter(h=>h.historyPath)).toHaveLength(170);
  for(const h of all){
   expect(h.crest,h.name).toBeTruthy();
   const crest=resolve(process.cwd(),'public/cormyr',h.crest);
   expect(existsSync(crest),h.name+' sem brasão: '+h.crest).toBe(true);
   if(extname(crest)==='.webp')expect(readFileSync(crest).toString('ascii',0,4),h.name).toBe('RIFF');
   if(h.portrait)expect(existsSync(resolve(process.cwd(),'public/cormyr',h.portrait)),h.name+' sem retrato').toBe(true);
   if(h.historyPath)expect(existsSync(resolve(process.cwd(),'public/cormyr',h.historyPath)),h.name+' sem história').toBe(true);
  }
 });
 it('lê e estrutura os 170 históricos sem alterar seu conteúdo de origem',()=>{
  const {format,nav}=helpers();
  for(const h of houses().filter(h=>h.historyPath)){
   const original=JSON.parse(publicFile(h.historyPath!));
   expect(typeof original.text,h.name+' arquivo inválido').toBe('string');
   expect(original.text.trim().length,h.name+' histórico vazio').toBeGreaterThan(0);
   const parsed=format.parseHistory(original.text,h);
   expect(parsed.body.length+parsed.preface.length+parsed.supplemental.length,h.name+' histórico descartado').toBeGreaterThan(0);
   const chapterIndex=nav.outline(parsed.body);
   expect(chapterIndex.entries.every(e=>parsed.body[e.index]?.type==='heading'),h.name).toBe(true);
  }
 });
 it('carrega os recursos e preserva layout de desktop e celular',()=>{
  const html=publicFile('index.html'),css=publicFile('nobility-layout.css'),loader=publicFile('gm-loader.js');
  expect(html.indexOf('nobility-navigation.js')).toBeLessThan(html.indexOf('gm-loader.js'));
  expect(html).toContain('nobility-layout.css?v=20261127p34');
  expect(html).toContain('app.js?v=20261127nav');
  expect(loader).toContain("s.src='app.js?v=20261127nav'");
  for(const path of ['app.js','nobility-format.js','nobility-navigation.js']){
   expect(()=>new Function(publicFile(path)),path).not.toThrow();
  }
  for(const breakpoint of ['@media(max-width:1100px)','@media(max-width:980px)','@media(max-width:767px)','@media(max-width:700px)','@media(max-width:480px)']){
   expect(css,breakpoint).toContain(breakpoint);
  }
  expect(css).toContain('.noble-relationship-list');
  expect(css).toContain('.noble-history-toc');
  expect(css).toContain('object-fit:contain');
  expect(css).toContain(':focus-visible');
 });
});

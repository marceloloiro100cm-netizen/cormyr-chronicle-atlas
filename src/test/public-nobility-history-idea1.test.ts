import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
// jsdom já está instalado no projeto, mas @types/jsdom não integra o lockfile.
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {
 JSDOM:new (html:string,options?:{url?:string})=>{window:Window & typeof globalThis};
};

const publicFile=(path:string)=>readFileSync(resolve(process.cwd(),'public/cormyr',path),'utf8');
type StoryItem={type:'paragraph'|'heading'|'separator';text:string};
type House={name:string;nobleId:string;historyPath?:string;publicNarrative?:string};
type Parsed={preface:string[];supplemental:{label:string;value:string}[];body:StoryItem[]};
type Format={
 parseHistory:(source:string,house:House)=>Parsed;
 metadataVisible:(s:string)=>boolean;
 historyDisplayModel:(parsed:Parsed)=>{
  metadata:{label:string;value:string}[];entries:{index:number;title:string;level:1|2;number:string|null;id:string}[];
  hasText:boolean;showToc:boolean;longToc:boolean;body:StoryItem[];
 };
};
const houses=():House[]=>JSON.parse(publicFile('data.js').replace(/^window\.CORMYR_DATA\s*=\s*/,'').replace(/;\s*$/,''))
 .regions.flatMap((region:{houses:House[]})=>region.houses);
const named=(name:string)=>{const found=houses().find(h=>h.nobleId===name);if(!found)throw new Error('Casa não cadastrada: '+name);return found;};
const fmt=():Format=>{
 const ctx:{window:{CORMYR_NOBILITY_FORMAT?:Format}}={window:{}};
 runInNewContext(publicFile('nobility-format.js'),ctx);
 return ctx.window.CORMYR_NOBILITY_FORMAT!;
};
const parsed=(h:House)=>fmt().parseHistory(JSON.parse(publicFile(h.historyPath!)).text as string,h);

function preview(){
 const dom=new JSDOM('<!doctype html><html><body><section id="noble-history"></section></body></html>',{url:'https://atlas.cormyr.com.br/cormyr/index.html#nobreza'});
 const app=publicFile('app.js');
 const start=app.indexOf('async function loadHouseHistory(h){');
 const stop=app.indexOf("\n for(const key of ['region','name','leader','castle','city'])",start);
 if(start<0||stop<0)throw new Error('O renderizador de históricos não foi encontrado');
 const source=app.slice(start,stop);
 const win=dom.window as typeof dom.window & {CORMYR_NOBILITY_FORMAT?:Format};
 win.CORMYR_NOBILITY_FORMAT=fmt();
 const fakeFetch=async (path:string)=>({ok:true,json:async()=>JSON.parse(publicFile(path))});
 const prelude=[
  "const historyCache=new Map();let historyRequest=0;let nobleHistoryHeadingObserver=null;",
  "const $=id=>document.getElementById(id);",
  "const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\\"/g,'&quot;').replace(/'/g,'&#39;');",
  "const normalize=value=>String(value??'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();",
 ].join('\n');
 const render=new Function('document','window','fetch','IntersectionObserver',prelude+'\n'+source+'\nreturn loadHouseHistory;')(
  win.document,win,fakeFetch,undefined
 ) as (h:House)=>Promise<void>;
 return {dom,render,target:win.document.getElementById('noble-history')!};
}

describe('História e registro da casa — Ideia 1 Adaptativa',()=>{
 it('não exibe metadados negativos nem caixas vazias',()=>{
  const format=fmt(),aldmore=named('aldmore'),model=format.historyDisplayModel(parsed(aldmore));
  expect(model.metadata.map(x=>x.label)).toContain('Idade');
  expect(model.metadata.some(x=>x.label==='Vassalos')).toBe(false);
  for(const value of ['Sem Vassalos','Sem vassalos.','Sem cidade','Não definido no acervo','-','N/A','','  ','Não informado']){
   expect(format.metadataVisible(value),value).toBe(false);
  }
  expect(format.metadataVisible('Idade desconhecida')).toBe(true);
 });
 it('reconhece de 2 a 10 capítulos de Aldmore, com barra e sumário aberto',async()=>{
  const h=named('aldmore'),model=fmt().historyDisplayModel(parsed(h));
  expect(model.entries).toHaveLength(7);
  expect(model.showToc).toBe(true);
  expect(model.longToc).toBe(false);
  const {render,target}=preview();await render(h);
  expect(target.querySelectorAll('.noble-history-meta-field').length).toBeGreaterThan(0);
  expect(target.querySelector('.noble-history-meta')?.textContent).not.toMatch(/Sem Vassalos/i);
  expect(target.querySelectorAll('.noble-history-toc-link')).toHaveLength(7);
  expect(target.querySelector('.noble-history-grid.no-toc')).toBeNull();
  expect(target.querySelector('.noble-history-search')).toBeNull();
  expect(target.querySelector('.noble-history-narrative')?.textContent).toContain('A Casa Aldmore nasceu');
 });
 it('ativa rolagem independente e busca de capítulos em Huntinghorn',async()=>{
  const h=named('huntinghorn'),model=fmt().historyDisplayModel(parsed(h));
  expect(model.entries.length).toBeGreaterThan(10);
  expect(model.longToc).toBe(true);
  const {render,target,dom}=preview();await render(h);
  const sidebar=target.querySelector('.noble-history-sidebar.is-long');
  expect(sidebar).not.toBeNull();
  const search=sidebar!.querySelector('input[type="search"]') as HTMLInputElement;
  expect(search).not.toBeNull();
  const buttons=[...sidebar!.querySelectorAll<HTMLButtonElement>('[data-noble-section]')];
  expect(buttons).toHaveLength(model.entries.length);
  search.value='As Marcas';
  search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  expect(buttons.filter(b=>!b.hidden).length).toBeGreaterThan(0);
  expect(buttons.filter(b=>b.hidden).length).toBeGreaterThan(0);
  search.value='9999 capítulos inexistentes';
  search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  expect(buttons.every(b=>b.hidden)).toBe(true);
  expect((sidebar!.querySelector('.noble-history-no-matches') as HTMLElement).hidden).toBe(false);
  const heading=target.querySelector<HTMLElement>('[data-noble-heading]')!;
  heading.scrollIntoView=vi.fn();
  search.value='';search.dispatchEvent(new dom.window.Event('input'));
  const first=buttons[0];first.click();
  expect(heading.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({block:'start'}));
  expect(first.getAttribute('aria-current')).toBe('location');
 });
 it('texto corrido de Montgomery não tem TOC e permanece em uma coluna',async()=>{
  const h=named('montgomery'),model=fmt().historyDisplayModel(parsed(h));
  expect(model.entries).toHaveLength(0);
  expect(model.showToc).toBe(false);
  const {render,target}=preview();await render(h);
  expect(target.querySelector('.noble-history-grid.no-toc')).not.toBeNull();
  expect(target.querySelector('.noble-history-sidebar')).toBeNull();
  expect(target.querySelector('.noble-history-narrative')?.textContent).toContain('Casa Montgomery');
 });
 it('Obarskyr, sem história publicada, mostra apenas aviso editorial sem faixas nem TOC',async()=>{
  const h=named('obarskyr');expect(h.historyPath).toBeUndefined();
  const {render,target}=preview();await render(h);
  expect(target.querySelector('.noble-history-empty')?.textContent).toContain('ainda não está disponível');
  expect(target.querySelector('.noble-history-meta')).toBeNull();
  expect(target.querySelector('.noble-history-sidebar')).toBeNull();
  expect(target.querySelector('.noble-history-grid')).toBeNull();
 });
 it('preserva todas as linhas e suas posições em cada um dos históricos publicados',()=>{
  const format=fmt();
  let histories=0;
  for(const h of houses()){
   if(!h.historyPath)continue;histories++;
   const story=parsed(h),model=format.historyDisplayModel(story);
   expect(model.body).toEqual(story.body);
   expect(model.entries.every(e=>story.body[e.index]?.type==='heading'),h.name).toBe(true);
   expect(model.metadata.every(field=>format.metadataVisible(field.value)),h.name).toBe(true);
   expect(model.showToc).toBe(model.entries.length>=2&&model.hasText);
   expect(model.longToc).toBe(model.entries.length>10);
  }
  expect(histories).toBe(170);
  expect(houses()).toHaveLength(172);
 });
 it('trata capítulos romanos como H3 e seus subtítulos como H4 sem introduzir H1',async()=>{
  const h=named('phelles'),model=fmt().historyDisplayModel(parsed(h));
  expect(model.entries.length).toBeGreaterThan(10);
  expect(model.entries.some(e=>e.level===2)).toBe(true);
  const {render,target}=preview();await render(h);
  expect(target.querySelector('h1')).toBeNull();
  expect(target.querySelectorAll('.noble-history-narrative h3').length).toBeGreaterThan(0);
  expect(target.querySelectorAll('.noble-history-narrative h4').length).toBeGreaterThan(0);
  expect(target.querySelector('.noble-history-toc-link.is-subsection')).not.toBeNull();
 });
 it('mantém o acordeão externo aberto em todos os perfis sem alterar menu ou ficha superior',()=>{
  const html=publicFile('index.html'),app=publicFile('app.js');
  expect(html).toContain('<details class="panel noble-story" open>');
  expect(app).toContain("const story=$('noble-detail').querySelector('.noble-story');if(story)story.open=true");
  expect(html).toContain('id="house-details"');
  expect(html).toContain('id="noble-media"');
  expect(html).toContain('id="noble-catalog"');
  expect(app).toContain("musicLinks(h.music,'Música da casa')");
 });
 it('possui regras CSS desktop e mobile sem seletores fora de .noble-story no patch específico',()=>{
  const css=publicFile('nobility-layout.css');
  const scoped=css.slice(css.indexOf('/* História e registro da casa · Ideia 1 Adaptativa.'));
  expect(scoped).toContain('grid-template-columns:245px minmax(0,1fr)');
  expect(scoped).toContain('position:sticky;top:72px');
  expect(scoped).toContain('max-height:calc(100vh - 110px);overflow-y:auto');
  expect(scoped).toContain('repeat(auto-fit,minmax(170px,1fr))');
  expect(scoped).toContain('@media(max-width:860px)');
  expect(scoped).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  expect(scoped).toContain('@media(max-width:520px)');
  expect(scoped).toContain('grid-template-columns:minmax(0,1fr)');
  expect(scoped).toContain('max-width:72ch');
  expect(scoped).toContain('.noble-story');
 });
});

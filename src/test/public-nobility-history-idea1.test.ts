import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';

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
 const prelude=String.raw
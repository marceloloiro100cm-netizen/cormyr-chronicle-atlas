import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readTemporalStack,auditTemporalStack,fetchTemporalStackLive,
 runTemporalStackAudit} from './temporal-stack-audit.mjs';

const manifest=()=>structuredClone(readTemporalStack());
const liveFor=m=>new Map(m.sequence.map((row,i)=>[row.pr,{
 head:row.head,base:row.base,state:'open',merged:false,mergeable:true,
}]));

describe('Lote 13 · ordem da pilha GitHub e alternativa #129',()=>{
 it('reconhece cadeia atual sem afirmar que foi integrada',()=>{
  const m=manifest(),out=auditTemporalStack(m);
  assert.equal(out.chain_consistent,true);
  assert.equal(out.live_verified,false);
  assert.equal(out.all_merged,false);
  assert.equal(out.release_authorized,false);
  assert.ok(m.sequence.length>=11);
  assert.equal(m.sequence[0].pr,127);
  assert.equal(m.sequence.at(-1).pr,149);
  assert.ok(m.excluded_alternative_prs.includes(129));
 });
 it('bloqueia ordem quebrada, duplicidade ou inclusão da PR concorrente',()=>{
  const m=manifest();
  m.sequence[3].base='main';
  assert.equal(auditTemporalStack(m).chain_consistent,false);
  const d=manifest();d.sequence[2].pr=d.sequence[1].pr;
  assert.equal(auditTemporalStack(d).chain_consistent,false);
  const other=manifest();other.excluded_alternative_prs=[];
  assert.equal(auditTemporalStack(other).chain_consistent,false);
 });
 it('usa GET e não utiliza autorização para mutação',async()=>{
  const m=manifest(),urls=[];
  const fetcher=async (url,options)=>{
   urls.push({url,options});
   const n=Number(url.split('/').at(-1));
   const row=m.sequence.find(x=>x.pr===n);
   return {ok:true,json:async()=>({head:{ref:row.head},
    base:{ref:row.base},state:'open',merged:false,merged_at:null,mergeable:true})};
  };
  const list=await fetchTemporalStackLive(m,fetcher,'opaque-token');
  assert.equal(list.size,m.sequence.length);
  assert.equal(auditTemporalStack(m,list).chain_consistent,true);
  assert.equal(auditTemporalStack(m,list).all_merged,false);
  assert.ok(urls.every(v=>v.options.method===undefined));
  assert.ok(urls.every(v=>v.url.startsWith('https://api.github.com/repos/')));
  assert.ok(urls.every(v=>v.options.headers.Authorization==='Bearer opaque-token'));
 });
 it('falha ao notar PR fechada, base alterada ou falta de evidência',()=>{
  const m=manifest(),list=liveFor(m);
  list.get(136).base='main';
  assert.equal(auditTemporalStack(m,list).chain_consistent,false);
  list.get(136).base=m.sequence.find(x=>x.pr===136).base;
  list.get(136).state='closed';
  assert.equal(auditTemporalStack(m,list).chain_consistent,false);
  list.delete(136);
  assert.equal(auditTemporalStack(m,list).live_verified,false);
 });
 it('o gate exige todas mescladas, mas continua sem autorizar produção',async()=>{
  const m=manifest();
  const open=async (url)=>{
   const n=Number(url.split('/').at(-1));
   const row=m.sequence.find(x=>x.pr===n);
   return {ok:true,json:async()=>({head:{ref:row.head},
    base:{ref:row.base},state:'open',merged_at:null,mergeable:true})};
  };
  const result=await runTemporalStackAudit(['--gate'],open);
  assert.equal(result.exitCode,2);
  const complete=async (url)=>{
   const n=Number(url.split('/').at(-1));
   const row=m.sequence.find(x=>x.pr===n);
   return {ok:true,json:async()=>({head:{ref:row.head},
    base:{ref:row.base},state:'closed',merged_at:'2026-10-31T00:00:00Z',mergeable:null})};
  };
  const clean=await runTemporalStackAudit(['--gate'],complete);
  assert.equal(clean.exitCode,0);
  assert.equal(clean.report.release_authorized,false);
 });
});

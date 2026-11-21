import {describe,expect,it} from 'vitest';
import {readAllPaged} from './paged-read';

const docs=(n:number)=>Array.from({length:n},(_,i)=>({id:'d'+String(i).padStart(6,'0')}));
function ordered(all:{id:string}[]){
 const reads:[number,number][]=[];
 const page=(start:number,size:number):any=>({
  limit:(n:number)=>page(start,n),
  startAfter:(d:{id:string})=>page(all.indexOf(d)+1,size),
  get:async()=>{reads.push([start,size]);return {docs:all.slice(start,start+size)};},
 });
 return {reads,query:{limit:(n:number)=>page(0,n),
  orderBy:(field:string)=>{expect(field).toBe('__name__');return page(0,Number.POSITIVE_INFINITY);}}};
}

describe('readAllPaged',()=>{
 it('lê a coleção inteira em páginas, além do antigo teto de 500',async()=>{
  const f=ordered(docs(1200));
  const r=await readAllPaged(f.query,10_000);
  expect(r.overLimit).toBe(false);
  expect(r.docs).toHaveLength(1200);
  expect(new Set(r.docs.map(d=>(d as {id:string}).id)).size).toBe(1200);
  expect(f.reads).toEqual([[0,500],[500,500],[1000,500]]);
 });
 it('aceita exatamente o teto e falha fechado acima dele, sem conjunto parcial',async()=>{
  expect((await readAllPaged(ordered(docs(1000)).query,1000)).docs).toHaveLength(1000);
  expect(await readAllPaged(ordered(docs(1001)).query,1000)).toEqual({docs:[],overLimit:true});
 });
 it('mantém o contrato de leitura única para consultas sem ordenação',async()=>{
  const legacy={limit:(n:number)=>({get:async()=>({docs:docs(3).slice(0,n)})})};
  expect((await readAllPaged(legacy,3)).docs).toHaveLength(3);
  expect(await readAllPaged({limit:()=>({get:async()=>({docs:docs(3)})})},2))
   .toEqual({docs:[],overLimit:true});
  expect(await readAllPaged({limit:()=>({get:async()=>({})})},2))
   .toEqual({docs:[],overLimit:true});
 });
 it('recusa tetos inválidos',async()=>{
  await expect(readAllPaged(ordered([]).query,0)).rejects.toThrow('invalid_paged_read');
 });
});

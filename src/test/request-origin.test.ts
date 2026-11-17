import {describe,expect,it} from 'vitest';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {allowedRequestOrigins,crossOriginRejected} from '@/lib/server/request-origin';

const req=(url:string,headers:Record<string,string>)=>new Request(url,{method:'POST',headers});

describe('checagem de origem atrás do App Hosting',()=>{
 it('aceita o domínio público quando o servidor vê um endereço interno',()=>{
  const r=req('http://127.0.0.1:8080/api/firebase-cloud-read',
   {origin:'https://atlas.cormyr.com.br','sec-fetch-site':'same-origin'});
  expect(crossOriginRejected(r,{})).toBe(false);
 });
 it('aceita host e esquema encaminhados pelo proxy',()=>{
  const r=req('http://interno/api/firebase-cloud-read',
   {origin:'https://outro.exemplo.dev','x-forwarded-host':'outro.exemplo.dev','x-forwarded-proto':'https'});
  expect(crossOriginRejected(r,{})).toBe(false);
 });
 it('mantém a origem de request.url (desenvolvimento local)',()=>{
  const r=req('http://localhost:3000/api/x',{origin:'http://localhost:3000'});
  expect(crossOriginRejected(r,{})).toBe(false);
 });
 it('recusa outro site e sec-fetch-site cross-site',()=>{
  expect(crossOriginRejected(req('http://127.0.0.1/api/x',{origin:'https://evil.example'}),{})).toBe(true);
  expect(crossOriginRejected(req('https://atlas.cormyr.com.br/api/x',
   {origin:'https://atlas.cormyr.com.br','sec-fetch-site':'cross-site'}),{})).toBe(true);
 });
 it('aceita origens extras só em https e ignora valores inválidos',()=>{
  const r=req('http://127.0.0.1/api/x',{});
  const set=allowedRequestOrigins(r,{CORMYR_PUBLIC_ORIGINS:'https://novo.cormyr.com.br, http://inseguro.dev, lixo'});
  expect(set.has('https://novo.cormyr.com.br')).toBe(true);
  expect(set.has('http://inseguro.dev')).toBe(false);
 });
 it('sem cabeçalho Origin não bloqueia (chamadas servidor a servidor)',()=>{
  expect(crossOriginRejected(req('http://127.0.0.1/api/x',{}),{})).toBe(false);
 });
 it('nenhuma rota de API compara Origin direto com request.url',()=>{
  const walk=(dir:string):string[]=>readdirSync(dir).flatMap(n=>{
   const p=join(dir,n);return statSync(p).isDirectory()?walk(p):[p];});
  for(const file of walk('src/routes/api').filter(f=>f.endsWith('.ts'))){
   expect(readFileSync(file,'utf8')).not.toMatch(/get\('origin'\)!==(?:u|url)\.origin/);
  }
 });
});

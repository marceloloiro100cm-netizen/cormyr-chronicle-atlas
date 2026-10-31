#!/usr/bin/env node
/* Lote 6: catálogo público é fonte candidata, jamais autoridade de identidade.
 * Gera manifest local SEM publicar nem escrever no Supabase.
 * Uso: node scripts/generate-character-candidates.mjs [caminho-saida.json]
 */
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const atlas=join(root,'public','cormyr');

export function extractHeaderCandidate(text){
 const heading=String(text??'').slice(0,1700).replace(/^\uFEFF/,'');
 const proposedName=heading.match(/(?:^|\n)\s*Nome:\s*([^\r\n]+)/i)?.[1]?.trim()??'';
 const birthText=heading.match(/(?:Nascimento|Nasc\.)\s*:?\s*(\d{3,4})\s*CV/i)?.[1]??null;
 const ageText=heading.match(/(?:^|\n)\s*Idade:\s*(\d{1,4})\s*(?:anos?)?/i)?.[1]??null;
 const claimed_birth_year=birthText?Number(birthText):null;
 const claimed_age=ageText?Number(ageText):null;
 const valid=(n)=>Number.isInteger(n)&&n>=0&&n<=9999;
 return {
  proposed_name:proposedName,
  claimed_birth_year:valid(claimed_birth_year)&&claimed_birth_year>0?claimed_birth_year:null,
  claimed_age:valid(claimed_age)?claimed_age:null,
 };
}
export function gatherCharacterCandidates(dir=atlas){
 const content=readFileSync(join(dir,'data.js'),'utf8');
 const prefix='window.CORMYR_DATA =';
 if(!content.trimStart().startsWith(prefix))throw Error('Formato do catálogo público não reconhecido');
 const json=content.trim().slice(content.trimStart().indexOf(prefix)+prefix.length).trim().replace(/;\s*$/,'');
 const data=JSON.parse(json);
 const candidates=[];
 const seen=new Set();
 function append(record){
  if(!record.proposed_name||record.proposed_name.length>180)return;
  const k=record.source_kind+':'+record.source_key;
  if(seen.has(k))throw Error('Chave de fonte duplicada: '+k);
  seen.add(k);candidates.push(record);
 }
 for(const region of data.regions??[]){
  for(const house of region.houses??[]){
   const name=String(house.leader??'').trim();
   if(!name||!house.nobleId)continue;
   append({source_kind:'house_catalog',source_key:String(house.nobleId),
    proposed_name:name,house_id:null,claimed_birth_year:null,claimed_age:null,claimed_age_year:null,
    evidence:{source:'public/cormyr/data.js',region:String(region.name??''),
     house:String(house.name??''),field:'leader',archive_house_id:String(house.nobleId)}});
  }
 }
 const folder=join(dir,'histories');
 for(const file of readdirSync(folder).filter(f=>/^[a-z0-9_-]+\.json$/.test(f)).sort()){
  const raw=readFileSync(join(folder,file),'utf8');
  let text='',malformed=false;
  try{text=String(JSON.parse(raw).text??'');}
  catch{
   // O acervo inclui alguns JSON legados malformados. Não bloquear as fontes
   // saudáveis e NÃO tentar corrigir o texto original de forma silenciosa.
   malformed=true;
   text=raw.slice(0,5000).replace(/\\r\\n/g,'\n').replace(/\\n/g,'\n').replace(/\\\"/g,'"');
  }
  const parsed=extractHeaderCandidate(text);
  if(!parsed.proposed_name)continue; // Não adivinhar pessoa em genealogias narrativas.
  append({source_kind:'archive_history',source_key:basename(file,'.json'),
   proposed_name:parsed.proposed_name,
   claimed_birth_year:malformed?null:parsed.claimed_birth_year,
   claimed_age:malformed?null:parsed.claimed_age,
   house_id:null,claimed_age_year:null,
   evidence:{source:'public/cormyr/histories/'+file,
    field:'Nome/Idade/Nascimento',age_reference:'unknown',
    malformed_source:malformed,review_required:true}});
 }
 return candidates.sort((a,b)=>a.source_kind.localeCompare(b.source_kind)||
  a.source_key.localeCompare(b.source_key));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dest=resolve(process.argv[2]??'/tmp/cormyr-character-candidates.json');
 const items=gatherCharacterCandidates();
 writeFileSync(dest,JSON.stringify(items,null,2)+'\n','utf8');
 process.stdout.write('Fontes candidatas: '+items.length+'. Arquivo local: '+dest+
  '. Nenhum registro enviado ao Supabase.\n');
}

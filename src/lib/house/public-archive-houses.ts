import {useQuery} from '@tanstack/react-query';
import type {VassalHouse} from './vassal-links';

/**
 * Cadastro PÚBLICO das Casas do site (public/cormyr/data.js): nome, região,
 * sede, titular e brasão. Serve só de apresentação quando a lista oficial
 * da sessão não traz a Casa (no Firebase o jogador só recebe a própria Casa).
 * Nunca lê fichas, recursos ou dados privados.
 */
const rec=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
export const archiveHouseKey=(name:string)=>name.normalize('NFD').replace(/[̀-ͯ]/g,'')
 .toLowerCase().replace(/^casa\s+/,'').replace(/[^a-z0-9]+/g,'');

export function parseArchiveHouses(source:string):VassalHouse[]{
 const start=source.indexOf('{'),end=source.lastIndexOf('}');
 if(start<0||end<=start)return [];
 let data:unknown;
 try{data=JSON.parse(source.slice(start,end+1));}catch{return [];}
 if(!rec(data)||!Array.isArray(data['regions']))return [];
 const out:VassalHouse[]=[],seen=new Set<string>();
 for(const region of data['regions']){
  if(!rec(region)||!Array.isArray(region['houses']))continue;
  for(const row of region['houses']){
   if(!rec(row))continue;
   const name=text(row['name'],80);
   const id=text(row['nobleId'],80)||archiveHouseKey(name);
   if(!name||!id||seen.has(id))continue;
   seen.add(id);
   const crest=text(row['crest'],200);
   out.push({id,name,region:text(row['region'],80)||text(region['name'],80)||null,
    crest:/^assets\/[A-Za-z0-9._/-]+\.(?:webp|png|jpe?g)$/i.test(crest)?'/cormyr/'+crest:null,
    castle:text(row['castle'])||null,lord_name:text(row['leader'])||null});
  }
 }
 return out;
}

export function usePublicArchiveHouses(enabled=true){
 return useQuery({
  queryKey:['public-archive-houses'],enabled,staleTime:60*60*1000,retry:1,
  queryFn:async()=>{
   const response=await fetch('/cormyr/data.js',{credentials:'omit'});
   if(!response.ok)return [] as VassalHouse[];
   return parseArchiveHouses(await response.text());
  },
 });
}

/** Casa oficial da sessão, completada pelo cadastro público (id, depois nome). */
export function resolveVassalHouse(houseId:string,name:string,official:readonly VassalHouse[],
 archive:readonly VassalHouse[]):VassalHouse|undefined{
 const own=official.find(h=>h.id===houseId);
 const key=archiveHouseKey(own?.name??name);
 const fromArchive=archive.find(h=>h.id===houseId)??archive.find(h=>archiveHouseKey(h.name)===key);
 if(!own)return fromArchive;
 return {...fromArchive,...own,
  region:own.region||fromArchive?.region||null,
  crest:own.crest?.trim()||fromArchive?.crest||null,
  castle:own.castle?.trim()||fromArchive?.castle||null,
  lord_name:own.lord_name?.trim()||fromArchive?.lord_name||null};
}

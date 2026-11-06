/** Biblioteca local curada de criaturas CRZ-1.0.
 * O documento 05 (ETL/bestiário) NÃO foi fornecido: deliberadamente sem import web.
 */
import {crzHash} from './ruleset';
import {crzCreaturePlayable,crzReadCreature,type CrzCreature} from './creatures';

export type CrzCatalog=Readonly<{
 schemaVersion:1;catalogHash:string;
 templates:readonly CrzCreature[];
 warnings:readonly string[];
}>;
export type CrzCatalogReport=Readonly<{
 total:number;playable:number;unsupported:number;
 sources:Readonly<Record<string,number>>;warningCount:number;
}>;
function freezeTree<T>(input:T):T{
 if(input&&typeof input==='object'&&!Object.isFrozen(input)){
  for(const v of Object.values(input as object))freezeTree(v);
  Object.freeze(input);
 }
 return input;
}
export function crzBuildCatalog(raw:unknown):CrzCatalog{
 if(!Array.isArray(raw)||raw.length>3000)
  throw new Error('E_SETUP_TEMPLATE: catálogo inválido ou muito grande.');
 const templates=raw.map(crzReadCreature).sort((a,b)=>
  a.id<b.id?-1:a.id>b.id?1:0);
 const seen=new Set<string>();
 const warnings:string[]=[];
 for(const creature of templates){
  if(seen.has(creature.id))
   throw new Error('E_SETUP_DUP: criatura duplicada: '+creature.id);
  seen.add(creature.id);
  if(!crzCreaturePlayable(creature))
   warnings.push(creature.id+': unsupported — sem ataque corpo a corpo/distância.');
  for(const item of creature.warnings)
   warnings.push(creature.id+': '+item);
 }
 const catalogHash=crzHash(templates.map(t=>[t.id,t.provenance.contentHash]));
 return freezeTree({schemaVersion:1 as const,catalogHash,templates,warnings});
}
export function crzCatalogReport(catalog:CrzCatalog):CrzCatalogReport{
 const playable=catalog.templates.filter(crzCreaturePlayable).length;
 const sources:Record<string,number>={};
 for(const item of catalog.templates){
  const key=item.provenance.origin;
  sources[key]=(sources[key]??0)+1;
 }
 return {total:catalog.templates.length,playable,
  unsupported:catalog.templates.length-playable,sources,
  warningCount:catalog.warnings.length};
}
export function crzGetCreature(catalog:CrzCatalog,id:string):CrzCreature{
 const creature=catalog.templates.find(t=>t.id===id);
 if(!creature)throw new Error('E_SETUP_TEMPLATE: criatura desconhecida: '+id);
 if(!crzCreaturePlayable(creature))
  throw new Error('E_SETUP_TEMPLATE: criatura sem ataque utilizável: '+id);
 // Retorna uma cópia validada; não expor referência mutável do catálogo.
 return crzReadCreature(creature);
}
export const CRZ_EMPTY_CATALOG=crzBuildCatalog([]);

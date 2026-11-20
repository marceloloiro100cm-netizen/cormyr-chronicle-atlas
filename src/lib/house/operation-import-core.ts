import {z} from 'zod';
import type {HouseState} from './types';
import {resourcesSchema} from './schemas';
import {validateResources} from './engine';

/** Importação privada de uma ficha legada. O acervo e as abas originais são
 * preservados sem interpolar planilhas no texto público do livro-razão. */
export type HouseImportArchive={source:string;sourceHouse:string;original:{
 name:string;rows:{address:string;value:unknown;formula?:string|undefined}[][]}[]};
export function applyHouseImportOperation(
 state:HouseState,args:Record<string,unknown>,officialName:string,
):{state:HouseState;rule:string;archive:HouseImportArchive;explanation:string}{
 if(state.phase!=='draft'||state.holdings.length||state.units.length)
  throw Error('Importação sobre ficha com compras exige conciliação específica; nada foi sobrescrito.');
 const input=z.object({
  source:z.string().min(1).max(500),
  sourceHouse:z.string().min(1).max(160),
  resources:resourcesSchema,
  issues:z.array(z.string()).max(200),
  decisions:z.string().min(10).max(10000),
  events:z.array(z.string()).max(100),
  original:z.array(z.object({name:z.string(),
   rows:z.array(z.array(z.object({address:z.string(),
    value:z.unknown(),formula:z.string().optional()})))})).max(20),
 }).parse(args);
 validateResources(input.resources);
 const normalize=(s:string)=>s.normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 if(!officialName.trim()||normalize(input.sourceHouse)!==normalize(officialName))
  throw Error('A casa da planilha não corresponde à casa oficial selecionada.');
 if(state.importSources.includes(input.source))
  throw Error('Esta fonte já foi conciliada; nenhuma duplicação.');
 const next=structuredClone(state);
 next.method='import';
 next.regionalApplied=false;
 next.base=input.resources;
 next.identity.history=input.events.filter(e=>!/^b[oô]nus$/i.test(e.trim()));
 next.importSources.push(input.source);
 next.pending=input.issues;
 next.identity.notes+='\nConciliação: '+input.decisions;
 return {state:next,
  rule:'Snapshot legado conciliado · '+input.source+' · originais preservados em arquivo privado',
  archive:{source:input.source,sourceHouse:input.sourceHouse,
   original:input.original},
  explanation:input.decisions+'\nFontes: '+input.source+
   '\nAbas originais arquivadas de modo imutável na operação'};
}

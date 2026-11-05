import {describe,expect,it} from 'vitest';
import type {SpyDossier} from '@/lib/espionage/spy-dossier.functions';
import {filterSpyDossiers,paginateSpyDossiers,
 normalizeDossierSearch,spyDossierPendingHouseNames} from '@/lib/espionage/spy-dossier-list';

function dossier(id:string,name:string,region:string,owner:string,
 date:string,resources:number):SpyDossier {
 return {
  id,ownerHouseId:owner,targetHouseId:name.toLowerCase(),
  ownerHouseName:owner,targetHouseName:name,targetRegion:region,
  updatedAt:date,history:[],adminHistory:[],
  findings:Array.from({length:resources},(_,i)=>({
   id:`resource-${id}-${i}`,objective:'house_resources' as const,
   key:`key-${i}`,snapshot:{value:i},discoveredDate:'1522-01-01',
   verifiedDate:'1522-01-01',
  })),
 };
}
const d=[
 dossier('1','Águia','Dragon Coast','goldfin','2026-11-04T11:00:00.000Z',7),
 dossier('2','Harcourt','Horselands','goldfin','2026-11-04T12:00:00.000Z',3),
 dossier('3','Ashkar','Dragon Coast','grantass','2026-11-03T12:00:00.000Z',1),
];

describe('Dossiês · lotes 16–18 · filtros, paginação e pendências',()=>{
 it('busca sem acentos/caixa e filtra por região com nome equivalente',()=>{
  expect(normalizeDossierSearch('  ÁGUIA ')).toBe('aguia');
  expect(filterSpyDossiers(d,{targetSearch:'aguia'}).map(x=>x.id)).toEqual(['1']);
  expect(filterSpyDossiers(d,{region:'DRAGON COAST'}).map(x=>x.id))
   .toEqual(['1','3']);
  expect(filterSpyDossiers(d,{ownerHouseId:'goldfin'}).map(x=>x.id))
   .toEqual(['2','1']);
 });
 it('contagem de recursos completa utiliza 7/7 sem inventar totais de unidades',()=>{
  expect(filterSpyDossiers(d,{progress:'complete'}).map(x=>x.id)).toEqual(['1']);
  expect(filterSpyDossiers(d,{progress:'incomplete'}).map(x=>x.id)).toEqual(['2','3']);
 });
 it('ordena alfabeticamente ou pela última alteração sem mutar entrada',()=>{
  const copy=d.map(x=>x.id);
  expect(filterSpyDossiers(d,{sort:'target'}).map(x=>x.id)).toEqual(['1','3','2']);
  expect(d.map(x=>x.id)).toEqual(copy);
 });
 it('pagina e limita a página após alteração do filtro',()=>{
  const records=Array.from({length:25},(_,i)=>
   dossier(String(i),`Casa ${i}`,'Dragon Coast','goldfin',
    '2026-11-04T12:00:00.000Z',0));
  const pages=paginateSpyDossiers(records,2,12);
  expect(pages.items).toHaveLength(12);
  expect(pages.page).toBe(2);
  expect(pages.totalPages).toBe(3);
  expect(paginateSpyDossiers(records,999,12).items).toHaveLength(1);
  expect(paginateSpyDossiers([],4,12)).toEqual({
   page:1,totalPages:1,total:0,items:[],
  });
 });
 it('identifica missões pendentes pelo par correto sem expor outro investigador',()=>{
  expect(spyDossierPendingHouseNames('goldfin','harcourt',d))
   .toEqual({owner:'goldfin',target:'Harcourt'});
  expect(spyDossierPendingHouseNames('grantass','ashkar',d))
   .toEqual({owner:'grantass',target:'Ashkar'});
  expect(spyDossierPendingHouseNames('other','harcourt',d))
   .toEqual({owner:'other',target:'harcourt'});
 });
});

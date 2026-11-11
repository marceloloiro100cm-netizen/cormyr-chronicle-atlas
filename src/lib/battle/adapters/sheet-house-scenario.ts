import sheetData from '@/data/battle/noble-house-scenario-20261104.json';
import {UNIT_TYPES} from '@/lib/house/engine';
import {MILITARY_HOLDING_BENEFITS} from '@/lib/house/unit-progression';
import type {ImportedNpcUnit} from './imported-npc-roster';

export type SheetScenarioHouse=(typeof sheetData.houses)[number];
export type SheetScenarioAsset=SheetScenarioHouse['assets'][number];
const normalize=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g,'');
const houseIndex=new Map<string,SheetScenarioHouse>(sheetData.houses.map(h=>[normalize(h.name),h]));

/** A fonte desta importação é uma planilha de cenários, não o cadastro de compras.
 * NUNCA materializar estes registros em noble_house_sheets ou alterar reservas.
 */
export function findSheetScenarioHouse(name:string):SheetScenarioHouse|undefined{
 return houseIndex.get(normalize(name));
}
export function sheetScenarioHouseCount(){return sheetData.houses.length;}
export function sheetScenarioAssets(house:SheetScenarioHouse){
 return house.assets.map(a=>({
  sourceRow:a.sourceRow,domain:a.domain,category:a.category,name:a.name,
  catalogId:a.catalogId,quantity:a.quantity,status:a.status,cost:a.cost,
  militaryEffect:MILITARY_HOLDING_BENEFITS[a.catalogId]??null,
  fortDefense:({tower:3,hall:4,'small-castle':6,castle:8,'superior-castle':12} as Record<string,number>)[a.catalogId]??0,
 }));
}
/** Os 17 tipos da tabela 6-8 determinam o efetivo. As entradas sem tipo ou
 * treinamento explícitos continuam visíveis entre as posses, mas não
 * recebem estatísticas militares ficticiamente atribuídas.
 */
export function sheetScenarioRoster(house:SheetScenarioHouse,houseId:string):ImportedNpcUnit[]{
 const types=new Map(UNIT_TYPES.map(t=>[t.id,t.strength]));
 return house.assets.flatMap(a=>{
  if(a.category!=='Unidade militar')return [];
  const match=/^unit-(.+)-(green|trained|veteran|elite)$/.exec(a.catalogId);
  const special=a.catalogId==='ficha-qazir-apoio-treinado'?['support','trained']:null;
  const type=match?.[1]??special?.[0];
  const training=match?.[2]??special?.[1];
  if(!type||!training||!types.has(type)||!Number.isInteger(a.quantity)||a.quantity<1||a.quantity>30)return [];
  return [{
   source_key:'sheet-'+a.sourceRow,
   house_id:houseId,
   unit_name:a.name,
   unit_type:type,
   training:training as ImportedNpcUnit['training'],
   quantity:a.quantity,
   standard_unit_strength:types.get(type)!,
   source_status:a.status,
   source_row:a.sourceRow,
  }];
 });
}
export function sheetScenarioUnmappedUnits(house:SheetScenarioHouse){
 const mapped=new Set(sheetScenarioRoster(house,'scenario-preview').map(u=>u.source_row));
 return house.assets.filter(a=>a.category==='Unidade militar'&&!mapped.has(a.sourceRow));
}

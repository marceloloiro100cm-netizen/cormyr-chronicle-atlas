import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import type {HouseState} from '@/lib/house/types';
import {battleHouseDirectory} from './house-directory';
import {adaptOfficialUnit} from './unit-readonly';
import {assessNpcWarReadiness} from './house-war-effects';
import {snapshotOfficialWarUnit} from '../got/official-adapter';
import {modelWarUnit,WAR_MODEL_UNIT_TYPES,type WarModelUnitTypeId} from '../got/models';
import {findSheetScenarioHouse,sheetScenarioAssets,sheetScenarioRoster} from './sheet-house-scenario';
import type {SheetScenarioHouse} from './sheet-house-scenario';
import {importedNpcBattleStack,importedNpcUnitSchema,previewImportedNpc,type ImportedNpcUnit} from './imported-npc-roster';

const sourceQuery=z.object({houseId:z.string().min(1).max(100)}).strict();
const importQuery=sourceQuery.extend({
 unitId:z.string().min(1).max(90),
 side:z.enum(['attacker','defender']),
 position:z.object({q:z.number().int().safe(),r:z.number().int().safe()}).strict(),
 primaryTypeId:z.string().min(1).max(60),
 profileDecisionReason:z.string().trim().max(500).optional(),
}).strict();
type Context={supabase:{
 rpc:(name:string,args?:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>;
 from:(table:string)=>any;
}};
async function requireNarrator(db:Context['supabase']):Promise<void>{
 const [role,active]=await Promise.all([db.rpc('is_campaign_admin'),db.rpc('campaign_access_active')]);
 if(role.error||active.error||role.data!==true||active.data!==true)
  throw new Error('Consulta restrita ao Narrador autorizado.');
}
async function readState(db:Context['supabase'],houseId:string):Promise<{state:HouseState;version:number}|null>{
 const query=await db.from('noble_house_sheets')
  .select('state,version').eq('house_id',houseId).maybeSingle();
 if(query.error)throw new Error('Não foi possível consultar a ficha militar.');
 if(!query.data)return null;
 if(!query.data.state)throw new Error('Ficha militar registrada sem dados.');
 const state=query.data.state as HouseState;
 if(state.houseId!==houseId||!Array.isArray(state.units))
  throw new Error('Fonte militar inconsistente.');
 const version=Number(query.data.version);
 if(!Number.isInteger(version)||version<0)throw new Error('Versão oficial inválida.');
 return {state,version};
}
/** O catálogo de cenário guarda propostas e entradas autorais somente para batalha.
 * Nenhum dado é lançado em noble_house_sheets ou no orçamento da Casa.
 */
async function readNpcRoster(db:Context['supabase'],houseId:string):Promise<ImportedNpcUnit[]>{
 const result=await db.from('battle_house_roster_imports')
  .select('source_key,house_id,unit_name,unit_type,training,quantity,standard_unit_strength,source_status,source_row')
  .eq('house_id',houseId).order('source_row').limit(100);
 if(result.error)throw new Error('O catálogo militar de cenários está indisponível.');
 return ((result.data??[]) as unknown[]).map(raw=>importedNpcUnitSchema.parse(raw));
}
/** Resolve nome do catálogo no servidor, sem permitir que o cliente altere a Casa. */
async function readSheetHouse(db:Context['supabase'],houseId:string):Promise<SheetScenarioHouse|undefined>{
 const [catalog,campaign]=await Promise.all([
  db.from('house_catalog').select('name').eq('id',houseId).maybeSingle(),
  db.from('campaign_houses').select('name').eq('id',houseId).maybeSingle(),
 ]);
 if(catalog.error&&campaign.error)throw new Error('Não foi possível consultar a Casa de origem.');
 const name=catalog.data?.name??campaign.data?.name??houseId;
 return typeof name==='string'?findSheetScenarioHouse(name):undefined;
}
/** Não retorna HouseState nem atributos privados; somente casas sob sessão administrativa. */
export const listBattleSourceHouses=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const db=context.supabase as unknown as Context['supabase'];
  await requireNarrator(db);
  const [catalog,campaign]=await Promise.all([
   db.from('house_catalog').select('id,name,region,classification,crest:archive_data->>crest')
    .eq('public_reviewed',true).order('name').limit(500),
   db.from('campaign_houses').select('id,name,region,crest')
    .eq('active',true).eq('season',2).order('name').limit(500),
  ]);
  if(catalog.error||campaign.error)
   throw new Error('O catálogo regional de casas está indisponível.');
  await requireNarrator(db);
  const safe=(data:unknown)=>{
   if(!Array.isArray(data))return [];
   type CrestRow={id:string;name:string;region:string|null;
    crest?:string|null;classification?:string|null};
   return data.filter((row):row is CrestRow=>{
    return row!==null&&typeof row==='object'&&
     typeof row.id==='string'&&typeof row.name==='string'&&
     (row.region===null||typeof row.region==='string')&&
     (row.crest===undefined||row.crest===null||typeof row.crest==='string')&&
     (row.classification===undefined||row.classification===null||
      typeof row.classification==='string');
   }).map(row=>({id:row.id,name:row.name,region:row.region??'',
    ...(row.crest!==undefined?{crest:row.crest}:{}),
    ...(row.classification!==undefined?{classification:row.classification}:{})}));
  };
  return battleHouseDirectory(safe(catalog.data),safe(campaign.data));
 });
export const listBattleSourceUnits=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(sourceQuery)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as Context['supabase'];
  await requireNarrator(db);
  const record=await readState(db,data.houseId);
  const sheet=await readSheetHouse(db,data.houseId);
  const scenarioAssets=sheet?sheetScenarioAssets(sheet):[];
  // Fichas operacionais de jogadores sempre prevalecem sobre propostas NPC.
  if(record&&record.state.units.length){
   const {state,version}=record;
   const roster=state.units.map(unit=>({
    id:unit.id,name:unit.name,types:unit.types,training:unit.training,
    strength:unit.strength,casualties:unit.casualties,destroyed:Boolean(unit.destroyed),
   }));
   await requireNarrator(db);
   return {houseId:data.houseId,sourceVersion:version,
    sourceStatus:'recorded' as const,units:roster,scenarioAssets,
    warReadiness:assessNpcWarReadiness({hasFullSheet:true,hasScenarioRoster:false})};
  }
  const sheetRoster=sheet?sheetScenarioRoster(sheet,data.houseId):[];
  const archive=sheetRoster.length?sheetRoster:await readNpcRoster(db,data.houseId);
  if(archive.length){
   await requireNarrator(db);
   return {houseId:data.houseId,sourceVersion:null,
    sourceStatus:'scenario-roster' as const,
    units:archive.map(previewImportedNpc),scenarioAssets,
    warReadiness:assessNpcWarReadiness({hasFullSheet:false,hasScenarioRoster:true})};
  }
  await requireNarrator(db);
  return {houseId:data.houseId,sourceVersion:record?.version??null,
   sourceStatus:record?'empty' as const:'no-military-sheet' as const,units:[],scenarioAssets,
   warReadiness:assessNpcWarReadiness({hasFullSheet:false,hasScenarioRoster:false})};
 });
/** O cliente envia IDs e decisão, JAMAIS um HouseState. A conversão acontece no servidor. */
export const previewBattleSourceStack=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(importQuery)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as Context['supabase'];
  await requireNarrator(db);
  const source=await readState(db,data.houseId);
  if(source?.state.units.length){
   const {state,version}=source;
   const unit=state.units.find(u=>u.id===data.unitId);
   if(!unit)throw new Error('Unidade oficial de origem indisponível.');
   const stack=adaptOfficialUnit(state,unit,{
    houseId:data.houseId,unitId:data.unitId,side:data.side,
    position:data.position,primaryTypeId:data.primaryTypeId,
    ...(data.profileDecisionReason?{profileDecisionReason:data.profileDecisionReason}:{}),
    sourceVersion:version,capturedAt:new Date().toISOString(),
   });
   await requireNarrator(db);
   return stack;
  }
  const roster=await readNpcRoster(db,data.houseId);
  const row=roster.find(x=>x.source_key===data.unitId);
  if(!row)throw new Error('A Casa não possui esta unidade no catálogo de batalha.');
  const stack=importedNpcBattleStack(row,data.side,data.position,data.primaryTypeId);
  await requireNarrator(db);
  return stack;
 });

/** Game of Thrones: captura oficial autêntica, nunca um BattleStack convertido do PTE.
 * Somente narrador autorizado; retorna dados militares estritamente necessários.
 * Não interpreta planilhas NPC sem habilidades, Saúde e Disciplina registradas.
 */
const gotWarUnitQuery=sourceQuery.extend({
 unitId:z.string().min(1).max(90),
 side:z.enum(['attacker','defender']),
 position:z.object({x:z.number().int().min(0).max(59),y:z.number().int().min(0).max(59)}).strict(),
 typeId:z.string().min(1).max(60),
 rangeOverride:z.enum(['short','long']).optional(),
}).strict();
export const previewBattleWarUnit=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(gotWarUnitQuery)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as Context['supabase'];
  await requireNarrator(db);
  const source=await readState(db,data.houseId);
  if(source?.state.units.length){
   const unit=source.state.units.find(x=>x.id===data.unitId);
   if(!unit)throw new Error('Unidade militar oficial não encontrada.');
   const snapshot=snapshotOfficialWarUnit(source.state,unit,{
    side:data.side,position:data.position,version:source.version,
    typeId:data.typeId,
    ...(data.rangeOverride?{rangeOverride:data.rangeOverride}:{}),
   });
   await requireNarrator(db);
   return snapshot;
  }
  // Apenas no modo de simulação: perfis-modelo da tabela oficial e treinamento
  // registrado, sem alegar que a planilha contenha Saúde/Defesa individuais.
  const sheet=await readSheetHouse(db,data.houseId);
  const local=sheet?sheetScenarioRoster(sheet,data.houseId):[];
  const candidates=local.length?local:await readNpcRoster(db,data.houseId);
  const row=candidates.find(x=>x.source_key===data.unitId);
  if(!row)throw new Error('Unidade de cenário indisponível para esta Casa.');
  if(row.unit_type!==data.typeId||!WAR_MODEL_UNIT_TYPES.some(t=>t.id===data.typeId))
   throw new Error('Tipo da unidade não corresponde ao registro de origem.');
  if(row.unit_type==='warships')throw new Error('Navios exigem cenário naval e não entram no mapa terrestre.');
  const snapshot=modelWarUnit({
   id:'scenario-'+data.houseId+'-'+row.source_key,name:row.unit_name,
   side:data.side,position:data.position,typeId:row.unit_type as WarModelUnitTypeId,
   training:row.training,
  });
  await requireNarrator(db);
  return snapshot;
 });

import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {resourcesSchema} from '@/lib/house/schemas';
import {calculateSpyDefense} from '@/lib/espionage/spy-defense';
import {resolveSpyHouseDefense} from '@/lib/espionage/spy-house-target-defense';
import type {HouseState} from '@/lib/house/types';

/** All imported Law figures and operational House sheets are PRIVATE.
 * Narrator-only read. The defender's Law is never sent to attacking players.
 * It is kept separate from region reconnaissance and its public regional Law.
 */
const input=z.object({
 houseId:z.string().trim().min(1).max(100),
 domainId:z.string().trim().min(1).max(100).optional(),
}).strict();
const sourceSchema=z.object({
 id:z.string().min(1),
 name:z.string().min(1),
 region:z.string().min(1),
 hasOperationalSheet:z.boolean(),
 importedLaw:z.number().int().nonnegative().nullable(),
 importedSourceRow:z.number().int().min(2).nullable(),
 source:z.enum(['operational_sheet','imported_spreadsheet','missing_sheet_and_spreadsheet']),
}).strict();

const operationalSheetSchema=z.object({
 houseId:z.string().min(1),
 base:resourcesSchema,
 permanent:resourcesSchema,
 identity:z.object({region:z.string()}).passthrough(),
 method:z.enum(['budget','roll','import']),
 regionalApplied:z.boolean(),
 holdings:z.array(z.object({
  id:z.string(),itemId:z.string(),name:z.string(),
  domainId:z.string(),status:z.string(),
  costs:z.array(z.unknown()),effects:z.array(z.unknown()),
 }).passthrough()),
 domains:z.array(z.object({id:z.string(),name:z.string()}).passthrough()),
 units:z.array(z.unknown()),
 month:z.number(),
}).passthrough();

type RpcResult={data:unknown;error:{message:string}|null};
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<RpcResult>;

export const loadNarratorSpyHouseDefense=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(input)
 .handler(async({data,context})=>{
  const admin=await context.supabase.rpc('is_campaign_admin');
  if(admin.error||admin.data!==true)
   throw new Error('Somente o Narrador pode consultar a defesa de Casas adversárias.');
  const rpc=context.supabase.rpc as unknown as Rpc;
  const lookup=await rpc('spy_narrator_noble_defense_source',{p_house:data.houseId});
  if(lookup.error)throw new Error('Consulta de Defesa de Espionagem indisponível.');
  const metadata=sourceSchema.safeParse(lookup.data);
  if(!metadata.success||metadata.data.id!==data.houseId)
   throw new Error('Cadastro de alvo inconsistente; interrompida a consulta.');
  const source=metadata.data;
  if(source.hasOperationalSheet){
   const sheet=await context.supabase.from('noble_house_sheets')
    .select('state').eq('house_id',data.houseId).maybeSingle();
   if(sheet.error||!sheet.data)
    throw new Error('A Casa possui ficha, mas não foi possível consultá-la. Não aplicar defesa regional.');
   const parsed=operationalSheetSchema.safeParse(sheet.data.state);
   if(!parsed.success||parsed.data.houseId!==data.houseId)
    throw new Error('Ficha operacional inconsistente: não substituir pela Lei importada.');
   const state=parsed.data as unknown as HouseState;
   const profile=calculateSpyDefense(state);
   const resolution=resolveSpyHouseDefense({
    kind:'with_sheet',region:source.region,state,
    ...(data.domainId?{domainId:data.domainId}:{}),
   });
   return {
    houseId:source.id,houseName:source.name,region:source.region,...resolution,
    sourceSpreadsheetRow:null as number|null,
    domains:profile.domains.map(d=>({domainId:d.domainId,name:d.name,difficulty:d.difficulty})),
   };
  }
  if(source.importedLaw!==null){
   if(source.importedSourceRow===null)
    throw new Error('Ficha importada sem linha de origem: requer revisão do Narrador.');
   const resolution=resolveSpyHouseDefense({
    kind:'with_imported_stats',region:source.region,
    importedLaw:source.importedLaw,sourceRow:source.importedSourceRow,
   });
   return {
    houseId:source.id,houseName:source.name,region:source.region,...resolution,
    sourceSpreadsheetRow:source.importedSourceRow as number|null,
    domains:[] as {domainId:string;name:string;difficulty:number}[],
   };
  }
  // Only genuinely absent from BOTH operational sheets and source workbook.
  const resolution=resolveSpyHouseDefense({kind:'without_sheet',region:source.region});
  return {
   houseId:source.id,houseName:source.name,region:source.region,...resolution,
   sourceSpreadsheetRow:null as number|null,
   domains:[] as {domainId:string;name:string;difficulty:number}[],
  };
 });

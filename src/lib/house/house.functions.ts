import {isNarrativeNpc} from './narrative-npc';
import {attachVassal,createVassal,vassalState} from './vassals';
import { createServerFn } from '@tanstack/react-start';
import { changeHoldingCondition, legacyEffectCandidates, legacyCatalogEffects } from './holding-accounting';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { operationSchema, resourcesSchema, catalogSchema, unitSchema } from './schemas';
import { CORE_CATALOG } from './catalog';
import { newHouseState, RESOURCE_KEYS, type HouseState, type CatalogItem, type Unit, type Resource, type CourtMember } from './types';
import { alternativeFortune, balances, activeHoldings,createUnit, purchase, UNIT_TYPES, validateResources } from './engine';
import { calendarMonthIndex, requireCalendarAlignment, reconcileHouseCalendar } from './calendar-consistency';
import { isMonthSensitiveHouseAction } from './monthly-operation-policy';
import { confirmFortune, convertResources, runTournament } from './fortune';
import { historyAdjustments, memberBonusAdjustments, historicalFoundationYear, rollFoundation, rollHistoricalEvent } from './creation-history';
import { improveEquipment } from './equipment';
import { buySiege, changeSiegeAssignment } from './siege';
import { equipUnit, resolveSurvivors, changeUnitState, trainUnit, proposeVassal, approveVassal, endVassal, setVassalLoyalty, SURVIVOR_CONDITIONS } from './military';
import { linkVassalNpcs, validateVassalNpcs } from './vassal-links';
import { editUnitProfile,grantUnitXp,renameMilitaryHolding,unitAllowedSkills } from './unit-progression';
import { selectUndoSnapshot } from './undo';
import { legacyCostIssues, reconcileLegacyCosts } from './legacy-cost-reconciliation';
import { depositGold, donateGold, donateGlory, spendInfluence, redeemIntrigueBonus } from './resource-transactions';
import { assignCourt, removeCourtAssignment, validateCourtRecord } from './court';
const npcIdsSchema=z.array(z.string().uuid()).max(100);
export const readCourtMember=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({houseId:z.string(),id:z.string().uuid()})).handler(async({data,context})=>{
 const r=await context.supabase.from('campaign_records').select('id,house_id,kind,title,content').eq('house_id',data.houseId).eq('id',data.id).single();
 if(r.error)throw new Error('Integrante da Corte indisponível.');validateCourtRecord(data.houseId,r.data);
 if(!r.data)throw new Error('Integrante da Corte indisponível.');return {id:r.data.id,title:r.data.title,content:r.data.content};
});
export const readVassalNpc=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({houseId:z.string(),id:z.string().uuid()})).handler(async({data,context})=>{
  const records=await context.supabase.from('campaign_records').select('id,house_id,kind,title,content').eq('house_id',data.houseId).eq('id',data.id).single();
  if(records.error||!records.data)throw new Error('NPC indisponível para este acesso.');
  validateVassalNpcs(data.houseId,[data.id],[records.data]);
  return {id:records.data.id,title:records.data.title,content:records.data.content};
});
const houseInput=z.object({houseId:z.string().min(1).max(100)});
/** Full history is fetched only for a requested export after read-access verification. */
export const loadHouseLedger=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({houseId:z.string().min(1).max(100)})).handler(async({data,context})=>{
 const [admin,member]=await Promise.all([context.supabase.rpc('is_campaign_admin'),context.supabase.rpc('in_campaign_house',{h:data.houseId,edit_required:false})]);
 if(admin.error||member.error||(!admin.data&&!member.data))throw new Error('Histórico não autorizado.');
 const rows:{id:string;action:string;explanation:string;rule:string;created_at:string;campaign_month?:number;actor?:string;version:number}[]=[];
 for(let start=0;start<=10000;start+=500){
  const result=await context.supabase.from('noble_house_ledger').select('id,action,explanation,rule,campaign_month,created_at,actor,version').eq('house_id',data.houseId).order('version',{ascending:true}).range(start,start+499);
  if(result.error)throw new Error('Falha ao carregar histórico para exportação.');
  rows.push(...(result.data??[]).map(row=>({...row,campaign_month:row.campaign_month??undefined,actor:row.actor??undefined})));
  if((result.data??[]).length<500)return rows;
 }
 throw new Error('Histórico excedeu dez mil lançamentos; exportação interrompida sem truncar.');
});
export const loadHouseHub=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(houseInput).handler(async({data,context})=>{
  const db=context.supabase;
  const [house,sheet,rules,ledger,admin]=await Promise.all([db.from('campaign_houses').select('id,name,region').eq('id',data.houseId).maybeSingle(),db.from('noble_house_sheets').select('*').eq('house_id',data.houseId).maybeSingle(),db.from('noble_house_rule_overrides').select('*'),db.from('noble_house_ledger').select('id,action,explanation,rule,campaign_month,created_at,actor,version,operation_key').eq('house_id',data.houseId).order('version',{ascending:false}).limit(100),db.rpc('is_campaign_admin')]);
  const membership=await db.rpc('in_campaign_house',{h:data.houseId,edit_required:false});
  if(!admin.data&&!membership.data)throw new Error('Casa não autorizada.');
  for(const r of [house,sheet,rules,ledger,admin])if(r.error)throw new Error('Não foi possível consultar a ficha.');
  if(!house.data)throw new Error('Casa oficial não encontrada.');
  const overrides=(rules.data??[]).map(r=>catalogSchema.parse(r.definition));
  const catalog=[...CORE_CATALOG.filter(i=>!overrides.some(o=>o.id===i.id)),...overrides];
  const [houses,archive]=await Promise.all([db.from('campaign_houses').select('id,name,region,crest,castle,lord_name'),(async()=>{const rows=[];for(let from=0;;from+=500){const page=await db.from('house_catalog').select('id,name,region,archive_data').order('id').range(from,from+499);if(page.error)return {data:null,error:page.error};rows.push(...(page.data??[]));if((page.data?.length??0)<500)return {data:rows,error:null};}})()]);if(houses.error||archive.error)throw new Error('Não foi possível consultar os brasões oficiais.');
  const merged=new Map((archive.data??[]).map(h=>{const a=(h.archive_data??{}) as Record<string,unknown>;return [h.id,{id:h.id,name:h.name,region:h.region,crest:typeof a['crest']==='string'?a['crest']:null,castle:typeof a['castle']==='string'?a['castle']:null,lord_name:typeof a['lord_name']==='string'?a['lord_name']:null}];}));for(const h of houses.data??[])merged.set(h.id,{...h,region:h.region??''});

  const { LEGACY_HOUSE_SEEDS } = await import('./legacy-seeds');
  let finalState: HouseState | undefined;

  if (sheet.data?.state) {
    const s = sheet.data.state as unknown as HouseState;
    let fallbackKey = Object.keys(LEGACY_HOUSE_SEEDS).find(k => house.data?.name?.toLowerCase().includes(k.toLowerCase()));

    if ((s.domains?.length ?? 0) === 0 && (s.holdings?.length ?? 0) === 0
      && (sheet.data.version??0)===0 && !s.importSources?.length && !s.identity?.crestPath
      && s.creationStep===0 && !s.creationHistory && !s.creationBonuses?.length
      && RESOURCE_KEYS.every(r=>s.base[r]===0&&s.permanent[r]===0)
      && fallbackKey && LEGACY_HOUSE_SEEDS[fallbackKey]) {
      finalState = { ...LEGACY_HOUSE_SEEDS[fallbackKey], houseId: data.houseId };
    } else {
      finalState = s;
    }
  }

  const myMembership=admin.data?null:await db.from('house_memberships')
    .select('can_edit,can_edit_attributes,player_id,campaign_players!inner(user_id,active,require_password_change)')
    .eq('house_id',data.houseId).eq('campaign_players.user_id',context.userId)
    .eq('campaign_players.active',true).eq('campaign_players.require_password_change',false)
    .maybeSingle();
  if(myMembership?.error)throw new Error('Permissões da Casa indisponíveis.');
  const initial=newHouseState(data.houseId,house.data.region??'');if(!finalState){
    const c=await db.rpc('get_campaign_calendar');
    if(c.error||!c.data)throw new Error('Calendário global indisponível: nova Casa exige período oficial.');
    initial.month=calendarMonthIndex(c.data as {year:number;month:number});
  }
  return {state:finalState ?? initial,version:sheet.data?.version??0,catalog,houses:[...merged.values()].sort((a,b)=>a.name.localeCompare(b.name)),ledger:ledger.data??[],syncState:sheet.data?.sync_state??'not_configured',admin:Boolean(admin.data),canEditAttributes:Boolean(admin.data||myMembership?.data?.can_edit_attributes)};
});
export const houseOperation=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(operationSchema).handler(async({data,context})=>{
  const [role,membership]=await Promise.all([context.supabase.rpc('is_campaign_admin'),context.supabase.rpc('in_campaign_house',{h:data.houseId,edit_required:true})]);
  const admin=Boolean(role.data);if(!admin&&!membership.data)throw new Error('Edição desta casa não autorizada.');
  if(['admin_edit','restore_legacy_effects','reconcile_legacy_costs','treasury_deposit','donate_glory','approve','advance','import','correct','fortune','survivors','grant_unit_xp','vassal_approve','vassal_end','vassal_loyalty','vassal_npcs','sync_calendar','return_to_draft','clear_pending'].includes(data.action)&&!admin)throw new Error('Somente o Narrador pode confirmar esta operação.');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const duplicate=await db.from('noble_house_ledger').select('after_state,version,actor,action').eq('house_id',data.houseId).eq('operation_key',data.key).maybeSingle();
  if(duplicate.error)throw new Error('Não foi possível conferir a operação.');
  if(duplicate.data){if(duplicate.data.actor!==context.userId||duplicate.data.action!==data.action)throw new Error('Chave já utilizada.');return {state:duplicate.data.after_state as unknown as HouseState,version:duplicate.data.version,duplicate:true};}
  const current=await db.from('noble_house_sheets').select('*').eq('house_id',data.houseId).maybeSingle();
  const official=await context.supabase.from('campaign_houses').select('region,name').eq('id',data.houseId).single();
  if(current.error||official.error)throw new Error('Casa não encontrada.');
  const state=(current.data?.state??newHouseState(data.houseId,official.data.region??'')) as unknown as HouseState;
  if(!current.data){
    const c=await context.supabase.rpc('get_campaign_calendar');
    if(c.error||!c.data)throw new Error('Calendário global indisponível: nenhuma Casa nova será gravada com data presumida.');
    state.month=calendarMonthIndex(c.data as {year:number;month:number});
  }
  if((current.data?.version??0)!==data.version)throw new Error('A ficha mudou. Recarregue para conciliar as versões.');
  let next=structuredClone(state),rule='Cormyr · gestão auditada';const args=data.args;
  const editGrants=admin?null:(await context.supabase.from('house_memberships')
    .select('can_edit_attributes,player_id,campaign_players!inner(user_id,active,require_password_change)')
    .eq('house_id',data.houseId).eq('campaign_players.user_id',context.userId)
    .eq('campaign_players.active',true).eq('campaign_players.require_password_change',false)
    .maybeSingle());
  if(editGrants?.error)throw new Error('Permissões de atributos indisponíveis.');
  const mayBuyAttributes=admin||Boolean(editGrants?.data?.can_edit_attributes);
  const pristine=state.phase==='draft'&&state.rolls.length===0&&
    !state.importSources.length&&state.holdings.length===0&&state.units.length===0&&
    RESOURCE_KEYS.every(r=>state.base[r]===0);

  if(data.action==='advance')throw new Error('Avanço individual desativado: publique a data no Calendário global do Narrador.');
  if(state.phase==='active'&&isMonthSensitiveHouseAction(data.action)){
    const response=await context.supabase.rpc('get_campaign_calendar');
    if(response.error||!response.data)throw new Error('Calendário global indisponível; nenhuma operação mensal foi gravada.');
    requireCalendarAlignment(state,response.data as {year:number;month:number});
  }
  if(state.phase==='review'&&!['admin_edit','restore_legacy_effects','reconcile_legacy_costs','treasury_deposit','donate_gold','donate_glory','spend_influence','redeem_intrigue','crest_import','approve','correct','return_to_draft','clear_pending'].includes(data.action))throw new Error('Criação em revisão; aguarde aprovação ou correção do Narrador.');
  if(data.action==='draft') {
    if(state.phase!=='draft')throw new Error('Ficha em revisão ou ativa exige edição auditada do Narrador.');
    const values=resourcesSchema.parse(args['base']);validateResources(values);
    const identity=z.object({region:z.string(),motto:z.string().max(500),
      foundation:z.number().int().optional(),history:z.array(z.string()).max(100),
      notes:z.string().max(10000),crestPath:z.string().max(600).optional()}).parse(args['identity']);
    if(identity.crestPath!==state.identity.crestPath)
      throw new Error('Importe a imagem do brasão pela ferramenta segura, não pela edição de identidade.');
    const method=z.enum(['budget','roll','import']).parse(args['method']);
    if(admin){
      // Only the Narrator can change the overall creation configuration freely.
      next.method=method;next.budget=z.number().finite().nonnegative().nullable().parse(args['budget']);
    }else if(method!==state.method){
      if(!pristine||method==='import'||(method==='budget'&&!mayBuyAttributes))
        throw new Error('A escolha do método não está autorizada para esta Casa.');
      next.method=method;next.budget=method==='budget'?210:null;
    }else if(method==='budget'&&mayBuyAttributes&&state.budget===null&&pristine){
      next.budget=210;
    }
    const changed=RESOURCE_KEYS.some(r=>state.base[r]!==values[r]);
    if(changed){
      if(!admin){
        if(next.method!=='budget'||!mayBuyAttributes)
          throw new Error('Compra de atributos bloqueada pelo Narrador.');
        if(state.rolls.length||state.importSources.length)
          throw new Error('Atributos rolados ou importados não podem ser redistribuídos.');
        if(RESOURCE_KEYS.some(r=>!Number.isInteger(values[r])||values[r]<0))
          throw new Error('Point buy exige valores inteiros não negativos por atributo.');
      }
      next.base=values;
    }
    next.identity=identity;
    next.creationStep=z.number().int().min(0).max(9).parse(args['creationStep']);
    next.regionalApplied=next.method!=='import'&&next.importSources.length===0;
    if(next.method==='budget'){
      if(next.budget===null&&!admin&&changed)throw new Error('Orçamento não autorizado.');
      if(next.budget!==null&&RESOURCE_KEYS.reduce((n,r)=>n+next.base[r],0)>next.budget)
        throw new Error('Pontos-base excedem a reserva de point buy autorizada.');
    }
    rule='Cormyr · criação tradicional/point buy · autorização de atributos conferida';
  }
  if(data.action==='admin_edit'){
    if(!admin)throw new Error('Somente o Narrador pode editar fichas sem restrições de fase.');
    if(data.explanation.trim().length<10)throw new Error('Justifique a edição administrativa (mínimo 10 caracteres).');
    const input=z.object({base:resourcesSchema,permanent:resourcesSchema,
      identity:z.object({region:z.string().max(120),motto:z.string().max(500),
      foundation:z.number().int().optional(),history:z.array(z.string()).max(100),
      notes:z.string().max(10000)})}).parse(args);
    validateResources(input.base);validateResources(input.permanent);
    // Preserve imported regionalApplied flag, dice, purchases, characters, troops and history.
    next.base=input.base;next.permanent=input.permanent;
    next.identity={...state.identity,...input.identity};
    rule='Cormyr · edição administrativa de ficha, auditoria e justificativa obrigatórias';
  }
  if(data.action==='crest_import'){
    const input=z.object({base64:z.string().min(16).max(3_000_000),
      mime:z.enum(['image/png','image/jpeg','image/webp'])}).parse(args);
    if(state.phase!=='draft'&&!admin)throw new Error('Brasão de casa ativa exige edição do Narrador.');
    if(!admin&&state.importSources.length)throw new Error('Brasão de ficha importada exige revisão do Narrador.');
    const bytes=Buffer.from(input.base64,'base64');
    if(bytes.length>2*1024*1024||bytes.length<32||bytes.toString('base64')!==input.base64)
      throw new Error('Imagem inválida: tamanho máximo 2 MB.');
    const signature=(input.mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
      (input.mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||
      (input.mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP');
    if(!signature)throw new Error('Formato da imagem não corresponde ao arquivo informado.');
    const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[input.mime];
    const path='house-crests/'+data.houseId+'/'+crypto.randomUUID()+'.'+ext;
    const uploaded=await db.storage.from('campaign-images').upload(path,bytes,{upsert:false,contentType:input.mime,cacheControl:'3600'});
    if(uploaded.error)throw new Error('Não foi possível guardar o brasão privado.');
    next.identity={...state.identity,crestPath:path};
    rule='Cormyr · importação de imagem de brasão (privada, vinculada à ficha e auditada)';
  }
  if(data.action==='domain') {const domain=z.object({id:z.string().uuid(),name:z.string().min(1).max(160),notes:z.string().max(4000)}).parse(args);if(state.domains.some(d=>d.id===domain.id))throw new Error('Domínio já cadastrado.');next.domains.push({...domain,terrain:'',features:[]});}
  if(data.action==='domain_edit'){
    const input=z.object({id:z.string(),name:z.string().trim().min(1).max(160),notes:z.string().max(4000)}).parse(args);
    const d=next.domains.find(d=>d.id===input.id);if(!d)throw new Error('Domínio não encontrado.');
    d.name=input.name;d.notes=input.notes;rule='Correção de nome e notas do domínio, sem alterar posses';
  }
  if(data.action==='domain_delete'){
    const {id}=z.object({id:z.string()}).parse(args);
    if(state.phase!=='draft')throw new Error('A exclusão de domínio só é permitida na criação; em campanha exige conciliação auditada.');
    const d=state.domains.find(d=>d.id===id);if(!d)throw new Error('Domínio não encontrado.');
    if(state.holdings.some(h=>h.domainId===id)||state.units.some(u=>u.domainId===id))
      throw new Error('O domínio possui bens ou tropas; não pode ser excluído.');
    next.domains=next.domains.filter(d=>d.id!==id);rule='Exclusão de domínio vazio na criação';
  }
  if(data.action==='purchase') {
    const purchaseArgs=z.object({id:z.string().uuid(),itemId:z.string(),domainId:z.string(),name:z.string().max(160),parentId:z.string().optional(),supportId:z.string().optional(),replaceId:z.string().optional(),weaponSpecialty:z.enum(['fighting','marksmanship']).optional()}).parse(args);
    const overrides=await db.from('noble_house_rule_overrides').select('definition');if(overrides.error)throw new Error('Regras indisponíveis.');
    const item=overrides.data.map(r=>catalogSchema.parse(r.definition)).find(i=>i.id===purchaseArgs.itemId)??CORE_CATALOG.find(i=>i.id===purchaseArgs.itemId);
    if(!item)throw new Error('Posse não encontrada.');
    const dice=state.phase==='active'?Array.from({length:item.duration.dice??0},()=>(crypto.getRandomValues(new Uint32Array(1))[0]??0)%(item.duration.sides??6)+1):[];
    next=purchase(state,item,{...purchaseArgs,dice});rule=item.source+' · '+item.section+' · '+item.version;
  }
  if(data.action==='unit') {const parsed=unitSchema.parse(args['unit']);if(parsed.types.length>1&&!admin)throw new Error('O Narrador precisa confirmar a adaptação dos tipos mistos.');const unit=equipUnit({...parsed,costs:[],xp:0,equipment:[]});next=createUnit(state,unit,UNIT_TYPES);if(parsed.commanderName&&!next.court.some(c=>c.name===parsed.commanderName))next.court.push({id:crypto.randomUUID(),name:parsed.commanderName,role:'Comandante de Exército',notes:'Comandante gerado na tropa'});rule='Livro básico · Tipos mistos e tabelas10-1/10-2';}
  if(data.action==='siege'){next=buySiege(state,z.object({id:z.string().uuid(),itemId:z.string(),engineerId:z.string(),carrierId:z.string(),domainId:z.string(),name:z.string().max(160)}).parse(args));rule='Livro básico · Cerco e operadores,pp.223–230';}
  if(data.action==='siege_state'){
    if(!admin)throw new Error('Reatribuição e baixa de equipamento de cerco requerem o Narrador.');
    if(data.explanation.trim().length<10)throw new Error('Registre a decisão de cerco.');
    const input=z.object({id:z.string(),engineerId:z.string(),carrierId:z.string(),destroyed:z.boolean()}).parse(args);
    next=changeSiegeAssignment(state,input);rule='Cerco: '+(input.destroyed?'destruição permanente':'mudança de operadores')+' auditada';
  }
  if(data.action==='unit_state'){const input=z.object({unitId:z.string(),mounted:z.boolean(),atHome:z.boolean(),health:z.number(),casualties:z.number().int(),situation:z.string().max(1000),commanderName:z.string().trim().max(160).optional(),domainId:z.string().optional(),disband:z.boolean().optional()}).parse(args);next=changeUnitState(state,input);if(input.commanderName&&!next.court.some(c=>c.name===input.commanderName))next.court.push({id:crypto.randomUUID(),name:input.commanderName,role:'Comandante de Exército',notes:'Comandante gerado na tropa'});rule='Livro básico · Condição, cavalaria e guarnição';}
  if(data.action==='unit_edit'){
    const input=z.object({unitId:z.string(),name:z.string().trim().min(1).max(160),origin:z.string().max(160),
      situation:z.string().max(1000),notes:z.string().max(4000),skills:unitSchema.shape.skills,
      extraSkills:unitSchema.shape.extraSkills, mount:unitSchema.shape.mount.optional()}).parse(args);
    next=editUnitProfile(state,input);
    rule='Guerra dos Tronos RPG · edição de unidade e habilidades, 20 XP por graduação e déficit registrado';
  }
  if(data.action==='grant_unit_xp'){
    if(!admin)throw new Error('Somente o Narrador concede XP às unidades.');
    const input=z.object({unitId:z.string(),amount:z.number().int().min(1).max(1000),
      reason:z.string().trim().min(10).max(1000)}).parse(args);
    next=grantUnitXp(state,input);
    data.explanation=input.reason;
    rule='Cormyr · prêmio de experiência livre pelo Narrador, sem alterar treinamento nem habilidades';
  }
  if(data.action==='military_config'){
    const input=z.object({holdingId:z.string(),kind:z.enum(['skill','unit','type']),value:z.string().max(160)}).parse(args);
    const h=next.holdings.find(h=>h.id===input.holdingId&&h.status==='active');
    if(!h||!activeHoldings(state).some(x=>x.id===h.id))throw new Error('Posse militar ativa não encontrada.');
    if(input.kind==='skill'){
      if(h.itemId!=='pros-military-academy--core-training')throw new Error('Esta posse não permite selecionar habilidade.');
      const newSkill=z.enum(['agility','athletics','awareness','endurance','fighting','marksmanship','stealth','cunning','healing','animalHandling','warfare','survival']).parse(input.value);
      if(h.militarySkill&&h.militarySkill!==newSkill&&!admin)throw new Error('Somente o Narrador pode mudar a habilidade já designada.');
      h.militarySkill=newSkill;
    }else if(input.kind==='type'){
      if(h.itemId!=='pros-master-of-arms--field-master')throw new Error('Especialidade inválida para esta posse.');
      if(!UNIT_TYPES.some(t=>t.id===input.value))throw new Error('Tipo de unidade não encontrado.');
      if(h.militaryTypeId&&h.militaryTypeId!==input.value&&!admin)throw new Error('Somente o Narrador pode trocar a especialização de Mestre de Campo.');
      h.militaryTypeId=input.value;
    }else{
      if(!['pros-trading-inn','pros-abbey--warrior-brotherhood'].includes(h.itemId))throw new Error('A posse não permite designar uma unidade.');
      if(input.value&&!next.units.some(u=>u.id===input.value&&!u.destroyed&&u.domainId===h.domainId))throw new Error('Unidade não pertence ao domínio da posse.');
      h.militaryUnitId=input.value||undefined;
    }
    rule='Configuração auditada de bônus militar: '+h.name+' · '+input.kind+' '+input.value;
  }
  if(data.action==='war_hounds'){
    const input=z.object({unitId:z.string(),holdingId:z.string()}).parse(args);
    const unit=next.units.find(u=>u.id===input.unitId&&!u.destroyed);
    const h=activeHoldings(state).find(h=>h.id===input.holdingId&&h.itemId==='pros-dog-kennels--war-hounds');
    if(!unit||!h)throw new Error('Unidade ou Cães de Guerra indisponíveis.');
    if(unit.types.includes('warships')||(unit.types.includes('cavalry')&&unit.mounted!==false))throw new Error('Cães de Guerra exigem unidade não montada e não naval.');
    if(unit.warHoundsHoldingId)throw new Error('Unidade já equipada com cães de guerra.');
    if(balances(state).available.wealth<2)throw new Error('Sem recursos: exigem 2 Riqueza para equipar os cães.');
    unit.warHoundsHoldingId=h.id;unit.costs.push({resource:'wealth',amount:2,mode:'permanent'});
    next.permanent.wealth-=2;
    rule='Cães de Guerra equipados na unidade por 2 Riqueza permanente · '+h.name;
  }
  if(data.action==='broad_training'){
    const input=z.object({unitId:z.string(),skill:z.enum(['agility','athletics','awareness','endurance','fighting','marksmanship','stealth','cunning','healing','animalHandling','warfare','survival'])}).parse(args);
    if(!activeHoldings(state).some(h=>h.itemId==='pros-military-academy--broad-training'))throw new Error('Treinamento Amplo não está ativo.');
    const unit=next.units.find(u=>u.id===input.unitId&&!u.destroyed);
    if(!unit||unit.broadTrainingSkill)throw new Error('Unidade indisponível ou já treinada.');
    if(unitAllowedSkills(unit).has(input.skill))throw new Error('Escolha a quarta habilidade fora das disponíveis originalmente.');
    unit.broadTrainingSkill=input.skill;
    next.actions.push({month:state.month,type:'broad_training',notes:unit.name+' · Treinamento Amplo: '+input.skill});
    rule='Ação da Casa: Treinamento Amplo concede quarta habilidade elegível à unidade';
  }
  if(data.action==='military_rename'){
    const input=z.object({holdingId:z.string(),name:z.string().min(2).max(160)}).parse(args);
    next=renameMilitaryHolding(state,input);
    rule='Cormyr · nome de instalação militar sem alteração de custo, efeitos ou alocações';
  }
  if(data.action==='train_unit'){
    // Players with house editing rights may invest their own Power in training; the Narrator grants independent XP.
    if(state.phase!=='active')throw new Error('Treinamento exige campanha ativa.');
    if(data.explanation.trim().length<10)throw new Error('Justifique o treinamento.');
    const {unitId}=z.object({unitId:z.string()}).parse(args);
    next=trainUnit(state,unitId);rule='Treinamento auditado da unidade; Poder adicional alocado';
  }
  if(data.action==='survivors'){const input=z.object({id:z.string().uuid(),unitId:z.string(),roll:z.number().int(),condition:z.enum(SURVIVOR_CONDITIONS),disorganizations:z.number().int().nonnegative(),skills:unitSchema.shape.skills,justification:z.string().min(1)}).parse(args);next=resolveSurvivors(state,input);rule='Livro básico · tabela10-6 Sobreviventes';}
  if(['vassal','vassal_approve','vassal_npcs'].includes(data.action)){
    const ids=npcIdsSchema.parse(args['npcIds']??(data.action==='vassal_approve'?state.vassals?.find(v=>v.id===args['id'])?.npcIds??[]:[]));
    const records=ids.length?await context.supabase.from('campaign_records').select('id,house_id,kind,title,content').eq('house_id',data.houseId).in('id',ids):{data:[],error:null};
    if(records.error)throw new Error('Não foi possível conferir os NPCs.');
    const npcIds=validateVassalNpcs(data.houseId,ids,records.data??[]);
    if(data.action==='vassal'){const input=z.object({id:z.string().uuid(),houseId:z.string(),notes:z.string().min(1).max(4000)}).parse(args);const h=await context.supabase.from('campaign_houses').select('name').eq('id',input.houseId).maybeSingle();const catalogHouse=h.data?null:await context.supabase.from('house_catalog').select('name').eq('id',input.houseId).maybeSingle();const name=h.data?.name??catalogHouse?.data?.name;if(!name)throw new Error('Casa oficial não encontrada.');next=attachVassal(state,{...input,name,npcIds});rule='Vassalagem imediata · 20/10/5 Poder; sem acesso à ficha da outra casa';}
    else if(data.action==='vassal_approve'){const input=z.object({id:z.string(),influencePenalty:z.number().int().nonnegative()}).parse(args);if(!data.explanation.trim())throw new Error('Registre a decisão de vínculo e Influência.');next=linkVassalNpcs(approveVassal(state,input.id,input.influencePenalty),input.id,npcIds);const v=next.vassals?.find(v=>v.id===input.id);if(v){v.approvalNote=data.explanation;v.approvedBy=context.userId;}rule='Livro básico · Brasões vassalos20/10/5Poder; decisão e NPCs confirmados pelo Narrador';}
    else{const id=z.string().parse(args['id']);if(!data.explanation.trim())throw new Error('Registre a decisão de alteração dos NPCs.');next=linkVassalNpcs(state,id,npcIds);rule='Referências a NPCs existentes alteradas pelo Narrador; sem duplicação ou novo custo';}
  }
  if(data.action==='vassal_end'){
    if(!admin)throw new Error('Encerrar a vassalagem exige decisão do Narrador.');
    if(data.explanation.trim().length<10)throw new Error('Justificativa de rompimento necessária.');
    const {id,forfeitPower}=z.object({id:z.string(),forfeitPower:z.boolean().default(false)}).parse(args);
    next=endVassal(state,id,data.explanation,forfeitPower);
    rule='Rompimento auditado: '+(forfeitPower?'perda permanente':'liberação')+' de Poder e término da penalidade de Influência';
  }
  if(data.action==='vassal_loyalty'){
    if(!admin)throw new Error('Somente o Narrador determina lealdade.');
    const input=z.object({id:z.string(),loyalty:z.enum(['loyal','neutral','rebellious'])}).parse(args);
    next=setVassalLoyalty(state,input.id,input.loyalty,data.explanation);
    rule='Lealdade da vassala: '+input.loyalty+'; decisão narrativa auditada';
  }
  if(data.action==='vassal_create'){
    const input=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(160),region:z.string().min(1).max(100),motto:z.string().max(500),lordName:z.string().max(160)}).parse(args);
    const {randomInt}=await import('node:crypto');const rolls=Object.fromEntries(RESOURCE_KEYS.map(r=>[r,Array.from({length:5},()=>randomInt(1,7))])) as Record<Resource,number[]>;
    next=createVassal(state,input,rolls);rule='Vassala · cinco d6 registrados por recurso; custo 20/10/5 Poder da suserana';
  }
  if(data.action==='vassal_domain'||data.action==='vassal_purchase'){
    const id=z.string().parse(args['vassalId']),v=next.vassals?.find(v=>v.id===id&&v.status==='approved');if(!v?.sheet)throw new Error('Mini-ficha indisponível.');
    if(data.action==='vassal_domain'){const d=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(160)}).parse(args);if(v.sheet.domains.some(x=>x.id===d.id))throw new Error('Domínio já cadastrado.');v.sheet.domains.push({...d,terrain:'',features:[],notes:''});}
    else{const input=z.object({itemId:z.string(),id:z.string().uuid(),domainId:z.string(),name:z.string().max(160),parentId:z.string().optional(),supportId:z.string().optional()}).parse(args);const custom=await db.from('noble_house_rule_overrides').select('definition').eq('id',input.itemId).maybeSingle();if(custom.error)throw new Error('Catálogo indisponível.');const item=custom.data?catalogSchema.parse(custom.data.definition):CORE_CATALOG.find(i=>i.id===input.itemId);if(!item)throw new Error('Posse não encontrada.');const result=purchase(vassalState(next,v),item,{...input,dice:[]});v.sheet.holdings=result.holdings;v.sheet.permanent=result.permanent;v.sheet.domains=result.domains;}
    rule='Mini-ficha da vassala · recursos independentes da suserana';
  }
  if(data.action==='court') {const member=z.object({id:z.string().uuid(),npcId:z.string().uuid(),role:z.string().min(1).max(160),notes:z.string().max(4000)}).parse(args);const record=await context.supabase.from('campaign_records').select('house_id,kind,title,content,visibility').eq('id',member.npcId).single();if(record.error)throw new Error('Integrante da Corte indisponível.');validateCourtRecord(data.houseId,record.data);if(!isNarrativeNpc(record.data))throw new Error('Selecione um NPC narrativo, não uma ficha técnica.');next=assignCourt(state,{...member,name:record.data.visibility==='house'?record.data.title:'Integrante restrito'});rule='Corte · cargo ligado a registro existente, sem copiar personagem';}
  if(data.action==='court_remove'){const {id}=z.object({id:z.string().uuid()}).parse(args);next=removeCourtAssignment(state,id);rule='Corte · vínculo removido; personagem e histórico preservados';}
  if(data.action==='return_to_draft'){if(state.phase!=='review')throw new Error('A criação não está em revisão.');if(data.explanation.trim().length<5)throw new Error('Registre o motivo da devolução.');next.phase='draft';}
  if(data.action==='clear_pending'){const {indices}=z.object({indices:z.array(z.number().int().nonnegative()).min(1)}).parse(args);if(data.explanation.trim().length<10)throw new Error('Registre como as pendências foram resolvidas.');if(indices.some(i=>i>=state.pending.length))throw new Error('Pendência indisponível.');data.explanation+=' · Resolvidas: '+indices.map(i=>state.pending[i]).join('; ');next.pending=state.pending.filter((_,i)=>!indices.includes(i));}
  if(data.action==='submit'){
    if(state.phase!=='draft')throw new Error('Criação já enviada.');
    if(state.method==='budget'&&state.budget===null)
      throw new Error('Escolha o método tradicional (7d6) ou obtenha autorização para point buy.');
    if(state.method==='roll'&&state.rolls.length!==RESOURCE_KEYS.length)
      throw new Error('Registre todas as sete rolagens iniciais da Casa.');
    if(!state.domains.length)throw new Error('Adicione ao menos um domínio.');
    if(!state.regionalApplied&&state.method!=='import')throw new Error('Revise os recursos.');
    if(state.creationHistory&&!state.creationHistory.applied&&state.creationHistory.events.length!==state.creationHistory.limit)
      throw new Error('Registre todos os eventos históricos previstos antes de enviar.');
    if(!state.creationHistory?.applied||!state.creationBonusesApplied){
      const history=historyAdjustments(state),bonuses=memberBonusAdjustments(state);
      for(const r of RESOURCE_KEYS)next.permanent[r]+=history[r]+bonuses[r];
      if(state.creationHistory)next.creationHistory={...state.creationHistory,applied:true};
      next.creationBonusesApplied=true;
    }
    next.phase='review';
  }
  if(data.action==='approve'){if(state.phase!=='review')throw new Error('Envie a criação para revisão primeiro.');if(state.pending.length)throw new Error('Resolva as pendências de conciliação.');next.phase='active';}
  if(data.action==='sync_calendar'){
    if(!admin)throw new Error('Somente o Narrador pode conciliar o calendário de uma Casa.');
    const response=await context.supabase.rpc('get_campaign_calendar');
    if(response.error||!response.data)throw new Error('Calendário global indisponível; conciliação cancelada.');
    const calendar=response.data as {year:number;month:number};
    next=reconcileHouseCalendar(state,calendar,data.explanation);
    rule='Conciliação auditada com o mês global de Harptos '+calendarMonthIndex(calendar)+'; obras conferidas; sem retrocesso';
  }
  if(data.action==='alternative'){if(state.phase!=='active')throw new Error('A casa precisa estar ativa.');next=alternativeFortune(state,z.enum(RESOURCE_KEYS).parse(args['resource']) as Resource);}
  if(data.action==='condition'){
    if(!admin&&state.phase==='active')throw new Error('A baixa em campanha exige decisão do Narrador.');
    const input=z.object({id:z.string(),status:z.enum(['destroyed','abandoned','sold','cancelled'])}).parse(args);
    if(state.phase==='active'&&data.explanation.trim().length<10)
      throw new Error('O Narrador deve justificar a baixa em campanha.');
    next=changeHoldingCondition(state,input.id,input.status);
    rule=input.status==='destroyed'?
      'Livro básico · perda permanente do investimento na posse destruída (sem restituição)':
      'Livro básico · liberação da alocação por baixa auditada, sem reembolsar custos permanentes';
  }
  if(data.action==='restore_legacy_effects'){
    if(!admin)throw new Error('A restauração dos benefícios legados exige o Narrador.');
    if(data.explanation.trim().length<10)throw new Error('Justifique a conciliação dos benefícios legados.');
    const ids=z.array(z.string().min(1)).min(1).max(500).parse(args['holdingIds']);
    if(new Set(ids).size!==ids.length)throw new Error('Posse repetida na conciliação.');
    const candidates=legacyEffectCandidates(state);
    if(ids.some(id=>!candidates.some(h=>h.id===id)))
      throw new Error('Posse sem correspondência segura no catálogo: nenhuma ficha foi alterada.');
    next.holdings=state.holdings.map(h=>ids.includes(h.id)?{...h,effects:structuredClone(legacyCatalogEffects(h))}:h);
    rule='Conciliação de benefícios importados · correspondência explícita de itemId com catálogo versionado da aplicação';
  }
  if(data.action==='fortune'){const input=z.object({status:z.number().int(),testDice:z.array(z.number().int()),bonusDice:z.array(z.number().int()),modifier:z.number(),resource:z.enum(RESOURCE_KEYS),changes:resourcesSchema,fortuneStackDice:z.array(z.number().int().min(1).max(6)).optional(),resourceStackDice:z.record(z.enum(RESOURCE_KEYS),z.array(z.number().int().min(1).max(6))).optional(),justification:z.string().min(1)}).parse(args);next=confirmFortune(state,input);rule='Livro básico · tabela 6-18';}
  if(data.action==='convert'){const input=z.object({from:z.enum(RESOURCE_KEYS),to:z.enum(RESOURCE_KEYS),amount:z.number().int().positive(),rushed:z.boolean(),rate:z.number().positive().optional()}).parse(args);if(state.phase!=='active')throw new Error('Casa não ativa.');next=convertResources(state,input.from,input.to,input.amount,input.rushed,input.rate);rule='Livro básico · tabela 6-19; ação mensal compartilhada';}
  if(data.action==='action'){
    if(state.phase!=='active')throw new Error('Casa não ativa.');
    const input=z.object({type:z.string().min(1).max(100),notes:z.string().min(1).max(4000),scale:z.enum(['local','regional','grand']).optional(),competitions:z.number().int().min(1).max(30).optional()}).parse(args);
    if(state.actions.some(a=>a.month===state.month))throw new Error('A Casa já utilizou sua ação mensal (inclusive conversões).');
    if(input.type==='Torneio'){
      if(!input.scale||!input.competitions)throw new Error('Informe porte e competições do torneio.');
      const {randomInt}=await import('node:crypto');
      const sides=input.scale==='local'?1:input.scale==='regional'?3:6;
      const roll=randomInt(1,sides+1);
      next=runTournament(state,input.scale,input.competitions,roll,input.notes);
      rule='Livro básico pp. 155–156 · torneio '+input.scale+'; Influência rolada '+roll;
    } else {next.actions.push({month:state.month,type:input.type,notes:input.notes});rule='Livro básico p. 153 · ação mensal auditada';}
  }
  if(data.action==='roll'){
    if(state.phase!=='draft'||state.rolls.length||state.method==='import'||state.importSources.length)
      throw new Error('Rolagens já registradas, importadas ou criação encerrada.');
    if(!admin&&!(state.method==='roll'||(state.method==='budget'&&state.budget===null&&
       RESOURCE_KEYS.every(r=>state.base[r]===0)&&!state.holdings.length&&!state.units.length)))
      throw new Error('Método por orçamento autorizado; somente o Narrador pode alterá-lo.');
    const {randomInt}=await import('node:crypto');
    next.method='roll';next.budget=null;
    next.rolls=RESOURCE_KEYS.map(()=>Array.from({length:7},()=>randomInt(1,7)));
    RESOURCE_KEYS.forEach((r,i)=>{next.base[r]=(next.rolls[i]??[]).reduce((a,b)=>a+b,0);});
    next.regionalApplied=true;rule='Livro básico · 7d6 por recurso, p. 126 · rolagem imutável';
  }
  if(data.action==='foundation_roll'){
    if(state.phase!=='draft'||state.method==='import'||state.importSources.length||state.creationHistory)
      throw new Error('Fundação já registrada, importada ou criação encerrada.');
    const {randomInt}=await import('node:crypto');
    const history=rollFoundation(()=>randomInt(1,7));
    next.creationHistory=history;
    if(next.identity.foundation===undefined)next.identity.foundation=historicalFoundationYear(history.foundationRoll);
    rule='Livro básico · tabela 6-3 · fundação e número de eventos registrados';
  }
  if(data.action==='history_roll'){
    const history=state.creationHistory;
    if(state.phase!=='draft'||state.method==='import'||state.importSources.length||
       !history||history.applied||history.events.length>=history.limit)
      throw new Error('Rolagem de evento indisponível, completa ou criação importada.');
    const input=z.object({infrastructure:z.tuple([z.enum(RESOURCE_KEYS),z.enum(RESOURCE_KEYS)])}).parse(args);
    if(input.infrastructure[0]===input.infrastructure[1])throw new Error('Escolha dois recursos distintos para Infraestrutura.');
    const {randomInt}=await import('node:crypto');
    const result=rollHistoricalEvent(()=>randomInt(1,7),input.infrastructure,crypto.randomUUID());
    next.creationHistory={...history,events:[...history.events,result]};
    rule='Livro básico · tabela 6-4 · 3d6 e modificadores por recurso (piso zero)';
  }
  if(data.action==='member_bonus'){
    if(state.phase!=='draft'||state.method==='import'||state.importSources.length||
       state.creationBonusesApplied)
      throw new Error('Bônus pessoal disponível apenas durante a criação não importada.');
    const input=z.object({resource:z.enum(RESOURCE_KEYS)}).parse(args);
    const member=await db.from('campaign_players').select('id').eq('user_id',context.userId)
      .eq('active',true).eq('require_password_change',false).maybeSingle();
    if(member.error||!member.data)throw new Error('Somente um jogador cadastrado pode contribuir com o bônus.');
    const playerId=member.data.id;
    const authorized=await db.from('house_memberships').select('player_id').eq('player_id',playerId)
      .eq('house_id',data.houseId).maybeSingle();
    if(authorized.error||!authorized.data)throw new Error('Jogador não pertence a esta casa.');
    if((state.creationBonuses??[]).some(b=>b.playerId===playerId))
      throw new Error('Cada jogador pode aplicar seu bônus apenas uma vez.');
    const {randomInt}=await import('node:crypto');
    next.creationBonuses=[...(state.creationBonuses??[]),{playerId,resource:input.resource,die:randomInt(1,7)}];
    rule='Livro básico · ajuste inicial de jogador vinculado, +1d6 auditado';
  }
  if(data.action==='equipment'){const input=z.object({unitId:z.string(),category:z.enum(['armor','fighting','marksmanship'])}).parse(args);next=improveEquipment(state,input.unitId,input.category);rule='Livro básico · tabelas10-1/10-2; 1 Riqueza permanente por categoria, limite uma';}
  if(data.action==='correct') {
    if(!admin)throw new Error('Correção de recursos exclusiva do Narrador.');
    if(data.explanation.trim().length<10)throw new Error('Justificativa auditada exige pelo menos dez caracteres.');
    const changes=resourcesSchema.parse(args['changes']);
    if(RESOURCE_KEYS.every(r=>changes[r]===0))throw new Error('Indique ao menos uma alteração.');
    for(const r of RESOURCE_KEYS)next.permanent[r]+=changes[r];
    rule='Correção ou estorno de recursos auditado pelo Narrador · variação: '+JSON.stringify(changes);
  }
  if(data.action==='reconcile_legacy_costs') {
    if(!admin)throw new Error('Conciliação legada exclusiva do Narrador.');
    if(data.explanation.trim().length<10)throw new Error('Justifique a conferência da fonte histórica.');
    const ids=z.array(z.string().min(1)).min(1).max(6).parse(args['ids']);
    const candidates=legacyCostIssues(state,official.data.name);
    if(ids.some(id=>!candidates.some(row=>row.id===id)))
      throw new Error('Divergência entre a ficha e a fonte legada. Nada foi alterado.');
    next=reconcileLegacyCosts(state,official.data.name,ids);
    rule='Conciliação pontual da auditoria 16; itens '+ids.join(', ')+
      '; antes '+JSON.stringify(balances(state))+'; depois '+JSON.stringify(balances(next));
  }
  if(data.action==='treasury_deposit') {
    if(!admin)throw new Error('Somente o Narrador credita ouro no cofre.');
    const input=z.object({coins:z.number().int().positive().max(1_000_000),source:z.string().trim().min(6).max(500)}).parse(args);
    if(data.explanation.trim().length<10)throw new Error('Registre a origem das moedas e a aprovação.');
    next=depositGold(state,input.coins);
    rule='Cofre da Casa · '+input.coins+' DO creditados com comprovação '+input.source;
  }
  if(data.action==='donate_gold') {
    if(state.phase!=='active')throw new Error('Doações em campanha exigem Casa ativa.');
    const input=z.object({points:z.number().int().min(1).max(10000)}).parse(args);
    next=donateGold(state,input.points);
    rule='Livro básico p. 153 · '+(input.points*200)+' DO gastos do cofre = +'+input.points+' Riqueza permanente';
  }
  if(data.action==='donate_glory') {
    if(!admin)throw new Error('Glória individual exige verificação e aprovação do Narrador.');
    if(state.phase!=='active')throw new Error('Doações em campanha exigem Casa ativa.');
    const input=z.object({resource:z.enum(RESOURCE_KEYS),points:z.number().int().min(1).max(100),
      character:z.string().trim().min(2).max(160),source:z.string().trim().min(8).max(500)}).parse(args);
    if(data.explanation.trim().length<10)throw new Error('Documente o gasto de Glória pelo personagem.');
    next=donateGlory(state,input.resource,input.points);
    rule='Livro básico p. 153 · '+input.points+' Glória de '+input.character+' ('+input.source+') = +'+input.points+' '+input.resource+' permanente; consumo individual deve constar na ficha do personagem';
  }
  if(data.action==='spend_influence') {
    const input=z.object({kind:z.enum(['fortune','intrigue'])}).parse(args);
    next=spendInfluence(state,input.kind,data.key);
    rule=input.kind==='fortune'?'Livro básico p. 134 · 5 Influência permanentes por +1D no teste da Sorte do mês':
      'Livro básico p. 134 · 2 Influência permanentes por 1B em um teste de Intriga; vale pendente de uso';
  }
  if(data.action==='redeem_intrigue') {
    const input=z.object({benefitId:z.string().uuid()}).parse(args);
    if(data.explanation.trim().length<10)throw new Error('Registre qual Intriga utilizou o dado de bônus.');
    next=redeemIntrigueBonus(state,input.benefitId);
    rule='Livro básico p. 134 · 1B de Intriga resgatado, sem novo custo';
  }
  if(data.action==='import') {
    if(state.phase!=='draft'||state.holdings.length||state.units.length)throw new Error('Importação sobre ficha com compras exige conciliação específica; nada foi sobrescrito.');
    const input=z.object({source:z.string().min(1).max(500),sourceHouse:z.string().min(1),resources:resourcesSchema,issues:z.array(z.string()).max(200),decisions:z.string().min(10).max(10000),events:z.array(z.string()).max(100),original:z.array(z.object({name:z.string(),rows:z.array(z.array(z.object({address:z.string(),value:z.unknown(),formula:z.string().optional()})))})).max(20)}).parse(args);
    const officialName=await context.supabase.from('campaign_houses').select('name').eq('id',data.houseId).single();
    const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
    if(officialName.error||normalize(input.sourceHouse)!==normalize(officialName.data.name))throw new Error('A casa da planilha não corresponde à casa oficial selecionada.');
    if(state.importSources.includes(input.source))throw new Error('Esta fonte já foi conciliada; nenhuma duplicação.');
    next.method='import';next.regionalApplied=false;next.base=input.resources;next.identity.history=input.events.filter(e=>!/^b[oô]nus$/i.test(e.trim()));next.importSources.push(input.source);
    next.pending=input.issues;next.identity.notes+='\nConciliação: '+input.decisions;
    rule='Snapshot legado conciliado · '+input.source+' · originais preservados no lançamento';
    data.explanation=input.decisions+'\nFontes: '+input.source+'\nAbas originais: '+JSON.stringify(input.original);
  }
  if(data.action==='undo'){
    if(state.phase!=='draft')throw new Error('Somente rascunhos podem ser desfeitos.');
    const recent=await db.from('noble_house_ledger').select('before_state,action')
      .eq('house_id',data.houseId).order('version',{ascending:false}).limit(500);
    if(recent.error)throw new Error('Não foi possível consultar o histórico.');
    const target=selectUndoSnapshot(recent.data??[]);
    const prior=target.before_state as unknown as HouseState;
    if(prior.schemaVersion!==1)throw new Error('Versão histórica incompatível, sem alteração.');
    next=prior;rule='Cormyr · desfazer em pilha de rascunhos, histórico preservado';
  }
  validateResources(next.base);validateResources(next.permanent);
  if(RESOURCE_KEYS.some(r=>balances(next).available[r]<0)&&!['admin_edit','correct','fortune','survivors','return_to_draft','clear_pending','court','unit_state','vassal_domain','sync_calendar','reconcile_legacy_costs','donate_gold','donate_glory','spend_influence','redeem_intrigue','treasury_deposit'].includes(data.action))throw new Error('Saldo insuficiente; nenhuma alteração foi gravada.');
  const result=await db.rpc('commit_noble_house_operation',{p_actor:context.userId,p_house:data.houseId,p_version:data.version,p_key:data.key,p_action:data.action,p_state:JSON.parse(JSON.stringify(next)),p_explanation:data.explanation,p_rule:rule});
  if(result.error)throw new Error(result.error.message);
  return result.data as unknown as {state:HouseState;version:number;duplicate:boolean};
});
export const saveHouseRule=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(catalogSchema).handler(async({data,context})=>{
  const role=await context.supabase.rpc('is_campaign_admin');if(!role.data)throw new Error('Somente o Narrador edita regras.');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const current=await db.from('noble_house_rule_overrides').select('version').eq('id',data.id).maybeSingle();
  const definition:CatalogItem={...data,custom:true,version:`personalizada-${(current.data?.version??0)+1}`};
  const r=await db.from('noble_house_rule_overrides').upsert({id:data.id,definition:JSON.parse(JSON.stringify(definition)),version:(current.data?.version??0)+1,updated_by:context.userId});if(r.error)throw new Error('Não foi possível salvar a adaptação.');return {message:'Adaptação salva; custos antigos preservados.'};
});

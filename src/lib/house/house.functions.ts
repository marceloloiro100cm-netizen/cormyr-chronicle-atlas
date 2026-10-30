import {isNarrativeNpc} from './narrative-npc';
import {attachVassal,createVassal,vassalState} from './vassals';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { operationSchema, resourcesSchema, catalogSchema, unitSchema } from './schemas';
import { CORE_CATALOG } from './catalog';
import { newHouseState, RESOURCE_KEYS, type HouseState, type CatalogItem, type Unit, type Resource, type CourtMember } from './types';
import { advance, alternativeFortune, balances, createUnit, purchase, UNIT_TYPES, validateResources } from './engine';
import { confirmFortune, convertResources } from './fortune';
import { historyAdjustments, memberBonusAdjustments, historicalFoundationYear, rollFoundation, rollHistoricalEvent } from './creation-history';
import { improveEquipment } from './equipment';
import { buySiege } from './siege';
import { equipUnit, resolveSurvivors, changeUnitState, proposeVassal, approveVassal, SURVIVOR_CONDITIONS } from './military';
import { linkVassalNpcs, validateVassalNpcs } from './vassal-links';
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

    if ((s.domains?.length ?? 0) === 0 && (s.holdings?.length ?? 0) === 0 && fallbackKey && LEGACY_HOUSE_SEEDS[fallbackKey]) {
      finalState = { ...LEGACY_HOUSE_SEEDS[fallbackKey], houseId: data.houseId };
    } else {
      finalState = s;
    }
  }

  const initial=newHouseState(data.houseId,house.data.region??'');if(!finalState){const c=await db.rpc('get_campaign_calendar');const value=c.data as {year?:number;month?:number}|null;if(value?.year&&value.month!==undefined)initial.month=value.year*12+value.month;}
  return {state:finalState ?? initial,version:sheet.data?.version??0,catalog,houses:[...merged.values()].sort((a,b)=>a.name.localeCompare(b.name)),ledger:ledger.data??[],syncState:sheet.data?.sync_state??'not_configured',admin:Boolean(admin.data)};
});
export const houseOperation=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(operationSchema).handler(async({data,context})=>{
  const [role,membership]=await Promise.all([context.supabase.rpc('is_campaign_admin'),context.supabase.rpc('in_campaign_house',{h:data.houseId,edit_required:true})]);
  const admin=Boolean(role.data);if(!admin&&!membership.data)throw new Error('Edição desta casa não autorizada.');
  if(['approve','advance','import','correct','fortune','survivors','vassal_approve','vassal_npcs','return_to_draft','clear_pending'].includes(data.action)&&!admin)throw new Error('Somente o Narrador pode confirmar esta operação.');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const duplicate=await db.from('noble_house_ledger').select('after_state,version,actor,action').eq('house_id',data.houseId).eq('operation_key',data.key).maybeSingle();
  if(duplicate.error)throw new Error('Não foi possível conferir a operação.');
  if(duplicate.data){if(duplicate.data.actor!==context.userId||duplicate.data.action!==data.action)throw new Error('Chave já utilizada.');return {state:duplicate.data.after_state as unknown as HouseState,version:duplicate.data.version,duplicate:true};}
  const current=await db.from('noble_house_sheets').select('*').eq('house_id',data.houseId).maybeSingle();
  const official=await context.supabase.from('campaign_houses').select('region').eq('id',data.houseId).single();
  if(current.error||official.error)throw new Error('Casa não encontrada.');
  const state=(current.data?.state??newHouseState(data.houseId,official.data.region??'')) as unknown as HouseState;
  if(!current.data){const c=await context.supabase.rpc('get_campaign_calendar');const value=c.data as {year?:number;month?:number}|null;if(value?.year&&value.month!==undefined)state.month=value.year*12+value.month;}
  if((current.data?.version??0)!==data.version)throw new Error('A ficha mudou. Recarregue para conciliar as versões.');
  let next=structuredClone(state),rule='Cormyr · gestão auditada';const args=data.args;
  if(state.phase==='review'&&!['approve','correct','return_to_draft','clear_pending'].includes(data.action))throw new Error('Criação em revisão; aguarde aprovação ou correção do Narrador.');
  if(data.action==='draft') {
    if(state.phase==='active'||state.phase==='review')throw new Error('Criação aprovada ou em revisão não permite redistribuição livre.');
    const values=resourcesSchema.parse(args['base']);validateResources(values);
    const identity=z.object({region:z.string(),motto:z.string().max(500),foundation:z.number().int().optional(),history:z.array(z.string()).max(100),notes:z.string().max(10000)}).parse(args['identity']);
    const baseChanged=RESOURCE_KEYS.some(r=>values[r]!==state.base[r]);
    // Identity and the current wizard step are always editable in draft.
    // Resources remain locked without a Narrator-authorized budget.
    if(!admin&&baseChanged&&(state.method!=='budget'||state.budget===null))
      throw new Error('A distribuição dos recursos exige orçamento autorizado do Narrador.');
    if(!admin&&state.method!=='budget'&&baseChanged)
      throw new Error('Valores de rolagens ou importação são imutáveis.');
    next.base=state.method==='budget'?(admin||state.budget!==null?values:state.base):state.base;
    next.identity=identity;next.creationStep=z.number().int().min(0).max(10).parse(args['creationStep']);
    if(admin){next.method=z.enum(['budget','roll','import']).parse(args['method']);next.budget=z.number().nonnegative().nullable().parse(args['budget']);}
    // Never reapply a regional bonus to legacy/imported source totals.
    next.regionalApplied=next.method!=='import'&&next.importSources.length===0;
    if(next.method==='budget'&&next.budget!==null&&RESOURCE_KEYS.reduce((n,r)=>n+next.base[r],0)>next.budget)
      throw new Error('Os recursos excedem o orçamento autorizado.');
    rule='Cormyr · bônus substitutivos; criação';
  }
  if(data.action==='domain') {const domain=z.object({id:z.string().uuid(),name:z.string().min(1).max(160),notes:z.string().max(4000)}).parse(args);next.domains.push({...domain,terrain:'',features:[]});}
  if(data.action==='purchase') {
    const purchaseArgs=z.object({id:z.string().uuid(),itemId:z.string(),domainId:z.string(),name:z.string().max(160),parentId:z.string().optional(),supportId:z.string().optional()}).parse(args);
    const overrides=await db.from('noble_house_rule_overrides').select('definition');if(overrides.error)throw new Error('Regras indisponíveis.');
    const item=overrides.data.map(r=>catalogSchema.parse(r.definition)).find(i=>i.id===purchaseArgs.itemId)??CORE_CATALOG.find(i=>i.id===purchaseArgs.itemId);
    if(!item)throw new Error('Posse não encontrada.');
    const dice=state.phase==='active'?Array.from({length:item.duration.dice??0},()=>(crypto.getRandomValues(new Uint32Array(1))[0]??0)%(item.duration.sides??6)+1):[];
    next=purchase(state,item,{...purchaseArgs,dice});rule=item.source+' · '+item.section+' · '+item.version;
  }
  if(data.action==='unit') {const parsed=unitSchema.parse(args['unit']);if(parsed.types.length>1&&!admin)throw new Error('O Narrador precisa confirmar a adaptação dos tipos mistos.');const unit=equipUnit({...parsed,costs:[],xp:0,equipment:[]});next=createUnit(state,unit,UNIT_TYPES);if(parsed.commanderName&&!next.court.some(c=>c.name===parsed.commanderName))next.court.push({id:crypto.randomUUID(),name:parsed.commanderName,role:'Comandante de Exército',notes:'Comandante gerado na tropa'});rule='Livro básico · Tipos mistos e tabelas10-1/10-2';}
  if(data.action==='siege'){next=buySiege(state,z.object({id:z.string().uuid(),itemId:z.string(),engineerId:z.string(),carrierId:z.string(),domainId:z.string(),name:z.string().max(160)}).parse(args));rule='Livro básico · Cerco e operadores,pp.223–230';}
  if(data.action==='unit_state'){const input=z.object({unitId:z.string(),mounted:z.boolean(),atHome:z.boolean(),health:z.number(),casualties:z.number().int(),situation:z.string().max(1000),commanderName:z.string().trim().max(160).optional()}).parse(args);next=changeUnitState(state,input);if(input.commanderName&&!next.court.some(c=>c.name===input.commanderName))next.court.push({id:crypto.randomUUID(),name:input.commanderName,role:'Comandante de Exército',notes:'Comandante gerado na tropa'});rule='Livro básico · Condição, cavalaria e guarnição';}
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
  if(data.action==='advance')next=advance(state,z.number().int().parse(args['month']));
  if(data.action==='alternative'){if(state.phase!=='active')throw new Error('A casa precisa estar ativa.');next=alternativeFortune(state,z.enum(RESOURCE_KEYS).parse(args['resource']) as Resource);}
  if(data.action==='condition'){if(!admin&&state.phase==='active')throw new Error('A baixa em campanha exige decisão do Narrador.');const input=z.object({id:z.string(),status:z.enum(['destroyed','abandoned','sold','cancelled'])}).parse(args);const holding=next.holdings.find(h=>h.id===input.id);if(!holding)throw new Error('Posse não encontrada.');if(state.phase==='active'&&['sold','cancelled'].includes(input.status))throw new Error('Restituição exige correção auditada do Narrador; não é automática.');holding.status=input.status;}
  if(data.action==='fortune'){const input=z.object({status:z.number().int(),testDice:z.array(z.number().int()),bonusDice:z.array(z.number().int()),modifier:z.number(),resource:z.enum(RESOURCE_KEYS),changes:resourcesSchema,fortuneStackDice:z.array(z.number().int().min(1).max(6)).optional(),resourceStackDice:z.record(z.enum(RESOURCE_KEYS),z.array(z.number().int().min(1).max(6))).optional(),justification:z.string().min(1)}).parse(args);next=confirmFortune(state,input);rule='Livro básico · tabela 6-18';}
  if(data.action==='convert'){const input=z.object({from:z.enum(RESOURCE_KEYS),to:z.enum(RESOURCE_KEYS),amount:z.number().positive(),rushed:z.boolean(),rate:z.number().positive().optional()}).parse(args);if(state.phase!=='active')throw new Error('Casa não ativa.');next=convertResources(state,input.from,input.to,input.amount,input.rushed,input.rate);rule='Livro básico · tabela 6-19';}
  if(data.action==='action'){if(state.phase!=='active')throw new Error('Casa não ativa.');const input=z.object({type:z.string().min(1).max(100),notes:z.string().min(1).max(4000)}).parse(args);if(state.actions.some(a=>a.month===state.month&&!a.type.startsWith('convert:')))throw new Error('A ação mensal já foi registrada.');next.actions.push({month:state.month,...input});}
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
    const authorized=await db.from('house_memberships').select('player_id').eq('player_id',member.data.id)
      .eq('house_id',data.houseId).maybeSingle();
    if(authorized.error||!authorized.data)throw new Error('Jogador não pertence a esta casa.');
    if((state.creationBonuses??[]).some(b=>b.playerId===member.data.id))
      throw new Error('Cada jogador pode aplicar seu bônus apenas uma vez.');
    const {randomInt}=await import('node:crypto');
    next.creationBonuses=[...(state.creationBonuses??[]),{playerId:member.data.id,resource:input.resource,die:randomInt(1,7)}];
    rule='Livro básico · ajuste inicial de jogador vinculado, +1d6 auditado';
  }
  if(data.action==='equipment'){const input=z.object({unitId:z.string(),category:z.enum(['armor','fighting','marksmanship'])}).parse(args);next=improveEquipment(state,input.unitId,input.category);rule='Livro básico · tabelas10-1/10-2; 1 Riqueza permanente por categoria, limite uma';}
  if(data.action==='correct') {if(!data.explanation.trim())throw new Error('Registre a justificativa.');const changes=resourcesSchema.parse(args['changes']);for(const r of RESOURCE_KEYS)next.permanent[r]+=changes[r];}
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
  if(data.action==='undo'){if(state.phase!=='draft')throw new Error('Somente rascunhos podem ser desfeitos.');const last=await db.from('noble_house_ledger').select('before_state,action').eq('house_id',data.houseId).order('version',{ascending:false}).limit(1).single();if(last.error||!last.data.before_state||last.data.action==='undo')throw new Error('Nada para desfazer.');const prior=last.data.before_state as unknown as HouseState;next=prior.schemaVersion===1?prior:newHouseState(data.houseId,official.data.region??'');}
  validateResources(next.base);validateResources(next.permanent);
  if(RESOURCE_KEYS.some(r=>balances(next).available[r]<0)&&!['correct','fortune','survivors','return_to_draft','clear_pending','court','unit_state','vassal_domain'].includes(data.action))throw new Error('Saldo insuficiente; nenhuma alteração foi gravada.');
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

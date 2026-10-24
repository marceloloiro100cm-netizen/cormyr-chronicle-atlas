import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { operationSchema, resourcesSchema, catalogSchema, unitSchema } from './schemas';
import { CORE_CATALOG } from './catalog';
import { newHouseState, RESOURCE_KEYS, type HouseState, type CatalogItem, type Unit, type Resource, type CourtMember } from './types';
import { advance, alternativeFortune, balances, createUnit, purchase, UNIT_TYPES, validateResources } from './engine';
import { confirmFortune, convertResources } from './fortune';
import { UNIT_EQUIPMENT, improveEquipment } from './equipment';
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
  return {state:(sheet.data?.state??newHouseState(data.houseId,house.data.region??'')) as unknown as HouseState,version:sheet.data?.version??0,catalog,ledger:ledger.data??[],syncState:sheet.data?.sync_state??'not_configured',admin:Boolean(admin.data)};
});
export const houseOperation=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(operationSchema).handler(async({data,context})=>{
  const [role,membership]=await Promise.all([context.supabase.rpc('is_campaign_admin'),context.supabase.rpc('in_campaign_house',{h:data.houseId,edit_required:true})]);
  const admin=Boolean(role.data);if(!admin&&!membership.data)throw new Error('Edição desta casa não autorizada.');
  if(['approve','advance','import','correct','fortune','roll'].includes(data.action)&&!admin)throw new Error('Somente o Narrador pode confirmar esta operação.');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const duplicate=await db.from('noble_house_ledger').select('after_state,version,actor,action').eq('house_id',data.houseId).eq('operation_key',data.key).maybeSingle();
  if(duplicate.error)throw new Error('Não foi possível conferir a operação.');
  if(duplicate.data){if(duplicate.data.actor!==context.userId||duplicate.data.action!==data.action)throw new Error('Chave já utilizada.');return {state:duplicate.data.after_state as unknown as HouseState,version:duplicate.data.version,duplicate:true};}
  const current=await db.from('noble_house_sheets').select('*').eq('house_id',data.houseId).maybeSingle();
  const official=await context.supabase.from('campaign_houses').select('region').eq('id',data.houseId).single();
  if(current.error||official.error)throw new Error('Casa não encontrada.');
  const state=(current.data?.state??newHouseState(data.houseId,official.data.region??'')) as unknown as HouseState;
  if((current.data?.version??0)!==data.version)throw new Error('A ficha mudou. Recarregue para conciliar as versões.');
  let next=structuredClone(state),rule='Cormyr · gestão auditada';const args=data.args;
  if(state.phase==='review'&&!['approve','correct'].includes(data.action))throw new Error('Criação em revisão; aguarde aprovação ou correção do Narrador.');
  if(data.action==='draft') {
    if(state.phase==='active'||state.phase==='review')throw new Error('Criação aprovada ou em revisão não permite redistribuição livre.');
    const values=resourcesSchema.parse(args['base']);validateResources(values);
    const identity=z.object({region:z.string(),motto:z.string().max(500),foundation:z.number().int().optional(),history:z.array(z.string()).max(100),notes:z.string().max(10000)}).parse(args['identity']);
    next.base=state.method!=="budget"?state.base:values;next.identity=identity;next.creationStep=z.number().int().min(0).max(10).parse(args['creationStep']);
    if(!admin&&(state.method!=='budget'||state.budget===null))throw new Error('O Narrador precisa autorizar o método e orçamento antes de distribuir recursos.');
    if(admin){next.method=z.enum(['budget','roll','import']).parse(args['method']);next.budget=z.number().nonnegative().nullable().parse(args['budget']);}
    next.regionalApplied=next.method!=='import';
    if(next.budget!==null&&RESOURCE_KEYS.reduce((n,r)=>n+next.base[r],0)>next.budget)throw new Error('Os recursos excedem o orçamento autorizado.');
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
  if(data.action==='unit') {if(state.phase==='active')throw new Error('Recrutamento em campanha exige projeto e regra de treino aprovada pelo Narrador.');const parsed=unitSchema.parse(args['unit']);const first=UNIT_TYPES.find(t=>t.id===parsed.types[0]);if(!first)throw new Error('Tipo inválido.');if(parsed.types.length>1)throw new Error('Unidades mistas: custo calculável, mas equipamento e disciplina exigem conciliação do Narrador.');if(first.id==='cavalry')throw new Error('Cavalaria exige ficha da montaria conciliada; não usar Vigor humano.');const unit:Unit={...parsed,costs:[],armor:first.armor??0,armorPenalty:first.penalty??0,bulk:UNIT_EQUIPMENT.find(e=>e.id===first.id)?.initial.bulk??0,strength:first.strength??100,health:parsed.skills.endurance*3,casualties:0,disciplineModifier:first.discipline,xp:0,equipment:[]};next=createUnit(state,unit,UNIT_TYPES);rule='Livro básico · Unidades';}
  if(data.action==='court') {const member=z.object({id:z.string().uuid(),npcId:z.string().uuid().optional(),name:z.string().min(1).max(160),role:z.string().min(1).max(160),notes:z.string().max(4000)}).parse(args) as CourtMember;if(member.npcId){const record=await context.supabase.from('campaign_records').select('house_id,kind').eq('id',member.npcId).single();if(record.error||record.data.house_id!==data.houseId||record.data.kind!=='character')throw new Error('NPC não pertence a esta casa.');}next.court.push(member);}
  if(data.action==='submit'){if(state.phase!=='draft')throw new Error('Criação já enviada.');if(!state.domains.length)throw new Error('Adicione ao menos um domínio.');if(!state.regionalApplied&&state.method!=='import')throw new Error('Revise os recursos.');next.phase='review';}
  if(data.action==='approve'){if(state.phase!=='review')throw new Error('Envie a criação para revisão primeiro.');if(state.pending.length)throw new Error('Resolva as pendências de conciliação.');next.phase='active';}
  if(data.action==='advance')next=advance(state,z.number().int().parse(args['month']));
  if(data.action==='alternative'){if(state.phase!=='active')throw new Error('A casa precisa estar ativa.');next=alternativeFortune(state,z.enum(RESOURCE_KEYS).parse(args['resource']) as Resource);}
  if(data.action==='condition'){if(!admin&&state.phase==='active')throw new Error('A baixa em campanha exige decisão do Narrador.');const input=z.object({id:z.string(),status:z.enum(['destroyed','abandoned','sold','cancelled'])}).parse(args);const holding=next.holdings.find(h=>h.id===input.id);if(!holding)throw new Error('Posse não encontrada.');if(state.phase==='active'&&['sold','cancelled'].includes(input.status))throw new Error('Restituição exige correção auditada do Narrador; não é automática.');holding.status=input.status;}
  if(data.action==='fortune'){const input=z.object({status:z.number().int(),testDice:z.array(z.number().int()),bonusDice:z.array(z.number().int()),modifier:z.number(),resource:z.enum(RESOURCE_KEYS),changes:resourcesSchema,fortuneStackDice:z.array(z.number().int().min(1).max(6)).optional(),resourceStackDice:z.record(z.enum(RESOURCE_KEYS),z.array(z.number().int().min(1).max(6))).optional(),justification:z.string().min(1)}).parse(args);next=confirmFortune(state,input);rule='Livro básico · tabela 6-18';}
  if(data.action==='convert'){const input=z.object({from:z.enum(RESOURCE_KEYS),to:z.enum(RESOURCE_KEYS),amount:z.number().positive(),rushed:z.boolean()}).parse(args);if(state.phase!=='active')throw new Error('Casa não ativa.');if(state.holdings.some(h=>h.status==='active'&&h.effects.some(e=>e.kind==='conversion')))throw new Error('Conversão especial requer conciliação da regra.');next=convertResources(state,input.from,input.to,input.amount,input.rushed);rule='Livro básico · tabela 6-19';}
  if(data.action==='action'){if(state.phase!=='active')throw new Error('Casa não ativa.');const input=z.object({type:z.string().min(1).max(100),notes:z.string().min(1).max(4000)}).parse(args);if(state.actions.some(a=>a.month===state.month&&!a.type.startsWith('convert:')))throw new Error('A ação mensal já foi registrada.');next.actions.push({month:state.month,...input});}
  if(data.action==='roll'){if(state.phase!=='draft'||state.rolls.length)throw new Error('Rolagens já registradas ou criação encerrada.');next.method='roll';next.rolls=RESOURCE_KEYS.map(()=>Array.from({length:7},()=>(crypto.getRandomValues(new Uint32Array(1))[0]??0)%6+1));RESOURCE_KEYS.forEach((r,i)=>{next.base[r]=(next.rolls[i]??[]).reduce((a,b)=>a+b,0);});next.regionalApplied=true;rule='Livro básico · 7d6 por recurso, p. 126';}
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
  if(RESOURCE_KEYS.some(r=>balances(next).available[r]<0)&&data.action!=='correct')throw new Error('Saldo insuficiente; nenhuma alteração foi gravada.');
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
/**
 * Pure rules of "A Folha Sem Selo" (port of SQL 0111 and 0117 to 0123):
 * edition stamp/audit triggers, state machine, read receipts, commissions with
 * the permanent Wealth debit, staff, story models, engravings, settings,
 * scheduled publication and the editor calendar. No I/O: the transactional
 * service feeds data in and persists what comes out.
 */
import {isCampaignDate} from './schedule-core.mjs';

export const STATES=new Set(['draft','published','archived','cancelled']);
export const PUBLISHED=new Set(['published','archived']);
export const TEMPLATES=new Set(['classico','guerra','gazeta']);
export const FONTS=new Set(['classico','editorial','condensado','gotica','romana']);
export const COMMISSION_STATES=new Set(['pending','published','rejected']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_SRC=/^\/newspaper\/gravuras\/[A-Za-z0-9_.-]+$/;
const FESTIVAL_ORD={midwinter:0,greengrass:3000,midsummer:6000,shieldmeet:6000,highharvestide:8000,'feast-moon':10000};
const REGION_WEALTH={crownlands:10,veilstone:15,shieldmark:10,helmlands:5,horselands:15,dragoncoast:20,
  swordmarch:15,swordmark:15,ferlin:10,stonelands:15,elfhold:15,volkumburgh:10};
export const MAX_PENDING_PER_HOUSE=3;

export class NewspaperError extends Error {
  constructor(code,message){super(message);this.name='NewspaperError';this.code=code;}
}
const fail=(code,m)=>{throw new NewspaperError(code,m);};
const trimLen=s=>typeof s==='string'?s.trim().length:-1;
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/* ------------------------------ authorization ----------------------------- */

export const foldName=s=>String(s??'').trim().toLowerCase();

/**
 * can_edit_campaign_newspaper(): administrator (Narrator) OR the active player
 * named "leonardo" whose roster house is "espiao". can_read: any active
 * player without a pending password change (editors read everything).
 */
export function newspaperScope({uid,access,player}){
  if(!access||access.userId!==uid||access.active!==true||access.requirePasswordChange===true)
    fail('denied','Acesso não autorizado');
  const admin=access.profile==='narrador'&&access.admin===true;
  const leonardo=!!player&&player.active===true&&player.requirePasswordChange!==true&&
    player.userId===uid&&foldName(player.name)==='leonardo'&&player.rosterHouseId==='espiao';
  const canEdit=admin||leonardo;
  const isPlayer=typeof access.playerId==='string'&&access.playerId.length>0;
  return {uid,admin,canEdit,canRead:canEdit||isPlayer,access,
    memberHouseIds:new Set(Array.isArray(access.memberHouseIds)?access.memberHouseIds:[]),
    editHouseIds:new Set(Array.isArray(access.editHouseIds)?access.editHouseIds:[])};
}
export const requireEditor=scope=>{if(!scope.canEdit)fail('denied','Acesso não autorizado');};
export const requireReader=scope=>{if(!scope.canRead)fail('denied','Acesso não autorizado');};

/* ------------------------------- dates ----------------------------------- */

export const isNewspaperDate=isCampaignDate;
/** newspaper_date_ordinal (0122): position of a date in the Harptos year. */
export function dateOrdinal(p){
  if(typeof p!=='string')return null;
  let m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(p);
  if(m)return Number(m[1])*100000+(Number(m[2])-1)*1000+Number(m[3])*2;
  m=/^(\d{4})-F-([a-z-]+)$/.exec(p);
  if(m&&m[2] in FESTIVAL_ORD)
    return Number(m[1])*100000+FESTIVAL_ORD[m[2]]+(m[2]==='shieldmeet'?62:61);
  return null;
}
/** "Today" of the Kingdom, from the runtime calendar row. */
export function todayOf(calendar){
  if(!calendar||!Number.isInteger(calendar.year))return null;
  const y=String(calendar.year).padStart(4,'0');
  return calendar.festival?y+'-F-'+calendar.festival
    :y+'-'+String(calendar.month+1).padStart(2,'0')+'-'+String(calendar.day).padStart(2,'0');
}

/* ------------------------------- editions -------------------------------- */

export const DEFAULT_TITLE='Gazeta de Cormyr';

function cleanFields(f,id){
  const title=f.title,subtitle=f.subtitle??'';
  if(trimLen(title)<1||title.length>180)fail('invalid','Título deve ter de 1 a 180 caracteres');
  if(typeof subtitle!=='string'||subtitle.length>240)fail('invalid','Subtítulo até 240 caracteres');
  if(!TEMPLATES.has(f.template))fail('invalid','Modelo inválido');
  if(!FONTS.has(f.fontStyle))fail('invalid','Fonte inválida');
  if(!STATES.has(f.state))fail('invalid','Estado inválido');
  if(!isCampaignDate(f.campaignDate))fail('invalid','Data inválida');
  if(!Array.isArray(f.blocks)||f.blocks.length>80)fail('invalid','Até 80 blocos por edição');
  const pdf=f.pdfPath??null;
  if(pdf!==null&&(typeof pdf!=='string'||pdf.length>300||!pdf.startsWith(id+'/')||!pdf.endsWith('.pdf')))
    fail('invalid','Caminho do PDF inválido');
  const on=f.publishOn??null;
  if(on!==null&&!isCampaignDate(on))fail('invalid','Data de publicação agendada inválida');
  return {title,subtitle,template:f.template,fontStyle:f.fontStyle,state:f.state,
    campaignDate:f.campaignDate,blocks:f.blocks,pdfPath:pdf,publishOn:on};
}

/** Used by the stager so imported rows obey the same constraints. */
export const validateEditionFields=(f,id)=>cleanFields(f,id);

/** INSERT: policy requires an editor and state draft; the stamp trigger forces v1/rev 0. */
export function createEdition({input,actorUid,id,editionNo,now}){
  if(!isObj(input))fail('invalid','Edição inválida');
  if(!UUID.test(id))fail('invalid','Identificador inválido');
  if(input.state!==undefined&&input.state!=='draft')fail('denied','Nova edição deve ser rascunho');
  const at=now||new Date().toISOString();
  const c=cleanFields({
    title:input.title??DEFAULT_TITLE,subtitle:input.subtitle??'',template:input.template??'classico',
    fontStyle:input.fontStyle??'classico',state:'draft',campaignDate:input.campaignDate,
    blocks:input.blocks??[],pdfPath:input.pdfPath??null,publishOn:input.publishOn??null},id);
  return {id,editionNo,...c,version:1,publicationRevision:0,createdBy:actorUid,updatedBy:actorUid,
    createdAt:at,updatedAt:at,publishedAt:null,archivedAt:null,cancelledAt:null};
}

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const FIELDS=['title','subtitle','campaignDate','template','fontStyle','state','blocks','pdfPath','publishOn'];
const IDENTITY=['id','editionNo','createdBy','createdAt'];

/** snake_case row exactly as the application (and revision snapshots) read it. */
export const editionRow=e=>({id:e.id,edition_no:e.editionNo,campaign_date:e.campaignDate,title:e.title,
  subtitle:e.subtitle,template:e.template,font_style:e.fontStyle,state:e.state,blocks:e.blocks,
  pdf_path:e.pdfPath,publish_on:e.publishOn,version:e.version,publication_revision:e.publicationRevision,
  created_by:e.createdBy,updated_by:e.updatedBy,created_at:e.createdAt,updated_at:e.updatedAt,
  published_at:e.publishedAt,archived_at:e.archivedAt,cancelled_at:e.cancelledAt});

/**
 * UPDATE: RLS needs an editor; the stamp trigger keeps identity immutable,
 * bumps version, advances publication_revision when something readers can
 * see changes, and stamps published/archived/cancelled timestamps. The audit
 * trigger snapshots OLD (returned as `revision`, id assigned by the caller).
 */
export function applyEditionUpdate({current,patch,actorUid,now}){
  if(!current)fail('invalid','Edição não encontrada');
  if(!isObj(patch))fail('invalid','Alteração inválida');
  for(const k of IDENTITY)if(k in patch&&!same(patch[k],current[k]))fail('invalid','Identidade da edição é imutável');
  if('version' in patch&&patch.version!==current.version)fail('conflict','A edição mudou em outra janela');
  const at=now||new Date().toISOString();
  const merged={...current};
  for(const k of FIELDS)if(k in patch)merged[k]=patch[k];
  const c=cleanFields(merged,current.id);
  if(c.state==='archived'&&!PUBLISHED.has(current.state))
    fail('invalid','Somente edições publicadas podem ser arquivadas');
  const next={...current,...c,version:current.version+1,updatedBy:actorUid,updatedAt:at};
  const entering=c.state!==current.state;
  const contentChanged=['title','subtitle','campaignDate','template','fontStyle','blocks','pdfPath']
    .some(k=>!same(current[k],c[k]));
  if(PUBLISHED.has(c.state)&&((entering&&!PUBLISHED.has(current.state))||
     (current.state==='archived'&&c.state==='published')||contentChanged))
    next.publicationRevision=current.publicationRevision+1;
  if(entering&&c.state==='published')next.publishedAt=at;
  if(entering&&c.state==='archived')next.archivedAt=at;
  if(entering&&c.state==='cancelled')next.cancelledAt=at;
  return {next,revision:{newspaperId:current.id,previousVersion:current.version,
    snapshot:editionRow(current),changedBy:actorUid,changedAt:at}};
}

export const commissionIdsOf=blocks=>Array.isArray(blocks)
  ?[...new Set(blocks.filter(b=>isObj(b)&&typeof b.commissionId==='string').map(b=>b.commissionId))]:[];

/** settle_newspaper_commissions: a published/archived edition settles its pending commissions. */
export function settleCommissions({edition,commissions,now}){
  if(!PUBLISHED.has(edition.state))return [];
  const ids=new Set(commissionIdsOf(edition.blocks));
  const at=now||new Date().toISOString();
  return commissions.filter(c=>c.state==='pending'&&ids.has(c.id))
    .map(c=>({...c,state:'published',newspaperId:edition.id,publishedAt:at}));
}

/** Lowest free edition number (0119). */
export function nextEditionNo(editions){
  const used=new Set(editions.map(e=>e.editionNo));
  let n=1;while(used.has(n))n++;
  return n;
}

/** Reader/editor visibility of an edition (RLS). */
export const canSeeEdition=(scope,e)=>scope.canEdit||(scope.canRead&&PUBLISHED.has(e.state));

/** mark_campaign_newspaper_read */
export function markRead({scope,edition,now}){
  if(!scope.canRead)fail('denied','Leitura não autorizada');
  if(!edition)fail('invalid','Edição não encontrada');
  if(!PUBLISHED.has(edition.state))fail('invalid','Edição ainda não publicada');
  return {newspaperId:edition.id,userId:scope.uid,readVersion:edition.publicationRevision,
    readAt:now||new Date().toISOString()};
}

/** Drafts due today (0122): idempotent, requires content. */
export function dueEditions({editions,today}){
  const t=dateOrdinal(today);
  if(t===null)return [];
  return editions.filter(e=>e.state==='draft'&&e.publishOn!=null&&
    dateOrdinal(e.publishOn)!==null&&dateOrdinal(e.publishOn)<=t&&
    ((Array.isArray(e.blocks)?e.blocks.length:0)>0||e.pdfPath!=null));
}

/* ------------------------- Wealth of a noble house ------------------------ */

const text=v=>v==null?null:typeof v==='object'?JSON.stringify(v):String(v);
const int=v=>{
  if(v==null)return null;
  const t=String(v).trim();
  if(!/^[+-]?\d+$/.test(t))fail('invalid','Valor de Riqueza inválido na ficha');
  return Number(t);
};
const arr=v=>Array.isArray(v)?v:[];
const allocated=h=>{
  const ac=h&&h.allocatedCosts;
  if(isObj(ac)&&'wealth' in ac)return int(ac.wealth)??0;
  return arr(h&&h.costs).reduce((s,c)=>s+(c&&c.resource==='wealth'&&c.mode==='allocation'?(int(c.amount)??0):0),0);
};
/** Conservative available Wealth (same arithmetic as the SQL of 0092/0117). */
export function wealthAvailable(state){
  const region=state.regionalApplied===true||text(state.regionalApplied)==='true'
    ?(text(state.method)!==null&&text(state.method)!=='import'
      ?REGION_WEALTH[String(state.identity&&state.identity.region||'').replace(/ /g,'').toLowerCase()]||0:0):0;
  const consequences=arr(state.mailConsequences).filter(m=>m&&text(m.active)==='true')
    .reduce((s,m)=>s+(int(m.changes&&m.changes.wealth)??0),0);
  const holdings=arr(state.holdings);
  const alloc=holdings.filter(h=>h&&['active','building'].includes(h.status)).reduce((s,h)=>s+allocated(h),0);
  const units=arr(state.units).filter(u=>u&&(text(u.destroyed)??'false')!=='true').reduce((s,u)=>s+allocated(u),0);
  const destroyed=holdings.filter(h=>h&&h.status==='destroyed'&&(text(h.lostAllocation)??'false')!=='true')
    .reduce((s,h)=>s+allocated(h),0);
  const oldPerm=int(state.permanent&&state.permanent.wealth)??0;
  const total=(int(state.base&&state.base.wealth)??0)+oldPerm+region+consequences;
  return {available:total-alloc-units-destroyed,oldPerm};
}
/** jsonb_set(...,create_missing=false): only an existing key is replaced. */
const setPermanentWealth=(state,value)=>
  isObj(state.permanent)&&'wealth' in state.permanent
    ?{...state,permanent:{...state.permanent,wealth:value}}:state;

/* ------------------------------ commissions ------------------------------ */

export const commissionRow=c=>({id:c.id,house_id:c.houseId,requested_by:c.requestedBy,title:c.title,
  body:c.body,image_path:c.imagePath,cost_wealth:c.costWealth,state:c.state,rejection_note:c.rejectionNote,
  rejected_at:c.rejectedAt,rejected_by:c.rejectedBy,request_key:c.requestKey,newspaper_id:c.newspaperId,
  created_at:c.createdAt,published_at:c.publishedAt,seen_at:c.seenAt});

/**
 * newspaper_commission_story. `existingByKey` is the commission already using
 * the key (any house), `ledgerKeyTaken` whether the house ledger already uses
 * the key, `pendingCount` the pending commissions of the house.
 */
export function commissionStory({scope,houseId,title,body,imagePath,key,sheet,existingByKey,ledgerKeyTaken,
  pendingCount,newId,now}){
  const canHouse=scope.admin||scope.editHouseIds.has(houseId);
  if(!canHouse)fail('denied','Contratação de notícia não autorizada');
  const t=(title??'').toString().trim(),b=(body??'').toString().trim();
  if(typeof key!=='string'||!UUID.test(key)||t.length<3||t.length>180||b.length<10||b.length>6000||
     (imagePath!=null&&(typeof imagePath!=='string'||!imagePath.startsWith(houseId+'/')||imagePath.length>300)))
    fail('invalid','Notícia inválida: informe título e texto');
  if(!sheet||!isObj(sheet.state)||sheet.state.phase!=='active')fail('invalid','A Casa precisa de ficha ativa');
  if(existingByKey&&existingByKey.houseId===houseId)
    return {alreadyApplied:true,commissionId:existingByKey.id,houseVersion:sheet.version};
  if(existingByKey||ledgerKeyTaken)fail('conflict','Chave já utilizada em outra operação');
  if(pendingCount>=MAX_PENDING_PER_HOUSE)fail('invalid','A Casa já tem 3 notícias aguardando publicação');
  const at=now||new Date().toISOString();
  const {available,oldPerm}=wealthAvailable(sheet.state);
  if(available<1)fail('invalid','Sem recursos: exige 1 ponto de Riqueza disponível');
  const next=setPermanentWealth(sheet.state,oldPerm-1);
  const id=newId();
  const commission={id,houseId,requestedBy:scope.uid,title:t,body:b,imagePath:imagePath??null,costWealth:1,
    state:'pending',rejectionNote:null,rejectedAt:null,rejectedBy:null,requestKey:key,newspaperId:null,
    createdAt:at,publishedAt:null,seenAt:null};
  const version=sheet.version+1;
  return {alreadyApplied:false,commission,
    sheet:{...sheet,state:next,version,updatedBy:scope.uid,updatedAt:at},
    ledger:{houseId,operationKey:key,actor:scope.uid,action:'newspaper_commission',
      explanation:'Notícia contratada em A Folha Sem Selo: '+t+' (−1 Riqueza).',
      rule:'Cormyr: notícia contratada no jornal · custo permanente 1 Riqueza',
      campaignMonth:int(next.month),beforeState:sheet.state,afterState:next,version,createdAt:at},
    result:{commissionId:id,alreadyApplied:false,houseVersion:version,remainingWealthEstimate:available-1}};
}

/** newspaper_reject_commission: refund 1 Wealth, note 3..1000, pending only. */
export function rejectCommission({scope,commission,note,sheet,ledgerKey,now}){
  requireEditor(scope);
  const n=(note??'').toString().trim();
  if(n.length<3||n.length>1000)fail('invalid','Escreva uma nota explicando a recusa');
  if(!commission)fail('invalid','Pedido não encontrado');
  if(commission.state!=='pending')fail('invalid','Este pedido já foi publicado ou recusado');
  if(!sheet||!isObj(sheet.state))fail('invalid','Ficha da Casa indisponível');
  const at=now||new Date().toISOString();
  const next=setPermanentWealth(sheet.state,(int(sheet.state.permanent&&sheet.state.permanent.wealth)??0)+commission.costWealth);
  const version=sheet.version+1;
  return {
    commission:{...commission,state:'rejected',rejectionNote:n,rejectedAt:at,rejectedBy:scope.uid},
    sheet:{...sheet,state:next,version,updatedBy:scope.uid,updatedAt:at},
    ledger:{houseId:commission.houseId,operationKey:ledgerKey,actor:scope.uid,action:'newspaper_commission_refund',
      explanation:'Notícia recusada pelo Editor-Chefe: '+commission.title+' (+1 Riqueza devolvida). Nota: '+n,
      rule:'Cormyr: recusa de notícia contratada · devolução de 1 Riqueza',
      campaignMonth:int(next.month),beforeState:sheet.state,afterState:next,version,createdAt:at},
    result:{commissionId:commission.id,refunded:commission.costWealth,houseVersion:version}};
}

/** mark_newspaper_commissions_seen */
export function markCommissionsSeen({scope,houseId,commissions,now}){
  if(!(scope.admin||scope.memberHouseIds.has(houseId)))fail('denied','Acesso não autorizado');
  const at=now||new Date().toISOString();
  return commissions.filter(c=>c.houseId===houseId&&c.state!=='pending'&&c.seenAt==null)
    .map(c=>({...c,seenAt:at}));
}
export const canSeeCommission=(scope,c)=>scope.canEdit||scope.memberHouseIds.has(c.houseId);

/* --------------------- staff, models, engravings, settings ---------------- */

export const staffRow=s=>({id:s.id,name:s.name,specialty:s.specialty,bio:s.bio,photo_path:s.photoPath,
  created_by:s.createdBy,created_at:s.createdAt,updated_at:s.updatedAt});
export function cleanStaff(i){
  if(!isObj(i))fail('invalid','Funcionário inválido');
  const specialty=i.specialty??'',bio=i.bio??'',photo=i.photoPath??null;
  if(trimLen(i.name)<1||i.name.length>120||typeof specialty!=='string'||specialty.length>120||
     typeof bio!=='string'||bio.length>3000||(photo!==null&&(typeof photo!=='string'||photo.length>300)))
    fail('invalid','Dados do funcionário inválidos');
  return {name:i.name,specialty,bio,photoPath:photo};
}
export const modelRow=m=>({id:m.id,name:m.name,description:m.description,blocks:m.blocks,
  created_by:m.createdBy,created_at:m.createdAt,updated_at:m.updatedAt});
export function cleanModel(i){
  if(!isObj(i))fail('invalid','Modelo inválido');
  const description=i.description??'';
  if(trimLen(i.name)<1||i.name.length>80||typeof description!=='string'||description.length>200||
     !Array.isArray(i.blocks)||i.blocks.length<1||i.blocks.length>12)fail('invalid','Dados do modelo inválidos');
  return {name:i.name,description,blocks:i.blocks};
}
export const engravingRow=g=>({id:g.id,name:g.name,image_path:g.imagePath,public_src:g.publicSrc,
  in_collection:g.inCollection,created_by:g.createdBy,created_at:g.createdAt});
export function cleanEngraving(i){
  if(!isObj(i))fail('invalid','Gravura inválida');
  const imagePath=i.imagePath??null,publicSrc=i.publicSrc??null,inCollection=i.inCollection??true;
  if(trimLen(i.name)<1||i.name.length>80||typeof inCollection!=='boolean')fail('invalid','Dados da gravura inválidos');
  if((imagePath!==null)===(publicSrc!==null))fail('invalid','Informe imagem enviada OU imagem do site');
  if(imagePath!==null&&(typeof imagePath!=='string'||imagePath.length>300))fail('invalid','Caminho da imagem inválido');
  if(publicSrc!==null&&(typeof publicSrc!=='string'||!PUBLIC_SRC.test(publicSrc)||publicSrc.length>200))
    fail('invalid','Imagem do site inválida');
  return {name:i.name,imagePath,publicSrc,inCollection};
}
export const DEFAULT_SETTINGS={title:'A Folha Sem Selo',subtitle:'O jornal independente de Cormyr',
  template:'classico',fontStyle:'classico'};
export const settingsRow=s=>({id:true,title:s.title,subtitle:s.subtitle,template:s.template,
  font_style:s.fontStyle,updated_by:s.updatedBy??null,updated_at:s.updatedAt??null});
export function cleanSettings(i){
  if(!isObj(i))fail('invalid','Configuração inválida');
  const subtitle=i.subtitle??'';
  if(trimLen(i.title)<1||i.title.length>180||typeof subtitle!=='string'||subtitle.length>240||
     !TEMPLATES.has(i.template)||!FONTS.has(i.fontStyle))fail('invalid','Configuração inválida');
  return {title:i.title,subtitle,template:i.template,fontStyle:i.fontStyle};
}

/* ------------------------------ editor calendar --------------------------- */

const FESTIVAL_MONTHS={0:['midwinter'],3:['greengrass'],6:['midsummer','shieldmeet'],8:['highharvestide'],10:['feast-moon']};
/** get_newspaper_calendar_events: only events the Narrator already published. */
export function calendarEvents({scope,events,year,month}){
  requireEditor(scope);
  if(!Number.isInteger(year)||year<1||year>9999||!Number.isInteger(month)||month<0||month>11)
    fail('invalid','Mês inválido');
  const y=String(year).padStart(4,'0'),m=String(month+1).padStart(2,'0');
  const fest=FESTIVAL_MONTHS[month]||[];
  return events.filter(e=>typeof e.publishedDate==='string'&&e.publishedTitle!=null&&
      e.publishedDate.slice(0,4)===y&&(e.publishedDate.slice(5,7)===m||
        (e.publishedDate.slice(5,7)==='F-'&&fest.some(f=>e.publishedDate.endsWith(f)))))
    .sort((a,b)=>a.publishedDate.localeCompare(b.publishedDate)||String(a.id).localeCompare(String(b.id)))
    .map(e=>({id:'schedule:'+e.id,date:e.publishedDate,title:e.publishedTitle,
      description:e.publishedDescription??'',kind:'kingdom'}));
}

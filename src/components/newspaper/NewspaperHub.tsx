import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Plus,FileText,ImagePlus,Newspaper,ArrowUp,ArrowDown,Trash2,Save,Send,Archive,Undo2,Check,Eye,LayoutTemplate,ChevronLeft,ChevronRight,EyeOff} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {isFirebaseNewspaperWorkspace,loadPublishedNewspaperArchive} from '@/lib/newspaper/firebase-editorial-bridge';
import {isFirebaseNewspaperMediaPath} from '@/lib/newspaper/firebase-newspaper-media';
import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {dateKey,formatDate} from '@/lib/calendar/harptos';
import {NewspaperTeam} from './NewspaperTeam';
import {NewspaperCanvas} from './NewspaperCanvas';
import {NewspaperEditorialDesk} from './NewspaperEditorialDesk';
import {CommissionForm,CommissionInbox} from './NewspaperCommissions';
import {
 copyCommissionImageToEdition,createNewspaperEdition,deleteNewspaperDraft,getHouseNames,getNewspaperCommissions,rejectNewspaperCommission,
 getNewspaperEditions,getNewspaperReceipts,getNewspaperRevisions,getNewspaperStaff,saveNewspaperStaff,
 deleteNewspaperStaff,reorderNewspaperStaff,uploadStaffPhoto,saveNewspaperStaffWithPhoto,getStoryModels,saveStoryModel,deleteStoryModel,deleteNewspaperEdition,
 markNewspaperRead,markNewspaperUnread,updateNewspaperEdition,uploadNewspaperAsset,
 getNewspaperSettings,saveNewspaperSettings,getPublicHubDate,getPublicNewspaperReadCounts,
 getEngravings,uploadEngraving,setEngravingInCollection,deleteEngraving,copyBucketImageToEdition,restoreOriginalEngravings,
 preflightNewspaperSourceImage,getNewspaperEditionById,copyEditionImageToEdition,unreadableNewspaperDrafts,
} from '@/lib/newspaper/data';
import {pickWorkingDraft,autoApplicableBackup,isOwnEarlierSave,recoveryCandidates,editableDrafts,
 type RecoveryCandidate} from '@/lib/newspaper/working-draft';
import {setUrlParams} from '@/lib/navigation/url-state';
import {
 commissionToBlocks,newspaperIsDirty,pendingCommissions,type NewspaperCommission,
 createNewspaperLayout,makeNewspaperBlock,newspaperIsUnread,newspaperStatus,
 duplicateNewspaperBlock,
 NEWSPAPER_FONTS,NEWSPAPER_TYPEFACES,NEWSPAPER_TEMPLATES,safeNewspaperBlocks,validateNewspaperEdition,
 type NewspaperBlock,type NewspaperBlockType,type NewspaperEdition,type NewspaperState,
 DEFAULT_NEWSPAPER_SETTINGS,validateNewspaperSettings,newEditionDate,type NewspaperSettings,
 type NewspaperTemplate,type NewspaperRevision,type NewspaperEngraving,ENGRAVINGS_BUCKET,PAPER_BUCKET,type NewspaperStaffMember,orderStaff,moveStaffMember,type StoryModel,instantiateStoryModel,
} from '@/lib/newspaper/model';
import {movePreservingPinned,reorderPreservingPinned,resizeWithReflow} from '@/lib/newspaper/layout';
import {browserOfflineStore,listOfflineEditionBackups,readOfflineEdition,writeOfflineEdition,clearOfflineEdition,recoverOfflineEdition,
 readWorkingEditionId,rememberWorkingEditionId,type OfflineEditionBackup} from '@/lib/newspaper/offline-draft';
import {appendOfflineHistory,listOfflineHistory} from '@/lib/newspaper/offline-history';
import {
 canRedo,canUndo,convertBlock,emptyHistory,handleNewspaperTextareaTab,insertBlocksAfter,needsImageCopy,parseClipboardBlocks,recordSnapshot,
 redoHistory,serializeBlocks,sameSnapshot,snapshotOf,textToArticleBlock,undoHistory,type EditHistory,
} from '@/lib/newspaper/editing';
import './newspaper.css';

export function useUnreadNewspaperCount(userId:string,enabled=true){
 const editions=useQuery({queryKey:['campaign-newspapers',userId],
  queryFn:getNewspaperEditions,enabled,refetchInterval:30_000});
 const receipts=useQuery({queryKey:['campaign-newspaper-reads',userId],
  queryFn:getNewspaperReceipts,enabled,refetchInterval:30_000});
 const count=useMemo(()=>{
  if(!editions.data||!receipts.data)return 0;
  const mine=new Map(receipts.data.filter(r=>r.user_id===userId).map(r=>[r.newspaper_id,r]));
  return editions.data.filter(e=>newspaperIsUnread(e,mine.get(e.id))).length;
 },[editions.data,receipts.data,userId]);
 return {count,editions,receipts};
}

/** Respostas (publicação ou recusa) que a Casa ainda não viu: alimenta o aviso na aba Jornal. */
export function useUnseenCommissionAnswers(userId:string,enabled=true){
 const query=useQuery({queryKey:['campaign-newspaper-commissions',userId],
  queryFn:getNewspaperCommissions,enabled,refetchInterval:30_000});
 return (query.data??[]).filter(c=>c.state!=='pending'&&!c.seen_at).length;
}
function cloneEditableEdition(edition:NewspaperEdition){
 return {...edition,blocks:safeNewspaperBlocks(edition.blocks)};
}
function safeError(cause:unknown){
 return cause instanceof Error?cause.message:'Não foi possível concluir a operação.';
}
export function NewspaperHub({userId,editor,editorial=false,houseId,onSignout,missivas}:{
 userId:string;editor:boolean;editorial?:boolean;
 /** Editor-Chefe: missivas entregues (somente leitura) como item do menu da Redação. */
 missivas?:ReactNode;
 /** Casa do jogador: habilita "Contratar notícia" (1 de Riqueza). */
 houseId?:string;
 onSignout?:()=>void;
}){
 const qc=useQueryClient();
 // O perfil do Editor-Chefe não é jogador nem Narrador: a leitura privada do calendário
 // volta vazia para ele. Na Redação a data oficial vem da leitura pública do HUB Temporal.
 const time=useCampaignTime(!editorial);
 const publicDate=useQuery({queryKey:['campaign-newspaper-hub-date'],queryFn:getPublicHubDate,
  enabled:editor&&(editorial||time.isError),staleTime:15_000,refetchInterval:30_000,retry:1});
 const hubDate=time.data?dateKey(time.data):publicDate.data??'';
 const settingsQuery=useQuery({queryKey:['campaign-newspaper-settings'],queryFn:getNewspaperSettings,
  enabled:editor,staleTime:60_000,retry:false});
 const settings=settingsQuery.data??DEFAULT_NEWSPAPER_SETTINGS;
 // Leituras de visitantes do site aberto (sem conta), contadas para o Editor-Chefe.
 const publicReadsQuery=useQuery({queryKey:['campaign-newspaper-public-reads'],queryFn:getPublicNewspaperReadCounts,
  enabled:editor&&editorial,staleTime:30_000,refetchInterval:60_000,retry:false});
 const {count,editions,receipts}=useUnreadNewspaperCount(userId);
 // Independent public list: two published editions must never wait for the
 // slower private drafts/revisions projection. Only enabled in Editor-Chefe.
 const issuedArchive=useQuery({
  queryKey:['published-newspaper-archive',userId],
  queryFn:loadPublishedNewspaperArchive,
  enabled:editor&&editorial&&isFirebaseNewspaperWorkspace(),
  staleTime:30_000,refetchInterval:60_000,retry:1,
 });
 const commissionsQuery=useQuery({queryKey:['campaign-newspaper-commissions',userId],
  queryFn:getNewspaperCommissions,refetchInterval:30_000});
 const houseNamesQuery=useQuery({queryKey:['campaign-newspaper-house-names'],
  queryFn:getHouseNames,enabled:editor,staleTime:10*60*1000});
 const staffQuery=useQuery({queryKey:['campaign-newspaper-staff'],queryFn:getNewspaperStaff,
  enabled:editorial?editor:!editor,staleTime:60_000,retry:false});
 const staff=useMemo(()=>orderStaff(staffQuery.data??[]),[staffQuery.data]);
 const modelsQuery=useQuery({queryKey:['campaign-newspaper-story-models'],queryFn:getStoryModels,
  enabled:editor&&editorial,staleTime:60_000,retry:false});
 const storyModels=modelsQuery.data??[];
 const engravingsQuery=useQuery({queryKey:['campaign-newspaper-engravings'],queryFn:getEngravings,
  enabled:editor&&editorial,staleTime:60_000,retry:false});
 const engravings=engravingsQuery.data??[];
 const allCommissions=commissionsQuery.data??[];
 const pending=pendingCommissions(allCommissions);
 const houseNames=houseNamesQuery.data??new Map<string,string>();
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [draft,setDraft]=useState<NewspaperEdition|null>(null);
 const [editing,setEditing]=useState(false);
 const [blockId,setBlockId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const autosaving=useRef(false);
 const [saveStatus,setSaveStatus]=useState<'idle'|'saving'|'saved'|'failed'>('idle');
 const [savedAt,setSavedAt]=useState('');
 const [retryTick,setRetryTick]=useState(0);
 const [minuteTick,setMinuteTick]=useState(0);
 const minuteHandled=useRef(0);
 const [offlineRecovery,setOfflineRecovery]=useState<OfflineEditionBackup|null>(null);
 const [offlineStorageDenied,setOfflineStorageDenied]=useState(false);
 const [offlineSavedAt,setOfflineSavedAt]=useState<number|null>(null);
 const [historyBackups,setHistoryBackups]=useState<OfflineEditionBackup[]>([]);
 const [historyLoaded,setHistoryLoaded]=useState(false);
 const [recoverNeedsReview,setRecoverNeedsReview]=useState(false);
 const recoveryChecked=useRef(new Set<string>());
 const retryTimer=useRef<number|undefined>(undefined);
 const [discardBackup,setDiscardBackup]=useState<NewspaperEdition|null>(null);
 const discardTimer=useRef<number|undefined>(undefined);
 useEffect(()=>()=>{window.clearTimeout(retryTimer.current);window.clearTimeout(discardTimer.current);},[]);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 // Keep existing synchronous localStorage backups. IndexedDB adds revisions.
 const localBackups=useMemo(()=>{
  if(!editorial||!editor)return [];
  const all=[...listOfflineEditionBackups(browserOfflineStore(),userId),
   ...historyBackups.filter(b=>b.owner===userId)];
  const unique=new Map<string,OfflineEditionBackup>();
  for(const backup of all){
   unique.set(backup.editionId+':'+backup.updatedAt+':'+backup.baseVersion,backup);
  }
  return [...unique.values()].sort((x,y)=>y.updatedAt-x.updatedAt).slice(0,100);
 },[editorial,editor,userId,offlineSavedAt,selectedId,historyBackups]);
 useEffect(()=>{
  if(!editorial||!editor)return;
  let active=true;
  const timer=window.setTimeout(()=>{
   void listOfflineHistory(userId).then(items=>{
    if(active){setHistoryBackups(items);setHistoryLoaded(true);}
   }).catch(()=>{if(active)setHistoryLoaded(true);});
  },offlineSavedAt===null?0:600);
  return()=>{active=false;window.clearTimeout(timer);};
 },[editorial,editor,userId,offlineSavedAt]);
 const workingDraftOf=(rows:readonly NewspaperEdition[])=>{
  const drafts=editableDrafts(rows);
  const pinned=readWorkingEditionId(browserOfflineStore(),userId);
  return drafts.find(d=>d.id===pinned)??pickWorkingDraft(drafts,localBackups);
 };
 const history=useMemo(()=>{
  const rows=new Map<string,NewspaperEdition>();
  for(const e of issuedArchive.data??[])rows.set(e.id,e);
  // The authenticated source replaces read-only previews when available.
  for(const e of editions.data??[])rows.set(e.id,e);
  return [...rows.values()].sort((a,b)=>b.edition_no-a.edition_no||b.id.localeCompare(a.id));
 },[editions.data,issuedArchive.data]);
 useEffect(()=>{
  if(!editorial||!editor||selectedId||!editions.data?.length)return;
  // Reopen THE edition in progress (last one worked on), never an arbitrary
  // draft: an old or empty copy on screen after a reload looked like lost work.
  const edition=workingDraftOf(editions.data)??editions.data[0];
  if(!edition)return;
  setSelectedId(edition.id);setDraft(cloneEditableEdition(edition));
  setEditing(edition.state==='draft');
  setBlockId(edition.state==='draft'?edition.blocks[0]?.id??null:null);
 },[editorial,editor,selectedId,editions.data]);
 const selected=history.find(e=>e.id===selectedId);
 // Read inside async callbacks without re-subscribing the autosave timer.
 const latest=useRef({selected,localBackups});
 latest.current={selected,localBackups};
 const current=draft?.id===selectedId&&
    !(draft.archive_preview&&selected&&!selected.archive_preview)
    ?draft:selected??null;
 const chosenBlock=current?.blocks.find(x=>x.id===blockId);
 const reads=receipts.data??[];
 const myReads=new Map(reads.filter(r=>r.user_id===userId).map(r=>[r.newspaper_id,r]));

 const refresh=()=>Promise.all([
  qc.invalidateQueries({queryKey:['campaign-newspapers',userId]}),
  qc.invalidateQueries({queryKey:['campaign-newspaper-reads',userId]}),
  qc.invalidateQueries({queryKey:['campaign-newspaper-commissions',userId]}),
 ]);
 const notice=(value:string)=>{setMessage(value);setError('');};
 const exportLocalBackup=(backup:OfflineEditionBackup,format:'txt'|'json'='txt')=>{
  if(backup.owner!==userId)return;
  // Download the local draft without sending it to any endpoint.
  const text=format==='json'?JSON.stringify(backup,null,2):[backup.snapshot.title,backup.snapshot.subtitle,
   'Data da edição: '+backup.snapshot.campaign_date,
   ...backup.snapshot.blocks.flatMap(block=>{
    const parts=[block.text,block.subtitle,block.caption].filter(
     (part):part is string=>typeof part==='string'&&part.trim().length>0);
    return parts.length?['---',...parts]:[];
   }),
  ].filter(Boolean).join('\n\n');
  try{
   const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
   const link=document.createElement('a');
   link.href=url;link.download='folha-copia-local-'+backup.editionId.slice(-8)+'-'+backup.updatedAt+'.'+format;
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),5000);
   notice('Texto do dispositivo exportado. Confira o arquivo antes de retomar a edição.');
  }catch{setError('O navegador bloqueou o download da cópia local. Não limpou nem alterou o texto.');}
 };
 const exportCurrent=()=>{
  if(!current||current.state!=='draft')return;
  exportLocalBackup({schema:1,owner:userId,editionId:current.id,
   baseVersion:current.version,updatedAt:Date.now(),snapshot:snapshotOf(current)},'json');
 };
 /**
  * Consolidate a recovered version into THE edition in progress and save it
  * in Firebase right away. Target: the draft that version belongs to, else
  * the working draft, else a new draft (only when none exists). Nothing is
  * deleted: Firebase keeps the replaced version as a revision and the device
  * keeps every copy.
  */
 const applyRecoveryVersion=async(candidate:RecoveryCandidate)=>{
  if(!editor||busy)return;
  const at=candidate.updatedAt?new Date(candidate.updatedAt).toLocaleString('pt-BR'):'data não informada';
  if(!window.confirm('Usar a versão de '+at+' ('+candidate.words+' palavras) como a edição em andamento?\n\n'+
    'Ela será salva no Firebase agora. A versão substituída continua no histórico de revisões e as cópias deste dispositivo são mantidas.'))return;
  setBusy(true);setError('');
  try{
   const drafts=editableDrafts(history);
   let target=drafts.find(d=>d.id===candidate.editionId)??null;
   if(!target){
    const direct=await getNewspaperEditionById(candidate.editionId).catch(()=>null);
    if(direct&&direct.state==='draft'&&!direct.published_at)target=direct;
   }
   if(!target)target=workingDraftOf(history);
   const snap=candidate.snapshot;
   let created=false;
   if(!target){
    // No draft at all: create one (images are attached right after).
    const plain=snap.blocks.map(b=>{const {imagePath:_drop,...rest}=b;return rest;});
    target=await createNewspaperEdition({campaign_date:snap.campaign_date,title:snap.title,
     subtitle:snap.subtitle,template:snap.template,font_style:snap.font_style,blocks:plain});
    created=true;
   }
   // Always write on the freshest Firebase version (CAS), never a stale list.
   const fresh=await getNewspaperEditionById(target.id).catch(()=>null);
   const base=fresh&&fresh.state==='draft'?fresh:target;
   const sameEdition=candidate.editionId===base.id;
   let lostImages=0;
   const blocks:NewspaperBlock[]=[];
   for(const block of snap.blocks){
    if(!block.imagePath||sameEdition){blocks.push(block);continue;}
    try{blocks.push({...block,imagePath:await copyEditionImageToEdition(base.id,block.imagePath)});}
    catch{const {imagePath:_drop,...rest}=block;blocks.push(rest);lostImages++;}
   }
   const result=await updateNewspaperEdition(base,{
    campaign_date:snap.campaign_date,title:snap.title.trim()||base.title,subtitle:snap.subtitle,
    template:snap.template,font_style:snap.font_style,blocks,
    pdf_path:sameEdition?snap.pdf_path:base.pdf_path,state:'draft',publish_on:null,
   });
   rememberWorkingEditionId(browserOfflineStore(),userId,result.id);
   writeOfflineEdition(browserOfflineStore(),userId,result);
   void appendOfflineHistory(userId,result);
   qc.setQueryData<NewspaperEdition[]>(['campaign-newspapers',userId],rows=>
    [result,...(rows??[]).filter(e=>e.id!==result.id)]);
   recoveryChecked.current.add(result.id);
   setRecoverNeedsReview(false);setOfflineRecovery(null);
   setSelectedId(result.id);setDraft(cloneEditableEdition(result));
   setBlockId(null);setEditing(true);
   setUrlParams({redacao:'capa'});
   notice((created?'Edição em andamento recriada':'Versão aplicada à edição em andamento')+
    ' e salva no Firebase.'+(lostImages?' '+lostImages+' imagem(ns) precisam ser anexadas de novo (a legenda foi mantida).':''));
   await Promise.all([refresh(),qc.invalidateQueries({queryKey:['campaign-newspaper-revisions',result.id]})]);
  }catch(cause){setError('Nada foi apagado; a versão continua disponível. '+safeError(cause));}
  finally{setBusy(false);}
 };
 const recoverBackup=(backup:OfflineEditionBackup)=>{
  if(backup.owner!==userId)return;
  const candidate=recoveryCandidates([],[backup],null)[0];
  if(candidate)void applyRecoveryVersion({...candidate,
   draftExists:editableDrafts(history).some(d=>d.id===backup.editionId)});
 };
 /** Soft-discards the other drafts (recoverable tombstones); copies on this device stay. */
 const keepOnlyWorking=async()=>{
  if(!editor||busy)return;
  const working=current?.state==='draft'&&!current.archive_preview?current:workingDraftOf(history);
  if(!working)return;
  const others=editableDrafts(history).filter(d=>d.id!==working.id);
  if(!others.length){notice('Já existe apenas a edição em andamento.');return;}
  if(!window.confirm('Manter só a edição em andamento ("'+working.title+'", '+
    working.blocks.length+' elementos) e descartar '+others.length+' outro(s) rascunho(s)?\n\n'+
    'Confira antes, em "Ver", se nenhum deles tem texto que falta na edição em andamento. '+
    'As cópias deste dispositivo continuam guardadas.'))return;
  setBusy(true);setError('');
  let failed=0;
  for(const other of others){
   try{await deleteNewspaperDraft(other.id);}catch{failed++;}
  }
  rememberWorkingEditionId(browserOfflineStore(),userId,working.id);
  await refresh();
  setBusy(false);
  if(failed)setError(failed+' rascunho(s) não puderam ser descartados agora. Tente de novo.');
  else notice('Pronto: o Jornal tem uma única edição em andamento.');
 };
 const open=async(edition:NewspaperEdition)=>{
  if(busy)return;
  const compare=(e:NewspaperEdition)=>JSON.stringify([
   e.campaign_date,e.title,e.subtitle,e.template,e.font_style,e.blocks,e.pdf_path,e.state,
  ]);
  if(edition.id!==selectedId&&current&&selected&&compare(current)!==compare(selected)&&
   !window.confirm('Há alterações não salvas. Deseja abrir outra edição e descartá-las?'))return;
  setRecoverNeedsReview(false);setOfflineRecovery(null);
  setSelectedId(edition.id);setDraft(cloneEditableEdition(edition));setBlockId(null);
  setEditing(false);setMessage('');setError('');
  if(!editor&&['published','archived'].includes(edition.state)&&newspaperIsUnread(edition,myReads.get(edition.id))){
   try{await markNewspaperRead(edition.id);await qc.invalidateQueries({queryKey:['campaign-newspaper-reads',userId]});}
   catch(cause){setError('O jornal abriu, mas a confirmação de leitura não foi salva: '+safeError(cause));}
  }
 };
 /**
  * Data e identidade de uma edição nova. O Editor-Chefe escreve sempre: sem a data do HUB em
  * memória busca na hora e, se a rede falhar, usa a data da edição mais recente (editável depois).
  */
 const editionSeed=async()=>{
  let date=hubDate;
  if(!date){try{date=await getPublicHubDate();}catch{date='';}}
  date=newEditionDate(date,editions.data??[]);
  if(!date)throw new Error('Não foi possível ler a data do HUB Temporal agora. Confira a conexão e tente de novo.');
  return {campaign_date:date,title:settings.title,subtitle:settings.subtitle,
   template:settings.template,font_style:settings.font_style};
 };
 /**
  * ONE edition in progress. While a draft exists, every "new edition" path
  * opens it instead of creating another copy (copies split the work and,
  * after a reload, an older copy on screen looked like lost text).
  */
 const openWorkingDraft=(extra?:NewspaperBlock[]):boolean=>{
  if(current?.state==='draft'&&!current.archive_preview)return false;
  const working=workingDraftOf(history);
  if(!working)return false;
  const base=cloneEditableEdition(working);
  const blocks=extra&&base.blocks.length+extra.length<=80?[...base.blocks,...extra]:base.blocks;
  setRecoverNeedsReview(false);setOfflineRecovery(null);
  setSelectedId(working.id);setDraft({...base,blocks});setEditing(true);
  setBlockId(extra?.[0]?.id??base.blocks[0]?.id??null);
  setUrlParams({redacao:'capa'});
  notice('A edição em andamento foi aberta (o Jornal mantém um único rascunho). '+
   'Para começar outra edição, publique ou descarte esta.');
  return true;
 };
 const newEdition=async(initialBlock?:NewspaperBlockType,extraPatch?:Partial<NewspaperBlock>)=>{
  if(!editor||busy)return;
  if(openWorkingDraft(initialBlock?[{...makeNewspaperBlock(initialBlock),...(extraPatch??{})}]:undefined))return;
  setBusy(true);setError('');
  try{
   const seed=await editionSeed();
   const blocks=createNewspaperLayout(seed.template);
   const extra=initialBlock?{...makeNewspaperBlock(initialBlock),...(extraPatch??{})}:null;
   if(extra)blocks.push(extra);
   const edition=await createNewspaperEdition({...seed,blocks});
   writeOfflineEdition(browserOfflineStore(),userId,edition);
   rememberWorkingEditionId(browserOfflineStore(),userId,edition.id);
   void appendOfflineHistory(userId,edition);
   setRecoverNeedsReview(false);setOfflineRecovery(null);
   setSelectedId(edition.id);setDraft(cloneEditableEdition(edition));
   setBlockId(extra?.id??edition.blocks[0]?.id??null);setEditing(true);
   notice('Rascunho criado no Firebase. O texto será protegido neste dispositivo e salvo automaticamente.');
   await refresh();
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 // Leitor: ao entrar no Jornal, a edição mais recente já abre na tela (uma vez por visita).
 const autoOpened=useRef(false);
 useEffect(()=>{
  if(editor||autoOpened.current||selectedId||!editions.data?.length)return;
  autoOpened.current=true;
  void open(editions.data[0]!);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[editor,selectedId,editions.data]);
 const markUnread=async(edition:NewspaperEdition)=>{
  setError('');
  try{
   await markNewspaperUnread(edition.id);
   await qc.invalidateQueries({queryKey:['campaign-newspaper-reads',userId]});
   notice('Edição marcada como não lida. O aviso permanece até você abri-la de novo.');
  }catch(cause){setError('Não foi possível marcar como não lida: '+safeError(cause));}
 };
 const modify=(patch:Partial<NewspaperEdition>)=>setDraft(old=>old?{...old,...patch}:old);
 const modifyBlock=(id:string,patch:Partial<NewspaperBlock>)=>setDraft(old=>old?{
  ...old,blocks:old.blocks.map(b=>b.id===id?{...b,...patch}:b),
 }:old);
 // Blocos fixos nunca mudam de lugar: os outros passam por cima deles.
 const moveBlock=(id:string,direction:-1|1)=>{
  setDraft(old=>old?{...old,blocks:movePreservingPinned(old.blocks,id,direction)}:old);
 };
 const addBlock=(type:NewspaperBlockType)=>{
  if(!draft)return;
  if(draft.blocks.length>=80){setError('A edição permite até 80 elementos.');return;}
  const block=makeNewspaperBlock(type);
  modify({blocks:[...draft.blocks,block]});setBlockId(block.id);
 };
 const upload=async(file:File|null,kind:'pdf'|'image')=>{
  if(!file||!current||busy)return;
  const editionId=current.id,sourceBlock=blockId;
  setBusy(true);setError('');
  try{
   const path=await uploadNewspaperAsset(editionId,file,kind);
   if(kind==='pdf')setDraft(old=>{
    if(old?.id!==editionId)return old;
    // Importação rápida: substituir blocos de exemplo pela página do PDF;
    // preservar qualquer reportagem ou fotografia já personalizada.
    const examplesOnly=old.blocks.every(b=>
      (b.type==='headline'&&['A GAZETA DE CORMYR','ÚLTIMA HORA','Escreva a manchete principal'].includes(b.text))||
      (b.type==='article'&&b.text.startsWith('Título da notícia'))||
      (b.type==='quote'&&b.text.startsWith('Uma declaração importante'))||
      (b.type==='image'&&!b.imagePath));
    return {...old,pdf_path:path,blocks:examplesOnly?[{...makeNewspaperBlock('headline'),text:'Edição disponível em PDF'}]:old.blocks};
   });
   else if(kind==='image'){
    const imageBlock=makeNewspaperBlock('image');
    const placeholder=current.blocks.find(b=>b.type==='image'&&!b.imagePath&&!b.imageSrc);
    const target=sourceBlock&&current.blocks.some(b=>b.id===sourceBlock&&b.type==='image')?
     sourceBlock:placeholder?.id;
    setDraft(old=>old?.id===editionId?{
     ...old,blocks:target?
      old.blocks.map(b=>{
       if(b.id!==target)return b;
       const {imageSrc:_unused,...rest}=b;
       return {...rest,imagePath:path};
      }):
      [...old.blocks,{...imageBlock,imagePath:path}],
    }:old);
    setBlockId(target??imageBlock.id);
   }
   notice('Arquivo anexado. Salve o rascunho para registrar a alteração.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const save=async(nextState?:NewspaperState)=>{
  if(!editor||!current||busy||autosaving.current)return;
  if(current.archive_preview){
   setError('Esta é a visualização pública preservada. Para editar, a versão original deve terminar de carregar.');return;
  }
  const state=nextState??current.state;
  const problem=validateNewspaperEdition(current);
  // Permite cancelar mesmo uma edição ainda incompleta.
  // Incomplete drafts must be saveable; publishing still requires review.
  if(problem&&state==='published'){setError(problem);return;}
  if(state==='cancelled'&&!window.confirm('Cancelar o envio desta edição? Ela ficará invisível aos jogadores, mas preservada no histórico editorial.'))return;
  setBusy(true);setError('');
  try{
   let submission=current;
   if(recoverNeedsReview){
    // After a 409 or old-device restore, load the newest CAS version without
    // silently replacing either editor's text. The explicit user confirmation
    // is the only action permitted to rebase a local draft.
    const remote=(await getNewspaperEditions()).find(e=>e.id===current.id);
    if(!remote||remote.state!=='draft')
     throw Error('O rascunho do Firebase não está disponível para reconciliação.');
    if(!window.confirm(
      'O Firebase tem uma versão que precisa de revisão. Salvar agora criará uma nova versão com o texto desta tela, preservando a anterior no histórico. Confirmar?'
    ))return;
    submission={...current,version:remote.version};
   }
   const snapshotAtSave=current;
   const result=await updateNewspaperEdition(submission,{
    campaign_date:current.campaign_date,title:current.title.trim(),subtitle:current.subtitle,
    template:current.template,font_style:current.font_style,blocks:current.blocks,
    pdf_path:current.pdf_path,state,
    // Só rascunhos ficam agendados; ao publicar, cancelar ou arquivar o agendamento é limpo.
    ...(current.publish_on!==undefined?{publish_on:state==='draft'?current.publish_on:null}:{}),
   });
   setDraft(old=>{
    if(old?.id!==result.id)return old;
    return sameSnapshot(snapshotOf(old),snapshotOf(snapshotAtSave))
     ?cloneEditableEdition(result):{...old,version:result.version};
   });
   setRecoverNeedsReview(false);
   // The imported archive remains immutable. Keep the operational copy in the
   // editor's query cache until the fresh Firebase overlay list is reloaded.
   qc.setQueryData<NewspaperEdition[]>(['campaign-newspapers',userId],rows=>
    rows?.map(e=>e.id===result.id?result:e)??[result]);
   setSaveStatus('saved');setSavedAt(new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
   if(state!=='draft'){
    clearOfflineEdition(browserOfflineStore(),userId,result.id);
    setOfflineRecovery(null);
    setEditing(false);setBlockId(null);
   }
   await refresh();
   notice(state==='published'?'Jornal publicado. A edição já aparece aos jogadores como não lida.':
    state==='cancelled'?'Envio cancelado; a edição não aparece mais aos jogadores.':
    state==='archived'?'Edição arquivada e preservada para leitura.':
    'Rascunho salvo.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const changeTemplate=(template:NewspaperTemplate)=>{
  if(!draft)return;
  // Ao trocar a diagramação, preserva as matérias já escritas.
  const pattern=createNewspaperLayout(template);
  modify({template,blocks:draft.blocks.length?draft.blocks.map((b,index)=>({
   ...b,span:pattern[index%pattern.length]!.span,
  })):pattern});
 };
 const readers=current?reads.filter(r=>r.newspaper_id===current.id&&r.read_version>=current.publication_revision).length:0;
 const displayEdition=current;
 const displayIndex=displayEdition?history.findIndex(e=>e.id===displayEdition.id):-1;
 const olderEdition=displayIndex>=0?history[displayIndex+1]:undefined;
 const newerEdition=displayIndex>0?history[displayIndex-1]:undefined;


 const quickUpload=async(file:File)=>{
  if(!editor||busy)return;
  const kind=file.type==='application/pdf'?'pdf':'image';
  if(current){await upload(file,kind);setEditing(true);return;}
  if(openWorkingDraft())return;
  setBusy(true);setError('');
  let createdDraft=false;
  try{
   const seed=await editionSeed();
   const base=await createNewspaperEdition({...seed,blocks:createNewspaperLayout(seed.template)});
   createdDraft=true;
   // A failure uploading the file must not hide an already-created edition.
   setSelectedId(base.id);setDraft(cloneEditableEdition(base));setEditing(true);
   setBlockId(base.blocks[0]?.id??null);
   qc.setQueryData<NewspaperEdition[]>(['campaign-newspapers',userId],rows=>
    [base,...(rows??[]).filter(e=>e.id!==base.id)]);
   const path=await uploadNewspaperAsset(base.id,file,kind);
   const nextBlock=kind==='image'?{...makeNewspaperBlock('image'),imagePath:path}:null;
   const result=await updateNewspaperEdition(base,{
    campaign_date:base.campaign_date,title:base.title,
    subtitle:base.subtitle,
    template:base.template,font_style:base.font_style,
    blocks:nextBlock?base.blocks.some(b=>b.type==='image'&&!b.imagePath&&!b.imageSrc)?
     base.blocks.map(b=>b.type==='image'&&!b.imagePath&&!b.imageSrc?{...b,imagePath:path}:b):
     [...base.blocks,nextBlock]:
     [{...makeNewspaperBlock('headline'),text:'Edição disponível em PDF'}],
    pdf_path:kind==='pdf'?path:null,state:'draft',
   });
   setDraft(cloneEditableEdition(result));setSelectedId(result.id);
   setBlockId(nextBlock?.id??null);setEditing(true);
   notice('Arquivo importado em novo rascunho. Revise a página antes de publicar.');
   await refresh();
  }catch(cause){
   setError(createdDraft?
    'O novo rascunho permanece aberto e preservado. O anexo não foi concluído: '+safeError(cause):
    safeError(cause));
  }
  finally{setBusy(false);}
 };
 const editBlock=(id:string,patch:Partial<NewspaperBlock>)=>{
  modifyBlock(id,patch);setEditing(true);
 };
 const addEditorialBlock=(type:NewspaperBlockType,span?:number)=>{
  if(!current||current.archive_preview||current.state!=='draft'){
   void newEdition(type);return;
  }
  if(current.blocks.length>=80){setError('A edição permite até 80 elementos.');return;}
  const block=makeNewspaperBlock(type);
  if(span)block.span=span;
  setDraft(old=>old?{...old,blocks:[...old.blocks,block]}:old);
  setBlockId(block.id);setEditing(true);
 };
 const reorderEditorialBlock=(fromId:string,toId:string)=>{
  if(!current)return;
  modify({blocks:reorderPreservingPinned(current.blocks,fromId,toId)});
  setBlockId(fromId);setEditing(true);
 };
 const insertEditorialBefore=(type:NewspaperBlockType,beforeId:string|null)=>{
  if(!current||current.archive_preview||current.state!=='draft'){
   void newEdition(type);return;
  }
  if(current.blocks.length>=80){setError('A edição permite até 80 elementos.');return;}
  const block=makeNewspaperBlock(type);
  const next=[...current.blocks],index=next.findIndex(x=>x.id===beforeId);
  next.splice(index<0?next.length:index,0,block);
  modify({blocks:next});setBlockId(block.id);setEditing(true);
 };
 const duplicateEditorialBlock=(id:string)=>{
  if(!current)return;
  if(current.blocks.length>=80){setError('A edição permite até 80 elementos.');return;}
  const index=current.blocks.findIndex(b=>b.id===id);
  if(index<0)return;
  const block=duplicateNewspaperBlock(current.blocks[index]!);
  const next=[...current.blocks];next.splice(index+1,0,block);
  modify({blocks:next});setBlockId(block.id);setEditing(true);
 };
 /** Largura e altura com refluxo: a fileira continua fechada em 12 colunas e blocos fixos não cedem espaço. */
 const resizeBlock=(id:string,patch:{span?:number;height?:number},base?:readonly NewspaperBlock[])=>{
  const source=base??current?.blocks;
  if(!source)return;
  let next=resizeWithReflow(source,id,patch);
  // Puxar a altura de uma foto desliga a altura automática; só a largura não mexe nela.
  if(patch.height!==undefined&&source.some(b=>b.id===id&&b.type==='image'))
   next=next.map(b=>b.id===id?{...b,autoHeight:false}:b);
  modify({blocks:next});setEditing(true);
 };
 const removeEditorialBlock=(id:string)=>{
  if(!current)return;
  if(current.blocks.some(b=>b.id===id&&b.pinned)){setError('Bloco fixo: destrave o cadeado antes de remover.');return;}
  modify({blocks:current.blocks.filter(b=>b.id!==id)});
  setBlockId(null);setEditing(true);
 };
 /**
  * Traz uma notícia contratada para a edição em rascunho (ou abre um novo rascunho),
  * copiando a imagem para a pasta da edição. O texto fica editável direto na folha.
  */
 const insertCommission=async(commission:NewspaperCommission)=>{
  if(!editor||busy)return;
  setBusy(true);setError('');
  let createdDraft=false;
  try{
   // Never create a contentless Cloud draft. A new commission supplies the
   // first valid article; an existing draft retains its blocks and version.
   // Verify the registered media and Storage bytes BEFORE creating a new
   // edition. A historical/unavailable source may not leave a stray draft.
   const inDraft=Boolean(current&&current.state==='draft');
   if(inDraft&&current!.blocks.some(b=>b.commissionId===commission.id)){
    const already=current!.blocks.find(b=>b.type==='article'&&b.commissionId===commission.id);
    if(!already)throw Error('O vínculo da matéria precisa ser revisado antes de anexar a imagem.');
    const photo=current!.blocks.find(b=>b.type==='image'&&b.commissionId===commission.id);
    if(commission.image_path&&!photo?.imagePath){
     if(!photo&&current!.blocks.length>=80)throw Error('A edição permite até 80 elementos.');
     if(isFirebaseNewspaperWorkspace())
      await preflightNewspaperSourceImage(commission.image_path,'commission');
     const imagePath=await copyCommissionImageToEdition(
      current!.id,commission.image_path,commission.id);
     const createdPhoto=commissionToBlocks(commission,imagePath,houseNames.get(commission.house_id))
      .find(b=>b.type==='image')!;
     setDraft(old=>old?.id===current!.id?{...old,blocks:photo?
      old.blocks.map(b=>b.id===photo.id?{...b,imagePath}:b):
      [...old.blocks.slice(0,old.blocks.findIndex(b=>b.id===already.id)+1),
       createdPhoto,
       ...old.blocks.slice(old.blocks.findIndex(b=>b.id===already.id)+1)]}:old);
     setBlockId(photo?.id??createdPhoto.id);setEditing(true);
     notice('Fotografia recuperada. Salve o rascunho para registrar o anexo.');return;
    }
    setBlockId(already.id);setEditing(true);notice('A notícia já está nesta edição.');return;
   }
   if(commission.image_path&&isFirebaseNewspaperWorkspace())
    await preflightNewspaperSourceImage(commission.image_path,'commission');
   if(!inDraft&&openWorkingDraft()){
    notice('A edição em andamento foi aberta. Clique de novo em Inserir para colocar a notícia nela.');return;
   }
   if(!inDraft){
    const blocks=commissionToBlocks(commission,undefined,houseNames.get(commission.house_id));
    const created=await createNewspaperEdition({...(await editionSeed()),blocks});
    createdDraft=true;
    // The paid article is already a valid, named, recoverable draft. Select
    // and cache it now, before any fallible media clone operation.
    setSelectedId(created.id);setDraft(cloneEditableEdition(created));
    setBlockId(created.blocks[0]?.id??null);setEditing(true);
    qc.setQueryData<NewspaperEdition[]>(['campaign-newspapers',userId],rows=>
     [created,...(rows??[]).filter(e=>e.id!==created.id)]);
    const imagePath=commission.image_path?await copyCommissionImageToEdition(
     created.id,commission.image_path,commission.id):undefined;
    const ready=commissionToBlocks(commission,imagePath,houseNames.get(commission.house_id));
    setSelectedId(created.id);setDraft({...cloneEditableEdition(created),blocks:ready});
    setBlockId(ready[0]?.id??null);setEditing(true);
    notice('Notícia e imagem preparadas no rascunho. Salve e revise antes de publicar.');
    await refresh();
    return;
   }
   const base=cloneEditableEdition(current!);
   const imagePath=commission.image_path?
    await copyCommissionImageToEdition(base.id,commission.image_path,commission.id):undefined;
   const blocks=commissionToBlocks(commission,imagePath,houseNames.get(commission.house_id));
   if(base.blocks.length+blocks.length>80)throw new Error('A edição permite até 80 elementos.');
   const next={...base,blocks:[...base.blocks,...blocks]};
   setSelectedId(next.id);setDraft(next);setBlockId(blocks[0]?.id??null);setEditing(true);
   notice('Notícia inserida. Edite o texto direto na folha e clique em Publicar Edição: ela sai das pendências ao publicar.');
   await refresh();
  }catch(cause){
   setError(createdDraft?
    'A matéria continua preservada no rascunho aberto; confira a imagem e tente novamente: '+safeError(cause):
    safeError(cause));
  }
  finally{setBusy(false);}
 };
 const rejectCommission=async(commission:NewspaperCommission,note:string)=>{
  if(!editor||busy)return;
  setBusy(true);setError('');
  try{
   await rejectNewspaperCommission(commission.id,note);
   await Promise.all([refresh(),qc.invalidateQueries({queryKey:['noble-house']})]);
   notice('Pedido recusado. A Casa recebeu a nota e 1 de Riqueza foi devolvida.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const dirty=Boolean(draft?.state==='draft'&&!selected)||
  newspaperIsDirty(draft,selected);
 // Persist synchronously before paint after every edit, not after a timer.
 // Every keystroke is protected: nothing (not even a pending recovery notice)
 // may pause this copy while the Editor-Chefe types.
 useLayoutEffect(()=>{
  if(!editorial||!editor||!draft||draft.state!=='draft'||!dirty||draft.archive_preview)return;
  if(!writeOfflineEdition(browserOfflineStore(),userId,draft))
   setOfflineStorageDenied(true);
  else{
   setOfflineStorageDenied(false);setOfflineSavedAt(Date.now());
   rememberWorkingEditionId(browserOfflineStore(),userId,draft.id);
  }
 },[editorial,editor,draft,dirty,userId]);
 // Independent IndexedDB checkpoints; localStorage continues to protect the
 // final keystroke even if the user reloads during this 1-second debounce.
 useEffect(()=>{
  if(!editorial||!editor||!draft||draft.state!=='draft'||!dirty||draft.archive_preview)return;
  const timer=window.setTimeout(()=>{
   void appendOfflineHistory(userId,draft).then(ok=>{
    if(ok)void listOfflineHistory(userId).then(setHistoryBackups).catch(()=>{});
   });
  },1000);
  return()=>window.clearTimeout(timer);
 },[editorial,editor,draft,dirty,userId]);
 // On first open, reopen the newest text kept on this device, including copies
 // the private Firebase archive cannot show. The server CAS still guards it.
 useEffect(()=>{
  if(!editorial||!editor||!selected||selected.state!=='draft'||!selectedId||
     selectedId!==selected.id||!historyLoaded||recoveryChecked.current.has(selected.id))return;
  recoveryChecked.current.add(selected.id);
  const legacy=readOfflineEdition(browserOfflineStore(),userId,selected);
  const versions=[...(legacy?[legacy]:[]),...localBackups.filter(b=>b.editionId===selected.id)]
   .sort((x,y)=>y.updatedAt-x.updatedAt);
  const backup=versions.find(b=>!sameSnapshot(b.snapshot,snapshotOf(selected)));
  if(!backup||(draft?.id===selected.id&&sameSnapshot(snapshotOf(draft),backup.snapshot)))return;
  // Text typed on screen right now is already the newest version.
  if(draft?.id===selected.id&&newspaperIsDirty(draft,selected))return;
  const serverAt=Date.parse(selected.updated_at||'');
  // The device copy continues the current Firebase version, or is newer than
  // the last Firebase save: reopen it and let autosave sync it. Firebase keeps
  // the replaced version in the revision history, so nothing is discarded.
  const newest=autoApplicableBackup(selected,versions)??
   (versions[0]&&!sameSnapshot(versions[0].snapshot,snapshotOf(selected))&&
    (Number.isFinite(serverAt)?versions[0].updatedAt>serverAt:versions[0].baseVersion>=selected.version)?versions[0]:null);
  if(newest){
   setSelectedId(selected.id);setDraft(recoverOfflineEdition(selected,newest));
   setEditing(true);setBlockId(null);
   notice('Texto deste dispositivo ('+new Date(newest.updatedAt).toLocaleString('pt-BR')+
    ') reaberto e sendo salvo no Firebase.');
   return;
  }
  // Older device copies stay listed in Arquivo; they never block writing.
 },[editorial,editor,selectedId,selected,userId,historyLoaded,localBackups]);
 const recoverLocal=()=>{
  if(!offlineRecovery||!selected||offlineRecovery.editionId!==selected.id)return;
  const restored=recoverOfflineEdition(selected,offlineRecovery);
  setDraft(restored);setSelectedId(restored.id);
  // Never upload a recovered snapshot automatically. The editor must review
  // and explicitly confirm a new Firestore revision even without a CAS conflict.
  setRecoverNeedsReview(true);
  setBlockId(restored.blocks[0]?.id??null);setEditing(true);
  setOfflineRecovery(null);
  notice('Texto local recuperado na tela. Revise e clique Salvar para registrar no Firebase.');
 };
 const discardLocal=()=>{
  if(!offlineRecovery)return;
  if(!window.confirm('Descartar definitivamente esta cópia local? O rascunho do Firebase não será alterado.'))return;
  clearOfflineEdition(browserOfflineStore(),userId,offlineRecovery.editionId);
  setOfflineRecovery(null);
  notice('Cópia local descartada; o rascunho do Firebase foi mantido.');
 };
 const revisionsQuery=useQuery({queryKey:['campaign-newspaper-revisions',current?.id],
  queryFn:()=>getNewspaperRevisions(current!.id),enabled:Boolean(editorial&&editor&&current?.id),
  staleTime:20_000,retry:false});
 // Save after 5 seconds of inactivity and at least every 30 seconds while typing. An incomplete draft is valid
 // for persistence: publication validation is NOT an autosave gate.
 useEffect(()=>{
  if(!editorial||!editor)return;
  const everyMinute=window.setInterval(()=>setMinuteTick(t=>t+1),30_000);
  const onReconnect=()=>setRetryTick(t=>t+1);
  const onVisibility=()=>{if(document.visibilityState==='visible')setRetryTick(t=>t+1);};
  window.addEventListener('online',onReconnect);
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{window.clearInterval(everyMinute);
   window.removeEventListener('online',onReconnect);
   document.removeEventListener('visibilitychange',onVisibility);};
 },[editorial,editor]);
 useEffect(()=>{
  if(!editorial||!editor||!dirty||busy||!draft||draft.state!=='draft'||
     recoverNeedsReview)return;
  const periodicDue=minuteTick>minuteHandled.current;
  const timer=window.setTimeout(()=>{
   if(periodicDue)minuteHandled.current=minuteTick;
   if(autosaving.current)return;
   if(typeof navigator!=='undefined'&&navigator.onLine===false){
    setSaveStatus('failed');
    setMessage('Sem conexão. Sua edição permanece guardada neste dispositivo e será enviada ao reconectar.');
    return;
   }
   autosaving.current=true;setSaveStatus('saving');
   void updateNewspaperEdition(draft,{
    campaign_date:draft.campaign_date,title:draft.title.trim(),subtitle:draft.subtitle,
    template:draft.template,font_style:draft.font_style,blocks:draft.blocks,
    pdf_path:draft.pdf_path,state:'draft',publish_on:draft.publish_on??null,
   }).then(result=>{
    // Preserve edits typed DURING the network request. The cached row is the
    // snapshot actually saved, so unsaved changes still appear as dirty.
    qc.setQueryData<NewspaperEdition[]>(['campaign-newspapers',userId],rows=>
     rows?.map(e=>e.id===result.id?result:e)??[result]);
    setDraft(old=>old&&old.id===result.id?{...old,version:result.version}:old);
    const at=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    setSaveStatus('saved');setSavedAt(at);
    setMessage('Rascunho salvo automaticamente às '+at+'.');
    return Promise.all([refresh(),qc.invalidateQueries({queryKey:['campaign-newspaper-revisions',result.id]})]);
   }).catch(cause=>{
    setSaveStatus('failed');
    window.clearTimeout(retryTimer.current);
    const status=(cause as {status?:unknown}|null)?.status;
    const permanent=typeof status==='number'&&status>=400&&status<500||
     cause instanceof Error&&/somente leitura|rascunho histórico|edição histórica|Anexos e publicação/i.test(cause.message);
    // Do not endlessly retry a permission, data-shape or revision conflict.
    // Keep every unsaved block visible until the editor resolves the issue.
    if(permanent&&status===409){
     // Usually our own earlier save whose answer was lost (weak connection).
     // If Firebase holds a version written by this device, continue from it.
     const sent=draft;
     void getNewspaperEditionById(sent.id).then(remote=>{
      const {selected:known,localBackups:copies}=latest.current;
      if(remote&&remote.state==='draft'&&isOwnEarlierSave(remote,known,copies)){
       setDraft(old=>old&&old.id===remote.id?{...old,version:remote.version}:old);
       setMessage('Conexão retomada: continuando o salvamento automático.');
       setRetryTick(tick=>tick+1);
      }else{
       setRecoverNeedsReview(true);
       setError('Outra versão foi salva no Firebase. Seu texto continua neste dispositivo; clique em Salvar para registrá-lo (a outra versão fica no histórico).');
      }
      return refresh();
     }).catch(()=>{
      setRecoverNeedsReview(true);
      setError('Rascunho preservado no dispositivo. Clique em Salvar quando a conexão voltar.');
     });
    }else if(permanent){
     setError('Rascunho preservado no dispositivo. Revise antes de salvar: '+safeError(cause));
    }else{
     retryTimer.current=window.setTimeout(()=>setRetryTick(tick=>tick+1),10_000);
    }
   }).finally(()=>{autosaving.current=false;});
  },periodicDue?0:5000);
  return()=>window.clearTimeout(timer);
 },[editorial,editor,dirty,busy,draft,retryTick,minuteTick,recoverNeedsReview]);
 useEffect(()=>{setSaveStatus('idle');setSavedAt('');},[selectedId]);
 useEffect(()=>{
  if(!dirty||!editor)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[dirty,editor]);
 const discardChanges=()=>{
  if(!selected||!dirty||!draft)return;
  // Sem janela de confirmação: descarta já e oferece "Desfazer descarte" por 10 s.
  setDiscardBackup(draft);
  window.clearTimeout(discardTimer.current);
  discardTimer.current=window.setTimeout(()=>setDiscardBackup(null),10_000);
  clearOfflineEdition(browserOfflineStore(),userId,selected.id);
  setDraft(cloneEditableEdition(selected));setBlockId(null);setEditing(selected.state==='draft');
  notice('Alterações descartadas. A edição voltou à última versão salva.');
 };
 const restoreDiscard=()=>{
  if(!discardBackup)return;
  window.clearTimeout(discardTimer.current);
  setDraft(discardBackup);setDiscardBackup(null);setEditing(true);
  notice('Alterações recuperadas.');
 };
 const convertEditorialBlock=(id:string,type:NewspaperBlockType)=>{
  if(!current)return;
  const block=current.blocks.find(b=>b.id===id);
  if(!block)return;
  if(block.pinned){setError('Bloco fixo: destrave o cadeado antes de transformar.');return;}
  const next=convertBlock(block,type);
  if(!next)return;
  modify({blocks:current.blocks.map(b=>b.id===id?next:b)});setEditing(true);
 };
 const deleteDraft=async()=>{
  if(!editor||busy||!current||current.state!=='draft')return;
  if(!window.confirm('Excluir este rascunho? Ele será apagado de vez. Notícias contratadas que estavam nele voltam às pendências.'))return;
  const removedId=current.id;
  setBusy(true);setError('');
  try{
   await deleteNewspaperDraft(removedId);
   clearOfflineEdition(browserOfflineStore(),userId,removedId);
   setOfflineRecovery(null);
   await refresh();
   setSelectedId(null);setDraft(null);setBlockId(null);setEditing(false);
   notice('Rascunho excluído. Você pode começar uma nova edição.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const showCommission=(commission:NewspaperCommission)=>{
  const block=current?.blocks.find(b=>b.commissionId===commission.id);
  if(block){setBlockId(block.id);setEditing(true);}
 };
const useStoryModel=async(model:StoryModel)=>{
  if(!editor||busy)return;
  const blocks=instantiateStoryModel(model);
  if(current&&current.state==='draft'){
   if(current.blocks.length+blocks.length>80){setError('A edição permite até 80 elementos.');return;}
   setDraft(old=>old?{...old,blocks:[...old.blocks,...blocks]}:old);
   setBlockId(blocks[0]?.id??null);setEditing(true);
   notice('Modelo "'+model.name+'" inserido. Clique nos textos e escreva direto na folha.');
   return;
  }
  if(openWorkingDraft(blocks))return;
  setBusy(true);setError('');
  try{
   const edition=await createNewspaperEdition({...(await editionSeed()),blocks});
   setSelectedId(edition.id);setDraft(cloneEditableEdition(edition));
   setBlockId(blocks[0]?.id??null);setEditing(true);
   notice('Nova edição criada com o modelo "'+model.name+'". Escreva direto na folha.');
   await refresh();
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const saveModel=async(input:{id?:string;name:string;description:string;blocks:NewspaperBlock[]}):Promise<boolean>=>{
  if(!editor||busy)return false;
  setBusy(true);setError('');
  try{
   await saveStoryModel(input);
   await qc.invalidateQueries({queryKey:['campaign-newspaper-story-models']});
   notice('Modelo salvo.');return true;
  }catch(cause){setError(safeError(cause));return false;}
  finally{setBusy(false);}
 };
 const removeModel=async(model:StoryModel)=>{
  if(!editor||busy)return;
  if(!window.confirm('Excluir o modelo "'+model.name+'"? As matérias já escritas não mudam.'))return;
  setBusy(true);setError('');
  try{
   await deleteStoryModel(model.id);
   await qc.invalidateQueries({queryKey:['campaign-newspaper-story-models']});
   notice('Modelo excluído.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const removeEdition=async(edition:NewspaperEdition)=>{
  if(!editor||busy)return;
  if(edition.state!=='draft'){setError('Uma edição publicada ou cancelada não pode ser apagada do acervo.');return;}
  if(!window.confirm('Descartar este rascunho? As edições publicadas e seus números permanecem preservados.'))return;
  setBusy(true);setError('');
  try{
   await deleteNewspaperEdition(edition.id);
   await refresh();
   if(selectedId===edition.id){setSelectedId(null);setDraft(null);setBlockId(null);setEditing(false);}
   notice('Rascunho descartado. A numeração oficial só avança ao publicar.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const writeAboutDate=(title:string,body:string)=>{
  if(!editor||busy)return;
  const text=`${title}\n\n${body}`;
  if(!current||current.state!=='draft'){void newEdition('article',{text});return;}
  if(current.blocks.length>=80){setError('A edição permite até 80 elementos.');return;}
  const block={...makeNewspaperBlock('article'),text};
  setDraft(old=>old?{...old,blocks:[...old.blocks,block]}:old);
  setBlockId(block.id);setEditing(true);
  notice('Matéria criada com o título da data. Escreva o texto direto na folha.');
 };
 const saveStaff=async(input:{id?:string;requestId?:string;name:string;specialty:string;bio:string;photoPath:string|null},photo:File|null):Promise<boolean>=>{
  if(!editor||busy)return false;
  setBusy(true);setError('');
  try{
   const sortOrder=input.id?undefined:staff.reduce((m,x)=>Math.max(m,(x.sort_order??0)+1),0);
   if(photo&&isFirebaseNewspaperWorkspace()){
    await saveNewspaperStaffWithPhoto({
     ...(input.id?{id:input.id}:{}),requestId:input.requestId??crypto.randomUUID(),
     name:input.name,specialty:input.specialty,bio:input.bio,
     ...(sortOrder===undefined?{}:{sortOrder}),
    },photo);
   }else{
    const photoPath=photo?await uploadStaffPhoto(photo):input.photoPath;
    await saveNewspaperStaff({...input,photoPath,...(sortOrder===undefined?{}:{sortOrder})});
   }
   await qc.invalidateQueries({queryKey:['campaign-newspaper-staff']});
   notice('Funcionário salvo na Redação.');return true;
  }catch(cause){setError(safeError(cause));return false;}
  finally{setBusy(false);}
 };
 const reorderStaff=async(id:string,targetId:string)=>{
  if(!editor||busy)return;
  const next=moveStaffMember(staff,id,targetId);
  if(next.every((m,i)=>m.id===staff[i]?.id))return;
  const ordered=next.map((m,i)=>({...m,sort_order:i}));
  qc.setQueryData(['campaign-newspaper-staff'],ordered);
  try{await reorderNewspaperStaff(ordered.map(m=>m.id));}
  catch(cause){setError('Não foi possível salvar a nova ordem da equipe: '+safeError(cause));}
  await qc.invalidateQueries({queryKey:['campaign-newspaper-staff']});
 };
 const removeStaff=async(member:NewspaperStaffMember)=>{
  if(!editor||busy)return;
  if(!window.confirm('Remover '+member.name+' da Redação? As matérias já assinadas mantêm o nome.'))return;
  setBusy(true);setError('');
  try{
   await deleteNewspaperStaff(member.id,member.photo_path);
   await qc.invalidateQueries({queryKey:['campaign-newspaper-staff']});
   notice('Funcionário removido da Redação.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const useEngraving=(src:string,label:string)=>{
  if(!current){void newEdition('image',{imageSrc:src,caption:label});return;}
  const target=current.blocks.find(b=>b.id===blockId&&b.type==='image');
  if(target){
   setDraft(old=>old?{...old,blocks:old.blocks.map(b=>{
    if(b.id!==target.id)return b;
    const {imagePath:_removed,...rest}=b;
    return {...rest,imageSrc:src,caption:b.caption&&b.caption!=='Legenda da fotografia'?b.caption:label};
   })}:old);
   setEditing(true);notice('Gravura aplicada. Ela é fixa do site e não consome armazenamento.');return;
  }
  if(current.blocks.length>=80){setError('A edição permite até 80 elementos.');return;}
  const block={...makeNewspaperBlock('image'),imageSrc:src,caption:label};
  setDraft(old=>old?{...old,blocks:[...old.blocks,block]}:old);
  setBlockId(block.id);setEditing(true);
  notice('Gravura inserida na folha.');
 };
 const uploadEngravingFile=async(file:File,name:string,requestKey?:string):Promise<boolean>=>{
  if(!editor||busy)return false;
  setBusy(true);setError('');
  try{
   await uploadEngraving(file,name,requestKey);
   await qc.invalidateQueries({queryKey:['campaign-newspaper-engravings']});
   notice('Gravura guardada em Gravuras do Reino e disponível no acervo.');return true;
  }catch(cause){setError(safeError(cause));return false;}
  finally{setBusy(false);}
 };
 const toggleEngraving=async(item:NewspaperEngraving,inCollection:boolean)=>{
  if(!editor||busy)return;
  setBusy(true);setError('');
  try{
   await setEngravingInCollection(item.id,inCollection);
   await qc.invalidateQueries({queryKey:['campaign-newspaper-engravings']});
   notice(inCollection?'Gravura aparece no acervo.':'Gravura fora do acervo; continua em Gravuras do Reino.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const removeEngraving=async(item:NewspaperEngraving)=>{
  if(!editor||busy)return;
  if(!window.confirm('Excluir a gravura '+item.name+'? Edições que já a usam mantêm a própria cópia.'))return;
  setBusy(true);setError('');
  try{
   await deleteEngraving(item.id,item.image_path);
   await qc.invalidateQueries({queryKey:['campaign-newspaper-engravings']});
   notice('Gravura excluída.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const useStoredEngraving=async(item:NewspaperEngraving)=>{
  if(!editor||busy)return;
  if(current&&current.state!=='draft'){setError('Reabra a edição como rascunho para usar uma gravura.');return;}
  // Gravura original do Reino: arquivo fixo do site, sem cópia no armazenamento.
  if(item.public_src){useEngraving(item.public_src,item.name);return;}
  if(!item.image_path){setError('Esta gravura não tem imagem.');return;}
  if(isFirebaseNewspaperWorkspace()&&!isFirebaseNewspaperMediaPath(item.image_path)){
   setError('Gravura histórica ainda não reconciliada com o Firebase Storage. Nenhum rascunho foi criado.');
   return;
  }
  setBusy(true);setError('');
  let createdDraft=false;
  try{
   if(isFirebaseNewspaperWorkspace())
    await preflightNewspaperSourceImage(item.image_path,'engraving');
   let base=current;
   if(!base&&openWorkingDraft()){
    notice('A edição em andamento foi aberta. Escolha a gravura de novo para colocá-la nela.');return;
   }
   if(!base){
    const seed=await editionSeed();
    base=cloneEditableEdition(await createNewspaperEdition({...seed,blocks:createNewspaperLayout(seed.template)}));
    createdDraft=true;
    setSelectedId(base.id);setDraft(base);setEditing(true);
    setBlockId(base.blocks[0]?.id??null);
    qc.setQueryData<NewspaperEdition[]>(['campaign-newspapers',userId],rows=>
     [base!,...(rows??[]).filter(e=>e.id!==base!.id)]);
    await refresh();
   }
   const imagePath=await copyBucketImageToEdition(ENGRAVINGS_BUCKET,base.id,item.image_path!);
   const target=base.blocks.find(b=>b.id===blockId&&b.type==='image');
   if(target){
    setDraft(old=>old?{...old,blocks:old.blocks.map(b=>{
     if(b.id!==target.id)return b;
     const {imageSrc:_removed,...rest}=b;
     return {...rest,imagePath,caption:b.caption&&b.caption!=='Legenda da fotografia'?b.caption:item.name};
    })}:old);
    setEditing(true);notice('Gravura aplicada na imagem selecionada.');return;
   }
   if(base.blocks.length>=80)throw new Error('A edição permite até 80 elementos.');
   const block={...makeNewspaperBlock('image'),imagePath,caption:item.name};
   setDraft(old=>old?{...old,blocks:[...old.blocks,block]}:old);
   setBlockId(block.id);setEditing(true);notice('Gravura inserida na folha.');
  }catch(cause){
   setError(createdDraft?
    'O rascunho continua aberto, mas a gravura não foi anexada: '+safeError(cause):
    safeError(cause));
  }
  finally{setBusy(false);}
 };
 const restoreEngravings=async()=>{
  if(!editor||busy)return;
  setBusy(true);setError('');
  try{
   const added=await restoreOriginalEngravings(engravings);
   await qc.invalidateQueries({queryKey:['campaign-newspaper-engravings']});
   notice(added>0?'Gravuras originais do Reino de volta ao acervo.':'As gravuras originais já estão no acervo.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 // ---- Desfazer / refazer e copiar / colar blocos ----
 const [history_,setHistory_]=useState<EditHistory>(emptyHistory);
 const blockClip=useRef('');
 useEffect(()=>{
  if(!editor||!draft)return;
  setHistory_(old=>recordSnapshot(old,draft.id,snapshotOf(draft),Date.now()));
 },[editor,draft]);
 const applySnapshot=(result:{history:EditHistory;snapshot:ReturnType<typeof snapshotOf>}|null,label:string)=>{
  if(!result)return;
  setHistory_(result.history);
  setDraft(old=>old?{...old,...result.snapshot}:old);
  setEditing(true);notice(label);
 };
 const undo=()=>applySnapshot(undoHistory(history_),'Alteração desfeita. Ctrl+Y refaz.');
 const redo=()=>applySnapshot(redoHistory(history_),'Alteração refeita.');
 const copyBlock=(id:string):string|null=>{
  const block=current?.blocks.find(b=>b.id===id);
  if(!block)return null;
  const text=serializeBlocks([block]);
  blockClip.current=text;
  void navigator.clipboard?.writeText(text).catch(()=>undefined);
  notice('Bloco copiado. Cole com Ctrl+V ou no botão Colar.');
  return text;
 };
 const cutBlock=(id:string):string|null=>{
  if(current?.blocks.some(b=>b.id===id&&b.pinned)){setError('Bloco fixo: destrave o cadeado antes de recortar. Copiar continua liberado.');return null;}
  const text=copyBlock(id);
  if(text===null)return null;
  removeEditorialBlock(id);
  notice('Bloco recortado. Cole com Ctrl+V ou desfaça com Ctrl+Z.');
  return text;
 };
 const pasteBlocks=async(text:string,files:File[])=>{
  if(!current||!editor)return;
  if(current.state!=='draft'&&current.state!=='cancelled'){setError('Reabra a edição como rascunho para colar.');return;}
  const image=files[0];
  if(image){void quickUpload(image);return;}
  const source=text.trim()?text:blockClip.current;
  const parsed=parseClipboardBlocks(source);
  const added=parsed??(text.trim()?[textToArticleBlock(text)].filter((b):b is NewspaperBlock=>b!==null):[]);
  if(added.length===0){setError('Não há nada para colar. Copie um bloco primeiro.');return;}
  if(current.blocks.length+added.length>80){setError('A edição permite até 80 elementos.');return;}
  const edition=current;
  const prepared:NewspaperBlock[]=[];
  let lostImages=0;
  for(const block of added){
   if(needsImageCopy(block,edition.id)){
    try{prepared.push({...block,imagePath:await copyBucketImageToEdition(PAPER_BUCKET,edition.id,block.imagePath!)});}
    catch{const {imagePath:_lost,...rest}=block;prepared.push(rest);lostImages++;}
   }else prepared.push(block);
  }
  const inserted=insertBlocksAfter(draft?.blocks??edition.blocks,blockId,prepared);
  if(!inserted.ok){setError('A edição permite até 80 elementos.');return;}
  setDraft(old=>old?.id===edition.id?{...old,blocks:inserted.blocks}:old);
  setBlockId(prepared[0]?.id??null);setEditing(true);
  notice(lostImages>0?'Bloco colado, mas a imagem de outra edição não pôde ser copiada.':
   parsed?'Bloco colado depois do selecionado.':'Texto colado como nova matéria.');
 };
 const saveSettings=async(input:NewspaperSettings):Promise<boolean>=>{
  if(!editor||busy)return false;
  const problem=validateNewspaperSettings(input);
  if(problem){setError(problem);return false;}
  setBusy(true);setError('');
  try{
   const saved=await saveNewspaperSettings(input);
   qc.setQueryData(['campaign-newspaper-settings'],saved);
   const applies=current?.state==='draft';
   if(applies){setDraft(old=>old?{...old,...saved}:old);setEditing(true);}
   notice(applies?'Configurações salvas. O rascunho aberto já usa o novo estilo; salve a edição para registrar.':
    'Configurações salvas. Valem para as próximas edições.');
   return true;
  }catch(cause){setError(safeError(cause));return false;}
  finally{setBusy(false);}
 };
 const restoreRevision=(revision:NewspaperRevision)=>{
  if(!current||current.state==='published'||current.state==='archived'){
   setError('Reabra a edição como rascunho antes de restaurar uma versão.');return;
  }
  const snap=revision.snapshot;
  if(!window.confirm('Restaurar a versão '+revision.previous_version+'? O conteúdo atual será substituído na tela e você poderá salvar ou descartar.'))return;
  setDraft(old=>old?{...old,
   title:typeof snap.title==='string'?snap.title:old.title,
   subtitle:typeof snap.subtitle==='string'?snap.subtitle:old.subtitle,
   campaign_date:typeof snap.campaign_date==='string'?snap.campaign_date:old.campaign_date,
   blocks:safeNewspaperBlocks(snap.blocks),
  }:old);
  setBlockId(null);setEditing(true);
  notice('Versão '+revision.previous_version+' restaurada na tela. Salve para confirmar ou descarte para voltar.');
 };
 const workingNow=current?.state==='draft'&&!current.archive_preview?current:workingDraftOf(history);
 const recovery=editions.isPending?undefined:{
  candidates:recoveryCandidates(history,localBackups,workingNow?.id??null),
  workingId:workingNow?.id??null,nextNumber:workingNow?.edition_no??null,
  draftCount:editableDrafts(history).length,unreadable:unreadableNewspaperDrafts(),
  onUse:(candidate:RecoveryCandidate)=>{void applyRecoveryVersion(candidate);},
  onKeepOnlyWorking:()=>{void keepOnlyWorking();},
 };
 if(editorial&&editor)return <NewspaperEditorialDesk
  userId={userId} current={current} history={history} reads={reads}
  publicReads={publicReadsQuery.data} {...(missivas!==undefined?{missivas}:{})}
  loading={editions.isPending&&issuedArchive.isPending} editing={editing} busy={busy}
  archiveNotice={issuedArchive.data?.length&&editions.isPending?
   'Edições publicadas recuperadas; carregando os rascunhos do arquivo privado.':undefined}
  archiveError={editions.isError?
   'A consulta privada falhou: '+safeError(editions.error)+' As publicações permanecem disponíveis no arquivo público.':
   issuedArchive.isError?'Não foi possível consultar o arquivo público: '+safeError(issuedArchive.error):undefined}
  onRetryArchive={()=>{void editions.refetch();void issuedArchive.refetch();}}
  localBackups={localBackups} onExportLocalBackup={exportLocalBackup} onRecoverLocalBackup={recoverBackup}
  recovery={recovery}
  onExportCurrent={exportCurrent}
  selectedBlockId={blockId} error={error} message={message}
  hubDate={hubDate} settings={settings} onSaveSettings={saveSettings}
  pendingCommissions={pending} houseNames={houseNames}
  onInsertCommission={commission=>{void insertCommission(commission);}}
  onShowCommission={showCommission}
  onRejectCommission={(commission,note)=>{void rejectCommission(commission,note);}}
  storyModels={storyModels} onUseStoryModel={model=>{void useStoryModel(model);}}
  onSaveStoryModel={saveModel} onDeleteStoryModel={model=>{void removeModel(model);}}
  onDeleteEdition={edition=>{void removeEdition(edition);}}
  engravings={engravings} onUploadEngraving={uploadEngravingFile}
  onToggleEngraving={(item,value)=>{void toggleEngraving(item,value);}}
  onDeleteEngraving={item=>{void removeEngraving(item);}}
  onUseStoredEngraving={item=>{void useStoredEngraving(item);}}
  engravingsLoading={engravingsQuery.isPending} onRestoreEngravings={()=>{void restoreEngravings();}}
  staff={staff} onSaveStaff={saveStaff} onDeleteStaff={member=>{void removeStaff(member);}}
  onReorderStaff={(id,targetId)=>{void reorderStaff(id,targetId);}}
  onWriteAboutDate={writeAboutDate}
  commissions={allCommissions}
  revisions={revisionsQuery.data??[]} onRestoreRevision={restoreRevision}
  canUndo={canUndo(history_)} canRedo={canRedo(history_)} canPasteBlock={blockClip.current!==''}
  onUndo={undo} onRedo={redo} onCopyBlock={copyBlock} onCutBlock={cutBlock}
  onPasteBlock={(text,files)=>{void pasteBlocks(text,files);}}
  saveState={{status:saveStatus,...(savedAt?{at:savedAt}:{}),dirty}}
  offlineRecovery={offlineRecovery}
  offlineStorageDenied={offlineStorageDenied}
  offlineSavedAt={offlineSavedAt}
  offlineNeedsReview={recoverNeedsReview}
  onRecoverOffline={recoverLocal} onDiscardOffline={discardLocal}
  canRestoreDiscard={discardBackup!==null} onRestoreDiscard={restoreDiscard}
  onConvertBlock={convertEditorialBlock}
  dirty={dirty} onDiscard={discardChanges} onDeleteDraft={()=>{void deleteDraft();}}
  onNew={type=>{void newEdition(type);}}
  onOpen={edition=>{void open(edition);}}
  onSave={state=>{void save(state);}}
  onEdit={()=>{if(!current?.archive_preview)setEditing(true);}}
  onPreview={()=>setEditing(false)}
  onPatch={patch=>{if(current?.archive_preview)return;modify(patch);setEditing(true);}}
  onSelectBlock={setBlockId} onPatchBlock={editBlock}
  onAddBlock={addEditorialBlock} onRemoveBlock={removeEditorialBlock}
  onMoveBlock={(id,direction)=>{moveBlock(id,direction);setEditing(true);}}
  onDuplicateBlock={duplicateEditorialBlock}
  onReorderBlock={reorderEditorialBlock}
  onInsertBefore={insertEditorialBefore}
  onResizeBlock={resizeBlock}
  onUpload={file=>{void quickUpload(file);}}
  onCancel={()=>{void save('cancelled');}}
  onSignout={()=>onSignout?.()}
 />;

 return <section className="newspaper-hub" aria-label="Jornal de Cormyr">
  <header className="newspaper-hub-heading">
   <p className="newspaper-kicker">A IMPRENSA DO REINO</p>
   <h2>Jornal de Cormyr</h2>
   <p>{editor?'Redação e arquivo de edições: Narrador e Leonardo.':'As notícias que atravessam Cormyr, impressas em papel e história.'}</p>
   {editor&&<Button onClick={()=>void newEdition()} disabled={busy}><Plus size={16}/> Nova edição</Button>}
  </header>
  {error&&<p className="newspaper-alert" role="alert">{error}</p>}
  {message&&<p className="newspaper-notice" role="status">{message}</p>}
  {!editor&&houseId&&!commissionsQuery.isError&&<CommissionForm houseId={houseId} userId={userId} commissions={allCommissions}/>}
  {editor&&pending.length>0&&<section className="newspaper-commission" aria-label="Notícias contratadas pendentes">
   <header><div><strong>Notícias contratadas pendentes ({pending.length})</strong>
    <span>Insira na edição em rascunho, edite o texto e publique. Ao publicar, saem desta lista.</span></div></header>
   <CommissionInbox commissions={pending} houseNames={houseNames} edition={current} busy={busy}
    onInsert={commission=>{void insertCommission(commission);}} onShow={showCommission}
    onReject={(commission,note)=>{void rejectCommission(commission,note);}}/>
  </section>}
  <div className="newspaper-hub-layout">
   <aside className="newspaper-edition-list" aria-label="Histórico de jornais">
    <h3>{editor?'Edições e histórico':'Edições recebidas'} {count>0&&!editor&&<span className="newspaper-new-count">{count} nova(s)</span>}</h3>
    {editions.isPending?<p role="status">Carregando edições…</p>:editions.isError?<p role="alert">Não foi possível consultar as edições. {safeError(editions.error)}</p>:history.length===0?
     <p>{editor?'Nenhuma edição criada. Clique em “Nova edição”.':'Nenhum jornal publicado até o momento.'}</p>:
     <div className="newspaper-edition-scroll">
      {history.map(e=><button key={e.id} type="button"
       className={`newspaper-edition-button${selectedId===e.id?' active':''}`}
       onClick={()=>void open(e)} disabled={busy}>
        <span className="newspaper-edition-top">Nº {String(e.edition_no).padStart(3,'0')} · {formatDate(e.campaign_date)}</span>
        <strong>{e.title}</strong>
        <span className="newspaper-edition-bottom">{editor?newspaperStatus(e.state):
         newspaperIsUnread(e,myReads.get(e.id))?'● Não lida':'✓ Lida'}</span>
       </button>)}
     </div>}
   </aside>
   <div className="newspaper-workspace">
    {!displayEdition?<div className="newspaper-empty-state">
     <Newspaper size={42}/><h3>Seu jornal, em uma página</h3>
     <p>{editor?'Crie uma edição com modelo pronto, edite os blocos e publique em poucos cliques.':'Selecione uma edição à esquerda para começar a leitura.'}</p>
    </div>:<>
     <div className="newspaper-workspace-bar">
      <div className="newspaper-edition-steps">
       <button type="button" disabled={busy||!olderEdition} onClick={()=>{if(olderEdition)void open(olderEdition);}}
        title={olderEdition?`Nº ${olderEdition.edition_no}`:'Esta é a edição mais antiga'}>
        <ChevronLeft size={15}/> Edição anterior</button>
       <button type="button" disabled={busy||!newerEdition} onClick={()=>{if(newerEdition)void open(newerEdition);}}
        title={newerEdition?`Nº ${newerEdition.edition_no}`:'Esta é a edição mais recente'}>
        Próxima edição <ChevronRight size={15}/></button>
      </div>
      <div><span>EDIÇÃO Nº {displayEdition.edition_no}</span>
       <strong>{newspaperStatus(displayEdition.state)}</strong>
       {editor&&['published','archived'].includes(displayEdition.state)&&
        <small><Eye size={14}/> {readers} leitura(s) confirmada(s) desta versão</small>}
      </div>
      {!editor&&['published','archived'].includes(displayEdition.state)&&
       !newspaperIsUnread(displayEdition,myReads.get(displayEdition.id))&&
       <div className="newspaper-action-buttons">
        <Button variant="outline" onClick={()=>{void markUnread(displayEdition);}}>
         <EyeOff size={15}/> Marcar como não lida</Button>
       </div>}
      {editor&&<div className="newspaper-action-buttons">
       {!editing&&<Button variant="outline" onClick={()=>{setEditing(true);setBlockId(displayEdition.blocks[0]?.id??null);}}>Editar edição</Button>}
       {editing&&<Button variant="outline" disabled={busy} onClick={()=>void save()}><Save size={15}/> Salvar</Button>}
       {editing&&displayEdition.state!=='published'&&
        <Button disabled={busy} onClick={()=>void save('published')}><Send size={15}/> Publicar</Button>}
       {editing&&displayEdition.state==='published'&&
        <Button disabled={busy} onClick={()=>void save('published')}><Send size={15}/> Salvar republicação</Button>}
       {['published'].includes(displayEdition.state)&&
        <Button variant="outline" disabled={busy} onClick={()=>void save('archived')}><Archive size={15}/> Arquivar</Button>}
       {displayEdition.state!=='cancelled'&&displayEdition.state!=='draft'&&
        <Button variant="outline" disabled={busy} onClick={()=>void save('cancelled')}>Cancelar envio</Button>}
       {displayEdition.state==='draft'&&
        <Button variant="outline" disabled={busy} onClick={()=>void deleteDraft()}><Trash2 size={15}/> Excluir rascunho</Button>}
       {displayEdition.state==='cancelled'&&
        <Button variant="outline" disabled={busy} onClick={()=>{modify({state:'draft'});setEditing(true);notice('Edição preparada para reabertura. Clique em Salvar.');}}><Undo2 size={15}/> Reabrir</Button>}
       {displayEdition.state==='archived'&&
        <Button variant="outline" disabled={busy} onClick={()=>{modify({state:'published'});setEditing(true);notice('Clique em Publicar para retornar a edição à circulação.');}}><Undo2 size={15}/> Republicar</Button>}
      </div>}
     </div>
     <div className={editing?'newspaper-edit-layout':'newspaper-read-layout'}>
      {editing&&editor&&<aside className="newspaper-editor-panel" aria-label="Ferramentas de diagramação">
       <h3><LayoutTemplate size={17}/> Editar jornal</h3>
       <label>Nome do jornal<input value={displayEdition.title}
        maxLength={180} onChange={e=>modify({title:e.target.value})}/></label>
       <label>Subtítulo da edição<input value={displayEdition.subtitle}
        maxLength={240} placeholder="Ex.: Notícias da corte e das fronteiras"
        onChange={e=>modify({subtitle:e.target.value})}/></label>
       <CampaignDatePicker value={displayEdition.campaign_date}
        referenceDate={hubDate||undefined}
        onChange={value=>modify({campaign_date:value})}/>
       <label>Modelo de página<select value={displayEdition.template}
        onChange={e=>changeTemplate(e.target.value as NewspaperTemplate)}>
        {NEWSPAPER_TEMPLATES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
       </select></label>
       <label>Estilo das letras<select value={displayEdition.font_style}
        onChange={e=>modify({font_style:e.target.value as NewspaperEdition['font_style']})}>
        {NEWSPAPER_FONTS.map(font=><option key={font.value} value={font.value}>{font.label}</option>)}
       </select></label>
       <div className="newspaper-editor-divider"/>
       <strong>Adicionar à página</strong>
       <div className="newspaper-block-add">
        <button type="button" onClick={()=>addBlock('headline')}><Plus size={14}/> Manchete</button>
        <button type="button" onClick={()=>addBlock('article')}><Plus size={14}/> Texto</button>
        <button type="button" onClick={()=>addBlock('image')}><ImagePlus size={14}/> Imagem</button>
        <button type="button" onClick={()=>addBlock('quote')}><Plus size={14}/> Citação</button>
        <button type="button" onClick={()=>addBlock('notice')}><Plus size={14}/> Aviso</button>
       </div>
       <p className="newspaper-editor-tip">Clique em qualquer bloco da página para editar. Arraste ↘ no canto para ajustar o tamanho.</p>
       {chosenBlock&&<div className="newspaper-block-properties">
        <header><strong>{chosenBlock.type==='headline'?'Manchete':chosenBlock.type==='article'?'Reportagem':
         chosenBlock.type==='image'?'Fotografia':chosenBlock.type==='notice'?'Aviso':'Destaque'}</strong>
         <div>
          <button type="button" title="Subir" aria-label="Mover bloco para cima"
           onClick={()=>moveBlock(chosenBlock.id,-1)}><ArrowUp size={15}/></button>
          <button type="button" title="Descer" aria-label="Mover bloco para baixo"
           onClick={()=>moveBlock(chosenBlock.id,1)}><ArrowDown size={15}/></button>
          <button type="button" title="Duplicar" aria-label="Duplicar bloco" onClick={()=>duplicateEditorialBlock(chosenBlock.id)}>⧉</button>
          <button type="button" title="Remover" aria-label="Remover bloco"
           onClick={()=>removeEditorialBlock(chosenBlock.id)}><Trash2 size={15}/></button>
         </div>
        </header>
        {chosenBlock.type!=='image'&&<label>Conteúdo
         <textarea rows={chosenBlock.type==='article'?8:4} value={chosenBlock.text}
          onChange={e=>modifyBlock(chosenBlock.id,{text:e.target.value})}
          onKeyDown={e=>handleNewspaperTextareaTab(e,text=>modifyBlock(chosenBlock.id,{text}))}
          placeholder={chosenBlock.type==='article'?'Título na primeira linha, depois o texto':''}/>
        </label>}
        {chosenBlock.type!=='image'&&<div role="group" aria-label="Tipografia do bloco">
         {chosenBlock.type!=='quote'&&<label>Fonte do título
          <select aria-label="Fonte do título" value={chosenBlock.titleFont??'padrao'}
           onChange={e=>modifyBlock(chosenBlock.id,{titleFont:e.target.value as NonNullable<NewspaperBlock['titleFont']>})}>
           {NEWSPAPER_TYPEFACES.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
          </select></label>}
         {chosenBlock.type!=='subtitle'&&<label>Fonte do texto
          <select aria-label="Fonte do texto" value={chosenBlock.bodyFont??'padrao'}
           onChange={e=>modifyBlock(chosenBlock.id,{bodyFont:e.target.value as NonNullable<NewspaperBlock['bodyFont']>})}>
           {NEWSPAPER_TYPEFACES.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
          </select></label>}
        </div>}
        {chosenBlock.type==='image'&&<>
         <label className="newspaper-upload">Inserir fotografia
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
           onChange={e=>{const file=e.target.files?.[0]??null;e.target.value='';void upload(file,'image');}}/>
         </label>
         <label>Legenda<input value={chosenBlock.caption??''}
          onChange={e=>modifyBlock(chosenBlock.id,{caption:e.target.value})}/></label>
        </>}
        <label>Largura ({chosenBlock.span}/12)
         <input type="range" min="3" max="12" step="1" value={chosenBlock.span}
          onChange={e=>modifyBlock(chosenBlock.id,{span:Number(e.target.value)})}/>
        </label>
        {chosenBlock.type==='headline'&&<>
         <label>Subtítulo da manchete<input value={chosenBlock.subtitle??''}
          onChange={e=>modifyBlock(chosenBlock.id,{subtitle:e.target.value})}/></label>
         <label>Alinhamento<select value={chosenBlock.align??'left'}
          onChange={e=>modifyBlock(chosenBlock.id,{align:e.target.value as 'left'|'center'})}>
          <option value="left">À esquerda</option><option value="center">Centralizado</option>
         </select></label>
        </>}
        {chosenBlock.type==='article'&&<label>Assinatura do correspondente
         <input value={chosenBlock.byline??''} maxLength={120}
          onChange={e=>modifyBlock(chosenBlock.id,{byline:e.target.value})}/></label>}
        {chosenBlock.type==='notice'&&<label>Selo do aviso
         <select value={chosenBlock.icon??'⚜'} onChange={e=>modifyBlock(chosenBlock.id,{icon:e.target.value})}>
          {['⚜','📜','🏪','⚔','⚠','👑'].map(icon=><option key={icon} value={icon}>{icon}</option>)}
         </select></label>}
        {chosenBlock.type==='image'&&<>
         <label>Estilo da gravura<select value={chosenBlock.imageStyle??'vintage'}
          onChange={e=>modifyBlock(chosenBlock.id,{imageStyle:e.target.value as 'vintage'|'woodcut'|'original'})}>
          <option value="vintage">Pergaminho</option><option value="woodcut">Xilogravura</option><option value="original">Original</option>
         </select></label>
         <label className="newspaper-inline-check"><input type="checkbox"
          checked={chosenBlock.autoHeight!==false}
          onChange={e=>modifyBlock(chosenBlock.id,{autoHeight:e.target.checked})}/> Altura automática</label>
         {chosenBlock.autoHeight===false&&<label>Altura da foto
          <input type="range" min="130" max="650" step="10" value={chosenBlock.height}
           onChange={e=>modifyBlock(chosenBlock.id,{height:Number(e.target.value)})}/>
         </label>}
        </>}
       </div>}
       <div className="newspaper-editor-divider"/>
       <label className="newspaper-upload"><FileText size={17}/> Anexar jornal em PDF
        <input type="file" accept="application/pdf,.pdf" disabled={busy}
         onChange={e=>{const file=e.target.files?.[0]??null;e.target.value='';void upload(file,'pdf');}}/>
       </label>
       {displayEdition.pdf_path&&<button type="button" className="newspaper-remove-pdf"
        onClick={()=>modify({pdf_path:null})}>Retirar PDF desta edição</button>}
       <p className="newspaper-editor-tip">PDFs e imagens ficam privados até a publicação. Arquivos de até 15 MB.</p>
       <Button disabled={busy} onClick={()=>void save()}><Check size={16}/> Salvar alterações</Button>
      </aside>}
      <div className="newspaper-preview">
       <NewspaperCanvas compactMasthead edition={displayEdition} editing={editing&&editor}
        selectedId={blockId} onSelect={setBlockId}
        onResize={resizeBlock}
        onChangeBlock={editBlock} onReorderBlock={reorderEditorialBlock}
        onInsertBlock={insertEditorialBefore}/>
      </div>
     </div>
    </>}
   </div>
  </div>
  {!editor&&!staffQuery.isError&&<NewspaperTeam staff={staff} loading={staffQuery.isPending}/>}
 </section>;
}

import {useMemo,useRef,useState} from 'react';
import {
 BookOpen,Layers3,CalendarDays,UsersRound,Megaphone,Archive,
 BarChart3,Settings,Feather,FileUp,Eye,Newspaper,
 ImagePlus,Columns3,Quote,TriangleAlert,Plus,Printer,ChevronDown,
 ArrowUp,ArrowDown,Trash2,Save,CheckCircle2,Circle,
 Undo2,Redo2,Copy,Scissors,ClipboardPaste,CalendarClock,ChevronLeft,ChevronRight,Keyboard,List,
} from 'lucide-react';
import {ChangePasswordButton} from '@/components/change-password';
import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {formatCampaignPeriod,formatDate,parseDate} from '@/lib/calendar/harptos';
import {NEWSPAPER_FONTS,NEWSPAPER_TEMPLATES,NEWSPAPER_WIDTH_PRESETS,newspaperStatus,safeNewspaperBlocks,
 sampleNewspaperBlocks,dateStoryDraft,NEWSPAPER_IMAGE_FOCUS,staffByline,NEWSPAPER_NOTICE_ICONS,type StoryModel,type NewspaperStaffMember,
 type NewspaperBlock,type NewspaperBlockType,type NewspaperEdition,
 type NewspaperCommission,type NewspaperRevision,type NewspaperEngraving,collectionEngravings,
 type NewspaperSettings,storyModelPreviewEdition,type NewspaperRead,type NewspaperState,type NewspaperTemplate} from '@/lib/newspaper/model';
import {
 CONVERTIBLE_LABELS,blockFocus,blockSummary,blockWords,clampCropZoom,editionWords,publicationIssues,readingMinutes,
 saveStatusText,validateSchedule,wordsLabel,type PublicationIssue,type SaveState,
} from '@/lib/newspaper/editing';
import {useNewspaperShortcuts} from './useNewspaperShortcuts';
import {NewspaperShortcutHelp,NewspaperSlashMenu} from './NewspaperKeyboardUi';
import {NewspaperCanvas} from './NewspaperCanvas';
import {CommissionInbox} from './NewspaperCommissions';
import {NewspaperCalendar} from './NewspaperCalendar';
import {NewspaperAudit} from './NewspaperAudit';
import {NewspaperStaff} from './NewspaperStaff';
import {NewspaperStoryModels} from './NewspaperStoryModels';
import {NewspaperEngravings,StoredEngravingImage} from './NewspaperEngravings';
import './newspaper-editorial.css';

const NAV=[
 {id:'painel',label:'Painel do Jornal',icon:BookOpen},
 {id:'capa',label:'Escrever o Jornal',icon:Feather},
 {id:'materias',label:'Matérias',icon:Layers3},
 {id:'calendario',label:'Calendário',icon:CalendarDays},
 {id:'redacao',label:'Redação',icon:UsersRound},
 {id:'anuncios',label:'Anúncios',icon:Megaphone},
 {id:'arquivo',label:'Arquivo',icon:Archive},
 {id:'alcance',label:'Leitura e Alcance',icon:BarChart3},
 {id:'configuracoes',label:'Configurações',icon:Settings},
] as const;
type Section=typeof NAV[number]['id'];

export interface NewspaperEditorialProps{
 userId:string;
 current:NewspaperEdition|null;
 history:NewspaperEdition[];
 reads:NewspaperRead[];
 loading:boolean;
 editing:boolean;busy:boolean;
 selectedBlockId:string|null;
 error:string;message:string;
 hubDate:string;
 /** Identidade do jornal: vale sem edição aberta e define a fonte do título do site. */
 settings:NewspaperSettings;
 onSaveSettings:(input:NewspaperSettings)=>Promise<boolean>;
 /** Notícias contratadas pelas Casas, ainda não publicadas. */
 pendingCommissions:NewspaperCommission[];
 /** Todos os pedidos (inclusive publicados e recusados) para a auditoria. */
 commissions:NewspaperCommission[];
 houseNames:Map<string,string>;
 onInsertCommission:(commission:NewspaperCommission)=>void;
 onShowCommission:(commission:NewspaperCommission)=>void;
 onRejectCommission:(commission:NewspaperCommission,note:string)=>void;
 /** Modelos de matéria personalizados (os 6 prontos vêm do código). */
 storyModels:StoryModel[];
 onUseStoryModel:(model:StoryModel)=>void;
 onSaveStoryModel:(input:{id?:string;name:string;description:string;blocks:NewspaperBlock[]})=>Promise<boolean>;
 onDeleteStoryModel:(model:StoryModel)=>void;
 /** Exclui uma edição do Arquivo (o número volta a ficar livre). */
 onDeleteEdition:(edition:NewspaperEdition)=>void;
 /** Gravuras do Reino enviadas pelo Editor-Chefe. */
 engravings:NewspaperEngraving[];
 onUploadEngraving:(file:File,name:string)=>Promise<boolean>;
 onToggleEngraving:(item:NewspaperEngraving,inCollection:boolean)=>void;
 onDeleteEngraving:(item:NewspaperEngraving)=>void;
 onUseStoredEngraving:(item:NewspaperEngraving)=>void;
 engravingsLoading:boolean;
 /** Devolve ao acervo as gravuras originais do Reino que foram excluídas. */
 onRestoreEngravings:()=>void;
 /** Corpo de funcionários da Redação. */
 staff:NewspaperStaffMember[];
 onSaveStaff:(input:{id?:string;name:string;specialty:string;bio:string;photoPath:string|null},photo:File|null)=>Promise<boolean>;
 onDeleteStaff:(member:NewspaperStaffMember)=>void;
 /** Calendário: cria (ou abre) a matéria "Dia de X" já preenchida. */
 onWriteAboutDate:(title:string,body:string)=>void;
 /** Versões anteriores desta edição, guardadas pelo banco a cada salvamento. */
 revisions:NewspaperRevision[];
 onRestoreRevision:(revision:NewspaperRevision)=>void;
 /** Desfazer e refazer a edição aberta; copiar, recortar e colar blocos (também por Ctrl+Z/Y/C/X/V). */
 canUndo:boolean;canRedo:boolean;canPasteBlock:boolean;
 onUndo:()=>void;onRedo:()=>void;
 onCopyBlock:(id:string)=>string|null;
 onCutBlock:(id:string)=>string|null;
 onPasteBlock:(text:string,files:File[])=>void;
 /** Há alterações ainda não salvas. */
 dirty:boolean;
 /** Situação do salvamento automático, mostrada junto das ferramentas de edição. */
 saveState:SaveState;
 /** Depois de descartar, o Editor-Chefe tem alguns segundos para recuperar as alterações. */
 canRestoreDiscard:boolean;
 onRestoreDiscard:()=>void;
 /** Transforma um bloco de texto em outro tipo sem perder o que foi escrito. */
 onConvertBlock:(id:string,type:NewspaperBlockType)=>void;
 onDiscard:()=>void;
 onDeleteDraft:()=>void;
 onNew:(type?:NewspaperBlockType)=>void;
 onOpen:(edition:NewspaperEdition)=>void;
 onSave:(state?:NewspaperState)=>void;
 onEdit:()=>void;
 onPreview:()=>void;
 onPatch:(patch:Partial<NewspaperEdition>)=>void;
 onSelectBlock:(id:string)=>void;
 onPatchBlock:(id:string,patch:Partial<NewspaperBlock>)=>void;
 onAddBlock:(type:NewspaperBlockType,span?:number)=>void;
 onRemoveBlock:(id:string)=>void;
 onMoveBlock:(id:string,direction:-1|1)=>void;
 onDuplicateBlock:(id:string)=>void;
 onReorderBlock:(fromId:string,toId:string)=>void;
 onInsertBefore:(type:NewspaperBlockType,beforeId:string|null)=>void;
 onResizeBlock:(id:string,patch:{span?:number;height?:number},base:readonly NewspaperBlock[])=>void;
 onUpload:(file:File)=>void;
 onCancel:()=>void;
 onSignout:()=>void;
}

export function NewspaperEditorialDesk(props:NewspaperEditorialProps){
 const {current,history,reads,editing,busy,selectedBlockId}=props;
 const [section,setSection]=useState<Section>('painel');
 const [dateOpen,setDateOpen]=useState(false);
 const [profileOpen,setProfileOpen]=useState(false);
 const [fullPreview,setFullPreview]=useState(false);
 const [showEngravings,setShowEngravings]=useState(false);
 // Rascunho local das Configurações: a prévia e o título do site mudam na hora; o banco só ao salvar.
 const [settingsDraft,setSettingsDraft]=useState<NewspaperSettings|null>(null);
 const identity=settingsDraft??props.settings;
 const settingsDirty=settingsDraft!==null&&JSON.stringify(settingsDraft)!==JSON.stringify(props.settings);
 const patchSettings=(patch:Partial<NewspaperSettings>)=>setSettingsDraft({...identity,...patch});
 const [scheduleOpen,setScheduleOpen]=useState(false);
 const [checkOpen,setCheckOpen]=useState(false);
 const [slashOpen,setSlashOpen]=useState(false);
 const [helpOpen,setHelpOpen]=useState(false);
 const [scheduleError,setScheduleError]=useState('');
 const fileInput=useRef<HTMLInputElement>(null);
 const selectedBlock=current?.blocks.find(b=>b.id===selectedBlockId);
 const articles=current?.blocks.filter(b=>b.type==='article')??[];
 const headlines=current?.blocks.filter(b=>b.type==='headline')??[];
 const notices=current?.blocks.filter(b=>b.type==='notice')??[];
 const toolboxDrag=(event:React.DragEvent<HTMLButtonElement>,type:NewspaperBlockType)=>{
  event.dataTransfer.setData('application/x-cormyr-newspaper-tool',type);
  event.dataTransfer.effectAllowed='copy';
 };
 const latestPublished=useMemo(()=>{
  const list=history.filter(e=>e.state==='published'||e.state==='archived')
   .sort((a,b)=>b.edition_no-a.edition_no);
  const edition=list[0];
  return edition?{...edition,blocks:safeNewspaperBlocks(edition.blocks)}:null;
 },[history]);
 const previewBlocks=useMemo(()=>sampleNewspaperBlocks(identity.template),[identity.template]);
 const pdfReady=Boolean(current?.pdf_path);
 const materialReady=Boolean(current&&(current.blocks.some(b=>b.type==='headline'||b.type==='article'||b.imagePath||b.imageSrc)||pdfReady));
 const countReads=(edition:NewspaperEdition)=>reads.filter(r=>r.newspaper_id===edition.id&&r.read_version>=edition.publication_revision).length;
 const dateLabel=(value:string)=>{const d=parseDate(value);return d?formatCampaignPeriod(d):'Data indisponível';};
 const openCover=()=>{
  setSection('capa');setFullPreview(false);
  if(current){props.onEdit();if(current.blocks[0])props.onSelectBlock(current.blocks[0].id);}
 };
 const writeArticle=()=>{setSection('capa');setFullPreview(false);
  if(!current)props.onNew('article');else props.onAddBlock('article');};
 const insert=(type:NewspaperBlockType,span?:number)=>{
  setSection('capa');setFullPreview(false);
  if(!current)props.onNew(type);else props.onAddBlock(type,span);
 };
 const chooseSection=(value:Section)=>{
  setSection(value);setFullPreview(false);
  if(value==='capa'&&current)props.onEdit();
 };
 const browseEdition=(edition:NewspaperEdition)=>{props.onOpen(edition);setSection('capa');setFullPreview(false);};
 const hasUnsavedChanges=current&&editing;
 const availableHistory=history.filter(e=>e.state!=='cancelled');
 const totalViews=history.reduce((total,edition)=>total+countReads(edition),0);

 const currentDate=current?.campaign_date??props.hubDate;
 const totalWords=current?editionWords(current.blocks):0;
 const minutes=readingMinutes(totalWords);
 const editingSheet=section==='capa'&&editing&&Boolean(current)&&!fullPreview;
 const publishIssues=useMemo<PublicationIssue[]>(()=>current?publicationIssues(current.blocks):[],[current]);
 /** Conferência antes de publicar: se houver pendências, mostra a lista e deixa publicar mesmo assim. */
 const requestPublish=()=>{
  if(publishIssues.length===0){setCheckOpen(false);props.onSave('published');return;}
  setCheckOpen(true);
 };
 const goToBlock=(id:string)=>{
  setSection('capa');setFullPreview(false);setCheckOpen(false);
  props.onSelectBlock(id);if(!editing)props.onEdit();
  window.setTimeout(()=>{
   const el=Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).find(node=>node.dataset['blockId']===id);
   el?.scrollIntoView?.({block:'center',behavior:'smooth'});el?.focus();
  },60);
 };
 const slashInsert=(type:NewspaperBlockType)=>{
  setSlashOpen(false);
  const index=current?current.blocks.findIndex(b=>b.id===selectedBlockId):-1;
  const beforeId=current&&index>=0?current.blocks[index+1]?.id??null:null;
  props.onInsertBefore(type,beforeId);
 };
 useNewspaperShortcuts({
  active:editingSheet&&!slashOpen&&!helpOpen,selectedId:selectedBlockId,
  onSlash:()=>setSlashOpen(true),onHelp:()=>setHelpOpen(true),
  onUndo:props.onUndo,onRedo:props.onRedo,onCopy:props.onCopyBlock,onCut:props.onCutBlock,
  onPaste:props.onPasteBlock,onRemove:props.onRemoveBlock,onDuplicate:props.onDuplicateBlock,
 });
 const stepEdition=(direction:-1|1)=>{
  // O histórico vem do mais novo para o mais antigo: +1 é a edição anterior.
  const index=current?history.findIndex(e=>e.id===current.id):-1;
  const target=history[index+direction];
  if(index>=0&&target)browseEdition(target);
 };
 const currentIndex=current?history.findIndex(e=>e.id===current.id):-1;
 const chooseSchedule=(value:string)=>{
  const problem=validateSchedule(value,props.hubDate);
  if(problem){setScheduleError(problem);return;}
  setScheduleError('');setScheduleOpen(false);props.onPatch({publish_on:value});
 };
 return <div className="folha-editorial" aria-label="Redação A Folha Sem Selo">
  <header className={`folha-topbar folha-font-${identity.font_style}`}>
   <div className="folha-top-brand">
    <p><span aria-hidden="true">✦</span> JORNAL</p>
    <h1>{identity.title}</h1>
    {identity.subtitle&&<span className="folha-top-slogan">{identity.subtitle}</span>}
   </div>
   <div className="folha-top-account">
    <button type="button" className="folha-role" aria-expanded={profileOpen}
      onClick={()=>setProfileOpen(value=>!value)}>
      <UsersRound size={19}/> Leonardo · Editor-Chefe <ChevronDown size={14}/>
    </button>
    {profileOpen&&<div className="folha-account-menu">
     <p>Acesso exclusivo à redação de A Folha Sem Selo.</p>
    </div>}
    <div className="folha-account-buttons"><ChangePasswordButton/>
     <button className="folha-logout" type="button" onClick={props.onSignout}>Sair</button></div>
   </div>
  </header>

  <div className="folha-layout">
   <aside className="folha-navigation" aria-label="Menu de redação">
    <div className="folha-navigation-crest">
     <img className="folha-crest-img" src="/newspaper/brasao_folha.webp" alt="Brasão de A Folha Sem Selo"/>
     <strong>REDAÇÃO<br/>DA FOLHA</strong><span>❧ ❦ ❧</span>
    </div>
    <nav>{NAV.map(item=>{
     const Icon=item.icon;return <button type="button" key={item.id}
       aria-current={section===item.id?'page':undefined}
       className={section===item.id?'active':''}
       onClick={()=>chooseSection(item.id)}><Icon size={21}/>{item.label}
       {item.id==='anuncios'&&props.pendingCommissions.length>0&&
        <span className="folha-nav-count" aria-label={`${props.pendingCommissions.length} notícia(s) contratada(s) pendente(s)`}>
         {props.pendingCommissions.length}</span>}</button>;
    })}</nav>
    <img className="folha-navigation-emblem" src="/newspaper/emblema_integrado.webp" alt="" aria-hidden="true"/>
   </aside>

   <main className="folha-main">
    <div className="folha-masthead">
     <img className="folha-sigil-img" src="/newspaper/brasao_folha.webp" alt="" aria-hidden="true"/>
     <div className={`folha-masthead-title folha-font-${identity.font_style}`}><h2>{identity.title}</h2>
      {identity.subtitle&&<p>✧ {identity.subtitle.toUpperCase()} ✧</p>}</div>
     <div className="folha-date">
      <label>Edição / Hub Temporal</label>
      <button type="button" className="folha-date-button" aria-expanded={dateOpen}
       onClick={()=>setDateOpen(value=>!value)}><CalendarDays size={16}/>
       <span>{dateLabel(currentDate)}</span><ChevronDown size={16}/></button>
      <div className="folha-edition-switch">
        <button type="button" className="folha-step" aria-label="Ver edição anterior" title="Edição anterior"
         disabled={busy||currentIndex<0||currentIndex>=history.length-1} onClick={()=>stepEdition(1)}><ChevronLeft size={16}/></button>
        <button type="button" className="folha-step" aria-label="Ver edição seguinte" title="Edição seguinte"
         disabled={busy||currentIndex<=0} onClick={()=>stepEdition(-1)}><ChevronRight size={16}/></button>
        <select aria-label="Trocar de edição" value={current?.id??''} disabled={busy||props.loading}
         onChange={e=>{const next=history.find(x=>x.id===e.target.value);if(next)browseEdition(next);}}>
         {!current&&<option value="">Sem edição aberta</option>}
         {history.map(e=><option key={e.id} value={e.id}>
          Nº {e.edition_no} · {dateLabel(e.campaign_date)} · {newspaperStatus(e.state)}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={()=>{setSection('capa');props.onNew();}}>
         Próxima edição</button>
       </div>
       <small className="folha-date-today" role="status">{props.hubDate?`Hoje no Reino: ${formatDate(props.hubDate)}`:
        'Lendo a data do HUB Temporal…'}</small>
       {dateOpen&&<div className="folha-date-flyout">
       <strong>{current?'Data desta edição':'Data oficial do HUB Temporal'}</strong>
       {current?<CampaignDatePicker value={current.campaign_date}
        referenceDate={props.hubDate} onChange={value=>props.onPatch({campaign_date:value})}/>:
        <p>{props.hubDate?`Hoje é ${formatDate(props.hubDate)}. A próxima edição nasce com esta data; depois de criada, você pode trocar aqui.`:
         'Lendo a data do HUB Temporal. Você já pode escrever: a edição recebe a data assim que ela chegar.'}</p>}
      </div>}
     </div>
    </div>

    <div className="folha-toolbar" aria-label="Ações editoriais">
     <button type="button" className="folha-toolbar-primary" disabled={busy}
      onClick={writeArticle}><Feather size={22}/> Escrever Matéria</button>
     <button type="button" disabled={busy} onClick={()=>fileInput.current?.click()}>
      <FileUp size={22}/> Anexar Arquivo</button>
     <button type="button" onClick={()=>{setSection('painel');setFullPreview(x=>!x);props.onPreview();}}>
      <Eye size={22}/> {fullPreview?'Voltar ao painel':'Pré-visualizar'}</button>
     <button type="button" disabled={!current||busy||!materialReady} onClick={requestPublish}>
      <Newspaper size={21}/> Publicar Edição</button>
     <button type="button" disabled={!current||busy||current.state!=='published'} onClick={()=>props.onSave('archived')}>
      <Archive size={21}/> Arquivar</button>
     <input ref={fileInput} type="file" hidden accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
      onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)props.onUpload(file);}}/>
    </div>

    {props.error&&<div className="folha-alert" role="alert">{props.error}</div>}
    {props.message&&<div className="folha-notice" role="status">{props.message}
     {props.canRestoreDiscard&&<button type="button" className="folha-notice-action" onClick={props.onRestoreDiscard}>Desfazer descarte</button>}</div>}
    {checkOpen&&current&&publishIssues.length>0&&<div className="folha-check" role="alertdialog" aria-label="Conferência antes de publicar">
     <strong>Antes de publicar, confira {publishIssues.length===1?'1 ponto':`${publishIssues.length} pontos`}:</strong>
     <ul>{publishIssues.map((issue,index)=><li key={index}>{issue.blockId?
      <button type="button" className="folha-text-link" onClick={()=>goToBlock(issue.blockId!)}>{issue.text}</button>:issue.text}</li>)}</ul>
     <div className="folha-check-actions">
      <button type="button" className="folha-text-action" onClick={()=>setCheckOpen(false)}>Voltar e corrigir</button>
      <button type="button" className="folha-text-action" disabled={busy} onClick={()=>{setCheckOpen(false);props.onSave('published');}}>Publicar mesmo assim</button>
     </div></div>}

    <div className={`folha-workspace${fullPreview?' folha-workspace-preview':''}`}>
     <div className="folha-workspace-main">
      {section==='painel'&&<div className="folha-paper-holder">
       {fullPreview&&current?<NewspaperCanvas edition={current} compactMasthead/>:
        latestPublished?<>
         <p className="folha-latest-label">Última edição publicada · Nº {latestPublished.edition_no}</p>
         <NewspaperCanvas edition={latestPublished} compactMasthead/></>:
        <div className="folha-future-module folha-panel-empty">
         <Newspaper size={35}/><strong>Nenhuma edição publicada ainda</strong>
         <span>Quando você publicar, a última edição aparece aqui. Para escrever, use Escrever o Jornal.</span></div>}
      </div>}
      {section==='capa'&&<div className="folha-paper-holder">
       {current&&editing&&<div className="folha-edit-tools" role="toolbar" aria-label="Desfazer e área de transferência">
        <button type="button" disabled={!props.canUndo} onClick={props.onUndo} title="Desfazer (Ctrl+Z)"><Undo2 size={16}/> Desfazer</button>
        <button type="button" disabled={!props.canRedo} onClick={props.onRedo} title="Refazer (Ctrl+Y)"><Redo2 size={16}/> Refazer</button>
        <span className="folha-edit-tools-sep" aria-hidden="true"/>
        <button type="button" disabled={!selectedBlock} onClick={()=>{if(selectedBlock)props.onCopyBlock(selectedBlock.id);}}
         title="Copiar o bloco selecionado (Ctrl+C)"><Copy size={16}/> Copiar</button>
        <button type="button" disabled={!selectedBlock} onClick={()=>{if(selectedBlock)props.onCutBlock(selectedBlock.id);}}
         title="Recortar o bloco selecionado (Ctrl+X)"><Scissors size={16}/> Recortar</button>
        <button type="button" disabled={!props.canPasteBlock} onClick={()=>props.onPasteBlock('',[])}
         title="Colar depois do bloco selecionado (Ctrl+V)"><ClipboardPaste size={16}/> Colar</button>
        <button type="button" onClick={()=>setHelpOpen(true)} title="Lista de atalhos (?)"><Keyboard size={16}/> Atalhos</button>
        <span className={`folha-save-status folha-save-${props.saveState.status}${props.saveState.dirty?' folha-save-dirty':''}`} role="status">{saveStatusText(props.saveState)}</span>
        <small>Clique na borda de um bloco (ou na alça ⠿) e use Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D ou Delete. Tecle / para inserir bloco e ? para ver todos os atalhos.</small>
       </div>}
       {current?<NewspaperCanvas edition={current} compactMasthead editing={editing}
        selectedId={selectedBlockId} onSelect={props.onSelectBlock}
        onResize={props.onResizeBlock}
        onChangeBlock={props.onPatchBlock} onReorderBlock={props.onReorderBlock}
        onInsertBlock={props.onInsertBefore} onMoveBlock={props.onMoveBlock}
        onChangeEdition={props.onPatch}/>:
        <div className="folha-future-module folha-panel-empty">
         <Feather size={35}/><strong>Nenhuma edição em andamento</strong>
         <button type="button" className="folha-start-edition" disabled={busy}
          onClick={()=>props.onNew()}>+ Criar primeira edição</button></div>}
      </div>}
      {slashOpen&&<NewspaperSlashMenu onClose={()=>setSlashOpen(false)} onPick={slashInsert}/>}
      {helpOpen&&<NewspaperShortcutHelp onClose={()=>setHelpOpen(false)}/>}

      {section==='materias'&&<section className="folha-section-content">
       <h3>Matérias</h3><p>Escolha o modelo que você quer utilizar.</p>
       <div className="folha-section-tools">
        <button type="button" className="folha-text-action" aria-pressed={showEngravings}
         onClick={()=>setShowEngravings(v=>!v)}><ImagePlus size={16}/> Gravuras do Reino</button></div>
       {showEngravings&&<NewspaperEngravings items={props.engravings} busy={busy}
        onUpload={props.onUploadEngraving} onToggle={props.onToggleEngraving} onDelete={props.onDeleteEngraving}
        onRestore={props.onRestoreEngravings}/>}
       <NewspaperStoryModels custom={props.storyModels} busy={busy}
        onUse={model=>{setSection('capa');setFullPreview(false);props.onUseStoryModel(model);}}
        onSave={props.onSaveStoryModel} onDelete={props.onDeleteStoryModel}/>
       <h4 className="newspaper-commission-heading">Matérias da edição atual</h4>
       {articles.length===0?<p className="folha-empty-copy">Nenhuma matéria nesta edição.</p>:
        <div className="folha-article-list">{articles.map((b,index)=><button type="button" key={b.id}
         onClick={()=>{props.onSelectBlock(b.id);openCover();props.onSelectBlock(b.id);}}>
         <span>MATÉRIA {index+1}</span><strong>{b.text.split('\n')[0]}</strong>
         <small>{b.span}/12 colunas · {wordsLabel(blockWords(b))}</small></button>)}</div>}
      </section>}

      {section==='calendario'&&<section className="folha-section-content">
       <h3>Calendário</h3>
       <p>Eventos públicos do mês: festas do reino, estações e o que o Narrador já publicou. Escolha um dia e clique em Escrever sobre a data.</p>
       <NewspaperCalendar referenceDate={props.hubDate}
        onWriteAbout={(date,title)=>{
         const draft=dateStoryDraft(date,title);
         setSection('capa');setFullPreview(false);props.onWriteAboutDate(draft.title,draft.body);
        }}/>
      </section>}

      {section==='redacao'&&<section className="folha-section-content">
       <h3>Redação</h3>
       <p>O corpo de funcionários de A Folha Sem Selo. Todos os campos são livres; Nome e Especialidade aparecem na assinatura das matérias.</p>
       <NewspaperStaff staff={props.staff} busy={busy} onSave={props.onSaveStaff} onDelete={props.onDeleteStaff}/>
      </section>}

      {section==='anuncios'&&<section className="folha-section-content">
       <h3>Anúncios e notícias contratadas</h3>
       <h4 className="newspaper-commission-heading">Notícias contratadas pelas Casas ({props.pendingCommissions.length} pendente(s))</h4>
       <p>As Casas pagam 1 de Riqueza, escrevem o texto e enviam a imagem. Insira na edição, edite o texto na folha e publique: ao publicar, a notícia sai das pendências.</p>
       <CommissionInbox commissions={props.pendingCommissions} houseNames={props.houseNames}
        edition={current} busy={busy}
        onInsert={commission=>{setSection('capa');setFullPreview(false);props.onInsertCommission(commission);}}
        onShow={commission=>{setSection('capa');setFullPreview(false);props.onShowCommission(commission);}}
        onReject={props.onRejectCommission}/>
       <h4 className="newspaper-commission-heading">Avisos e destaques</h4>
       <p>Insira comunicados e anúncios diretamente no jornal.</p>
       <button type="button" className="folha-text-action" onClick={()=>insert('notice',6)}>
        <Plus size={16}/> Inserir anúncio na capa</button>
       <div className="folha-article-list">{notices.map(b=>
        <button type="button" key={b.id} onClick={()=>{openCover();props.onSelectBlock(b.id);}}>
         <strong>{b.icon??'⚜'} {b.text.split('\n')[0]}</strong><small>Aviso da edição atual</small></button>)}</div>
       {!notices.length&&<p className="folha-empty-copy">Nenhum aviso nesta edição.</p>}
      </section>}

      {section==='arquivo'&&<section className="folha-section-content">
       <h3>Arquivo de edições</h3><p>Consulte e retome edições antigas, inclusive rascunhos e envios cancelados.</p>
       {props.loading?<p role="status">Carregando arquivo…</p>:
        <div className="folha-archive-list">{history.map(e=><div className="folha-archive-row" key={e.id}>
         <button type="button" onClick={()=>browseEdition(e)}><span>Nº {e.edition_no} · {formatDate(e.campaign_date)}</span>
         <strong>{e.title}</strong><small>{newspaperStatus(e.state)}</small></button>
         <button type="button" className="folha-archive-trash" disabled={busy}
          aria-label={`Excluir edição nº ${e.edition_no}`} title="Excluir edição"
          onClick={()=>props.onDeleteEdition(e)}><Trash2 size={18}/></button></div>)}</div>}
       {!props.loading&&history.length===0&&<p className="folha-empty-copy">O arquivo ainda não possui edições.</p>}
       <NewspaperAudit commissions={props.commissions} editions={history} houseNames={props.houseNames}/>
       {current&&<div className="folha-revisions">
        <h4 className="newspaper-commission-heading">Histórico de revisões · Nº {current.edition_no}</h4>
        <p>Cada salvamento guarda a versão anterior. Restaure uma delas na tela e depois salve ou descarte.</p>
        {props.revisions.length===0?<p className="folha-empty-copy">Ainda não há versões anteriores desta edição.</p>:
         <ul className="folha-revision-list">{props.revisions.map(r=><li key={r.id}>
          <span>Versão {r.previous_version} · {new Date(r.changed_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</span>
          <small>{(r.snapshot.blocks?.length??0)} elemento(s)</small>
          <button type="button" disabled={busy||current.state==='published'||current.state==='archived'}
           onClick={()=>props.onRestoreRevision(r)}>Restaurar</button></li>)}</ul>}
       </div>}
      </section>}

      {section==='alcance'&&<section className="folha-section-content">
       <h3>Leitura e Alcance</h3><p>Leituras confirmadas pelas contas que receberam o jornal.</p>
       <div className="folha-stats">
        <div><strong>{history.filter(e=>e.state==='published'||e.state==='archived').length}</strong><span>Edições disponíveis</span></div>
        <div><strong>{totalViews}</strong><span>Confirmações de leitura</span></div>
        <div><strong>{current?countReads(current):0}</strong><span>Leitores desta edição</span></div>
       </div>
       <div className="folha-archive-list">{availableHistory.map(e=>
        <button type="button" key={e.id} onClick={()=>browseEdition(e)}>
         <strong>Edição nº {e.edition_no} · {e.title}</strong>
         <small>{countReads(e)} leitura(s) confirmada(s)</small></button>)}</div>
      </section>}

      {section==='configuracoes'&&<section className="folha-section-content">
       <h3>Configurações editoriais</h3>
       <p>Identidade do jornal. Vale para o título do site, para as próximas edições e para o rascunho aberto. Não precisa ter edição criada.</p>
       <div className="folha-settings-layout"><form className="folha-settings"
        onSubmit={e=>{e.preventDefault();void props.onSaveSettings(identity).then(ok=>{if(ok)setSettingsDraft(null);});}}>
        <label>Nome do jornal<input maxLength={180} value={identity.title}
         onChange={e=>patchSettings({title:e.target.value})}/></label>
        <label>Subtítulo<input maxLength={240} value={identity.subtitle}
         onChange={e=>patchSettings({subtitle:e.target.value})}/></label>
        <label>Modelo<select value={identity.template}
         onChange={e=>patchSettings({template:e.target.value as NewspaperTemplate})}>
         {NEWSPAPER_TEMPLATES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <label>Fonte<select value={identity.font_style}
         onChange={e=>patchSettings({font_style:e.target.value as NewspaperSettings['font_style']})}>
         {NEWSPAPER_FONTS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
        <button type="submit" className="folha-text-action" disabled={busy||!settingsDirty}>
         <Save size={16}/> Salvar configurações</button>
        <small className="folha-settings-state" role="status">{settingsDirty?
         'Alterações ainda não salvas.':'Configurações salvas.'}</small>
       </form>
       <div className="folha-settings-preview" aria-label="Pré-visualização do modelo e da fonte">
        <strong>Pré-visualização</strong>
        <small>{NEWSPAPER_TEMPLATES.find(t=>t.value===identity.template)?.description} · {NEWSPAPER_FONTS.find(f=>f.value===identity.font_style)?.label}</small>
        <div className="folha-settings-preview-frame"><div className="folha-settings-preview-page">
         <NewspaperCanvas compactMasthead edition={storyModelPreviewEdition(previewBlocks,identity.font_style,
          {title:identity.title,subtitle:identity.subtitle,template:identity.template,campaign_date:currentDate})}/>
        </div></div></div></div>
      </section>}
     </div>

     {!fullPreview&&<aside className="folha-tool-stack" aria-label="Ferramentas e situação da edição">
      <div className="folha-side-card">
       <h3><Settings size={20}/> Ferramentas da Edição</h3>
       <p>Clique para inserir ou arraste um elemento para a folha. Escreva diretamente nos textos; puxe ↘ para redimensionar.</p>
       <div className="folha-element-list">
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'headline')} onClick={()=>insert('headline')}><span>☷</span> Título</button>
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'subtitle')} onClick={()=>insert('subtitle',12)}><span aria-hidden="true">Tᵗ</span> Subtítulo</button>
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'image')} onClick={()=>insert('image')}><ImagePlus size={17}/> Imagem</button>
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'article')} onClick={()=>insert('article',4)}><Columns3 size={17}/> Coluna</button>
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'quote')} onClick={()=>insert('quote')}><Quote size={17}/> Citação</button>
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'notice')} onClick={()=>insert('notice',6)}><TriangleAlert size={17}/> Aviso / Destaque</button>
       </div>
       <div className="folha-engravings">
        <strong>Acervo de gravuras do Reino</strong>
        <small>{selectedBlock?.type==='image'&&editing?'Aplica na imagem selecionada.':'Insere uma imagem nova na folha.'}</small>
        <div className="folha-engraving-grid">
         {collectionEngravings(props.engravings).map(e=>
          <button type="button" key={e.id} aria-label={'Usar gravura: '+e.name} title={e.name}
           onClick={()=>{setSection('capa');setFullPreview(false);props.onUseStoredEngraving(e);}}>
           <StoredEngravingImage item={e}/><span>{e.name}</span></button>)}
        </div>
        {props.engravingsLoading&&<small role="status">Carregando o acervo…</small>}
        {!props.engravingsLoading&&collectionEngravings(props.engravings).length===0&&
         <small className="folha-field-hint">Acervo vazio. Em Matérias › Gravuras do Reino você envia imagens ou restaura as originais.</small>}
       </div>
       {selectedBlock&&editing&&<div className="folha-selected-editor">
        <div className="folha-selected-heading"><strong>Editar elemento</strong>
         <div><button title="Duplicar" aria-label="Duplicar bloco" type="button"
          onClick={()=>props.onDuplicateBlock(selectedBlock.id)}>⧉</button>
         <button title="Subir" aria-label="Mover bloco para cima" type="button" disabled={selectedBlock.pinned}
          onClick={()=>props.onMoveBlock(selectedBlock.id,-1)}><ArrowUp size={15}/></button>
         <button title="Descer" aria-label="Mover bloco para baixo" type="button" disabled={selectedBlock.pinned}
          onClick={()=>props.onMoveBlock(selectedBlock.id,1)}><ArrowDown size={15}/></button>
         <button title={selectedBlock.pinned?'Bloco fixo: destrave para remover':'Remover'} aria-label="Remover bloco" type="button"
          disabled={selectedBlock.pinned}
          onClick={()=>props.onRemoveBlock(selectedBlock.id)}><Trash2 size={15}/></button></div>
        </div>
        <label className="folha-check-label"><input type="checkbox" checked={Boolean(selectedBlock.pinned)}
         onChange={e=>props.onPatchBlock(selectedBlock.id,{pinned:e.target.checked})}/>
         Fixar bloco (trava posição e tamanho; o texto continua editável)</label>
        {selectedBlock.type==='image'?<>
         <button type="button" className="folha-text-link" onClick={()=>fileInput.current?.click()}>
          Trocar imagem</button>
         <label>Legenda<input value={selectedBlock.caption??''}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{caption:e.target.value})}/></label>
         <label>Estilo da gravura<select value={selectedBlock.imageStyle??'vintage'}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{imageStyle:e.target.value as 'vintage'|'woodcut'|'original'})}>
          <option value="vintage">Pergaminho</option>
          <option value="woodcut">Xilogravura</option>
          <option value="original">Original</option>
         </select></label>
         <label className="folha-check-label"><input type="checkbox"
          checked={selectedBlock.autoHeight!==false}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{autoHeight:e.target.checked})}/>
          Altura automática</label>
        </>:<label>Texto<textarea rows={5} value={selectedBlock.text}
         onChange={e=>props.onPatchBlock(selectedBlock.id,{text:e.target.value})}/>
         <small className="folha-word-count">{wordsLabel(blockWords(selectedBlock))}</small></label>}
        {selectedBlock.type==='headline'&&<>
         <label>Subtítulo<input value={selectedBlock.subtitle??''}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{subtitle:e.target.value})}/></label>
         <label>Alinhamento<select value={selectedBlock.align??'left'}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{align:e.target.value as 'left'|'center'})}>
          <option value="left">Esquerda</option><option value="center">Centralizado</option>
         </select></label>
        </>}
        {selectedBlock.type==='article'&&<label className="folha-check-label"><input type="checkbox"
         checked={Boolean(selectedBlock.dropCap)}
         onChange={e=>props.onPatchBlock(selectedBlock.id,{dropCap:e.target.checked})}/>
         Letra capitular (primeira letra grande e gótica)</label>}
        {selectedBlock.type==='article'&&<label>Assinatura do correspondente
         <select value={selectedBlock.byline??''}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{byline:e.target.value})}>
          <option value="">Sem assinatura</option>
          {selectedBlock.byline&&!props.staff.some(m=>staffByline(m)===selectedBlock.byline)&&
           <option value={selectedBlock.byline}>{selectedBlock.byline}</option>}
          {props.staff.map(m=><option key={m.id} value={staffByline(m)}>{staffByline(m)}</option>)}
         </select>
         {props.staff.length===0&&<small>Cadastre funcionários em Redação para assinar.</small>}</label>}
        {selectedBlock.type!=='image'&&<label>Transformar em
         <select value={selectedBlock.type} disabled={selectedBlock.pinned}
          onChange={e=>props.onConvertBlock(selectedBlock.id,e.target.value as NewspaperBlockType)}>
          {CONVERTIBLE_LABELS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
         </select></label>}
        {selectedBlock.type==='notice'&&<div className="folha-icon-picker" role="group" aria-label="Símbolo / Selo do Aviso">
         <span>Símbolo / Selo do Aviso:</span>
         <div>{NEWSPAPER_NOTICE_ICONS.map(icon=><button type="button" key={icon}
          aria-label={`Selo ${icon}`} aria-pressed={(selectedBlock.icon??'⚜')===icon}
          onClick={()=>props.onPatchBlock(selectedBlock.id,{icon})}>{icon}</button>)}</div>
        </div>}
        <div className="newspaper-width-presets" role="group" aria-label="Larguras prontas">
         {NEWSPAPER_WIDTH_PRESETS.map(w=><button type="button" key={w.span}
          aria-pressed={selectedBlock.span===w.span} disabled={selectedBlock.pinned}
          onClick={()=>props.onPatchBlock(selectedBlock.id,{span:w.span})}>{w.label}</button>)}
        </div>
        <label>Largura ({selectedBlock.span}/12)
         <input type="range" min="3" max="12" value={selectedBlock.span} disabled={selectedBlock.pinned}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{span:Number(e.target.value)})}/></label>
        {selectedBlock.type==='image'&&selectedBlock.autoHeight===false&&<>
         <label>Altura da imagem
          <input type="range" min="130" max="650" step="10" value={selectedBlock.height} disabled={selectedBlock.pinned}
           onChange={e=>props.onPatchBlock(selectedBlock.id,{height:Number(e.target.value)})}/></label>
         <div className="newspaper-width-presets" role="group" aria-label="Enquadramento da imagem">
          <span>Mostrar:</span>
          {NEWSPAPER_IMAGE_FOCUS.map(f=><button type="button" key={f.value}
           aria-pressed={selectedBlock.focusY===undefined&&(selectedBlock.imageFocus??'center')===f.value}
           onClick={()=>props.onPatchBlock(selectedBlock.id,
            {imageFocus:f.value,focusX:50,focusY:f.value==='top'?0:f.value==='bottom'?100:50})}>{f.label}</button>)}
         </div>
         <label>Ampliação do recorte ({Math.round((selectedBlock.cropZoom??1)*100)}%)
          <input type="range" min="1" max="3" step="0.05" value={selectedBlock.cropZoom??1}
           onChange={e=>props.onPatchBlock(selectedBlock.id,{cropZoom:clampCropZoom(Number(e.target.value))})}/></label>
         <small className="folha-field-hint">Arraste a imagem direto na folha para escolher o recorte
          (foco {Math.round(blockFocus(selectedBlock).x)}% · {Math.round(blockFocus(selectedBlock).y)}%).
          Marque Altura automática para vê-la inteira.</small>
         <button type="button" className="folha-text-link"
          onClick={()=>props.onPatchBlock(selectedBlock.id,{focusX:50,focusY:50,cropZoom:1,imageFocus:'center'})}>Centralizar recorte</button>
        </>}
        <button type="button" className="folha-text-action" disabled={busy}
         onClick={()=>props.onSave()}><Save size={15}/> Salvar</button>
       </div>}
      </div>
      {current&&current.blocks.length>0&&<div className="folha-side-card">
       <details className="folha-outline">
        <summary><List size={17}/> Esboço da edição ({current.blocks.length})</summary>
        <ol>{current.blocks.map(b=><li key={b.id}><button type="button" aria-current={b.id===selectedBlockId?'true':undefined}
         onClick={()=>goToBlock(b.id)}>{blockSummary(b)}</button></li>)}</ol>
       </details></div>}
      <div className="folha-side-card folha-status-card">
       <h3><Newspaper size={19}/> Status da Edição</h3>
       <div><CheckCircle2 size={18} className={articles.length?'folha-ok':'folha-pending'}/>
        <span>Matérias: {articles.length}</span></div>
       <div><CheckCircle2 size={18} className={current?'folha-ok':'folha-pending'}/>
        <span>{current?'Edição em andamento':'Sem edição aberta: escreva para começar'}</span></div>
       <div>{materialReady?<CheckCircle2 size={18} className="folha-ok"/>:
         <Circle size={18} className="folha-pending"/>}
        <span>{materialReady?'Pronta para publicar':'Falta conteúdo para publicar'}</span></div>
       {current&&<p>{newspaperStatus(current.state)} · Nº {current.edition_no}</p>}
       {current&&<p>{headlines.length} manchete(s) · {pdfReady?'PDF anexado':'Sem PDF'}</p>}
       {current&&<p className="folha-word-total">{wordsLabel(totalWords)}{minutes>0?` · cerca de ${minutes} min de leitura`:''}</p>}
       {current&&<div className="folha-schedule">
        <strong><CalendarClock size={16}/> Publicação agendada</strong>
        {current.publish_on?<p>Será publicada sozinha em {formatDate(current.publish_on)}, quando o HUB Temporal chegar a este dia.</p>:
         <p>Publique na data do Reino que você escolher, sem precisar estar aqui.</p>}
        {current.state==='draft'?<div className="folha-schedule-actions">
         <button type="button" disabled={busy} aria-expanded={scheduleOpen}
          onClick={()=>{setScheduleError('');setScheduleOpen(v=>!v);}}>{current.publish_on?'Trocar a data':'Agendar publicação'}</button>
         {current.publish_on&&<button type="button" disabled={busy}
          onClick={()=>{setScheduleOpen(false);props.onPatch({publish_on:null});}}>Cancelar agendamento</button>}
        </div>:<small className="folha-field-hint">Só rascunhos podem ser agendados.</small>}
        {scheduleOpen&&current.state==='draft'&&<CampaignDatePicker value={current.publish_on??props.hubDate}
         referenceDate={props.hubDate} onChange={chooseSchedule}/>}
        {scheduleError&&<small className="newspaper-alert" role="alert">{scheduleError}</small>}
        {current.publish_on&&materialReady===false&&<small className="folha-field-hint">Falta conteúdo: a edição só é publicada se tiver pelo menos um elemento.</small>}
       </div>}
      </div>
      <button type="button" className="folha-publish-button"
       disabled={!current||busy||!materialReady} onClick={requestPublish}>
       <Printer size={24}/> Publicar Edição</button>
      {current&&<div className="folha-minor-actions">
       <button type="button" onClick={()=>window.print()}><Printer size={15}/> Imprimir / Salvar PDF</button>
       {hasUnsavedChanges&&<button type="button" disabled={busy} onClick={()=>props.onSave()}><Save size={15}/> Salvar</button>}
       {props.dirty&&<button type="button" disabled={busy} onClick={props.onDiscard}>Descartar alterações</button>}
       {current.state==='draft'&&<button type="button" disabled={busy}
        onClick={props.onDeleteDraft}><Trash2 size={15}/> Excluir rascunho</button>}
       {current.state!=='cancelled'&&current.state!=='draft'&&<button type="button" disabled={busy}
        onClick={props.onCancel}>Cancelar envio</button>}
       {current.state==='cancelled'&&<button type="button" disabled={busy}
        onClick={()=>{props.onPatch({state:'draft'});props.onEdit();}}>Reabrir rascunho</button>}
       {current.state==='archived'&&<button type="button" disabled={busy}
        onClick={()=>{props.onPatch({state:'published'});props.onEdit();}}>Reabrir publicação</button>}
      </div>}
     </aside>}
    </div>
   </main>
  </div>
 </div>;
}

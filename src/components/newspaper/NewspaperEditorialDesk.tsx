import {useRef,useState} from 'react';
import {
 BookOpen,BookOpenText,Layers3,CalendarDays,UsersRound,Megaphone,Archive,
 BarChart3,Settings,Feather,FileUp,Eye,Newspaper,
 ImagePlus,Columns3,Quote,TriangleAlert,Plus,Shield,Printer,ChevronDown,
 ArrowUp,ArrowDown,Trash2,Save,CheckCircle2,Circle,
} from 'lucide-react';
import {ChangePasswordButton} from '@/components/change-password';
import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {formatCampaignPeriod,formatDate,parseDate} from '@/lib/calendar/harptos';
import {NEWSPAPER_FONTS,NEWSPAPER_TEMPLATES,NEWSPAPER_WIDTH_PRESETS,newspaperStatus,
 type NewspaperBlock,type NewspaperBlockType,type NewspaperEdition,
 type NewspaperCommission,type NewspaperRevision,type NewspaperRead,NEWSPAPER_ENGRAVINGS,type NewspaperState,type NewspaperTemplate} from '@/lib/newspaper/model';
import {NewspaperCanvas} from './NewspaperCanvas';
import {CommissionInbox} from './NewspaperCommissions';
import './newspaper-editorial.css';

const NAV=[
 {id:'painel',label:'Painel do Jornal',icon:BookOpen},
 {id:'capa',label:'Edição da Capa',icon:Feather},
 {id:'materias',label:'Matérias',icon:Layers3},
 {id:'pautas',label:'Pautas',icon:CalendarDays},
 {id:'correspondentes',label:'Correspondentes',icon:UsersRound},
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
 /** Notícias contratadas pelas Casas, ainda não publicadas. */
 pendingCommissions:NewspaperCommission[];
 houseNames:Map<string,string>;
 onInsertCommission:(commission:NewspaperCommission)=>void;
 onShowCommission:(commission:NewspaperCommission)=>void;
 onRejectCommission:(commission:NewspaperCommission,note:string)=>void;
 /** Versões anteriores desta edição, guardadas pelo banco a cada salvamento. */
 revisions:NewspaperRevision[];
 onRestoreRevision:(revision:NewspaperRevision)=>void;
 /** Aplica uma gravura do acervo no bloco de imagem selecionado (ou insere uma nova). */
 onUseEngraving:(src:string,label:string)=>void;
 /** Há alterações ainda não salvas. */
 dirty:boolean;
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
 onResizeBlock:(id:string,patch:Pick<NewspaperBlock,'span'|'height'>)=>void;
 onUpload:(file:File)=>void;
 onCancel:()=>void;
 onSignout:()=>void;
}

function ExampleFrontPage({date}:{date:string}){
 return <article className="folha-demo-paper" aria-label="Exemplo ilustrativo de uma edição, ainda não publicada">
  <div className="folha-demo-folio"><span>ANO II · EDIÇÃO DE EXEMPLO</span><span>A VOZ LIVRE DE CORMYR</span><span>{date}</span></div>
  <div className="folha-demo-main">
   <div><h2>A COROA REAFIRMA ALIANÇAS NO NORTE</h2>
    <p>Enviado real retorna de longa missão com novos acordos comerciais.</p></div>
   <div className="folha-demo-engraving" aria-hidden="true"><Shield size={76}/><span>✦ CORMYR ✦</span></div>
  </div>
  <div className="folha-demo-storygrid">
   <div className="folha-demo-illustration">
    <img src="/cormyr/assets/crownlands-phelles.webp" alt="Ilustração heráldica da Coroa de Cormyr"/>
    <p>Correspondência da corte e das terras do reino</p>
   </div>
   <p className="folha-demo-copy"><span>A</span> comitiva real concluiu uma série de encontros com lideranças do Norte, fortalecendo laços de comércio e defesa. Segundo fontes do palácio, os acordos deverão trazer estabilidade à região nas próximas estações.</p>
   <div className="folha-demo-other"><h3>OUTRAS NOTÍCIAS</h3>
    <p>■ Hillmarch resiste ao cerco de seis meses</p>
    <p>■ Movimentações em Arabel preocupam mercadores</p>
    <p>■ Novas obras em Stonecastle ampliam a enfermaria</p>
   </div>
  </div>
  <div className="folha-demo-bottom">
   <div><strong>Comércio em Alta</strong><span>Feiras movimentam a Costa do Dragão</span></div>
   <div><strong>Tensões Militares</strong><span>Reforços nas fronteiras das Helmlands</span></div>
   <div><strong>Da Corte</strong><span>O Conselho Real reúne-se em Suzail</span></div>
  </div>
  <p className="folha-demo-watermark">PRÉ-VISUALIZAÇÃO ILUSTRATIVA · NÃO PUBLICADA</p>
 </article>;
}

export function NewspaperEditorialDesk(props:NewspaperEditorialProps){
 const {current,history,reads,editing,busy,selectedBlockId}=props;
 const [section,setSection]=useState<Section>('painel');
 const [dateOpen,setDateOpen]=useState(false);
 const [profileOpen,setProfileOpen]=useState(false);
 const [fullPreview,setFullPreview]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null);
 const selectedBlock=current?.blocks.find(b=>b.id===selectedBlockId);
 const articles=current?.blocks.filter(b=>b.type==='article')??[];
 const headlines=current?.blocks.filter(b=>b.type==='headline')??[];
 const notices=current?.blocks.filter(b=>b.type==='notice')??[];
 const correspondents=[...new Map(history.flatMap(edition=>edition.blocks.filter(b=>b.type==='article'&&b.byline?.trim())
  .map(b=>[b.byline!.trim().toLocaleLowerCase('pt-BR'),b.byline!.trim()] as const))).values()];
 const toolboxDrag=(event:React.DragEvent<HTMLButtonElement>,type:NewspaperBlockType)=>{
  event.dataTransfer.setData('application/x-cormyr-newspaper-tool',type);
  event.dataTransfer.effectAllowed='copy';
 };
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
 const browseEdition=(edition:NewspaperEdition)=>{props.onOpen(edition);setSection('painel');setFullPreview(false);};
 const hasUnsavedChanges=current&&editing;
 const availableHistory=history.filter(e=>e.state!=='cancelled');
 const totalViews=history.reduce((total,edition)=>total+countReads(edition),0);

 const showFrontPage=section==='painel'||section==='capa';
 const currentDate=current?.campaign_date??props.hubDate;
 return <div className="folha-editorial" aria-label="Redação A Folha Sem Selo">
  <header className="folha-topbar">
   <div className="folha-top-brand">
    <p><span aria-hidden="true">✦</span> SEGUNDA TEMPORADA · JORNAL</p>
    <h1>A Folha Sem Selo</h1>
    <span className="folha-top-slogan">— O jornal independente de Cormyr —</span>
   </div>
   <div className="folha-print-press" aria-hidden="true"><Printer size={74}/><BookOpenText size={38}/></div>
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
     <div className="folha-crest-icon"><Shield size={51}/><Feather size={27}/></div>
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
    <div className="folha-navigation-decors" aria-hidden="true">
     <BookOpen size={68}/><Feather size={72}/>
    </div>
   </aside>

   <main className="folha-main">
    <div className="folha-masthead">
     <div className="folha-sigil" aria-hidden="true"><Shield size={63}/><Feather size={26}/></div>
     <div className="folha-masthead-title"><h2>A Folha Sem Selo</h2>
      <p>✧ O JORNAL INDEPENDENTE DE CORMYR ✧</p></div>
     <div className="folha-date">
      <label>Edição / Hub Temporal</label>
      <button type="button" className="folha-date-button" aria-expanded={dateOpen}
       onClick={()=>setDateOpen(value=>!value)}><CalendarDays size={16}/>
       <span>{dateLabel(currentDate)}</span><ChevronDown size={16}/></button>
      <div className="folha-edition-switch">
        <select aria-label="Trocar de edição" value={current?.id??''} disabled={busy||props.loading}
         onChange={e=>{const next=history.find(x=>x.id===e.target.value);if(next)browseEdition(next);}}>
         {!current&&<option value="">Sem edição aberta</option>}
         {history.map(e=><option key={e.id} value={e.id}>
          Nº {e.edition_no} · {dateLabel(e.campaign_date)} · {newspaperStatus(e.state)}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={()=>{setSection('capa');props.onNew();}}>
         Próxima edição</button>
       </div>
       {dateOpen&&<div className="folha-date-flyout">
       <strong>{current?'Data desta edição':'Data oficial do HUB Temporal'}</strong>
       {current?<CampaignDatePicker value={current.campaign_date}
        referenceDate={props.hubDate} onChange={value=>props.onPatch({campaign_date:value})}/>:
        <p>Crie uma edição para selecionar a data do jornal.</p>}
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
     <button type="button" disabled={!current||busy||!materialReady} onClick={()=>props.onSave('published')}>
      <Newspaper size={21}/> Publicar Edição</button>
     <button type="button" disabled={!current||busy||current.state!=='published'} onClick={()=>props.onSave('archived')}>
      <Archive size={21}/> Arquivar</button>
     <input ref={fileInput} type="file" hidden accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
      onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)props.onUpload(file);}}/>
    </div>

    {props.error&&<div className="folha-alert" role="alert">{props.error}</div>}
    {props.message&&<div className="folha-notice" role="status">{props.message}</div>}

    <div className={`folha-workspace${fullPreview?' folha-workspace-preview':''}`}>
     <div className="folha-workspace-main">
      {showFrontPage&&<div className="folha-paper-holder">
       {current?<NewspaperCanvas edition={current} compactMasthead editing={editing&&section==='capa'&&!fullPreview}
        selectedId={selectedBlockId} onSelect={props.onSelectBlock}
        onResize={props.onResizeBlock}
        onChangeBlock={props.onPatchBlock} onReorderBlock={props.onReorderBlock}
        onInsertBlock={props.onInsertBefore} onMoveBlock={props.onMoveBlock}
        onChangeEdition={props.onPatch}/>:
        <ExampleFrontPage date={dateLabel(currentDate)}/>}
       {!current&&<button type="button" className="folha-start-edition"
        onClick={()=>{setSection('capa');props.onNew();}}>+ Criar primeira edição</button>}
      </div>}

      {section==='materias'&&<section className="folha-section-content">
       <h3>Matérias da edição</h3><p>Selecione uma reportagem para editar no jornal.</p>
       <button type="button" onClick={writeArticle} className="folha-text-action"><Plus size={16}/> Nova matéria</button>
       {articles.length===0?<p className="folha-empty-copy">Nenhuma matéria nesta edição.</p>:
        <div className="folha-article-list">{articles.map((b,index)=><button type="button" key={b.id}
         onClick={()=>{props.onSelectBlock(b.id);openCover();props.onSelectBlock(b.id);}}>
         <span>MATÉRIA {index+1}</span><strong>{b.text.split('\n')[0]}</strong>
         <small>{b.span}/12 colunas</small></button>)}</div>}
      </section>}

      {section==='pautas'&&<section className="folha-section-content">
       <h3>Pautas e rascunhos</h3>
       <p>Use as edições em rascunho como pautas para futuras publicações.</p>
       <button type="button" className="folha-text-action" disabled={busy} onClick={()=>{setSection('capa');props.onNew();}}>
        <Plus size={16}/> Nova pauta / edição</button>
       <div className="folha-archive-list">{history.filter(e=>e.state==='draft').map(e=>
        <button type="button" key={e.id} onClick={()=>browseEdition(e)}>
         <span>RASCUNHO · {formatDate(e.campaign_date)}</span><strong>{e.title}</strong>
        </button>)}</div>
       {!history.some(e=>e.state==='draft')&&<p className="folha-empty-copy">Nenhum rascunho registrado.</p>}
      </section>}

      {section==='correspondentes'&&<section className="folha-section-content">
       <h3>Correspondentes</h3>
       <p>Autores identificados nas reportagens do Jornal. Assine uma matéria para incluí-los aqui.</p>
       {correspondents.length?<div className="folha-article-list">
        {correspondents.map(name=><div className="folha-correspondent" key={name}>
         <UsersRound size={19}/><strong>{name}</strong>
         <small>{history.reduce((count,edition)=>count+edition.blocks.filter(b=>b.type==='article'&&b.byline?.trim()===name).length,0)} matéria(s) assinada(s)</small>
        </div>)}
       </div>:<div className="folha-future-module"><UsersRound size={35}/>
        <strong>Nenhum correspondente ainda</strong>
        <span>Abra uma reportagem e preencha “Assinatura do correspondente” na caixa de ferramentas.</span></div>}
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
        <div className="folha-archive-list">{history.map(e=><button type="button" key={e.id}
         onClick={()=>browseEdition(e)}><span>Nº {e.edition_no} · {formatDate(e.campaign_date)}</span>
         <strong>{e.title}</strong><small>{newspaperStatus(e.state)}</small></button>)}</div>}
       {!props.loading&&history.length===0&&<p className="folha-empty-copy">O arquivo ainda não possui edições.</p>}
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
       <h3>Configurações editoriais</h3><p>Altere a identidade desta edição e a composição da página.</p>
       {current?<div className="folha-settings">
        <label>Nome do jornal<input maxLength={180} value={current.title}
         onChange={e=>props.onPatch({title:e.target.value})}/></label>
        <label>Subtítulo<input maxLength={240} value={current.subtitle}
         onChange={e=>props.onPatch({subtitle:e.target.value})}/></label>
        <label>Modelo<select value={current.template}
         onChange={e=>props.onPatch({template:e.target.value as NewspaperTemplate})}>
         {NEWSPAPER_TEMPLATES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <label>Fonte<select value={current.font_style}
         onChange={e=>props.onPatch({font_style:e.target.value as NewspaperEdition['font_style']})}>
         {NEWSPAPER_FONTS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
        <button type="button" className="folha-text-action" onClick={()=>props.onSave()}>
         <Save size={16}/> Salvar configurações</button>
       </div>:<p className="folha-empty-copy">Crie uma edição antes de ajustar a identidade.</p>}
       
      </section>}
     </div>

     {!fullPreview&&<aside className="folha-tool-stack" aria-label="Ferramentas e situação da edição">
      <div className="folha-side-card">
       <h3><Settings size={20}/> Ferramentas da Edição</h3>
       <p>Clique para inserir ou arraste um elemento para a folha. Escreva diretamente nos textos; puxe ↘ para redimensionar.</p>
       <div className="folha-element-list">
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'headline')} onClick={()=>insert('headline')}><span>☷</span> Título</button>
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'subtitle')} onClick={()=>insert('subtitle',12)}><span>Tᵗ</span> Subtítulo</button>
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'image')} onClick={()=>insert('image')}><ImagePlus size={17}/> Imagem</button>
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'article')} onClick={()=>insert('article',4)}><Columns3 size={17}/> Coluna</button>
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'quote')} onClick={()=>insert('quote')}><Quote size={17}/> Citação</button>
        <button type="button" draggable onDragStart={e=>toolboxDrag(e,'notice')} onClick={()=>insert('notice',6)}><TriangleAlert size={17}/> Aviso / Destaque</button>
       </div>
       <div className="folha-engravings">
        <strong>Acervo de gravuras do Reino</strong>
        <small>{selectedBlock?.type==='image'&&editing?'Aplica na imagem selecionada.':'Insere uma imagem nova na folha.'}</small>
        <div className="folha-engraving-grid">{NEWSPAPER_ENGRAVINGS.map(e=>
         <button type="button" key={e.src} aria-label={'Usar gravura: '+e.label} title={e.label}
          onClick={()=>{setSection('capa');setFullPreview(false);props.onUseEngraving(e.src,e.label);}}>
          <img src={e.src} alt="" loading="lazy"/><span>{e.label}</span></button>)}</div>
       </div>
       {selectedBlock&&editing&&<div className="folha-selected-editor">
        <div className="folha-selected-heading"><strong>Editar elemento</strong>
         <div><button title="Duplicar" aria-label="Duplicar bloco" type="button"
          onClick={()=>props.onDuplicateBlock(selectedBlock.id)}>⧉</button>
         <button title="Subir" aria-label="Mover bloco para cima" type="button"
          onClick={()=>props.onMoveBlock(selectedBlock.id,-1)}><ArrowUp size={15}/></button>
         <button title="Descer" aria-label="Mover bloco para baixo" type="button"
          onClick={()=>props.onMoveBlock(selectedBlock.id,1)}><ArrowDown size={15}/></button>
         <button title="Remover" aria-label="Remover bloco" type="button"
          onClick={()=>props.onRemoveBlock(selectedBlock.id)}><Trash2 size={15}/></button></div>
        </div>
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
         onChange={e=>props.onPatchBlock(selectedBlock.id,{text:e.target.value})}/></label>}
        {selectedBlock.type==='headline'&&<>
         <label>Subtítulo<input value={selectedBlock.subtitle??''}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{subtitle:e.target.value})}/></label>
         <label>Alinhamento<select value={selectedBlock.align??'left'}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{align:e.target.value as 'left'|'center'})}>
          <option value="left">Esquerda</option><option value="center">Centralizado</option>
         </select></label>
        </>}
        {selectedBlock.type==='article'&&<label>Assinatura do correspondente
         <input maxLength={120} value={selectedBlock.byline??''}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{byline:e.target.value})}/></label>}
        {selectedBlock.type==='notice'&&<label>Selo do aviso
         <select value={selectedBlock.icon??'⚜'}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{icon:e.target.value})}>
          {['⚜','📜','🏪','⚔','⚠','👑'].map(icon=><option key={icon} value={icon}>{icon}</option>)}
         </select></label>}
        <div className="newspaper-width-presets" role="group" aria-label="Larguras prontas">
         {NEWSPAPER_WIDTH_PRESETS.map(w=><button type="button" key={w.span}
          aria-pressed={selectedBlock.span===w.span}
          onClick={()=>props.onPatchBlock(selectedBlock.id,{span:w.span})}>{w.label}</button>)}
        </div>
        <label>Largura ({selectedBlock.span}/12)
         <input type="range" min="3" max="12" value={selectedBlock.span}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{span:Number(e.target.value)})}/></label>
        {selectedBlock.type==='image'&&selectedBlock.autoHeight===false&&<label>Altura da imagem
         <input type="range" min="130" max="650" step="10" value={selectedBlock.height}
          onChange={e=>props.onPatchBlock(selectedBlock.id,{height:Number(e.target.value)})}/></label>}
        <button type="button" className="folha-text-action" disabled={busy}
         onClick={()=>props.onSave()}><Save size={15}/> Salvar</button>
       </div>}
      </div>
      <div className="folha-side-card folha-status-card">
       <h3><Newspaper size={19}/> Status da Edição</h3>
       <div><CheckCircle2 size={18} className={articles.length?'folha-ok':'folha-pending'}/>
        <span>Matérias: {articles.length}</span></div>
       <div><CheckCircle2 size={18} className={current?'folha-ok':'folha-pending'}/>
        <span>{current?'Edição em andamento':'Aguardando criação'}</span></div>
       <div>{materialReady?<CheckCircle2 size={18} className="folha-ok"/>:
         <Circle size={18} className="folha-pending"/>}
        <span>{materialReady?'Pronta para revisão':'Pronta para publicação'}</span></div>
       {current&&<p>{newspaperStatus(current.state)} · Nº {current.edition_no}</p>}
       {current&&<p>{headlines.length} manchete(s) · {pdfReady?'PDF anexado':'Sem PDF'}</p>}
      </div>
      <button type="button" className="folha-publish-button"
       disabled={!current||busy||!materialReady} onClick={()=>props.onSave('published')}>
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

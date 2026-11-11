import {useEffect,useMemo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Plus,FileText,ImagePlus,Newspaper,ArrowUp,ArrowDown,Trash2,Save,Send,Archive,Undo2,Check,Eye,LayoutTemplate} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {dateKey,formatDate} from '@/lib/calendar/harptos';
import {NewspaperCanvas} from './NewspaperCanvas';
import {NewspaperEditorialDesk} from './NewspaperEditorialDesk';
import {
 createNewspaperEdition,getNewspaperEditions,getNewspaperReceipts,
 markNewspaperRead,updateNewspaperEdition,uploadNewspaperAsset,
} from '@/lib/newspaper/data';
import {
 createNewspaperLayout,makeNewspaperBlock,newspaperIsUnread,newspaperStatus,
 NEWSPAPER_FONTS,NEWSPAPER_TEMPLATES,safeNewspaperBlocks,validateNewspaperEdition,
 type NewspaperBlock,type NewspaperBlockType,type NewspaperEdition,type NewspaperState,
 type NewspaperTemplate,
} from '@/lib/newspaper/model';
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

function cloneEditableEdition(edition:NewspaperEdition){
 return {...edition,blocks:safeNewspaperBlocks(edition.blocks)};
}
function safeError(cause:unknown){
 return cause instanceof Error?cause.message:'Não foi possível concluir a operação.';
}
export function NewspaperHub({userId,editor,editorial=false,onSignout,onOtherModules}:{
 userId:string;editor:boolean;editorial?:boolean;
 onSignout?:()=>void;onOtherModules?:()=>void;
}){
 const qc=useQueryClient();
 const time=useCampaignTime();
 const {count,editions,receipts}=useUnreadNewspaperCount(userId);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [draft,setDraft]=useState<NewspaperEdition|null>(null);
 const [editing,setEditing]=useState(false);
 const [blockId,setBlockId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const history=editions.data??[];
 useEffect(()=>{
  if(!editorial||!editor||selectedId||!editions.data?.length)return;
  const edition=editions.data.find(e=>e.state==='draft')??editions.data[0];
  if(!edition)return;
  setSelectedId(edition.id);setDraft(cloneEditableEdition(edition));
  setEditing(edition.state==='draft');
  setBlockId(edition.state==='draft'?edition.blocks[0]?.id??null:null);
 },[editorial,editor,selectedId,editions.data]);
 const selected=history.find(e=>e.id===selectedId);
 const current=draft?.id===selectedId?draft:selected??null;
 const chosenBlock=current?.blocks.find(x=>x.id===blockId);
 const reads=receipts.data??[];
 const myReads=new Map(reads.filter(r=>r.user_id===userId).map(r=>[r.newspaper_id,r]));

 const refresh=()=>Promise.all([
  qc.invalidateQueries({queryKey:['campaign-newspapers',userId]}),
  qc.invalidateQueries({queryKey:['campaign-newspaper-reads',userId]}),
 ]);
 const notice=(value:string)=>{setMessage(value);setError('');};
 const open=async(edition:NewspaperEdition)=>{
  if(busy)return;
  const compare=(e:NewspaperEdition)=>JSON.stringify([
   e.campaign_date,e.title,e.subtitle,e.template,e.font_style,e.blocks,e.pdf_path,e.state,
  ]);
  if(edition.id!==selectedId&&current&&selected&&compare(current)!==compare(selected)&&
   !window.confirm('Há alterações não salvas. Deseja abrir outra edição e descartá-las?'))return;
  setSelectedId(edition.id);setDraft(cloneEditableEdition(edition));setBlockId(null);
  setEditing(false);setMessage('');setError('');
  if(['published','archived'].includes(edition.state)&&newspaperIsUnread(edition,myReads.get(edition.id))){
   try{await markNewspaperRead(edition.id);await qc.invalidateQueries({queryKey:['campaign-newspaper-reads',userId]});}
   catch(cause){setError('O jornal abriu, mas a confirmação de leitura não foi salva: '+safeError(cause));}
  }
 };
 const newEdition=async(initialBlock?:NewspaperBlockType)=>{
  if(!editor||busy)return;
  if(!time.data){setError('Aguarde a data oficial do HUB Temporal.');return;}
  setBusy(true);setError('');
  try{
   const template:'classico'='classico';
   const blocks=createNewspaperLayout(template);
   const extra=initialBlock?makeNewspaperBlock(initialBlock):null;
   if(extra)blocks.push(extra);
   const edition=await createNewspaperEdition({
    campaign_date:dateKey(time.data),title:'A Folha Sem Selo',
    subtitle:'O jornal independente de Cormyr',template,blocks,
   });
   setSelectedId(edition.id);setDraft(cloneEditableEdition(edition));
   setBlockId(extra?.id??edition.blocks[0]?.id??null);setEditing(true);
   notice('Nova edição criada como rascunho. Personalize os blocos e salve.');
   await refresh();
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const modify=(patch:Partial<NewspaperEdition>)=>setDraft(old=>old?{...old,...patch}:old);
 const modifyBlock=(id:string,patch:Partial<NewspaperBlock>)=>setDraft(old=>old?{
  ...old,blocks:old.blocks.map(b=>b.id===id?{...b,...patch}:b),
 }:old);
 const moveBlock=(id:string,direction:-1|1)=>{
  setDraft(old=>{
   if(!old)return old;const blocks=[...old.blocks],index=blocks.findIndex(b=>b.id===id);
   const next=index+direction;
   if(index<0||next<0||next>=blocks.length)return old;
   [blocks[index],blocks[next]]=[blocks[next]!,blocks[index]!];
   return {...old,blocks};
  });
 };
 const addBlock=(type:NewspaperBlockType)=>{
  if(!draft)return;
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
    return {...old,pdf_path:path,blocks:examplesOnly?[]:old.blocks};
   });
   else if(kind==='image'){
    const imageBlock=makeNewspaperBlock('image');
    setDraft(old=>old?.id===editionId?{
     ...old,blocks:sourceBlock&&old.blocks.some(b=>b.id===sourceBlock&&b.type==='image')?
      old.blocks.map(b=>b.id===sourceBlock?{...b,imagePath:path}:b):
      [...old.blocks,{...imageBlock,imagePath:path}],
    }:old);
    setBlockId(sourceBlock&&current.blocks.some(b=>b.id===sourceBlock&&b.type==='image')?
     sourceBlock:imageBlock.id);
   }
   notice('Arquivo anexado. Salve o rascunho para registrar a alteração.');
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const save=async(nextState?:NewspaperState)=>{
  if(!editor||!current||busy)return;
  const state=nextState??current.state;
  const problem=validateNewspaperEdition(current);
  // Permite cancelar mesmo uma edição ainda incompleta.
  if(problem&&state!=='cancelled'){setError(problem);return;}
  if(state==='cancelled'&&!window.confirm('Cancelar o envio desta edição? Ela ficará invisível aos jogadores, mas preservada no histórico editorial.'))return;
  setBusy(true);setError('');
  try{
   const result=await updateNewspaperEdition(current,{
    campaign_date:current.campaign_date,title:current.title.trim(),subtitle:current.subtitle,
    template:current.template,font_style:current.font_style,blocks:current.blocks,
    pdf_path:current.pdf_path,state,
   });
   setDraft(cloneEditableEdition(result));
   if(state!=='draft'){setEditing(false);setBlockId(null);}
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


 const quickUpload=async(file:File)=>{
  if(!editor||busy)return;
  const kind=file.type==='application/pdf'?'pdf':'image';
  if(current){await upload(file,kind);setEditing(true);return;}
  if(!time.data){setError('Aguarde a data oficial do HUB Temporal.');return;}
  setBusy(true);setError('');
  try{
   const template:'classico'='classico';
   const base=await createNewspaperEdition({
    campaign_date:dateKey(time.data),title:'A Folha Sem Selo',
    subtitle:'O jornal independente de Cormyr',template,blocks:[],
   });
   const path=await uploadNewspaperAsset(base.id,file,kind);
   const nextBlock=kind==='image'?{...makeNewspaperBlock('image'),imagePath:path}:null;
   const result=await updateNewspaperEdition(base,{
    campaign_date:base.campaign_date,title:base.title,
    subtitle:'O jornal independente de Cormyr',
    template,font_style:'classico',blocks:nextBlock?[nextBlock]:[],
    pdf_path:kind==='pdf'?path:null,state:'draft',
   });
   setDraft(cloneEditableEdition(result));setSelectedId(result.id);
   setBlockId(nextBlock?.id??null);setEditing(true);
   notice('Arquivo importado em novo rascunho. Revise a página antes de publicar.');
   await refresh();
  }catch(cause){setError(safeError(cause));}
  finally{setBusy(false);}
 };
 const editBlock=(id:string,patch:Partial<NewspaperBlock>)=>{
  modifyBlock(id,patch);setEditing(true);
 };
 const addEditorialBlock=(type:NewspaperBlockType,span?:number)=>{
  if(!current){void newEdition(type);return;}
  const block=makeNewspaperBlock(type);
  if(span)block.span=span;
  setDraft(old=>old?{...old,blocks:[...old.blocks,block]}:old);
  setBlockId(block.id);setEditing(true);
 };
 const removeEditorialBlock=(id:string)=>{
  if(!current)return;
  modify({blocks:current.blocks.filter(b=>b.id!==id)});
  setBlockId(null);setEditing(true);
 };
 if(editorial&&editor)return <NewspaperEditorialDesk
  userId={userId} current={current} history={history} reads={reads}
  loading={editions.isPending} editing={editing} busy={busy}
  selectedBlockId={blockId} error={error} message={message}
  hubDate={time.data?dateKey(time.data):''}
  onNew={type=>{void newEdition(type);}}
  onOpen={edition=>{void open(edition);}}
  onSave={state=>{void save(state);}}
  onEdit={()=>setEditing(true)}
  onPreview={()=>setEditing(false)}
  onPatch={patch=>{modify(patch);setEditing(true);}}
  onSelectBlock={setBlockId} onPatchBlock={editBlock}
  onAddBlock={addEditorialBlock} onRemoveBlock={removeEditorialBlock}
  onMoveBlock={(id,direction)=>{moveBlock(id,direction);setEditing(true);}}
  onResizeBlock={editBlock}
  onUpload={file=>{void quickUpload(file);}}
  onCancel={()=>{void save('cancelled');}}
  onOtherModules={()=>onOtherModules?.()}
  onSignout={()=>onSignout?.()}
 />;

 return <section className="newspaper-hub" aria-label="Jornal de Cormyr">
  <header className="newspaper-hub-heading">
   <p className="newspaper-kicker">A IMPRENSA DO REINO</p>
   <h2>Jornal de Cormyr</h2>
   <p>{editor?'Redação e arquivo de edições — Narrador e Leonardo.':'As notícias que atravessam Cormyr, impressas em papel e história.'}</p>
   {editor&&<Button onClick={()=>void newEdition()} disabled={busy||time.isPending}><Plus size={16}/> Nova edição</Button>}
  </header>
  {error&&<p className="newspaper-alert" role="alert">{error}</p>}
  {message&&<p className="newspaper-notice" role="status">{message}</p>}
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
      <div><span>EDIÇÃO Nº {displayEdition.edition_no}</span>
       <strong>{newspaperStatus(displayEdition.state)}</strong>
       {editor&&['published','archived'].includes(displayEdition.state)&&
        <small><Eye size={14}/> {readers} leitura(s) confirmada(s) desta versão</small>}
      </div>
      {editor&&<div className="newspaper-action-buttons">
       {!editing&&<Button variant="outline" onClick={()=>{setEditing(true);setBlockId(displayEdition.blocks[0]?.id??null);}}>Editar edição</Button>}
       {editing&&<Button variant="outline" disabled={busy} onClick={()=>void save()}><Save size={15}/> Salvar</Button>}
       {editing&&displayEdition.state!=='published'&&
        <Button disabled={busy} onClick={()=>void save('published')}><Send size={15}/> Publicar</Button>}
       {editing&&displayEdition.state==='published'&&
        <Button disabled={busy} onClick={()=>void save('published')}><Send size={15}/> Salvar republicação</Button>}
       {['published'].includes(displayEdition.state)&&
        <Button variant="outline" disabled={busy} onClick={()=>void save('archived')}><Archive size={15}/> Arquivar</Button>}
       {displayEdition.state!=='cancelled'&&
        <Button variant="outline" disabled={busy} onClick={()=>void save('cancelled')}>Cancelar envio</Button>}
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
        referenceDate={time.data?dateKey(time.data):undefined}
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
        <button type="button" onClick={()=>addBlock('quote')}><Plus size={14}/> Destaque</button>
       </div>
       <p className="newspaper-editor-tip">Clique em qualquer bloco da página para editar. Arraste ↘ no canto para ajustar o tamanho.</p>
       {chosenBlock&&<div className="newspaper-block-properties">
        <header><strong>{chosenBlock.type==='headline'?'Manchete':chosenBlock.type==='article'?'Reportagem':
         chosenBlock.type==='image'?'Fotografia':'Destaque'}</strong>
         <div>
          <button type="button" title="Subir" aria-label="Mover bloco para cima"
           onClick={()=>moveBlock(chosenBlock.id,-1)}><ArrowUp size={15}/></button>
          <button type="button" title="Descer" aria-label="Mover bloco para baixo"
           onClick={()=>moveBlock(chosenBlock.id,1)}><ArrowDown size={15}/></button>
          <button type="button" title="Remover" aria-label="Remover bloco"
           onClick={()=>{modify({blocks:displayEdition.blocks.filter(b=>b.id!==chosenBlock.id)});setBlockId(null);}}><Trash2 size={15}/></button>
         </div>
        </header>
        {chosenBlock.type!=='image'&&<label>Conteúdo
         <textarea rows={chosenBlock.type==='article'?8:4} value={chosenBlock.text}
          onChange={e=>modifyBlock(chosenBlock.id,{text:e.target.value})}
          placeholder={chosenBlock.type==='article'?'Título na primeira linha, depois o texto':''}/>
        </label>}
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
        {chosenBlock.type==='image'&&<label>Altura da foto
         <input type="range" min="130" max="650" step="10" value={chosenBlock.height}
          onChange={e=>modifyBlock(chosenBlock.id,{height:Number(e.target.value)})}/>
        </label>}
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
       <NewspaperCanvas edition={displayEdition} editing={editing&&editor}
        selectedId={blockId} onSelect={setBlockId}
        onResize={(id,size)=>modifyBlock(id,size)}/>
      </div>
     </div>
    </>}
   </div>
  </div>
 </section>;
}

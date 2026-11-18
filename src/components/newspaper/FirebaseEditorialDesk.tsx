import {useEffect,useState,useRef} from 'react';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';
import {NEWSPAPER_TYPEFACES,NEWSPAPER_ENGRAVINGS,type NewspaperTypeface} from '@/lib/newspaper/model';
import {FirebaseNewspaperReader} from './FirebaseNewspaperReader';

type Kind='headline'|'subtitle'|'article'|'quote'|'notice'|'image';
type State='draft'|'published'|'archived'|'cancelled';
type Block={id:string;type:Kind;text:string;subtitle?:string;byline?:string;
  caption?:string;imageSrc?:string;titleFont?:NewspaperTypeface;bodyFont?:NewspaperTypeface;
  span:number;height:number};
type Edition={id:string;editionNo:number;title:string;subtitle:string;blocks:Block[];
  version:number;state:State;campaignDate:string;publishedAt:string|null};
type Summary=Pick<Edition,'id'|'editionNo'|'title'|'state'|'version'>;
const labels:Record<State,string>={draft:'Rascunho',published:'Publicada',archived:'Arquivada',cancelled:'Envio cancelado'};
const kinds:Record<Kind,string>={headline:'Manchete',subtitle:'Subtítulo',article:'Matéria',quote:'Citação',notice:'Comunicado',image:'Gravura'};
const makeBlock=(type:Kind):Block=>({id:crypto.randomUUID(),type,text:'',
  span:type==='headline'?12:6,height:190,
  ...(type==='image'?{imageSrc:NEWSPAPER_ENGRAVINGS[0]!.src}:{})});

async function request<T>(body:Record<string,unknown>):Promise<T>{
  const token=await firebasePilotAuth()?.getToken();
  if(!token)throw Error('Entre novamente com sua conta de Editor-chefe.');
  const response=await fetch('/api/firebase-cloud-newspaper',{method:'POST',
    credentials:'omit',cache:'no-store',redirect:'error',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify(body)});
  if(!response.ok)throw Error(response.status===409
    ?'Esta edição mudou em outra janela. Reabra a edição antes de salvar.'
    :response.status===403?'Seu perfil não pode editar o jornal.'
    :response.status===400?'Revise os campos e o conteúdo da edição.'
    :response.status===401?'Sua sessão expirou. Entre novamente.'
    :'O serviço editorial está indisponível. Seu texto permanece nesta tela.');
  const result:unknown=await response.json();
  if(!result||typeof result!=='object'||!('result' in result))throw Error('Resposta editorial inválida.');
  return (result as {result:T}).result;
}

export function FirebaseEditorialDesk({onChanged}:{onChanged:()=>void}){
  const [history,setHistory]=useState<Summary[]>([]);
  const [current,setCurrent]=useState<Edition|null>(null);
  const [title,setTitle]=useState('A Folha Sem Selo');
  const [subtitle,setSubtitle]=useState('');
  const [blocks,setBlocks]=useState<Block[]>([]);
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [message,setMessage]=useState('');
  const [preview,setPreview]=useState(false);
  const mounted=useRef(true);
  const pending=useRef<{signature:string;key:string}|null>(null);
  const reload=async()=>{
    const result=await request<{items:Summary[]}>({action:'listEditorial'});
    if(mounted.current)setHistory(result.items);
  };
  useEffect(()=>{
    mounted.current=true;
    void reload().catch(e=>{if(mounted.current)setMessage(e instanceof Error?e.message:'Falha na consulta.');});
    return()=>{mounted.current=false;};
  },[]);
  useEffect(()=>{
    if(!dirty)return;
    const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',handler);
    return()=>window.removeEventListener('beforeunload',handler);
  },[dirty]);
  function install(edition:Edition){
    setCurrent(edition);setTitle(edition.title);setSubtitle(edition.subtitle);
    setBlocks(edition.blocks.map(b=>({...b,span:b.span??12,height:b.height??190})));
    setDirty(false);pending.current=null;
  }
  const canLeave=()=>!dirty||window.confirm('Descartar as alterações ainda não salvas?');
  function newEdition(){
    if(busy||!canLeave())return;
    setCurrent(null);setTitle('A Folha Sem Selo');setSubtitle('');
    setBlocks([makeBlock('headline'),makeBlock('article')]);
    setDirty(true);setPreview(false);setMessage('Nova edição. Salve como rascunho antes de sair.');
    pending.current=null;
  }
  async function open(id:string){
    if(busy||!canLeave())return;
    setBusy(true);setMessage('');
    try{install(await request<Edition>({action:'getEditorial',id}));setPreview(false);}
    catch(e){setMessage(e instanceof Error?e.message:'Falha ao abrir a edição.');}
    finally{setBusy(false);}
  }
  function patch(id:string,changes:Partial<Block>){
    setBlocks(list=>list.map(b=>b.id===id?{...b,...changes}:b));setDirty(true);
  }
  function move(id:string,delta:number){
    setBlocks(list=>{const next=[...list],i=next.findIndex(b=>b.id===id),j=i+delta;
      if(i<0||j<0||j>=next.length)return list;
      [next[i],next[j]]=[next[j]!,next[i]!];return next;});setDirty(true);
  }
  async function save(state:State){
    if(busy||blocks.length===0)return;
    setBusy(true);setMessage('');
    const content={title,subtitle,blocks};
    const input={action:'saveEdition',id:current?.id??null,
      expectedVersion:current?.version??0,state,content};
    const signature=JSON.stringify(input);
    if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()};
    try{
      const saved=await request<Edition>({...input,requestKey:pending.current.key});
      install(saved);setMessage('Edição '+saved.editionNo+' — '+labels[saved.state]+'. Alterações salvas.');
      onChanged();
      try{await reload();}catch{setMessage('Edição salva. Atualize o histórico para consultar a lista.');}
    }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível salvar.');}
    finally{setBusy(false);}
  }
  return <section aria-label="Redação de A Folha Sem Selo" className="rounded border p-4 space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Redação — Editor-chefe</h2>
        <p className="text-sm">Crie, revise e publique edições com a data oficial do HUB.</p></div>
      <button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={newEdition}>Criar edição</button>
    </header>
    <details className="rounded border p-3" open={blocks.length===0}>
      <summary className="cursor-pointer font-semibold">Histórico editorial</summary>
      {history.length===0?<p className="py-2 text-sm">Nenhuma edição criada neste espaço. As edições importadas continuam no acervo de leitura.</p>:
        <ul className="divide-y">{history.map(e=><li key={e.id} className="py-2">
          <button type="button" disabled={busy} className="text-left underline" onClick={()=>void open(e.id)}>
            Edição {e.editionNo} — {e.title} · {labels[e.state]}
          </button>
        </li>)}</ul>}
      <button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={()=>void reload().catch(e=>setMessage(e.message))}>Atualizar histórico</button>
    </details>
    {message&&<p role="status" className="rounded border p-3 text-sm">{message}</p>}
    {blocks.length>0&&<>
      <div className="flex flex-wrap gap-2 text-sm">
        <strong>{current?'Edição '+current.editionNo:'Nova edição'}</strong>
        <span>{current?labels[current.state]:'Rascunho'} · {dirty?'Alterações não salvas':'Salva'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={()=>setPreview(v=>!v)}>{preview?'Voltar à escrita':'Prévia de leitura'}</button>
        <button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={()=>void save(current?.state==='published'?'published':'draft')}>{busy?'Salvando…':current?.state==='published'?'Salvar edição publicada':'Salvar rascunho'}</button>
        {current?.state!=='published'&&<button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={()=>void save('published')}>Publicar edição</button>}
        {current?.publishedAt&&<>
          <button type="button" disabled={busy||current.state==='cancelled'} className="rounded border px-3 py-2" onClick={()=>void save('cancelled')}>Cancelar envio</button>
          <button type="button" disabled={busy||current.state==='archived'} className="rounded border px-3 py-2" onClick={()=>void save('archived')}>Arquivar</button>
        </>}
      </div>
      {preview?<FirebaseNewspaperReader edition={{id:current?.id??'preview',editionNo:current?.editionNo??0,title,subtitle,blocks,...(current?{campaignDate:current.campaignDate}:{})}}/>:
        <fieldset disabled={busy} className="space-y-4">
          <label className="block text-sm">Título da edição<input value={title} maxLength={180} className="block w-full rounded border p-2" onChange={e=>{setTitle(e.target.value);setDirty(true);}}/></label>
          <label className="block text-sm">Subtítulo do jornal<input value={subtitle} maxLength={280} className="block w-full rounded border p-2" onChange={e=>{setSubtitle(e.target.value);setDirty(true);}}/></label>
          {blocks.map((b,i)=><section key={b.id} className="rounded border p-3 space-y-3" aria-label={'Bloco '+(i+1)}>
            <div className="flex flex-wrap items-center gap-2"><strong>{i+1}. {kinds[b.type]}</strong>
              <button type="button" disabled={i===0} className="rounded border px-2" onClick={()=>move(b.id,-1)}>Subir</button>
              <button type="button" disabled={i===blocks.length-1} className="rounded border px-2" onClick={()=>move(b.id,1)}>Descer</button>
              <button type="button" disabled={blocks.length===1} className="rounded border px-2" onClick={()=>{setBlocks(list=>list.filter(x=>x.id!==b.id));setDirty(true);}}>Remover bloco</button>
            </div>
            {b.type==='image'?<>
              <label className="block text-sm">Gravura<select className="block rounded border p-2" value={b.imageSrc} onChange={e=>patch(b.id,{imageSrc:e.target.value})}>{NEWSPAPER_ENGRAVINGS.map(x=><option key={x.src} value={x.src}>{x.label}</option>)}</select></label>
              <label className="block text-sm">Legenda<input className="block w-full rounded border p-2" value={b.caption??''} maxLength={600} onChange={e=>patch(b.id,{caption:e.target.value})}/></label>
            </>:<label className="block text-sm">Texto<textarea rows={b.type==='article'?8:3} maxLength={16000} value={b.text} className="block w-full rounded border p-2" onChange={e=>patch(b.id,{text:e.target.value})}
              onKeyDown={e=>{if(e.key!=='Tab'||e.shiftKey)return;e.preventDefault();
                const el=e.currentTarget,a=el.selectionStart,z=el.selectionEnd;
                patch(b.id,{text:b.text.slice(0,a)+'    '+b.text.slice(z)});
                requestAnimationFrame(()=>{el.selectionStart=el.selectionEnd=a+4;});}}/></label>}
            {b.type==='article'&&<label className="block text-sm">Autoria<input value={b.byline??''} maxLength={200} className="block w-full rounded border p-2" onChange={e=>patch(b.id,{byline:e.target.value})}/></label>}
            {b.type==='headline'&&<label className="block text-sm">Linha de apoio<input value={b.subtitle??''} maxLength={1000} className="block w-full rounded border p-2" onChange={e=>patch(b.id,{subtitle:e.target.value})}/></label>}
            <div className="flex flex-wrap gap-3">
              {(['titleFont','bodyFont'] as const).map(key=><label className="text-sm" key={key}>{key==='titleFont'?'Fonte do título':'Fonte do texto'}<select className="block rounded border p-2" value={b[key]??'padrao'} onChange={e=>patch(b.id,{[key]:e.target.value})}>{NEWSPAPER_TYPEFACES.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></label>)}
              <label className="text-sm">Largura<select className="block rounded border p-2" value={b.span} onChange={e=>patch(b.id,{span:Number(e.target.value)})}>{[3,4,6,8,12].map(n=><option value={n} key={n}>{n}/12 colunas</option>)}</select></label>
            </div>
          </section>)}
          <div className="flex flex-wrap gap-2">{(Object.keys(kinds) as Kind[]).map(kind=><button key={kind} type="button" disabled={blocks.length>=80} className="rounded border px-3 py-2" onClick={()=>{setBlocks(list=>[...list,makeBlock(kind)]);setDirty(true);}}>Adicionar {kinds[kind].toLowerCase()}</button>)}</div>
        </fieldset>}
    </>}
  </section>;
}


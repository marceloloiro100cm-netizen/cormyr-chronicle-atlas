import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {datedMail} from '@/lib/calendar/mail';
import {formatDate} from '@/lib/calendar/harptos';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { CampaignContent, ImagePicker, uploadImages, type PendingImage } from '@/components/campaign-content';
import { hasDeliveredAnswer, groupReceivedLetters, isLetterRead, nextLetterNumber, pendingRoundHouses, sentLetters, type LetterRow } from '@/lib/letters';
import { date, syncLabel } from './shared';
import type { Panel } from './panel-data';
import {MailComposer,replaceMailDraft,MailLinkFields,useMailOptions,type MailLinks,type MailOptions} from './mail-compose';


function ReplyForm({letterId,replyId,recipientId,onSave}:{letterId:string;replyId?:string;recipientId:string;onSave:()=>unknown}){
  const {data:deliveryWeek=null}=useQuery({queryKey:['reply-delivery',recipientId],queryFn:async()=>{const r=await supabase.rpc('reply_delivery_week',{p_recipient:recipientId});if(r.error)throw r.error;return r.data;},refetchInterval:15000});
  const [open,setOpen]=useState(false),[content,setContent]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const key=useRef<string|null>(null);
  const [images,setImages]=useState<PendingImage[]>([]);
  const [campaignDate,setCampaignDate]=useState('');
  return open?<form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);key.current??=crypto.randomUUID();let richContent;try{richContent=await uploadImages(content,images,key.current);}catch(err){setMessage(err instanceof Error?err.message:'Falha na imagem.');setBusy(false);return;}const draft=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='draft';const {error}=draft?await datedMail('save_weekly_reply_draft',{p_id:key.current,p_letter:letterId,p_reply:(replyId??null) as unknown as string,p_content:richContent},campaignDate):await datedMail('reply_weekly_message',{p_letter:letterId,p_reply:(replyId??null) as unknown as string,p_content:richContent,p_key:key.current,p_draft:false},campaignDate);if(error)setMessage(error.message);else{key.current=null;setContent('');setImages([]);setOpen(false);onSave();}setBusy(false);}}><p role="status">{deliveryWeek?`Previsão de entrega: Semana ${deliveryWeek}. O envio confirma a semana disponível no servidor.`:"Sem semana aberta."}</p><CampaignDatePicker value={campaignDate} onChange={setCampaignDate}/><label>Resposta<textarea required value={content} onChange={e=>setContent(e.target.value)}/></label><ImagePicker images={images} onChange={setImages} disabled={busy}/><div className="campaign-actions"><Button name="action" value="draft" variant="outline" disabled={busy}>Salvar rascunho</Button><Button disabled={busy||deliveryWeek===null}>{busy?'Salvando…':'Enviar resposta'}</Button></div><p role="status">{message}</p></form>:<Button onClick={()=>setOpen(true)}>Responder</Button>;
}

export function MissivasTab({data,me,onSave,onError,onManage}:{data:Panel;me:Panel['players'][number]|undefined;onSave:()=>void;onError:(m:string)=>void;onManage?:(house:string)=>void}){
  const empty={number:'',kind:'',answered:'',house:'',read:'',text:'',box:'',origin:'',court:'',unit:''};
  const [filters,setFilters]=useState(empty);
  const [compose,setCompose]=useState(false);
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const [threads,setThreads]=useState<Set<string>>(new Set());
  const [draft,setDraft]=useState<{key:number;subject:string;content:string}|null>(null);
  const [roundNumber,setRoundNumber]=useState('');
  const open=data.rounds.filter(r=>r.status==='open').map(r=>r.number).sort((a,b)=>b-a)[0]??null;
  const pendingHouses=data.admin?pendingRoundHouses(open,data.houses,data.players,data.members,data.letters as LetterRow[],data.replies):[];
  const [page,setPage]=useState(0);
  const client=useQueryClient();
  const {data:options}=useMailOptions();
  const saved=()=>{client.invalidateQueries({queryKey:['calendar-events']});client.invalidateQueries({queryKey:['campaign-calendar']});client.invalidateQueries({queryKey:['noble-house']});client.invalidateQueries({queryKey:['mail-page']});client.invalidateQueries({queryKey:['mail-insights']});client.invalidateQueries({queryKey:['mail-options']});onSave();};
  useEffect(()=>{setPage(0);},[filters]);
  useEffect(()=>{client.invalidateQueries({queryKey:['mail-page']});client.invalidateQueries({queryKey:['mail-insights']});},[data,client]);
  const [search,setSearch]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setSearch(filters.text),250);return()=>clearTimeout(timer);},[filters.text]);
  const requestFilters={...filters,text:search};
  const listing=useQuery({queryKey:['mail-page',data.user.id,requestFilters,page],queryFn:async()=>{const r=await supabase.rpc('mail_page',{p_filters:requestFilters,p_page:page,p_size:20});if(r.error)throw r.error;return r.data as unknown as {total:number;letters:LetterRow[];replies:Panel['replies']};}});
  const allLetters=listing.data?.letters??[];
  const letters=allLetters;
  const viewReplies=listing.data?.replies??[];
  const groups=filters.box==='enviadas'?[]:groupReceivedLetters(letters,data.user.id);
  const mine=filters.box==='recebidas'?[]:sentLetters(letters,data.user.id);
  const myHouses=data.members.filter(m=>m.player_id===me?.id).map(m=>m.house_id);
  const isRecipient=(letter:LetterRow)=>letter.recipient_player_id===me?.id||(letter.recipient_player_id===null&&myHouses.includes(letter.recipient_house_id??''));
  const toggle=(id:string)=>setExpanded(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleThread=(id:string)=>setThreads(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const houseName=(id:string|null)=>data.houses.find(h=>h.id===id)?.name;
  const linkName=(kind:'court'|'unit',origin:string|null|undefined,id:string|null|undefined)=>{
    const h=options?.houses?.find(h=>h.id===origin);
    const name=kind==='court'?h?.court.find(c=>c.id===id)?.name:h?.units.find(u=>u.id===id)?.name;
    return name??('Vínculo histórico ou restrito · '+(id??'').slice(-8));
  };
  const linkOptions=(kind:'court'|'unit'):[string,string][]=>{
    const values=new Map<string,string>();
    for(const h of options?.houses??[])for(const item of kind==='court'?h.court:h.units)values.set(h.id+':'+item.id,h.name+' — '+item.name);
    for(const l of data.letters){const id=kind==='court'?l.court_member_id:l.military_unit_id;if(id&&l.origin_house_id){const k=l.origin_house_id+':'+id;if(!values.has(k))values.set(k,(houseName(l.origin_house_id)??l.origin_house_id)+' — '+linkName(kind,l.origin_house_id,id));}}
    return [['','Todos'],['none','Sem vínculo'],...[...values].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'))];
  };
  const card=(letter:LetterRow&{deleted_at?:string|null;publication_state?:string;delivery_week?:number|null},canAnswer:boolean)=>{
    const answers=viewReplies.filter(r=>r.letter_id===letter.id);
    const receipt=data.receipts.find(r=>r.letter_id===letter.id&&r.user_id===data.user.id);
    const read=isLetterRead(letter.id,receipt,answers);
    const isOpen=expanded.has(letter.id);
    const threadLetters=letter.conversation_id?allLetters.filter(o=>o.conversation_id===letter.conversation_id&&o.id!==letter.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)):[];
    const threadOpen=threads.has(letter.id);
    const to=letter.recipient_house_id?'Casa '+(houseName(letter.recipient_house_id)??letter.recipient_house_id):letter.recipient_player_id?(options?.players?.find(p=>p.id===letter.recipient_player_id)?.name??'Jogador'):'Narrador';
    const fromHouse=houseName(letter.origin_house_id??null)??(letter.sender_player_id?houseName(data.players.find(p=>p.id===letter.sender_player_id)?.roster_house_id??null):null);
    const canDelete=!letter.deleted_at&&(data.admin||letter.sender_user_id===data.user.id);
    return <article className={'campaign-letter'+(isOpen?'':' recolhida')} key={letter.id} id={'missiva-'+letter.id}>
      <button type="button" className="campaign-letter-toggle" aria-expanded={isOpen} onClick={()=>toggle(letter.id)}>
        <ChevronDown size={18} className={isOpen?'rotate-180 transition-transform':'transition-transform'}/>
        <span className="campaign-eyebrow">{letter.letter_number?`Missiva ${letter.letter_number} · `:''}{letter.letter_kind==='geral'?'Geral':'Reservada'} · {hasDeliveredAnswer(letter,answers)?'Respondida · ':''}{read?'Lida':'Não lida'}{letter.publication_state==='draft'?' · Rascunho':letter.publication_state==='scheduled'?` · Aguardando abertura da Semana ${letter.delivery_week}`:''}{letter.deleted_at?' · Excluída':''}</span>
        <strong className="campaign-letter-subject">{letter.subject}</strong>
        <span className="text-muted-foreground text-sm">De: {letter.sender_name}{fromHouse?` (${fromHouse})`:''} · Para: {to} · {date(letter.created_at)}{answers.length?` · ${answers.length} resposta(s)`:''}</span>
      </button>
      {isOpen&&<div className="campaign-letter-body">
        <p>{formatDate(letter.campaign_date)}</p><CampaignContent content={letter.content}/>
        {(letter.court_member_id||letter.military_unit_id)&&<div className="campaign-eyebrow">{letter.court_member_id&&<p>Corte: {linkName('court',letter.origin_house_id,letter.court_member_id)} · {letter.court_assignment==='order_recipient'?'Destinatário da ordem':'Executor'}</p>}{letter.military_unit_id&&<p>Unidade: {linkName('unit',letter.origin_house_id,letter.military_unit_id)}</p>}</div>}
        {letter.sender_user_id===data.user.id&&letter.publication_state==='delivered'&&<p>Destinatário: {letter.recipient_read?'leitura registrada':'sem leitura registrada'} · {hasDeliveredAnswer(letter,answers)?'resposta recebida':'aguardando resposta'}</p>}
        {data.admin&&letter.sender_user_id===data.user.id&&<details><summary>Leituras registradas pelos destinatários</summary>{data.receipts.filter(r=>r.letter_id===letter.id&&r.user_id!==data.user.id).length===0?<p>Nenhuma leitura registrada.</p>:data.receipts.filter(r=>r.letter_id===letter.id&&r.user_id!==data.user.id).map(r=><p key={r.user_id}>{data.players.find(p=>p.user_id===r.user_id)?.name??'Destinatário autorizado'} · {date(r.read_at)}{isLetterRead(letter.id,r,answers)?'':' · Há respostas posteriores'}</p>)}</details>}
        <p className="text-muted-foreground text-sm">{syncLabel(letter.sync_state)} · {letter.last_synced_at?date(letter.last_synced_at):'Ainda não sincronizada'}</p>
        {answers.length>0&&<div className="campaign-replies">{answers.map(answer=><div key={answer.id}><span className="campaign-eyebrow">Missiva {answer.delivery_week??answer.creation_week??letter.letter_number??'?'} · Resposta</span><br/><strong>{answer.author_name}</strong>{answer.publication_state==='draft'?<div>Rascunho{answer.author_user_id===data.user.id&&!letter.deleted_at&&<ReplyDraftEdit answer={answer} onSave={saved}/>}{answer.author_user_id===data.user.id&&!letter.deleted_at&&<Button size="sm" variant="outline" disabled={!data.admin&&open===null} onClick={async()=>{const r=await supabase.rpc('schedule_weekly_reply_draft',{p_id:answer.id});if(r.error)onError(r.error.message);else saved();}}>Programar entrega</Button>}</div>:answer.publication_state==='scheduled'&&<p>Aguardando abertura da Semana {answer.delivery_week}</p>}<small> · {date(answer.created_at)} · {syncLabel(answer.sync_state)}</small><p>{formatDate(answer.campaign_date)}</p><CampaignContent content={answer.content}/>{!letter.deleted_at&&answer.author_user_id!==data.user.id&&answer.publication_state==='delivered'&&<ReplyForm letterId={letter.id} replyId={answer.id} recipientId={answer.author_user_id} onSave={saved}/>}</div>)}</div>}
        {threadLetters.length>0&&<div className="campaign-thread"><Button size="sm" variant="ghost" aria-expanded={threadOpen} onClick={()=>toggleThread(letter.id)}>{threadOpen?'Ocultar fio da conversa':`Ver relacionadas nesta página (${threadLetters.length} missiva(s) relacionada(s))`}</Button>{threadOpen&&threadLetters.map(other=>{const otherAnswers=viewReplies.filter(r=>r.letter_id===other.id);return <div key={other.id} className="campaign-thread-item"><span className="campaign-eyebrow">{other.letter_number?`Missiva ${other.letter_number} · `:''}{other.letter_kind==='geral'?'Geral':'Reservada'}</span><strong>{other.subject}</strong><small> · De: {other.sender_name} · {date(other.created_at)}</small><CampaignContent content={other.content}/>{otherAnswers.map(a=><div key={a.id} className="campaign-replies"><span className="campaign-eyebrow">Missiva {a.delivery_week??a.creation_week??'?'} · Resposta</span><br/><strong>{a.author_name}</strong><small> · {date(a.created_at)}</small><CampaignContent content={a.content}/></div>)}</div>;})}</div>}
        {!letter.deleted_at&&<div className="campaign-actions">
          {!read&&letter.publication_state==='delivered'&&<Button variant="outline" onClick={async()=>{const {error}=await supabase.rpc('mark_letter_read',{p_id:letter.id});if(error&&error.code!=='23505')onError(error.message);else saved();}}>Marcar como lida</Button>}
          {open!==null&&!data.admin&&<Button variant="outline" onClick={()=>{if(!replaceMailDraft(data.user.id))return;setDraft({key:Date.now(),subject:'Enc: '+letter.subject,content:`— Missiva encaminhada —\nDe: ${letter.sender_name} · ${date(letter.created_at)}\nAssunto: ${letter.subject}\n\n${letter.content}`});document.getElementById('nova-missiva')?.scrollIntoView({behavior:'smooth'});}}>Encaminhar</Button>}
          {canDelete&&<Button variant="outline" onClick={async()=>{if(!confirm('Excluir esta missiva? Ela deixará de aparecer para os jogadores.'))return;const {error}=await supabase.rpc('delete_campaign_letter',{p_id:letter.id});if(error)onError(error.message);else saved();}}>Excluir</Button>}
        </div>}
        {!letter.deleted_at&&letter.publication_state==='draft'&&letter.sender_user_id===data.user.id&&<Button variant="outline" disabled={!data.admin&&open===null} onClick={async()=>{const result=await supabase.rpc('schedule_letter_draft',{p_id:letter.id,p_week:letter.delivery_week??open??nextLetterNumber(data.letters)});if(result.error)onError(result.error.message);else saved();}}>Programar entrega</Button>}{!letter.deleted_at&&((data.admin&&letter.publication_state!=='draft')||(letter.publication_state==='draft'&&letter.sender_user_id===data.user.id))&&<LetterEdit letter={letter} onSave={saved}/>}
        {!letter.deleted_at&&letter.publication_state==='delivered'&&letter.sender_user_id!==data.user.id&&canAnswer&&<ReplyForm letterId={letter.id} recipientId={letter.sender_user_id} onSave={saved}/>}
        <Button variant="ghost" size="sm" onClick={()=>{toggle(letter.id);document.getElementById('missiva-'+letter.id)?.scrollIntoView({block:'nearest'});}}>Recolher</Button>
      </div>}
    </article>;
  };
  const sel=(label:string,key:keyof typeof empty,opts:[string,string][])=><label>{label}<select value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}>{opts.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;
  const numbers=[...new Set([...data.letters.map(l=>l.letter_number),...data.replies.map(r=>r.delivery_week)].filter((n):n is number=>n!==null))].sort((a,b)=>b-a);
  const visibleIds=[...groups.flatMap(g=>g.letters),...mine].map(l=>l.id);
  return <div className="campaign-mail-layout">
    <aside className="campaign-mail-side" aria-label="Filtros das missivas">
      <p className="campaign-eyebrow">FILTROS</p>
      <label>Buscar<input type="search" value={filters.text} onChange={e=>setFilters({...filters,text:e.target.value})} placeholder="Assunto, texto ou remetente…"/></label>
      {sel('Caixa','box',[['','Todas'],['recebidas','Recebidas'],['enviadas','Enviadas'],['programadas','Programadas'],['rascunhos','Rascunhos'],['historico','Histórico por semana'],...(data.admin?[['excluidas','Excluídas']] as [string,string][]:[])])}
      {data.admin&&sel('Casa destinatária / legado','house',[['','Todas as casas'],...data.houses.filter(h=>h.active&&h.season===2).map(h=>[h.id,h.name] as [string,string])])}
      {sel('Casa remetente','origin',[['','Todas as casas'],['none','Sem vínculo / legado'],...data.houses.map(h=>[h.id,h.name] as [string,string])])}
      {sel('Membro da corte','court',linkOptions('court'))}
      {sel('Unidade militar','unit',linkOptions('unit'))}
      {sel('Semana','number',[['','Todas as semanas'],...numbers.map(n=>[String(n),'Semana '+n] as [string,string])])}
      {sel('Tipo','kind',[['','Todos os tipos'],['geral','Geral'],['reservada','Reservada']])}
      {sel('Resposta','answered',[['','Todas'],['yes','Respondidas'],['no','Não respondidas']])}
      {sel('Minha leitura','read',[['','Todas'],['no','Não lidas'],['yes','Lidas']])}
      {groups.some(g=>g.number!==null)&&<nav className="campaign-mail-jump" aria-label="Ir para uma semana de missiva">{groups.filter(g=>g.number!==null).map(g=><button key={g.number} type="button" onClick={()=>document.getElementById('grupo-missiva-'+g.number)?.scrollIntoView({behavior:'smooth',block:'start'})}>Missiva {g.number}</button>)}</nav>}
      <Button variant="outline" onClick={()=>setFilters(empty)}>Limpar filtros</Button>
      <div className="campaign-actions"><Button size="sm" variant="ghost" onClick={()=>setExpanded(new Set(visibleIds))}>Expandir todas</Button><Button size="sm" variant="ghost" onClick={()=>setExpanded(new Set())}>Recolher todas</Button></div>
      {!data.admin&&open!==null&&<Button onClick={()=>{setDraft({key:Date.now(),subject:'',content:''});document.getElementById('nova-missiva')?.scrollIntoView({behavior:'smooth'});}}>Escrever missiva</Button>}
    </aside>
    <div>
      <MailInsights options={options} houseName={houseName} onSelect={row=>setFilters({...empty,origin:row.origin_house_id??'none',court:row.court_member_id?row.origin_house_id+':'+row.court_member_id:'none',unit:row.military_unit_id?row.origin_house_id+':'+row.military_unit_id:'none'})}/>
      {listing.isPending&&<p role="status">Carregando missivas…</p>}
      {listing.error&&<p role="alert">Não foi possível carregar as missivas. <Button onClick={()=>listing.refetch()}>Tentar novamente</Button></p>}
      <nav className="campaign-actions" aria-label="Páginas de missivas"><Button disabled={page===0||listing.isFetching} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span>Página {page+1} · {listing.data?.total??0} entregas encontradas</span><Button disabled={listing.isFetching||(page+1)*20>=(listing.data?.total??0)} onClick={()=>setPage(p=>p+1)}>Próxima</Button></nav>
      <div className={'campaign-round '+(open===null?'fechada':'')} role="status">{open===null?'Missivas fechadas, aguarde o narrador abrir a próxima semana.':`Missiva ${open} aberta — respostas, novas missivas e encaminhamentos liberados.`}</div>
      {data.admin&&<><div className="campaign-heading"><h2>Gestão de missivas</h2><Button onClick={()=>setCompose(v=>!v)}>{compose?'Fechar escrita':'Escrever missiva'}</Button></div>
        <section className="campaign-round-pending" aria-label="Casas com respostas pendentes">
          <h3>{open===null?'Respostas da rodada':`Missiva ${open} · Casas com respostas pendentes`}</h3>
          {open===null?<p className="text-muted-foreground">Nenhuma rodada aberta.</p>:<><p>{pendingHouses.length} casa{pendingHouses.length===1?'':'s'} aguardando resposta</p>{pendingHouses.length===0?<p className="text-muted-foreground">Nenhuma resposta pendente às missivas entregues nesta rodada.</p>:<ul>{pendingHouses.map(h=><li key={h.id}><div><strong>{h.name}</strong><span className="text-muted-foreground text-sm">{h.letterIds.length} missiva{h.letterIds.length===1?'':'s'} pendente{h.letterIds.length===1?'':'s'}</span></div><Button size="sm" variant="outline" onClick={()=>{setFilters({...empty,house:h.id});setExpanded(new Set(h.letterIds));}}>Ver missivas</Button></li>)}</ul>}</>}
        </section>
        <p>Nesta página: {allLetters.length} missivas · {allLetters.filter(l=>!hasDeliveredAnswer(l,viewReplies)).length} não respondidas</p>
        <div className="campaign-actions">{open!==null&&<Button variant="outline" onClick={async()=>{if(!confirm(`Fechar a Missiva ${open}? Os jogadores não poderão mais responder nem escrever.`))return;const {error}=await supabase.rpc('set_letter_round',{p_number:open,p_closed:true});if(error)onError(error.message);else saved();}}>Fechar Missiva {open}</Button>}<input type="number" min={1} style={{width:140}} value={roundNumber} onChange={e=>setRoundNumber(e.target.value)} placeholder={`Nº (ex.: ${(numbers[0]??0)+1})`} aria-label="Número da missiva a abrir"/><Button variant="outline" onClick={async()=>{const n=Number(roundNumber||(numbers[0]??0)+1);const preview=data.letters.filter(l=>l.delivery_week===n&&l.publication_state==='scheduled');const responses=data.replies.filter(r=>r.delivery_week===n&&r.publication_state==='scheduled');if(!confirm(`Abrir Semana ${n}? ${preview.length} mensagens e ${responses.length} respostas serão liberadas. Destinatários: ${preview.map(l=>houseName(l.recipient_house_id)||'Jogador autorizado').join(', ')||'Nenhuma nova mensagem'}. A semana anterior será encerrada.`))return;const {error}=await supabase.rpc('set_letter_round',{p_number:n,p_closed:false});if(error)onError(error.message);else{setRoundNumber('');saved();}}}>Abrir missiva</Button></div>
        {compose&&<MailComposer data={data} me={me} onSave={saved} onManage={onManage}/>}</>}
      {filters.box!=='enviadas'&&<><div className="campaign-heading"><h2>{filters.box==='excluidas'?'Missivas excluídas':'Missivas recebidas'}</h2><span>{groups.reduce((n,g)=>n+g.letters.length,0)} missivas</span></div>
      {groups.length===0&&<p className="campaign-empty">Nenhuma missiva encontrada.</p>}
      {groups.map(group=><section key={group.number??'sem-numero'} id={group.number!==null?'grupo-missiva-'+group.number:undefined} className="campaign-mail-group">{group.number!==null&&<h3 className="campaign-letter-number">Missiva {group.number}{data.rounds.find(r=>r.number===group.number)?.closed?' · fechada':''}</h3>}{group.letters.map(letter=>card(letter,isRecipient(letter)||data.admin))}</section>)}</>}
      {filters.box!=='recebidas'&&<><div className="campaign-heading"><h2>Missivas enviadas por você</h2><span>{mine.length} missivas</span></div>
      {mine.length===0&&<p className="campaign-empty">Nenhuma missiva enviada encontrada.</p>}
      {mine.map(letter=>card(letter,data.admin))}</>}
      {!data.admin&&<MailComposer key={draft?.key??0} data={data} me={me} initial={draft} onSave={()=>{setDraft(null);saved();}} onManage={onManage}/>}
    </div>
  </div>;
}

function LetterEdit({letter,onSave}:{letter:LetterRow;onSave:()=>void}){
  const [campaignDate,setCampaignDate]=useState(letter.campaign_date??'');
  const [open,setOpen]=useState(false),[subject,setSubject]=useState(letter.subject),[content,setContent]=useState(letter.content),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const {data:options}=useMailOptions();
  const [links,setLinks]=useState<MailLinks>({origin:letter.origin_house_id??'',court:letter.court_member_id??'',unit:letter.military_unit_id??'',role:letter.court_assignment??'executor'});
  const [images,setImages]=useState<PendingImage[]>([]);
  const {data:versions=[]}=useQuery({queryKey:['letter-versions',letter.id,letter.version],enabled:open,queryFn:async()=>{const r=await supabase.from('letter_versions').select('*').eq('letter_id',letter.id).order('version',{ascending:false});if(r.error)throw r.error;return r.data??[];}});
  if(!open)return <Button variant="outline" onClick={()=>{setSubject(letter.subject);setContent(letter.content);setOpen(true);}}>Editar missiva</Button>;
  return <form className="campaign-form" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const rich=await uploadImages(content,images,crypto.randomUUID());const result=letter.publication_state==='draft'?await datedMail('edit_linked_mail_draft',{p_id:letter.id,p_version:letter.version??1,p_subject:subject,p_content:rich,p_origin:links.origin||null,p_court:links.court||null,p_unit:links.unit||null,p_role:links.court?links.role:null},campaignDate):await datedMail('edit_campaign_letter',{p_id:letter.id,p_version:letter.version??1,p_subject:subject,p_content:rich},campaignDate);if(result.error)throw result.error;setOpen(false);setImages([]);onSave();}catch(err){setMessage(err instanceof Error?err.message:'Não foi possível salvar.');}finally{setBusy(false);}}}>{letter.publication_state==='draft'&&<MailLinkFields value={links} onChange={setLinks} options={options??{players:[],houses:[]}}/>}<CampaignDatePicker value={campaignDate} onChange={setCampaignDate}/><label>Assunto<input required value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>Missiva<textarea required value={content} onChange={e=>setContent(e.target.value)}/></label><ImagePicker images={images} onChange={setImages} disabled={busy}/><div className="campaign-actions"><Button disabled={busy}>Salvar nova versão</Button><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button></div><details><summary>Histórico de versões</summary>{versions.map(v=><div key={v.id}><strong>Versão {v.version}</strong><CampaignContent content={typeof v.snapshot==='object'&&v.snapshot&&'content' in v.snapshot?String(v.snapshot['content']):''}/></div>)}</details><p role="status">{message}</p></form>;
}

function ReplyDraftEdit({answer,onSave}:{answer:Panel['replies'][number];onSave:()=>void}){
 const [campaignDate,setCampaignDate]=useState(answer.campaign_date??'');
 const [editing,setEditing]=useState(false),[content,setContent]=useState(answer.content),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!editing)return <Button size="sm" variant="outline" onClick={()=>{setContent(answer.content);setEditing(true);}}>Editar rascunho</Button>;
 return <form className="campaign-form" onSubmit={async e=>{e.preventDefault();setBusy(true);const r=await datedMail('save_weekly_reply_draft',{p_id:answer.id,p_letter:answer.letter_id,p_reply:(answer.reply_to_id===answer.letter_id?null:answer.reply_to_id) as unknown as string,p_content:content},campaignDate);setBusy(false);if(r.error)setError(r.error.message);else{setEditing(false);onSave();}}}><CampaignDatePicker value={campaignDate} onChange={setCampaignDate}/><label>Resposta<textarea required value={content} onChange={e=>setContent(e.target.value)}/></label><Button disabled={busy}>Salvar rascunho</Button><Button type="button" variant="outline" onClick={()=>{if(content===answer.content||confirm('Descartar alterações não salvas?'))setEditing(false);}}>Cancelar</Button><p role="status">{error}</p></form>;
}

type Insight={origin_house_id:string|null;court_member_id:string|null;court_assignment:string|null;military_unit_id:string|null;messages:number;deliveries:number;delivered:number;answered:number};
function MailInsights({options,houseName,onSelect}:{options:MailOptions|undefined;houseName:(id:string|null)=>string|undefined;onSelect:(r:Insight)=>void}){
 const [open,setOpen]=useState(false);
 const result=useQuery({queryKey:['mail-insights'],enabled:open,queryFn:async()=>{const r=await supabase.rpc('mail_insights');if(r.error)throw r.error;return r.data as unknown as Insight[];}});
 return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Análise por casa e responsáveis</summary><p>Contagem das entregas visíveis para você. Uma missiva enviada a três pessoas conta como uma mensagem e três entregas. Resposta recebida não comprova execução da ordem.</p>{result.isPending&&<p>Carregando análise…</p>}{result.error&&<p role="alert">Não foi possível carregar a análise.</p>}{result.data&&<div style={{overflowX:'auto'}}><table><thead><tr><th>Casa</th><th>Corte / responsabilidade</th><th>Unidade</th><th>Mensagens</th><th>Entregas</th><th>Entregues</th><th>Respondidas</th><th>Pendentes de resposta</th><th>Consultar</th></tr></thead><tbody>{result.data.map((row,i)=>{const h=options?.houses?.find(h=>h.id===row.origin_house_id);return <tr key={i}><td>{houseName(row.origin_house_id)??'Sem vínculo / legado'}</td><td>{row.court_member_id?(h?.court.find(c=>c.id===row.court_member_id)?.name??'Vínculo histórico ou restrito'):'Sem vínculo'}{row.court_member_id&&(row.court_assignment==='order_recipient'?' — Destinatário da ordem':' — Executor')}</td><td>{row.military_unit_id?(h?.units.find(u=>u.id===row.military_unit_id)?.name??'Vínculo histórico ou restrito'):'Sem vínculo'}</td><td>{row.messages}</td><td>{row.deliveries}</td><td>{row.delivered}</td><td>{row.answered}</td><td>{row.delivered-row.answered}</td><td><Button variant="ghost" onClick={()=>onSelect(row)}>Ver missivas</Button></td></tr>;})}</tbody></table></div>}</details>;
}

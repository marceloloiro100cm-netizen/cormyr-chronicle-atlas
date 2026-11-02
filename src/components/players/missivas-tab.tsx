import {CampaignDatePicker} from '@/components/calendar/date-picker';
import {datedMail} from '@/lib/calendar/mail';
import {formatDate} from '@/lib/calendar/harptos';
import {mailWeekTimeline,nextCampaignRound} from '@/lib/weekly-delivery';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {createPortal} from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { CampaignContent, ImagePicker, uploadImages, type PendingImage } from '@/components/campaign-content';
import { deliveredReply, hasDeliveredAnswer, groupReceivedLetters, isLetterRead, narratorThreadStage, nextLetterNumber, sentLetters, mailRecipientLabel, relatedConversationLetters, type LetterRow } from '@/lib/letters';
import { date, syncLabel } from './shared';
import type { Panel } from './panel-data';
import {MailComposer,replaceMailDraft,MailLinkFields,useMailOptions,type MailLinks,type MailOptions} from './mail-compose';
import {NARRATION_GROUPS,narrationHouseIds} from '@/lib/mail-groups';
import {NarratorMailNotes} from './narrator-mail-notes';
import {LetterConsequences,type LetterConsequenceRow} from './letter-consequences';
import {MailPeriodNotice} from './mail-period-notice';
import {dateKey} from '@/lib/calendar/harptos';
import {formatRoundHarptosReference} from '@/lib/calendar/chronology';
import {useCampaignTime} from '@/lib/calendar/campaign-time';


function ReplyForm({letterId,replyId,recipientId,roundRevision,onSave,label='Responder',isAdmin=false}:{letterId:string;replyId?:string|undefined;recipientId:string;roundRevision:string;onSave:()=>unknown;label?:string;isAdmin?:boolean}){
  const {data:currentTime}=useCampaignTime();
  const {data:deliveryWeek=null}=useQuery({queryKey:['reply-delivery',recipientId,roundRevision],queryFn:async()=>{const r=await supabase.rpc('reply_delivery_week',{p_recipient:recipientId});if(r.error)throw r.error;return r.data;},refetchInterval:15000});
  const [open,setOpen]=useState(false),[content,setContent]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const key=useRef<string|null>(null);
  const [images,setImages]=useState<PendingImage[]>([]);
  const [signedBy,setSignedBy]=useState('');
  const [campaignDate,setCampaignDate]=useState('');
  return open?<form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);key.current??=crypto.randomUUID();let richContent;try{richContent=await uploadImages(content,images,key.current);}catch(err){setMessage(err instanceof Error?err.message:'Falha na imagem.');setBusy(false);return;}const draft=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='draft';const {error}=draft?await datedMail('save_weekly_reply_draft',{p_id:key.current,p_letter:letterId,p_reply:(replyId??null) as unknown as string,p_content:richContent,p_signed_by:isAdmin?signedBy.trim():null},campaignDate):await datedMail('reply_weekly_message',{p_letter:letterId,p_reply:(replyId??null) as unknown as string,p_content:richContent,p_key:key.current,p_draft:false,p_signed_by:isAdmin?signedBy.trim():null},campaignDate);if(error)setMessage(error.message);else{key.current=null;setContent('');setImages([]);setOpen(false);onSave();}setBusy(false);}}><p role="status">{deliveryWeek?`Previsão de entrega: Semana ${deliveryWeek}. O envio confirma a semana disponível no servidor.`:"Sem semana aberta."}</p><CampaignDatePicker value={campaignDate} referenceDate={currentTime?dateKey(currentTime):undefined} onChange={setCampaignDate}/><label>Resposta<textarea required value={content} onChange={e=>setContent(e.target.value)}/></label>{isAdmin&&<label>Assinado por (NPC / cargo)<input maxLength={120} value={signedBy} onChange={e=>setSignedBy(e.target.value)} placeholder="Ex.: Intendente da Casa"/></label>}<ImagePicker images={images} onChange={setImages} disabled={busy}/><div className="campaign-actions"><Button name="action" value="draft" variant="outline" disabled={busy}>Salvar rascunho</Button><Button disabled={busy||deliveryWeek===null}>{busy?'Salvando…':'Enviar resposta'}</Button></div><p role="status">{message}</p></form>:<Button onClick={()=>setOpen(true)}>{label}</Button>;
}

export function MissivasTab({data,me,onSave,onError,onManage,groupHouseIds,filterHost}:{data:Panel;me:Panel['players'][number]|undefined;onSave:()=>void;onError:(m:string)=>void;onManage?:(house:string)=>void;groupHouseIds?:string[];filterHost?:HTMLElement|null}){
  const empty={number:'',kind:'',answered:'',house:'',read:'',text:'',box:'',origin:'',court:'',unit:'',group:''};
  const [filters,setFilters]=useState(empty);
  const [filtersVisible,setFiltersVisible]=useState(true);
  const trashMode=filters.box==='lixeira';
  const [compose,setCompose]=useState(false);
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const [threads,setThreads]=useState<Set<string>>(new Set());
  const [draft,setDraft]=useState<{key:number;subject:string;content:string}|null>(null);
  const [roundNumber,setRoundNumber]=useState('');
  const open=data.rounds.filter(r=>r.status==='open').map(r=>r.number).sort((a,b)=>b-a)[0]??null;
  const nextRound=nextCampaignRound(data.rounds);
  const activeRound=data.rounds.find(r=>r.number===open&&r.status==='open')??null;
  const roundRevision=data.rounds.map(r=>`${r.number}:${r.status}:${r.harptos_period??'sem-referencia'}`).sort().join('|');
  const groupChoices=filters.group?narrationHouseIds(filters.group,data.houses.map(h=>h.id)):data.houses.map(h=>h.id);
  const allowed=new Set(groupHouseIds?groupChoices.filter(id=>groupHouseIds.includes(id)):groupChoices);
  const groupActive=data.admin&&(groupHouseIds!==undefined||filters.group!=='');
  const matchesGroup=(letter:Pick<LetterRow,'origin_house_id'|'recipient_house_id'|'sender_player_id'|'recipient_player_id'|'sender_user_id'>)=>allowed.has(letter.origin_house_id??'')||
    allowed.has(letter.recipient_house_id??'')||
    data.players.some(p=>(p.id===letter.sender_player_id||p.id===letter.recipient_player_id||p.user_id===letter.sender_user_id)&&
      (allowed.has(p.roster_house_id??'')||data.members.some(m=>m.player_id===p.id&&allowed.has(m.house_id))));
  const [page,setPage]=useState(0);
  const client=useQueryClient();
  const {data:options}=useMailOptions();
  const {data:calendar}=useCampaignTime();
  const periodDate=data.admin&&calendar?dateKey(calendar):'';
  const saved=()=>{client.invalidateQueries({queryKey:['campaign-chronology']});client.invalidateQueries({queryKey:['calendar-events']});client.invalidateQueries({queryKey:['campaign-calendar']});client.invalidateQueries({queryKey:['noble-house']});client.invalidateQueries({queryKey:['mail-page']});client.invalidateQueries({queryKey:['mail-trash-page']});client.invalidateQueries({queryKey:['mail-insights']});client.invalidateQueries({queryKey:['mail-overview-grouped']});client.invalidateQueries({queryKey:['mail-options']});onSave();};
  const groupKey=[...(groupHouseIds??[]),filters.group].join('|')||'all';
  useEffect(()=>{setPage(0);},[filters,groupKey]);
  useEffect(()=>{client.invalidateQueries({queryKey:['mail-page']});client.invalidateQueries({queryKey:['mail-insights']});},[data,client]);
  const [search,setSearch]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setSearch(filters.text),250);return()=>clearTimeout(timer);},[filters.text]);
  const requestFilters={...filters,text:search,...(groupActive?{group_house_ids:[...allowed]}: {})};
  const listing=useQuery({queryKey:[trashMode?'mail-trash-page':'mail-page',data.user.id,requestFilters,page],queryFn:async()=>{const args={p_filters:requestFilters,p_page:page,p_size:20};const r=trashMode?await supabase.rpc('mail_trash_page',args):await supabase.rpc('mail_page',args);if(r.error)throw r.error;return r.data as unknown as {total:number;letters:LetterRow[];replies:Panel['replies'];kpis?:{delivered:number;awaiting_house:number;awaiting_narrator:number;scheduled_replies_next:number;drafts:number}};}});
  const allLetters=listing.data?.letters??[];
  const consequenceIds=allLetters.map(letter=>letter.id);
  const consequences=useQuery({
    queryKey:['letter-consequences',data.user.id,consequenceIds.join('|')],
    enabled:consequenceIds.length>0,
    queryFn:async()=>{
      const result=await supabase.from('campaign_letter_consequences')
        .select('id,letter_id,house_id,changes,active,created_at')
        .in('letter_id',consequenceIds);
      if(result.error)throw result.error;
      return (result.data??[]) as LetterConsequenceRow[];
    }
  });
  const letters=allLetters;
  const viewReplies=listing.data?.replies??[];
  const outgoingView=filters.box==='enviadas';
  // Cartas enviadas não aparecem na listagem padrão, mas continuam consultáveis
  // por filtros específicos para preservar respostas, rascunhos e recibos de leitura.
  const groups=trashMode?[]:groupReceivedLetters(
    outgoingView?sentLetters(letters,data.user.id):letters,
    data.user.id,
    data.admin || ['enviadas','rascunhos','programadas','historico'].includes(filters.box),
  );
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
    for(const h of (options?.houses??[]).filter(h=>!groupActive||allowed.has(h.id)))for(const item of kind==='court'?h.court:h.units)values.set(h.id+':'+item.id,h.name+' — '+item.name);
    for(const l of data.letters.filter(l=>!groupActive||matchesGroup(l as LetterRow))){const id=kind==='court'?l.court_member_id:l.military_unit_id;if(id&&l.origin_house_id){const k=l.origin_house_id+':'+id;if(!values.has(k))values.set(k,(houseName(l.origin_house_id)??l.origin_house_id)+' — '+linkName(kind,l.origin_house_id,id));}}
    return [['','Todos'],['none','Sem vínculo'],...[...values].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'))];
  };
  const card=(letter:LetterRow&{deleted_at?:string|null;publication_state?:string;delivery_week?:number|null},canAnswer:boolean)=>{
    const answers=viewReplies.filter(r=>r.letter_id===letter.id&&(trashMode?Boolean(r.deleted_at):!r.deleted_at));
    const receipt=data.receipts.find(r=>r.letter_id===letter.id&&r.user_id===data.user.id);
    const read=isLetterRead(letter.id,receipt,answers);
    const incomingReplies=answers.filter(r=>deliveredReply(r)&&r.author_user_id!==data.user.id);
    const narratorStage=data.admin?narratorThreadStage(letter,answers,data.user.id):null;
    const pendingReply=answers.some(r=>r.publication_state==='scheduled'||(r.publication_state==='draft'&&r.author_user_id===data.user.id));
    const readStatus=letter.sender_user_id===data.user.id
      ?incomingReplies.length===0?'Aguardando resposta':read?'Resposta lida':'Resposta não lida'
      :read?'Lida':'Não lida';
    const isOpen=expanded.has(letter.id);
    const threadLetters=relatedConversationLetters(letter,allLetters);
    const threadOpen=threads.has(letter.id);
    const to=mailRecipientLabel(letter,houseName,id=>options?.players?.find(p=>p.id===id)?.name);
    const fromHouse=houseName(letter.origin_house_id??null)??(letter.sender_player_id?houseName(data.players.find(p=>p.id===letter.sender_player_id)?.roster_house_id??null):null);
    const canDelete=!trashMode&&!letter.deleted_at&&(data.admin||letter.sender_user_id===data.user.id);
    const canRestoreLetter=trashMode&&Boolean(letter.deleted_at)&&(data.admin||letter.sender_user_id===data.user.id);
    const lastPlayerReply=answers.filter(a=>a.publication_state==='delivered'&&a.author_user_id!==data.user.id)
      .sort((a,b)=>(b.delivered_at??b.created_at).localeCompare(a.delivered_at??a.created_at))[0];
    const housePlayer=data.players.find(p=>p.active&&!p.require_password_change&&p.user_id!==data.user.id&&
      (p.id===letter.recipient_player_id||data.members.some(m=>m.player_id===p.id&&m.house_id===letter.recipient_house_id)));
    const replyTarget=letter.sender_user_id===data.user.id
      ?lastPlayerReply?.author_user_id??housePlayer?.user_id??null:letter.sender_user_id;
    return <article className={'campaign-letter'+(isOpen?'':' recolhida')} key={letter.id} id={'missiva-'+letter.id}>
      <button type="button" className="campaign-letter-toggle" aria-expanded={isOpen} onClick={()=>toggle(letter.id)}>
        <ChevronDown size={18} className={isOpen?'rotate-180 transition-transform':'transition-transform'}/>
        <span className="campaign-eyebrow">{letter.letter_number?`Missiva ${letter.letter_number} · `:''}{letter.letter_kind==='geral'?'Geral':'Reservada'} · {narratorStage==='awaiting-house'?'Aguardando resposta da Casa · ':narratorStage==='awaiting-narrator'?'Aguardando resposta do Narrador · ':hasDeliveredAnswer(letter,answers)?'Respondida · ':''}{readStatus}{data.admin&&pendingReply?' · Há resposta em rascunho/programada':''}{letter.publication_state==='draft'?' · Rascunho':letter.publication_state==='scheduled'?` · Aguardando abertura da Semana ${letter.delivery_week}`:''}{letter.deleted_at?' · Excluída':trashMode?' · Resposta excluída':''}</span>
        <strong className="campaign-letter-subject">{letter.subject}</strong>
        <span className="text-muted-foreground text-sm">De: {letter.sender_name}{fromHouse?` (${fromHouse})`:''} · Para: {to} · {letter.campaign_date?formatDate(letter.campaign_date):date(letter.created_at)}{letter.historical_source?' · Arquivo histórico':''} · {mailWeekTimeline(letter.creation_week,letter.delivery_week,letter.publication_state)}{answers.length?` · ${answers.length} resposta(s)`:''}</span>
      </button>
      {isOpen&&<div className="campaign-letter-body">
        <p>{formatDate(letter.campaign_date)}</p>
        {trashMode&&<p className="campaign-trash-notice" role="status">{letter.deleted_at?`Missiva excluída em ${date(letter.deleted_at)}. A conversa original foi preservada.`:'Uma ou mais respostas foram excluídas. A missiva original continua ativa.'}</p>}
        <p className="text-sm font-semibold" role="status">{mailWeekTimeline(letter.creation_week,letter.delivery_week,letter.publication_state)}</p>
        {letter.historical_source&&<p className="text-muted-foreground text-sm">Correspondência histórica importada de {letter.historical_source} · não representa um novo envio pelo site.</p>}
        {data.admin&&letter.historical_source&&<p className="text-muted-foreground text-sm">{letter.historical_recipient_name?.includes('(NPC, Narrador)')?'Recebida pelo Narrador na qualidade de gestor da casa NPC.':letter.recipient_house_id?'Entregue à casa jogadora. O Narrador pode acompanhar administrativamente, mas não recebeu cópia da missiva.':'Correspondência arquivada.'}</p>}
        <section className="campaign-letter-original" aria-label="Texto da missiva original">
          <CampaignContent content={letter.content}/>
        </section>
        {answers.length>0&&<section className="campaign-replies campaign-reply-thread" aria-label={`Fio de respostas: ${letter.subject}`}>
          <div className="campaign-reply-thread-heading">
            <span className="campaign-reply-thread-arrow" aria-hidden="true">↳</span>
            <h4>Fio de respostas</h4>
            <span className="campaign-reply-thread-count">{answers.length} {answers.length===1?'resposta':'respostas'}</span>
          </div>
          {answers.map((answer,index)=><article className="campaign-reply-card" key={answer.id} aria-label={`Resposta de ${answer.author_name}`}>
            <header className="campaign-reply-header">
              <div>
                <span className="campaign-eyebrow">{trashMode?'Resposta excluída':`Resposta ${index+1}`} · {mailWeekTimeline(answer.creation_week,answer.delivery_week,answer.publication_state)}</span>
                <strong>{answer.author_name}</strong>
              </div>
              <small>{answer.campaign_date?formatDate(answer.campaign_date):'Sem data histórica informada'} · {syncLabel(answer.sync_state)}</small>
            </header>
            {!trashMode&&answer.publication_state==='draft'&&<div>Rascunho
              {answer.author_user_id===data.user.id&&!letter.deleted_at&&<ReplyDraftEdit answer={answer} onSave={saved}/>}
              {answer.author_user_id===data.user.id&&!letter.deleted_at&&<Button size="sm" variant="outline" disabled={!data.admin&&open===null} onClick={async()=>{const r=await supabase.rpc('schedule_weekly_reply_draft',{p_id:answer.id});if(r.error)onError(r.error.message);else saved();}}>Programar entrega</Button>}
            </div>}
            {!trashMode&&answer.publication_state==='scheduled'&&<p>Aguardando abertura da Semana {answer.delivery_week}</p>}
            <div className="campaign-reply-text"><CampaignContent content={answer.content}/></div>
            {!trashMode&&data.admin&&<NarratorMailNotes replyId={answer.id} userId={data.user.id}/>}
             {!trashMode&&!letter.deleted_at&&(data.admin||answer.author_user_id===data.user.id)&&<div className="campaign-actions">
               {data.admin&&answer.publication_state!=='draft'&&<ReplyEdit answer={answer} onSave={saved}/>}
               <Button size="sm" variant="outline" onClick={async()=>{if(!confirm('Excluir esta resposta? O texto sairá do fio, mas a operação ficará registrada no histórico de auditoria.'))return;
                 const r=await supabase.rpc('delete_letter_reply',{p_id:answer.id,p_version:answer.version??1});
                 if(r.error)onError(r.error.message);else saved();}}>Excluir resposta</Button>
             </div>}
            {trashMode&&(data.admin||answer.author_user_id===data.user.id)&&<div className="campaign-actions"><Button size="sm" variant="outline" disabled={Boolean(letter.deleted_at)} title={letter.deleted_at?'Restaure primeiro a missiva original':undefined} onClick={async()=>{if(!confirm('Restaurar esta resposta ao fio da missiva?'))return;const r=await supabase.rpc('restore_letter_reply',{p_id:answer.id,p_version:answer.version??1});if(r.error)onError(r.error.message);else saved();}}>Restaurar resposta</Button>{letter.deleted_at&&<small>Restaure primeiro a missiva original.</small>}</div>}
            {!trashMode&&!letter.deleted_at&&answer.author_user_id!==data.user.id&&answer.publication_state==='delivered'&&<ReplyForm letterId={letter.id} replyId={answer.id} recipientId={answer.author_user_id} roundRevision={roundRevision} onSave={saved} isAdmin={data.admin}/>}
          </article>)}
        </section>}
        {(letter.court_member_id||letter.military_unit_id)&&<div className="campaign-eyebrow">{letter.court_member_id&&<p>Corte: {linkName('court',letter.origin_house_id,letter.court_member_id)} · {letter.court_assignment==='order_recipient'?'Destinatário da ordem':'Executor'}</p>}{letter.military_unit_id&&<p>Unidade: {linkName('unit',letter.origin_house_id,letter.military_unit_id)}</p>}</div>}
        {letter.sender_user_id===data.user.id&&letter.publication_state==='delivered'&&!data.admin&&<p>Destinatário: {letter.recipient_read?'leitura registrada':'sem leitura registrada'} · {hasDeliveredAnswer(letter,answers)?'resposta recebida':'aguardando resposta'}</p>}
        {data.admin&&letter.sender_user_id===data.user.id&&letter.publication_state==='delivered'&&<section className="campaign-letter-read-status" aria-label="Indicadores de leitura separados">
          <p><strong>Leitura da Casa:</strong> {letter.recipient_read?'Leitura registrada':'Sem registro de leitura atual'}</p>
          <p><strong>Leitura do Narrador:</strong> {incomingReplies.length===0?'Nenhuma resposta entregue':read?'Respostas conferidas':'Nova resposta não lida'}</p>
        </section>}
        {data.admin&&letter.sender_user_id===data.user.id&&<details><summary>Leituras registradas pelos destinatários</summary>{data.receipts.filter(r=>r.letter_id===letter.id&&r.user_id!==data.user.id).length===0?<p>Nenhuma leitura registrada.</p>:data.receipts.filter(r=>r.letter_id===letter.id&&r.user_id!==data.user.id).map(r=><p key={r.user_id}>{data.players.find(p=>p.user_id===r.user_id)?.name??'Destinatário autorizado'} · {date(r.read_at)}{isLetterRead(letter.id,r,answers)?'':' · Há respostas posteriores'}</p>)}</details>}
        {!trashMode&&data.admin&&<NarratorMailNotes letterId={letter.id} userId={data.user.id}/>}
        <LetterConsequences
          letterId={letter.id} admin={data.admin} disabled={trashMode||Boolean(letter.deleted_at)}
          houses={data.houses.filter(h=>h.active).map(h=>({id:h.id,name:h.name}))}
          suggestedHouse={letter.origin_house_id??data.players.find(p=>p.id===letter.sender_player_id)?.roster_house_id??letter.recipient_house_id??''}
          items={(consequences.data??[]).filter(item=>item.letter_id===letter.id)}
          onSaved={saved} onError={onError}/>
        <p className="text-muted-foreground text-sm">{syncLabel(letter.sync_state)} · {letter.last_synced_at?date(letter.last_synced_at):'Ainda não sincronizada'}</p>
        {!trashMode&&threadLetters.length>0&&<div className="campaign-thread"><Button size="sm" variant="ghost" aria-expanded={threadOpen} onClick={()=>toggleThread(letter.id)}>{threadOpen?'Ocultar fio da conversa':`Ver relacionadas nesta página (${threadLetters.length} missiva(s) relacionada(s))`}</Button>{threadOpen&&threadLetters.map(other=>{const otherAnswers=viewReplies.filter(r=>r.letter_id===other.id);return <div key={other.id} className="campaign-thread-item"><span className="campaign-eyebrow">{other.letter_number?`Missiva ${other.letter_number} · `:''}{other.letter_kind==='geral'?'Geral':'Reservada'}</span><strong>{other.subject}</strong><small> · De: {other.sender_name} · {other.campaign_date?formatDate(other.campaign_date):date(other.created_at)}</small><CampaignContent content={other.content}/>{otherAnswers.map(a=><div key={a.id} className="campaign-replies"><span className="campaign-eyebrow">Resposta · {mailWeekTimeline(a.creation_week,a.delivery_week,a.publication_state)}</span><br/><strong>{a.author_name}</strong><small> · {date(a.created_at)}</small><CampaignContent content={a.content}/></div>)}</div>;})}</div>}
        {!trashMode&&!letter.deleted_at&&<div className="campaign-actions">
          {!read&&letter.publication_state==='delivered'&&(letter.sender_user_id!==data.user.id||incomingReplies.length>0)&&<Button variant="outline" onClick={async()=>{const {error}=await supabase.rpc('mark_letter_read',{p_id:letter.id});if(error&&error.code!=='23505')onError(error.message);else saved();}}>Marcar como lida</Button>}
          {(open!==null||data.admin)&&<Button variant="outline" onClick={()=>{if(!replaceMailDraft(data.user.id))return;setCompose(true);setDraft({key:Date.now(),subject:'Enc: '+letter.subject,content:`— Missiva encaminhada —\nDe: ${letter.sender_name} · ${date(letter.created_at)}\nAssunto: ${letter.subject}\n\n${letter.content}`});document.getElementById('nova-missiva')?.scrollIntoView({behavior:'smooth'});}}>Encaminhar</Button>}
          {canDelete&&<Button variant="outline" onClick={async()=>{if(!confirm('Excluir esta missiva? Ela deixará de aparecer para os jogadores.'))return;const {error}=await supabase.rpc('delete_campaign_letter',{p_id:letter.id});if(error)onError(error.message);else saved();}}>Excluir</Button>}
        </div>}
        {!trashMode&&!letter.deleted_at&&letter.publication_state==='draft'&&letter.sender_user_id===data.user.id&&<Button variant="outline" disabled={!data.admin&&open===null} onClick={async()=>{const result=await supabase.rpc('schedule_letter_draft',{p_id:letter.id,p_week:letter.delivery_week??open??nextLetterNumber(data.letters)});if(result.error)onError(result.error.message);else saved();}}>Programar entrega</Button>}{!trashMode&&!letter.deleted_at&&((data.admin&&letter.publication_state!=='draft')||(letter.publication_state==='draft'&&letter.sender_user_id===data.user.id))&&<LetterEdit letter={letter} onSave={saved}/>}
        {!trashMode&&!letter.deleted_at&&letter.publication_state==='delivered'&&canAnswer&&replyTarget&&<ReplyForm
          letterId={letter.id} replyId={letter.sender_user_id===data.user.id?lastPlayerReply?.id:undefined}
          recipientId={replyTarget} roundRevision={roundRevision} onSave={saved} isAdmin={data.admin}
          label={letter.sender_user_id===data.user.id?(lastPlayerReply?'Responder à Casa':'Adicionar complemento'):'Responder'}/>}
        {canRestoreLetter&&<div className="campaign-actions"><Button variant="outline" onClick={async()=>{if(!confirm('Restaurar esta missiva e seu fio original?'))return;const r=await supabase.rpc('restore_campaign_letter',{p_id:letter.id});if(r.error)onError(r.error.message);else saved();}}>Restaurar missiva</Button></div>}
        <Button variant="ghost" size="sm" onClick={()=>{toggle(letter.id);document.getElementById('missiva-'+letter.id)?.scrollIntoView({block:'nearest'});}}>Recolher</Button>
      </div>}
    </article>;
  };
  const sel=(label:string,key:keyof typeof empty,opts:[string,string][])=><label>{label}<select value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}>{opts.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;
  const numbers=[...new Set([...data.letters.filter(l=>!groupActive||matchesGroup(l)).map(l=>l.letter_number),
   ...data.replies.filter(r=>!groupActive||data.letters.some(l=>l.id===r.letter_id&&matchesGroup(l as LetterRow))).map(r=>r.delivery_week)]
   .filter((n):n is number=>n!==null))].sort((a,b)=>b-a);
  const visibleIds=groups.flatMap(g=>g.letters).map(l=>l.id);
  const filterPanel=<aside className="campaign-mail-side" aria-label="Filtros das missivas">
      <button className="campaign-mail-filter-toggle" type="button" aria-expanded={filtersVisible} aria-controls="campaign-mail-filter-fields" onClick={()=>setFiltersVisible(v=>!v)}><span>FILTROS</span><span>{filtersVisible?'Recolher':'Expandir'}</span></button>
      {filtersVisible&&<div className="campaign-mail-filter-fields" id="campaign-mail-filter-fields">
      <label>Buscar<input type="search" value={filters.text} onChange={e=>setFilters({...filters,text:e.target.value})} placeholder="Assunto, resposta, autor ou casa…"/></label>
      {sel('Caixa','box',[['','Todas'],['recebidas','Recebidas'],['enviadas','Enviadas'],...(data.admin?[['copias','Cópias para mediação'] as [string,string]]:[]),['programadas','Programadas'],['rascunhos','Rascunhos'],['historico','Histórico por semana'],['lixeira','Lixeira']])}
      {data.admin&&sel('Grupo de narração','group',[['','Todos os grupos'],...NARRATION_GROUPS.map(g=>[g.id,g.label] as [string,string])])}
      {data.admin&&sel('Casa destinatária / legado','house',[['','Todas as casas'],...data.houses.filter(h=>h.active&&h.season===2&&(!groupActive||allowed.has(h.id))).map(h=>[h.id,h.name] as [string,string])])}
      {sel('Casa remetente','origin',[['','Todas as casas'],['none','Sem vínculo / legado'],...data.houses.filter(h=>!groupActive||allowed.has(h.id)).map(h=>[h.id,h.name] as [string,string])])}
      {sel('Membro da corte','court',linkOptions('court'))}
      {sel('Unidade militar','unit',linkOptions('unit'))}
      {sel('Semana','number',[['','Todas as semanas'],...numbers.map(n=>[String(n),'Semana '+n] as [string,string])])}
      {sel('Tipo','kind',[['','Todos os tipos'],['geral','Geral'],['reservada','Reservada']])}
      {sel('Resposta','answered',data.admin?[['','Todas'],['no-delivered','Sem resposta entregue'],['awaiting-house','Aguardando resposta da Casa'],['awaiting-narrator','Aguardando resposta do Narrador'],['pending-outgoing','Com resposta programada/rascunho']]:[['','Todas'],['yes','Respondidas'],['no','Não respondidas']])}
      {sel('Minha leitura','read',[['','Todas'],['no','Não lidas'],['yes','Lidas']])}
      {groups.some(g=>g.number!==null)&&<nav className="campaign-mail-jump" aria-label="Ir para uma semana de missiva">{groups.filter(g=>g.number!==null).map(g=><button key={g.number} type="button" onClick={()=>document.getElementById('grupo-missiva-'+g.number)?.scrollIntoView({behavior:'smooth',block:'start'})}>Missiva {g.number}</button>)}</nav>}
      <Button variant="outline" onClick={()=>setFilters(empty)}>Limpar filtros</Button>
      <div className="campaign-actions"><Button size="sm" variant="ghost" onClick={()=>setExpanded(new Set(visibleIds))}>Expandir todas</Button><Button size="sm" variant="ghost" onClick={()=>setExpanded(new Set())}>Recolher todas</Button></div>
      {!trashMode&&!data.admin&&open!==null&&<Button onClick={()=>{setDraft({key:Date.now(),subject:'',content:''});document.getElementById('nova-missiva')?.scrollIntoView({behavior:'smooth'});}}>Escrever missiva</Button>}
      </div>}
    </aside>;
  return <div className={'campaign-mail-layout'+(data.admin?' campaign-mail-layout--narrator':'')}>
    {filterHost?createPortal(filterPanel,filterHost):filterPanel}
    <div>
      {!trashMode&&<MailInsights options={options} houseName={houseName} groupHouseIds={groupActive?[...allowed]:undefined} onSelect={row=>setFilters({...empty,origin:row.origin_house_id??'none',court:row.court_member_id?row.origin_house_id+':'+row.court_member_id:'none',unit:row.military_unit_id?row.origin_house_id+':'+row.military_unit_id:'none'})}/>}
      {listing.isPending&&<p role="status">Carregando missivas…</p>}
      {listing.error&&<p role="alert">Não foi possível carregar as missivas. <Button onClick={()=>listing.refetch()}>Tentar novamente</Button></p>}
      <nav className="campaign-actions" aria-label="Páginas de missivas"><Button disabled={page===0||listing.isFetching} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span>Página {page+1} · {listing.data?.total??0} {trashMode?'conversas na lixeira':'entregas encontradas'}</span><Button disabled={listing.isFetching||(page+1)*20>=(listing.data?.total??0)} onClick={()=>setPage(p=>p+1)}>Próxima</Button></nav>
      {!trashMode&&<div className={'campaign-round '+(open===null?'fechada':'')} role="status">{open===null?'Missivas fechadas, aguarde o narrador abrir a próxima semana.':`Missiva ${open} aberta — respostas, novas missivas e encaminhamentos liberados.`}
       {activeRound&&<p className="house-caption">Referência histórica da abertura: <strong>{formatRoundHarptosReference(activeRound.harptos_period)}</strong>. O número da rodada não altera a désdia vigente.</p>}</div>}
      {!trashMode&&data.admin&&<><div className="campaign-heading"><h2>Gestão de missivas</h2><Button onClick={()=>setCompose(v=>!v)}>{compose?'Fechar escrita':'Escrever missiva'}</Button></div>
        <section aria-label="Indicadores da gestão de missivas" className="narrator-mail-hub-overview">
          <div><strong>{listing.data?.kpis?.delivered??0}</strong><span>Entregues</span></div>
          <div><strong>{listing.data?.kpis?.awaiting_house??0}</strong><span>Aguardando Jogador</span></div>
          <div><strong>{listing.data?.kpis?.awaiting_narrator??0}</strong><span>Aguardando Narrador</span></div>
          <div><strong>{listing.data?.kpis?.scheduled_replies_next??0}</strong><span>Respostas programadas (próx. semana)</span></div>
          <div><strong>{listing.data?.kpis?.drafts??0}</strong><span>Rascunhos do Narrador</span></div>
        </section>
        <MailPeriodNotice date={periodDate} round={activeRound}/>
        <div className="campaign-actions">{open!==null&&<Button variant="outline" onClick={async()=>{if(!confirm(`Fechar a Missiva ${open}? Os jogadores não poderão mais responder nem escrever.`))return;const {error}=await supabase.rpc('set_letter_round',{p_number:open,p_closed:true});if(error)onError(error.message);else saved();}}>Fechar Missiva {open}</Button>}<input type="number" min={nextRound} style={{width:140}} value={roundNumber} onChange={e=>setRoundNumber(e.target.value)} placeholder={`Próxima: ${nextRound}`} aria-label="Número da missiva a abrir"/><Button variant="outline" onClick={async()=>{const n=roundNumber?Number(roundNumber):nextRound;if(!Number.isInteger(n)||n!==nextRound){onError(`A próxima semana permitida é ${nextRound}. Não é possível pular ou retroceder.`);return;}const preview=data.letters.filter(l=>l.delivery_week===n&&l.publication_state==='scheduled');const responses=data.replies.filter(r=>r.delivery_week===n&&r.publication_state==='scheduled');if(!confirm(`Abrir Semana ${n}? ${preview.length} mensagens e ${responses.length} respostas serão liberadas. Destinatários: ${preview.map(l=>houseName(l.recipient_house_id)||'Jogador autorizado').join(', ')||'Nenhuma nova mensagem'}. A semana anterior será encerrada. A data oficial de Harptos não será avançada pela abertura da semana.`))return;const {error}=await supabase.rpc('set_letter_round',{p_number:n,p_closed:false});if(error)onError(error.message);else{setRoundNumber('');saved();}}}>Abrir missiva</Button></div>
        {compose&&<MailComposer key={draft?.key??0} data={data} me={me} initial={draft} onSave={()=>{setDraft(null);saved();}} onManage={onManage}/>}</>}
      {trashMode&&<section className="campaign-trash" aria-label="Lixeira das missivas"><div className="campaign-heading"><h2>Lixeira</h2><span>{listing.data?.total??0} conversa(s)</span></div><p className="text-sm text-muted-foreground">Missivas e respostas excluídas permanecem arquivadas. Você pode restaurar somente suas próprias mensagens; o Narrador pode recuperar correspondências da campanha.</p>{!listing.isPending&&letters.length===0&&<p className="campaign-empty">Nenhuma missiva ou resposta excluída encontrada.</p>}{letters.map(letter=>card(letter,false))}</section>}
      {!trashMode&&<><div className="campaign-heading"><h2>{filters.box==='excluidas'?'Missivas excluídas':outgoingView?'Missivas enviadas':data.admin&&filters.box==='copias'?'Cópias para mediação':data.admin&&filters.box!=='recebidas'?'Correspondência acompanhada':'Missivas recebidas'}</h2><span>{groups.reduce((n,g)=>n+g.letters.length,0)} missivas</span></div>
      {groups.length===0&&<p className="campaign-empty">Nenhuma missiva encontrada.</p>}
      {groups.map(group=><section key={group.number??'sem-numero'} id={group.number!==null?'grupo-missiva-'+group.number:undefined} className="campaign-mail-group">{group.number!==null&&<h3 className="campaign-letter-number">Missiva {group.number}{data.rounds.find(r=>r.number===group.number)?.closed?' · fechada':''}</h3>}{group.letters.map(letter=>card(letter,isRecipient(letter)||data.admin))}</section>)}</>}

      {!trashMode&&!data.admin&&<MailComposer key={draft?.key??0} data={data} me={me} initial={draft} onSave={()=>{setDraft(null);saved();}} onManage={onManage}/>}
    </div>
  </div>;
}

function LetterEdit({letter,onSave}:{letter:LetterRow;onSave:()=>void}){
  const {data:currentTime}=useCampaignTime();
  const [campaignDate,setCampaignDate]=useState(letter.campaign_date??'');
  const [open,setOpen]=useState(false),[subject,setSubject]=useState(letter.subject),[content,setContent]=useState(letter.content),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const {data:options}=useMailOptions();
  const [links,setLinks]=useState<MailLinks>({origin:letter.origin_house_id??'',court:letter.court_member_id??'',unit:letter.military_unit_id??'',role:letter.court_assignment??'executor'});
  const [images,setImages]=useState<PendingImage[]>([]);
  const {data:versions=[]}=useQuery({queryKey:['letter-versions',letter.id,letter.version],enabled:open,queryFn:async()=>{const r=await supabase.from('letter_versions').select('*').eq('letter_id',letter.id).order('version',{ascending:false});if(r.error)throw r.error;return r.data??[];}});
  if(!open)return <Button variant="outline" onClick={()=>{setSubject(letter.subject);setContent(letter.content);setOpen(true);}}>Editar missiva</Button>;
  return <form className="campaign-form" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const rich=await uploadImages(content,images,crypto.randomUUID());const result=letter.publication_state==='draft'?await datedMail('edit_linked_mail_draft',{p_id:letter.id,p_version:letter.version??1,p_subject:subject,p_content:rich,p_origin:links.origin||null,p_court:links.court||null,p_unit:links.unit||null,p_role:links.court?links.role:null},campaignDate):await datedMail('edit_campaign_letter',{p_id:letter.id,p_version:letter.version??1,p_subject:subject,p_content:rich},campaignDate);if(result.error)throw result.error;setOpen(false);setImages([]);onSave();}catch(err){setMessage(err instanceof Error?err.message:'Não foi possível salvar.');}finally{setBusy(false);}}}>{letter.publication_state==='draft'&&<MailLinkFields value={links} onChange={setLinks} options={options??{players:[],houses:[]}}/>}<CampaignDatePicker value={campaignDate} referenceDate={currentTime?dateKey(currentTime):undefined} onChange={setCampaignDate}/><label>Assunto<input required value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>Missiva<textarea required value={content} onChange={e=>setContent(e.target.value)}/></label><ImagePicker images={images} onChange={setImages} disabled={busy}/><div className="campaign-actions"><Button disabled={busy}>Salvar nova versão</Button><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button></div><details><summary>Histórico de versões</summary>{versions.map(v=><div key={v.id}><strong>Versão {v.version}</strong><CampaignContent content={typeof v.snapshot==='object'&&v.snapshot&&'content' in v.snapshot?String(v.snapshot['content']):''}/></div>)}</details><p role="status">{message}</p></form>;
}

function ReplyEdit({answer,onSave}:{answer:Panel['replies'][number];onSave:()=>void}){
  const [editing,setEditing]=useState(false);
  const [content,setContent]=useState(answer.content),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const {data:versions=[]}=useQuery({queryKey:['reply-versions',answer.id,answer.version],
    enabled:editing,queryFn:async()=>{const result=await supabase.from('letter_reply_versions')
      .select('*').eq('reply_id',answer.id).order('version',{ascending:false});
      if(result.error)throw result.error;return result.data??[];}});
  if(!editing)return <Button size="sm" variant="outline" onClick={()=>{setContent(answer.content);setError('');setEditing(true);}}>Editar resposta</Button>;
  return <form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);
    const r=await supabase.rpc('edit_letter_reply',{p_id:answer.id,p_version:answer.version??1,p_content:content});
    setBusy(false);if(r.error)setError(r.error.message);else{setEditing(false);onSave();}
  }}><label>Texto da resposta<textarea required value={content} onChange={e=>setContent(e.target.value)}/></label>
    <div className="campaign-actions"><Button disabled={busy}>Salvar resposta revisada</Button><Button type="button" variant="outline" onClick={()=>setEditing(false)}>Cancelar</Button></div>
    <details><summary>Histórico de versões da resposta</summary>{versions.map(v=><div key={v.id}>
      <strong>Versão {v.version}</strong><CampaignContent content={typeof v.snapshot==='object'&&v.snapshot&&'content' in v.snapshot?String(v.snapshot['content']):''}/>
    </div>)}</details><p role="status">{error}</p>
  </form>;
}

function ReplyDraftEdit({answer,onSave}:{answer:Panel['replies'][number];onSave:()=>void}){
  const {data:currentTime}=useCampaignTime();
 const [campaignDate,setCampaignDate]=useState(answer.campaign_date??'');
 const [editing,setEditing]=useState(false),[content,setContent]=useState(answer.content),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!editing)return <Button size="sm" variant="outline" onClick={()=>{setContent(answer.content);setEditing(true);}}>Editar rascunho</Button>;
 return <form className="campaign-form" onSubmit={async e=>{e.preventDefault();setBusy(true);const r=await datedMail('save_weekly_reply_draft',{p_id:answer.id,p_letter:answer.letter_id,p_reply:(answer.reply_to_id===answer.letter_id?null:answer.reply_to_id) as unknown as string,p_content:content},campaignDate);setBusy(false);if(r.error)setError(r.error.message);else{setEditing(false);onSave();}}}><CampaignDatePicker value={campaignDate} referenceDate={currentTime?dateKey(currentTime):undefined} onChange={setCampaignDate}/><label>Resposta<textarea required value={content} onChange={e=>setContent(e.target.value)}/></label><Button disabled={busy}>Salvar rascunho</Button><Button type="button" variant="outline" onClick={()=>{if(content===answer.content||confirm('Descartar alterações não salvas?'))setEditing(false);}}>Cancelar</Button><p role="status">{error}</p></form>;
}

type Insight={origin_house_id:string|null;court_member_id:string|null;court_assignment:string|null;military_unit_id:string|null;messages:number;deliveries:number;delivered:number;answered:number};
function MailInsights({options,houseName,onSelect,groupHouseIds}:{options:MailOptions|undefined;houseName:(id:string|null)=>string|undefined;onSelect:(r:Insight)=>void;groupHouseIds?:string[]|undefined}){
 const [open,setOpen]=useState(false);
 const result=useQuery({queryKey:['mail-insights',groupHouseIds?.join('|')??'all'],enabled:open,queryFn:async()=>{const r=groupHouseIds?await supabase.rpc('mail_insights_grouped',{p_house_ids:groupHouseIds}):await supabase.rpc('mail_insights');if(r.error)throw r.error;return r.data as unknown as Insight[];}});
 return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Análise por casa e responsáveis</summary><p>Contagem das entregas visíveis para você. Uma missiva enviada a três pessoas conta como uma mensagem e três entregas. Resposta recebida não comprova execução da ordem.</p>{result.isPending&&<p>Carregando análise…</p>}{result.error&&<p role="alert">Não foi possível carregar a análise.</p>}{result.data&&<div style={{overflowX:'auto'}}><table><thead><tr><th>Casa</th><th>Corte / responsabilidade</th><th>Unidade</th><th>Mensagens</th><th>Entregas</th><th>Entregues</th><th>Respondidas</th><th>Pendentes de resposta</th><th>Consultar</th></tr></thead><tbody>{result.data.map((row,i)=>{const h=options?.houses?.find(h=>h.id===row.origin_house_id);return <tr key={i}><td>{houseName(row.origin_house_id)??'Sem vínculo / legado'}</td><td>{row.court_member_id?(h?.court.find(c=>c.id===row.court_member_id)?.name??'Vínculo histórico ou restrito'):'Sem vínculo'}{row.court_member_id&&(row.court_assignment==='order_recipient'?' — Destinatário da ordem':' — Executor')}</td><td>{row.military_unit_id?(h?.units.find(u=>u.id===row.military_unit_id)?.name??'Vínculo histórico ou restrito'):'Sem vínculo'}</td><td>{row.messages}</td><td>{row.deliveries}</td><td>{row.delivered}</td><td>{row.answered}</td><td>{row.delivered-row.answered}</td><td><Button variant="ghost" onClick={()=>onSelect(row)}>Ver missivas</Button></td></tr>;})}</tbody></table></div>}</details>;
}

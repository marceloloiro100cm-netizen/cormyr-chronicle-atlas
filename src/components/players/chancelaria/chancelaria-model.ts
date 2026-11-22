import {isLetterRead,deliveredReply,type LetterRow,type ReceiptRef,type ReplyRef} from '@/lib/letters';

/** Linha de missiva vinda do mail_page (projeção Firebase ou legado). */
export type MailRow=LetterRow&{source?:string;removal_kind?:string|null;edited_at?:string|null;[key:string]:unknown};
export type ReplyRow=ReplyRef&{id:string;author_name?:string;content?:string;reply_to_id?:string|null};
export type QueueId='attention'|'yourturn'|'waiting'|'mediation'|'scheduled'|'drafts'|'trash'|'all';
export type QueueContext={uid:string;admin:boolean;receipts:ReceiptRef[];openRound:number|null;editHouses?:Set<string>};
export type ConversationKind='narrador'|'ao-narrador'|'entre'|'geral';

const CLOUD_ID=/^[a-f0-9]{64}$/;
const delivered=(m:MailRow)=>!m.deleted_at&&(!m.publication_state||m.publication_state==='delivered');
const at=(m:{delivered_at?:string|null;created_at?:string})=>m.delivered_at??m.created_at??'';
const receiptOf=(ctx:QueueContext,id:string)=>ctx.receipts.find(r=>r.letter_id===id&&r.user_id===ctx.uid);

/** Um item do fio: resposta Cloud (gravada como missiva) ou resposta histórica. */
export type ThreadItem={
  id:string;author:string;content:string;at:string;authorUid:string|undefined;
  letter:MailRow|null;reply:ReplyRow|null;
  mine:(uid:string)=>boolean;isNewFor:(ctx:QueueContext)=>boolean;
};

export type Conversation={
  root:MailRow;letters:MailRow[];items:ThreadItem[];historical:ReplyRow[];
  kind:ConversationKind;kindLabel:string;lastAt:string;
  unreadLetterIds:(ctx:QueueContext)=>string[];
  lastIncomingLetterId:(uid:string)=>string|null;
  replyTarget:(uid:string,admin:boolean,editHouses:Set<string>)=>string|null;
  replyToHistoricalId:(uid:string,admin:boolean,editHouses:Set<string>)=>string|null;
};

export function conversationKind(root:Pick<LetterRow,'origin_house_id'|'recipient_house_id'|'letter_kind'|'sender_user_id'>):ConversationKind{
  if(!root.origin_house_id&&!root.recipient_house_id)return 'geral';
  if(!root.origin_house_id)return root.letter_kind==='geral'?'geral':'narrador';
  if(!root.recipient_house_id)return 'ao-narrador';
  return 'entre';
}
const KIND_LABEL:Record<ConversationKind,string>={narrador:'Do Narrador','ao-narrador':'Ao Narrador',entre:'Entre Casas',geral:'Geral'};

/** Letra pode ser respondida por este usuário? Espelha cloudReplyRoute do servidor. */
export function canReplyTo(m:MailRow,uid:string,admin:boolean,editHouses:Set<string>):boolean{
  if(!delivered(m)||m.sender_user_id===uid||
     !['firebase-cloud','imported'].includes(m.source??'')||
     m.source==='firebase-cloud'&&!CLOUD_ID.test(m.id))return false;
  if(admin)return !m.recipient_house_id&&Boolean(m.origin_house_id);
  if(m.letter_kind==='geral'&&!m.origin_house_id&&!m.recipient_house_id)
    return editHouses.size===1;
  return Boolean(m.recipient_house_id)&&editHouses.has(m.recipient_house_id as string)&&
    m.origin_house_id!==m.recipient_house_id;
}

export function buildConversations(letters:MailRow[],replies:ReplyRow[]):Conversation[]{
  const byId=new Map(letters.map(l=>[l.id,l]));
  const groups=new Map<string,MailRow[]>();
  for(const l of letters){
    // Respostas Cloud carregam conversation_id da carta raiz; lotes do
    // Narrador são entregas independentes e cada uma é sua própria raiz.
    const rootId=l.conversation_id&&l.conversation_id!==l.id&&byId.has(l.conversation_id)&&
      (!l.batch_key||byId.get(l.conversation_id)?.batch_key!==l.batch_key)?l.conversation_id:l.id;
    const list=groups.get(rootId)??[];list.push(l);groups.set(rootId,list);
  }
  const result:Conversation[]=[];
  for(const [rootId,members] of groups){
    const root=byId.get(rootId)??members[0]!;
    const children=members.filter(m=>m.id!==root.id).sort((a,b)=>at(a).localeCompare(at(b)));
    const ownIds=new Set(members.map(m=>m.id));
    const historical=replies.filter(r=>ownIds.has(r.letter_id)).sort((a,b)=>at(a).localeCompare(at(b)));
    const items:ThreadItem[]=[
      ...children.map(m=>({id:m.id,author:m.sender_name,content:m.content,at:at(m),authorUid:m.sender_user_id,letter:m,reply:null,
        mine:(uid:string)=>m.sender_user_id===uid,
        isNewFor:(ctx:QueueContext)=>delivered(m)&&m.sender_user_id!==ctx.uid&&!receiptOf(ctx,m.id)})),
      ...historical.map(r=>({id:r.id,author:r.author_name??'Resposta',content:r.content??'',at:at(r),authorUid:r.author_user_id,letter:null,reply:r,
        mine:(uid:string)=>r.author_user_id===uid,
        isNewFor:(ctx:QueueContext)=>{
          if(!deliveredReply(r)||r.author_user_id===ctx.uid)return false;
          const receipt=receiptOf(ctx,r.letter_id);
          return !receipt||Boolean(receipt.read_at&&receipt.read_at<at(r));
        }})),
    ].sort((a,b)=>a.at.localeCompare(b.at));
    const all=[root,...children];
    const kind=conversationKind(root);
    // The original narrator broadcast can have no House address at the
    // root. A delivered historical reply is still addressed to the narrator.
    // Verify the reply's recipient, not only the original letter category.
    const historicalAddressed=(r:ReplyRow,uid:string,admin:boolean,editHouses:Set<string>)=>
      deliveredReply(r)&&r.author_user_id!==uid&&
      (r.recipient_user_id===uid||
       (admin&&!root.origin_house_id&&
        r.recipient_user_id===root.sender_user_id&&
        r.author_user_id!==root.sender_user_id))&&
      (admin?kind==='ao-narrador'||kind==='narrador'||kind==='geral':
       kind!=='geral'||editHouses.size===1);
    result.push({root,letters:all,items,historical,kind,kindLabel:KIND_LABEL[kind],
      lastAt:[at(root),...items.map(i=>i.at)].sort().at(-1)??'',
      unreadLetterIds:(ctx)=>{
        const ids=all.filter(m=>delivered(m)&&m.sender_user_id!==ctx.uid&&!receiptOf(ctx,m.id)).map(m=>m.id);
        // Respostas históricas contam pela confirmação da carta a que pertencem.
        for(const l of all)if(!ids.includes(l.id)&&historical.some(r=>r.letter_id===l.id)&&
          !isLetterRead(l.id,receiptOf(ctx,l.id),historical))ids.push(l.id);
        return ids;
      },
      lastIncomingLetterId:(uid)=>all.filter(m=>delivered(m)&&m.sender_user_id!==uid).sort((a,b)=>at(a).localeCompare(at(b))).at(-1)?.id??null,
      replyTarget:(uid,admin,editHouses)=>{
        const cloud=all.filter(m=>canReplyTo(m,uid,admin,editHouses))
          .map(m=>({id:m.id,at:at(m)}));
        const old=historical.filter(r=>historicalAddressed(r,uid,admin,editHouses))
          .map(r=>({id:root.id,at:at(r)}));
        return [...cloud,...old].sort((a,b)=>a.at.localeCompare(b.at))
          .at(-1)?.id??null;
      },
      replyToHistoricalId:(uid,admin,editHouses)=>{
        const candidate=historical.filter(r=>historicalAddressed(r,uid,admin,editHouses))
          .sort((a,b)=>at(a).localeCompare(at(b))).at(-1);
        const newestCloud=all.filter(m=>canReplyTo(m,uid,admin,editHouses))
          .sort((a,b)=>at(a).localeCompare(at(b))).at(-1);
        return candidate&&(!newestCloud||at(candidate)>at(newestCloud))
          ?candidate.id:null;
      },
    });
  }
  return result;
}

export function conversationUnread(c:Conversation,ctx:QueueContext):boolean{
  return c.unreadLetterIds(ctx).length>0;
}

/** Autor do último turno já entregue (rascunhos e programadas não contam). */
export function lastAuthor(c:Conversation):string|undefined{
  const turns=[...(delivered(c.root)?[{uid:c.root.sender_user_id,at:at(c.root)}]:[]),
    ...c.letters.slice(1).filter(delivered).map(m=>({uid:m.sender_user_id,at:at(m)})),
    ...c.historical.filter(deliveredReply).map(r=>({uid:r.author_user_id,at:at(r)}))];
  return turns.sort((a,b)=>a.at.localeCompare(b.at)).at(-1)?.uid;
}

const pendingOwn=(c:Conversation,ctx:QueueContext,state:string)=>c.letters.some(m=>!m.deleted_at&&
  m.publication_state===state&&(m.sender_user_id===ctx.uid||(ctx.admin&&state==='scheduled')))||
  c.historical.some(r=>!r.deleted_at&&r.publication_state===state&&(r.author_user_id===ctx.uid||(ctx.admin&&state==='scheduled')));

export function queueMembers(q:QueueId,list:Conversation[],ctx:QueueContext):Conversation[]{
  const live=list.filter(c=>!c.root.deleted_at);
  const edit=ctx.editHouses??new Set<string>();
  switch(q){
    case 'attention':return live.filter(c=>conversationUnread(c,ctx));
    case 'yourturn':return live.filter(c=>c.replyTarget(ctx.uid,ctx.admin,edit)!==null&&lastAuthor(c)!==ctx.uid&&
      !pendingOwn(c,ctx,'draft')&&!c.letters.some(m=>m.sender_user_id===ctx.uid&&m.publication_state==='scheduled'&&!m.deleted_at));
    case 'waiting':return live.filter(c=>delivered(c.root)&&lastAuthor(c)===ctx.uid);
    case 'mediation':return live.filter(c=>c.kind==='entre');
    case 'scheduled':return live.filter(c=>pendingOwn(c,ctx,'scheduled'));
    case 'drafts':return live.filter(c=>pendingOwn(c,ctx,'draft'));
    case 'trash':return list.filter(c=>Boolean(c.root.deleted_at));
    default:return live;
  }
}

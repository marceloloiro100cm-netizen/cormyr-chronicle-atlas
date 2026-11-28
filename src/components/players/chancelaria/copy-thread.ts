import {campaignMediaParts,contentParts} from '@/lib/campaign-content';
import {formatDate} from '@/lib/calendar/harptos';
import {cleanGalleryTitle} from '@/lib/gallery';
import {mailWeekTimeline} from '@/lib/weekly-delivery';
import type {Conversation,MailRow} from './chancelaria-model';

const str=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;

/** Converte tokens internos de imagem/mídia em descrições limpas para uso em IA. */
export function formatMessageBodyForAI(content:string):string{
 const out:string[]=[];
 for(const media of campaignMediaParts(content)){
  if('text' in media){
   const segs:string[]=[];
   for(const part of contentParts(media.text)){
    if('text' in part){
     segs.push(part.text);
    }else{
     const label=cleanGalleryTitle(part.caption)||'Imagem sem legenda';
     segs.push(`\n[Imagem anexa: ${label}]\n`);
    }
   }
   out.push(segs.join(''));
  }else{
   const kindLabel=media.kind==='youtube'?'Vídeo do YouTube':'Mídia do Google Drive';
   out.push(`\n[${kindLabel}: ${media.title}]\n`);
  }
 }
 return out.join('').replace(/\n{3,}/g,'\n\n').trim();
}

function statusLabel(letter:MailRow|null):string{
 if(!letter)return 'Entregue';
 if(letter.deleted_at)return letter['removal_kind']==='cancelada'?'Cancelada':'Excluída';
 if(letter.publication_state==='draft')return 'Rascunho';
 if(letter.publication_state==='scheduled'){
  return letter.delivery_week?`Programada (Semana ${letter.delivery_week})`:'Programada';
 }
 return letter.delivery_week?`Entregue (Semana ${letter.delivery_week})`:'Entregue';
}

function itemDateLabel(letter:MailRow|null,reply:Record<string,unknown>|null,fallbackAt:string):string{
 const raw=str(letter?.['campaign_date'])??str(reply?.['campaign_date']);
 if(raw)return formatDate(raw);
 if(fallbackAt){
  const dt=new Date(fallbackAt);
  if(Number.isFinite(dt.getTime()))return dt.toLocaleString('pt-BR');
 }
 return 'Sem data informada';
}

export function formatConversationForAI({
 conversation,
 houseName,
 groupLabel,
 courtLabel,
 unitLabel,
}:{
 conversation:Conversation;
 houseName:(id:string|null|undefined)=>string;
 groupLabel?:string|null;
 courtLabel?:string|null;
 unitLabel?:string|null;
}):string{
 const root=conversation.root;
 const rootDate=str(root['campaign_date']);
 const originHouse=root.origin_house_id?houseName(root.origin_house_id):null;
 const recipient=houseName(root.recipient_house_id);
 const senderDisplay=root.sender_name==='Narrador'&&!originHouse
  ?'Narrador'
  :originHouse?`${root.sender_name} (Casa ${originHouse})`:root.sender_name;
 const timeline=mailWeekTimeline(root.creation_week,root.delivery_week,root.publication_state);
 const totalMessages=1+conversation.items.length;

 const lines:string[]=[
  `# Fio de Missivas — ${root.subject}`,
  `- **Tipo:** ${conversation.kindLabel}`,
  `- **De:** ${senderDisplay}`,
  `- **Para:** ${root.recipient_house_id?`Casa ${recipient}`:recipient}`,
  `- **Semana / Situação:** ${timeline}${groupLabel?` · ${groupLabel}`:''}`,
  `- **Data inicial:** ${rootDate?formatDate(rootDate):'Sem data informada'}`,
 ];
 const links=[
  courtLabel?`Corte: ${courtLabel}`:root.court_member_id?'Corte vinculada':null,
  unitLabel?`Unidade: ${unitLabel}`:root.military_unit_id?'Unidade militar vinculada':null,
 ].filter(Boolean);
 if(links.length)lines.push(`- **Vínculos:** ${links.join(' · ')}`);
 lines.push(`- **Total de mensagens:** ${totalMessages}`);

 // Mensagem 1 — Missiva original
 lines.push(
  '',
  '---',
  '',
  '## Mensagem 1 (Missiva original)',
  `- **Autor:** ${senderDisplay}`,
  `- **Para:** ${root.recipient_house_id?`Casa ${recipient}`:recipient}`,
  `- **Data:** ${itemDateLabel(root,null,root.created_at)}`,
  `- **Status:** ${statusLabel(root)}`,
  '',
  formatMessageBodyForAI(root.content),
 );

 // Respostas em ordem cronológica
 conversation.items.forEach((item,index)=>{
  const replyObj=item.reply as unknown as Record<string,unknown>|null;
  const houseId=item.letter?.origin_house_id??str(replyObj?.['house_id']);
  const authorHouse=houseId?houseName(houseId):null;
  const authorDisplay=authorHouse&&!item.author.includes(authorHouse)
   ?`${item.author} (Casa ${authorHouse})`
   :item.author;
  lines.push(
   '',
   '---',
   '',
   `## Mensagem ${index+2} (Resposta ${index+1})`,
   `- **Autor:** ${authorDisplay}`,
   `- **Data:** ${itemDateLabel(item.letter,replyObj,item.at)}`,
   `- **Status:** ${statusLabel(item.letter)}`,
   '',
   formatMessageBodyForAI(item.content),
  );
 });

 return lines.join('\n').trim()+'\n';
}

export async function copyTextToClipboard(text:string):Promise<boolean>{
 try{
  if(navigator.clipboard&&typeof navigator.clipboard.writeText==='function'){
   await navigator.clipboard.writeText(text);
   return true;
  }
 }catch{/* tenta fallback via textarea */}
 try{
  const el=document.createElement('textarea');
  el.value=text;
  el.setAttribute('readonly','');
  el.style.position='fixed';
  el.style.opacity='0';
  document.body.appendChild(el);
  el.select();
  const ok=document.execCommand('copy');
  document.body.removeChild(el);
  return ok;
 }catch{
  return false;
 }
}

/**
 * Strict adapter for the original campaign date/mail composer.
 * Drafts, scheduled delivery, NPC signature and court/unit links are carried
 * explicitly; the server decides who may use each one. Images still require
 * their own private Storage implementation, so they are never dropped silently.
 */
import type {CloudMailMessageRequest} from '../../../scripts/firebase/cloud-mail-service.mjs';
const KEY=/^[a-zA-Z0-9_-]{8,128}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const isObj=(x:unknown):x is Record<string,unknown>=>Boolean(x)&&
 typeof x==='object'&&!Array.isArray(x);
export class OriginalMailBridgeError extends Error{
 constructor(public code:string,public status=501){super(code);}
}
const unsupported=():never=>{throw new OriginalMailBridgeError('mail_feature_not_yet_available');};
const invalid=():never=>{throw new OriginalMailBridgeError('invalid_mail_request',400);};
const nullable=(v:unknown)=>v===null||v===undefined||v==='';
const fields=new Set(['p_key','p_origin','p_targets','p_subject','p_content',
 'p_court','p_unit','p_role','p_draft','p_week','p_signed_by']);
export function originalMailSend(input:unknown,canonicalDate:string):
 CloudMailMessageRequest&{expectedCampaignDate:string}{
 const envelope=isObj(input)?input:invalid();
 const args=isObj(envelope['p_args'])?envelope['p_args']:invalid();
 if(envelope['p_action']!=='send_linked_mail'||
    typeof envelope['p_date']!=='string'||
    Object.keys(envelope).some(k=>!['p_action','p_args','p_date'].includes(k)))
  return invalid();
 if(typeof canonicalDate!=='string'||envelope['p_date']!==canonicalDate)
  throw new OriginalMailBridgeError('campaign_date_changed',409);
 if(Object.keys(args).some(k=>!fields.has(k)))return unsupported();
 const options=composerOptions(args);
 const key=args['p_key'],subject=args['p_subject'],content=args['p_content'];
 const origin=args['p_origin'],targets=args['p_targets'];
 if(typeof key!=='string'||!KEY.test(key)||
    typeof subject!=='string'||!subject.trim()||
    typeof content!=='string'||!content.trim()||
    !nullable(origin)&&(typeof origin!=='string'||!ID.test(origin))||
    !Array.isArray(targets))
  return invalid();
 if(targets.length!==1)return unsupported();
 const target:unknown=targets[0];
 if(typeof target!=='string')return invalid();
 const kind:'house'|'narrator'=target==='narrator'?'narrator':
  target.startsWith('h:')?'house':invalid();
 const house=kind==='house'?target.slice(2):null;
 if(house!==null&&!ID.test(house))return invalid();
 return {
  requestKey:key as string,originHouseId:nullable(origin)?null:origin as string,
  recipientKind:kind,recipientHouseId:house,
  subject:subject as string,content:content as string,
  ...options,
  expectedCampaignDate:canonicalDate,
 };
}

/** Optional composer fields, present only when actually chosen. */
export function composerOptions(args:Record<string,unknown>){
 const out:{draft?:boolean;deliveryRound?:number;signedBy?:string;
  courtMemberId?:string;courtAssignment?:'executor'|'order_recipient';unitId?:string}={};
 const draft=args['p_draft'];
 if(!nullable(draft)&&typeof draft!=='boolean')return invalid();
 if(draft===true)out.draft=true;
 const week=args['p_week'];
 if(!nullable(week)){
  if(typeof week!=='number'||!Number.isSafeInteger(week)||week<1)return invalid();
  out.deliveryRound=week;
 }
 const signed=args['p_signed_by'];
 if(!nullable(signed)){
  if(typeof signed!=='string')return invalid();
  if(signed.trim())out.signedBy=signed.trim();
 }
 const court=args['p_court'],role=args['p_role'],unit=args['p_unit'];
 if(!nullable(court)){
  if(typeof court!=='string'||!ID.test(court)||
     (role!=='executor'&&role!=='order_recipient'))return invalid();
  out.courtMemberId=court;out.courtAssignment=role;
 }else if(!nullable(role))return invalid();
 if(!nullable(unit)){
  if(typeof unit!=='string'||!ID.test(unit))return invalid();
  out.unitId=unit;
 }
 return out;
}

/**
 * Preserve the original composer request key across a single atomic batch.
 * Never turn a batch into sequential one-recipient sends.
 */
export function originalMailBatch(input:unknown,canonicalDate:string):
 (CloudMailMessageRequest&{expectedCampaignDate:string})[]{
 const envelope=isObj(input)?input:invalid();
 const args=isObj(envelope['p_args'])?envelope['p_args']:invalid();
 const targets=args['p_targets'];
 if(!Array.isArray(targets))return invalid();
 if(targets.length<2||targets.length>20)return unsupported();
 // Unlike a single send, a batch derives per-recipient idempotency keys.
 // Reject missing/invalid base keys BEFORE adding any suffix.
 if(typeof args['p_key']!=='string'||!KEY.test(args['p_key'])||
    args['p_key'].length>125)return invalid();
 if(targets.some(t=>typeof t!=='string')||
    new Set(targets).size!==targets.length||
    targets.includes('narrator'))return invalid();
 const requests=targets.map((target,i)=>{
  const single={...envelope,p_args:{...args,p_targets:[target],
   p_key:String(args['p_key'])+'_'+i}};
  return originalMailSend(single,canonicalDate);
 });
 return requests;
}

/** Resolve an original or legacy reply by its immutable identifiers.
 * Destination and sender House are intentionally not part of the envelope. */
export function originalMailReply(input:unknown,canonicalDate:string):{
  requestKey:string;letterId:string;content:string;expectedCampaignDate:string;
  replyId?:string;draft?:boolean;signedBy?:string;
}{
 const envelope=isObj(input)?input:invalid();
 const args=isObj(envelope['p_args'])?envelope['p_args']:invalid();
 if(envelope['p_action']!=='reply_weekly_message'||
    Object.keys(envelope).some(k=>!['p_action','p_args','p_date'].includes(k))||
    Object.keys(args).some(k=>!['p_letter','p_reply','p_content','p_key','p_draft','p_signed_by'].includes(k)))
   return invalid();
 if(envelope['p_date']!==canonicalDate)
   throw new OriginalMailBridgeError('campaign_date_changed',409);
 const replyId=args['p_reply'];
 if(!nullable(replyId)&&(typeof replyId!=='string'||!ID.test(replyId)))
  return invalid();
 if(typeof args['p_draft']!=='boolean')return invalid();
 const id=args['p_letter'],key=args['p_key'],content=args['p_content'];
 if(typeof id!=='string'||!ID.test(id)||
    typeof key!=='string'||!KEY.test(key)||
    typeof content!=='string'||!content.trim())
   return invalid();
 const signed=args['p_signed_by'];
 if(!nullable(signed)&&typeof signed!=='string')return invalid();
 return {requestKey:key,letterId:id,content,expectedCampaignDate:canonicalDate,
  ...(!nullable(replyId)?{replyId:replyId as string}:{}),
  ...(args['p_draft']?{draft:true}:{}),
  ...(typeof signed==='string'&&signed.trim()?{signedBy:signed.trim()}:{})};
}

/** "Salvar rascunho" of the original reply form: a private Cloud draft reply. */
export function originalReplyDraft(input:unknown,canonicalDate:string){
 const envelope=isObj(input)?input:invalid();
 const args=isObj(envelope['p_args'])?envelope['p_args']:invalid();
 if(envelope['p_action']!=='save_weekly_reply_draft'||
    Object.keys(envelope).some(k=>!['p_action','p_args','p_date'].includes(k))||
    Object.keys(args).some(k=>!['p_id','p_letter','p_reply','p_content','p_signed_by'].includes(k)))
  return invalid();
 return originalMailReply({p_action:'reply_weekly_message',p_date:envelope['p_date'],p_args:{
  p_letter:args['p_letter'],p_reply:args['p_reply']??null,p_content:args['p_content'],
  p_key:args['p_id'],p_draft:true,p_signed_by:args['p_signed_by']??null,
 }},canonicalDate);
}

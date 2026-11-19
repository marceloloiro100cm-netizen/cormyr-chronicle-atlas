/**
 * Strict single-recipient adapter for the original campaign date/mail composer.
 * Multi-send, drafts, scheduled delivery, assets and linked orders require
 * their own transactional implementations. Never silently drop these fields.
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
 if((args['p_draft']!==false&&!nullable(args['p_draft']))||
    !nullable(args['p_week'])||!nullable(args['p_court'])||
    !nullable(args['p_unit'])||!nullable(args['p_role'])||
    !nullable(args['p_signed_by']))return unsupported();
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
  expectedCampaignDate:canonicalDate,
 };
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

/** Original reply form remains unchanged; only direct Cloud mail replies
 * are supported until historical reply-thread migration is reconciled. */
export function originalMailReply(input:unknown,canonicalDate:string):{
  requestKey:string;letterId:string;content:string;expectedCampaignDate:string;
}{
 const envelope=isObj(input)?input:invalid();
 const args=isObj(envelope['p_args'])?envelope['p_args']:invalid();
 if(envelope['p_action']!=='reply_weekly_message'||
    Object.keys(envelope).some(k=>!['p_action','p_args','p_date'].includes(k))||
    Object.keys(args).some(k=>!['p_letter','p_reply','p_content','p_key','p_draft','p_signed_by'].includes(k)))
   return invalid();
 if(envelope['p_date']!==canonicalDate)
   throw new OriginalMailBridgeError('campaign_date_changed',409);
 if(!nullable(args['p_reply'])||!nullable(args['p_signed_by'])||
    args['p_draft']!==false)
   return unsupported();
 const id=args['p_letter'],key=args['p_key'],content=args['p_content'];
 if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)||
    typeof key!=='string'||!KEY.test(key)||
    typeof content!=='string'||!content.trim())
   return invalid();
 return {requestKey:key,letterId:id,content,expectedCampaignDate:canonicalDate};
}

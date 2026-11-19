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
  invalid();
 if(typeof canonicalDate!=='string'||envelope['p_date']!==canonicalDate)
  throw new OriginalMailBridgeError('campaign_date_changed',409);
 if(Object.keys(args).some(k=>!fields.has(k)))unsupported();
 if(args['p_draft']!==false&&!nullable(args['p_draft'])||
    !nullable(args['p_week'])||!nullable(args['p_court'])||
    !nullable(args['p_unit'])||!nullable(args['p_role'])||
    !nullable(args['p_signed_by']))unsupported();
 if(typeof args['p_key']!=='string'||!KEY.test(args['p_key'])||
    typeof args['p_subject']!=='string'||!args['p_subject'].trim()||
    typeof args['p_content']!=='string'||!args['p_content'].trim()||
    args['p_origin']!==null&&args['p_origin']!==undefined&&
      (typeof args['p_origin']!=='string'||!ID.test(args['p_origin']))||
    !Array.isArray(args['p_targets']))
  invalid();
 if(args['p_targets'].length!==1)unsupported();
 const target=args['p_targets'][0];
 if(typeof target!=='string')invalid();
 const kind:'house'|'narrator'=target==='narrator'?'narrator':
  target.startsWith('h:')?'house':invalid();
 const house=kind==='house'?target.slice(2):null;
 if(house!==null&&!ID.test(house))invalid();
 return {
  requestKey:args['p_key'],originHouseId:args['p_origin']??null,
  recipientKind:kind,recipientHouseId:house,
  subject:args['p_subject'],content:args['p_content'],
  expectedCampaignDate:canonicalDate,
 };
}

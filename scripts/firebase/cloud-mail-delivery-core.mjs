/**
 * Pure delivery rules for Cloud mail (no I/O).
 *
 * A scheduled message becomes delivered when the open round reaches its
 * deliveryRound ("lazy delivery"): opening the week in the HUB is the only
 * trigger, so no job or browser can release a letter early.
 */
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
export const MAX_SIGNATURE_BYTES=120;
export const PLAYER_SCHEDULE_AHEAD=1;
export const NARRATOR_SCHEDULE_AHEAD=8;
const validId=v=>typeof v==='string'&&ID.test(v);

export function effectiveCloudMail(v,openRound){
  if(v&&typeof v==='object'&&v.publicationState==='scheduled'&&
     Number.isSafeInteger(v.deliveryRound)&&Number.isSafeInteger(openRound)&&
     v.deliveryRound<=openRound)
    return {...v,publicationState:'delivered',
      deliveredAt:v.deliveredAt??v.scheduledAt??v.createdAt,lazilyDelivered:true};
  return v;
}

/**
 * Normalizes optional composer fields. Returns only non-default keys so the
 * idempotency fingerprint of a plain send stays exactly as before.
 * Throws the given deny(code) on any malformed value.
 */
export function deliveryOptions(v,deny){
  const out={};
  if(v.draft!==undefined){
    if(typeof v.draft!=='boolean')deny();
    if(v.draft)out.draft=true;
  }
  if(v.deliveryRound!==undefined&&v.deliveryRound!==null){
    if(!Number.isSafeInteger(v.deliveryRound)||v.deliveryRound<1)deny();
    out.deliveryRound=v.deliveryRound;
  }
  if(v.signedBy!==undefined&&v.signedBy!==null){
    if(typeof v.signedBy!=='string'||!v.signedBy.trim()||
       Buffer.byteLength(v.signedBy,'utf8')>MAX_SIGNATURE_BYTES)deny();
    out.signedBy=v.signedBy.trim();
  }
  if(v.courtMemberId!==undefined&&v.courtMemberId!==null){
    if(!validId(v.courtMemberId)||
       !['executor','order_recipient'].includes(v.courtAssignment))deny();
    out.courtMemberId=v.courtMemberId;out.courtAssignment=v.courtAssignment;
  }else if(v.courtAssignment!==undefined&&v.courtAssignment!==null)deny();
  if(v.unitId!==undefined&&v.unitId!==null){
    if(!validId(v.unitId))deny();
    out.unitId=v.unitId;
  }
  return out;
}

/**
 * Decides the stored state. Drafts may carry a planned round; a delivered
 * message always belongs to the open round; players schedule at most one
 * week ahead, the Narrator up to eight. Past rounds are never accepted.
 */
export function deliveryPlan(role,opts,round){
  const ahead=role==='narrador'?NARRATOR_SCHEDULE_AHEAD:PLAYER_SCHEDULE_AHEAD;
  const target=opts.deliveryRound??null;
  if(target!==null&&(target<round||target>round+ahead))
    return {error:'invalid_delivery_round'};
  if(opts.draft)return {state:'draft',deliveryRound:target};
  if(target===null||target===round)return {state:'delivered',deliveryRound:round};
  return {state:'scheduled',deliveryRound:target};
}

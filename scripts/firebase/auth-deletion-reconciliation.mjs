/**
 * Read-only reconciliation after explicitly authorized Firebase Auth deletions.
 * Historic migration access documents remain immutable. Never log identities.
 * The caller must obtain authorized UIDs from a protected, private source.
 */
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const fail=code=>{throw Error('auth_deletion_reconciliation_'+code);};
const unique=(values,code)=>{
  if(!Array.isArray(values)||values.some(v=>typeof v!=='string'||!UID.test(v))||
     new Set(values).size!==values.length)fail(code);
  return new Set(values);
};

/**
 * All comparisons are by UID, not email or display name.
 * historicalAccess: the 14 immutable imported records ({id,data}).
 * liveAuth: current Auth list ({uid,disabled}), obtained in one complete page.
 * approvedDeletedUids: privately authorized deletion list, never a public constant.
 */
export function reconcileAuthorizedAuthDeletions({
  historicalAccess,liveAuth,approvedDeletedUids,authListComplete=false,
}={}){
  if(authListComplete!==true||!Array.isArray(historicalAccess)||
     historicalAccess.length!==14||!Array.isArray(liveAuth))
    fail('inventory_unverified');
  const historic=unique(historicalAccess.map(x=>x?.id),'historical_ids_invalid');
  for(const entry of historicalAccess){
    const data=entry?.data;
    if(!data||data.userId!==entry.id||
       !['jogador','editor',null,undefined].includes(data.profile) &&
         data.profile!=='narrador'||
       typeof data.admin!=='boolean')fail('historical_access_invalid');
  }
  const live=unique(liveAuth.map(x=>x?.uid),'live_ids_invalid');
  if(liveAuth.some(x=>typeof x.disabled!=='boolean'))fail('live_auth_invalid');
  const deleted=unique(approvedDeletedUids,'approval_invalid');
  if(deleted.size===0||deleted.size>14)fail('approval_invalid');
  for(const uid of deleted){
    const record=historicalAccess.find(x=>x.id===uid);
    if(!record||record.data.admin!==false||record.data.profile==='narrador')
      fail('protected_or_unknown_deletion');
    if(live.has(uid))fail('approved_deletion_still_present');
  }
  for(const uid of historic){
    if(!live.has(uid)&&!deleted.has(uid))fail('unexpected_missing_account');
  }
  for(const uid of live){
    if(!historic.has(uid))fail('unexpected_new_account');
  }
  if(live.size!==historic.size-deleted.size)
    fail('count_mismatch');
  return Object.freeze({
    checked:true, historicalAccounts:historic.size,liveAccounts:live.size,
    authorizedDeletionsVerified:deleted.size,unexpectedMissing:0,
    unexpectedNew:0,authWrites:0,firestoreWrites:0,
    readyForPlayers:false,releaseDecision:'NO_GO',
  });
}

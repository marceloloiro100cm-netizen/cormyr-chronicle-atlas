/**
 * Narrator access decision DRY RUN for the immutable Firebase migration stage.
 *
 * Never read a caller-supplied snapshot, mutate Firestore/Auth, clear
 * requirePasswordChange, grant admin or enable game runtime.
 * Input and temporary draft contain private identities: do not log.
 */
import {createHash} from 'node:crypto';

const HASH=/^[a-f0-9]{64}$/;
const ID=/^[^\/\u0000-\u001f\u007f]{1,128}$/;
const ROLES=new Set(['jogador','editor','narrador']);
const INPUT_KEYS=['active','editHouseIds','manualReviewConfirmed',
  'memberHouseIds','profile'];
const asIds=value=>Array.isArray(value)&&value.length<=250&&
  value.every(id=>typeof id==='string'&&ID.test(id))&&
  new Set(value).size===value.length;
const fail=code=>{throw Error('access_remediation_preview_'+code);};
const orderedEqual=(a,b)=>JSON.stringify([...a].sort())===
  JSON.stringify([...b].sort());

/** Bind previews to the exact historical access state observed server-side. */
const sourceFingerprint=({snapshotId,sourceAccess,authUser})=>
  createHash('sha256').update(JSON.stringify([
    'cormyr-access-source-v1',snapshotId,sourceAccess.userId,
    sourceAccess.profile??null,sourceAccess.active,sourceAccess.admin,
    sourceAccess.requirePasswordChange,sourceAccess.playerId??null,
    [...sourceAccess.memberHouseIds].sort(),[...sourceAccess.editHouseIds].sort(),
    authUser.uid,authUser.disabled,
  ])).digest('hex');

/** Opaque proof of which proposal was previewed, NOT approval or write authority. */
const proposalFingerprint=({snapshotId,actorUid,targetUid,sourceDigest,profile,active,members,edits})=>
  createHash('sha256').update(JSON.stringify([
    'cormyr-access-preview-v2',snapshotId,actorUid,targetUid,sourceDigest,
    profile,active,[...members].sort(),[...edits].sort(),
  ])).digest('hex');

/**
 * Trust only server-read snapshot, Auth and active House catalog.
 * A successful draft is NOT approval: an independently reconciled mutable
 * access overlay, explicit human approval and password proof are still needed.
 */
export function planNarratorAccessRemediation({
  snapshotId,actorUid,targetUid,sourceAccess,authUser,
  houseCatalog,proposal,
}={}){
  if(!HASH.test(snapshotId??'')||!ID.test(actorUid??'')||
     !ID.test(targetUid??'')||actorUid===targetUid||
     !sourceAccess||sourceAccess.userId!==targetUid||
     !authUser||authUser.uid!==targetUid||
     typeof authUser.disabled!=='boolean'||
     !Array.isArray(houseCatalog)||houseCatalog.length===0||
     houseCatalog.length>250)fail('source_invalid');
  const role=sourceAccess.profile;
  if(!(role===null||role===undefined||ROLES.has(role))||
     role==='narrador'||typeof sourceAccess.active!=='boolean'||
     typeof sourceAccess.requirePasswordChange!=='boolean'||
     typeof sourceAccess.admin!=='boolean'||
     !asIds(sourceAccess.memberHouseIds)||
     !asIds(sourceAccess.editHouseIds))fail('source_invalid');
  const activeHouses=new Set(),allHouses=new Set();
  for(const house of houseCatalog){
    const h=house?.data??house;
    if(!h||!ID.test(h.sourceId??'')||
       allHouses.has(h.sourceId)||
       typeof h.active!=='boolean'||
       !Number.isSafeInteger(h.season))fail('house_catalog_invalid');
    allHouses.add(h.sourceId);
    if(h.active&&h.season===2)activeHouses.add(h.sourceId);
  }
  if(activeHouses.size!==10)fail('house_catalog_unverified');

  const pending=role===null||role===undefined||
    sourceAccess.active===false||
    sourceAccess.requirePasswordChange===true||
    role==='jogador'&&sourceAccess.memberHouseIds.length===0||
    sourceAccess.editHouseIds.some(id=>
      !sourceAccess.memberHouseIds.includes(id))||
    sourceAccess.memberHouseIds.some(id=>!activeHouses.has(id))||
    sourceAccess.editHouseIds.some(id=>!activeHouses.has(id));
  if(!pending)fail('subject_not_pending');

  if(!proposal||typeof proposal!=='object'||Array.isArray(proposal)||
     Object.keys(proposal).sort().join(',')!==INPUT_KEYS.join(',')||
     proposal.manualReviewConfirmed!==true||
     !['jogador','editor'].includes(proposal.profile)||
     typeof proposal.active!=='boolean'||
     !asIds(proposal.memberHouseIds)||
     !asIds(proposal.editHouseIds))fail('proposal_invalid');
  const members=proposal.memberHouseIds,edits=proposal.editHouseIds;
  if(proposal.profile==='editor'&&(members.length||edits.length)||
     proposal.profile==='jogador'&&members.length===0||
     members.some(id=>!activeHouses.has(id))||
     edits.some(id=>!members.includes(id)))fail('house_scope_invalid');

  const adjustments=[];
  if(role!==proposal.profile)adjustments.push('profile');
  if(sourceAccess.active!==proposal.active)adjustments.push('active');
  if(!orderedEqual(sourceAccess.memberHouseIds,members))
    adjustments.push('memberHouseIds');
  if(!orderedEqual(sourceAccess.editHouseIds,edits))
    adjustments.push('editHouseIds');
  if(sourceAccess.admin!==false)adjustments.push('admin');

  const sourceDigest=sourceFingerprint({snapshotId,sourceAccess,authUser});

  // Do not change password status, even in the proposed state.
  // Never produce a write-ready authorization from this preflight.
  const blockers=['SOURCE_LIVE_DELTA_NOT_RECONCILED',
    'IMMUTABLE_MIGRATION_ACCESS_STAGE','APPROVED_ACCESS_RUNTIME_MISSING',
    'PRODUCTION_PER_HOUSE_E2E_NOT_VERIFIED'];
  if(sourceAccess.requirePasswordChange)
    blockers.push('PASSWORD_RESET_PROOF_PENDING');
  if(authUser.disabled)
    blockers.push('FIREBASE_AUTH_ACCOUNT_DISABLED');
  return {
    scope:'CORMYR_NARRATOR_ACCESS_REMEDIATION_DRY_RUN',
    mode:'preview-only',checked:true,
    proposedProfile:proposal.profile,
    proposedActive:proposal.active,
    proposedMemberHouseCount:members.length,
    proposedEditHouseCount:edits.length,
    // A later mutation must independently re-check identity, source version,
    // House catalog, password proof and explicit narrator authorization.
    sourceFingerprint:sourceDigest,
    proposalFingerprint:proposalFingerprint({snapshotId,actorUid,targetUid,
      sourceDigest,profile:proposal.profile,active:proposal.active,members,edits}),
    changedFields:adjustments,
    requiresPasswordResetProof:sourceAccess.requirePasswordChange,
    authAccountDisabled:authUser.disabled,
    // These codes describe independent gates, not permissions to modify.
    blockingCodes:blockers,
    decisionApplied:false,roleGranted:false,
    adminGranted:false,passwordFlagCleared:false,
    sourceRecordsChanged:false,authWrites:0,firestoreWrites:0,
    readyForPlayers:false,readyForCutover:false,
    releaseDecision:'NO_GO',
  };
}

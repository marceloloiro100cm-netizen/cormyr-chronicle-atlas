/**
 * Offline-only preflight for narrator-reviewed Season 2 access corrections.
 *
 * This is NOT an authorization decision, login endpoint, import or write plan
 * executor. An editor or runner must NEVER log the returned privatePlan:
 * it contains source UIDs and House membership proposals. The summary and
 * failure codes are aggregate/static and safe for public CI.
 *
 * Historical migrationDomainStage documents are immutable. Any future
 * correction requires a separately approved operational store with an
 * authenticated narrator, source-delta validation and real cross-House E2E.
 */
import {createHash} from 'node:crypto';

const HASH=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const REASON=/^[^\u0000-\u001f\u007f]{15,500}$/u;
const PROFILE=new Set(['narrador','jogador','editor']);
const CONFIRM='NARRATOR_EXPLICIT_ACCOUNT_AND_HOUSE_REVIEW';
const FIELDS=new Set(['uid','profile','memberHouseIds','editHouseIds',
  'active','reviewConfirmation','houseConsentVerified','reason']);
const fail=code=>{throw Error('access_remediation_preflight_'+code);};
const validIds=v=>Array.isArray(v)&&v.length<=250&&
  v.every(x=>typeof x==='string'&&ID.test(x))&&
  new Set(v).size===v.length;
const equal=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const pending=v=>v.active===false||v.requirePasswordChange===true||
  v.profile==null||
  v.profile==='jogador'&&v.memberHouseIds.length===0||
  v.editHouseIds.some(id=>!v.memberHouseIds.includes(id));
const n=v=>Number.isSafeInteger(v)&&v>=0&&v<=250?v:'indisponível';

/**
 * The plan consumes ONLY already loaded private source rows.
 * No Cloud SDK, implicit network, system clock, environment or credentials.
 */
export function planPrivateAccessRemediation({
  snapshotId,accessDocs,houses,reviewedChanges,
}={}){
  if(!HASH.test(snapshotId??'')||
     !Array.isArray(accessDocs)||accessDocs.length!==14||
     !Array.isArray(houses)||houses.length<1||houses.length>250||
     !Array.isArray(reviewedChanges)||reviewedChanges.length<1||
     reviewedChanges.length>14)fail('inventory_unverified');

  const activeHouseIds=new Set(),allHouseIds=new Set();
  for(const h of houses){
    if(!h||!ID.test(h.sourceId??'')||allHouseIds.has(h.sourceId)||
       typeof h.active!=='boolean'||!Number.isSafeInteger(h.season))
      fail('house_catalog_invalid');
    allHouseIds.add(h.sourceId);
    if(h.active===true&&h.season===2)activeHouseIds.add(h.sourceId);
  }
  if(activeHouseIds.size!==10)fail('active_house_catalog_unverified');

  const source=new Map();
  let pendingAtSource=0;
  for(const row of accessDocs){
    const v=row?.data;
    if(!row||!ID.test(row.id??'')||!v||
       v.userId!==row.id||source.has(row.id)||
       !(v.profile===null||v.profile===undefined||PROFILE.has(v.profile))||
       typeof v.active!=='boolean'||
       typeof v.requirePasswordChange!=='boolean'||
       typeof v.admin!=='boolean'||
       !validIds(v.memberHouseIds)||!validIds(v.editHouseIds)||
       (v.profile==='narrador'&&v.admin!==true)||
       (v.profile!=='narrador'&&v.admin!==false))
      fail('access_inventory_invalid');
    source.set(row.id,v);
    if(pending(v))pendingAtSource++;
  }

  const seen=new Set(),proposals=[];
  let wouldActivate=0,wouldDeactivate=0,profilesCompleted=0;
  let membershipChanged=0,passwordResetStillPending=0;
  for(const proposed of reviewedChanges){
    if(!proposed||typeof proposed!=='object'||Array.isArray(proposed)||
       Object.keys(proposed).some(k=>!FIELDS.has(k))||
       !ID.test(proposed.uid??'')||
       seen.has(proposed.uid)||
       proposed.reviewConfirmation!==CONFIRM||
       proposed.houseConsentVerified!==true||
       typeof proposed.reason!=='string'||!REASON.test(proposed.reason))
      fail('decision_unverified');
    seen.add(proposed.uid);
    const current=source.get(proposed.uid);
    if(!current||!pending(current)||current.profile==='narrador')
      fail('account_not_pending_or_privileged');
    if(proposed.profile!=='jogador'&&proposed.profile!=='editor')
      fail('unsupported_role_change');
    // An existing player cannot be reassigned to the editorial role, nor
    // vice versa. Only previously null profiles may be newly classified.
    if(current.profile!=null&&current.profile!==proposed.profile)
      fail('role_escalation_rejected');
    if(typeof proposed.active!=='boolean'||!validIds(proposed.memberHouseIds)||
       !validIds(proposed.editHouseIds))
      fail('decision_schema_invalid');
    if(proposed.profile==='editor'&&
       (proposed.memberHouseIds.length!==0||
        proposed.editHouseIds.length!==0))
      fail('editor_house_scope_rejected');
    if(proposed.profile==='jogador'&&
       (proposed.memberHouseIds.length===0||
        proposed.memberHouseIds.some(id=>!activeHouseIds.has(id))||
        proposed.editHouseIds.some(id=>!activeHouseIds.has(id))||
        proposed.editHouseIds.some(id=>!proposed.memberHouseIds.includes(id))))
      fail('house_scope_unverified');
    // A password-reset flag cannot be changed here, and a user who still
    // requires reset must remain inactive pending independent reset proof.
    if(current.requirePasswordChange===true&&proposed.active===true)
      fail('password_reset_not_verified');
    const changed=current.profile!==proposed.profile||
      current.active!==proposed.active||
      !equal(current.memberHouseIds,proposed.memberHouseIds)||
      !equal(current.editHouseIds,proposed.editHouseIds);
    if(!changed)fail('decision_has_no_change');
    if(current.active===false&&proposed.active===true)wouldActivate++;
    if(current.active===true&&proposed.active===false)wouldDeactivate++;
    if(current.profile==null)profilesCompleted++;
    if(!equal(current.memberHouseIds,proposed.memberHouseIds)||
       !equal(current.editHouseIds,proposed.editHouseIds))membershipChanged++;
    if(current.requirePasswordChange)passwordResetStillPending++;
    proposals.push({
      uid:proposed.uid,
      before:{profile:current.profile??null,active:current.active,
        requirePasswordChange:current.requirePasswordChange,
        memberHouseIds:[...current.memberHouseIds],
        editHouseIds:[...current.editHouseIds]},
      after:{profile:proposed.profile,active:proposed.active,
        // This preflight NEVER clears password change requirements.
        requirePasswordChange:current.requirePasswordChange,
        admin:false,
        memberHouseIds:[...proposed.memberHouseIds],
        editHouseIds:[...proposed.editHouseIds]},
      reviewConfirmation:CONFIRM,houseConsentVerified:true,
      reason:proposed.reason,
    });
  }
  proposals.sort((a,b)=>a.uid.localeCompare(b.uid));
  const fingerprint=createHash('sha256')
    .update('cormyr/private-access-remediation/proposal-only/v1\n','utf8')
    .update(JSON.stringify({snapshotId,proposals}),'utf8').digest('hex');
  const summary={
    scope:'CORMYR_PRIVATE_ACCESS_REMEDIATION_PREFLIGHT_OFFLINE',
    accountsChecked:14,activeSeason2Houses:activeHouseIds.size,
    pendingAtSource,proposedChanges:proposals.length,
    wouldActivate,wouldDeactivate,profilesCompleted,membershipChanged,
    passwordResetStillPending,
    proposalValidated:true,approvalRecorded:false,
    sourceImmutable:true,cloudReads:0,cloudWrites:0,authWrites:0,
    releaseDecision:'NO_GO',readyForCutover:false,readyForPlayers:false,
  };
  return {
    summary,
    // Never send privatePlan to GitHub Actions, logs or public issue bodies.
    privatePlan:{snapshotId,fingerprint,proposals},
  };
}

export function safePrivateAccessProposalSummary(report){
  const valid=report?.scope===
    'CORMYR_PRIVATE_ACCESS_REMEDIATION_PREFLIGHT_OFFLINE'&&
    report.proposalValidated===true&&report.cloudWrites===0;
  return [
    '## Pré-validação de correção de acessos — sem gravações',
    '| Verificação | Resultado |','| --- | ---: |',
    '| Inventário de usuários | '+(valid?n(report.accountsChecked):'indisponível')+' |',
    '| Casas ativas da temporada 2 | '+(valid?n(report.activeSeason2Houses):'indisponível')+' |',
    '| Contas com pendências na origem | '+(valid?n(report.pendingAtSource):'indisponível')+' |',
    '| Propostas verificadas | '+(valid?n(report.proposedChanges):'indisponível')+' |',
    '| Propostas de ativação futura | '+(valid?n(report.wouldActivate):'indisponível')+' |',
    '| Perfis preenchidos na proposta | '+(valid?n(report.profilesCompleted):'indisponível')+' |',
    '| Vínculos de Casas alterados na proposta | '+(valid?n(report.membershipChanged):'indisponível')+' |',
    '| Trocas de senha ainda exigidas | '+(valid?n(report.passwordResetStillPending):'indisponível')+' |',
    '| Aprovação registrada e aplicada | **NÃO** |',
    '| Escritas Auth / Firestore | **ZERO** |',
    '',
    'Nenhum UID, e-mail, Casa, comentário privado ou fingerprint é publicado.',
    'Snapshot histórico imutável. NO_GO para liberar usuários ou gravações.',
  ].join('\n');
}

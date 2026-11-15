/**
 * On-demand, read-only diagnostics for the user's OWN Supabase session.
 * These booleans are evidence of identity/RPC access, never authority:
 * RLS and RPCs must independently guard every private operation.
 */
import type {CampaignProfile} from './campaign-access-scope';

export type CheckState='approved'|'denied'|'unverified';
export type RoleSelfAuditSignal=boolean|null;
export type RoleSelfAuditEvidence={
  profile:CampaignProfile|null;
  admin:boolean;
  campaignActive:RoleSelfAuditSignal;
  editorIdentity:RoleSelfAuditSignal;
  newspaperEdit:RoleSelfAuditSignal;
  playerActive:boolean;
  passwordChangeRequired:boolean;
  hasPlayer:boolean;
  houseMembershipCount:number;
  ownHouseConfirmed:RoleSelfAuditSignal;
};
export type RoleSelfAuditCheck={
  key:string;label:string;state:CheckState;
};
export type RoleSelfAuditReport={
  profile:CampaignProfile|null;
  checks:RoleSelfAuditCheck[];
  passed:boolean;
  crossHouseIsolationVerified:false;
  mailboxWritesVerified:false;
  privateNarratorDataVerified:false;
  serviceRoleKeyVerified:false;
  cloudDataMigrationVerified:false;
  readyForCutover:false;
};

function equals(actual:RoleSelfAuditSignal,expected:boolean):CheckState{
  return actual===null?'unverified':actual===expected?'approved':'denied';
}
function check(key:string,label:string,state:CheckState):RoleSelfAuditCheck{
  return {key,label,state};
}

export function evaluateRoleSelfAudit(e:RoleSelfAuditEvidence):RoleSelfAuditReport{
  const checks:RoleSelfAuditCheck[]=[];
  const add=(key:string,label:string,state:CheckState)=>{
    checks.push(check(key,label,state));
  };
  if(e.profile!=='jogador'&&e.profile!=='narrador'&&e.profile!=='editor'){
    add('profile','Perfil ativo reconhecido','denied');
  }else{
    add('profile','Perfil de campanha reconhecido','approved');
    add('campaign-active','Acesso ativo confirmado pelo servidor',equals(e.campaignActive,true));
    if(e.profile==='narrador'){
      add('narrator','Autorização administrativa',equals(e.admin,true));
      add('newspaper','Permissão para gerenciar o Jornal',equals(e.newspaperEdit,true));
    }else if(e.profile==='editor'){
      add('non-admin','Editor sem autoridade administrativa',equals(e.admin,false));
      add('editor','Identidade editorial reconhecida pelo servidor',equals(e.editorIdentity,true));
      add('newspaper','Permissão editorial do Jornal',equals(e.newspaperEdit,true));
    }else{
      add('non-admin','Jogador sem autoridade administrativa',equals(e.admin,false));
      add('player','Conta de jogador ativa e senha regular',
        e.hasPlayer&&e.playerActive&&!e.passwordChangeRequired?'approved':'denied');
      add('house-assignment','Casa autorizada vinculada à conta',
        e.houseMembershipCount>0?'approved':'denied');
      add('house-access','Permissão de leitura da própria Casa confirmada',
        equals(e.ownHouseConfirmed,true));
      add('editor','Jogador sem identidade de Editor-chefe',equals(e.editorIdentity,false));
      add('newspaper','Jogador sem permissão de edição do Jornal',equals(e.newspaperEdit,false));
    }
  }
  return {
    profile:e.profile,
    checks,
    passed:checks.every(c=>c.state==='approved'),
    crossHouseIsolationVerified:false,
    mailboxWritesVerified:false,
    privateNarratorDataVerified:false,
    serviceRoleKeyVerified:false,
    cloudDataMigrationVerified:false,
    readyForCutover:false,
  };
}

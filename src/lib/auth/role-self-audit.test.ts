import {describe,it,expect} from 'vitest';
import {evaluateRoleSelfAudit,type RoleSelfAuditEvidence} from './role-self-audit';

const narrator:RoleSelfAuditEvidence={
  profile:'narrador',admin:true,campaignActive:true,
  editorIdentity:false,newspaperEdit:true,playerActive:false,
  passwordChangeRequired:false,hasPlayer:false,
  houseMembershipCount:0,ownHouseConfirmed:null,
};
const editor:RoleSelfAuditEvidence={
  profile:'editor',admin:false,campaignActive:true,
  editorIdentity:true,newspaperEdit:true,playerActive:true,
  passwordChangeRequired:false,hasPlayer:true,
  houseMembershipCount:0,ownHouseConfirmed:null,
};
const player:RoleSelfAuditEvidence={
  profile:'jogador',admin:false,campaignActive:true,
  editorIdentity:false,newspaperEdit:false,playerActive:true,
  passwordChangeRequired:false,hasPlayer:true,
  houseMembershipCount:1,ownHouseConfirmed:true,
};

describe('production session self-audit (read-only, no private data)',()=>{
  it('accepts Narrator authority with no player or house membership',()=>{
    const result=evaluateRoleSelfAudit(narrator);
    expect(result.profile).toBe('narrador');
    expect(result.passed).toBe(true);
    expect(result.checks.map(x=>x.key)).toContain('narrator');
    expect(result.checks.find(x=>x.key==='narrator')?.state).toBe('approved');
  });
  it('accepts chief editor only when newspaper privilege is confirmed',()=>{
    const result=evaluateRoleSelfAudit(editor);
    expect(result.passed).toBe(true);
    expect(result.checks.find(x=>x.key==='editor')?.state).toBe('approved');
    // Memberships are not queried for editorial role. Do not claim
    // cross-House authorization is verified merely because the UI hides it.
    expect(result.checks.some(x=>x.key==='house-isolation')).toBe(false);
    expect(evaluateRoleSelfAudit({...editor,newspaperEdit:null}).passed).toBe(false);
    expect(evaluateRoleSelfAudit({...editor,newspaperEdit:false}).passed).toBe(false);
  });
  it('requires an active player and an independently confirmed House RPC',()=>{
    expect(evaluateRoleSelfAudit(player).passed).toBe(true);
    expect(evaluateRoleSelfAudit({...player,houseMembershipCount:0}).passed).toBe(false);
    expect(evaluateRoleSelfAudit({...player,ownHouseConfirmed:null}).checks
      .find(x=>x.key==='house-access')?.state).toBe('unverified');
    expect(evaluateRoleSelfAudit({...player,ownHouseConfirmed:false}).passed).toBe(false);
    expect(evaluateRoleSelfAudit({...player,passwordChangeRequired:true}).passed).toBe(false);
    expect(evaluateRoleSelfAudit({...player,playerActive:false}).passed).toBe(false);
  });
  it('does not promote another profile to Narrator or editorial privileges',()=>{
    expect(evaluateRoleSelfAudit({...editor,admin:true}).passed).toBe(false);
    expect(evaluateRoleSelfAudit({...player,admin:true}).passed).toBe(false);
    expect(evaluateRoleSelfAudit({...player,editorIdentity:true}).passed).toBe(false);
    expect(evaluateRoleSelfAudit({...narrator,admin:false}).passed).toBe(false);
  });
  it('always fails closed on session or RPC uncertainty',()=>{
    expect(evaluateRoleSelfAudit({...narrator,campaignActive:null}).passed).toBe(false);
    expect(evaluateRoleSelfAudit({...editor,editorIdentity:null}).passed).toBe(false);
    expect(evaluateRoleSelfAudit({...player,profile:null}).passed).toBe(false);
    expect(evaluateRoleSelfAudit({...player,campaignActive:false}).passed).toBe(false);
    for(const evidence of [narrator,editor,player]){
      const result=evaluateRoleSelfAudit(evidence);
      expect(result.crossHouseIsolationVerified).toBe(false);
      expect(result.mailboxWritesVerified).toBe(false);
      expect(result.privateNarratorDataVerified).toBe(false);
      expect(result.serviceRoleKeyVerified).toBe(false);
      expect(result.cloudDataMigrationVerified).toBe(false);
      expect(result.readyForCutover).toBe(false);
      expect(JSON.stringify(result)).not.toContain('house_id');
      expect(JSON.stringify(result)).not.toContain('userId');
    }
  });
});

/**
 * Module-level source contract smoke. Pure, read-only aggregate checks.
 * Caller supplies already-verified imported rows and the original
 * mailPage projection. No source row/identifier ever appears in output.
 */
import {filterWorkspaceRecords} from './workspace-records.mjs';
import {projectWorkspaceNewspapers} from './workspace-newspaper.mjs';
import {projectWorkspaceSpies} from './workspace-spies.mjs';

export const MODULE_TABLES=[
  'campaign_records','record_versions','campaign_newspapers',
  'campaign_newspaper_revisions','spy_assets','spy_operations',
  'spy_mission_timeline','spy_agent_history','spy_agent_removals',
  'campaign_letters','letter_replies','letter_receipts','letter_rounds',
  'campaign_players','house_memberships','campaign_houses',
];
export const MAIL_TABLES=[
  'campaign_letters','letter_replies','letter_receipts','letter_rounds',
  'campaign_players','house_memberships','campaign_houses',
];
const blocked=()=>{throw Error('workspace_module_source_invalid');};
const narrator={uid:'protected-module-source-audit',profile:'narrador',
  playerId:null,memberHouseIds:[]};
export function inspectModuleSourceContracts(tables,runMailPage){
  if(!tables||typeof tables!=='object'||typeof runMailPage!=='function')
    blocked();
  for(const name of MODULE_TABLES)
    if(!Array.isArray(tables[name]))blocked();
  const total=MODULE_TABLES.reduce((n,name)=>n+tables[name].length,0);
  let step='records';
  try{
    const records=filterWorkspaceRecords(tables.campaign_records,narrator);
    if(records.length!==tables.campaign_records.length)blocked();
    const recordIds=new Set(records.map(row=>row.id));
    if(tables.record_versions.some(row=>!recordIds.has(row.record_id)||
      !Number.isSafeInteger(row.version)||row.version<1||
      !row.snapshot||typeof row.snapshot!=='object'||Array.isArray(row.snapshot)))
      blocked();
    step='newspaper';
    const newspaper=projectWorkspaceNewspapers(tables.campaign_newspapers,
      tables.campaign_newspaper_revisions,{uid:narrator.uid,profile:'editor'});
    if(newspaper.total!==tables.campaign_newspapers.length||
       newspaper.revisionsAudited!==tables.campaign_newspaper_revisions.length)
      blocked();
    step='spies';
    const spies=projectWorkspaceSpies(tables,narrator);
    if(spies.agents.total!==tables.spy_assets.length||
       spies.missions.total!==tables.spy_operations.length||
       spies.history.total!==tables.spy_agent_history.length||
       spies.removals.total!==tables.spy_agent_removals.length)
      blocked();
    step='mail';
    const mailRows=Object.fromEntries(MAIL_TABLES.map(name=>[name,tables[name]]));
    const intro=runMailPage(mailRows,narrator,{page:0,size:20,filters:{}});
    if(!intro||!Number.isSafeInteger(intro.total)||
       !Array.isArray(intro.letters)||!Array.isArray(intro.replies)||
       intro.total>tables.campaign_letters.length||
       intro.letters.length>20)blocked();
    // Ensure mail filters and original trash route can process the actual
    // historical source, not just invented fixture data.
    for(const filters of [{box:'recebidas'},{box:'enviadas'},
      {box:'rascunhos'},{box:'programadas'},{box:'lixeira'}]){
      const view=runMailPage(mailRows,narrator,{page:0,size:20,filters});
      if(!view||!Number.isSafeInteger(view.total)||
         !Array.isArray(view.letters)||view.letters.length>20)blocked();
    }
    // Source-level player projection check: does not grant any real rights.
    // The live API revalidates Firebase Auth + current season-2 membership.
    const m=tables.house_memberships;
    const candidates=tables.campaign_players.filter(p=>
      typeof p.id==='string'&&typeof p.user_id==='string'&&p.user_id.length>0&&
      m.some(x=>x.player_id===p.id));
    let playerProjection='not_applicable';
    if(candidates.length){
      const selected=candidates[0];
      const houses=[...new Set(m.filter(x=>x.player_id===selected.id)
        .map(x=>x.house_id))];
      const viewer={uid:selected.user_id,profile:'jogador',
        playerId:selected.id,memberHouseIds:houses};
      const view=runMailPage(mailRows,viewer,{page:0,size:20,filters:{}});
      if(!view||!Number.isSafeInteger(view.total)||view.letters.length>20)
        blocked();
      playerProjection='source_shape_valid';
    }
    return {status:'source_projection_consistent',readOnly:true,
      moduleCount:4,sourceRowsChecked:total,
      records:{items:records.length,versions:tables.record_versions.length},
      newspaper:{editions:newspaper.total,
        revisions:newspaper.revisionsAudited,
        versionGaps:newspaper.items.reduce((n,e)=>n+(e.versionGaps??0),0),
        duplicateVersions:newspaper.items.reduce((n,e)=>n+(e.duplicateVersions??0),0),
        outOfRangeVersions:newspaper.items.reduce((n,e)=>n+(e.versionsOutOfRange??0),0)},
      espionagem:{agents:spies.agents.total,missions:spies.missions.total,
        history:spies.history.total,removals:spies.removals.total},
      missivas:{letters:tables.campaign_letters.length,
        replies:tables.letter_replies.length,
        receipts:tables.letter_receipts.length,
        rounds:tables.letter_rounds.length,playerProjection},
      operationalUIConnected:false,liveWritesChecked:false,
      sourceLiveReconciled:false};
  }catch{
    // Never leak a private row or source ID through test, workflow or errors.
    throw Error('workspace_module_contract_'+step+'_failed');
  }
}

/**
 * Strict read-only access to A Folha Sem Selo's imported source editions and
 * editorial revision history. NEVER copies, publishes, deletes or promotes drafts.
 * All callers MUST be authorized by the current Firebase server-side scope.
 */
import {readWorkspaceTable} from './workspace-import.mjs';

const ID=/^[^/\\u0000-\\u001f]{1,128}$/;
const STATES=new Set(['draft','published','archived','cancelled']);
const PUBLIC=new Set(['published','archived']);
export class WorkspaceNewspaperError extends Error{
  constructor(code,status){super(code);this.code=code;this.status=status;}
}
const fail=(code='newspaper_source_invalid',status=503)=>{
  throw new WorkspaceNewspaperError(code,status);
};
const isId=x=>typeof x==='string'&&ID.test(x);
function checkViewer(viewer){
  if(!viewer||!isId(viewer.uid)||!['jogador','narrador','editor'].includes(viewer.profile))
    fail('access_denied',403);
}
function assertEdition(e){
  if(!e||typeof e!=='object'||Array.isArray(e)||!isId(e.id)||
     typeof e.title!=='string'||typeof e.subtitle!=='string'||
     !STATES.has(e.state)||!Array.isArray(e.blocks)||
     !Number.isSafeInteger(e.version)||e.version<1||
     !Number.isSafeInteger(e.edition_no)||e.edition_no<1||
     !Number.isSafeInteger(e.publication_revision)||e.publication_revision<0)
    fail();
}
function assertRevision(r){
  if(!r||typeof r!=='object'||Array.isArray(r)||
     !Number.isSafeInteger(r.id)||r.id<1||
     !isId(r.newspaper_id)||!Number.isSafeInteger(r.previous_version)||
     r.previous_version<1||!r.snapshot||typeof r.snapshot!=='object'||
     Array.isArray(r.snapshot))
    fail();
}
export const maySeeWorkspaceEdition=(viewer,edition)=>
  ['narrador','editor'].includes(viewer.profile)||PUBLIC.has(edition.state);
export const canInspectWorkspaceRevisions=viewer=>
  viewer?.profile==='narrador'||viewer?.profile==='editor';

export function inspectNewspaperSource(editions,revisions){
  if(!Array.isArray(editions)||!Array.isArray(revisions)||
     editions.length>500||revisions.length>5000)fail();
  const byId=new Map(),stats=new Map();
  for(const e of editions){
    assertEdition(e);
    if(byId.has(e.id))fail();
    byId.set(e.id,e);
    stats.set(e.id,{editionId:e.id,currentVersion:e.version,revisions:0,
      duplicateVersions:0,versionsOutOfRange:0,missingVersionSlots:0});
  }
  const seen=new Map();
  for(const r of revisions){
    assertRevision(r);
    const e=byId.get(r.newspaper_id);
    if(!e)fail('newspaper_revision_orphan',503);
    const s=stats.get(e.id),versions=seen.get(e.id)??new Set();
    s.revisions++;
    if(versions.has(r.previous_version))s.duplicateVersions++;
    versions.add(r.previous_version);seen.set(e.id,versions);
    if(r.previous_version>=e.version)s.versionsOutOfRange++;
  }
  for(const e of editions){
    const versions=seen.get(e.id)??new Set();
    const within=[...versions].filter(v=>v<e.version).length;
    stats.get(e.id).missingVersionSlots=Math.max(0,e.version-1-within);
  }
  return stats;
}
function metadata(e,revision){
  return {id:e.id,edition_no:e.edition_no,title:e.title,subtitle:e.subtitle,
    state:e.state,template:e.template,font_style:e.font_style,
    campaign_date:e.campaign_date,published_at:e.published_at??null,
    updated_at:e.updated_at??null,version:e.version,
    publication_revision:e.publication_revision,
    ...(revision?{revisions:revision.revisions,
      versionGaps:revision.missingVersionSlots,
      duplicateVersions:revision.duplicateVersions,
      versionsOutOfRange:revision.versionsOutOfRange}:{})};
}
export function projectWorkspaceNewspapers(editions,revisions,viewer){
  checkViewer(viewer);
  const analysis=inspectNewspaperSource(editions,revisions);
  const editorial=canInspectWorkspaceRevisions(viewer);
  const visible=editions.filter(e=>maySeeWorkspaceEdition(viewer,e))
    .sort((a,b)=>b.edition_no-a.edition_no);
  return {readOnly:true,source:'verified-workspace-archive',
    operationalConnected:false,total:visible.length,
    revisionsAudited:editorial?revisions.length:undefined,
    items:visible.map(e=>metadata(e,editorial?analysis.get(e.id):null))};
}
async function readSource(db,snapshotId){
  const [editions,revisions]=await Promise.all([
    readWorkspaceTable(db,snapshotId,'campaign_newspapers'),
    readWorkspaceTable(db,snapshotId,'campaign_newspaper_revisions'),
  ]);
  inspectNewspaperSource(editions,revisions);
  return {editions,revisions};
}
export async function listWorkspaceNewspapers(db,snapshotId,viewer){
  checkViewer(viewer);
  const {editions,revisions}=await readSource(db,snapshotId);
  return projectWorkspaceNewspapers(editions,revisions,viewer);
}
export async function getWorkspaceNewspaper(db,snapshotId,viewer,editionId){
  checkViewer(viewer);
  if(!isId(editionId))fail('invalid_newspaper_request',400);
  const {editions,revisions}=await readSource(db,snapshotId);
  const e=editions.find(row=>row.id===editionId);
  if(!e||!maySeeWorkspaceEdition(viewer,e))fail('newspaper_not_found',404);
  const editorial=canInspectWorkspaceRevisions(viewer);
  const stats=editorial?inspectNewspaperSource(editions,revisions).get(e.id):null;
  return {readOnly:true,source:'verified-workspace-archive',
    operationalConnected:false,edition:{...metadata(e,stats),
      blocks:e.blocks,pdf_path:e.pdf_path??null,publish_on:e.publish_on??null}};
}
export async function listWorkspaceNewspaperRevisions(db,snapshotId,viewer,
  editionId,{page=0,size=20}={}){
  checkViewer(viewer);
  if(!canInspectWorkspaceRevisions(viewer))fail('access_denied',403);
  if(!isId(editionId)||!Number.isSafeInteger(page)||page<0||page>10000||
     !Number.isSafeInteger(size)||size<1||size>40)
    fail('invalid_newspaper_request',400);
  const {editions,revisions}=await readSource(db,snapshotId);
  if(!editions.some(e=>e.id===editionId))fail('newspaper_not_found',404);
  const matching=revisions.filter(r=>r.newspaper_id===editionId)
    .sort((a,b)=>b.previous_version-a.previous_version||b.id-a.id);
  return {readOnly:true,source:'verified-workspace-archive',
    operationalConnected:false,editionId,total:matching.length,
    revisions:matching.slice(page*size,(page+1)*size).map(r=>({
      id:r.id,previous_version:r.previous_version,changed_at:r.changed_at??null,
    }))};
}
export async function getWorkspaceNewspaperRevision(db,snapshotId,viewer,
  editionId,revisionId){
  checkViewer(viewer);
  if(!canInspectWorkspaceRevisions(viewer))fail('access_denied',403);
  if(!isId(editionId)||!Number.isSafeInteger(revisionId)||revisionId<1)
    fail('invalid_newspaper_request',400);
  const {editions,revisions}=await readSource(db,snapshotId);
  if(!editions.some(e=>e.id===editionId))fail('newspaper_not_found',404);
  const found=revisions.find(r=>r.id===revisionId&&r.newspaper_id===editionId);
  if(!found)fail('newspaper_not_found',404);
  return {readOnly:true,source:'verified-workspace-archive',
    operationalConnected:false,revision:{id:found.id,
      previous_version:found.previous_version,changed_at:found.changed_at??null,
      snapshot:found.snapshot}};
}

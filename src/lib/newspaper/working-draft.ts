/**
 * "Edição em andamento": the Jornal keeps ONE working draft. These pure rules
 * decide which draft reopens after a reload, which device copy can be synced
 * without asking, and which versions are offered for recovery. Nothing here
 * reads or writes Firebase; callers keep every server CAS guard.
 */
import type {NewspaperEdition} from './model';
import type {OfflineEditionBackup} from './offline-draft';
import {editionWords,sameSnapshot,snapshotOf,type DraftSnapshot} from './editing';

const time=(value:string|null|undefined)=>{
 const at=Date.parse(value??'');
 return Number.isFinite(at)?at:0;
};
/** Drafts the Editor-Chefe can keep writing (never publications or previews). */
export function editableDrafts(editions:readonly NewspaperEdition[]):NewspaperEdition[]{
 return editions.filter(e=>e.state==='draft'&&!e.archive_preview&&!e.published_at);
}
/** Latest activity on a draft: a Firebase save or a copy kept on this device. */
export function draftActivity(edition:NewspaperEdition,backups:readonly OfflineEditionBackup[]):number{
 let latest=time(edition.updated_at);
 for(const b of backups)if(b.editionId===edition.id&&b.updatedAt>latest)latest=b.updatedAt;
 return latest;
}
/**
 * The draft to reopen: the one with the most recent activity (on Firebase or on
 * this device), then the one with more text. Never an arbitrary draft: opening
 * an old or empty copy after a reload looked exactly like losing the work.
 */
export function pickWorkingDraft(editions:readonly NewspaperEdition[],
 backups:readonly OfflineEditionBackup[]):NewspaperEdition|null{
 // A draft created and never written in (version 1, no device copy) is not
 // "the work": it never outranks a draft that was actually edited.
 const touched=(e:NewspaperEdition)=>e.version>1||backups.some(b=>b.editionId===e.id&&
  !sameSnapshot(b.snapshot,snapshotOf(e)))?1:0;
 return editableDrafts(editions).sort((a,b)=>
  touched(b)-touched(a)||
  draftActivity(b,backups)-draftActivity(a,backups)||
  editionWords(b.blocks)-editionWords(a.blocks)||
  b.version-a.version)[0]??null;
}
/**
 * A device copy written on top of the CURRENT Firebase version continues it:
 * nobody saved anything newer. It can be applied and synced automatically.
 * A copy based on an older version is a real divergence and needs review.
 */
export function autoApplicableBackup(edition:NewspaperEdition,
 backups:readonly OfflineEditionBackup[]):OfflineEditionBackup|null{
 if(edition.state!=='draft'||edition.archive_preview)return null;
 const saved=snapshotOf(edition);
 const latest=backups.filter(b=>b.editionId===edition.id)
  .sort((a,b)=>b.updatedAt-a.updatedAt)[0];
 if(!latest||latest.baseVersion!==edition.version||sameSnapshot(latest.snapshot,saved))return null;
 // A checkpoint older than the last Firebase save is not newer work.
 if(time(edition.updated_at)>latest.updatedAt)return null;
 return latest;
}
/**
 * After a 409, Firebase may simply hold an earlier save from THIS device whose
 * response was lost. If its content matches one of our own checkpoints (or the
 * last confirmed copy), rebasing loses nothing written by anyone else.
 */
export function isOwnEarlierSave(remote:NewspaperEdition,lastConfirmed:NewspaperEdition|null|undefined,
 backups:readonly OfflineEditionBackup[]):boolean{
 const snap=snapshotOf(remote);
 if(lastConfirmed&&lastConfirmed.id===remote.id&&sameSnapshot(snapshotOf(lastConfirmed),snap))return true;
 return backups.some(b=>b.editionId===remote.id&&sameSnapshot(b.snapshot,snap));
}

export type RecoveryCandidate={
 key:string;
 origin:'firebase'|'device';
 editionId:string;
 /** ms since epoch; 0 when Firebase did not report the save time. */
 updatedAt:number;
 words:number;elements:number;
 snapshot:DraftSnapshot;
 /** The draft this content already lives in exists in Firebase. */
 draftExists:boolean;
 working:boolean;
};
/**
 * Every version that could be "a edição em andamento": each Firebase draft and
 * every checkpoint kept on this device, newest first, duplicates collapsed.
 */
export function recoveryCandidates(editions:readonly NewspaperEdition[],
 backups:readonly OfflineEditionBackup[],workingId:string|null):RecoveryCandidate[]{
 const drafts=editableDrafts(editions);
 const list:RecoveryCandidate[]=drafts.map(d=>({
  key:'firebase:'+d.id+':'+d.version,origin:'firebase',editionId:d.id,
  updatedAt:time(d.updated_at),words:editionWords(d.blocks),elements:d.blocks.length,
  snapshot:snapshotOf(d),draftExists:true,working:d.id===workingId,
 }));
 for(const b of backups){
  if(list.some(c=>c.editionId===b.editionId&&sameSnapshot(c.snapshot,b.snapshot)))continue;
  list.push({key:'device:'+b.editionId+':'+b.updatedAt+':'+b.baseVersion,origin:'device',
   editionId:b.editionId,updatedAt:b.updatedAt,words:editionWords(b.snapshot.blocks),
   elements:b.snapshot.blocks.length,snapshot:b.snapshot,
   draftExists:drafts.some(d=>d.id===b.editionId),working:false});
 }
 return list.sort((a,b)=>b.updatedAt-a.updatedAt||b.words-a.words);
}

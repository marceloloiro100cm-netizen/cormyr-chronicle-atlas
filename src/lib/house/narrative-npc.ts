import {isFichaCasa,isFichaPersonagem} from '@/lib/ficha';

/** Soft-exclusion marker stored through save_campaign_record: the previous
 * version remains audited and can be restored without deleting files. */
export const COURT_NPC_ARCHIVED_MARKER='[CORMYR_COURT_NPC_ARCHIVED_V1]';

export function isArchivedCourtNpc(r:{kind:string;content:string}):boolean {
 return r.kind==='character'&&r.content.trimStart().startsWith(COURT_NPC_ARCHIVED_MARKER);
}
export function isNarrativeNpc(r:{kind:string;title:string;content:string}){
 return r.kind==='character'&&!isArchivedCourtNpc(r)
  &&!isFichaPersonagem(r.title,r.content)
  &&!isFichaCasa(r.title,r.content)
  &&!/^ficha\b/i.test(r.title.trim());
}

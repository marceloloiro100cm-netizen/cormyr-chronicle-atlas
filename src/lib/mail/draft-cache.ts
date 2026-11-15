import type {PendingImage} from '@/components/campaign-content';

/**
 * Transient, browser-only draft. Never persists to localStorage/sessionStorage,
 * GitHub, or the server. DB drafts use the existing guarded mail RPC.
 */
export type MailComposerDraft={
  campaignDate:string;
  subject:string;
  content:string;
  targets:string[];
  links:{origin:string;court:string;unit:string;role:string};
  week:string;
  signedBy:string;
  images:PendingImage[];
};
const drafts=new Map<string,MailComposerDraft>();
export const readMailComposerDraft=(scope:string)=>drafts.get(scope);
export const writeMailComposerDraft=(scope:string,draft:MailComposerDraft)=>{
  drafts.set(scope,draft);
};
export const discardMailComposerDraft=(scope:string)=>{
  drafts.delete(scope);
};
/** Must run when Supabase session changes, before private routes remount. */
export function clearMailComposerDrafts():void{
  drafts.clear();
}
export function hasUnsavedMailComposerDraft(scope:string):boolean{
  const draft=drafts.get(scope);
  return Boolean(draft&&(draft.content||draft.subject||draft.images.length));
}

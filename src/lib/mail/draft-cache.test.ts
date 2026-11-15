import {afterEach,describe,expect,it,vi} from 'vitest';
import {
 readMailComposerDraft,writeMailComposerDraft,discardMailComposerDraft,
 clearMailComposerDrafts,hasUnsavedMailComposerDraft,
 type MailComposerDraft,
} from './draft-cache';
import {clearSessionQueryCache,decideSessionBoundary} from '@/lib/auth/session-boundary';

const draft=(subject:string,content=''):MailComposerDraft=>({
 subject,content,images:[],targets:['h:fictional'],
 campaignDate:'1522-01-01',links:{origin:'fictional',court:'',unit:'',role:'executor'},
 week:'',signedBy:'',
});

afterEach(()=>clearMailComposerDrafts());

describe('volatilidade de rascunhos de missivas entre sessões',()=>{
 it('guarda texto apenas para a identidade de uma sessão ativa',()=>{
   writeMailComposerDraft('user-a:mail-compose',draft('Assunto A'));
   writeMailComposerDraft('user-b:mail-compose',draft('Assunto B'));
   expect(readMailComposerDraft('user-a:mail-compose')?.subject).toBe('Assunto A');
   expect(readMailComposerDraft('user-b:mail-compose')?.subject).toBe('Assunto B');
   expect(hasUnsavedMailComposerDraft('user-a:mail-compose')).toBe(true);
   discardMailComposerDraft('user-a:mail-compose');
   expect(readMailComposerDraft('user-a:mail-compose')).toBeUndefined();
   expect(readMailComposerDraft('user-b:mail-compose')?.subject).toBe('Assunto B');
 });
 it('a saída e a troca de conta purgam textos privados e cache de consultas',()=>{
   writeMailComposerDraft('user-a:mail-compose',draft('Privado','Corpo sensível'));
   writeMailComposerDraft('user-b:mail-compose',draft('Outro'));
   for(const event of ['SIGNED_OUT','SIGNED_IN'] as const){
     const decision=decideSessionBoundary('user-a',event,
       event==='SIGNED_OUT'?null:'user-b');
     expect(decision.clearPrivateCache).toBe(true);
     const clear=vi.fn();
     clearSessionQueryCache({clear});
     expect(clear).toHaveBeenCalledOnce();
     expect(readMailComposerDraft('user-a:mail-compose')).toBeUndefined();
     expect(readMailComposerDraft('user-b:mail-compose')).toBeUndefined();
     writeMailComposerDraft('user-a:mail-compose',draft('Voltou'));
   }
 });
 it('rascunho vazio não ativa alerta de saída e imagens pendentes são tratadas como rascunho',()=>{
   writeMailComposerDraft('u:mail-compose',draft(''));
   expect(hasUnsavedMailComposerDraft('u:mail-compose')).toBe(false);
   const imageOnly:MailComposerDraft={...draft(''),images:[{} as MailComposerDraft['images'][number]]};
   writeMailComposerDraft('u:mail-compose',imageOnly);
   expect(hasUnsavedMailComposerDraft('u:mail-compose')).toBe(true);
   clearMailComposerDrafts();
   expect(readMailComposerDraft('u:mail-compose')).toBeUndefined();
 });
});

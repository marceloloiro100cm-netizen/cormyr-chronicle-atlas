const t=(table,rows,columns)=>({table,rows,columns:columns||(
  rows.length?Object.keys(rows[0]):['id'])});
const reply=(id,overrides={})=>({
  id,letter_id:'l1',author_user_id:'alice',recipient_user_id:'bob',
  author_name:'Test author',content:'Confidential test response',
  publication_state:'delivered',deleted_at:null,created_at:'2026-11-12 11:00:00+00',
  version:'1',...overrides,
});
export function syntheticMailHistory(){
  return [
    t('auth.users',[
      {id:'narrator'},{id:'alice'},{id:'bob'},{id:'editor'},
    ]),
    t('public.campaign_letters',[
      {id:'l1',sender_user_id:'narrator',recipient_player_id:null,
       recipient_house_id:'a',publication_state:'delivered',deleted_at:null},
      {id:'l-draft',sender_user_id:'alice',recipient_player_id:null,
       recipient_house_id:'b',publication_state:'draft',deleted_at:null},
      {id:'l-ambiguous',sender_user_id:'alice',recipient_player_id:null,
       recipient_house_id:null,publication_state:'delivered',deleted_at:null},
    ]),
    t('public.letter_replies',[
      reply('r1'),
      reply('r2',{publication_state:'draft'}),
      reply('r3',{publication_state:'scheduled'}),
      reply('r4',{deleted_at:'2026-11-12 13:00:00+00'}),
      reply('r5',{letter_id:'l-draft'}),
      reply('r6',{recipient_user_id:'deleted-user'}),
      reply('r7',{letter_id:'missing-parent'}),
      reply('r8',{letter_id:'l-ambiguous'}),
    ]),
    t('public.letter_receipts',[
      {letter_id:'l1',user_id:'alice',read_at:'2026-11-12 12:00:00+00'},
      {letter_id:'l1',user_id:'bob',read_at:'2026-11-12 13:00:00+00'},
    ]),
    t('public.letter_versions',[
      {id:'lv1',letter_id:'l1',version:'1',snapshot:'{"secret":true}'},
    ]),
    t('public.letter_reply_versions',[
      {id:'rv1',reply_id:'r1',version:'1',snapshot:'{"secret":true}'},
    ]),
    t('public.letter_rounds',[
      {number:'3',closed:'f',status:'open',harptos_period:'1522-01:desdia-1'},
    ]),
    t('public.mail_submissions',[
      {id:'ms1',author_user_id:'alice',request:'{"secret":true}'},
    ]),
    t('public.narrator_mail_notes',[
      {id:'letter:l1',letter_id:'l1',notes:'{"execucao":"secret"}'},
    ]),
    t('public.campaign_letter_consequences',[
      {id:'co1',letter_id:'l1',private_effect:'secret'},
    ]),
  ];
}

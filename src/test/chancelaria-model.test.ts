import {describe,expect,it} from 'vitest';
import {buildConversations,canReplyTo,conversationNoAction,conversationUnread,isActionableTurn,lastAuthor,queueMembers,yourTurnCount,type MailRow,type ReplyRow} from '@/components/players/chancelaria/chancelaria-model';

const h=(c:string)=>c.repeat(64);
const N='narrador-uid',P='jogador-uid';
const base={sync_state:'synced',last_synced_at:null,letter_number:null,letter_kind:'reservada' as const,recipient_player_id:null,source:'firebase-cloud',publication_state:'delivered'};
const root:MailRow={...base,id:h('a'),sender_user_id:N,sender_name:'Narrador',origin_house_id:null,recipient_house_id:'fewmerry',
  subject:'Convocação',content:'Venha',created_at:'2026-11-10T10:00:00Z',delivered_at:'2026-11-10T10:00:00Z',conversation_id:h('a'),delivery_week:5};
const answer:MailRow={...base,id:h('b'),sender_user_id:P,sender_name:'Casa Fewmerry',origin_house_id:'fewmerry',recipient_house_id:null,
  subject:'Re: Convocação',content:'Iremos',created_at:'2026-11-11T10:00:00Z',delivered_at:'2026-11-11T10:00:00Z',conversation_id:h('a'),delivery_week:5};
const entre:MailRow={...base,id:h('c'),sender_user_id:P,sender_name:'Casa Fewmerry',origin_house_id:'fewmerry',recipient_house_id:'goldfin',
  subject:'Aliança',content:'...',created_at:'2026-11-12T10:00:00Z',delivered_at:'2026-11-12T10:00:00Z',conversation_id:h('c'),delivery_week:5};
const edit=new Set(['fewmerry']);

describe('Chancelaria: modelo de filas e fios',()=>{
  it('agrupa a resposta Cloud no fio da carta raiz',()=>{
    const list=buildConversations([root,answer,entre],[]);
    expect(list).toHaveLength(2);
    const c=list.find(x=>x.root.id===root.id)!;
    expect(c.items.map(i=>i.id)).toEqual([answer.id]);
    expect(c.kind).toBe('narrador');
    expect(lastAuthor(c)).toBe(P);
  });
  it('leitura só conta quando marcada',()=>{
    const [c]=buildConversations([root],[]);
    expect(conversationUnread(c!,{uid:P,admin:false,receipts:[],openRound:5})).toBe(true);
    expect(conversationUnread(c!,{uid:P,admin:false,receipts:[{letter_id:root.id,user_id:P,read_at:'2026-11-10T11:00:00Z'}],openRound:5})).toBe(false);
  });
  it('o próprio envio nunca aparece como não lido para o autor',()=>{
    const [c]=buildConversations([root],[]);
    expect(conversationUnread(c!,{uid:N,admin:true,receipts:[],openRound:5})).toBe(false);
  });
  it('resposta histórica nova reabre a carta já lida',()=>{
    const reply:ReplyRow={id:'r1',letter_id:root.id,author_user_id:N,author_name:'Narrador',content:'Mais',created_at:'2026-11-12T00:00:00Z',delivered_at:'2026-11-12T00:00:00Z',publication_state:'delivered'};
    const [c]=buildConversations([root],[reply]);
    const ctx={uid:P,admin:false,receipts:[{letter_id:root.id,user_id:P,read_at:'2026-11-11T00:00:00Z'}],openRound:5};
    expect(conversationUnread(c!,ctx)).toBe(true);
    expect(c!.items[0]!.isNewFor(ctx)).toBe(true);
  });
  it('espelha a rota de resposta do servidor',()=>{
    expect(canReplyTo(root,P,false,edit)).toBe(true);
    expect(canReplyTo(root,P,false,new Set())).toBe(false);
    expect(canReplyTo(answer,N,true,new Set())).toBe(true);
    expect(canReplyTo(entre,N,true,new Set())).toBe(false);
    expect(canReplyTo({...root,source:'legacy'},P,false,edit)).toBe(false);
    expect(canReplyTo({...root,publication_state:'scheduled'},P,false,edit)).toBe(false);
  });
  it('filas do jogador e do Narrador',()=>{
    const list=buildConversations([root,answer,entre,{...entre,id:h('d'),conversation_id:h('d'),publication_state:'scheduled',delivery_week:6}],[]);
    const player={uid:P,admin:false,receipts:[],openRound:5,editHouses:edit};
    const narrator={uid:N,admin:true,receipts:[],openRound:5,editHouses:new Set<string>()};
    expect(queueMembers('waiting',list,player).map(c=>c.root.id).sort()).toEqual([h('a'),h('c')]);
    expect(queueMembers('yourturn',list,narrator).map(c=>c.root.id)).toEqual([h('a')]);
    expect(queueMembers('mediation',list,narrator).map(c=>c.root.id).sort()).toEqual([h('c'),h('d')]);
    expect(queueMembers('scheduled',list,player).map(c=>c.root.id)).toEqual([h('d')]);
    expect(queueMembers('attention',list,narrator).map(c=>c.root.id).sort()).toEqual([h('a'),h('c')]);
  });
  it('conversa importada recebe resposta Cloud na mesma raiz e fica em Sua vez',()=>{
    const legacy={...root,id:'letter-imported-1',source:'imported',
      conversation_id:'letter-imported-1'};
    const cloud={...answer,conversation_id:legacy.id};
    const [c]=buildConversations([legacy,cloud],[]);
    expect(c?.items.map(i=>i.id)).toEqual([answer.id]);
    expect(c?.replyTarget(N,true,new Set())).toBe(answer.id);
    expect(queueMembers('yourturn',[c!],{
      uid:N,admin:true,receipts:[],openRound:5,editHouses:new Set(),
    })).toHaveLength(1);
    expect(c?.replyTarget(P,false,edit)).toBe(legacy.id);
  });
  it('permite resposta ao reply importado somente ao destinatário no fio',()=>{
    const old={...root,id:'legacy-root-1',source:'imported'};
    const legacyReply:ReplyRow={id:'legacy-reply-1',letter_id:old.id,
      author_user_id:P,author_name:'Casa Fewmerry',recipient_user_id:N,
      content:'Carta recebida',created_at:'2026-11-15T12:00:00Z',
      delivered_at:'2026-11-15T12:00:00Z',publication_state:'delivered'};
    const [c]=buildConversations([old],[legacyReply]);
    expect(c?.replyTarget(N,true,new Set())).toBe(old.id);
    expect(c?.replyToHistoricalId(N,true,new Set())).toBe(legacyReply.id);
    expect(c?.replyTarget('intruso',false,new Set())).toBeNull();
  });
  it('resposta do jogador em carta geral da Semana 2 entra em Sua vez do Narrador e continua respondível',()=>{
    const general:MailRow={...root,id:'cavaleiro-bandido-legada',
      source:'imported',sender_user_id:N,origin_house_id:null,
      recipient_house_id:null,letter_kind:'geral',
      conversation_id:'cavaleiro-bandido-legada',delivery_week:2};
    const legacy:ReplyRow={id:'resposta-ashkar-27-10',
      letter_id:general.id,author_user_id:P,recipient_user_id:N,
      author_name:'Casa Ashkar',content:'Envio dois soldados ao amanhecer',
      created_at:'2026-11-15T12:00:00Z',delivered_at:'2026-11-15T12:00:00Z',
      publication_state:'delivered'};
    const [c]=buildConversations([general],[legacy]);
    const narrator={uid:N,admin:true,receipts:[],openRound:3,editHouses:new Set<string>()};
    expect(lastAuthor(c!)).toBe(P);
    expect(c!.replyTarget(N,true,new Set())).toBe(general.id);
    expect(c!.replyToHistoricalId(N,true,new Set())).toBe(legacy.id);
    expect(queueMembers('yourturn',[c!],narrator)).toEqual([c]);
    expect(c!.replyTarget('outro',false,new Set())).toBeNull();
  });
  it('permite Narrador atual responder a resposta endereçada ao Narrador histórico, mas não a terceiros',()=>{
    const general:MailRow={...root,id:'cavaleiro-bandido-2',
      source:'imported',sender_user_id:'narrador-historico',
      origin_house_id:null,recipient_house_id:'ashkar',
      letter_kind:'geral',conversation_id:'cavaleiro-bandido-2',delivery_week:2};
    const legacy:ReplyRow={id:'resposta-legada-2',letter_id:general.id,
      author_user_id:P,recipient_user_id:'narrador-historico',
      author_name:'Casa Ashkar',created_at:'2026-11-15T12:00:00Z',
      publication_state:'delivered'};
    const [c]=buildConversations([general],[legacy]);
    expect(c!.replyToHistoricalId(N,true,new Set())).toBe(legacy.id);
    expect(queueMembers('yourturn',[c!],{
      uid:N,admin:true,receipts:[],openRound:3,editHouses:new Set(),
    })).toHaveLength(1);
    const forged={...legacy,recipient_user_id:'terceiro'};
    const [wrong]=buildConversations([general],[forged]);
    expect(wrong!.replyToHistoricalId(N,true,new Set())).toBeNull();
  });
  it('envios em lote do Narrador não se fundem num só fio',()=>{
    const a={...root,batch_key:'lote'},b={...root,id:h('e'),recipient_house_id:'goldfin',batch_key:'lote'};
    expect(buildConversations([a,b],[])).toHaveLength(2);
  });
  it('carta excluída só aparece na Lixeira',()=>{
    const list=buildConversations([{...entre,deleted_at:'2026-11-12T12:00:00Z',removal_kind:'cancelada'}],[]);
    const ctx={uid:P,admin:false,receipts:[],openRound:5};
    expect(queueMembers('all',list,ctx)).toHaveLength(0);
    expect(queueMembers('trash',list,ctx)).toHaveLength(1);
  });
  it('Sem ação remove a conversa de Sua vez e da contagem, mantém em Todas e reabre se chegar nova resposta',()=>{
    const list=buildConversations([root,answer],[]);
    const narratorBase={uid:N,admin:true,receipts:[],openRound:5,editHouses:new Set<string>()};
    expect(queueMembers('yourturn',list,narratorBase)).toHaveLength(1);
    expect(yourTurnCount([root,answer],[],[],N,true,5,new Set())).toBe(1);
    expect(isActionableTurn(list[0]!,narratorBase)).toBe(true);
    // Narrador marca como Sem ação depois da última mensagem (11/11 10:00).
    const noActionReceipts=[{letter_id:root.id,user_id:N,read_at:'2026-11-11T12:00:00Z',no_action_at:'2026-11-11T12:00:00Z'}];
    const narratorDismissed={...narratorBase,receipts:noActionReceipts};
    expect(conversationNoAction(list[0]!,narratorDismissed)).toBe(true);
    expect(queueMembers('yourturn',list,narratorDismissed)).toHaveLength(0);
    expect(queueMembers('all',list,narratorDismissed)).toHaveLength(1);
    expect(yourTurnCount([root,answer],[],noActionReceipts,N,true,5,new Set())).toBe(0);
    // Se chegar uma resposta mais nova depois de no_action_at, volta para Sua vez automaticamente.
    const newerReply:MailRow={...answer,id:h('f'),created_at:'2026-11-12T08:00:00Z',delivered_at:'2026-11-12T08:00:00Z'};
    const updated=buildConversations([root,answer,newerReply],[]);
    expect(conversationNoAction(updated[0]!,narratorDismissed)).toBe(false);
    expect(queueMembers('yourturn',updated,narratorDismissed)).toHaveLength(1);
    expect(yourTurnCount([root,answer,newerReply],[],noActionReceipts,N,true,5,new Set())).toBe(1);
    // Jogador também pode dispensar com Sem ação uma carta recebida do Narrador.
    const playerOnly=buildConversations([root],[]);
    const pReceipts=[{letter_id:root.id,user_id:P,read_at:'2026-11-10T11:00:00Z',no_action_at:'2026-11-10T11:00:00Z'}];
    expect(yourTurnCount([root],[],[],P,false,5,edit)).toBe(1);
    expect(yourTurnCount([root],[],pReceipts,P,false,5,edit)).toBe(0);
    expect(queueMembers('all',playerOnly,{uid:P,admin:false,receipts:pReceipts,openRound:5,editHouses:edit})).toHaveLength(1);
  });
});

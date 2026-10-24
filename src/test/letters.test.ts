import { describe, expect, it } from 'vitest';
import { filterLetters, groupReceivedLetters, isLetterRead, nextLetterNumber, pendingRoundHouses, sentLetters, unreadReceivedCount, type LetterRow } from '@/lib/letters';

const row = (over: Partial<LetterRow>): LetterRow => ({
  id: crypto.randomUUID(),
  sender_user_id: 'narrador',
  sender_name: 'Mestre',
  recipient_house_id: 'erdenor',
  recipient_player_id: null,
  subject: 'Assunto',
  content: 'Conteúdo',
  created_at: '2026-10-01T00:00:00Z',
  sync_state: 'pending',
  last_synced_at: null,
  letter_number: 1,
  letter_kind: 'geral',
  ...over,
});

describe('casas com respostas pendentes na rodada aberta',()=>{
  const houses=[{id:'ashkar',name:'Ashkar',active:true,season:2},{id:'grantass',name:'Grantass',active:true,season:2}];
  const players=[{id:'a',user_id:'ashkar-user',active:true},{id:'a2',user_id:'ashkar-user-2',active:true},{id:'g',user_id:'grantass-user',active:true}];
  const members=[{player_id:'a',house_id:'ashkar'},{player_id:'a2',house_id:'ashkar'},{player_id:'g',house_id:'grantass'}];
  const letter=row({id:'letter',recipient_house_id:'ashkar',letter_number:2,delivery_week:2,publication_state:'delivered',delivered_at:'2026-10-24T10:00:00Z'});
  const reply=(over={})=>({letter_id:'letter',author_user_id:'ashkar-user',author_player_id:'a' as string|null,house_id:'ashkar',publication_state:'delivered',delivery_week:2,created_at:'2026-10-24T11:00:00Z',...over});
  const pending=(letters:LetterRow[]=[letter],replies:ReturnType<typeof reply>[]=[],week:number|null=2)=>pendingRoundHouses(week,houses,players,members,letters,replies);
  it('lista uma casa uma vez e conta as missivas pendentes da Semana 2',()=>{expect(pending([letter,{...letter,id:'second'}])).toEqual([{id:'ashkar',name:'Ashkar',letterIds:['letter','second']}]);});
  it('não lista casas que não receberam missivas na rodada atual',()=>{expect(pending([{...letter,delivery_week:1,letter_number:1}])).toEqual([]);});
  it('uma resposta de qualquer jogador autorizado da casa resolve a pendência',()=>{expect(pending([letter],[reply({author_user_id:'ashkar-user-2',author_player_id:'a2'})])).toEqual([]);});
  it('respostas antigas, de outra casa ou programadas não resolvem a pendência',()=>{expect(pending([letter],[reply({delivery_week:1}),reply({author_user_id:'grantass-user',author_player_id:'g'}),reply({publication_state:'scheduled'})])).toHaveLength(1);});
  it('resposta do Narrador entregue na Semana 2 reabre pendência de fio da Semana 1',()=>{const old={...letter,letter_number:1,delivery_week:1};expect(pending([old],[reply({delivery_week:1}),reply({author_user_id:'narrador',author_player_id:null})])).toHaveLength(1);});
  it('resposta posterior da casa resolve a nova narrativa do fio antigo',()=>{const old={...letter,letter_number:1,delivery_week:1};expect(pending([old],[reply({author_user_id:'narrador',author_player_id:null}),reply({created_at:'2026-10-24T12:00:00Z'})])).toEqual([]);});
  it('não conta narrativas excluídas, futuras ou rascunhos',()=>{expect(pending([{...letter,deleted_at:'2026-10-24T12:00:00Z'},{...letter,publication_state:'scheduled'},{...letter,publication_state:'draft'}])).toEqual([]);});
  it('não mostra pendências sem rodada aberta',()=>{expect(pending([letter],[],null)).toEqual([]);});
  it('não conta jogador sem vínculo autorizado ou inativo',()=>{expect(pendingRoundHouses(2,houses,[{id:'a',user_id:'ashkar-user',active:false}],members,[letter],[])).toEqual([]);expect(pendingRoundHouses(2,houses,players,[],[letter],[])).toEqual([]);});
  it('não considera missiva de outro jogador como cobrança do Narrador',()=>{expect(pending([{...letter,sender_player_id:'g',sender_user_id:'grantass-user'}])).toEqual([]);});
});

describe('groupReceivedLetters', () => {
  it('agrupa por número, do mais recente para o mais antigo', () => {
    const letters = [row({ letter_number: 1 }), row({ letter_number: 2 }), row({ letter_number: 1 })];
    const groups = groupReceivedLetters(letters, 'jogador');
    expect(groups.map((g) => g.number)).toEqual([2, 1]);
    expect(groups[1]?.letters).toHaveLength(2);
  });

  it('exclui as missivas escritas pelo próprio usuário', () => {
    const letters = [row({ sender_user_id: 'jogador', letter_number: null }), row({ letter_number: 1 })];
    const groups = groupReceivedLetters(letters, 'jogador');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.letters).toHaveLength(1);
  });

  it('mantém missivas sem número em grupo próprio', () => {
    const groups = groupReceivedLetters([row({ letter_number: null })], 'jogador');
    expect(groups[0]?.number).toBeNull();
  });
});

describe('sentLetters', () => {
  it('retorna só as missivas do usuário, mais recentes primeiro', () => {
    const letters = [
      row({ sender_user_id: 'jogador', created_at: '2026-10-01T00:00:00Z' }),
      row({ sender_user_id: 'jogador', created_at: '2026-10-03T00:00:00Z' }),
      row({}),
    ];
    const mine = sentLetters(letters, 'jogador');
    expect(mine).toHaveLength(2);
    expect(mine[0]?.created_at).toBe('2026-10-03T00:00:00Z');
  });
});

describe('nextLetterNumber', () => {
  it('é um a mais que o maior número existente', () => {
    expect(nextLetterNumber([row({ letter_number: 1 }), row({ letter_number: 3 })])).toBe(4);
  });

  it('começa em 1 quando não há missivas numeradas', () => {
    expect(nextLetterNumber([row({ letter_number: null })])).toBe(1);
    expect(nextLetterNumber([])).toBe(1);
  });
});

describe('Narrator management filters',()=>{
  const context={userId:'narrador',admin:true,players:[{id:'player',user_id:'jogador',roster_house_id:'ashkar'}],receipts:[] as {letter_id:string;user_id:string}[]};
  it('filters by the house of a player writing to the Narrator',()=>{const incoming=row({sender_user_id:'jogador',sender_player_id:'player',recipient_house_id:null});expect(filterLetters([incoming,row({})],[],{number:'',kind:'',answered:'',house:'ashkar'},context)).toEqual([incoming]);});
  it('filters unread outgoing letters using player receipts rather than narrator receipts',()=>{const a=row({id:'a'}),b=row({id:'b'});const ctx={...context,receipts:[{letter_id:'a',user_id:'narrador'},{letter_id:'b',user_id:'jogador'}]};expect(filterLetters([a,b],[],{number:'',kind:'',answered:'',read:'no'},ctx)).toEqual([a]);});
  it('filters unread incoming letters using the narrator receipt',()=>{const a=row({id:'a',sender_user_id:'jogador'}),b=row({id:'b',sender_user_id:'jogador'});const ctx={...context,receipts:[{letter_id:'a',user_id:'jogador'},{letter_id:'b',user_id:'narrador'}]};expect(filterLetters([a,b],[],{number:'',kind:'',answered:'',read:'no'},ctx)).toEqual([a]);});
  it('combines house, number, reserved type and unanswered filters',()=>{const a=row({id:'a',letter_kind:'reservada',letter_number:2});const b=row({id:'b',letter_kind:'reservada',letter_number:2});expect(filterLetters([a,b,row({})],[{letter_id:'b'}],{house:'erdenor',number:'2',kind:'reservada',answered:'no'},context)).toEqual([a]);});
});

describe('leitura com respostas novas',()=>{
  const receipt={letter_id:'a',user_id:'jogador',read_at:'2026-10-20T10:00:00Z'};
  it('missiva lida sem respostas continua lida',()=>{expect(isLetterRead('a',receipt,[])).toBe(true);});
  it('resposta mais nova que a leitura torna a missiva não lida',()=>{expect(isLetterRead('a',receipt,[{letter_id:'a',created_at:'2026-10-21T09:00:00Z'}])).toBe(false);});
  it('leitura depois da resposta mantém a missiva lida',()=>{expect(isLetterRead('a',receipt,[{letter_id:'a',created_at:'2026-10-19T09:00:00Z'}])).toBe(true);});
  it('sem registro de leitura, a missiva é não lida',()=>{expect(isLetterRead('a',undefined,[])).toBe(false);});
  it('filtro de não lidas inclui missiva lida com resposta posterior',()=>{
    const context={userId:'jogador',admin:false,players:[],receipts:[receipt]};
    const a=row({id:'a',sender_user_id:'narrador'});
    expect(filterLetters([a],[{letter_id:'a',created_at:'2026-10-21T09:00:00Z'}],{number:'',kind:'',answered:'',read:'no'},context)).toEqual([a]);
    expect(filterLetters([a],[{letter_id:'a',created_at:'2026-10-19T09:00:00Z'}],{number:'',kind:'',answered:'',read:'no'},context)).toEqual([]);
  });
});

describe('contador de missivas não lidas',()=>{
  it('conta as missivas recebidas sem leitura registrada',()=>{
    expect(unreadReceivedCount([row({id:'a'}),row({id:'b',letter_number:2})],[],[],'jogador')).toBe(2);
  });
  it('não conta missivas escritas pelo próprio usuário',()=>{
    expect(unreadReceivedCount([row({id:'a',sender_user_id:'jogador'}),row({id:'b'})],[],[],'jogador')).toBe(1);
  });
  it('ignora excluídas, rascunhos e programadas',()=>{
    const letters=[row({id:'a',deleted_at:'2026-10-22T10:00:00Z'}),row({id:'b',publication_state:'draft'}),row({id:'c',publication_state:'scheduled'}),row({id:'d',publication_state:'delivered'})];
    expect(unreadReceivedCount(letters,[],[],'jogador')).toBe(1);
  });
  it('deixa de contar a missiva marcada como lida',()=>{
    const letters=[row({id:'a',publication_state:'delivered'})];
    const receipts=[{letter_id:'a',user_id:'jogador',read_at:'2026-10-20T10:00:00Z'}];
    expect(unreadReceivedCount(letters,[],receipts,'jogador')).toBe(0);
  });
  it('volta a contar quando chega resposta mais nova que a leitura',()=>{
    const letters=[row({id:'a',publication_state:'delivered'})];
    const receipts=[{letter_id:'a',user_id:'jogador',read_at:'2026-10-20T10:00:00Z'}];
    expect(unreadReceivedCount(letters,[{letter_id:'a',created_at:'2026-10-21T09:00:00Z'}],receipts,'jogador')).toBe(1);
    expect(unreadReceivedCount(letters,[{letter_id:'a',created_at:'2026-10-19T09:00:00Z'}],receipts,'jogador')).toBe(0);
  });
  it('usa o registro de leitura do narrador para as missivas que ele recebeu',()=>{
    const letters=[row({id:'a',sender_user_id:'jogador',publication_state:'delivered'}),row({id:'b',sender_user_id:'jogador',publication_state:'delivered'})];
    const receipts=[{letter_id:'a',user_id:'jogador',read_at:'2026-10-20T10:00:00Z'},{letter_id:'b',user_id:'narrador',read_at:'2026-10-20T10:00:00Z'}];
    expect(unreadReceivedCount(letters,[],receipts,'narrador')).toBe(1);
  });
});

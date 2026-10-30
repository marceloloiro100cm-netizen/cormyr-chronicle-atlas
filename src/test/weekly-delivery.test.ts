import { describe, it, expect } from 'vitest';
import { replyDeliveryWeek, suggestNextLetterWeek, canExposeScheduledMessage } from '@/lib/weekly-delivery';
describe('semanas de participação', () => {
  it('resposta jogador-narrador permanece na Semana 1', () => expect(replyDeliveryWeek(1,'player-to-narrator')).toBe(1));
  it('resposta narrativa vai da Semana 1 para a 2', () => expect(replyDeliveryWeek(1,'narrator-to-player')).toBe(2));
  it('resposta Grantass para Ashkar vai da Semana 1 para a 2', () => expect(replyDeliveryWeek(1,'player-to-player')).toBe(2));
  it('próxima resposta de Ashkar vai da Semana 2 para a 3', () => expect(replyDeliveryWeek(2,'player-to-player')).toBe(3));
  it('não permite participação sem semana válida', () => expect(()=>replyDeliveryWeek(0,'player-to-player')).toThrow());
  it('destinatário não vê programada', () => expect(canExposeScheduledMessage('scheduled',false,false)).toBe(false));
  it('autor pode consultar a própria programada', () => expect(canExposeScheduledMessage('scheduled',false,true)).toBe(true));
  it('narrador pode consultar rascunho', () => expect(canExposeScheduledMessage('draft',true,false)).toBe(true));
  it('encerramento não retira entrega', () => expect(canExposeScheduledMessage('delivered',false,false)).toBe(true));
});
describe('sugestão da semana de missivas do Narrador (lote 1)',()=>{
 it('sem rodadas, sugere a primeira semana',()=>expect(suggestNextLetterWeek([])).toBe(1));
 it('com a semana 2 aberta, sugere semana 3',()=>expect(suggestNextLetterWeek([{number:1,status:'closed'},{number:2,status:'open'}])).toBe(3));
 it('entre as semanas 2 e 3, ainda sugere 3',()=>expect(suggestNextLetterWeek([{number:1,status:'closed'},{number:2,status:'closed'}])).toBe(3));
 it('não avança a sugestão depois de compor várias cartas na mesma semana',()=>{
   const rounds=[{number:1,status:'closed'},{number:2,status:'closed'}];
   const letters=[{letter_number:3},{letter_number:3},{letter_number:4},{letter_number:6}];
   for(const letter of letters) {
     expect(letter.letter_number).toBeGreaterThanOrEqual(3);
     expect(suggestNextLetterWeek(rounds)).toBe(3);
   }
 });
 it('não considera rodadas inválidas ou fora da sequência como data das cartas',()=>{
   expect(suggestNextLetterWeek([{number:2,status:'closed'},{number:NaN,status:'open'}])).toBe(3);
 });
});

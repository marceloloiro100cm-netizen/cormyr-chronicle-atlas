import { describe, it, expect } from 'vitest';
import { replyDeliveryWeek, canExposeScheduledMessage } from '@/lib/weekly-delivery';
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
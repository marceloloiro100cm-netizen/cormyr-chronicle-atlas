import {describe,it,expect} from 'vitest';
import {mailSubmissionStatus} from '@/components/players/mail-compose';
const msg=(state:string,week:number|null=4,duplicate=false)=>mailSubmissionStatus({state,week,duplicate,ids:['a','b']});
describe('lote 6: confirmações de envio e agendamento',()=>{
 it('distingue rascunhos das mensagens programadas',()=>{
  expect(msg('draft')).toContain('Rascunho salvo para 2');
  expect(msg('draft')).not.toContain('programad');
 });
 it('distingue entrega na semana aberta de programação futura',()=>{
  expect(msg('delivered',3)).toContain('entregue imediatamente na Semana 3 (aberta)');
  expect(msg('scheduled',4)).toContain('programada para a Semana 4');
 });
 it('retentativas idempotentes não afirmam novo envio',()=>{
  expect(msg('delivered',3,true)).toContain('nenhuma cópia duplicada');
 });
});

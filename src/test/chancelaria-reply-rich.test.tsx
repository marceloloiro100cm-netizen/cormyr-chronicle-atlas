import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {ChancelariaReplyComposer,type ReplySubmitPayload} from '@/components/players/chancelaria/ChancelariaReplyComposer';

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();});

describe('ChancelariaReplyComposer: data da désdia, imagens e semana',()=>{
 it('permite escolher dia 24 dentro da 3ª désdia de Marpenoth e anexar imagem ao responder',async()=>{
  const onSubmit=vi.fn<(payload:ReplySubmitPayload)=>Promise<boolean>>(async()=>true);
  render(<ChancelariaReplyComposer
   textareaId="test-reply"
   placeholder="Responder como Narrador…"
   draftKey="test:reply:1"
   today="1522-10-21"
   admin={true}
   busy={false}
   defaultDeliveryWeek={3}
   recentSigs={['Conselho de Suzail']}
   note="Chega na Semana 3"
   onSubmit={onSubmit}
  />);

  // Abre seletor rápido da désdia (dias 21 a 30) e escolhe o dia 24.
  fireEvent.click(screen.getByRole('button',{name:/21 de Marpenoth/i}));
  const picker=within(screen.getByRole('group',{name:'Data da resposta'}));
  expect(picker.getByRole('button',{name:/21 de Marpenoth · 1522 CV/i})).toBeInTheDocument();
  expect(picker.getByRole('button',{name:/30 de Marpenoth · 1522 CV/i})).toBeInTheDocument();
  fireEvent.click(picker.getByRole('button',{name:/24 de Marpenoth · 1522 CV/i}));
  expect(picker.getByRole('button',{name:/24 de Marpenoth · 1522 CV/i})).toHaveAttribute('aria-pressed','true');

  // Abre o seletor de imagens e anexa uma imagem válida.
  fireEvent.click(screen.getByRole('button',{name:/Anexar imagem/i}));
  const file=new File([new Uint8Array([137,80,78,71])],'mapa.png',{type:'image/png'});
  fireEvent.change(screen.getByLabelText('Adicionar imagens'),{target:{files:[file]}});
  expect(screen.getByRole('button',{name:/1 imagem/i})).toBeInTheDocument();

  // Define semana de entrega opcional (Narrador), assinatura e texto.
  fireEvent.change(screen.getByLabelText('Semana de entrega da resposta'),{target:{value:'4'}});
  fireEvent.change(screen.getByLabelText('Texto da resposta'),{target:{value:'Relatório do dia 24 com mapa anexo.'}});
  fireEvent.click(screen.getByRole('button',{name:'Conselho de Suzail'}));
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));

  await waitFor(()=>expect(onSubmit).toHaveBeenCalledTimes(1));
  const payload=onSubmit.mock.calls[0]![0]!;
  expect(payload.campaignDate).toBe('1522-10-24');
  expect(payload.deliveryWeek).toBe(4);
  expect(payload.signedBy).toBe('Conselho de Suzail');
  expect(payload.draft).toBe(false);
  expect(payload.images).toHaveLength(1);
  expect(payload.images[0]!.file.name).toBe('mapa.png');
 });

 it('jogador vê os 10 dias da désdia e anexo de imagem, mas sem seletor de semana nem calendário fora da désdia',()=>{
  render(<ChancelariaReplyComposer
   textareaId="player-reply"
   placeholder="Escreva sua resposta…"
   draftKey="test:reply:2"
   today="1522-10-21"
   admin={false}
   busy={false}
   note="Rascunho automático"
   onSubmit={vi.fn(async()=>true)}
  />);

  expect(screen.queryByLabelText('Semana de entrega da resposta')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/21 de Marpenoth/i}));
  expect(screen.getByRole('button',{name:/22 de Marpenoth · 1522 CV/i})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/Outro mês/i})).toBeNull();
  expect(screen.getByRole('button',{name:/Anexar imagem/i})).toBeInTheDocument();
 });
});

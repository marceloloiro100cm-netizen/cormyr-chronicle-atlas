import {describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {NewspaperEngravings} from './NewspaperEngravings';

describe('Gravuras do Reino: selecionar e enviar',()=>{
 it('limpa o erro anterior ao escolher arquivo e envia exatamente o File selecionado',async()=>{
  const upload=vi.fn(async()=>true);
  render(<NewspaperEngravings items={[]} busy={false}
   onUpload={upload} onToggle={vi.fn()} onDelete={vi.fn()} onRestore={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Enviar gravura'}));
  expect(screen.getByRole('alert').textContent).toContain('Escolha uma imagem');
  const file=new File(['imagem'],'Grandragon.png',{type:'image/png'});
  fireEvent.change(screen.getByLabelText('Selecionar gravura'),{target:{files:[file]}});
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('Grandragon.png')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('Ex.: Torre de Suzail'),{target:{value:'Gravura Grandragon'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar gravura'}));
  await waitFor(()=>expect(upload).toHaveBeenCalledWith(file,'Gravura Grandragon',expect.stringMatching(/^[a-f0-9-]{36}$/)));
  await waitFor(()=>expect(screen.getByText('Escolher imagem')).toBeTruthy());
  expect(upload).toHaveBeenCalledTimes(1);
 });
 it('preserva seleção quando o armazenamento falha, permitindo repetir sem perder o arquivo',async()=>{
  const upload=vi.fn(async(_file:File,_name:string,_key?:string)=>false);
  render(<NewspaperEngravings items={[]} busy={false}
   onUpload={upload} onToggle={vi.fn()} onDelete={vi.fn()} onRestore={vi.fn()}/>);
  const file=new File(['imagem'],'Grandragon.png',{type:'image/png'});
  fireEvent.change(screen.getByLabelText('Selecionar gravura'),{target:{files:[file]}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar gravura'}));
  await waitFor(()=>expect(upload).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Grandragon.png')).toBeTruthy();
  const key=upload.mock.calls[0]![2];
  fireEvent.click(screen.getByRole('button',{name:'Enviar gravura'}));
  await waitFor(()=>expect(upload).toHaveBeenCalledTimes(2));
  expect(upload.mock.calls[1]![2]).toBe(key);
 });
});

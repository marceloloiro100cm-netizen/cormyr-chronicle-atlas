import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {BattleGotGame} from '@/components/battle/BattleGotGame';
import {decodeGotLabSave,GOT_LAB_SAVE_KEY} from '@/lib/battle/got/lab-save';

afterEach(()=>{cleanup();vi.restoreAllMocks();window.localStorage.clear();});
describe('Aceitação da interface: preparar, posicionar, salvar e retomar',()=>{
 it('abre batalha de 14 tropas, salva estado e retoma no mesmo navegador',()=>{
  render(<BattleGotGame onBack={vi.fn()}/>);
  fireEvent.click(screen.getByText('Personalizar tropas, heróis e mapa'));
  expect(screen.getByRole('region',{name:'Preparar campo de guerra'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Unidades adicionais por lado/),{
   target:{value:'5'},
  });
  fireEvent.click(screen.getByRole('button',{name:/Iniciar simulação pelo livro/}));
  expect(screen.getByRole('heading',{name:'Escaramuça de treinamento'}))
   .toBeInTheDocument();
  fireEvent.click(screen.getByText('Salvar ou retomar'));
  fireEvent.click(screen.getByRole('button',{name:'Salvar simulação neste navegador'}));
  const json=window.localStorage.getItem(GOT_LAB_SAVE_KEY);
  expect(json).not.toBeNull();
  const restored=decodeGotLabSave(json!);
  expect(restored.units).toHaveLength(14);
  vi.spyOn(window,'confirm').mockReturnValue(true);
  fireEvent.click(screen.getByRole('button',{name:'Retomar simulação salva'}));
  expect(screen.getByText(/Simulação retomada/)).toBeInTheDocument();
 });
 it('editor do mapa impede sobreposição, mas permite posição personalizada',()=>{
  render(<BattleGotGame onBack={vi.fn()}/>);
  fireEvent.click(screen.getByText('Personalizar tropas, heróis e mapa'));
  fireEvent.change(screen.getByLabelText('Editar mapa'),{target:{value:'deploy'}});
  fireEvent.click(screen.getByRole('button',{name:/Quadrado 6,3/}));
  fireEvent.click(screen.getByRole('button',{name:/Iniciar simulação pelo livro/}));
  const map=screen.getByRole('region',{name:/Mapa em quadrados/});
  expect(map).toBeInTheDocument();
  expect(within(map).getByRole('button',{name:/Quadrado 6,3.*Vanguarda atacante/}))
   .toBeInTheDocument();
 });
 it('oculta a faixa informativa do laboratório e mantém a ação compacta de voltar',()=>{
  const onBack=vi.fn();
  render(<BattleGotGame onBack={onBack}/>);
  expect(screen.queryByRole('heading',{name:/Game of Thrones/})).toBeNull();
  expect(screen.queryByText(/Laboratório do capítulo 10/)).toBeNull();
  expect(screen.queryByText(/Laboratório isolado do Adaptado/)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Voltar ao módulo'}));
  expect(onBack).toHaveBeenCalledOnce();
 });
});

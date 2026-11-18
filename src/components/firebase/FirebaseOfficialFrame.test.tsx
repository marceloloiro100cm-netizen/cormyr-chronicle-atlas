import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FirebaseOfficialFrame,FirebaseOfficialHome,firebaseOfficialModules}
  from './FirebaseOfficialFrame';

afterEach(cleanup);

describe('official Firebase-only navigation',()=>{
  it('restores the Narrator workspace and navigates directly to HUB, Casas and Missivas',()=>{
    const onSelect=vi.fn();
    const onSignOut=vi.fn();
    render(<FirebaseOfficialFrame profile="narrador" active="hub"
      onSelect={onSelect} onSignOut={onSignOut}>
      <p>Conteúdo privado permitido pelo Firebase</p>
    </FirebaseOfficialFrame>);
    expect(screen.getByRole('heading',{name:'HUB Temporal'})).toBeTruthy();
    expect(screen.getByRole('navigation',{name:'Navegação oficial da campanha'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'HUB Temporal'}).getAttribute('aria-current'))
      .toBe('page');
    fireEvent.click(screen.getByRole('button',{name:'Missivas'}));
    expect(onSelect).toHaveBeenCalledWith('missivas');
    fireEvent.click(screen.getByRole('button',{name:'Casas nobres'}));
    expect(onSelect).toHaveBeenCalledWith('casas');
    fireEvent.click(screen.getByRole('button',{name:'Sair'}));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Conteúdo privado permitido pelo Firebase')).toBeTruthy();
  });

  it('never offers narrator controls to player or editorial profiles',()=>{
    expect(firebaseOfficialModules('jogador')).not.toContain('hub');
    expect(firebaseOfficialModules('jogador')).not.toContain('administracao');
    expect(firebaseOfficialModules('editor')).not.toContain('casas');
    expect(firebaseOfficialModules('editor')).not.toContain('missivas');
    render(<FirebaseOfficialFrame profile="editor" active="jornal"
      onSelect={vi.fn()} onSignOut={vi.fn()}>
      <p>Jornal</p>
    </FirebaseOfficialFrame>);
    expect(screen.queryByRole('button',{name:'HUB Temporal'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Casas nobres'})).toBeNull();
    expect(screen.getByRole('button',{name:'A Folha Sem Selo'})).toBeTruthy();
  });

  it('shows a campaign home with functional shortcuts and real service labels',()=>{
    const select=vi.fn();
    render(<FirebaseOfficialHome profile="narrador"
      onSelect={select} mailAvailable={false}
      hasCalendar={true} hasHouses={true}/>);
    expect(screen.getByText('Correspondência em preparação')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Configurar o HUB Temporal'}));
    expect(select).toHaveBeenCalledWith('hub');
    fireEvent.click(screen.getByRole('button',{name:/Missivas/}));
    expect(select).toHaveBeenCalledWith('missivas');
  });

  it('keeps the auth surface separate from role navigation',()=>{
    render(<FirebaseOfficialFrame profile={null} active="inicio"
      onSelect={vi.fn()} onSignOut={vi.fn()}>
      <p>Formulário de login Firebase</p>
    </FirebaseOfficialFrame>);
    expect(screen.queryByRole('navigation',{name:'Navegação oficial da campanha'})).toBeNull();
    expect(screen.getByText('Formulário de login Firebase')).toBeTruthy();
  });
});

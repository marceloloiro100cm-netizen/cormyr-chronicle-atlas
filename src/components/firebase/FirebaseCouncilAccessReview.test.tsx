import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {FirebaseCouncilAccessReview} from './FirebaseCouncilAccessReview';

afterEach(cleanup);
const houses=[{id:'casa-a',name:'Evenhand',season:2}];

describe('Revisão de acesso Firebase no Conselho',()=>{
  it('não renderiza nenhum controle para o jogador',()=>{
    const {container}=render(<FirebaseCouncilAccessReview
      narrator={false} houses={houses}/>);
    expect(container).toBeEmptyDOMElement();
  });
  it('renderiza a ferramenta existente apenas para o Narrador',()=>{
    render(<FirebaseCouncilAccessReview narrator houses={houses}/>);
    expect(screen.getByRole('region',{name:'Revisão de contas Firebase'}))
      .toBeInTheDocument();
    expect(screen.getByText('Contas pendentes do Firebase'))
      .toBeInTheDocument();
    expect(screen.getByText(/só fica disponível depois da homologação/))
      .toBeInTheDocument();
  });
});

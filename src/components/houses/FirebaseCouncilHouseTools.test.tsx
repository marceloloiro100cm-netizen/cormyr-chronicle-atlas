import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {FirebaseCouncilHouseTools} from './FirebaseCouncilHouseTools';
import {councilCloudRequest} from '@/lib/firebase-workspace/council-tools';

vi.mock('@/lib/firebase-workspace/council-tools',()=>({
  councilCloudRequest:vi.fn(),
}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const request=vi.mocked(councilCloudRequest);
function fakeData(narrator:boolean){
  request.mockImplementation(async(endpoint,body)=>{
    if(endpoint==='/api/firebase-cloud-read')
      return {id:'house-a',name:'Evenhand',state:{domains:[],holdings:[]}};
    if(endpoint==='/api/firebase-operational-economy')
      throw Error('feature_off');
    if(endpoint==='/api/firebase-cloud-treasury')
      return body['action']==='status'
        ?{enabled:true,canAdjust:false,readOnly:true,balance:null,version:null}
        :{available:true,readOnly:true,balance:25,version:2};
    throw Error('unexpected endpoint');
  });
}
describe('Ferramentas da Ficha Firebase',()=>{
  it('mostra consulta do jogador, mas não registra lançamentos',async()=>{
    fakeData(false);
    render(<FirebaseCouncilHouseTools houseId="house-a"
      houseName="Evenhand" narrator={false}/>);
    await waitFor(()=>expect(screen.getByText(/Saldo disponível:/)).toBeInTheDocument());
    expect(screen.queryByRole('button',{name:'Registrar lançamento'})).toBeNull();
    expect(request).toHaveBeenCalledWith('/api/firebase-cloud-treasury',
      {action:'summary',houseId:'house-a'});
    expect(request).not.toHaveBeenCalledWith('/api/firebase-cloud-treasury',
      {action:'status',houseId:'house-a'});
  });
  it('não libera ajustes até o servidor homologar o Tesouro',async()=>{
    fakeData(true);
    render(<FirebaseCouncilHouseTools houseId="house-a"
      houseName="Evenhand" narrator/>);
    await waitFor(()=>expect(screen.getByText(
      /lançamentos ainda não estão liberados/,
    )).toBeInTheDocument());
    expect(screen.queryByRole('button',{name:'Registrar lançamento'})).toBeNull();
    expect(request).toHaveBeenCalledWith('/api/firebase-cloud-treasury',
      {action:'status',houseId:'house-a'});
  });
});

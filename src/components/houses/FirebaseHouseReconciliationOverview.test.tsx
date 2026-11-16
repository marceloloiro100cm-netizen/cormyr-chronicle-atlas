import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FirebaseHouseReconciliationOverview,
  HOUSE_RECONCILIATION_PAGE_SIZE,houseReconciliationSummary}
  from './FirebaseHouseReconciliationOverview';
import type {HouseReconciliationReport}
  from '@/lib/house/firebase-house-reconciliation-audit';
afterEach(cleanup);

const report=(houseId:string,change:Partial<HouseReconciliationReport>={}):
HouseReconciliationReport=>({
  houseId,houseName:houseId,status:'operational_missing',
  sourceVersion:3,operationalVersion:null,
  readGateApproved:false,writeGateApproved:false,
  documentIntegrityConfirmed:false,
  auditHistoryVerified:false,readyForCutover:false,readOnly:true,
  constructionLedger:null,economicReplay:null,
  seedPreflightStatus:'ready_for_operator_review',
  ...change,
});
const houses=Array.from({length:9},(_,n)=>({
  id:'house-'+(n+1),name:'Casa '+String.fromCharCode(65+n),
}));

describe('Firebase — resumo das Casas exclusivo do Narrador',()=>{
  it('diferencia seed ausente de documento coerente sem autorizar cutover',()=>{
    expect(houseReconciliationSummary(report('h-a')))
      .toMatch(/prévia disponível para revisão/);
    expect(houseReconciliationSummary(report('h-a',{
      status:'operational_document_consistent',
      documentIntegrityConfirmed:true,operationalVersion:1,
    }))).toMatch(/liberações pendentes/);
    expect(houseReconciliationSummary(report('h-a',{
      status:'operational_document_consistent',
      documentIntegrityConfirmed:true,operationalVersion:1,
      constructionLedger:{
        status:'verified_hash_chain',verifiedHashChain:true,
        economicReplayVerified:false,auditHistoryVerified:true,
        readyForCutover:false,readOnly:true,eventsTotal:1,lastVersion:1,
        entries:[],truncated:false,
      },
      economicReplay:{
        status:'verified',economicReplayVerified:true,eventsTotal:1,
        replayedEvents:1,readyForCutover:false,readOnly:true,
      },
    }))).toMatch(/migração ainda não liberada/);
  });
  it('não verifica automaticamente nem inventa porcentagem global',()=>{
    const inspect=vi.fn(async(id:string)=>report(id));
    render(<FirebaseHouseReconciliationOverview houses={houses}
      inspect={inspect}/>);
    expect(screen.getByText(/Página 1 de 2 · 9 Casas listadas/))
      .toBeInTheDocument();
    expect(screen.getByText(/0 consultadas, 0 indisponíveis/))
      .toBeInTheDocument();
    expect(screen.getAllByText('Ainda não consultada'))
      .toHaveLength(HOUSE_RECONCILIATION_PAGE_SIZE);
    expect(inspect).not.toHaveBeenCalled();
    expect(screen.getByText(/não representam homologação global/))
      .toBeInTheDocument();
  });
  it('consulta somente 8 Casas na página, 2 em paralelo no máximo',async()=>{
    let ongoing=0,peak=0;
    const inspect=vi.fn(async(id:string)=>{
      ongoing++;peak=Math.max(peak,ongoing);
      await Promise.resolve();
      ongoing--;
      return report(id);
    });
    render(<FirebaseHouseReconciliationOverview houses={houses}
      inspect={inspect}/>);
    fireEvent.click(screen.getByRole('button',{name:'Verificar esta página'}));
    await waitFor(()=>expect(screen.getByText(/8 consultadas, 0 indisponíveis/))
      .toBeInTheDocument());
    expect(inspect).toHaveBeenCalledTimes(8);
    expect(peak).toBeLessThanOrEqual(2);
    expect(screen.getAllByText(/Seed ausente; prévia disponível/)).toHaveLength(8);
    fireEvent.click(screen.getByRole('button',{name:'Próxima'}));
    expect(screen.getByText(/Página 2 de 2/)).toBeInTheDocument();
    expect(inspect).toHaveBeenCalledTimes(8);
    fireEvent.click(screen.getByRole('button',{name:'Verificar esta página'}));
    await waitFor(()=>expect(screen.getByText(/1 consultadas, 0 indisponíveis/))
      .toBeInTheDocument());
    expect(inspect).toHaveBeenCalledTimes(9);
  });
  it('falhas individuais ficam indisponíveis, não aprovadas',async()=>{
    const inspect=vi.fn(async(id:string)=>{
      if(id==='house-3')throw Error('private server details must not leak');
      return report(id);
    });
    const {container}=render(<FirebaseHouseReconciliationOverview
      houses={houses.slice(0,3)} inspect={inspect}/>);
    fireEvent.click(screen.getByRole('button',{name:'Verificar esta página'}));
    await waitFor(()=>expect(screen.getByText(/2 consultadas, 1 indisponíveis/))
      .toBeInTheDocument());
    expect(screen.getByText(/Consulta indisponível: pendência não verificada/))
      .toBeInTheDocument();
    expect(container.textContent).not.toContain('private server details');
    expect(container.textContent).not.toContain('100%');
  });
  it('rejeita resposta da Casa errada ou marcada como cutover aprovado',async()=>{
    const inspect=vi.fn(async(id:string)=>report('house-other',{
      readyForCutover:true as false,
    }));
    render(<FirebaseHouseReconciliationOverview
      houses={houses.slice(0,1)} inspect={inspect}/>);
    fireEvent.click(screen.getByRole('button',{name:'Verificar esta página'}));
    await waitFor(()=>expect(screen.getByText(/0 consultadas, 1 indisponíveis/))
      .toBeInTheDocument());
  });
  it('reabre uma Casa pelo callback sem fazer escrita ou aprovação',()=>{
    const open=vi.fn();
    const inspect=vi.fn(async(id:string)=>report(id));
    render(<FirebaseHouseReconciliationOverview
      houses={houses.slice(0,1)}
      inspect={inspect} onSelectHouse={open}/>);
    fireEvent.click(screen.getByRole('button',{name:'Abrir ficha'}));
    expect(open).toHaveBeenCalledExactlyOnceWith('house-1');
    expect(inspect).not.toHaveBeenCalled();
  });
});

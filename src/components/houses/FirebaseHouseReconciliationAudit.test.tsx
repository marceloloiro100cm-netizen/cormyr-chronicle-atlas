import {afterEach,describe,it,expect} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {FirebaseHouseReconciliationAudit} from './FirebaseHouseReconciliationAudit';
import type {HouseReconciliationReport}
  from '@/lib/house/firebase-house-reconciliation-audit';
afterEach(cleanup);
const base:HouseReconciliationReport={
  houseId:'house-a',houseName:'Evenhand',
  status:'seed_consistent',
  sourceVersion:3,operationalVersion:0,
  readGateApproved:false,writeGateApproved:false,
  documentIntegrityConfirmed:true,auditHistoryVerified:false,
  readyForCutover:false,readOnly:true,
};
describe('Firebase — painel de reconciliação Narrador',()=>{
  it('não inventa resultado quando auditoria privada está desabilitada',()=>{
    const {container}=render(
      <FirebaseHouseReconciliationAudit houseId="house-a" report={null}/>);
    expect(screen.getByText(/Auditoria ainda não habilitada/))
      .toBeInTheDocument();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
  });
  it('mostra seed consistente sem anunciar aprovação de cutover',()=>{
    render(<FirebaseHouseReconciliationAudit houseId="house-a" report={base}/>);
    expect(screen.getByText(/Seed operacional consistente/))
      .toBeInTheDocument();
    expect(screen.getByText('Ainda não realizada')).toBeInTheDocument();
    expect(screen.getAllByText('Não autorizada')).toHaveLength(2);
    expect(screen.getByText(/Não autoriza ativar compras/)).toBeInTheDocument();
  });
  it('bloqueia renderização do resultado de outra Casa',()=>{
    render(<FirebaseHouseReconciliationAudit
      houseId="house-b" report={base}/>);
    expect(screen.getByText(/Não há confirmação de reconciliação/))
      .toBeInTheDocument();
    expect(screen.queryByText(/Seed operacional consistente/)).toBeNull();
  });
  it('informa hash divergente sem expor valores privados ou criar controles',()=>{
    const data:HouseReconciliationReport={...base,
      status:'operational_hash_mismatch',operationalVersion:2,
      documentIntegrityConfirmed:false};
    const original=structuredClone(data);
    const {container}=render(
      <FirebaseHouseReconciliationAudit houseId="house-a" report={data}/>);
    expect(screen.getByText(/Integridade do estado operacional divergente/))
      .toBeInTheDocument();
    expect(screen.getByText('Não confirmada')).toBeInTheDocument();
    expect(container.querySelector('input')).toBeNull();
    expect(data).toEqual(original);
  });
});

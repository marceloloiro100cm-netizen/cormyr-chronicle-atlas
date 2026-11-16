/**
 * Narrator-only presentation of already authorized per-House Firebase
 * reconciliation reports. This component never reads Firestore or writes
 * state. Pages are inspected only when the Narrator explicitly clicks.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import type {HouseReconciliationReport,HouseReconciliationStatus}
  from '@/lib/house/firebase-house-reconciliation-audit';

export const HOUSE_RECONCILIATION_PAGE_SIZE=8;
export const HOUSE_RECONCILIATION_CONCURRENCY=2;

type House={id:string;name:string};
type Outcome=
  |{kind:'checked';report:HouseReconciliationReport}
  |{kind:'unavailable'}
  |{kind:'checking'};

const descriptions:Record<HouseReconciliationStatus,string>={
  stage_incomplete:'Etapas da migração ainda incompletas',
  house_unavailable:'Casa não habilitada para esta etapa',
  sheet_unavailable:'Ficha histórica ausente ou incompleta',
  calendar_unavailable:'Calendário oficial não validado',
  source_invalid:'Dados históricos inconsistentes',
  runtime_unreconciled:'Runtime ainda não reconciliado',
  operational_missing:'Ficha operacional ainda não criada',
  operational_unverified:'Ficha operacional sem homologação',
  sheet_version_mismatch:'Versão histórica divergente',
  source_hash_mismatch:'Integridade da origem divergente',
  operational_hash_mismatch:'Integridade operacional divergente',
  seed_mismatch:'Seed inicial divergente',
  calendar_mismatch:'Mês operacional divergente',
  economy_invalid:'Economia operacional inválida',
  seed_consistent:'Seed coerente; liberações pendentes',
  operational_document_consistent:'Documento coerente; liberações pendentes',
};

export function houseReconciliationSummary(
  report:HouseReconciliationReport,
):string{
  if(!report.documentIntegrityConfirmed){
    if(report.status==='operational_missing'&&
       report.seedPreflightStatus==='ready_for_operator_review')
      return 'Seed ausente; prévia disponível para revisão administrativa';
    return descriptions[report.status]??'Revisão administrativa necessária';
  }
  if(report.constructionLedger?.verifiedHashChain===true&&
     report.economicReplay?.economicReplayVerified===true)
    return 'Documento e compras conferidos; migração ainda não liberada';
  if(report.constructionLedger?.verifiedHashChain===true)
    return 'Cadeia de eventos coerente; reexecução econômica pendente';
  return descriptions[report.status]??'Revisão administrativa necessária';
}

export function FirebaseHouseReconciliationOverview({
  houses,inspect,onSelectHouse,
}:{
  houses:readonly House[];
  inspect:(houseId:string)=>Promise<HouseReconciliationReport>;
  onSelectHouse?:(houseId:string)=>void;
}){
  const [page,setPage]=useState(0);
  const [running,setRunning]=useState(false);
  const [results,setResults]=useState<Record<string,Outcome>>({});
  const scanId=useRef(0);
  // Never count duplicate House references twice.
  const unique=useMemo(()=>Array.from(new Map(houses
    .filter(h=>typeof h.id==='string'&&h.id.length>0&&
      h.id.length<=128&&!/[/\u0000-\u001f\u007f]/.test(h.id))
    .map(h=>[h.id,h] as const)).values())
    .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||
      a.id.localeCompare(b.id)),[houses]);
  const totalPages=Math.max(1,Math.ceil(unique.length/HOUSE_RECONCILIATION_PAGE_SIZE));
  const safePage=Math.min(page,totalPages-1);
  const visible=unique.slice(safePage*HOUSE_RECONCILIATION_PAGE_SIZE,
    (safePage+1)*HOUSE_RECONCILIATION_PAGE_SIZE);
  const checked=visible.filter(h=>results[h.id]?.kind==='checked').length;
  const unavailable=visible.filter(h=>results[h.id]?.kind==='unavailable').length;
  const pending=visible.length-checked-unavailable;

  useEffect(()=>{
    scanId.current++;
    setResults({});
    setRunning(false);
    setPage(0);
    return ()=>{scanId.current++;};
  },[houses]);

  async function scanPage(){
    if(running||visible.length===0)return;
    const request=++scanId.current;
    setRunning(true);
    const current=[...visible];
    setResults(previous=>{
      const next={...previous};
      for(const h of current)next[h.id]={kind:'checking'};
      return next;
    });
    try{
      for(let i=0;i<current.length;i+=HOUSE_RECONCILIATION_CONCURRENCY){
        if(request!==scanId.current)return;
        const group=current.slice(i,i+HOUSE_RECONCILIATION_CONCURRENCY);
        const settled=await Promise.allSettled(group.map(h=>inspect(h.id)));
        if(request!==scanId.current)return;
        setResults(previous=>{
          const next={...previous};
          for(let j=0;j<group.length;j++){
            const h=group[j]!;
            const item=settled[j]!;
            next[h.id]=item.status==='fulfilled'&&
              item.value.houseId===h.id&&item.value.readOnly===true&&
              item.value.readyForCutover===false
              ?{kind:'checked',report:item.value}
              :{kind:'unavailable'};
          }
          return next;
        });
      }
    }finally{
      if(request===scanId.current)setRunning(false);
    }
  }

  return <section aria-label="Visão geral da reconciliação das Casas"
    className="rounded-lg border border-current/25 p-4 space-y-3">
    <h2 className="text-lg font-semibold">Reconciliação das Casas · Narrador</h2>
    <p className="text-sm opacity-75">
      Verificação Firebase por Casa, em lotes de até 8 e 2 consultas simultâneas.
      Nenhuma Casa é homologada, provisionada ou alterada por este painel.
    </p>
    <div className="flex flex-wrap gap-2 items-center">
      <button type="button" className="rounded border px-3 py-2"
        onClick={()=>{void scanPage();}} disabled={running||visible.length===0}>
        {running?'Verificando Casas…':'Verificar esta página'}
      </button>
      <button type="button" className="rounded border px-3 py-2"
        disabled={running||safePage===0}
        onClick={()=>setPage(n=>Math.max(0,n-1))}>Anterior</button>
      <button type="button" className="rounded border px-3 py-2"
        disabled={running||safePage>=totalPages-1}
        onClick={()=>setPage(n=>Math.min(totalPages-1,n+1))}>Próxima</button>
      <span className="text-sm">
        Página {safePage+1} de {totalPages} · {unique.length} Casas listadas
      </span>
    </div>
    <p role="status" className="text-sm">
      Nesta página: {checked} consultadas, {unavailable} indisponíveis,
      {' '}{pending} sem resultado conclusivo.
      {' '}Os números não representam homologação global.
    </p>
    {visible.length===0
      ?<p className="text-sm">Nenhuma Casa disponível no catálogo Firebase.</p>
      :<ul className="space-y-2">
        {visible.map(h=>{
          const result=results[h.id];
          const report=result?.kind==='checked'?result.report:null;
          return <li key={h.id} className="rounded border border-current/15 p-3">
            <div className="flex flex-wrap justify-between gap-2 items-center">
              <strong>{h.name}</strong>
              {onSelectHouse&&<button type="button"
                className="rounded border px-2 py-1 text-sm"
                onClick={()=>onSelectHouse(h.id)}>
                Abrir ficha
              </button>}
            </div>
            <p className="text-sm mt-1">
              {result?.kind==='checking'?'Verificando…'
                :result?.kind==='unavailable'
                  ?'Consulta indisponível: pendência não verificada'
                  :report?houseReconciliationSummary(report)
                    :'Ainda não consultada'}
            </p>
            {report&&<p className="text-xs opacity-75">
              Origem: {report.sourceVersion??'não confirmada'} ·
              Operacional: {report.operationalVersion??'não confirmada'} ·
              Cutover: não autorizado
            </p>}
          </li>;
        })}
      </ul>}
    <p className="text-xs opacity-75">
      Resultados limitados às Casas consultadas nesta sessão e página.
      Acesso IAM, contas Firebase e testes entre perfis exigem homologação
      independente. A permissão de publicação permanece bloqueada.
    </p>
  </section>;
}

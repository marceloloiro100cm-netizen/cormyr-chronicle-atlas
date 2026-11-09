import {useState} from 'react';
import {FileDown,Printer,History} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {formatDate,parseDate} from '@/lib/calendar/harptos';
import {buildSpyDossierReport,spyDossierDisclosureSummary,spyDossierVersionRows}
 from '@/lib/espionage/spy-dossier-report';
import type {SpyDossier} from '@/lib/espionage/spy-dossier.functions';

export function SpyDossierReportActions({dossier,officialDate}:{
 dossier:SpyDossier;officialDate:string|null;
}){
 const [feedback,setFeedback]=useState('');
 const copy=async()=>{
  setFeedback('');
  try{
   // Exportação exige interação explícita e permanece na máquina do leitor.
   if(!navigator.clipboard?.writeText)throw new Error('clipboard-unavailable');
   await navigator.clipboard.writeText(buildSpyDossierReport(dossier,officialDate));
   setFeedback('Relatório copiado para a área de transferência.');
  }catch{
   setFeedback('Não foi possível copiar. Use Imprimir / PDF para guardar o relatório.');
  }
 };
 return <div className="spy-dossier-report-tools" aria-label="Exportação do dossiê">
  <Button type="button" variant="outline" size="sm" onClick={()=>void copy()}>
   <FileDown size={15} aria-hidden="true"/> Copiar relatório</Button>
  <Button type="button" variant="outline" size="sm" onClick={()=>window.print()}>
   <Printer size={15} aria-hidden="true"/> Imprimir / PDF</Button>
  {feedback&&<small role="status">{feedback}</small>}
 </div>;
}
const actionName={
 revealed:'Descoberta',refreshed:'Revalidação',other:'Registro',
} as const;
export function SpyDossierVersionHistory({dossier,narrator=false}:{
 dossier:SpyDossier;narrator?:boolean;
}){
 const [objective,setObjective]=useState<'all'|'house_resources'|'army'|'possessions'>('all');
 const [limit,setLimit]=useState(15);
 const history=spyDossierVersionRows(dossier,narrator);
 const scoped=history.filter(x=>objective==='all'||x.objective===objective);
 return <details className="house-ledger spy-dossier-version-history">
  <summary><History size={16} aria-hidden="true"/>
   {' '}Histórico de inteligência ({history.length})</summary>
  <p className="house-caption">
   {narrator
    ?'O Narrador pode comparar valores históricos já registrados, sem consultar a ficha atual.'
    :'Datas de descoberta e revalidação apenas dos segredos que sua Casa ainda conhece.'}
  </p>
  <label>Modalidade
   <select value={objective} onChange={e=>{
    setObjective(e.target.value as typeof objective);setLimit(15);}}>
    <option value="all">Todas</option>
    <option value="house_resources">Recursos</option>
    <option value="army">Exército</option>
    <option value="possessions">Posses</option>
   </select>
  </label>
  {scoped.length?<ol className="spy-dossier-version-list">
   {scoped.slice(0,limit).map(h=><li key={h.id}>
    <span><strong>{parseDate(h.dateKey)?formatDate(h.dateKey):'Data indisponível'}</strong>
     {' '}· {actionName[h.action]} · {h.subject}</span>
    {narrator&&(h.previous!==null||h.next!==null)&&<small>
     {h.previous!==null?'Antes: '+h.previous+' · ':''}
     {h.next!==null?'Registrado: '+h.next:''}
    </small>}
   </li>)}
  </ol>:<p className="house-caption">Nenhuma alteração registrada nesta modalidade.</p>}
  {scoped.length>limit&&<Button type="button" variant="outline"
   onClick={()=>setLimit(v=>v+15)}>Ver mais registros</Button>}
 </details>;
}
export function SpyDossierSummary({dossier,officialDate}:{
 dossier:SpyDossier;officialDate:string|null;
}){
 const s=spyDossierDisclosureSummary(dossier,officialDate);
 return <div className="spy-dossier-briefing" aria-label="Resumo da inteligência conhecida">
  <div><strong>{s.resources}/7</strong><small>Recursos</small></div>
  <div><strong>{s.army}</strong><small>Unidades conhecidas</small></div>
  <div><strong>{s.possessions}</strong><small>Posses conhecidas</small></div>
  <div><strong>{s.stale}</strong><small>Registros antigos</small></div>
 </div>;
}

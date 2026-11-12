import {auditCommission,type CommissionAudit} from '@/lib/newspaper/audit';
import type {NewspaperCommission,NewspaperEdition} from '@/lib/newspaper/model';

/**
 * Auditoria das notícias contratadas: o que a Casa pagou (que o banco não deixa alterar) ao lado
 * do que foi para a folha. Só o Editor-Chefe e o Narrador veem esta lista.
 */
export function NewspaperAudit({commissions,editions,houseNames}:{
 commissions:readonly NewspaperCommission[];
 editions:readonly NewspaperEdition[];
 houseNames:ReadonlyMap<string,string>;
}){
 const rows=commissions.filter(c=>c.state!=='pending')
  .sort((a,b)=>b.created_at.localeCompare(a.created_at))
  .map(c=>({commission:c,audit:auditCommission(c,editions)}));
 const count=(status:CommissionAudit['status'])=>rows.filter(r=>r.audit.status===status).length;
 return <section className="folha-audit" aria-label="Auditoria das notícias contratadas">
  <h4 className="newspaper-commission-heading">Auditoria das notícias contratadas</h4>
  <p>Compara o texto que a Casa pagou com o que saiu na folha. O pedido original nunca muda no banco.</p>
  {rows.length===0?<p className="folha-empty-copy">Nenhuma notícia contratada foi publicada ou recusada ainda.</p>:<>
   <p className="folha-audit-summary">{count('integral')} integral(is) · {count('edited')} editada(s) · {count('rejected')} recusada(s)</p>
   <ul className="folha-audit-list">{rows.map(({commission,audit})=><li key={commission.id}>
    <details>
     <summary>
      <span className={`folha-audit-badge folha-audit-${audit.status}`}>{audit.label}</span>
      <strong>{audit.original.title}</strong>
      <small>{houseNames.get(commission.house_id)??'Casa'} · {commission.cost_wealth} de Riqueza
       {audit.editionNo!==null?` · edição nº ${audit.editionNo}`:''} · {new Date(commission.created_at).toLocaleDateString('pt-BR')}</small>
     </summary>
     <div className="folha-audit-compare">
      <div><h5>Pedido pago</h5><p>{audit.original.title}</p><p>{audit.original.body}</p></div>
      <div><h5>{audit.status==='rejected'?'Recusa':'Publicado na folha'}</h5>
       {audit.status==='rejected'?<p>{commission.rejection_note??'Sem nota.'}{commission.rejected_at?` (${new Date(commission.rejected_at).toLocaleDateString('pt-BR')})`:''}</p>:
        audit.published!==null?<p className="folha-audit-published">{audit.published}</p>:
        <p>{audit.label}.</p>}
      </div>
     </div>
    </details></li>)}</ul></>}
 </section>;
}

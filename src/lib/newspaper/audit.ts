import type {NewspaperCommission,NewspaperEdition} from './model';

export type CommissionAuditStatus='pending'|'integral'|'edited'|'missing'|'rejected'|'no-edition';
export const COMMISSION_AUDIT_LABELS:Record<CommissionAuditStatus,string>={
 pending:'Aguardando publicação',
 integral:'Publicado integralmente',
 edited:'Editado pelo Editor-Chefe',
 missing:'Publicado sem o texto na folha',
 rejected:'Recusado e reembolsado',
 'no-edition':'Edição não encontrada',
};
export type CommissionAudit={
 status:CommissionAuditStatus;label:string;
 /** O que a Casa pagou para publicar (o banco impede qualquer alteração do pedido). */
 original:{title:string;body:string};
 /** Texto que saiu na folha; null quando não há. */
 published:string|null;
 editionNo:number|null;
};
const flat=(text:string)=>text.replace(/\s+/g,' ').trim();

/** Compara o pedido pago com a matéria que foi para a folha, pelo vínculo commissionId. */
export function auditCommission(commission:NewspaperCommission,
 editions:readonly Pick<NewspaperEdition,'id'|'edition_no'|'blocks'>[]):CommissionAudit{
 const original={title:commission.title.trim(),body:commission.body.trim()};
 const make=(status:CommissionAuditStatus,published:string|null=null,editionNo:number|null=null):CommissionAudit=>
  ({status,label:COMMISSION_AUDIT_LABELS[status],original,published,editionNo});
 if(commission.state==='pending')return make('pending');
 if(commission.state==='rejected')return make('rejected');
 const edition=editions.find(e=>e.id===commission.newspaper_id);
 if(!edition)return make('no-edition');
 const block=edition.blocks.find(b=>b.commissionId===commission.id&&b.type==='article');
 if(!block)return make('missing',null,edition.edition_no);
 const same=flat(block.text)===flat(`${original.title} ${original.body}`);
 return make(same?'integral':'edited',block.text,edition.edition_no);
}

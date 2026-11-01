import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {loadCharacterV2MigrationPreview} from '@/lib/character-v2/migration.functions';
import {exportCharacterV2ReportPdf} from '@/lib/character-v2/pdf';
import type {MigrationReview} from '@/lib/character-v2/migration-review';
import {summarizeCharacterV2Sources} from '@/lib/character-v2/readiness';

/** Não é exibido para jogadores. Todo fetch executa autenticação do Narrador e RLS. */
export function CharacterV2NarratorReview({houseId,records}:{
 houseId:string;records:readonly {id:string;title:string;kind:string;content:string}[];
}){
 const load=useServerFn(loadCharacterV2MigrationPreview);
 const [item,setItem]=useState<MigrationReview|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const inventory=summarizeCharacterV2Sources(records);
 const approvedIds=new Set(inventory.classified.filter(x=>x.inspectable).map(x=>x.recordId));
 const candidates=records.filter(r=>approvedIds.has(r.id));
 const handle=(id:string)=>{
  setLoading(true);setError('');setItem(null);
  void load({data:{recordId:id,houseId}}).then(result=>setItem(result as MigrationReview))
   .catch(e=>setError(e instanceof Error?e.message:'Falha ao carregar a prévia.'))
   .finally(()=>setLoading(false));
 };
 const exportPdf=()=>{
  if(!item?.derived)return;
  const bytes=exportCharacterV2ReportPdf(item.derived);
  const copy=new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob=new Blob([copy.buffer],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download='personagem-v2-previa-'+item.recordId+'.pdf';
  anchor.click();
  URL.revokeObjectURL(url);
 };
 return <section className="character-v2-section" aria-label="Conciliação V2 do Narrador">
  <details>
   <summary>Conciliação de personagens V2 — prévia do Narrador</summary>
   <p className="text-sm text-muted-foreground">
    Original preservado. Nenhuma migração é executada neste painel.
    A liberação para jogadores permanece bloqueada até homologação.
   </p>
   <p role="status" className="text-sm">{inventory.total} registros classificados como personagens nesta Casa;{' '}
    {inventory.inspectable} fichas identificadas para conferência ({inventory.legacy} legadas,{' '}
    {inventory.structured} estruturadas). {inventory.excluded} registros ilustrativos ou incompletos{' '}
    não serão confundidos com fichas.</p>
   {candidates.length===0?<p>Nenhuma ficha reconhecível foi encontrada nesta Casa.</p>:
    <div className="flex flex-wrap gap-2 my-3">
     {candidates.map(r=><Button key={r.id} type="button" variant="outline"
       disabled={loading} onClick={()=>handle(r.id)}>Comparar {r.title}</Button>)}
    </div>}
   <p className="text-sm">Para vincular uma identidade, acesse o calendário do Narrador,{' '}
     <strong>Nobres e genealogias</strong>, use <strong>Importar fontes internas</strong>,{' '}
     confirme a pessoa canônica e vincule a ficha original. Vínculos não são criados por nome parecido.
   </p>
   {loading&&<p role="status">Conferindo identidade canônica e dados autorizados…</p>}
   {error&&<p role="alert">{error}</p>}
   {item&&<>
    <p role="status">{item.candidateName??'Ficha não reconhecida'} · fonte v{item.sourceVersion}.
     {item.canonicalId?' Pessoa canônica: '+item.canonicalId:' Sem vínculo canônico.'}</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-3">
     <section className="min-w-0 border rounded-lg p-3">
      <h4 className="font-semibold">Original preservado</h4>
      <pre className="whitespace-pre-wrap break-words text-xs max-h-96 overflow-auto">{item.original}</pre>
     </section>
     <section className="min-w-0 border rounded-lg p-3">
      <h4 className="font-semibold">V2 calculada — comparação</h4>
      {item.derived?<dl>
       {item.derived.breakdown.map(entry=><div key={entry.key} className="my-2">
        <dt className="font-medium">{entry.key} = {entry.value}</dt>
        <dd className="text-xs">{entry.formula}</dd>
        <dd className="text-xs">{entry.lines.map(line=>line.description+': '+line.amount).join(' · ')}</dd>
       </div>)}
      </dl>:<p>Não foi possível extrair a ficha.</p>}
     </section>
    </div>
    {item.blockers.length>0&&<section aria-label="Bloqueios de migração">
     <h4 className="font-semibold">Bloqueios para migração</h4>
     <ul className="list-disc pl-6">{item.blockers.map((t,i)=><li key={i}>{t}</li>)}</ul>
    </section>}
    {item.warnings.length>0&&<details><summary>Pendências e campos ainda não conciliados</summary>
     <ul className="list-disc pl-6">{item.warnings.map((t,i)=><li key={i}>{t}</li>)}</ul>
    </details>}
    {item.derived&&<Button type="button" variant="outline" onClick={exportPdf}>
      Exportar PDF da prévia calculada
    </Button>}
    <p className="text-xs mt-2">Não habilitado: migrar, substituir ficha V1, efetuar compras,
     publicar a V2 ou alterar recursos de outros jogadores.</p>
   </>}
  </details>
 </section>;
}

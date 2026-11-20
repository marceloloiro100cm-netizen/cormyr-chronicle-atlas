import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {workspaceRequest} from '@/lib/firebase-workspace/client';

type Approvals={runtimeActive:boolean;items:{key:string;label:string;approved:boolean}[]};

/**
 * Contas > Aprovações: o Narrador liga ou desliga, no runtime Firebase, cada
 * função que grava dados. As chaves do servidor só abrem as rotas; sem a
 * aprovação daqui a função continua só para consulta. Tudo fica auditado.
 */
export function FirebaseRuntimeApprovals(){
 const qc=useQueryClient();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const query=useQuery({queryKey:['firebase-runtime-approvals'],retry:false,
  queryFn:()=>workspaceRequest({kind:'rpc',name:'runtime_approvals',args:{}}) as Promise<Approvals>});
 const apply=async(changes:Record<string,boolean>)=>{
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const next=await workspaceRequest({kind:'rpc',name:'runtime_approvals_set',args:{p_changes:changes}}) as Approvals;
   qc.setQueryData(['firebase-runtime-approvals'],next);
   await qc.invalidateQueries();
   setMessage('Aprovações gravadas. As telas já usam a nova situação.');
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível gravar as aprovações.');}
  finally{setBusy(false);}
 };
 if(query.isPending)return <p role="status">Consultando aprovações do Firebase…</p>;
 if(query.isError||!query.data)return <p role="alert">Aprovações indisponíveis: {query.error instanceof Error?query.error.message:'tente novamente.'}</p>;
 const off=query.data.items.filter(i=>!i.approved);
 return <section className="nw-approvals" aria-label="Aprovações das funções">
  <h2 className="nw-group-title">Aprovações das funções</h2>
  <p>Ligue aqui as funções que gravam dados no Firebase. Cada mudança fica registrada.
   {!query.data.runtimeActive&&' O runtime ainda não está ativo: as aprovações ficam guardadas, mas só valem depois da ativação.'}</p>
  {off.length>0&&<Button type="button" disabled={busy}
   onClick={()=>void apply(Object.fromEntries(off.map(i=>[i.key,true])))}>
   Ligar todas ({off.length})</Button>}
  <ul className="nw-approvals-list">{query.data.items.map(item=><li key={item.key}>
   <label className="campaign-check">
    <input type="checkbox" checked={item.approved} disabled={busy}
     onChange={e=>void apply({[item.key]:e.target.checked})}/>
    <span>{item.label}</span>
   </label>
  </li>)}</ul>
  {message&&<p role="status">{message}</p>}
 </section>;
}

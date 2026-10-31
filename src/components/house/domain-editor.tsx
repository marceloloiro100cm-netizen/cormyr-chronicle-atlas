import {useState} from 'react';
import type {Domain,HouseState} from '@/lib/house/types';
import {Button} from '@/components/ui/button';
export function DomainEditor({domain,state,busy,onEdit,onDelete}:{
 domain:Domain;state:HouseState;busy:boolean;
 onEdit:(args:Record<string,unknown>)=>Promise<boolean>;
 onDelete:(args:Record<string,unknown>)=>Promise<boolean>;
}){
 const [name,setName]=useState(domain.name),[notes,setNotes]=useState(domain.notes);
 const empty=!domain.terrain&&!domain.community&&!domain.features.length
   &&!state.holdings.some(h=>h.domainId===domain.id)
   &&!state.units.some(u=>u.domainId===domain.id)
;
 return <details className="house-ledger"><summary>Editar domínio</summary>
  <form className="campaign-form" onSubmit={async e=>{e.preventDefault();await onEdit({id:domain.id,name,notes});}}>
   <label>Nome<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
   <label>Notas<textarea maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   <Button disabled={busy||!name.trim()}>Salvar alterações</Button>
  </form>
  {state.phase==='draft'&&<Button type="button" variant="outline" disabled={busy||!empty}
     onClick={()=>onDelete({id:domain.id})}>Excluir domínio vazio</Button>}
  {!empty&&state.phase==='draft'&&<p className="house-caption">A exclusão exige um domínio sem terreno, comunidade, posses, unidades ou vínculos.</p>}
 </details>;
}

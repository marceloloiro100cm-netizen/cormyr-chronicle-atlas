import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {REGIONS} from '@/lib/house/regions';
import {RESOURCE_KEYS,RESOURCE_NAMES,type HouseState,type Resources} from '@/lib/house/types';

/** Narrator adjustments are explicit, versioned operations; no autosave of live data. */
export function AdminHouseEditor({state,busy,onSave}:{
 state:HouseState;busy:boolean;
 onSave:(args:{identity:Omit<HouseState['identity'],'crestPath'>;base:Resources;permanent:Resources},reason:string)=>Promise<boolean>;
}){
 const [identity,setIdentity]=useState(state.identity),[base,setBase]=useState(state.base),
  [permanent,setPermanent]=useState(state.permanent),[reason,setReason]=useState('');
 return <details className="house-ledger">
  <summary>Editar a ficha como Narrador — todos os atributos</summary>
  <form className="campaign-form" onSubmit={async e=>{e.preventDefault();
    if(await onSave({identity:{region:identity.region,motto:identity.motto,
     foundation:identity.foundation,history:identity.history,notes:identity.notes},
     base,permanent},reason.trim()))setReason('');
  }}>
   <p>Alteração administrativa mesmo em ficha aprovada. Todas as modificações são registradas no histórico.
   Compras, unidades, posses, dados históricos, brasão e arquivos importados permanecem preservados.</p>
   <label>Região<select value={identity.region} onChange={e=>setIdentity(v=>({...v,region:e.target.value}))}>
    <option value="">Selecione</option>
    {Object.entries(REGIONS).map(([id,r])=><option key={id} value={id}>{r.name}</option>)}
   </select></label>
   <label>Lema<input maxLength={500} value={identity.motto} onChange={e=>setIdentity(v=>({...v,motto:e.target.value}))}/></label>
   <label>Ano de fundação (CV)<input type="number" value={identity.foundation??''}
    onChange={e=>setIdentity(v=>({...v,foundation:e.target.value?Number(e.target.value):undefined}))}/></label>
   <label>História (uma entrada por linha)<textarea rows={3} value={identity.history.join('\n')}
    onChange={e=>setIdentity(v=>({...v,history:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)}))}/></label>
   <label>Notas da Casa<textarea rows={3} value={identity.notes} onChange={e=>setIdentity(v=>({...v,notes:e.target.value}))}/></label>
   <h4>Pontos-base e correções permanentes</h4>
   <div className="house-input-grid">{RESOURCE_KEYS.map(r=><div key={r}>
    <label>{RESOURCE_NAMES[r]} — pontos-base<input type="number" step="any" value={base[r]}
      onChange={e=>setBase(v=>({...v,[r]:Number(e.target.value)}))}/></label>
    <label>{RESOURCE_NAMES[r]} — ajuste permanente<input type="number" step="any" value={permanent[r]}
      onChange={e=>setPermanent(v=>({...v,[r]:Number(e.target.value)}))}/></label>
   </div>)}</div>
   <label>Motivo da edição (obrigatório)<textarea value={reason} minLength={10} required
    onChange={e=>setReason(e.target.value)} placeholder="Explique a correção e a origem dos valores."/></label>
   <Button disabled={busy||reason.trim().length<10}>Salvar alteração auditada do Narrador</Button>
  </form>
 </details>;
}

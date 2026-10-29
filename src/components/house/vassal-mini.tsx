import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {PurchaseDrawer} from './purchase-drawer';
import {ResourceSummary} from './resource-summary';
import {vassalState} from '@/lib/house/vassals';
import {RESOURCE_KEYS,RESOURCE_NAMES,type HouseState,type Vassal,type CatalogItem} from '@/lib/house/types';
export function VassalMini({state,vassal,catalog,busy,canEdit,onPurchase,onDomain}:{state:HouseState;vassal:Vassal;catalog:CatalogItem[];busy:boolean;canEdit:boolean;onPurchase:(args:Record<string,unknown>)=>Promise<boolean>;onDomain:(args:Record<string,unknown>)=>Promise<boolean>}){
 const [buy,setBuy]=useState(false);const mini=vassalState(state,vassal),sheet=vassal.sheet!;
 return <details><summary>Mini-ficha · {vassal.name}</summary><p>{sheet.lordName} · {sheet.motto}</p><ResourceSummary state={mini}/><details><summary>Rolagens registradas</summary>{RESOURCE_KEYS.map(r=><p key={r}>{RESOURCE_NAMES[r]}: {sheet.rolls[r].join(' + ')} = {sheet.base[r]}</p>)}</details>
 <h4>Posses</h4>{sheet.holdings.length?sheet.holdings.map(h=><p key={h.id}>{h.name} · {h.status}</p>):<p>Nenhuma posse adquirida.</p>}
 <h4>Domínios</h4>{sheet.domains.map(d=><p key={d.id}>{d.name} · {d.terrain||'Terreno não adquirido'}</p>)}
 {canEdit&&<><form className="campaign-form" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);if(await onDomain({vassalId:vassal.id,id:crypto.randomUUID(),name:String(f.get('name'))}))form.reset();}}><label>Nomear domínio<input name="name" required maxLength={160}/></label><Button disabled={busy}>Adicionar domínio à vassala</Button></form><Button disabled={busy} onClick={()=>setBuy(true)}>Comprar posse para a vassala</Button></>}
 <p>Compras usam somente os recursos desta mini-ficha, pelas regras de criação. Não debitam novamente o Poder da suserana.</p>
 <PurchaseDrawer open={buy} onClose={()=>setBuy(false)} state={mini} catalog={catalog} busy={busy} onConfirm={args=>onPurchase({...args,vassalId:vassal.id})} initialCategory=""/>
 </details>;
}

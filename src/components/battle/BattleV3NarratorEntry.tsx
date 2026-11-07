import './battle-cleanup.css';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import type {BattleStack} from '@/lib/battle/domain/types';
import {BattleSourcePicker} from './BattleSourcePicker';
import {BattleV3Game} from './BattleV3Game';

/** O adaptador de fichas oficiais não deve ser importado pela arena V3 pública:
 * o módulo do Narrador consulta snapshots autorizados e os fornece como props
 * somente enquanto prepara um treinamento. */
export function BattleV3NarratorEntry({onBack}:{onBack:()=>void}){
 const [copies,setCopies]=useState<BattleStack[]>([]);
 const [status,setStatus]=useState('');
 const [pickerOpen,setPickerOpen]=useState(false);
 const add=(stack:BattleStack)=>{
  if(copies.filter(s=>s.side===stack.side).length>=5){
   setStatus('Limite de cinco unidades por lado.');return;
  }
  if(copies.some(s=>s.source.kind==='house-readonly'&&stack.source.kind==='house-readonly'&&
    s.source.houseId===stack.source.houseId&&s.source.unitId===stack.source.unitId)){
   setStatus('Esta unidade já está na simulação.');return;
  }
  setCopies(xs=>[...xs,stack]);setStatus('Cópia militar adicionada somente para treino.');
 };
 return <section className="battle-module" aria-label="Preparação da batalha do Narrador">
  <details className="battle-surface battle-optional-source" open={pickerOpen}
   onToggle={event=>setPickerOpen(event.currentTarget.open)}>
   <summary>Opcional · Usar unidades existentes de uma casa
    {copies.length>0?' ('+copies.length+' copiadas)':''}</summary>
   <p className="battle-note">Escolha e copie unidades autorizadas antes de iniciar.
    Uma cópia é apenas uma referência de treinamento: a ficha oficial não recebe baixas.</p>
   {pickerOpen&&<BattleSourcePicker onAdd={add}/>}
   {copies.length>0&&<div className="battle-selected-copies">
    <h3>Unidades copiadas</h3>
    {copies.map((stack,i)=><div key={stack.id} className="battle-selected-copy">
     <span>{stack.name} · {stack.side==='attacker'?'Atacante':'Defensor'}</span>
     <Button size="sm" variant="outline" onClick={()=>
      setCopies(list=>list.filter((_,index)=>index!==i))}>Remover cópia</Button>
    </div>)}
   </div>}
   {status&&<p role="status">{status}</p>}
  </details>
  <BattleV3Game narrator onBack={onBack} officialCopies={copies}/>
 </section>;
}

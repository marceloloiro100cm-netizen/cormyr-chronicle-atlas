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
 return <section aria-label="Preparação da batalha do Narrador">
  <BattleV3Game narrator onBack={onBack} officialCopies={copies}/>
  <section className="battle-module" aria-label="Importação autorizada de tropas oficiais V3">
   <BattleSourcePicker onAdd={add}/>
   {copies.length>0&&<section className="battle-surface">
    <h3>Forças copiadas para o treinamento V3</h3>
    {copies.map((s,i)=><p key={i}>{s.name} · {s.side==='attacker'?'Atacante':'Defensor'}
     {' '}<Button size="sm" variant="outline" onClick={()=>setCopies(xs=>xs.filter((_,n)=>n!==i))}>Remover cópia</Button>
    </p>)}
    <p className="battle-note">As unidades oficiais são consultadas como snapshots;
     exércitos originais, perdas e recursos da campanha não são modificados.</p>
   </section>}
   {status&&<p role="status">{status}</p>}
  </section>
 </section>;
}

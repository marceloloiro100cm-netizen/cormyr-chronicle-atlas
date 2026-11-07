import './battle-cleanup.css';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import type {BattleStack} from '@/lib/battle/domain/types';
import {BattleSourcePicker} from './BattleSourcePicker';
import {isBattleTrainingCopy,battleTrainingSourceKey} from '@/lib/battle/adapters/imported-npc-roster';
import {BattleV3Game} from './BattleV3Game';

/** O adaptador de fichas oficiais não deve ser importado pela arena V3 pública:
 * o módulo do Narrador consulta snapshots autorizados e os fornece como props
 * somente enquanto prepara um treinamento. */
export function BattleV3NarratorEntry({onBack}:{onBack:()=>void}){
 const [copies,setCopies]=useState<BattleStack[]>([]);
 const [status,setStatus]=useState('');
 const [houseNameById,setHouseNameById]=useState<Record<string,string>>({});
 const [pickerOpen,setPickerOpen]=useState(false);
 const remainingBySide={attacker:Math.max(0,5-copies.filter(s=>s.side==='attacker').length),
  defender:Math.max(0,5-copies.filter(s=>s.side==='defender').length)};
 const addMany=(stacks:BattleStack[],houseName:string):boolean=>{
  if(!stacks.length)return false;
  const side=stacks[0]!.side;
  if(stacks.some(s=>s.side!==side||!isBattleTrainingCopy(s))){
   setStatus('Apenas unidades documentadas do mesmo lado podem ser copiadas.');return false;
  }
  if(copies.filter(s=>s.side===side).length+stacks.length>5){
   setStatus('Limite de cinco unidades por lado.');return false;
  }
  const all=[...copies,...stacks];
  const keys=all.map(battleTrainingSourceKey);
  if(new Set(keys).size!==keys.length){
   setStatus('Alguma unidade desta Casa já está na simulação.');return false;
  }
  setCopies(xs=>[...xs,...stacks]);
  setHouseNameById(current=>({...current,...Object.fromEntries(stacks.map(unit=>[
   unit.source.kind==='house-readonly'?unit.source.houseId!:unit.id,houseName]))}));
  setStatus(stacks.length+' unidade(s) de '+houseName+' copiadas para treino.');
  return true;
 };
 const add=(stack:BattleStack,houseName:string)=>addMany([stack],houseName);
 const labelFor=(side:BattleStack['side'])=>[...new Set(copies.filter(s=>s.side===side)
  .map(s=>s.source.kind==='house-readonly'?s.source.houseId:s.id)
  .filter((id):id is string=>Boolean(id))
  .map(id=>houseNameById[id]??id))].join(' + ');
 const officialHouseNames={attacker:labelFor('attacker'),defender:labelFor('defender')};
 return <section className="battle-module" aria-label="Preparação da batalha do Narrador">
  <details className="battle-surface battle-optional-source" open={pickerOpen}
   onToggle={event=>setPickerOpen(event.currentTarget.open)}>
   <summary>Carregar unidades · Região → Casa → Exército
    {copies.length>0?' ('+copies.length+' copiadas)':''}</summary>
   <p className="battle-note">Escolha e copie unidades autorizadas antes de iniciar.
    Uma cópia é apenas uma referência de treinamento: a ficha oficial não recebe baixas.</p>
   {pickerOpen&&<BattleSourcePicker onAdd={add} onAddMany={addMany}
    remainingBySide={remainingBySide}/>}
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
  <BattleV3Game narrator onBack={onBack} officialCopies={copies}
   officialHouseNames={officialHouseNames}/>
 </section>;
}

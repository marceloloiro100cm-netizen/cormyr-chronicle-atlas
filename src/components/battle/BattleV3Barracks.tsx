import {useState} from 'react';
import {Button} from '@/components/ui/button';
import type {Training} from '@/lib/battle/domain/types';
import {V3_RECRUITMENT_TYPES,V3_TRAINING_BUDGET,V3_TRAINING_SUPPLIES,
 v3BarracksSummary,v3BarracksRecruit,v3BarracksSplit,v3BarracksMerge,
 v3BarracksChangeCount,v3BarracksSetPlacement,v3BarracksRemove,
 type V3BarracksArmy} from '@/lib/battle/v3/barracks';

export function BattleV3Barracks({army,onChange,label}:{
 army:V3BarracksArmy;onChange:(army:V3BarracksArmy)=>void;label:string;
}){
 const [recruitType,setRecruitType]=useState('infantry');
 const [training,setTraining]=useState<Training>('trained');
 const [amount,setAmount]=useState(20);
 const [message,setMessage]=useState('');
 const summary=v3BarracksSummary(army);
 const act=(change:()=>V3BarracksArmy)=>{
  try{onChange(change());setMessage('Quartel de treino atualizado.');}
  catch(e){setMessage(e instanceof Error?e.message:'Operação de quartel inválida.');}
 };
 return <section className="crusade-barracks" aria-label={'Quartel '+label}>
  <h4>Quartel de treinamento</h4>
  <p className="battle-note">Composição local: não usa soldados, moedas ou suprimentos reais.</p>
  <div className="crusade-barracks-ledger">
   <span>Em campo <strong>{summary.fieldStacks}/5</strong></span>
   <span>Reserva <strong>{summary.reserveStacks}</strong></span>
   <span>Efetivo <strong>{summary.totalSoldiers}</strong></span>
   <span>Orçamento fictício <strong>{summary.cost}/{V3_TRAINING_BUDGET}</strong></span>
   <span>Suprimentos fictícios <strong>{summary.supplies}/{V3_TRAINING_SUPPLIES}</strong></span>
  </div>
  <div className="crusade-barracks-roster">
   {army.map(unit=>{
    const matches=army.filter(other=>other.id!==unit.id&&
      other.typeId===unit.typeId&&other.training===unit.training&&
      other.count+unit.count<=1000);
    return <div className="crusade-barracks-unit" key={unit.id}>
     <div className="crusade-barracks-head">
      <strong>{unit.name}</strong>
      <small>{unit.training} · {unit.placement==='field'?'Em campo':'Reserva'}</small>
     </div>
     <label>Combatentes
      <input aria-label={'Efetivo '+label+' '+unit.name} type="number"
       min={1} max={1000} step={1} value={unit.count}
       onChange={e=>act(()=>v3BarracksChangeCount(army,unit.id,Number(e.target.value)))}/>
     </label>
     <div className="crusade-barracks-actions">
      <Button size="sm" variant="outline" onClick={()=>act(()=>v3BarracksSetPlacement(army,unit.id,
       unit.placement==='field'?'reserve':'field'))}>
       {unit.placement==='field'?'Colocar na reserva':'Escalar no campo'}
      </Button>
      <Button size="sm" variant="outline" disabled={unit.count<2||army.length>=10}
       onClick={()=>act(()=>v3BarracksSplit(army,unit.id,Math.floor(unit.count/2)))}>
       Dividir
      </Button>
      <Button size="sm" variant="outline" disabled={!matches.length}
       title={matches.length?'Fundir com '+matches[0]!.name:'Sem pilha homogênea'}
       onClick={()=>matches.length&&act(()=>v3BarracksMerge(army,unit.id,matches[0]!.id))}>
       Fundir
      </Button>
      <Button size="sm" variant="outline" onClick={()=>act(()=>v3BarracksRemove(army,unit.id))}>
       Remover
      </Button>
     </div>
    </div>;
   })}
  </div>
  <div className="crusade-barracks-recruit">
   <label>Recrutar tipo<select aria-label={'Recrutar tipo '+label} value={recruitType}
    onChange={e=>setRecruitType(e.target.value)}>
    {V3_RECRUITMENT_TYPES.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
   </select></label>
   <label>Treino<select aria-label={'Treino '+label} value={training}
    onChange={e=>setTraining(e.target.value as Training)}>
    <option value="green">Recruta</option><option value="trained">Treinado</option>
    <option value="veteran">Veterano</option><option value="elite">Elite</option>
   </select></label>
   <label>Quantidade<input aria-label={'Quantidade recrutada '+label}
    type="number" min={1} max={1000} value={amount}
    onChange={e=>setAmount(Number(e.target.value))}/></label>
   <Button size="sm" disabled={army.length>=10}
    onClick={()=>act(()=>v3BarracksRecruit(army,recruitType,training,amount))}>
    Recrutar para reserva
   </Button>
  </div>
  {!summary.ready&&<p className="battle-error" role="alert">{summary.issues.join(' ')}</p>}
  {message&&<p className="battle-note" role="status">{message}</p>}
 </section>;
}

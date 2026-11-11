import {useMemo,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {loadHouseHub,houseOperation} from '@/lib/house/house.functions';
import {buildWarConvocationPlan,type WarConvocationEntry} from '@/lib/battle/got/convocation';
import type {WarAftermathPreview} from '@/lib/battle/got/aftermath';
import type {WarBattle,WarSide} from '@/lib/battle/got/types';

/** Convocação oficial (somente Narrador).
 * Único ponto do módulo de batalha que grava em fichas de Casas, e só o faz:
 *  1. com a batalha encerrada e unidades copiadas de fichas oficiais;
 *  2. depois de confirmação explícita do Narrador nesta tela;
 *  3. pela operação transacional `survivors` da própria ficha (Tabela 10-6),
 *     que valida a permissão de Narrador no servidor e registra no histórico.
 * Simulações de jogadores e tropas-modelo nunca chegam aqui.
 */
const SIDE:Record<WarSide,string>={attacker:'Atacante',defender:'Defensor'};
const TRAINING:Record<string,string>={green:'Verde',trained:'Treinada',veteran:'Veterana',
 elite:'Elite',destroyed:'Destruída'};
const CONDITION:Record<WarConvocationEntry['condition'],string>={
 unharmed:'Sem dano',damaged:'Com dano',disorganized:'Desorganizada',
 routed:'Debandada',destroyed:'Destruída',
};
type Outcome=Readonly<{status:'ok'|'error';message:string}>;
const entryKey=(e:WarConvocationEntry)=>e.houseId+'|'+e.unitId;

export function BattleGotConvocation({battle,aftermath}:{
 battle:WarBattle;aftermath:WarAftermathPreview;
}){
 const [label,setLabel]=useState(battle.name);
 const plan=useMemo(()=>{
  try{return buildWarConvocationPlan(battle,aftermath,label);}
  catch{return null;}
 },[battle,aftermath,label]);
 if(!plan)return null;
 if(plan.officialUnits===0)return <section className="got-convocation" aria-label="Convocação oficial">
  <h4>Convocação oficial</h4>
  <p>Esta batalha usou apenas tropas-modelo. Não há fichas de Casas para atualizar.
   Para uma convocação, monte os exércitos com as unidades oficiais das Casas
   antes de iniciar.</p>
 </section>;
 return <ConvocationForm plan={plan} label={label} onLabel={setLabel}/>;
}
function ConvocationForm({plan,label,onLabel}:{
 plan:NonNullable<ReturnType<typeof buildWarConvocationPlan>>;
 label:string;onLabel:(value:string)=>void;
}){
 const load=useServerFn(loadHouseHub);
 const operate=useServerFn(houseOperation);
 const [agreed,setAgreed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [done,setDone]=useState(false);
 const [outcomes,setOutcomes]=useState<Readonly<Record<string,Outcome>>>({});
 const [error,setError]=useState('');
 const entries=plan.houses.flatMap(h=>h.entries);
 const apply=async()=>{
  if(busy||!agreed)return;
  setBusy(true);setError('');
  const results:Record<string,Outcome>={};
  try{
   for(const house of plan.houses){
    let version:number,loaded:number;
    let skills:ReadonlyMap<string,unknown>;
    try{
     const hub=await load({data:{houseId:house.houseId}});
     version=hub.version;
     loaded=hub.version;
     skills=new Map(hub.state.units.map(u=>[u.id,u.skills] as const));
    }catch(e){
     for(const entry of house.entries)results[entryKey(entry)]={status:'error',
      message:e instanceof Error?e.message:'Ficha da Casa indisponível.'};
     setOutcomes({...results});
     continue;
    }
    for(const entry of house.entries){
     const unitSkills=skills.get(entry.unitId);
     if(!unitSkills){
      results[entryKey(entry)]={status:'error',message:'Unidade não existe mais na ficha.'};
      setOutcomes({...results});
      continue;
     }
     try{
      const saved=await operate({data:{houseId:entry.houseId,version,key:entry.operationKey,
       action:'survivors',explanation:entry.justification,
       args:{id:entry.evolutionId,unitId:entry.unitId,roll:entry.roll,
        condition:entry.condition,disorganizations:entry.disorganizations,
        skills:unitSkills,justification:entry.justification}}});
      version=saved.version;
      const unit=saved.state.units.find(u=>u.id===entry.unitId);
      const changed=entry.sourceVersion!==null&&entry.sourceVersion!==loaded&&
       !saved.duplicate?' (a ficha havia mudado desde o início da batalha)':'';
      results[entryKey(entry)]={status:'ok',message:saved.duplicate?
       'Já estava lançado; nada foi duplicado.':
       unit?.destroyed?'Unidade destruída na ficha.'+changed:
       'Treinamento na ficha: '+(TRAINING[unit?.training??'']??unit?.training??'?')+
        ' · Saúde '+(unit?.health??'?')+changed};
     }catch(e){
      results[entryKey(entry)]={status:'error',
       message:e instanceof Error?e.message:'A ficha recusou o lançamento.'};
     }
     setOutcomes({...results});
    }
   }
   setDone(true);
  }catch(e){
   setError(e instanceof Error?e.message:'Não foi possível concluir a convocação.');
  }finally{setBusy(false);}
 };
 const failures=Object.values(outcomes).filter(o=>o.status==='error').length;
 return <section className="got-convocation" aria-label="Convocação oficial">
  <h4>Convocação oficial · lançar resultado nas fichas</h4>
  <p>{plan.officialUnits} unidade(s) de {plan.houses.length} Casa(s) receberão o resultado
   da Tabela 10-6 (treinamento, destruição e Saúde). {plan.modelUnits>0&&
   plan.modelUnits+' tropa(s)-modelo ficam de fora. '}
   Cada lançamento entra no histórico da Casa e não se repete se você confirmar duas vezes.</p>
  <label>Nome do conflito no histórico das Casas
   <input maxLength={120} value={label} disabled={busy||done}
    onChange={e=>onLabel(e.target.value)}/>
  </label>
  <table>
   <thead><tr><th>Unidade</th><th>Lado</th><th>Fim da batalha</th><th>d6</th>
    <th>Previsão</th><th>Situação</th></tr></thead>
   <tbody>{entries.map(entry=>{
    const outcome=outcomes[entryKey(entry)];
    return <tr key={entryKey(entry)}>
     <td>{entry.unitName}</td><td>{SIDE[entry.side]}</td>
     <td>{CONDITION[entry.condition]}{entry.disorganizations>1?
      ' · '+entry.disorganizations+'× desorganizada':''}</td>
     <td>{entry.roll}</td>
     <td>{TRAINING[entry.training]} → {TRAINING[entry.projectedTraining]}</td>
     <td className={outcome?'is-'+outcome.status:''}>{outcome?outcome.message:
      busy?'Aguardando…':'Pendente'}</td>
    </tr>;
   })}</tbody>
  </table>
  <p className="battle-note">Glória proposta pela Tabela 10-5: Atacante {plan.glory.attacker} ·
   Defensor {plan.glory.defender}. A Glória e as mudanças de Terras, Riqueza, Lei e População
   continuam sendo decisão sua: lance-as na ficha da Casa quando julgar adequado.</p>
  {!done&&<label className="got-check"><input type="checkbox" checked={agreed} disabled={busy}
   onChange={e=>setAgreed(e.target.checked)}/>
   Confirmo que esta foi uma batalha oficial da campanha e que as fichas devem ser alteradas.</label>}
  {!done&&<Button onClick={()=>void apply()} disabled={!agreed||busy}>
   {busy?'Lançando nas fichas…':'Lançar baixas e treinamento nas fichas'}</Button>}
  {done&&<p role="status" className={failures?'is-error':'is-ok'}>
   {failures?failures+' lançamento(s) falharam. Corrija o motivo indicado e confirme de novo: '+
    'os que já foram gravados não se repetem.':
    'Convocação concluída. As fichas das Casas já mostram o resultado.'}</p>}
  {done&&failures>0&&<Button variant="outline" onClick={()=>{setDone(false);}}>
   Tentar novamente os pendentes</Button>}
  {error&&<p role="alert" className="got-error">{error}</p>}
 </section>;
}

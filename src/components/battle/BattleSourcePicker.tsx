import {useEffect,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import type {BattleStack,Side} from '@/lib/battle/domain/types';
import {LAND_PROFILES} from '@/lib/battle/domain/profiles-v2';
import {listBattleSourceHouses,listBattleSourceUnits,previewBattleSourceStack} from '@/lib/battle/adapters/readonly-source.functions';
type House={id:string;name:string};
type Roster={id:string;name:string;types:string[];training:string;strength:number;casualties:number;destroyed:boolean};
export function BattleSourcePicker({onAdd}:{
 onAdd:(stack:BattleStack)=>void;
}){
 const fetchHouses=useServerFn(listBattleSourceHouses);
 const fetchUnits=useServerFn(listBattleSourceUnits);
 const getSnapshot=useServerFn(previewBattleSourceStack);
 const [houses,setHouses]=useState<House[]>([]),[roster,setRoster]=useState<Roster[]>([]);
 const [house,setHouse]=useState(''),[unit,setUnit]=useState(''),[side,setSide]=useState<Side>('attacker');
 const [profile,setProfile]=useState(''),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  let live=true;
  void fetchHouses().then(list=>{if(live)setHouses(list);})
   .catch(()=>{if(live)setMessage('Não foi possível consultar casas; confirme acesso do Narrador.');});
  return()=>{live=false;};
 },[fetchHouses]);
 const selected=roster.find(r=>r.id===unit);
 const allowed=(selected?.types??[]).filter(t=>LAND_PROFILES.some(p=>p.id===t));
 const chooseHouse=async(id:string)=>{
  setHouse(id);setUnit('');setRoster([]);setProfile('');setMessage('');
  if(!id)return;
  setBusy(true);
  try{const source=await fetchUnits({data:{houseId:id}});setRoster(source.units);}
  catch(e){setMessage(e instanceof Error?e.message:'Fonte indisponível.');}
  finally{setBusy(false);}
 };
 const add=async()=>{
  if(!selected||!profile||!house)return;
  setBusy(true);setMessage('');
  try{
   const stack=await getSnapshot({data:{
    houseId:house,unitId:selected.id,side,position:{q:0,r:0},
    primaryTypeId:profile,...(reason.trim()?{profileDecisionReason:reason.trim()}:{})
   }});
   onAdd(stack);
   setMessage('Cópia temporária criada. Posicione-a no mapa; a ficha oficial permanece inalterada.');
  }catch(e){setMessage(e instanceof Error?e.message:'A cópia não foi autorizada.');}
  finally{setBusy(false);}
 };
 return <section className="battle-surface" aria-label="Unidades de casas existentes">
  <h3>Consultar unidades oficiais · somente leitura</h3>
  <p className="battle-note">O servidor consulta apenas a ficha autorizada pelo Narrador.
    Nenhuma baixa, compra, treino ou movimentação será registrada na casa de origem.</p>
  <div className="battle-form-row">
   <label>Casa de origem<select aria-label="Casa de origem militar" value={house}
     disabled={busy} onChange={e=>void chooseHouse(e.target.value)}>
    <option value="">Selecione uma casa</option>
    {houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
   </select></label>
   <label>Unidade existente<select aria-label="Unidade militar oficial" value={unit}
     disabled={busy||!house} onChange={e=>{const id=e.target.value;setUnit(id);setProfile(roster.find(u=>u.id===id)?.types.find(t=>LAND_PROFILES.some(p=>p.id===t))??'');setReason('');}}>
    <option value="">Selecione uma unidade</option>
    {roster.map(u=><option key={u.id} value={u.id} disabled={u.destroyed||u.strength-u.casualties<=0||u.types.includes('warships')}>
     {u.name} · {Math.max(0,u.strength-u.casualties)} disponíveis
    </option>)}
   </select></label>
   <label>Lado<select aria-label="Lado da cópia oficial" value={side} onChange={e=>setSide(e.target.value as Side)}>
    <option value="attacker">Atacante</option><option value="defender">Defensor</option>
   </select></label>
   <label>Perfil tático<select aria-label="Perfil tático principal" disabled={!selected||busy}
    value={profile} onChange={e=>setProfile(e.target.value)}>
    <option value="">Escolha</option>
    {allowed.map(id=><option key={id} value={id}>{LAND_PROFILES.find(p=>p.id===id)?.name}</option>)}
   </select></label>
  </div>
  {selected&&selected.types.length>1&&<label>Decisão do Narrador para tipo misto
   <textarea aria-label="Justificativa do perfil misto" maxLength={500} value={reason}
    onChange={e=>setReason(e.target.value)}/>
  </label>}
  <Button disabled={!selected||!profile||busy||(selected.types.length>1&&reason.trim().length<12)}
   onClick={()=>void add()}>Adicionar cópia somente leitura</Button>
  {message&&<p role="status">{message}</p>}
 </section>;
}

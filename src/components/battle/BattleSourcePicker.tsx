import './battle-source-regions.css';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import type {BattleStack,Side} from '@/lib/battle/domain/types';
import {LAND_PROFILES} from '@/lib/battle/domain/profiles-v2';
import {battleHouseRegions,battleRosterEligible,type BattleHouseDirectoryRow,
 type BattleRosterPreview} from '@/lib/battle/adapters/house-directory';
import {listBattleSourceHouses,listBattleSourceUnits,previewBattleSourceStack}
 from '@/lib/battle/adapters/readonly-source.functions';

const LIMIT=5;
const SUPPORTED=new Set<string>(LAND_PROFILES.map(profile=>profile.id));
const available=(unit:BattleRosterPreview)=>Math.max(0,unit.strength-unit.casualties);
const soloProfile=(unit:BattleRosterPreview)=>
 unit.types.length===1&&SUPPORTED.has(unit.types[0]!)?unit.types[0]!:null;
const canBatch=(unit:BattleRosterPreview)=>battleRosterEligible(unit)&&soloProfile(unit)!==null;

export function BattleSourcePicker({onAdd,onAddMany,remainingBySide}:{
 onAdd:(stack:BattleStack,houseName:string)=>boolean;
 onAddMany?:(stacks:BattleStack[],houseName:string)=>boolean;
 remainingBySide?:Readonly<Record<Side,number>>;
}){
 const fetchHouses=useServerFn(listBattleSourceHouses);
 const fetchUnits=useServerFn(listBattleSourceUnits);
 const getSnapshot=useServerFn(previewBattleSourceStack);
 const requestId=useRef(0);
 const [houses,setHouses]=useState<BattleHouseDirectoryRow[]>([]);
 const [region,setRegion]=useState(''),[house,setHouse]=useState('');
 const [roster,setRoster]=useState<BattleRosterPreview[]>([]);
 const [unit,setUnit]=useState(''),[side,setSide]=useState<Side>('attacker');
 const [profile,setProfile]=useState(''),[reason,setReason]=useState('');
 const [marked,setMarked]=useState<string[]>([]);
 const [sourceStatus,setSourceStatus]=useState<'pending'|'recorded'|'empty'|'no-military-sheet'>('pending');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 useEffect(()=>{
  let live=true;
  void fetchHouses().then(list=>{if(live){setHouses(list);setLoading(false);}})
   .catch(()=>{if(live){setLoading(false);
    setMessage('Não foi possível consultar as casas. Confirme a sessão do Narrador.');}});
  return()=>{live=false;requestId.current++;};
 },[fetchHouses]);
 const regions=useMemo(()=>battleHouseRegions(houses),[houses]);
 const regionalHouses=useMemo(()=>houses.filter(h=>h.region===region),[houses,region]);
 const selectedHouse=houses.find(h=>h.id===house);
 const selected=roster.find(r=>r.id===unit);
 const allowed=(selected?.types??[]).filter(t=>SUPPORTED.has(t));
 const remaining=Math.max(0,Math.min(LIMIT,remainingBySide?.[side]??LIMIT));
 const legalMarked=marked.filter(id=>roster.some(r=>r.id===id&&canBatch(r)));

 const resetSelection=()=>{
  requestId.current++;setHouse('');setUnit('');setRoster([]);setProfile('');
  setReason('');setMarked([]);setSourceStatus('pending');setMessage('');setBusy(false);
 };
 const chooseRegion=(value:string)=>{resetSelection();setRegion(value);};
 const chooseHouse=async(id:string)=>{
  resetSelection();setHouse(id);
  if(!id)return;
  const current=requestId.current;
  setBusy(true);
  try{
   const result=await fetchUnits({data:{houseId:id}});
   if(current!==requestId.current)return;
   setRoster(result.units);
   setSourceStatus(result.sourceStatus);
   const eligible=result.units.filter(canBatch);
   setMarked(eligible.slice(0,remaining).map(r=>r.id));
   const first=result.units.find(battleRosterEligible);
   if(first){
    setUnit(first.id);
    setProfile(soloProfile(first)??first.types.find(type=>SUPPORTED.has(type))??'');
   }
   if(result.sourceStatus==='no-military-sheet')
    setMessage('Casa encontrada no catálogo, mas sem ficha militar importada. Não é possível presumir tropas a partir da história.');
   else if(result.sourceStatus==='empty')
    setMessage('A ficha desta Casa existe, mas não há unidades militares cadastradas.');
   else if(!result.units.some(battleRosterEligible))
    setMessage('Esta Casa não possui unidades terrestres disponíveis para a batalha.');
   else setMessage('Unidades oficiais carregadas automaticamente. Escolha quais copiar para a batalha.');
  }catch(e){
   if(current===requestId.current)setMessage(e instanceof Error?e.message:'Unidades indisponíveis.');
  }finally{if(current===requestId.current)setBusy(false);}
 };
 const add=async()=>{
  if(!selected||!profile||!house||!selectedHouse)return;
  if(remaining===0){setMessage('Este lado já contém cinco agrupamentos.');return;}
  setBusy(true);setMessage('');
  try{
   const stack=await getSnapshot({data:{
    houseId:house,unitId:selected.id,side,position:{q:0,r:0},
    primaryTypeId:profile,...(reason.trim()?{profileDecisionReason:reason.trim()}:{})
   }});
   if(onAdd(stack,selectedHouse.name))
    setMessage('Unidade copiada para treinamento. A ficha oficial permanece inalterada.');
   else setMessage('Não foi possível adicionar: verifique o limite ou unidades duplicadas.');
  }catch(e){setMessage(e instanceof Error?e.message:'A cópia não foi autorizada.');}
  finally{setBusy(false);}
 };
 const addSelected=async()=>{
  if(!onAddMany||!selectedHouse||!house||legalMarked.length===0)return;
  if(legalMarked.length>remaining){
   setMessage('Há espaço para apenas '+remaining+' agrupamentos neste lado.');return;
  }
  setBusy(true);setMessage('');
  try{
   const stacks=await Promise.all(legalMarked.map(id=>{
    const row=roster.find(u=>u.id===id)!;
    return getSnapshot({data:{houseId:house,unitId:id,side,
     position:{q:0,r:0},primaryTypeId:soloProfile(row)!}});
   }));
   if(onAddMany(stacks,selectedHouse.name))
    setMessage(stacks.length+' unidades copiadas para o exército. Posicione-as no mapa antes da batalha.');
   else setMessage('Nenhuma unidade foi adicionada: confira duplicatas e o limite de cinco.');
  }catch(e){setMessage(e instanceof Error?e.message:'O carregamento não foi autorizado.');}
  finally{setBusy(false);}
 };
 const toggle=(id:string,checked:boolean)=>{
  setMarked(before=>{
   if(!checked)return before.filter(current=>current!==id);
   if(before.includes(id)||before.length>=LIMIT)return before;
   return [...before,id];
  });
 };
 return <section className="battle-surface battle-house-source" aria-label="Unidades de casas existentes">
  <h3>Carregar unidades por Região e Casa</h3>
  <p className="battle-note">Catálogo oficial de Cormyr. A seleção é apenas para treinamento:
   nenhuma baixa, compra, treino ou movimentação será gravada na casa de origem.</p>
  <div className="battle-form-row">
   <label>Lado da batalha<select aria-label="Lado da cópia oficial" value={side}
    disabled={busy} onChange={e=>{setSide(e.target.value as Side);setMarked([]);}}>
    <option value="attacker">Atacante</option><option value="defender">Defensor</option>
   </select></label>
   <label>Região<select aria-label="Região das casas" value={region}
    disabled={busy||loading} onChange={e=>chooseRegion(e.target.value)}>
    <option value="">Selecione a região</option>
    {regions.map(r=><option key={r.id} value={r.id}>{r.name} ({r.houseCount})</option>)}
   </select></label>
   <label>Casa<select aria-label="Casa de origem militar" value={house}
    disabled={busy||!region||loading} onChange={e=>void chooseHouse(e.target.value)}>
    <option value="">Selecione a casa</option>
    {regionalHouses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
   </select></label>
  </div>
  {loading&&<p role="status">Carregando catálogo regional de casas…</p>}
  {house&&sourceStatus==='recorded'&&<div className="battle-source-roster">
   <h4>Unidades cadastradas de {selectedHouse?.name} ({roster.length})</h4>
   <p className="battle-note">A Casa e suas tropas foram consultadas automaticamente.
    Marque até cinco unidades terrestres para copiar, ou escolha uma unidade individual.</p>
   <ul aria-label="Unidades carregadas da casa" className="battle-source-units">
    {roster.map(r=>{
     const selectable=canBatch(r),eligible=battleRosterEligible(r);
     return <li key={r.id}>
      <label>
       <input type="checkbox" aria-label={'Selecionar '+r.name} disabled={busy||!selectable}
        checked={marked.includes(r.id)} onChange={e=>toggle(r.id,e.target.checked)}/>
       <span><strong>{r.name}</strong> · {available(r)} disponíveis
        {' · '}{r.training}{r.destroyed?' · Destruída':''}
        {!eligible?' · indisponível':eligible&&!selectable?' · perfil misto: escolha individualmente':''}
       </span>
      </label>
     </li>;
    })}
   </ul>
   <p className="battle-note" role="status">{legalMarked.length} selecionadas ·
    {remaining} vagas disponíveis para o {side==='attacker'?'Atacante':'Defensor'}.</p>
   {onAddMany&&<Button variant="outline" disabled={busy||legalMarked.length===0||
    legalMarked.length>remaining} onClick={()=>void addSelected()}>
    Carregar {legalMarked.length} unidades na batalha
   </Button>}
  </div>}
  {house&&roster.length>0&&<details className="battle-source-individual">
   <summary>Adicionar unidade individual ou perfil misto</summary>
   <div className="battle-form-row">
    <label>Unidade existente<select aria-label="Unidade militar oficial" value={unit}
     disabled={busy} onChange={e=>{
      const id=e.target.value;setUnit(id);
      const row=roster.find(r=>r.id===id);
      setProfile(row?.types.find(t=>SUPPORTED.has(t))??'');setReason('');
     }}>
     <option value="">Selecione uma unidade</option>
     {roster.map(u=><option key={u.id} value={u.id}
      disabled={!battleRosterEligible(u)||!u.types.some(t=>SUPPORTED.has(t))}>
      {u.name} · {available(u)} disponíveis</option>)}
    </select></label>
    <label>Perfil tático<select aria-label="Perfil tático principal" disabled={!selected||busy}
     value={profile} onChange={e=>setProfile(e.target.value)}>
     <option value="">Escolha</option>
     {allowed.map(id=><option key={id} value={id}>
      {LAND_PROFILES.find(p=>p.id===id)?.name}</option>)}
    </select></label>
   </div>
   {selected&&selected.types.length>1&&<label>Justificativa do Narrador para unidade mista
    <textarea aria-label="Justificativa do perfil misto" maxLength={500} value={reason}
     onChange={e=>setReason(e.target.value)}/>
   </label>}
   <Button disabled={!selected||!profile||busy||remaining===0||
    !battleRosterEligible(selected)||(selected.types.length>1&&reason.trim().length<12)}
    onClick={()=>void add()}>Adicionar cópia individual</Button>
  </details>}
  {message&&<p role="status">{message}</p>}
 </section>;
}

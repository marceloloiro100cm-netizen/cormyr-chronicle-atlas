import {useEffect,useMemo,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {battleHouseRegions,battleRosterEligible,type BattleHouseDirectoryRow,
 type BattleRosterPreview} from '@/lib/battle/adapters/house-directory';
import {listBattleSourceHouses,listBattleSourceUnits,previewBattleWarUnit}
 from '@/lib/battle/adapters/readonly-source.functions';
import type {WarUnit,WarSide} from '@/lib/battle/got/types';

export type Slot='attacker-1'|'attacker-2'|'defender-1'|'defender-2';
const SLOTS:readonly {id:Slot;label:string;side:WarSide;position:{x:number;y:number}}[]=[
 {id:'attacker-1',label:'Atacante · 1',side:'attacker',position:{x:1,y:2}},
 {id:'attacker-2',label:'Atacante · 2',side:'attacker',position:{x:1,y:4}},
 {id:'defender-1',label:'Defensor · 1',side:'defender',position:{x:10,y:2}},
 {id:'defender-2',label:'Defensor · 2',side:'defender',position:{x:10,y:4}},
];
/** Busca fonte militar oficial, nunca convertendo perfis PTE em estatísticas de Guerra. */
export function BattleGotSourcePicker({onChoose,chosenSlots}:{
 onChoose:(slot:Slot,unit:WarUnit|null)=>void;
 chosenSlots:Readonly<Partial<Record<Slot,WarUnit>>>;
}){
 const fetchHouses=useServerFn(listBattleSourceHouses);
 const fetchUnits=useServerFn(listBattleSourceUnits);
 const getSnapshot=useServerFn(previewBattleWarUnit);
 const [houses,setHouses]=useState<BattleHouseDirectoryRow[]>([]);
 const [region,setRegion]=useState('');
 const [house,setHouse]=useState('');
 const [roster,setRoster]=useState<BattleRosterPreview[]>([]);
 const [unitId,setUnitId]=useState('');
 const [typeId,setTypeId]=useState('');
 const [rangeOverride,setRangeOverride]=useState<'short'|'long'>('short');
 const [slot,setSlot]=useState<Slot>('attacker-1');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const regions=useMemo(()=>battleHouseRegions(houses),[houses]);
 const houseList=useMemo(()=>houses.filter(h=>h.region===region),[houses,region]);
 const selectedUnit=roster.find(u=>u.id===unitId);
 useEffect(()=>{
  let current=true;
  setLoading(true);
  void fetchHouses().then(result=>{if(current)setHouses(result);})
   .catch(()=>{if(current)setError('Não foi possível consultar casas com permissão do Narrador.');})
   .finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[fetchHouses]);
 const selectHouse=async(id:string)=>{
  setHouse(id);setRoster([]);setUnitId('');setTypeId('');setError('');
  if(!id)return;
  setLoading(true);
  try{
   const response=await fetchUnits({data:{houseId:id}});
   if(response.sourceStatus!=='recorded'){
    setError('Esta Casa não possui ficha militar oficial completa. O modo do livro não aceita conversão dos perfis do Adaptado.');
    return;
   }
   setRoster(response.units);
   const first=response.units.find(battleRosterEligible);
   if(first){setUnitId(first.id);setTypeId(first.types[0]??'');}
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível obter a ficha militar.');}
  finally{setLoading(false);}
 };
 const importUnit=async()=>{
  if(!selectedUnit||!typeId||!house)return;
  if(!selectedUnit.types.includes(typeId)||!battleRosterEligible(selectedUnit)){
   setError('Unidade ou tipo oficial inválido.');return;
  }
  const choice=SLOTS.find(x=>x.id===slot)!;
  const duplicate=Object.entries(chosenSlots).some(([key,u])=>key!==slot&&
   u?.source.kind==='house-readonly'&&u.source.houseId===house&&u.source.unitId===selectedUnit.id);
  if(duplicate){setError('Esta unidade oficial já foi copiada para outro espaço do mesmo confronto.');return;}
  setLoading(true);setError('');
  try{
   const snapshot=await getSnapshot({data:{houseId:house,unitId:selectedUnit.id,
    typeId,side:choice.side,position:choice.position,
    ...(typeId==='special'?{rangeOverride}:{})}});
   onChoose(slot,snapshot);
  }catch(e){setError(e instanceof Error?e.message:'Cópia oficial não autorizada.');}
  finally{setLoading(false);}
 };
 return <details className="battle-surface got-official" aria-label="Copiar unidades oficiais">
  <summary>Usar unidades oficiais das Casas (somente leitura)</summary>
  <p className="battle-note">O sistema consulta a ficha militar original, preservando
   habilidades, equipamento, Armadura, Defesa, Saúde e Disciplina. Não usa conversões do
   Adaptado e não importa tropas sem ficha completa. Nenhuma baixa é aplicada à Casa.</p>
  <div className="got-config-grid">
   <label>Região
    <select value={region} disabled={loading} onChange={e=>{
     setRegion(e.target.value);setHouse('');setRoster([]);setUnitId('');setTypeId('');setError('');
    }}>
     <option value="">Selecione a região</option>
     {regions.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}
    </select>
   </label>
   <label>Casa
    <select value={house} disabled={!region||loading} onChange={e=>void selectHouse(e.target.value)}>
     <option value="">Selecione a Casa</option>
     {houseList.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}
    </select>
   </label>
   <label>Unidade militar
    <select value={unitId} disabled={!roster.length||loading} onChange={e=>{
     setUnitId(e.target.value);setTypeId(roster.find(u=>u.id===e.target.value)?.types[0]??'');
    }}>
     <option value="">Selecione</option>
     {roster.map(u=><option key={u.id} value={u.id} disabled={!battleRosterEligible(u)}>
      {u.name} · {Math.max(0,u.strength-u.casualties)} disponíveis
     </option>)}
    </select>
   </label>
   <label>Equipamento / tipo oficial
    <select value={typeId} disabled={!selectedUnit||loading}
     onChange={e=>setTypeId(e.target.value)}>
     {(selectedUnit?.types??[]).map(x=><option key={x} value={x}>{x}</option>)}
    </select>
   </label>
   {typeId==='special'&&<label>Alcance do equipamento especial
    <select value={rangeOverride} onChange={e=>setRangeOverride(e.target.value as 'short'|'long')}>
     <option value="short">Curto</option><option value="long">Longo</option>
    </select>
   </label>}
   <label>Espaço no tabuleiro
    <select value={slot} onChange={e=>setSlot(e.target.value as Slot)}>
     {SLOTS.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
    </select>
   </label>
  </div>
  <Button disabled={!selectedUnit||!typeId||loading} onClick={()=>void importUnit()}>
   Copiar para teste pelas regras do livro
  </Button>
  <div className="got-roster">
   {SLOTS.filter(s=>chosenSlots[s.id]).map(s=><div className="got-unit" key={s.id}>
    <strong>{s.label} · {chosenSlots[s.id]!.name}</strong>
    <span>{chosenSlots[s.id]!.health}/{chosenSlots[s.id]!.maxHealth} Saúde ·
     Defesa {chosenSlots[s.id]!.defense} · Disciplina {chosenSlots[s.id]!.discipline}</span>
    <Button variant="outline" onClick={()=>onChoose(s.id,null)}>Voltar à unidade-modelo</Button>
   </div>)}
  </div>
  {error&&<p role="alert" className="got-error">{error}</p>}
 </details>;
}

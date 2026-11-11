import {useEffect,useMemo,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {battleHouseRegions,battleRosterEligible,type BattleHouseDirectoryRow,
 type BattleRosterPreview} from '@/lib/battle/adapters/house-directory';
import {listBattleSourceHouses,listBattleSourceUnits,previewBattleWarUnit}
 from '@/lib/battle/adapters/readonly-source.functions';
import type {WarUnit,WarSide} from '@/lib/battle/got/types';

export type Slot=`attacker-${number}`|`defender-${number}`;
type SheetAssetPreview=Readonly<{
 sourceRow:number;domain:string;category:string;name:string;catalogId:string;
 quantity:number;status:string;militaryEffect:string|null;fortDefense:number;
 cost:Readonly<{defense:number;influence:number;lands:number;power:number;wealth:number}>;
}>;
const SLOTS:readonly {id:Slot;label:string;side:WarSide;position:{x:number;y:number}}[]=[
 {id:'attacker-1',label:'Atacante · 1',side:'attacker',position:{x:1,y:2}},
 {id:'attacker-2',label:'Atacante · 2',side:'attacker',position:{x:1,y:4}},
 {id:'defender-1',label:'Defensor · 1',side:'defender',position:{x:10,y:2}},
 {id:'defender-2',label:'Defensor · 2',side:'defender',position:{x:10,y:4}},
];
/** Copia fichas oficiais ou tropas documentadas da planilha como cenários-modelo.
 * Somente a primeira origem concede efeitos oficiais automaticamente.
 */
export function BattleGotSourcePicker({onChoose,onChooseMany,chosenSlots}:{
 onChoose:(slot:Slot,unit:WarUnit|null)=>void;
 onChooseMany?:(side:WarSide,units:WarUnit[],metadata:{houseName:string;sourceStatus:string;assets:readonly SheetAssetPreview[]})=>void;
 chosenSlots:Readonly<Partial<Record<Slot,WarUnit>>>;
}){
 const fetchHouses=useServerFn(listBattleSourceHouses);
 const fetchUnits=useServerFn(listBattleSourceUnits);
 const getSnapshot=useServerFn(previewBattleWarUnit);
 const [houses,setHouses]=useState<BattleHouseDirectoryRow[]>([]);
 const [region,setRegion]=useState('');
 const [house,setHouse]=useState('');
 const [roster,setRoster]=useState<BattleRosterPreview[]>([]);
 const [assets,setAssets]=useState<SheetAssetPreview[]>([]);
 const [sourceStatus,setSourceStatus]=useState<'recorded'|'scenario-roster'|'no-military-sheet'|'empty'|''>('');
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
  setHouse(id);setRoster([]);setAssets([]);setSourceStatus('');setUnitId('');setTypeId('');setError('');
  if(!id)return;
  setLoading(true);
  try{
   const response=await fetchUnits({data:{houseId:id}});
   setSourceStatus(response.sourceStatus);
   setAssets(response.scenarioAssets??[]);
   if(!['recorded','scenario-roster'].includes(response.sourceStatus)){
    setError('Esta Casa não possui unidades militares válidas nesta fonte. '+(response.warReadiness?.missingEvidence??[]).join(' '));
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
   setError('Unidade ou tipo militar inválido.');return;
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
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível copiar a unidade.');}
  finally{setLoading(false);}
 };
 const importEntireArmy=async()=>{
  if(!onChooseMany||!house||!roster.length)return;
  const viable=roster.filter(battleRosterEligible);
  if(viable.length>14){setError('O mapa aceita até 14 agrupamentos por lado; nenhuma tropa foi omitida automaticamente.');return;}
  if(!viable.length){setError('Esta Casa não possui tropas terrestres disponíveis.');return;}
  const side:WarSide=SLOTS.find(s=>s.id===slot)!.side;
  setLoading(true);setError('');
  try{
   const units=await Promise.all(viable.map((u,i)=>getSnapshot({data:{
    houseId:house,unitId:u.id,typeId:u.types[0]!,
    side,position:{x:side==='attacker'?1+Math.floor(i/7):10-Math.floor(i/7),y:i%7},
    ...(u.types[0]==='special'?{rangeOverride:'short' as const}:{}),
   }})));
   onChooseMany(side,units,{houseName:houseList.find(h=>h.id===house)?.name??'',
    sourceStatus,assets});
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível preparar o exército.');}
  finally{setLoading(false);}
 };
 return <details className="battle-surface got-official" aria-label="Copiar unidades oficiais">
  <summary>Importar exército de Casa nobre (simulação)</summary>
  <p className="battle-note">Fichas oficiais têm prioridade. Para Casas sem ficha operacional,
   a planilha permite simular tropas conforme tipo e treinamento documentados.
   A Saúde e as habilidades do cenário são de modelos de guerra, não dados oficiais.
   Nenhuma baixa ou compra é aplicada à Casa.</p>
  <div className="got-config-grid">
   <label>Região
    <select value={region} disabled={loading} onChange={e=>{
     setRegion(e.target.value);setHouse('');setRoster([]);setAssets([]);setSourceStatus('');setUnitId('');setTypeId('');setError('');
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
   <label>Equipamento / tipo militar
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
  <div className="got-scenario-actions">
   <Button disabled={!selectedUnit||!typeId||loading} onClick={()=>void importUnit()}>
    Copiar unidade para o mapa
   </Button>
   {onChooseMany&&<Button disabled={!roster.some(battleRosterEligible)||loading}
    onClick={()=>void importEntireArmy()}>Carregar todas as unidades no {slot.startsWith('attacker')?'atacante':'defensor'}</Button>}
  </div>
  {sourceStatus==='scenario-roster'&&<p className="battle-note" role="status">
   Exército de cenário: quantidade de agrupamentos, tipos e treinamento vêm da planilha.
   Estatísticas sem ficha completa são modelos provisórios. As propostas NÃO são compras oficiais.
  </p>}
  {assets.length>0&&<details className="got-house-assets">
   <summary>Posses, construções e efeitos · {assets.length} registros da planilha</summary>
   <p className="battle-note">Custos não são bônus. Fortificações só concedem Defesa quando
    ocupadas; demais efeitos dependem da posse ativa, especialidade e contexto.
    Propostas são informativas até serem aprovadas ou usadas em cenário explícito.</p>
   <ul>{assets.map(a=><li key={a.sourceRow}>
    <strong>{a.name}</strong> · {a.domain||'Sem domínio'} · {a.category}
    {' · '}{a.status}{a.quantity>1?' · ×'+a.quantity:''}
    {a.militaryEffect&&<span> · Regra do catálogo: {a.militaryEffect}</span>}
    {a.fortDefense>0&&<span> · Defesa potencial +{a.fortDefense} apenas na fortificação</span>}
   </li>)}</ul>
  </details>}
  <div className="got-roster">
   {Object.entries(chosenSlots).filter((entry):entry is [Slot,WarUnit]=>Boolean(entry[1]))
    .sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([key,unit])=><div className="got-unit" key={key}>
    <strong>{key.replace('attacker','Atacante').replace('defender','Defensor')} · {unit.name}</strong>
    <span>{unit.health}/{unit.maxHealth} Saúde ·
     Defesa {unit.defense} · Disciplina {unit.discipline}</span>
    {unit.source.warEffects&&<details className="got-house-effects-audit">
     <summary>Proveniência de efeitos da Casa</summary>
     <p>Posse Mestre de Armas: +{unit.source.warEffects!.masterOfArmsSurvivorBonus}
      em sobreviventes; cálculo automático confirmado pela ficha.</p>
     <p>Defesa de fortificação pendente de posição:
      +{unit.source.warEffects!.deferredFortDefense};
      armadura condicional +{unit.source.warEffects!.deferredFortArmor}.
      Esses valores não foram somados à Defesa base.</p>
     <ul>{unit.source.warEffects!.automatic.map(e=>
      <li key={e.holdingId}>{e.description}</li>)}</ul>
     <strong>Condições pendentes do Narrador</strong>
     <ul>{unit.source.warEffects!.narratorReview.map((item,i)=>
      <li key={i}>{item}</li>)}</ul>
    </details>}
    <Button variant="outline" onClick={()=>onChoose(key,null)}>Retirar esta unidade do mapa</Button>
   </div>)}
  </div>
  {error&&<p role="alert" className="got-error">{error}</p>}
 </details>;
}

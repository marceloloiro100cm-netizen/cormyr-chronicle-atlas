import {useEffect,useMemo,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {battleRosterEligible,type BattleHouseDirectoryRow} from '@/lib/battle/adapters/house-directory';
import {listBattleSourceHouses,listBattleSourceUnits,previewBattleWarUnit}
 from '@/lib/battle/adapters/readonly-source.functions';
import {modelWarLabDeployments} from '@/lib/battle/got/lab-deployment';
import type {WarSide,WarUnit} from '@/lib/battle/got/types';

type LoadedMatchup=Readonly<{units:Record<string,WarUnit>;extraPerSide:number;name:string}>;
/** Narrator-only read-only snapshots of two noble Houses. No database mutations. */
export function BattleGotHouseMatchup({width,height,onLoaded}:{
 width:number;height:number;onLoaded:(data:LoadedMatchup)=>void;
}){
 const fetchHouses=useServerFn(listBattleSourceHouses);
 const fetchUnits=useServerFn(listBattleSourceUnits);
 const snapshot=useServerFn(previewBattleWarUnit);
 const [houses,setHouses]=useState<BattleHouseDirectoryRow[]>([]);
 const [search,setSearch]=useState('');
 const [region,setRegion]=useState('');
 const [attacker,setAttacker]=useState('');
 const [defender,setDefender]=useState('');
 const [maxUnits,setMaxUnits]=useState(2);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [status,setStatus]=useState('');
 useEffect(()=>{
  let active=true;
  void fetchHouses().then(rows=>{if(active)setHouses(rows);})
   .catch(()=>{if(active)setError('Não foi possível carregar o catálogo de Casas.');});
  return()=>{active=false;};
 },[fetchHouses]);
 const regions=useMemo(()=>[...new Set(houses.map(h=>h.region))].sort(),[houses]);
 const shown=useMemo(()=>houses.filter(h=>
  (!region||h.region===region)&&h.name.toLocaleLowerCase('pt-BR')
   .includes(search.trim().toLocaleLowerCase('pt-BR'))),[houses,search,region]);
 const load=async()=>{
  if(!attacker||!defender||attacker===defender){setError('Escolha duas Casas diferentes.');return;}
  setBusy(true);setError('');setStatus('');
  try{
   const ids=[attacker,defender] as const;
   const rosters=await Promise.all(ids.map(id=>fetchUnits({data:{houseId:id}})));
   const eligible=rosters.map((response,index)=>{
    const name=houses.find(h=>h.id===ids[index])?.name??'Casa';
    if(response.sourceStatus!=='recorded')
     throw new Error(name+': precisa de ficha militar completa para usar as regras do livro.');
    const rows=response.units.filter(battleRosterEligible).filter(u=>u.types.length>0)
     .slice(0,maxUnits);
    if(!rows.length)throw new Error(name+': nenhuma tropa válida disponível para batalha.');
    return rows;
   });
   const extraPerSide=Math.max(0,Math.max(...eligible.map(rows=>rows.length))-2);
   const positions=modelWarLabDeployments(extraPerSide,width,height);
   const units:Record<string,WarUnit>={};
   for(const [index,side] of (['attacker','defender'] as const).entries()){
    const rows=eligible[index]!;
    const sidePositions=positions.filter(p=>p.side===side);
    for(let i=0;i<rows.length;i++){
     const row=rows[i]!,slot=sidePositions[i]!;
     const typeId=row.types.find(type=>type!=='special')??row.types[0]!;
     const entry=await snapshot({data:{houseId:ids[index]!,unitId:row.id,
      typeId,side,position:slot.position,
      ...(typeId==='special'?{rangeOverride:'short' as const}:{})}});
     units[slot.id]=entry;
    }
   }
   const name=(houses.find(h=>h.id===attacker)?.name??'Atacante')+
    ' vs '+(houses.find(h=>h.id===defender)?.name??'Defensor');
   onLoaded({units,extraPerSide,name});
   setStatus('Exércitos copiados para esta simulação. '+eligible[0]!.length+
    ' tropas atacantes e '+eligible[1]!.length+' defensoras; fichas originais preservadas.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível copiar as tropas.');}
  finally{setBusy(false);}
 };
 return <section className="got-house-matchup" aria-label="Confronto de Casas nobres">
  <h3>Casas nobres</h3>
  <p className="battle-note">Selecione duas Casas para simular com cópias das tropas oficiais.</p>
  <div className="got-config-grid">
   <label>Buscar Casa <input value={search} onChange={e=>setSearch(e.target.value)}
    placeholder="Nome da Casa" aria-label="Buscar Casa nobre"/></label>
   <label>Filtrar região
    <select value={region} onChange={e=>setRegion(e.target.value)}>
     <option value="">Todas as regiões</option>
     {regions.map(r=><option value={r} key={r}>{r}</option>)}
    </select>
   </label>
   <label>Casa atacante
    <select value={attacker} disabled={busy} onChange={e=>setAttacker(e.target.value)}>
     <option value="">Escolher Casa</option>
     {shown.concat(houses.filter(h=>h.id===attacker&&!shown.some(x=>x.id===h.id)))
      .map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
    </select>
   </label>
   <label>Casa defensora
    <select value={defender} disabled={busy} onChange={e=>setDefender(e.target.value)}>
     <option value="">Escolher Casa</option>
     {shown.concat(houses.filter(h=>h.id===defender&&!shown.some(x=>x.id===h.id)))
      .map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
    </select>
   </label>
   <label>Tropas por Casa
    <select value={maxUnits} disabled={busy} onChange={e=>setMaxUnits(Number(e.target.value))}>
     {[2,4,6,10,14].map(n=><option value={n} key={n}>Até {n} unidades</option>)}
    </select>
   </label>
  </div>
  <Button disabled={busy||!attacker||!defender||attacker===defender}
   onClick={()=>void load()}>{busy?'Copiando tropas...':'Carregar exércitos'}</Button>
  {status&&<p role="status" className="got-matchup-status">{status}</p>}
  {error&&<p role="alert" className="got-error">{error}</p>}
 </section>;
}

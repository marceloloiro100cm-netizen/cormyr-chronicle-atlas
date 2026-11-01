import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {MissivasTab} from './missivas-tab';
import type {Panel} from './panel-data';

export const NARRATOR_MENU=[
 ['painel','Conselho das casas'],
 ['missivas','Missivas'],
 ['calendario','Hub Temporal'],
 ['eventos','Eventos'],
 ['aventuras','Aventuras'],
] as const;
type Region='dragon-coast'|'horselands';
const REGIONS:{id:Region;name:string}[]=[
 {id:'dragon-coast',name:'Grupo 1 · Dragon Coast'},
 {id:'horselands',name:'Grupo 2 · Horselands'},
];
export function mailHouseRegion(value:string|null|undefined):Region|null {
 const key=(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]+/g,'').toLowerCase();
 if(key.includes('dragoncoast')||key.includes('costadodragao'))return 'dragon-coast';
 if(key.includes('horseland'))return 'horselands';
 return null;
}

export function NarratorMissivasHub({
 data,me,onSave,onError,onManage,filterHost,
}:{
 data:Panel;me:Panel['players'][number]|undefined;filterHost?:HTMLElement|null;
 onSave:()=>void;onError:(message:string)=>void;onManage:(houseId:string)=>void;
}){
 const [regions,setRegions]=useState<Region[]>(['dragon-coast','horselands']);
 const selectedHouses=data.houses.filter(h=>h.active&&h.season===2&&
  regions.includes(mailHouseRegion(h.region) as Region));
 const houseIds=selectedHouses.map(h=>h.id).sort();
 const key=houseIds.join('|');
 const {data:stats,isPending:isLoading,error:statsError}=useQuery({
  queryKey:['mail-overview-grouped',key],
  enabled:data.admin,
  queryFn:async()=>{
   const {data:result,error}=await supabase.rpc('mail_overview_grouped',{p_house_ids:houseIds});
   if(error)throw error;
   return result as unknown as {total:number;scheduled:number;drafts:number;delivered:number};
  },
  refetchInterval:30000,
 });
 const openRound=data.rounds
  .filter(round=>round.status==='open').sort((a,b)=>b.number-a.number)[0]?.number??null;
 const toggle=(region:Region)=>
  setRegions(old=>old.includes(region)?old.filter(r=>r!==region):[...old,region]);
 return <section className="narrator-mail-hub" aria-label="Central de missivas do Narrador">
  <header className="narrator-mail-hub-heading">
   <p className="campaign-eyebrow">NARRADOR · CORRESPONDÊNCIA</p>
   <h2>Central de missivas</h2>
   <p>Gerencie todas as casas pela mesma central. Os grupos podem ser usados separadamente ou juntos; os indicadores, a paginação e os filtros acompanham a seleção.</p>
  </header>
  <fieldset className="narrator-mail-region-picker">
   <legend>Grupos de casas</legend>
   {REGIONS.map(group=><label key={group.id}>
    <input type="checkbox" checked={regions.includes(group.id)} onChange={()=>toggle(group.id)}/>
    <span>{group.name}</span>
    <small>{data.houses.filter(h=>h.active&&h.season===2&&mailHouseRegion(h.region)===group.id).length} casas</small>
   </label>)}
   <p>{regions.length===0?'Nenhum grupo selecionado. Marque um ou ambos para consultar missivas.':regions.length===2?'Exibindo os dois grupos.':'Exibindo apenas o grupo selecionado.'}</p>
  </fieldset>
  <div className="narrator-mail-hub-overview" aria-label="Resumo de missivas filtrado">
   <div><strong>{isLoading?'…':stats?.total??0}</strong><span>Entregas dos grupos</span></div>
   <div><strong>{isLoading?'…':stats?.scheduled??0}</strong><span>Programadas</span></div>
   <div><strong>{isLoading?'…':stats?.drafts??0}</strong><span>Rascunhos</span></div>
   <div><strong>{openRound===null?'Fechada':openRound}</strong><span>Rodada atual (global)</span></div>
  </div>
  {statsError&&<p role="alert">Não foi possível atualizar os indicadores dos grupos.</p>}
  <MissivasTab data={data} me={me} groupHouseIds={houseIds} filterHost={filterHost??null} onSave={onSave} onError={onError} onManage={onManage}/>
 </section>;
}

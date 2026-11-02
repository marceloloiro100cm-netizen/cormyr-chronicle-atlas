import {useId,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {ChevronDown,Download} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {loadHouseHub,loadHouseLedger} from '@/lib/house/house.functions';
import {exportHousePdf,exportVassalArchivePdf} from '@/lib/house/export';
import {readVassalArchiveProfile} from '@/lib/house/vassal-archive';
import {supabase} from '@/integrations/supabase/client';
import {RESOURCE_KEYS} from '@/lib/house/types';
import {RESOURCE_NAMES,type CatalogItem,type HouseState,type Vassal} from '@/lib/house/types';
import {UNIT_TYPES,TRAINING} from '@/lib/house/engine';
import {vassalState} from '@/lib/house/vassals';
import {vassalHouseOverview} from '@/lib/house/vassal-preview';
import type {VassalHouse} from '@/lib/house/vassal-links';

function CompactItems({title,items,empty='Nenhum registro',max=5}:{
 title:string;items:{id:string;name:string;detail?:string}[];empty?:string;max?:number;
}){
 return <div className="rounded border p-3">
  <h5 className="font-semibold">{title} ({items.length})</h5>
  {items.length?<ul className="house-plain-list">
   {items.slice(0,max).map(item=><li key={item.id}><span>{item.name}</span>{item.detail&&<small>{item.detail}</small>}</li>)}
   {items.length>max&&<li className="house-caption">E mais {items.length-max} registros na ficha completa.</li>}
  </ul>:<p className="house-caption">{empty}</p>}
 </div>;
}

/** Official house records are loaded through the same member/admin authorization
 * as the player's full house sheet. A vassal relationship never bypasses RLS. */
export function VassalSheetPreview({parent,vassal,officialHouse,catalog}:{
 parent:HouseState;vassal:Vassal;officialHouse?:VassalHouse|undefined;catalog:CatalogItem[];
}){
 const [expanded,setExpanded]=useState(false),[downloading,setDownloading]=useState(false),[error,setError]=useState('');
 const contentId=useId();
 const load=useServerFn(loadHouseHub),loadLedger=useServerFn(loadHouseLedger);
 const embedded=Boolean(vassal.sheet);
 const officialId=!embedded&&officialHouse?.id===vassal.houseId?vassal.houseId:null;
 const linked=useQuery({
  queryKey:['vassal-house-sheet',parent.houseId,officialId],
  enabled:expanded&&officialId!==null,
  retry:false,
  queryFn:async()=>{
   if(!officialId)throw new Error('Casa oficial não identificada.');
   return await load({data:{houseId:officialId}});
  },
 });
 const archival=useQuery({
  queryKey:['vassal-public-archive',officialId],
  enabled:expanded&&officialId!==null,
  retry:false,
  queryFn:async()=>{
   if(!officialId)return null;
   // Public, reviewed catalogue data only. The suzerain's access does not
   // grant permission to another player's private mechanical house sheet.
   const result=await supabase.from('house_catalog')
    .select('id,name,region,public_reviewed,archive_data')
    .eq('id',officialId).eq('public_reviewed',true).maybeSingle();
   if(result.error)throw result.error;
   return readVassalArchiveProfile(result.data);
  },
 });
 const archive=archival.data??null;
 const house=embedded?vassalState(parent,vassal):linked.data?.state;
 const itemCatalog=embedded?catalog:linked.data?.catalog??catalog;
 const summary=house?vassalHouseOverview(house,itemCatalog):null;
 const rawName=officialHouse?.name??vassal.name;
 const name=rawName.replace(/^Casa\s+/i,'')||rawName;
 async function download(){
  if((!house&&!archive)||downloading)return;
  setDownloading(true);setError('');
  try{
   if(house){
    const ledger=officialId?await loadLedger({data:{houseId:officialId}}):[];
    await exportHousePdf(house,name,itemCatalog,ledger);
   }else if(archive){
    await exportVassalArchivePdf(archive);
   }
  }catch(e){
   setError(e instanceof Error?e.message:'Não foi possível exportar a ficha completa.');
  }finally{setDownloading(false);}
 }
 return <section className="mt-3 rounded-lg border p-3" aria-label={`Ficha resumida da Casa ${name}`}>
  <Button variant="outline" className="w-full justify-between" type="button"
   aria-controls={contentId} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
   <span>Ficha resumida · Casa {name}</span><ChevronDown size={18} className={expanded?'rotate-180':''}/>
  </Button>
  {expanded&&<div id={contentId} className="mt-3 space-y-3">
   {officialId&&(linked.isPending||archival.isPending)&&<p role="status">Consultando os dados disponíveis da casa vassala…</p>}
   {officialId&&linked.isError&&!archive&&archival.isSuccess&&<p className="house-caption">Não há ficha mecânica acessível nem registro histórico público aprovado para esta Casa.</p>}
   {archival.isError&&!house&&<p role="alert">Não foi possível consultar o catálogo histórico da Casa. Tente novamente.</p>}
   {!embedded&&!officialId&&<p className="house-caption">Não foi encontrada uma Casa vinculada a este brasão. Os dados não serão presumidos.</p>}
   {!house&&archive&&<div className="space-y-3" aria-label={`Ficha histórica da Casa ${archive.name}`}>
    <p className="house-caption">Ficha histórica disponível. Os atributos, as tropas e as posses mecânicas ainda não foram cadastrados; nenhum valor foi presumido.</p>
    <div className="grid gap-2 sm:grid-cols-2">
     {[
      ['Lorde ou Lady',archive.lordName],['Região',archive.region],
      ['Fortaleza',archive.castle],['Cidade',archive.city],
      ['Lema',archive.motto],['Fundação',archive.founding],
      ['Título',archive.title],['Brasão',archive.symbol],
     ].map(([label,value])=><div key={label} className="rounded border p-2">
      <span className="block text-xs">{label}</span><strong>{value||'Não informado'}</strong>
     </div>)}
    </div>
    {archive.description&&<p className="text-sm">{archive.description}</p>}
    <h5 className="font-semibold">Atributos e recursos</h5>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
     {RESOURCE_KEYS.map(key=><div key={key} className="rounded border p-2">
      <span className="block text-xs">{RESOURCE_NAMES[key]}</span>
      <strong>Não cadastrado</strong>
     </div>)}
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
     <CompactItems title="Unidades militares" items={[]} empty="Não cadastradas na ficha mecânica"/>
     <CompactItems title="Terras e domínios" items={[]} empty="Não cadastrados na ficha mecânica"/>
     <CompactItems title="Fortificações" items={[]} empty="Não cadastradas na ficha mecânica"/>
     <CompactItems title="Economia e posses" items={[]} empty="Não cadastradas na ficha mecânica"/>
    </div>
    <Button type="button" variant="outline" disabled={downloading} onClick={()=>void download()}>
     <Download size={16}/>{downloading?'Preparando ficha…':'Baixar ficha completa (PDF)'}
    </Button>
    <p className="house-caption">PDF no padrão das Casas jogadoras, com todos os dados disponíveis e campos mecânicos identificados como não cadastrados.</p>
   </div>}
   {summary&&house&&<>
    <p className="house-caption">{vassal.sheet?.lordName??officialHouse?.lord_name??'Titular não informado'} · {officialHouse?.region??vassal.sheet?.region??'Região não informada'}
     {officialHouse?.castle?' · '+officialHouse.castle:''}</p>
    <h5 className="font-semibold">Atributos e recursos</h5>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
     {summary.resources.map(r=><div className="rounded border p-2" key={r.key}>
      <span className="block text-xs">{RESOURCE_NAMES[r.key]}</span>
      <strong>{r.total}</strong><small className="block">{r.available} disponível</small>
     </div>)}
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
     <CompactItems title="Unidades militares"
      items={summary.units.map(u=>({id:u.id,name:u.name,detail:`${u.types.map(t=>UNIT_TYPES.find(x=>x.id===t)?.name??t).join(' / ')} · ${TRAINING[u.training as keyof typeof TRAINING]?.name??u.training} · efetivo ${Math.max(0,u.strength-u.casualties)}`}))}/>
     <CompactItems title="Terras e domínios" items={summary.domains.map(d=>({id:d.id,name:d.name,detail:itemCatalog.find(i=>i.id===d.terrain)?.name??(d.terrain||'Terreno não informado')}))}/>
     <CompactItems title="Fortificações" items={summary.fortifications.map(h=>({id:h.id,name:h.name,detail:house.domains.find(d=>d.id===h.domainId)?.name??'Domínio não informado'}))}/>
     <CompactItems title="Economia e posses" items={[...summary.economy,...summary.otherHoldings].map(h=>({id:h.id,name:h.name,detail:house.domains.find(d=>d.id===h.domainId)?.name??'Sem domínio'}))}/>
    </div>
    <div className="flex flex-wrap items-center gap-2">
     <Button type="button" variant="outline" disabled={downloading} onClick={()=>void download()}>
      <Download size={16}/>{downloading?'Preparando ficha…':'Baixar ficha completa (PDF)'}
     </Button>
     <span className="house-caption">Mesmo relatório completo das Casas de jogadores, com os registros disponíveis desta Casa.</span>
    </div>
   </>}
   {error&&<p className="house-warning" role="alert">{error}</p>}
  </div>}
 </section>;
}

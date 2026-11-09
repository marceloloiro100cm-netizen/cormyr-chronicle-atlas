import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {reviewSpyTargetDefense} from '@/lib/espionage/spy-target-defense.functions';

/** GM-only read; the server authenticates the narrator AGAIN. Nothing is
 * fetched for players, and private Law never enters the public target list.
 */
export function SpyNarratorTargetDefense({houseId}:{houseId:string}){
 const [inspected,setInspected]=useState(false);
 const load=useServerFn(reviewSpyTargetDefense);
 const q=useQuery({
  queryKey:['spy-narrator-defense',houseId],
  queryFn:()=>load({data:{targetHouseId:houseId}}),
  enabled:inspected,retry:false,staleTime:30_000,
 });
 return <div className="house-ledger">
  <Button variant="outline" type="button"
   onClick={()=>{setInspected(true);if(inspected)void q.refetch();}}>
   Narrador · consultar defesa reservada
  </Button>
  {inspected&&q.isPending&&<p role="status">Verificando ficha e Lei da Casa-alvo…</p>}
  {inspected&&q.isError&&<p role="alert">Defesa não consultável: verifique a autorização
   do Narrador, o cadastro público e a instalação da função revisada.</p>}
  {inspected&&q.data&&<div style={{marginTop:8}}>
   <p><strong>{q.data.houseName}</strong> · {q.data.source==='own_house_sheet'
    ?'Defesa derivada da ficha da Casa':'Casa sem ficha — defesa provisória de NPC'}</p>
   {q.data.source==='regional_npc_fallback'
    ?<p>Lei regional de referência: {q.data.regionalLaw}.
     Dificuldade oficial: <strong>{q.data.difficulty}</strong>.
     Nenhuma construção foi presumida.</p>
    :<p>Lei própria: {q.data.law} · bônus de construções: +{q.data.constructionBonus}.
     Dificuldade oficial do teste: <strong>{q.data.difficulty}</strong>.</p>}
   {q.data.sources.length>0&&<ul>{q.data.sources.map((s,i)=>
    <li key={i}>{s.name}: +{s.bonus} ({s.description})</li>)}</ul>}
   <small>Consulta exclusiva do Narrador. Não enviar esta defesa à Casa atacante.</small>
  </div>}
 </div>;
}

import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {REGIONS,regionId} from '@/lib/house/regions';
import {loadNarratorSpyHouseDefense} from '@/lib/espionage/spy-narrator-house-defense.functions';
import type {SpyTargetHouse} from '@/lib/espionage/spy-target-stages';

/** Render only for the Narrator; authorization is enforced AGAIN by the
 * server action and PostgreSQL RPC. Never pass the result to player UI.
 */
export function SpyNobleDefenseAdmin({houses}:{houses:readonly SpyTargetHouse[]}){
 const [targetId,setTargetId]=useState('');
 const [domainId,setDomainId]=useState('');
 const request=useServerFn(loadNarratorSpyHouseDefense);
 const query=useQuery({
  queryKey:['narrator-spy-target-defense',targetId],
  queryFn:()=>request({data:{houseId:targetId}}),
  enabled:Boolean(targetId),staleTime:30_000,retry:false,
 });
 const result=query.data;
 const label=targetId?houses.find(x=>x.id===targetId):null;
 return <details className="house-ledger" style={{marginTop:12}}>
  <summary>Conferência de dificuldade de missão · Narrador</summary>
  <p className="house-caption">As Casas com ficha operacional utilizam a Lei efetiva
   e suas construções. Para as Casas ainda sem ficha operacional, a Lei oficial
   é obtida da planilha importada. Apenas as duas Casas sem entrada na planilha
   utilizam provisoriamente Lei regional +10.</p>
  <label>Casa nobre a consultar
   <select aria-label="Consultar dificuldade privada de uma Casa"
    value={targetId} onChange={event=>{setTargetId(event.target.value);setDomainId('');}}>
    <option value="">Selecione a Casa nobre</option>
    {houses.map(h=><option key={h.id} value={h.id}>
     {h.name} · {REGIONS[regionId(h.regionId)]?.name??h.regionId}
    </option>)}
   </select>
  </label>
  {targetId&&query.isPending&&<p role="status">Calculando a defesa da Casa…</p>}
  {targetId&&query.isError&&<p role="alert">Não foi possível consultar esta Casa.
   Confirme a permissão de Narrador e a integridade da ficha.</p>}
  {result&&label&&<div className="house-ledger" style={{marginTop:10}}>
   <h4>{result.houseName} · Defesa de Espionagem</h4>
   <p><strong>{result.difficulty}</strong> de dificuldade geral
    = dificuldade-base {result.baseDifficulty} (convertida da Lei {result.law})
    + bônus de construção {result.constructionBonus}.</p>
   <p className="house-caption">Fonte: {result.source==='own_house_sheet'
    ?'Ficha operacional atual da Casa':result.source==='imported_noble_sheet'
    ?'Planilha oficial de atributos nobres'+(result.sourceSpreadsheetRow
     ?' · linha '+result.sourceSpreadsheetRow:'')
    :'Regra excepcional: Lei regional +10 (ausente das duas fontes)'}.</p>
   {result.source==='imported_noble_sheet'&&
    <p className="house-caption">As abas de compras propostas não foram
     contabilizadas como construções adquiridas.</p>}
   {result.domains.length>0&&<label>Domínio investigado
    <select aria-label="Domínio para defesa de espionagem"
     value={domainId} onChange={event=>setDomainId(event.target.value)}>
     <option value="">Defesa geral</option>
     {result.domains.map(d=><option key={d.domainId} value={d.domainId}>
      {d.name} · dificuldade {d.difficulty}
     </option>)}
    </select>
   </label>}
   {domainId&&<p><strong>{result.domains.find(d=>d.domainId===domainId)?.difficulty}</strong>
    {' '}é a dificuldade prevista no domínio selecionado, incluindo seus bônus locais.</p>}
   {result.sources.length>0&&<ul>
    {result.sources.map((s,i)=><li key={i}>{s.name}: +{s.bonus} — {s.description}</li>)}
   </ul>}
   <p className="house-caption">Consulta reservada. Não revelar a dificuldade
    da Casa-alvo ao espião adversário; a resolução cabe ao Narrador.</p>
  </div>}
 </details>;
}
